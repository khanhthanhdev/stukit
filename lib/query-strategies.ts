import { generateObject, generateText } from "ai"
import { z } from "zod"
import { createLogger } from "~/lib/logger"
import { geminiFlashLiteModel } from "~/services/gemini"

const log = createLogger("query-strategies")

/**
 * Query Expansion for "recommendation" intent
 * Expands vague user queries with relevant synonyms and technical terms
 * to improve semantic search coverage
 *
 * @deprecated Logic is now handled by fusedRouteQuery in ~/lib/fused-query-router
 *             to avoid extra LLM round-trips.
 */
export const expandQuery = async (userTask: string): Promise<string> => {
  log.debug(`Expanding query: ${userTask}`)

  try {
    const { text } = await generateText({
      model: geminiFlashLiteModel,
      temperature: 0.3, // Slight creativity for diverse keywords
      system: `You are an AI search optimizer for a developer tools directory.
Generate relevant search keywords to help find the best AI/developer tools.`,
      prompt: `Generate 5 relevant search keywords or short phrases for finding AI/developer tools matching this user task. 
Return them as a comma-separated string, nothing else.

User Task: "${userTask}"
Keywords:`,
      experimental_telemetry: { isEnabled: true },
    })

    const expanded = `${userTask}, ${text.trim()}`
    log.debug(`Expanded query: ${expanded}`)
    return expanded
  } catch (error) {
    log.error("Failed to expand query due to AI model failure", error)
    throw new Error("Unable to expand query due to AI model failure")
  }
}

/**
 * Query Decomposition schema for "comparison" intent
 */
export const ComparisonDecompositionSchema = z.object({
  toolNames: z
    .array(z.string())
    .min(2)
    .describe("The exact names of tools being compared"),
  comparisonAspects: z
    .array(z.string())
    .optional()
    .describe("Specific aspects the user wants to compare (e.g., pricing, features)"),
})

export type ComparisonDecomposition = z.infer<typeof ComparisonDecompositionSchema>

/**
 * Query Decomposition for "comparison" intent
 * Extracts the specific tool names being compared and optional comparison aspects
 *
 * @deprecated Logic is now handled by fusedRouteQuery in ~/lib/fused-query-router
 *             to avoid extra LLM round-trips.
 */
export const decomposeComparison = async (query: string): Promise<ComparisonDecomposition> => {
  log.debug(`Decomposing comparison query: ${query}`)

  try {
    const { object } = await generateObject({
      model: geminiFlashLiteModel,
      schema: ComparisonDecompositionSchema,
      temperature: 0, // Deterministic extraction
      system: `You are a query analyzer for an AI tools directory.
Extract the exact tool names being compared and any specific comparison aspects mentioned.`,
      prompt: `Identify the entity names (tools) being compared in this query: "${query}"`,
      experimental_telemetry: { isEnabled: true },
    })

    log.info(`Decomposed comparison: tools=${object.toolNames.join(", ")}`)
    return object
  } catch (error) {
    log.error("Failed to decompose comparison query due to AI model failure", error)
    throw new Error("Unable to process comparison query due to AI model failure")
  }
}

/**
 * Metadata Extraction schema for "search" intent
 */
export const SearchMetadataSchema = z.object({
  toolName: z.string().optional().describe("Specific tool name if mentioned"),
  categories: z.array(z.string()).optional().describe("Category filters to apply"),
  features: z.array(z.string()).optional().describe("Specific features requested"),
  pricing: z.string().optional().describe("Pricing preference (free, paid, freemium)"),
})

export type SearchMetadata = z.infer<typeof SearchMetadataSchema>

/**
 * Metadata Extraction for "search" intent
 * Extracts structured filters from the search query
 *
 * @deprecated Logic is now handled by fusedRouteQuery in ~/lib/fused-query-router
 *             to avoid extra LLM round-trips.
 */
export const extractSearchMetadata = async (query: string): Promise<SearchMetadata> => {
  log.debug(`Extracting search metadata: ${query}`)

  try {
    const { object } = await generateObject({
      model: geminiFlashLiteModel,
      schema: SearchMetadataSchema,
      temperature: 0,
      system: `You are a query analyzer for an AI tools directory.
Extract any specific tool names, categories, features, or pricing preferences from the query.
Only extract information that is explicitly mentioned.`,
      prompt: `Extract metadata from this search query: "${query}"`,
      experimental_telemetry: { isEnabled: true },
    })

    log.debug(`Extracted metadata: ${JSON.stringify(object)}`)
    return object
  } catch (error) {
    log.error("Failed to extract search metadata due to AI model failure", error)
    throw new Error("Unable to extract search metadata due to AI model failure")
  }
}
