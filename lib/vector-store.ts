import crypto from "node:crypto"
import type { Category, Tag, Tool } from "@prisma/client"
import type { Schemas } from "@qdrant/js-client-rest"
import { createLogger } from "~/lib/logger"
import { generateGeminiEmbedding } from "~/services/gemini"
import { prisma } from "~/services/prisma"
import {
  QDRANT_DENSE_VECTOR_SIZE,
  QDRANT_HYBRID_COLLECTION,
  QDRANT_TOOLS_COLLECTION,
  QDRANT_TOOLS_VECTOR_SIZE,
  ensureHybridCollection,
  ensureToolsCollection,
  qdrantClient,
} from "~/services/qdrant"

const log = createLogger("vector-store")

// ============================================================================
// BM25-based Sparse Embedding (Pure TypeScript, no native deps)
// ============================================================================

/**
 * Simple tokenizer for BM25 sparse vectors
 * Splits text into lowercase words, removes punctuation
 */
const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 1)
}

/**
 * Creates a simple hash for a token to map to a sparse vector index
 * Uses a fixed vocabulary size for consistent indexing
 */
const SPARSE_VOCAB_SIZE = 30000
const tokenToIndex = (token: string): number => {
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash) % SPARSE_VOCAB_SIZE
}

/**
 * Generates BM25-style sparse vector embedding
 * Uses term frequency with simple normalization
 */
const generateSparseEmbedding = (text: string): { indices: number[]; values: number[] } => {
  const tokens = tokenize(text)
  const termFreq = new Map<number, number>()

  // Count term frequencies
  for (const token of tokens) {
    const idx = tokenToIndex(token)
    termFreq.set(idx, (termFreq.get(idx) || 0) + 1)
  }

  // Convert to sparse format with TF normalization
  const docLength = tokens.length
  const avgDocLength = 100 // Approximate average document length
  const k1 = 1.2 // BM25 parameter
  const b = 0.75 // BM25 parameter

  const indices: number[] = []
  const values: number[] = []

  for (const [idx, tf] of termFreq) {
    // BM25-style term frequency saturation
    const normalizedTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)))
    indices.push(idx)
    values.push(normalizedTf)
  }

  return { indices, values }
}

// Convert string ID to a valid UUID for Qdrant
const toUUID = (id: string): string => {
  const hash = crypto.createHash("md5").update(id).digest("hex")
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

type ToolWithRelations = Tool & {
  categories: Pick<Category, "slug" | "name">[]
  tags: Pick<Tag, "slug">[]
}

export type ToolVectorPayload = {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  content: string | null
  websiteUrl: string
  categories: string[]
  tags: string[]
}

export type ToolVectorMatch = {
  id: string
  score: number
  payload: ToolVectorPayload
}

const serializeToolPayload = (tool: ToolWithRelations): ToolVectorPayload => ({
  id: tool.id,
  slug: tool.slug,
  name: tool.name,
  tagline: tool.tagline ?? null,
  description: tool.description ?? null,
  content: tool.content ?? null,
  websiteUrl: tool.websiteUrl,
  categories: tool.categories?.map(category => category.slug) ?? [],
  tags: tool.tags?.map(tag => tag.slug) ?? [],
})

const buildToolDocument = (tool: ToolWithRelations) =>
  [
    tool.name,
    tool.tagline,
    tool.description,
    tool.content,
    tool.tags?.map(tag => tag.slug).join(", "),
    tool.categories?.map(category => category.slug).join(", "),
  ]
    .filter(Boolean)
    .join("\n\n")

const buildFilter = (options: { category?: string }): Schemas["Filter"] | undefined => {
  const must: Schemas["Condition"][] = []

  if (options.category) {
    must.push({
      key: "categories",
      match: { any: [options.category] },
    } as Schemas["FieldCondition"])
  }

  if (!must.length) return undefined

  return { must }
}

export const upsertToolVector = async (tool: ToolWithRelations) => {
  log.debug(`Upserting vector for tool: ${tool.slug}`)
  await ensureToolsCollection()

  const document = buildToolDocument(tool)
  log.debug(`Document length: ${document.length} chars`)

  const vector = await generateGeminiEmbedding(document, {
    taskType: "RETRIEVAL_DOCUMENT",
    outputDimensionality: QDRANT_TOOLS_VECTOR_SIZE,
  })
  log.debug(`Generated embedding with ${vector.length} dimensions`)

  try {
    await qdrantClient.upsert(QDRANT_TOOLS_COLLECTION, {
      wait: true,
      points: [
        {
          id: toUUID(tool.id),
          vector, // Default (unnamed) vector
          payload: serializeToolPayload(tool),
        },
      ],
    })
    log.info(`Vector upserted for tool: ${tool.slug}`)
  } catch (error) {
    log.error(`Failed to upsert vector for tool: ${tool.slug}`, { error })
    throw error
  }
}

export const deleteToolVector = async (toolId: string) => {
  await ensureToolsCollection()

  try {
    await qdrantClient.delete(QDRANT_TOOLS_COLLECTION, {
      points: [toUUID(toolId)],
    })
  } catch (error) {
    // Gracefully handle if vector doesn't exist
    console.warn(`Vector for tool ${toolId} not found or already deleted`)
  }
}

export type SemanticSearchOptions = {
  limit?: number
  offset?: number
  category?: string
  scoreThreshold?: number
}

export const searchToolVectors = async (
  query: string,
  { limit = 10, offset = 0, category, scoreThreshold }: SemanticSearchOptions = {},
): Promise<ToolVectorMatch[]> => {
  await ensureToolsCollection()

  const vector = await generateGeminiEmbedding(query, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: QDRANT_TOOLS_VECTOR_SIZE,
  })

  const filter = buildFilter({ category })
  const results = await qdrantClient.search(QDRANT_TOOLS_COLLECTION, {
    vector,
    filter,
    limit,
    offset,
    with_payload: true,
    score_threshold: scoreThreshold,
  })

  return results
    .map(result => {
      const payload = result.payload as ToolVectorPayload | undefined
      if (!payload) return null

      return {
        id: payload.id ?? String(result.id ?? ""),
        score: result.score ?? 0,
        payload,
      }
    })
    .filter((match): match is ToolVectorMatch => Boolean(match?.payload?.slug))
}

