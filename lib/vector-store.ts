import crypto from "node:crypto"
import type { Category, Tag, Tool } from "@prisma/client"
import type { Schemas } from "@qdrant/js-client-rest"
import { createLogger } from "~/lib/logger"
import { generateGeminiEmbedding } from "~/services/gemini"
import { prisma } from "~/services/prisma"
import {
  QDRANT_TOOLS_COLLECTION,
  QDRANT_TOOLS_VECTOR_SIZE,
  ensureToolsCollection,
  qdrantClient,
} from "~/services/qdrant"

const log = createLogger("vector-store")

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

  await qdrantClient.delete(QDRANT_TOOLS_COLLECTION, {
    points: [toUUID(toolId)],
  })
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
