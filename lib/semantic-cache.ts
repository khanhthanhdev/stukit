import crypto from "node:crypto"
import { createLogger } from "~/lib/logger"
import type { ToolVectorMatch } from "~/lib/vector-store"
import {
  QDRANT_DENSE_VECTOR_SIZE,
  QDRANT_SEMANTIC_CACHE_COLLECTION,
  ensureSemanticCacheCollection,
  qdrantClient,
} from "~/services/qdrant"
import { generateGeminiEmbedding } from "~/services/gemini"

const log = createLogger("semantic-cache")

export type SemanticCachePayload = {
  normalizedQuestion: string
  answer: string
  context: ToolVectorMatch[]
  createdAt: string
}

export type SemanticCacheEntry = {
  id: string
  score: number
  payload: SemanticCachePayload
}

const normalizeQuestion = (question: string): string =>
  question.trim().replace(/\s+/g, " ").toLowerCase()

export const findCachedAnswer = async (
  question: string,
  minScore = 0.95,
): Promise<SemanticCacheEntry | null> => {
  const normalizedQuestion = normalizeQuestion(question)
  if (!normalizedQuestion) return null

  await ensureSemanticCacheCollection()

  const vector = await generateGeminiEmbedding(normalizedQuestion, {
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: QDRANT_DENSE_VECTOR_SIZE,
  })

  const results = await qdrantClient.search(QDRANT_SEMANTIC_CACHE_COLLECTION, {
    vector,
    limit: 1,
    with_payload: true,
    score_threshold: minScore,
  })

  if (!results.length) return null

  const result = results[0]
  const payload = result.payload as SemanticCachePayload | undefined
  if (!payload?.answer) return null

  log.info(
    `Cache hit for question (score=${result.score?.toFixed(3) ?? "n/a"}): "${normalizedQuestion}"`,
  )

  return {
    id: String(result.id ?? ""),
    score: result.score ?? 0,
    payload,
  }
}

export const storeCachedAnswer = async (params: {
  question: string
  answer: string
  context: ToolVectorMatch[]
}): Promise<void> => {
  const normalizedQuestion = normalizeQuestion(params.question)
  if (!normalizedQuestion || !params.answer.trim()) return

  await ensureSemanticCacheCollection()

  const vector = await generateGeminiEmbedding(normalizedQuestion, {
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: QDRANT_DENSE_VECTOR_SIZE,
  })

  try {
    await qdrantClient.upsert(QDRANT_SEMANTIC_CACHE_COLLECTION, {
      wait: false,
      points: [
        {
          id: crypto.randomUUID(),
          vector,
          payload: {
            normalizedQuestion,
            answer: params.answer,
            context: params.context,
            createdAt: new Date().toISOString(),
          } satisfies SemanticCachePayload,
        },
      ],
    })
    log.info(`Cached answer for question: "${normalizedQuestion}"`)
  } catch (error) {
    log.error("Failed to cache answer in semantic cache", { error })
  }
}


