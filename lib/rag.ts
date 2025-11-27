import { generateText } from "ai"
import type { ToolVectorMatch } from "~/lib/vector-store"
import { searchToolVectors } from "~/lib/vector-store"
import { geminiFlashLiteModel } from "~/services/gemini"

export type RetrieveToolContextOptions = {
  limit?: number
  category?: string
}

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

export type RagAnswerOptions = RetrieveToolContextOptions & {
  temperature?: number
}

export type RagAnswer = {
  answer: string
  context: ToolVectorMatch[]
}

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
    model: geminiFlashLiteModel,
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
