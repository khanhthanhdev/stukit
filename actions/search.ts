"use server"

import { z } from "zod"
import { authedProcedure } from "~/lib/safe-actions"
import {
  hybridSearchToolVectors,
  searchCategoryVectors,
  type ToolVectorMatch,
  type CategoryVectorMatch,
} from "~/lib/vector-store"
import { prisma } from "~/services/prisma"

type SearchMode = "keyword" | "hybrid"

const SEARCH_LIMIT = 5
const HYBRID_SCORE_THRESHOLD = 0.3

/**
 * Metadata about which search mode was used for each entity type
 */
type SearchModeMetadata = {
  tools: SearchMode
  categories: SearchMode
  collections: SearchMode // Always keyword (no Qdrant vectors)
  tags: SearchMode // Always keyword (no Qdrant vectors)
}

export const searchItems = authedProcedure
  .createServerAction()
  .input(
    z.object({
      q: z.string(),
      mode: z.enum(["keyword", "hybrid"]).optional().default("hybrid"),
    }),
  )
  .handler(async ({ input: { q, mode } }) => {
    const start = performance.now()

    // Run all entity searches in parallel based on mode
    const [toolsResult, categoriesResult, collections, tags] = await Promise.all([
      searchToolsByMode(q, mode),
      searchCategoriesByMode(q, mode),
      // Collections and tags use Prisma keyword search (no Qdrant vectors)
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

    // Build search mode metadata
    const searchModes: SearchModeMetadata = {
      tools: toolsResult.usedMode,
      categories: categoriesResult.usedMode,
      collections: "keyword", // Always keyword (no vectors)
      tags: "keyword", // Always keyword (no vectors)
    }

    console.log(
      `Admin search (${mode}): ${Math.round(performance.now() - start)}ms [tools:${searchModes.tools}, categories:${searchModes.categories}]`,
    )

    return {
      tools: toolsResult.tools,
      categories: categoriesResult.categories,
      collections,
      tags,
      matches: toolsResult.matches,
      categoryMatches: categoriesResult.matches,
      searchModes,
    }
  })

/**
 * Search tools using either keyword (Prisma) or hybrid (Qdrant) mode
 * Returns the mode that was actually used (may fall back to keyword if hybrid returns no results)
 */
const searchToolsByMode = async (
  q: string,
  mode: SearchMode,
): Promise<{
  tools: Awaited<ReturnType<typeof prisma.tool.findMany>>
  matches: ToolVectorMatch[]
  usedMode: SearchMode
}> => {
  if (mode === "keyword" || !q.trim()) {
    // Use keyword search
    const tools = await prisma.tool.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    })
    return { tools, matches: [], usedMode: "keyword" }
  }

  try {
    // Hybrid search with Qdrant
    const matches = await hybridSearchToolVectors(q, {
      limit: SEARCH_LIMIT,
      prefetchLimit: SEARCH_LIMIT * 4,
    })

    // Filter by score threshold
    const filteredMatches = matches.filter(m => m.score >= HYBRID_SCORE_THRESHOLD)

    if (!filteredMatches.length) {
      // Fallback to keyword search if no hybrid results
      const tools = await prisma.tool.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: SEARCH_LIMIT,
      })
      return { tools, matches: [], usedMode: "keyword" }
    }

    // Fetch full tool data from Prisma in order of relevance
    const toolIds = filteredMatches.map(m => m.payload.id)
    const tools = await prisma.tool.findMany({
      where: { id: { in: toolIds } },
    })

    // Preserve order from vector search
    const toolMap = new Map(tools.map(t => [t.id, t]))
    const orderedTools = toolIds.map(id => toolMap.get(id)).filter(Boolean) as typeof tools

    return { tools: orderedTools, matches: filteredMatches, usedMode: "hybrid" }
  } catch (error) {
    // Fallback to keyword search if Qdrant fails
    console.warn("Qdrant tool search failed, falling back to keyword:", error)
    const tools = await prisma.tool.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    })
    return { tools, matches: [], usedMode: "keyword" }
  }
}

/**
 * Search categories using either keyword (Prisma) or hybrid (Qdrant) mode
 * Returns the mode that was actually used (may fall back to keyword if hybrid returns no results)
 */
const searchCategoriesByMode = async (
  q: string,
  mode: SearchMode,
): Promise<{
  categories: Awaited<ReturnType<typeof prisma.category.findMany>>
  matches: CategoryVectorMatch[]
  usedMode: SearchMode
}> => {
  if (mode === "keyword" || !q.trim()) {
    // Use keyword search
    const categories = await prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    })
    return { categories, matches: [], usedMode: "keyword" }
  }

  try {
    // Hybrid search with Qdrant
    const matches = await searchCategoryVectors(q, {
      limit: SEARCH_LIMIT,
    })

    // Filter by score threshold
    const filteredMatches = matches.filter(m => m.score >= HYBRID_SCORE_THRESHOLD)

    if (!filteredMatches.length) {
      // Fallback to keyword search if no hybrid results
      const categories = await prisma.category.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: SEARCH_LIMIT,
      })
      return { categories, matches: [], usedMode: "keyword" }
    }

    // Fetch full category data from Prisma in order of relevance
    const categoryIds = filteredMatches.map(m => m.payload.id)
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    })

    // Preserve order from vector search
    const categoryMap = new Map(categories.map(c => [c.id, c]))
    const orderedCategories = categoryIds
      .map(id => categoryMap.get(id))
      .filter(Boolean) as typeof categories

    return { categories: orderedCategories, matches: filteredMatches, usedMode: "hybrid" }
  } catch (error) {
    // Fallback to keyword search if Qdrant fails
    console.warn("Qdrant category search failed, falling back to keyword:", error)
    const categories = await prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    })
    return { categories, matches: [], usedMode: "keyword" }
  }
}
