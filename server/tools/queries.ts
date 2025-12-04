import type { Prisma } from "@prisma/client"
import type { SearchParams } from "nuqs/server"
import { getSearchConfig, type SearchConfig } from "~/config/search"
import { auth } from "~/lib/auth"
import { runWithEmbeddingCache } from "~/lib/embedding-cache"
import {
  CircuitBreaker,
  SearchOrchestrator,
  type SearchExecuteOptions,
  type SearchStrategy,
} from "~/lib/search-strategy"
import { createLogger } from "~/lib/logger"
import { SearchError, SearchErrorCode, toSearchErrorInfo } from "~/lib/search-errors"
import {
  normalizeSearchMode,
  type SearchMode,
  type SearchResult,
  type SearchResultMetadata,
} from "~/lib/search/types"
import {
  type ToolVectorMatch,
  type AlternativeVectorMatch,
  searchToolVectors,
  hybridSearchToolVectors,
  searchAlternativeVectors,
} from "~/lib/vector-store"
import { toolManyPayload, toolOnePayload } from "~/server/tools/payloads"
import { searchParamsCache } from "~/server/tools/search-params"
import { prisma } from "~/services/prisma"

const log = createLogger("tool-search")
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

type ToolEntity = Awaited<ReturnType<typeof prisma.tool.findMany>>[number]
type ToolSearchResult = SearchResult<ToolEntity, ToolVectorMatch>
type AlternativeSearchResult = SearchResult<ToolEntity, AlternativeVectorMatch>
type ParsedToolSearchParams = Awaited<ReturnType<typeof searchParamsCache.parse>>

type ToolSearchContext = {
  params: ParsedToolSearchParams
  prismaArgs: Prisma.ToolFindManyArgs
  searchConfig: SearchConfig
}

