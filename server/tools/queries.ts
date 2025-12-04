import type { Prisma } from "@prisma/client"
import type { SearchParams } from "nuqs/server"
import { auth } from "~/lib/auth"
import { getSearchConfig } from "~/config/search"
import {
  type ToolVectorMatch,
  type AlternativeVectorMatch,
  searchToolVectors,
  hybridSearchToolVectors,
  searchAlternativeVectors,
} from "~/lib/vector-store"
import { toolManyPayload, toolOnePayload } from "~/server/tools/payloads"
import { type SearchMode, searchParamsCache } from "~/server/tools/search-params"
import { prisma } from "~/services/prisma"

const RRF_K = 60

type SortConfig = {
  sortBy: keyof Prisma.ToolOrderByWithRelationInput
  sortOrder: "asc" | "desc"
}

const DEFAULT_SORT: SortConfig = { sortBy: "publishedAt", sortOrder: "desc" }
const allowedSortColumns: ReadonlyArray<keyof Prisma.ToolOrderByWithRelationInput> = [
  "name",
  "publishedAt",
  "createdAt",
  "updatedAt",
]

const computeRRFScore = (keywordRank: number | null, semanticRank: number | null): number => {
  let score = 0
  if (keywordRank !== null) score += 1 / (RRF_K + keywordRank)
  if (semanticRank !== null) score += 1 / (RRF_K + semanticRank)
  return score
}

/**
 * Search result metadata indicating how results were matched
 */
export type SearchResultMetadata = {
  matchType: "keyword" | "semantic" | "hybrid" | "fallback"
  usedQdrant: boolean
  qdrantResultCount?: number
  keywordResultCount?: number
  hasFallback: boolean
}

const parseSort = (sort: string): SortConfig => {
  const [sortBy, sortOrder] = sort.split(".")
  const order = sortOrder === "asc" || sortOrder === "desc" ? sortOrder : null
  const isValidColumn = allowedSortColumns.includes(sortBy as SortConfig["sortBy"])

  if (!order || !isValidColumn) {
    return DEFAULT_SORT
  }

  return { sortBy: sortBy as SortConfig["sortBy"], sortOrder: order }
}

export const searchTools = async (
  searchParams: SearchParams,
  { where, ...args }: Prisma.ToolFindManyArgs,
) => {
  const { q, category, page, sort, perPage } = searchParamsCache.parse(searchParams)

  // Values to paginate the results
  const skip = (page - 1) * perPage
  const take = perPage

  // Column and order to sort by
  // Spliting the sort string by "." to get the column and order
  // Example: "title.desc" => ["title", "desc"]
  const { sortBy, sortOrder } = parseSort(sort)

  const whereQuery: Prisma.ToolWhereInput = {
    ...(category && { categories: { some: { slug: category } } }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    }),
  }

  const [tools, totalCount] = await prisma.$transaction([
    prisma.tool.findMany({
      ...args,
      orderBy: { [sortBy]: sortOrder },
      where: { publishedAt: { lte: new Date() }, ...whereQuery, ...where },
      include: toolManyPayload,
      take,
      skip,
    }),

    prisma.tool.count({
      where: { publishedAt: { lte: new Date() }, ...whereQuery, ...where },
    }),
  ])

  return { tools, totalCount }
}

