import { cosineSimilarity } from "ai"
import { z } from "zod"
import { createLogger } from "~/lib/logger"
import { generateGeminiEmbedding } from "~/services/gemini"
import { QDRANT_DENSE_VECTOR_SIZE } from "~/services/qdrant"

const log = createLogger("query-router")

/**
 * Query intent types for the RAG system
 * - recommendation: User wants tool suggestions based on their needs
 * - comparison: User wants to compare specific tools
 * - search: User is looking for specific tools by name or exact criteria
 */
export const QueryIntentSchema = z.object({
  intent: z
    .enum(["recommendation", "comparison", "search"])
    .describe("The classified intent of the user query"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score for the classification"),
  reasoning: z.string().describe("Brief explanation of why this intent was chosen"),
})

export type QueryIntent = z.infer<typeof QueryIntentSchema>

/**
 * Semantic router that classifies queries into intents using pure vector math.
 * No LLM is called for routing; we rely on cosine similarity against a small
 * set of intent prototypes.
 */
export const routeQuery = async (query: string): Promise<QueryIntent> => {
  log.debug(`Routing query: ${query}`)

  const normalized = query.trim()
  if (!normalized) {
    const fallback: QueryIntent = {
      intent: "search",
      confidence: 0,
      reasoning: "Empty query; defaulting to search intent.",
    }
    log.info(`Query routed (empty): intent=${fallback.intent}, confidence=${fallback.confidence}`)
    return fallback
  }

  const prototypes: Record<QueryIntent["intent"], string[]> = {
    recommendation: [
      "recommend tools for my use case",
      "suggest ai tools for this task",
      "help me find the best tool",
      "what is a good tool for this",
    ],
    comparison: [
      "compare these tools",
      "difference between two tools",
      "which is better between tools",
      "vs comparison of tools",
    ],
    search: [
      "find this specific tool",
      "search for a tool by name",
      "show me details about this tool",
      "look up information about this tool",
    ],
  }

  const queryEmbedding = await generateGeminiEmbedding(normalized, {
    taskType: "CLASSIFICATION",
    outputDimensionality: QDRANT_DENSE_VECTOR_SIZE,
  })

  const intentScores: Record<QueryIntent["intent"], number> = {
    recommendation: 0,
    comparison: 0,
    search: 0,
  }

  for (const intent of Object.keys(prototypes) as QueryIntent["intent"][]) {
    const examples = prototypes[intent]
    const exampleEmbeddings = await Promise.all(
      examples.map(example =>
        generateGeminiEmbedding(example, {
          taskType: "CLASSIFICATION",
          outputDimensionality: QDRANT_DENSE_VECTOR_SIZE,
        }),
      ),
    )

    const scores = exampleEmbeddings.map(exampleEmbedding =>
      cosineSimilarity(queryEmbedding, exampleEmbedding),
    )
    const maxScore = scores.length ? Math.max(...scores) : 0
    intentScores[intent] = maxScore
  }

  // Pick the best intent, with a simple fallback bias towards "recommendation"
  const intents = Object.keys(intentScores) as QueryIntent["intent"][]
  let bestIntent: QueryIntent["intent"] = "recommendation"
  let bestScore = -Infinity

  for (const intent of intents) {
    const score = intentScores[intent]
    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
    }
  }

  const confidence = Number.isFinite(bestScore) ? Math.max(0, Math.min(1, bestScore)) : 0

  const result: QueryIntent = {
    intent: bestIntent,
    confidence,
    reasoning: `Semantic router selected "${bestIntent}" intent based on cosine similarity of the query embedding against intent prototypes.`,
  }

  log.info(`Query routed: intent=${result.intent}, confidence=${result.confidence.toFixed(3)}`)
  return result
}

export default routeQuery
