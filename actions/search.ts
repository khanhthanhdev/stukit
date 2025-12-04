"use server"

import { z } from "zod"
import { createServerAction } from "zsa"
import { getSearchConfig } from "~/config/search"
import { runWithEmbeddingCache } from "~/lib/embedding-cache"
import { authedProcedure } from "~/lib/safe-actions"
import { CircuitBreaker } from "~/lib/search-strategy"
import {
  hybridSearchToolVectors,
  searchCategoryVectors,
  type CategoryVectorMatch,
  type ToolVectorMatch,
} from "~/lib/vector-store"
import { prisma } from "~/services/prisma"

type SearchMode = "keyword" | "semantic"

const SEARCH_LIMIT = 5
const HYBRID_SCORE_THRESHOLD = 0.3

const adminCircuitBreaker = new CircuitBreaker(getSearchConfig("admin").circuitBreaker)
const publicCircuitBreaker = new CircuitBreaker(getSearchConfig("public").circuitBreaker)

/**
 * Metadata about which search mode was used for each entity type
 */
type SearchModeMetadata = {
  tools: SearchMode
  categories: SearchMode
  collections: SearchMode // Always keyword (no Qdrant vectors)
  tags: SearchMode // Always keyword (no Qdrant vectors)
}

type SearchResults = {
  tools: Awaited<ReturnType<typeof prisma.tool.findMany>>
  categories: Awaited<ReturnType<typeof prisma.category.findMany>>
  collections: Awaited<ReturnType<typeof prisma.collection.findMany>>
  tags: Awaited<ReturnType<typeof prisma.tag.findMany>>
  matches: ToolVectorMatch[]
  categoryMatches: CategoryVectorMatch[]
  searchModes: SearchModeMetadata
  requestedMode: SearchMode
  elapsedMs: number
}

type EntitySearchOptions = {
  circuitBreaker: CircuitBreaker
  searchLimit: number
  filterPublished?: boolean
}

