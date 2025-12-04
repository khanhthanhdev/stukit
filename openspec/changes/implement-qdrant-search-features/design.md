## Context
The codebase already has Qdrant integrated for tool search with hybrid (dense + sparse) vector search using Gemini embeddings. The current implementation indexes only tools, while alternatives and categories use Prisma keyword search. The `qdrant-search-plan.md` document outlines a vision for comprehensive Qdrant-based search, but several components are missing.

## Goals
- Complete Qdrant integration for all searchable entities (tools, alternatives, categories)
- Enable semantic search for alternatives and categories using the same hybrid approach as tools
- Add related tool recommendations using Qdrant's recommendation capabilities
- Improve search experience in both public and admin interfaces
- Maintain backward compatibility with existing keyword search

## Non-Goals
- Replacing Prisma entirely (Prisma remains for data hydration and complex filtering)
- Migrating existing data structures (extending current patterns)
- Adding new external dependencies beyond existing Qdrant + Gemini setup
- Implementing full-text search features beyond what Qdrant provides

## Decisions

### Decision: Use Hybrid Collections for All Entities
**What**: Create hybrid collections (dense + sparse vectors) for alternatives and categories, matching the tools collection pattern.

**Why**: 
- Consistency with existing tools collection architecture
- Better search quality through hybrid search (semantic + keyword matching)
- Leverages existing sparse vector generation code

**Alternatives considered**:
- Dense-only collections: Simpler but less accurate for exact name matches
- Sparse-only collections: Faster but misses semantic relationships

### Decision: Reuse Existing Vector Generation
**What**: Use the same `generateGeminiEmbedding` and `generateSparseEmbedding` functions for all entities.

**Why**:
- Consistency in embedding space
- Reuses existing retry/backoff logic
- No need for entity-specific embedding models

**Alternatives considered**:
- Entity-specific embedding models: More complexity, unclear benefit
- Different embedding dimensions: Would require separate collections and more complexity

### Decision: Prisma for Hydration, Qdrant for Search
**What**: Qdrant returns IDs and scores, Prisma hydrates full entity data.

**Why**:
- Maintains existing data consistency guarantees
- Prisma handles complex filtering and relations
- Qdrant payloads are lean (IDs, slugs, names) for fast search

**Alternatives considered**:
- Store full data in Qdrant: Duplication, consistency issues, larger payloads
- Qdrant-only queries: Loses Prisma's type safety and relation handling

### Decision: Recommendation API for Related Tools
**What**: Use Qdrant's `recommend` API to find similar tools based on vector similarity.

**Why**:
- Leverages existing vector embeddings
- More accurate than keyword-based similarity
- Native Qdrant feature, no additional infrastructure

**Alternatives considered**:
- Keyword-based recommendations: Less accurate for semantic similarity
- External recommendation service: Additional complexity and infrastructure

### Decision: Centralized Search Configuration
**What**: Create `config/search.ts` with shared search parameters (limits, thresholds, ef_search).

**Why**:
- Single source of truth for search tuning
- Easier to adjust search behavior across the application
- Environment-specific overrides possible

**Alternatives considered**:
- Hardcoded values: Less flexible, harder to tune
- Per-function configuration: More verbose, inconsistent defaults

## Risks / Trade-offs

### Risk: Indexing Performance
**Mitigation**: 
- Batch indexing operations
- Use async lifecycle hooks
- Provide manual reindexing scripts

### Risk: Search Latency
**Mitigation**:
- Use appropriate `ef_search` values (balance accuracy vs speed)
- Implement result caching where appropriate
- Fallback to keyword search if Qdrant is slow

### Risk: Data Consistency
**Mitigation**:
- Index on create/update/delete events
- Provide drift detection script
- Manual reindexing capability for recovery

### Trade-off: Search Quality vs Performance
- Higher `ef_search` = better results but slower queries
- Solution: Start with conservative defaults, tune based on metrics

## Migration Plan

### Phase 1: Infrastructure
1. Add collection definitions and ensure functions
2. Create search configuration module
3. Update setup script to create new collections

### Phase 2: Indexing
1. Implement vector store operations for alternatives and categories
2. Add indexing functions
3. Run initial indexing for existing data

### Phase 3: Search Integration
1. Update admin search to use Qdrant for all entities
2. Enhance public search with Qdrant alternatives/categories
3. Add related tools recommendations

### Phase 4: Lifecycle Hooks
1. Add indexing hooks to tool lifecycle functions
2. Add category/alternative update hooks
3. Test end-to-end indexing flow

### Rollback
- Keep existing Prisma keyword search as fallback
- Collections can be deleted/recreated without affecting Prisma data
- No schema changes required

## Open Questions
- Should tags be indexed in Qdrant? (Currently using Prisma keyword search)
- What should be the default `ef_search` value for different search contexts?
- Should we add search analytics/metrics collection?