export const searchToolsHybrid = async (
  searchParams: SearchParams,
  { where, ...args }: Prisma.ToolFindManyArgs = {},
) => {
  const { q, category, page, perPage } = searchParamsCache.parse(searchParams)
  const searchConfig = getSearchConfig("public")

  if (!q) {
    return {
      tools: [],
      totalCount: 0,
      matches: [] as ToolVectorMatch[],
      metadata: {
        matchType: "keyword",
        usedQdrant: false,
        hasFallback: false,
      } as SearchResultMetadata,
    }
  }

  const offset = (page - 1) * perPage
  let matches: ToolVectorMatch[] = []
  let usedQdrant = false
  let hasFallback = false

  try {
    // Try hybrid search first (better quality)
    matches = await hybridSearchToolVectors(q, {
      category: category || undefined,
      limit: perPage,
      prefetchLimit: searchConfig.prefetchLimit,
    })
    usedQdrant = true

    // Filter by score threshold if configured
    if (searchConfig.scoreThreshold > 0) {
      matches = matches.filter(m => m.score >= searchConfig.scoreThreshold)
    }
  } catch (error) {
    console.warn("Qdrant hybrid search failed, falling back to semantic search:", error)
    try {
      // Fallback to semantic search
      matches = await searchToolVectors(q, {
        category: category || undefined,
        limit: perPage,
        offset,
        scoreThreshold: searchConfig.scoreThreshold,
      })
      usedQdrant = true
    } catch (semanticError) {
      console.warn("Qdrant semantic search also failed:", semanticError)
      usedQdrant = false
    }
  }

  // If no Qdrant results, fallback to keyword search
  if (!matches.length) {
    hasFallback = true
    const keywordWhere: Prisma.ToolWhereInput = {
      publishedAt: { lte: new Date() },
      ...(category && { categories: { some: { slug: category } } }),
      ...where,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    }

    const keywordTools = await prisma.tool.findMany({
      ...args,
      where: keywordWhere,
      include: toolManyPayload,
      take: perPage,
      skip: offset,
    })

    const keywordCount = await prisma.tool.count({
      where: keywordWhere,
    })

    return {
      tools: keywordTools,
      totalCount: keywordCount,
      matches: [] as ToolVectorMatch[],
      metadata: {
        matchType: "fallback",
        usedQdrant: false,
        keywordResultCount: keywordCount,
        hasFallback: true,
      } as SearchResultMetadata,
    }
  }

  const ids = matches.map(match => match.payload.id)
  const categoryFilter: Prisma.ToolWhereInput | undefined = category
    ? { categories: { some: { slug: category } } }
    : undefined

  const prismaTools = await prisma.tool.findMany({
    ...args,
    where: {
      id: { in: ids },
      publishedAt: { lte: new Date() },
      ...categoryFilter,
      ...where,
    },
    include: toolManyPayload,
  })

  const toolMap = new Map(prismaTools.map(tool => [tool.id, tool]))

  const ordered = matches
    .map(match => {
      const tool = toolMap.get(match.payload.id)
      if (!tool) return null

      return { tool, match }
    })
    .filter((entry): entry is { tool: (typeof prismaTools)[number]; match: ToolVectorMatch } =>
      Boolean(entry),
    )

  return {
    tools: ordered.map(entry => entry.tool),
    totalCount: ordered.length,
    matches: ordered.map(entry => entry.match),
    metadata: {
      matchType: "hybrid",
      usedQdrant: true,
      qdrantResultCount: matches.length,
      hasFallback: false,
    } as SearchResultMetadata,
  }
}

export const findTools = async ({ where, ...args }: Prisma.ToolFindManyArgs) => {
  return prisma.tool.findMany({
    ...args,
    where: { publishedAt: { lte: new Date() }, ...where },
    include: toolManyPayload,
  })
}

export const findToolSlugs = async ({ where, orderBy, ...args }: Prisma.ToolFindManyArgs) => {
  return prisma.tool.findMany({
    ...args,
    orderBy: { name: "asc", ...orderBy },
    where: { publishedAt: { lte: new Date() }, ...where },
    select: { slug: true },
  })
}

export const countTools = async ({ where, ...args }: Prisma.ToolCountArgs) => {
  return prisma.tool.count({
    ...args,
    where: { publishedAt: { lte: new Date() }, ...where },
  })
}

export const countUpcomingTools = async ({ where, ...args }: Prisma.ToolCountArgs) => {
  return prisma.tool.count({
    ...args,
    where: { OR: [{ publishedAt: { gt: new Date() } }, { publishedAt: null }], ...where },
  })
}

export const findUniqueTool = async ({ where, ...args }: Prisma.ToolFindUniqueArgs) => {
  const session = await auth()

  return prisma.tool.findUnique({
    ...args,
    where: { publishedAt: session?.user ? undefined : { lte: new Date() }, ...where },
    include: toolOnePayload,
  })
}

export const findFirstTool = async ({ where, ...args }: Prisma.ToolFindFirstArgs) => {
  return prisma.tool.findFirst({
    ...args,
    where: { publishedAt: { lte: new Date() }, ...where },
  })
}

