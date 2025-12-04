import { QdrantClient } from "@qdrant/js-client-rest"
import { env } from "~/env"

export const qdrantClient = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY,
})

export const QDRANT_TOOLS_COLLECTION = "tools"
export const QDRANT_SEMANTIC_CACHE_COLLECTION = "semantic_cache"
// Hybrid collection with separate name
export const QDRANT_HYBRID_COLLECTION = "tools_hybrid"
// Alternatives and categories collections
export const QDRANT_ALTERNATIVES_COLLECTION = "alternatives_hybrid"
export const QDRANT_CATEGORIES_COLLECTION = "categories_hybrid"
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
      const existsResult = await qdrantClient.collectionExists(QDRANT_TOOLS_COLLECTION)
      const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

      if (!exists) {
        console.log(`Creating tools collection: ${QDRANT_TOOLS_COLLECTION}`)
        await qdrantClient.createCollection(QDRANT_TOOLS_COLLECTION, {
          vectors: {
            size: QDRANT_TOOLS_VECTOR_SIZE,
            distance: "Cosine",
          },
        })
        console.log("Tools collection created successfully")
      }
    })()
  }

  return ensureToolsCollectionPromise
}

let ensureHybridCollectionPromise: Promise<void> | null = null

let ensureSemanticCacheCollectionPromise: Promise<void> | null = null

export const ensureSemanticCacheCollection = async () => {
  if (!ensureSemanticCacheCollectionPromise) {
    ensureSemanticCacheCollectionPromise = (async () => {
      const existsResult = await qdrantClient.collectionExists(QDRANT_SEMANTIC_CACHE_COLLECTION)
      const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

      if (!exists) {
        console.log(`Creating semantic cache collection: ${QDRANT_SEMANTIC_CACHE_COLLECTION}`)
        await qdrantClient.createCollection(QDRANT_SEMANTIC_CACHE_COLLECTION, {
          vectors: {
            size: QDRANT_DENSE_VECTOR_SIZE,
            distance: "Cosine",
          },
        })
        console.log("Semantic cache collection created successfully")
      }
    })()
  }

  return ensureSemanticCacheCollectionPromise
}

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
        console.log('Hybrid collection created successfully')
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
  const existsResult = await qdrantClient.collectionExists(QDRANT_HYBRID_COLLECTION)
  const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

  if (exists) {
    await qdrantClient.deleteCollection(QDRANT_HYBRID_COLLECTION)
  }

  // Reset the promise so it creates fresh
  ensureHybridCollectionPromise = null
  await ensureHybridCollection()
}

// ============================================================================
// Alternatives Collection
// ============================================================================

let ensureAlternativesCollectionPromise: Promise<void> | null = null

/**
 * Ensures the alternatives hybrid collection exists with both dense and sparse vector configs
 * Uses named vectors for Qdrant hybrid search with RRF fusion
 */
export const ensureAlternativesCollection = async () => {
  if (!ensureAlternativesCollectionPromise) {
    ensureAlternativesCollectionPromise = (async () => {
      const existsResult = await qdrantClient.collectionExists(QDRANT_ALTERNATIVES_COLLECTION)
      const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

      if (!exists) {
        console.log(`Creating alternatives hybrid collection: ${QDRANT_ALTERNATIVES_COLLECTION}`)
        await qdrantClient.createCollection(QDRANT_ALTERNATIVES_COLLECTION, {
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
        console.log("Alternatives hybrid collection created successfully")
      }
    })()
  }

  return ensureAlternativesCollectionPromise
}

/**
 * Recreates the alternatives hybrid collection (useful for schema migrations)
 * WARNING: This will delete all existing data in the collection
 */
export const recreateAlternativesCollection = async () => {
  const existsResult = await qdrantClient.collectionExists(QDRANT_ALTERNATIVES_COLLECTION)
  const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

  if (exists) {
    await qdrantClient.deleteCollection(QDRANT_ALTERNATIVES_COLLECTION)
  }

  // Reset the promise so it creates fresh
  ensureAlternativesCollectionPromise = null
  await ensureAlternativesCollection()
}

// ============================================================================
// Categories Collection
// ============================================================================

let ensureCategoriesCollectionPromise: Promise<void> | null = null

/**
 * Ensures the categories hybrid collection exists with both dense and sparse vector configs
 * Uses named vectors for Qdrant hybrid search with RRF fusion
 */
export const ensureCategoriesCollection = async () => {
  if (!ensureCategoriesCollectionPromise) {
    ensureCategoriesCollectionPromise = (async () => {
      const existsResult = await qdrantClient.collectionExists(QDRANT_CATEGORIES_COLLECTION)
      const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

      if (!exists) {
        console.log(`Creating categories hybrid collection: ${QDRANT_CATEGORIES_COLLECTION}`)
        await qdrantClient.createCollection(QDRANT_CATEGORIES_COLLECTION, {
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
        console.log("Categories hybrid collection created successfully")
      }
    })()
  }

  return ensureCategoriesCollectionPromise
}

/**
 * Recreates the categories hybrid collection (useful for schema migrations)
 * WARNING: This will delete all existing data in the collection
 */
export const recreateCategoriesCollection = async () => {
  const existsResult = await qdrantClient.collectionExists(QDRANT_CATEGORIES_COLLECTION)
  const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

  if (exists) {
    await qdrantClient.deleteCollection(QDRANT_CATEGORIES_COLLECTION)
  }

  // Reset the promise so it creates fresh
  ensureCategoriesCollectionPromise = null
  await ensureCategoriesCollection()
}
