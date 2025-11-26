import { NextResponse } from "next/server"
import { z } from "zod"
import { answerToolQuestion, retrieveToolContext } from "~/lib/rag"

const ragQuerySchema = z.object({
  question: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
  category: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
})

const contextQuerySchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
  category: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { question, limit, category, temperature } = ragQuerySchema.parse(body)

    const result = await answerToolQuestion(question, {
      limit,
      category,
      temperature,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 })
    }

    console.error("RAG API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("query") || ""
    const limit = searchParams.get("limit")
    const category = searchParams.get("category")

    const parsed = contextQuerySchema.parse({
      query,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      category: category || undefined,
    })

    const context = await retrieveToolContext(parsed.query, {
      limit: parsed.limit,
      category: parsed.category,
    })

    return NextResponse.json({ context })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 })
    }

    console.error("RAG context API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