export const searchToolsCombined = async (
  searchParams: SearchParams,
  { where, ...args }: Prisma.ToolFindManyArgs = {},
) => {
  const { q, category, page, perPage } = searchParamsCache.parse(searchParams)
  const searchConfig = getSearchConfig("public")

  if (!q) {
    return {
      tools: [],
      totalCount: 0,
      matches: [] as ToolVectorMatch[],
      metadata: {
        matchType: "keyword",
        usedQdrant: false,
        hasFallback: false,
      } as SearchResultMetadata,
    }
  }

  const categoryFilter: Prisma.ToolWhereInput | undefined = category
    ? { categories: { some: { slug: category } } }
    : undefined

  const keywordWhere: Prisma.ToolWhereInput = {
    publishedAt: { lte: new Date() },
    ...categoryFilter,
    ...where,
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
  }

  let semanticMatches: ToolVectorMatch[] = []
  let usedQdrant = false
  let hasFallback = false

  // Try Qdrant hybrid search first, fallback to semantic, then keyword-only
  try {
    semanticMatches = await hybridSearchToolVectors(q, {
      category: category || undefined,
      limit: perPage * 2,
      prefetchLimit: searchConfig.prefetchLimit,
    })
    usedQdrant = true

    // Filter by score threshold if configured
    if (searchConfig.scoreThreshold > 0) {
      semanticMatches = semanticMatches.filter(m => m.score >= searchConfig.scoreThreshold)
    }
  } catch (error) {
    console.warn("Qdrant hybrid search failed, trying semantic search:", error)
    try {
      semanticMatches = await searchToolVectors(q, {
        category: category || undefined,
        limit: perPage * 2,
        scoreThreshold: searchConfig.scoreThreshold,
      })
      usedQdrant = true
    } catch (semanticError) {
      console.warn("Qdrant semantic search also failed, using keyword-only:", semanticError)
      usedQdrant = false
    }
  }

  // Always run keyword search in parallel (or as fallback)
  const [keywordResults] = await Promise.all([
    prisma.tool.findMany({
      ...args,
      where: keywordWhere,
      include: toolManyPayload,
      take: perPage * 2,
    }),
  ])

  // If no Qdrant results, use keyword-only
  if (!semanticMatches.length && !usedQdrant) {
    hasFallback = true
    const offset = (page - 1) * perPage
    const keywordCount = await prisma.tool.count({ where: keywordWhere })

    return {
      tools: keywordResults.slice(offset, offset + perPage),
      totalCount: keywordCount,
      matches: [] as ToolVectorMatch[],
      metadata: {
        matchType: "fallback",
        usedQdrant: false,
        keywordResultCount: keywordCount,
        hasFallback: true,
      } as SearchResultMetadata,
    }
  }

  const keywordRankMap = new Map(keywordResults.map((tool, idx) => [tool.id, idx + 1]))
  const semanticRankMap = new Map(semanticMatches.map((match, idx) => [match.payload.id, idx + 1]))

  const allIds = new Set([
    ...keywordResults.map(t => t.id),
    ...semanticMatches.map(m => m.payload.id),
  ])

  const scored = Array.from(allIds).map(id => ({
    id,
    score: computeRRFScore(keywordRankMap.get(id) ?? null, semanticRankMap.get(id) ?? null),
    keywordRank: keywordRankMap.get(id) ?? null,
    semanticRank: semanticRankMap.get(id) ?? null,
  }))

  scored.sort((a, b) => b.score - a.score)

  const offset = (page - 1) * perPage
  const paged = scored.slice(offset, offset + perPage)
  const pagedIds = paged.map(s => s.id)

  const tools = await prisma.tool.findMany({
    ...args,
    where: { id: { in: pagedIds }, publishedAt: { lte: new Date() } },
    include: toolManyPayload,
  })

  const toolMap = new Map(tools.map(t => [t.id, t]))
  const orderedTools = pagedIds.map(id => toolMap.get(id)).filter(Boolean) as typeof tools

  const matchMap = new Map(semanticMatches.map(m => [m.payload.id, m]))
  const orderedMatches = pagedIds
    .map(id => matchMap.get(id))
    .filter((m): m is ToolVectorMatch => Boolean(m))

  return {
    tools: orderedTools,
    totalCount: scored.length,
    matches: orderedMatches,
    metadata: {
      matchType: "hybrid",
      usedQdrant: usedQdrant,
      qdrantResultCount: semanticMatches.length,
      keywordResultCount: keywordResults.length,
      hasFallback: hasFallback,
    } as SearchResultMetadata,
  }
}

