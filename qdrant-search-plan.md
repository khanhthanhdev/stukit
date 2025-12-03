# Qdrant + Gemini search plan (fits current codebase)

## Goals
- Swap MeiliSearch for Qdrant + Gemini embeddings.
- Keep Prisma for filtering/hydration and current API shapes (`searchItems`, `searchTools`, `searchAlternatives`, related widgets).
- Preserve Next cache tags/life and performance logging.

## Architecture (read/write path)
- Write: Prisma fetch -> Gemini embed -> Qdrant `upsertPoints` (vector + lean payload) -> cache/memoize embedding by hash to avoid re-embedding.
- Read: Qdrant vector/BM25 search -> collect IDs -> Prisma `findMany`/`count` with existing filters/sorts -> return DTOs; cache responses.
- Related: Qdrant `search`/`recommend` by point ID -> Prisma hydrate.

## Step-by-step (files and changes)
1) Qdrant client
- Add `services/qdrant.ts`: instantiate Qdrant client with envs `QDRANT_URL`, `QDRANT_API_KEY`; helper `getCollection(name)` using `config.site.slug` prefix (mirrors `services/meilisearch.ts`).

2) Embeddings
- Add `services/embeddings.ts`: Gemini client (small/fast model), `embedText(text)` with retry/backoff + in-memory LRU keyed by content hash.
- Optional schema change: add `embedding` (vector) + `embeddingHash` to `tools`/`alternatives` for reuse; if skipping schema change, rely on process cache.

3) Collections setup
- Add `scripts/setup-qdrant.ts`:
  - Define collections `tools`, `alternatives`, `categories` with vector size from Gemini model, distance `cosine`.
  - HNSW params tuned for latency (`m=16`, `ef_construct=100`); set default `ef_search` (e.g., 64).
  - Payload indexes on `slug`, `status`, and filterable fields (categories, alternatives, topics).
  - CLI entry `bun tsx scripts/setup-qdrant.ts` to create/reset.

4) Indexers
- Add `lib/indexing-qdrant.ts` (keep `lib/indexing.ts` as reference):
  - `indexTools({ where })`: Prisma fetch published/scheduled tools with lean payload; build embed input (name/tagline/description/categories/alternatives); `embedText`; batch `upsertPoints` with payload (`id`, `slug`, `name`, `tagline`, `description`, `websiteUrl`, `faviconUrl`, `isFeatured`, `score`, `pageviews`, `status`, `alternatives`, `categories`, `topics`).
  - `indexAlternatives({ where })` and `indexCategories({ where })` similarly.
- Wire `scripts/setup-qdrant.ts` to call these indexers after collection setup.

5) Search endpoints
- `actions/search.ts`: replace Meili calls with Qdrant `search` per collection inside `Promise.all`; tight `limit` (5–8), `score_threshold`, `with_payload` (`slug`, `name`, `faviconUrl`/`fullPath`); keep `performance.now()` log.
- `server/web/tools/queries.ts`: when `q` provided, call Qdrant to get IDs (optionally filter via payload conditions), then Prisma `findMany` + `count` using existing filters/sorts; fall back to Prisma-only when `q` empty; keep `cacheTag/cacheLife`.
- `server/web/alternatives/queries.ts`: same pattern.
- Related widgets (`findRelatedToolIds`, `findRelatedAlternativeIds`): use Qdrant `search`/`recommend` by `id` with `limit`, `score_threshold`, `with_payload: ["id"]`; then Prisma hydrate; cache for hours.

6) Config/knobs
- New envs: `QDRANT_URL`, `QDRANT_API_KEY`, `GEMINI_API_KEY`, optional `QDRANT_COLLECTION_PREFIX`, `QDRANT_EF_SEARCH`, `QDRANT_SCORE_THRESHOLD`.
- Add a small config module (e.g., `config/search.ts`) exporting defaults (limits, thresholds, ef_search) used by handlers/indexers.

7) Ops
- Manual rebuild: `bun tsx scripts/setup-qdrant.ts`.
- Drift check (follow-up): compare Prisma counts vs Qdrant collection counts in a small script (optional `scripts/check-qdrant-drift.ts`).
- Hook publish/update events to enqueue reindex jobs (future improvement).
