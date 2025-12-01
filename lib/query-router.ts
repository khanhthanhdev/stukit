import { generateObject } from "ai"
import { z } from "zod"
import { createLogger } from "~/lib/logger"
import { geminiFlashModel } from "~/services/gemini"

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
 * Routes a user query to the appropriate retrieval strategy
 * Uses Gemini 2.5 Flash with temperature 0 for deterministic classification
 */
export const routeQuery = async (query: string): Promise<QueryIntent> => {
  log.debug(`Routing query: ${query}`)

  const { object } = await generateObject({
    model: geminiFlashModel,
    schema: QueryIntentSchema,
    temperature: 0, // Deterministic for classification
    system: `You are a query intent classifier for an AI tools directory.
Classify user queries into one of three intents:

1. **recommendation**: User wants suggestions for tools that match their needs, use case, or task.
   Examples: "What's a good tool for generating images?", "Help me find an AI writing assistant", "I need something for code review"

2. **comparison**: User wants to compare two or more specific tools.
   Examples: "Compare ChatGPT vs Claude", "What's the difference between Midjourney and DALL-E?", "GitHub Copilot or Cursor?"

3. **search**: User is looking for a specific tool by name, or has very specific criteria.
   Examples: "Tell me about Cursor", "Is there a tool called Notion AI?", "Show me tools with free tier pricing"

Be precise in your classification. If unsure, lean towards "recommendation" as the default.`,
    prompt: `Classify this query: "${query}"`,
    experimental_telemetry: { isEnabled: true },
  })

  log.info(`Query routed: intent=${object.intent}, confidence=${object.confidence}`)
  return object
}

export default routeQuery
