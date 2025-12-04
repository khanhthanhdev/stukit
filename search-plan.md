Search Architecture (Tools & Alternatives)

Backend entry points
- Public tool search uses `searchTools` as the single entry point. It routes between keyword (Prisma) and semantic (Qdrant hybrid) strategies via `SearchOrchestrator`.
- Alternative search uses `searchAlternatives` with the same fallback/circuit breaker behaviors as tool search.
- Admin command palette uses `actions/search.ts` with a lightweight keyword/semantic toggle (semantic runs hybrid Qdrant search with a keyword fallback).

Strategy pattern
- Strategies implement the `SearchStrategy` interface (`execute` + `canHandle`) in `server/tools/queries.ts`.
- `ToolSemanticSearchStrategy` performs Qdrant hybrid search (dense + sparse with RRF), hydrates Prisma entities, and records vector timings.
- `ToolKeywordSearchStrategy` runs Prisma filtering with sorting, pagination, and category filters; returns empty matches but full metadata.
- `SearchOrchestrator` coordinates strategies, injects the circuit breaker state, and triggers keyword fallback when Qdrant fails, times out, or returns no ranked results.

Resilience & error handling
- Circuit breaker (configurable in `config/search.ts`) opens after consecutive failures, half-opens after 30s, and closes after 3 successes. When open, searches skip Qdrant and immediately fall back to keyword with error metadata.
- Timeouts (default 10s) wrap Qdrant calls; failures surface as `SearchError` codes in metadata.
- Errors are serialized via `toSearchErrorInfo` and attached to `SearchResultMetadata.errors` on fallbacks for debugging.

Caching
- Query embeddings are cached via `lib/embedding-cache.ts` (LRU 1000 entries, 5m TTL). AsyncLocalStorage dedupes embedding requests within a single request.
- All tool/alternative/admin searches run inside `runWithEmbeddingCache` to share request-scoped cache hits; global cache logs hit/miss/eviction metrics.

Frontend behavior
- Tool list filter toggle only exposes `keyword` and `semantic` modes. Hybrid is removed; semantic mode already runs hybrid fusion with keyword fallback.
- Search params (`server/tools/search-params.ts`) normalize any legacy `mode=hybrid` to `semantic` server-side.
- Tool listing (`app/(web)/tools/(tools)/listing.tsx`) calls the unified `searchTools` function with the parsed query params.

Data sources & filters
- Keyword searches: Prisma `tool.findMany`/`count` scoped to published tools, with category filters, pagination, and sort parsing (`publishedAt.desc` default).
- Semantic searches: `hybridSearchToolVectors` with optional category filters and score thresholds from `config/search.ts`; hydration preserves Qdrant ranking order.
- Alternatives: uses the same hybrid search and keyword fallback flow; circuit breaker state is attached to metadata.