export type ReindexProgress = {
  total: number
  processed: number
  failed: string[]
}

export const reindexAllTools = async (
  onProgress?: (progress: ReindexProgress) => void,
): Promise<ReindexProgress> => {
  await ensureToolsCollection()

  const tools = await prisma.tool.findMany({
    where: { publishedAt: { lte: new Date() } },
    include: {
      categories: { select: { slug: true, name: true } },
      tags: { select: { slug: true } },
    },
  })

  const progress: ReindexProgress = {
    total: tools.length,
    processed: 0,
    failed: [],
  }

  const BATCH_SIZE = 10

  for (let i = 0; i < tools.length; i += BATCH_SIZE) {
    const batch = tools.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async tool => {
        try {
          await upsertToolVector(tool)
          progress.processed++
        } catch (error) {
          progress.failed.push(tool.slug)
          console.error(`Failed to index tool ${tool.slug}:`, error)
        }
      }),
    )

    onProgress?.(progress)
  }

  return progress
}

export const clearToolsCollection = async () => {
  const exists = await qdrantClient.collectionExists(QDRANT_TOOLS_COLLECTION)
  if (exists) {
    await qdrantClient.deleteCollection(QDRANT_TOOLS_COLLECTION)
  }
}

// ============================================================================
// Hybrid Search Implementation (Dense + Sparse with RRF Fusion)
// ============================================================================

/**
 * Upserts a tool with both dense and sparse vectors to the hybrid collection
 */
export const upsertHybridToolVector = async (tool: ToolWithRelations) => {
  log.debug(`Upserting hybrid vector for tool: ${tool.slug}`)
  await ensureHybridCollection()

  const document = buildToolDocument(tool)
  log.debug(`Document length: ${document.length} chars`)

  // Generate dense vector (async) and sparse vector (sync)
  const sparseVector = generateSparseEmbedding(document)
  const denseVector = await generateGeminiEmbedding(document, {
    taskType: "RETRIEVAL_DOCUMENT",
    outputDimensionality: QDRANT_DENSE_VECTOR_SIZE,
  })

  log.debug(
    `Generated dense: ${denseVector.length} dims, sparse: ${sparseVector.indices.length} non-zero`,
  )

  try {
    await qdrantClient.upsert(QDRANT_HYBRID_COLLECTION, {
      wait: true,
      points: [
        {
          id: toUUID(tool.id),
          vector: {
            dense: denseVector,
            sparse: {
              indices: sparseVector.indices,
              values: sparseVector.values,
            },
          },
          payload: serializeToolPayload(tool),
        },
      ],
    })
    log.info(`Hybrid vector upserted for tool: ${tool.slug}`)
  } catch (error) {
    log.error(`Failed to upsert hybrid vector for tool: ${tool.slug}`, { error })
    throw error
  }
}

