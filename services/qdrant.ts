import { QdrantClient } from "@qdrant/js-client-rest"
import { env } from "~/env"

export const qdrantClient = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY,
})

export const QDRANT_TOOLS_COLLECTION = "tools"
export const QDRANT_TOOLS_VECTOR_SIZE = 1536

let ensureToolsCollectionPromise: Promise<void> | null = null

export const ensureToolsCollection = async () => {
  if (!ensureToolsCollectionPromise) {
    ensureToolsCollectionPromise = (async () => {
      const exists = await qdrantClient.collectionExists(QDRANT_TOOLS_COLLECTION)

      if (!exists) {
        await qdrantClient.createCollection(QDRANT_TOOLS_COLLECTION, {
          vectors: {
            size: QDRANT_TOOLS_VECTOR_SIZE,
            distance: "Cosine",
          },
        })
      }
    })()
  }

  return ensureToolsCollectionPromise
}
