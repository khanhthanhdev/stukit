# Typesense search plan (fits current codebase)

## Goals
- Replace/augment Qdrant with Typesense for fast lexical + vector/hybrid search.
- Keep Prisma for filtering/hydration and current API shapes (`actions/search.ts`, `server/web/.../queries.ts`).
- Preserve cache tags/life and performance logging already used in handlers.

## Quick takeaways from Typesense docs (Context7)
- Supports hybrid search: combine keyword + vector with adjustable weight `alpha` (default 0.3 keyword / 0.7 vector) via `vector_query` (ref: Typesense vector search docs).
- Vector search accepts `float[]` fields; can rank keyword results by vector distance or run pure vector kNN.
- Built-in embeddings available via `embed` schema option (`model_name` like `ts/all-MiniLM-L12-v2`) or you can supply external embeddings.
- Multi-search runs multiple collection queries in one round-trip; presets let us store reusable search params (see typesense-js examples).
- Synonyms, overrides, facets, geo filters, and collection aliases for zero-downtime reindexing are built-in.

## Architecture fit
- Write path: Prisma fetch -> embed (Gemini or Typesense built-in) -> Typesense `documents.import`/`documents.upsert` with payload needed for filters/facets -> optional alias swap for versioning.
- Read path: Typesense search/hybrid -> collect IDs/payloads -> Prisma `findMany`/`count` to hydrate DTOs and enforce existing filters/sorts -> return DTOs with cache tagging.
- Entities to index: tools (primary), categories, collections, tags; reuse existing `buildToolDocument` inputs for text.

## Collections and schema (proposed)
- Collection per entity: `tools`, `categories`, `collections`, `tags`; fronted by aliases `tools`, `categories`, etc. to allow versioned collections (`tools_v1` -> `tools_v2`).
- Tool fields:
  - `id` (string, required)
  - `slug` (string, facet: true)
  - `name` (string, `locale: en`, facet: false)
  - `tagline`, `description`, `content` (string, optional)
  - `websiteUrl` (string)
  - `categories` (string[], facet: true)
  - `tags` (string[], facet: true)
  - `published` (bool) for filtering
  - `embedding` (float[] with dimension from chosen model)
  - optional `embedding_hash` to skip re-embedding when unchanged
- Sample schema creation (TS):
```ts
client.collections().create({
  name: "tools_v1",
  fields: [
    { name: "id", type: "string" },
    { name: "slug", type: "string", facet: true },
    { name: "name", type: "string" },
    { name: "tagline", type: "string", optional: true },
    { name: "description", type: "string", optional: true },
    { name: "content", type: "string", optional: true },
    { name: "websiteUrl", type: "string" },
    { name: "categories", type: "string[]", facet: true },
    { name: "tags", type: "string[]", facet: true },
    { name: "published", type: "bool" },
    { name: "embedding", type: "float[]", num_dim: 768 }, // or model dim
  ],
  default_sorting_field: "name",
});
// Alias for zero-downtime
client.aliases().upsert("tools", { collection_name: "tools_v1" });
```

## Embedding strategy
- Option A (reuses current stack): keep Gemini embeddings (`generateGeminiEmbedding`) and write them to `embedding`; allows same vector sizes and avoids model drift.
- Option B (Typesense built-in): set `embedding` field with `embed: { from: ["name", "tagline", "description", "content"], model_config: { model_name: "ts/all-MiniLM-L12-v2" } }` to avoid managing an external embedder. Good for ease, but less control and may have rate limits depending on deployment.
- Keep `embedding_hash` to skip re-embedding if `buildToolDocument` unchanged.

## Integration steps (files)
1) Client
   - Add `typesense` npm dependency.
   - New `services/typesense.ts`: create client with `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY`, `TYPESENSE_SEARCH_ONLY_KEY`, `TYPESENSE_COLLECTION_PREFIX` (prefix per site).
   - Helper `getCollection(name)` to apply prefix; `typesenseClient()` that throws if envs missing.
2) Setup script
   - `scripts/setup-typesense.ts`: create collections + aliases; configure HNSW params (if using self-host) and default `alpha`, `k`, `per_page`; seed synonyms/presets.
   - Wire package.json script `typesense:setup`.
3) Indexers
   - `lib/indexing-typesense.ts`: functions `indexTools`, `indexCategories`, `indexTags`; re-use Prisma fetch + `buildToolDocument`; batch `documents.import` with `action: "upsert"` and `batch_size`.
   - Optional reindex progress callback similar to `reindexAllTools`.
4) Search APIs
   - `actions/search.ts`: replace `hybridSearchToolVectors` with Typesense `multiSearch.perform` using:
     - `q`, `query_by: "name,tagline,description,content"`.
     - `vector_query: "embedding:([vec], k:SEARCH_LIMIT, alpha:HYBRID_ALPHA)"` when mode is hybrid and embedding available.
     - `filter_by` for categories/tags, `per_page: SEARCH_LIMIT`, `highlight_fields`.
   - `server/web/tools/queries.ts` and `server/web/alternatives/queries.ts`: perform Typesense search to get IDs + sort order, then Prisma hydrate and order by ID list; keep cache tags/life.
5) Synonyms, overrides, presets
   - Add optional admin utilities to manage synonym sets per collection (`client.synonyms().upsert`).
   - Use presets to store default search params for web/admin UIs (e.g., highlight tags, typo tolerance).
6) Observability
   - Log search latency and hit counts similar to current `performance.now()` logging.
   - Expose health check to ensure Typesense reachable; optional metrics from Typesense `/health`.

## Search query shapes (recommended defaults)
- Keyword-only: `q`, `query_by`, `filter_by`, `sort_by`, `per_page`, `page`.
- Hybrid: add `vector_query: "embedding:([<queryVec>], k:prefetch, alpha:0.8)"`; adjust `alpha` per UX testing (start 0.6–0.8).
- Faceting: `facet_by: "categories,tags"`, `max_facet_values: 10`, `filter_by` for published.
- Admin command palette: use `multiSearch.perform` for tools/categories/collections/tags in one call to cut latency.

## Ops and deployment
- Hosting: Typesense Cloud simplest; otherwise run 3-node cluster with persistence on SSD; enable TLS.
- API keys: use search-only key in client-side contexts; server key for write/indexing. Scope with actions (`documents:search`, `documents:create`, `collections:*`, `synonyms:*`).
- Zero-downtime reindex: create `tools_vN`, backfill, swap alias `tools`, then drop old collection.
- Backfill command: `bun tsx scripts/setup-typesense.ts --reindex` to create collections, index, and alias swap.

## Risks / open questions
- Determine embedding dimension: if staying on Gemini, confirm size (currently `QDRANT_TOOLS_VECTOR_SIZE`) and align `num_dim`.
- Cost/latency: built-in embedding vs Gemini trade-offs; choose based on hosting constraints.
- Geo filters not needed now, but Typesense supports; ignore unless product asks.
- Need to confirm pagination expectations in UI to map `per_page`/`page` vs Prisma paging.
