import { QdrantClient } from "@qdrant/js-client-rest"
import { env } from "~/env"

export const qdrantClient = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY,
})

export const QDRANT_TOOLS_COLLECTION = "tools"
// Hybrid collection with separate name
export const QDRANT_HYBRID_COLLECTION = "tools_hybrid"
// Dense vector size for gemini-embedding-001 (native 768, or custom)
export const QDRANT_DENSE_VECTOR_SIZE = 768
export const QDRANT_TOOLS_VECTOR_SIZE = 768

let ensureToolsCollectionPromise: Promise<void> | null = null

/**
 * Ensures the legacy tools collection exists (backward compatibility)
 * @deprecated Use ensureHybridCollection for new implementations
 */
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

let ensureHybridCollectionPromise: Promise<void> | null = null

/**
 * Ensures the hybrid collection exists with both dense and sparse vector configs
 * Uses named vectors for Qdrant hybrid search with RRF fusion
 */
export const ensureHybridCollection = async () => {
  if (!ensureHybridCollectionPromise) {
    ensureHybridCollectionPromise = (async () => {
      const existsResult = await qdrantClient.collectionExists(QDRANT_HYBRID_COLLECTION)
      // Qdrant client returns { exists: boolean } object
      const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

      if (!exists) {
        console.log(`Creating hybrid collection: ${QDRANT_HYBRID_COLLECTION}`)
        await qdrantClient.createCollection(QDRANT_HYBRID_COLLECTION, {
          vectors: {
            dense: {
              size: QDRANT_DENSE_VECTOR_SIZE,
              distance: "Cosine",
            },
          },
          sparse_vectors: {
            sparse: {
              index: {
                on_disk: false, // Keep in RAM for speed
              },
            },
          },
        })
        console.log(`Hybrid collection created successfully`)
      }
    })()
  }

  return ensureHybridCollectionPromise
}

/**
 * Recreates the hybrid collection (useful for schema migrations)
 * WARNING: This will delete all existing data in the collection
 */
export const recreateHybridCollection = async () => {
  const exists = await qdrantClient.collectionExists(QDRANT_HYBRID_COLLECTION)

  if (exists) {
    await qdrantClient.deleteCollection(QDRANT_HYBRID_COLLECTION)
  }

  // Reset the promise so it creates fresh
  ensureHybridCollectionPromise = null
  await ensureHybridCollection()
}