const createSearchRunner = ({
  circuitBreaker,
  searchLimit,
  filterPublished = false,
}: EntitySearchOptions) => {
  const publishedFilter = () => (filterPublished ? { publishedAt: { lte: new Date() } } : {})

  const searchToolsByMode = async (
    q: string,
    mode: SearchMode,
  ): Promise<{
    tools: Awaited<ReturnType<typeof prisma.tool.findMany>>
    matches: ToolVectorMatch[]
    usedMode: SearchMode
  }> => {
    const trimmedQuery = q.trim()
    const publishedWhere = publishedFilter()

    if (mode === "keyword" || !trimmedQuery) {
      const tools = await prisma.tool.findMany({
        where: { ...publishedWhere, name: { contains: trimmedQuery, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: searchLimit,
      })
      return { tools, matches: [], usedMode: "keyword" }
    }

    if (!circuitBreaker.canAttempt()) {
      console.warn("Search skipped Qdrant due to open circuit breaker")
      const tools = await prisma.tool.findMany({
        where: { ...publishedWhere, name: { contains: trimmedQuery, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: searchLimit,
      })
      return { tools, matches: [], usedMode: "keyword" }
    }

    try {
      const matches = await hybridSearchToolVectors(trimmedQuery, {
        limit: searchLimit,
        prefetchLimit: searchLimit * 4,
      })

      const filteredMatches = matches.filter(m => m.score >= HYBRID_SCORE_THRESHOLD)

      if (!filteredMatches.length) {
        const tools = await prisma.tool.findMany({
          where: { ...publishedWhere, name: { contains: q, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: searchLimit,
        })
        return { tools, matches: [], usedMode: "keyword" }
      }

      const toolIds = filteredMatches.map(m => m.payload.id)
      const tools = await prisma.tool.findMany({
        where: { ...publishedWhere, id: { in: toolIds } },
      })

      const toolMap = new Map(tools.map(t => [t.id, t]))
      const orderedTools = toolIds.map(id => toolMap.get(id)).filter(Boolean) as typeof tools

      circuitBreaker.recordSuccess()
      return { tools: orderedTools, matches: filteredMatches, usedMode: "semantic" }
    } catch (error) {
      circuitBreaker.recordFailure()
      console.warn("Qdrant tool search failed, falling back to keyword:", error)
      const tools = await prisma.tool.findMany({
        where: { ...publishedWhere, name: { contains: trimmedQuery, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: searchLimit,
      })
      return { tools, matches: [], usedMode: "keyword" }
    }
  }

  const searchCategoriesByMode = async (
    q: string,
    mode: SearchMode,
  ): Promise<{
    categories: Awaited<ReturnType<typeof prisma.category.findMany>>
    matches: CategoryVectorMatch[]
    usedMode: SearchMode
  }> => {
    const trimmedQuery = q.trim()

    if (mode === "keyword" || !trimmedQuery) {
      const categories = await prisma.category.findMany({
        where: { name: { contains: trimmedQuery, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: searchLimit,
      })
      return { categories, matches: [], usedMode: "keyword" }
    }

    if (!circuitBreaker.canAttempt()) {
      console.warn("Search skipped Qdrant for categories due to open circuit breaker")
      const categories = await prisma.category.findMany({
        where: { name: { contains: trimmedQuery, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: searchLimit,
      })
      return { categories, matches: [], usedMode: "keyword" }
    }

    try {
      const matches = await searchCategoryVectors(trimmedQuery, {
        limit: searchLimit,
      })

      const filteredMatches = matches.filter(m => m.score >= HYBRID_SCORE_THRESHOLD)

      if (!filteredMatches.length) {
        const categories = await prisma.category.findMany({
          where: { name: { contains: q, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: searchLimit,
        })
        return { categories, matches: [], usedMode: "keyword" }
      }

      const categoryIds = filteredMatches.map(m => m.payload.id)
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      })

      const categoryMap = new Map(categories.map(c => [c.id, c]))
      const orderedCategories = categoryIds
        .map(id => categoryMap.get(id))
        .filter(Boolean) as typeof categories

      circuitBreaker.recordSuccess()
      return { categories: orderedCategories, matches: filteredMatches, usedMode: "semantic" }
    } catch (error) {
      console.warn("Qdrant category search failed, falling back to keyword:", error)
      circuitBreaker.recordFailure()
      const categories = await prisma.category.findMany({
        where: { name: { contains: trimmedQuery, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: searchLimit,
      })
      return { categories, matches: [], usedMode: "keyword" }
    }
  }

  return {
    searchToolsByMode,
    searchCategoriesByMode,
  }
}

const adminSearchRunner = createSearchRunner({
  circuitBreaker: adminCircuitBreaker,
  searchLimit: SEARCH_LIMIT,
})

const publicSearchRunner = createSearchRunner({
  circuitBreaker: publicCircuitBreaker,
  searchLimit: SEARCH_LIMIT,
  filterPublished: true,
})

const performSearch = async (
  q: string,
  mode: SearchMode,
  runner: ReturnType<typeof createSearchRunner>,
): Promise<SearchResults> => {
  const start = performance.now()

  const [toolsResult, categoriesResult, collections, tags] = await Promise.all([
    runner.searchToolsByMode(q, mode),
    runner.searchCategoriesByMode(q, mode),
    prisma.collection.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    }),
    prisma.tag.findMany({
      where: { slug: { contains: q, mode: "insensitive" } },
      orderBy: { slug: "asc" },
      take: SEARCH_LIMIT,
    }),
  ])

  const searchModes: SearchModeMetadata = {
    tools: toolsResult.usedMode,
    categories: categoriesResult.usedMode,
    collections: "keyword",
    tags: "keyword",
  }

  return {
    tools: toolsResult.tools,
    categories: categoriesResult.categories,
    collections,
    tags,
    matches: toolsResult.matches,
    categoryMatches: categoriesResult.matches,
    searchModes,
    requestedMode: mode,
    elapsedMs: Math.round(performance.now() - start),
  }
}

export const searchItems = authedProcedure
  .createServerAction()
  .input(
    z.object({
      q: z.string(),
      mode: z.enum(["keyword", "semantic"]).optional().default("semantic"),
    }),
  )
  .handler(async ({ input: { q, mode } }) =>
    runWithEmbeddingCache(async () => {
      const results = await performSearch(q, mode, adminSearchRunner)

      console.log(
        `Admin search (${mode}): ${results.elapsedMs}ms [tools:${results.searchModes.tools}, categories:${results.searchModes.categories}]`,
      )

      return results
    }),
  )

export const searchPaletteItems = createServerAction()
  .input(
    z.object({
      q: z.string(),
      mode: z.enum(["keyword", "semantic"]).optional().default("semantic"),
    }),
  )
  .handler(async ({ input: { q, mode } }) =>
    runWithEmbeddingCache(async () => performSearch(q, mode, publicSearchRunner)),
  )
