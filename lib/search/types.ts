import type { SearchErrorInfo } from "../search-errors"

export type SearchMode = "keyword" | "semantic"
export type SearchMatchType = SearchMode | "fallback"

export type SearchTimings = {
  totalMs?: number
  vectorMs?: number
  keywordMs?: number
  hydrateMs?: number
}

export type SearchResultMetadata = {
  mode: SearchMode
  requestedMode?: SearchMode | "hybrid"
  matchType: SearchMatchType
  usedQdrant: boolean
  hasFallback: boolean
  qdrantResultCount?: number
  keywordResultCount?: number
  timings?: SearchTimings
  errors?: SearchErrorInfo[]
  circuitBreakerState?: "open" | "half-open" | "closed"
  strategy?: "keyword" | "semantic" | "rrf"
}

export type SearchResult<TItem, TMatch = unknown> = {
  items: TItem[]
  totalCount: number
  metadata: SearchResultMetadata
  matches?: TMatch[]
}

export const normalizeSearchMode = (mode?: string | null): SearchMode => {
  const normalized = (mode || "").toLowerCase()
  if (normalized === "semantic" || normalized === "hybrid") {
    return "semantic"
  }

  return "keyword"
}
