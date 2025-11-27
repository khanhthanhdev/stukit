import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { embed } from "ai"
import { env } from "~/env"

export const gemini = createGoogleGenerativeAI({
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
})

export const GEMINI_FLASH_LITE_MODEL = "gemini-2.5-flash-lite"
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash"
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"

export const geminiFlashLiteModel = gemini(GEMINI_FLASH_LITE_MODEL)
export const geminiFlashModel = gemini(GEMINI_FLASH_MODEL)
export const geminiEmbeddingModel = gemini.textEmbedding(GEMINI_EMBEDDING_MODEL)
export const geminiGoogleSearchTool = gemini.tools.googleSearch({})

export type GeminiEmbeddingTaskType =
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING"
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION"
  | "CODE_RETRIEVAL_QUERY"

export type GeminiEmbeddingOptions = {
  outputDimensionality?: number
  taskType?: GeminiEmbeddingTaskType
}

export const generateGeminiEmbedding = async (
  value: string,
  options: GeminiEmbeddingOptions = {},
) => {
  const providerOptions =
    options.outputDimensionality === undefined && options.taskType === undefined
      ? undefined
      : {
          google: {
            ...(options.outputDimensionality !== undefined
              ? { outputDimensionality: options.outputDimensionality }
              : {}),
            ...(options.taskType !== undefined ? { taskType: options.taskType } : {}),
          },
        }

  const { embedding } = await embed({
    model: geminiEmbeddingModel,
    value,
    providerOptions,
    experimental_telemetry: { isEnabled: true },
  })

  return embedding
}
