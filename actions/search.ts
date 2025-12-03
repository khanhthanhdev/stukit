"use server"

import { z } from "zod"
import { authedProcedure } from "~/lib/safe-actions"
import { hybridSearchToolVectors, type ToolVectorMatch } from "~/lib/vector-store"
import { prisma } from "~/services/prisma"

type SearchMode = "keyword" | "hybrid"

const SEARCH_LIMIT = 5
const HYBRID_SCORE_THRESHOLD = 0.3

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

    // Run tool search based on mode, with other entity searches in parallel
    const [toolsResult, categories, collections, tags] = await Promise.all([
      searchToolsByMode(q, mode),
      prisma.category.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: SEARCH_LIMIT,
      }),
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

    console.log(`Admin search (${mode}): ${Math.round(performance.now() - start)}ms`)

    return {
      tools: toolsResult.tools,
      categories,
      collections,
      tags,
      matches: toolsResult.matches,
    }
  })

/**
 * Search tools using either keyword (Prisma) or hybrid (Qdrant) mode
 */
const searchToolsByMode = async (
  q: string,
  mode: SearchMode,
): Promise<{ tools: Awaited<ReturnType<typeof prisma.tool.findMany>>; matches: ToolVectorMatch[] }> => {
  if (mode === "keyword" || !q.trim()) {
    // Fallback to keyword search
    const tools = await prisma.tool.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: SEARCH_LIMIT,
    })
    return { tools, matches: [] }
  }

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
    return { tools, matches: [] }
  }

  // Fetch full tool data from Prisma in order of relevance
  const toolIds = filteredMatches.map(m => m.payload.id)
  const tools = await prisma.tool.findMany({
    where: { id: { in: toolIds } },
  })

  // Preserve order from vector search
  const toolMap = new Map(tools.map(t => [t.id, t]))
  const orderedTools = toolIds.map(id => toolMap.get(id)).filter(Boolean) as typeof tools

  return { tools: orderedTools, matches: filteredMatches }
}
