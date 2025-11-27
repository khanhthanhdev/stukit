import type { Prisma } from "@prisma/client"
import type { SearchParams } from "nuqs/server"
import { auth } from "~/lib/auth"
import { type ToolVectorMatch, searchToolVectors } from "~/lib/vector-store"
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

  if (!q) {
    return { tools: [], totalCount: 0, matches: [] as ToolVectorMatch[] }
  }

  const offset = (page - 1) * perPage
  const matches = await searchToolVectors(q, {
    category: category || undefined,
    limit: perPage,
    offset,
  })

  if (!matches.length) {
    return { tools: [], totalCount: 0, matches: [] as ToolVectorMatch[] }
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

  if (!q) {
    return { tools: [], totalCount: 0, matches: [] as ToolVectorMatch[] }
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

  const [keywordResults, semanticMatches] = await Promise.all([
    prisma.tool.findMany({
      ...args,
      where: keywordWhere,
      include: toolManyPayload,
      take: perPage * 2,
    }),
    searchToolVectors(q, {
      category: category || undefined,
      limit: perPage * 2,
    }),
  ])

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
  }
}

export const searchToolsUnified = async (
  searchParams: SearchParams,
  args: Prisma.ToolFindManyArgs = {},
) => {
  const { mode, q } = searchParamsCache.parse(searchParams)
  const searchMode = (mode || "keyword") as SearchMode

  if (!q && searchMode !== "keyword") {
    return { tools: [], totalCount: 0, matches: [] as ToolVectorMatch[] }
  }

  switch (searchMode) {
    case "semantic":
      return searchToolsHybrid(searchParams, args)
    case "hybrid":
      return searchToolsCombined(searchParams, args)
    default: {
      const result = await searchTools(searchParams, args)
      return { ...result, matches: [] as ToolVectorMatch[] }
    }
  }
}
