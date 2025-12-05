/**
 * Centralized search configuration for Qdrant vector search
 *
 * This module provides default search parameters that can be overridden
 * per-query when needed. Configuration values are environment-appropriate.
 */

export type SearchConfig = {
  /** Maximum number of results to return */
  limit: number
  /** Minimum relevance score threshold (0-1) */
  scoreThreshold: number
  /** HNSW ef_search parameter - higher = more accurate but slower */
  efSearch: number
  /** Prefetch limit for hybrid search (used in RRF fusion) */
  prefetchLimit: number
  /** Maximum duration (ms) before a search attempt is considered timed out */
  timeoutMs: number
  /** Embedding cache configuration */
  embeddingCache: {
    maxEntries: number
    ttlMs: number
  }
  /** Circuit breaker configuration for Qdrant calls */
  circuitBreaker: {
    failureThreshold: number
    halfOpenAfterMs: number
    successThreshold: number
  }
}

/**
 * Default search configuration for general queries
 */
export const defaultSearchConfig: SearchConfig = {
  limit: 10,
  scoreThreshold: 0.0, // No threshold by default, let Qdrant return all results
  efSearch: 64, // Balanced accuracy vs speed
  prefetchLimit: 20, // Fetch more candidates for RRF fusion
  timeoutMs: 10_000,
  embeddingCache: {
    maxEntries: 1000,
    ttlMs: 5 * 60_000, // 5 minutes
  },
  circuitBreaker: {
    failureThreshold: 5,
    halfOpenAfterMs: 30_000,
    successThreshold: 3,
  },
}

/**
 * Search configuration for admin interface
 * More permissive limits and thresholds for admin searches
 */
export const adminSearchConfig: SearchConfig = {
  limit: 50,
  scoreThreshold: 0.0,
  efSearch: 64,
  prefetchLimit: 50,
  timeoutMs: 10_000,
  embeddingCache: {
    maxEntries: 1000,
    ttlMs: 5 * 60_000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    halfOpenAfterMs: 30_000,
    successThreshold: 3,
  },
}

/**
 * Search configuration for public search
 * Optimized for speed and relevance
 */
export const publicSearchConfig: SearchConfig = {
  limit: 10,
  scoreThreshold: 0.0,
  efSearch: 64,
  prefetchLimit: 20,
  timeoutMs: 10_000,
  embeddingCache: {
    maxEntries: 1000,
    ttlMs: 5 * 60_000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    halfOpenAfterMs: 30_000,
    successThreshold: 3,
  },
}

/**
 * Search configuration for related/recommendation queries
 * Higher limits for recommendation results
 */
export const recommendationConfig: SearchConfig = {
  limit: 20,
  scoreThreshold: 0.3, // Higher threshold for recommendations
  efSearch: 64,
  prefetchLimit: 30,
  timeoutMs: 10_000,
  embeddingCache: {
    maxEntries: 1000,
    ttlMs: 5 * 60_000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    halfOpenAfterMs: 30_000,
    successThreshold: 3,
  },
}

/**
 * Environment-specific overrides
 * In production, we might want higher ef_search for better accuracy
 */
export const getSearchConfig = (
  type: "default" | "admin" | "public" | "recommendation" = "default",
): SearchConfig => {
  const baseConfig =
    type === "admin"
      ? adminSearchConfig
      : type === "public"
        ? publicSearchConfig
        : type === "recommendation"
          ? recommendationConfig
          : defaultSearchConfig

  // Environment-specific overrides
  const isProduction = process.env.NODE_ENV === "production"

  return {
    ...baseConfig,
    // In production, use higher ef_search for better accuracy
    efSearch: isProduction ? baseConfig.efSearch * 1.5 : baseConfig.efSearch,
  }
}