export const searchToolsUnified = async (
  searchParams: SearchParams,
  args: Prisma.ToolFindManyArgs = {},
) => {
  const { mode, q } = searchParamsCache.parse(searchParams)
  const searchMode = (mode || "keyword") as SearchMode

  if (!q && searchMode !== "keyword") {
    return {
      tools: [],
      totalCount: 0,
      matches: [] as ToolVectorMatch[],
      metadata: {
        matchType: "keyword",
        usedQdrant: false,
        hasFallback: false,
      } as SearchResultMetadata,
    }
  }

  try {
    switch (searchMode) {
      case "semantic":
        return await searchToolsHybrid(searchParams, args)
      case "hybrid":
        return await searchToolsCombined(searchParams, args)
      default: {
        const result = await searchTools(searchParams, args)
        return {
          ...result,
          matches: [] as ToolVectorMatch[],
          metadata: {
            matchType: "keyword",
            usedQdrant: false,
            keywordResultCount: result.totalCount,
            hasFallback: false,
          } as SearchResultMetadata,
        }
      }
    }
  } catch (error) {
    // Final fallback: if all Qdrant searches fail, use keyword search
    console.error("Search failed, falling back to keyword search:", error)
    const result = await searchTools(searchParams, args)
    return {
      ...result,
      matches: [] as ToolVectorMatch[],
      metadata: {
        matchType: "fallback",
        usedQdrant: false,
        keywordResultCount: result.totalCount,
        hasFallback: true,
      } as SearchResultMetadata,
    }
  }
}

/**
 * Search alternatives using Qdrant vector search with fallback to keyword search
 * Returns tools (alternatives) with search metadata
 */
export const searchAlternatives = async (
  query: string,
  options: { limit?: number; offset?: number } = {},
) => {
  const searchConfig = getSearchConfig("public")
  const { limit = searchConfig.limit, offset = 0 } = options

  if (!query.trim()) {
    const tools = await prisma.tool.findMany({
      where: { publishedAt: { lte: new Date() } },
      include: toolManyPayload,
      take: limit,
      skip: offset,
      orderBy: { name: "asc" },
    })

    const totalCount = await prisma.tool.count({
      where: { publishedAt: { lte: new Date() } },
    })

    return {
      tools,
      totalCount,
      matches: [] as AlternativeVectorMatch[],
      metadata: {
        matchType: "keyword" as const,
        usedQdrant: false,
        keywordResultCount: totalCount,
        hasFallback: false,
      },
    }
  }

  let matches: AlternativeVectorMatch[] = []
  let usedQdrant = false
  let hasFallback = false

  try {
    // Try Qdrant hybrid search for alternatives
    matches = await searchAlternativeVectors(query, {
      limit,
      offset,
      scoreThreshold: searchConfig.scoreThreshold,
    })
    usedQdrant = true

    // Filter by score threshold if configured
    if (searchConfig.scoreThreshold > 0) {
      matches = matches.filter(m => m.score >= searchConfig.scoreThreshold)
    }
  } catch (error) {
    console.warn("Qdrant alternative search failed, falling back to keyword search:", error)
    usedQdrant = false
  }

  // If no Qdrant results, fallback to keyword search
  if (!matches.length) {
    hasFallback = true
    const keywordTools = await prisma.tool.findMany({
      where: {
        publishedAt: { lte: new Date() },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: toolManyPayload,
      take: limit,
      skip: offset,
      orderBy: { name: "asc" },
    })

    const keywordCount = await prisma.tool.count({
      where: {
        publishedAt: { lte: new Date() },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
    })

    return {
      tools: keywordTools,
      totalCount: keywordCount,
      matches: [] as AlternativeVectorMatch[],
      metadata: {
        matchType: "fallback" as const,
        usedQdrant: false,
        keywordResultCount: keywordCount,
        hasFallback: true,
      },
    }
  }

  // Hydrate full tool data from Prisma
  const toolIds = matches.map(m => m.payload.id)
  const tools = await prisma.tool.findMany({
    where: {
      id: { in: toolIds },
      publishedAt: { lte: new Date() },
    },
    include: toolManyPayload,
  })

  // Preserve order from vector search
  const toolMap = new Map(tools.map(t => [t.id, t]))
  const orderedTools = toolIds.map(id => toolMap.get(id)).filter(Boolean) as typeof tools

  return {
    tools: orderedTools,
    totalCount: orderedTools.length,
    matches,
    metadata: {
      matchType: "hybrid" as const,
      usedQdrant: true,
      qdrantResultCount: matches.length,
      hasFallback: false,
    },
  }
}
