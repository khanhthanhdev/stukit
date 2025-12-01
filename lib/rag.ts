import { generateText } from "ai"
import { routeQuery, type QueryIntent } from "~/lib/query-router"
import {
  decomposeComparison,
  expandQuery,
  extractSearchMetadata,
} from "~/lib/query-strategies"
import type { ToolVectorMatch } from "~/lib/vector-store"
import {
  hybridSearchToolVectors,
  searchToolsByName,
  searchToolVectors,
} from "~/lib/vector-store"
import { geminiFlashModel } from "~/services/gemini"
import { createLogger } from "~/lib/logger"

const log = createLogger("rag")

export type RetrieveToolContextOptions = {
  limit?: number
  category?: string
  /** Use legacy semantic search instead of hybrid */
  useLegacySearch?: boolean
}

/**
 * Legacy context retrieval (semantic search only)
 * @deprecated Use retrieveToolContextWithRouting for better results
 */
export const retrieveToolContext = async (
  query: string,
  { limit = 5, category }: RetrieveToolContextOptions = {},
): Promise<ToolVectorMatch[]> => {
  if (!query.trim()) {
    return []
  }

  return searchToolVectors(query, {
    limit,
    category,
  })
}

export type AdvancedRetrieveOptions = {
  limit?: number
  category?: string
}

export type RetrievalResult = {
  context: ToolVectorMatch[]
  intent: QueryIntent
  processedQuery: string
}

/**
 * Advanced context retrieval with query routing and pre-retrieval strategies
 * Routes queries to appropriate retrieval paths based on intent
 */
export const retrieveToolContextWithRouting = async (
  query: string,
  { limit = 5, category }: AdvancedRetrieveOptions = {},
): Promise<RetrievalResult> => {
  if (!query.trim()) {
    return {
      context: [],
      intent: { intent: "search", confidence: 0, reasoning: "Empty query" },
      processedQuery: query,
    }
  }

  // Step 1: Route the query to determine intent
  const intent = await routeQuery(query)
  log.info(`Query routed: ${intent.intent} (${intent.confidence})`)

  let context: ToolVectorMatch[] = []
  let processedQuery = query

  // Step 2: Apply pre-retrieval strategy based on intent
  switch (intent.intent) {
    case "recommendation": {
      // Expand query with synonyms and related terms
      processedQuery = await expandQuery(query)
      log.debug(`Expanded query: ${processedQuery}`)
      context = await hybridSearchToolVectors(processedQuery, { limit, category })
      break
    }

    case "comparison": {
      // Decompose to get specific tool names
      const decomposition = await decomposeComparison(query)
      log.debug(`Comparison tools: ${decomposition.toolNames.join(", ")}`)

      // First try exact name match
      context = await searchToolsByName(decomposition.toolNames)

      // If we didn't find all tools, fall back to hybrid search for each
      if (context.length < decomposition.toolNames.length) {
        const missingTools = decomposition.toolNames.filter(
          name => !context.some(c => c.payload.name.toLowerCase() === name.toLowerCase()),
        )

        for (const toolName of missingTools) {
          const results = await hybridSearchToolVectors(toolName, { limit: 1, category })
          context.push(...results)
        }
      }

      processedQuery = decomposition.toolNames.join(" vs ")
      break
    }

    case "search": {
      // Extract metadata for potential filtering
      const metadata = await extractSearchMetadata(query)
      log.debug(`Search metadata: ${JSON.stringify(metadata)}`)

      // If a specific tool name was mentioned, search for it directly
      if (metadata.toolName) {
        const exactMatch = await searchToolsByName([metadata.toolName])
        if (exactMatch.length > 0) {
          context = exactMatch
          break
        }
      }

      // Otherwise use hybrid search with any extracted category
      const searchCategory = metadata.categories?.[0] ?? category
      context = await hybridSearchToolVectors(query, { limit, category: searchCategory })
      break
    }
  }

  return {
    context,
    intent,
    processedQuery,
  }
}

