import { type UIMessage, convertToModelMessages, streamText } from "ai"
import { z } from "zod"
import { retrieveToolContextWithRouting } from "~/lib/rag"
import { geminiFlashModel, geminiGoogleSearchTool } from "~/services/gemini"

export const maxDuration = 30

const chatRequestSchema = z.object({
  messages: z.array(z.any()),
  toolSlug: z.string().optional(),
})

function getMessageText(message: UIMessage): string {
  for (const part of message.parts) {
    if (part.type === "text") {
      return part.text
    }
  }
  return ""
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, toolSlug } = chatRequestSchema.parse(body) as {
      messages: UIMessage[]
      toolSlug?: string
    }

    const lastUserMessage = messages.findLast(m => m.role === "user")
    const query = lastUserMessage ? getMessageText(lastUserMessage) : ""

    const { context } = await retrieveToolContextWithRouting(query, {
      limit: 5,
    })

    const formattedContext = context.length
      ? context
          .map((match, index) => {
            const { name, slug, tagline, description, categories } = match.payload
            return `[${index + 1}] ${name} (/${slug})
Tagline: ${tagline ?? "N/A"}
Description: ${description ?? "N/A"}
Categories: ${categories.join(", ") || "N/A"}`
          })
          .join("\n\n")
      : "No specific tools found for this query."

    const systemPrompt = `You are a helpful assistant for a Work & Study tools directory website called AI Knowledge Cloud.
Your role is to help users discover, understand, and compare Work & Study tools.

Available context from our tools database:
${formattedContext}

Guidelines:
- Be concise and helpful
- When mentioning tools, reference them by name
- Use the google_search tool to find additional information when:
  - The user asks about pricing, features, or comparisons not in the context
  - The user needs up-to-date information about a tool
  - You need to verify or supplement information from the context
- Suggest related tools when appropriate
${toolSlug ? `- The user is currently viewing the tool page for: ${toolSlug}` : ""}

After your response, suggest 2-3 follow-up questions the user might want to ask, formatted as:
---SUGGESTIONS---
- Question 1
- Question 2
- Question 3`

    const result = streamText({
      model: geminiFlashModel,
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      tools: {
        google_search: geminiGoogleSearchTool,
      },
      temperature: 0.3,
      experimental_telemetry: { isEnabled: true },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