const defaultMetadata = (overrides: Partial<SearchResultMetadata> = {}): SearchResultMetadata => {
  const errors = overrides.errors?.filter(Boolean)

  return {
    mode: "keyword",
    matchType: "keyword",
    usedQdrant: false,
    hasFallback: false,
    ...overrides,
    errors: errors?.length ? errors : undefined,
  }
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

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Error) => {
  if (timeoutMs <= 0) return promise

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs)

    promise
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(error => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

const keywordSearch = async (
  context: ToolSearchContext,
  metadataOverrides: Partial<SearchResultMetadata> = {},
): Promise<ToolSearchResult> => {
  const { params, prismaArgs } = context
  const { q, category, page, sort, perPage } = params
  const { where, ...args } = prismaArgs
  const skip = (page - 1) * perPage
  const take = perPage
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

  const startedAt = Date.now()

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

  const metadata = defaultMetadata({
    ...metadataOverrides,
    mode: "keyword",
    keywordResultCount: totalCount,
    timings: {
      totalMs: Date.now() - startedAt,
      ...metadataOverrides.timings,
    },
  })

  return {
    items: tools,
    totalCount,
    matches: [],
    metadata,
  }
}

// Strategy implementations consumed by the search orchestrator (keyword + semantic modes)
class ToolKeywordSearchStrategy
  implements SearchStrategy<ToolEntity, ToolVectorMatch, ToolSearchContext>
{
  canHandle(mode: SearchMode) {
    return mode === "keyword"
  }

  async execute(
    _query: string,
    { context, metadata, mode }: SearchExecuteOptions<ToolSearchContext>,
  ): Promise<ToolSearchResult> {
    const mergedMetadata: Partial<SearchResultMetadata> = {
      requestedMode: metadata?.requestedMode ?? mode,
      ...metadata,
      mode: "keyword",
      matchType: metadata?.matchType ?? (metadata?.hasFallback ? "fallback" : "keyword"),
      usedQdrant: false,
    }

    return keywordSearch(context, mergedMetadata)
  }
}

class ToolSemanticSearchStrategy
  implements SearchStrategy<ToolEntity, ToolVectorMatch, ToolSearchContext>
{
  canHandle(mode: SearchMode) {
    return mode === "semantic"
  }

  async execute(
    query: string,
    { context, metadata, mode }: SearchExecuteOptions<ToolSearchContext>,
  ): Promise<ToolSearchResult> {
    const { params, prismaArgs, searchConfig } = context
    const { category, perPage } = params
    const requestedMode = metadata?.requestedMode ?? mode
    const startedAt = Date.now()
    const errors: SearchResultMetadata["errors"] = metadata?.errors ? [...metadata.errors] : []

    let matches: ToolVectorMatch[] = []
    let usedQdrant = false
    let vectorMs: number | undefined
    let hydrateMs: number | undefined

    try {
      const vectorStart = Date.now()
      const semanticResults = hybridSearchToolVectors(query, {
        category: category || undefined,
        limit: perPage,
        prefetchLimit: searchConfig.prefetchLimit,
      })

      matches = await withTimeout(
        semanticResults,
        searchConfig.timeoutMs,
        () =>
          new SearchError(SearchErrorCode.TIMEOUT, "Search timed out", {
            context: { query },
            retryable: false,
          }),
      )
      vectorMs = Date.now() - vectorStart
      usedQdrant = true

      if (searchConfig.scoreThreshold > 0) {
        matches = matches.filter(match => match.score >= searchConfig.scoreThreshold)
      }
    } catch (error) {
      log.error("Semantic search failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof SearchError) {
        throw error
      }

      throw new SearchError(SearchErrorCode.QDRANT_UNAVAILABLE, "Semantic search failed", {
        cause: error,
        context: { query },
        retryable: false,
      })
    }

    if (!matches.length) {
      errors.push(
        toSearchErrorInfo(new Error("No semantic results above threshold"), undefined, {
          context: { query, reason: "NO_RESULTS" },
        }),
      )
    }

    if (!matches.length) {
      return {
        items: [],
        totalCount: 0,
        matches: [],
        metadata: defaultMetadata({
          ...metadata,
          mode: "semantic",
          requestedMode,
          matchType: "semantic",
          usedQdrant,
          qdrantResultCount: 0,
          timings: { totalMs: Date.now() - startedAt, vectorMs },
        }),
      }
    }

    const ids = matches.map(match => match.payload.id)
    const categoryFilter: Prisma.ToolWhereInput | undefined = category
      ? { categories: { some: { slug: category } } }
      : undefined
    const { where, ...args } = prismaArgs

    const hydrateStartedAt = Date.now()
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
    hydrateMs = Date.now() - hydrateStartedAt

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

    const metadataResult = defaultMetadata({
      ...metadata,
      mode: "semantic",
      requestedMode,
      matchType: "semantic",
      usedQdrant,
      qdrantResultCount: matches.length,
      hasFallback: metadata?.hasFallback ?? false,
      errors: errors.length ? errors : undefined,
      timings: {
        totalMs: Date.now() - startedAt,
        vectorMs,
        hydrateMs,
      },
    })

    return {
      items: ordered.map(entry => entry.tool),
      totalCount: ordered.length,
      matches: ordered.map(entry => entry.match),
      metadata: metadataResult,
    }
  }
}

const toolCircuitBreaker = new CircuitBreaker(getSearchConfig("public").circuitBreaker)
const keywordStrategy = new ToolKeywordSearchStrategy()
const semanticStrategy = new ToolSemanticSearchStrategy()

const toolSearchOrchestrator = new SearchOrchestrator<
  ToolEntity,
  ToolVectorMatch,
  ToolSearchContext
>({
  strategies: [semanticStrategy, keywordStrategy],
  fallbackStrategy: keywordStrategy,
  circuitBreaker: toolCircuitBreaker,
  logger: log,
})

const buildToolContext = (
  params: ParsedToolSearchParams,
  prismaArgs: Prisma.ToolFindManyArgs,
): ToolSearchContext => ({
  params,
  prismaArgs,
  searchConfig: getSearchConfig("public"),
})

const runToolSearch = async (
  parsedParams: ParsedToolSearchParams,
  prismaArgs: Prisma.ToolFindManyArgs,
  requestedMode?: SearchResultMetadata["requestedMode"],
): Promise<ToolSearchResult> => {
  const searchMode = normalizeSearchMode(parsedParams.mode)
  const query = parsedParams.q?.trim() ?? ""
  const metadata: Partial<SearchResultMetadata> = {
    requestedMode:
      requestedMode ?? (parsedParams.mode as SearchResultMetadata["requestedMode"]),
  }
  const context = buildToolContext(parsedParams, prismaArgs)

  if (!query) {
    const keywordResult = await keywordStrategy.execute(query, {
      mode: "keyword",
      context,
      metadata: {
        ...metadata,
        matchType: searchMode === "keyword" ? "keyword" : "fallback",
        hasFallback: searchMode !== "keyword",
      },
    })

    return {
      ...keywordResult,
      metadata: {
        ...keywordResult.metadata,
        requestedMode: metadata.requestedMode,
        hasFallback: searchMode !== "keyword",
        matchType: searchMode === "keyword" ? "keyword" : "fallback",
        circuitBreakerState: toolCircuitBreaker.getState(),
      },
    }
  }

  return toolSearchOrchestrator.search(searchMode, query, context, metadata)
}

/**
 * Unified tool search entry point.
 * Routes keyword vs semantic modes through the search orchestrator with circuit breaker + fallback metadata.
 */
export const searchTools = async (
  searchParams: SearchParams,
  args: Prisma.ToolFindManyArgs = {},
): Promise<ToolSearchResult> =>
  runWithEmbeddingCache(() => runToolSearch(searchParamsCache.parse(searchParams), args))

/** @deprecated Use searchTools with mode="semantic" */
export const searchToolsHybrid = (
  searchParams: SearchParams,
  args: Prisma.ToolFindManyArgs = {},
): Promise<ToolSearchResult> =>
  runWithEmbeddingCache(() =>
    runToolSearch(
      { ...searchParamsCache.parse(searchParams), mode: "semantic" },
      args,
      "hybrid",
    ),
  )

/** @deprecated Use searchTools with mode="semantic" */
export const searchToolsCombined = (
  searchParams: SearchParams,
  args: Prisma.ToolFindManyArgs = {},
): Promise<ToolSearchResult> => searchTools(searchParams, args)

/** @deprecated Use searchTools with explicit mode */
export const searchToolsUnified = (
  searchParams: SearchParams,
  args: Prisma.ToolFindManyArgs = {},
): Promise<ToolSearchResult> => searchTools(searchParams, args)

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

/**
 * Unified alternative search entry point.
 * Runs semantic (Qdrant hybrid) search with circuit-breaker gating and falls back to Prisma keyword search.
 */
export const searchAlternatives = async (
  query: string,
  options: { limit?: number; offset?: number } = {},
): Promise<AlternativeSearchResult> =>
  runWithEmbeddingCache(async () => {
    const searchConfig = getSearchConfig("public")
    const { limit = searchConfig.limit, offset = 0 } = options
    const trimmedQuery = query.trim()
    const requestedMode: SearchResultMetadata["requestedMode"] = "semantic"
    const startedAt = Date.now()
    const errors: SearchResultMetadata["errors"] = []

    if (!trimmedQuery) {
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
        items: tools,
        totalCount,
        matches: [],
        metadata: defaultMetadata({
          mode: "keyword",
          requestedMode: "keyword",
          keywordResultCount: totalCount,
          circuitBreakerState: toolCircuitBreaker.getState(),
          timings: { totalMs: Date.now() - startedAt },
        }),
      }
    }

    const canAttempt = toolCircuitBreaker.canAttempt()
    let matches: AlternativeVectorMatch[] = []
    let usedQdrant = false
    let vectorMs: number | undefined

    if (canAttempt) {
      try {
        const vectorStart = Date.now()
        matches = await withTimeout(
          searchAlternativeVectors(trimmedQuery, {
            limit,
            offset,
            scoreThreshold: searchConfig.scoreThreshold,
          }),
          searchConfig.timeoutMs,
          () =>
            new SearchError(SearchErrorCode.TIMEOUT, "Search timed out", {
              context: { query: trimmedQuery },
              retryable: false,
            }),
        )
        vectorMs = Date.now() - vectorStart
        usedQdrant = true

        if (searchConfig.scoreThreshold > 0) {
          matches = matches.filter(m => m.score >= searchConfig.scoreThreshold)
        }

        toolCircuitBreaker.recordSuccess()
      } catch (error) {
        toolCircuitBreaker.recordFailure()
        errors.push(
          toSearchErrorInfo(error, SearchErrorCode.QDRANT_UNAVAILABLE, {
            context: { query: trimmedQuery },
          }),
        )
        usedQdrant = false
      }
    } else {
      errors.push(
        new SearchError(SearchErrorCode.QDRANT_UNAVAILABLE, "Circuit breaker open", {
          retryable: false,
          context: { query: trimmedQuery },
        }).toJSON(),
      )
    }

    const keywordFallback = async (): Promise<AlternativeSearchResult> => {
      const keywordStart = Date.now()
      const keywordTools = await prisma.tool.findMany({
        where: {
          publishedAt: { lte: new Date() },
          OR: [
            { name: { contains: trimmedQuery, mode: "insensitive" } },
            { description: { contains: trimmedQuery, mode: "insensitive" } },
          ],
        },
        include: toolManyPayload,
        take: limit,
        skip: offset,
        orderBy: { name: "asc" },
      })
      const keywordMs = Date.now() - keywordStart

      const keywordCount = await prisma.tool.count({
        where: {
          publishedAt: { lte: new Date() },
          OR: [
            { name: { contains: trimmedQuery, mode: "insensitive" } },
            { description: { contains: trimmedQuery, mode: "insensitive" } },
          ],
        },
      })

      return {
        items: keywordTools,
        totalCount: keywordCount,
        matches: [],
        metadata: defaultMetadata({
          mode: "keyword",
          requestedMode,
          matchType: "fallback",
          usedQdrant,
          keywordResultCount: keywordCount,
          hasFallback: true,
          errors: errors.length ? errors : undefined,
          circuitBreakerState: toolCircuitBreaker.getState(),
          timings: { totalMs: Date.now() - startedAt, keywordMs },
        }),
      }
    }

    if (!matches.length) {
      log.warn("Alternative search falling back to keyword results", {
        query: trimmedQuery,
        circuitBreaker: toolCircuitBreaker.getState(),
      })
      return keywordFallback()
    }

    const toolIds = matches.map(m => m.payload.id)
    const hydrateStart = Date.now()
    const tools = await prisma.tool.findMany({
      where: {
        id: { in: toolIds },
        publishedAt: { lte: new Date() },
      },
      include: toolManyPayload,
    })
    const hydrateMs = Date.now() - hydrateStart

    const toolMap = new Map(tools.map(t => [t.id, t]))
    const orderedTools = toolIds.map(id => toolMap.get(id)).filter(Boolean) as typeof tools

    return {
      items: orderedTools,
      totalCount: orderedTools.length,
      matches,
      metadata: defaultMetadata({
        mode: "semantic",
        requestedMode,
        matchType: "semantic",
        usedQdrant: true,
        qdrantResultCount: matches.length,
        hasFallback: false,
        errors: errors.length ? errors : undefined,
        circuitBreakerState: toolCircuitBreaker.getState(),
        timings: { totalMs: Date.now() - startedAt, vectorMs, hydrateMs },
      }),
    }
  })