/**
 * Deletes a tool from the hybrid collection
 */
export const deleteHybridToolVector = async (toolId: string) => {
  await ensureHybridCollection()

  await qdrantClient.delete(QDRANT_HYBRID_COLLECTION, {
    points: [toUUID(toolId)],
  })
}

export type HybridSearchOptions = {
  limit?: number
  category?: string
  prefetchLimit?: number
}

/**
 * Performs hybrid search using Qdrant's prefetch + RRF fusion API
 * Combines semantic (dense) and keyword (sparse) search for best results
 */
export const hybridSearchToolVectors = async (
  query: string,
  { limit = 5, category, prefetchLimit = 20 }: HybridSearchOptions = {},
): Promise<ToolVectorMatch[]> => {
  await ensureHybridCollection()

  // Generate dense query vector (async) and sparse query vector (sync)
  const sparseQuery = generateSparseEmbedding(query)
  const denseQuery = await generateGeminiEmbedding(query, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: QDRANT_DENSE_VECTOR_SIZE,
  })

  const filter = buildFilter({ category })

  // Execute hybrid search with RRF fusion
  const results = await qdrantClient.query(QDRANT_HYBRID_COLLECTION, {
    prefetch: [
      {
        query: denseQuery,
        using: "dense",
        limit: prefetchLimit,
        filter,
      },
      {
        query: {
          indices: sparseQuery.indices,
          values: sparseQuery.values,
        },
        using: "sparse",
        limit: prefetchLimit,
        filter,
      },
    ],
    query: {
      fusion: "rrf", // Reciprocal Rank Fusion
    },
    limit,
    with_payload: true,
  })

  return results.points
    .map(result => {
      const payload = result.payload as ToolVectorPayload | undefined
      if (!payload) return null

      return {
        id: payload.id ?? String(result.id ?? ""),
        score: result.score ?? 0,
        payload,
      }
    })
    .filter((match): match is ToolVectorMatch => Boolean(match?.payload?.slug))
}

/**
 * Searches for tools by name using hybrid search
 * Useful for comparison queries where we need specific tools
 */
export const searchToolsByName = async (toolNames: string[]): Promise<ToolVectorMatch[]> => {
  if (toolNames.length === 0) return []

  const results: ToolVectorMatch[] = []

  // Search for each tool name in parallel using hybrid search
  const searchResults = await Promise.all(
    toolNames.map(toolName => hybridSearchToolVectors(toolName, { limit: 1 })),
  )

  for (const matches of searchResults) {
    if (matches.length > 0) {
      results.push(matches[0])
    }
  }

  return results
}

/**
 * Reindexes all tools to the hybrid collection
 */
export const reindexAllHybridTools = async (
  onProgress?: (progress: ReindexProgress) => void,
): Promise<ReindexProgress> => {
  await ensureHybridCollection()

  const tools = await prisma.tool.findMany({
    where: { publishedAt: { lte: new Date() } },
    include: {
      categories: { select: { slug: true, name: true } },
      tags: { select: { slug: true } },
    },
  })

  const progress: ReindexProgress = {
    total: tools.length,
    processed: 0,
    failed: [],
  }

  const BATCH_SIZE = 5 // Smaller batch due to dual embedding generation

  for (let i = 0; i < tools.length; i += BATCH_SIZE) {
    const batch = tools.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async tool => {
        try {
          await upsertHybridToolVector(tool)
          progress.processed++
        } catch (error) {
          progress.failed.push(tool.slug)
          log.error(`Failed to index hybrid tool ${tool.slug}:`, { error })
        }
      }),
    )

    onProgress?.(progress)
  }

  return progress
}

/**
 * Clears the hybrid tools collection
 */
export const clearHybridCollection = async () => {
  const exists = await qdrantClient.collectionExists(QDRANT_HYBRID_COLLECTION)
  if (exists) {
    await qdrantClient.deleteCollection(QDRANT_HYBRID_COLLECTION)
  }
}