export type RagAnswerOptions = AdvancedRetrieveOptions & {
  temperature?: number
  /** Use legacy semantic search instead of advanced routing */
  useLegacySearch?: boolean
}

export type RagAnswer = {
  answer: string
  context: ToolVectorMatch[]
  intent?: QueryIntent
}

/**
 * Legacy answer function (backward compatible)
 * @deprecated Use answerToolQuestionAdvanced for better results
 */
export const answerToolQuestion = async (
  question: string,
  options: RagAnswerOptions = {},
): Promise<RagAnswer> => {
  const context = await retrieveToolContext(question, options)

  if (!context.length) {
    return {
      answer: "I couldn't find any relevant developer tools for that question yet.",
      context: [],
    }
  }

  const formattedContext = context
    .map((match, index) => {
      const { name, slug, tagline, description, content } = match.payload
      return `#${index + 1} ${name} (slug: ${slug})\nTagline: ${tagline ?? ""}\nDescription: ${description ?? ""}\nDetails: ${content ?? ""}`
    })
    .join("\n\n---\n\n")

  const { text } = await generateText({
    model: geminiFlashModel,
    temperature: options.temperature ?? 0.2,
    system: `You are a research assistant that answers questions about developer tools.
Use the provided context snippets. Cite the tool slug inline whenever you reference it.
If the context does not contain an answer, say you don't know.`,
    prompt: `Context:\n${formattedContext}\n\nQuestion: ${question}\nAnswer:`,
    experimental_telemetry: { isEnabled: true },
  })

  return {
    answer: text,
    context,
  }
}

/**
 * Advanced RAG answer with query routing and hybrid search
 * Uses the "Route, Transform, Retrieve" architecture
 */
export const answerToolQuestionAdvanced = async (
  question: string,
  options: RagAnswerOptions = {},
): Promise<RagAnswer> => {
  // Use advanced retrieval with routing
  const { context, intent, processedQuery } = await retrieveToolContextWithRouting(
    question,
    options,
  )

  if (!context.length) {
    return {
      answer: "I couldn't find any relevant developer tools for that question yet.",
      context: [],
      intent,
    }
  }

  // Format context based on intent
  const formattedContext = context
    .map((match, index) => {
      const { name, slug, tagline, description, content, categories, tags } = match.payload
      const categoryStr = categories.length > 0 ? `Categories: ${categories.join(", ")}` : ""
      const tagStr = tags.length > 0 ? `Tags: ${tags.join(", ")}` : ""

      return `#${index + 1} ${name} (slug: ${slug})
Tagline: ${tagline ?? "N/A"}
Description: ${description ?? "N/A"}
${categoryStr}
${tagStr}
Details: ${content ?? "N/A"}`
    })
    .join("\n\n---\n\n")

  // Customize system prompt based on intent
  let systemPrompt: string
  switch (intent.intent) {
    case "comparison":
      systemPrompt = `You are a research assistant comparing developer tools.
Provide a structured comparison of the tools mentioned.
For each tool, highlight key features, pricing, and use cases.
Create a clear comparison table if appropriate.
Cite tool slugs inline when referencing them.`
      break

    case "recommendation":
      systemPrompt = `You are a research assistant recommending developer tools.
Based on the user's needs, suggest the most relevant tools from the context.
Explain why each tool is a good fit for their use case.
Prioritize tools that best match their requirements.
Cite tool slugs inline when referencing them.`
      break

    default:
      systemPrompt = `You are a research assistant that answers questions about developer tools.
Use the provided context snippets. Cite the tool slug inline whenever you reference it.
If the context does not contain an answer, say you don't know.`
  }

  const { text } = await generateText({
    model: geminiFlashModel,
    temperature: options.temperature ?? 0.2,
    system: systemPrompt,
    prompt: `Context:\n${formattedContext}\n\nQuestion: ${question}\nAnswer:`,
    experimental_telemetry: { isEnabled: true },
  })

  return {
    answer: text,
    context,
    intent,
  }
}
