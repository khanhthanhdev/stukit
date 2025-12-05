import { createGroq } from "@ai-sdk/groq"

export const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

// Commonly used Groq chat model
export const GROQ_COMPOSE_MINI = "openai/gpt-oss-20b"
export const groqComposeModel = groq(GROQ_COMPOSE_MINI)
