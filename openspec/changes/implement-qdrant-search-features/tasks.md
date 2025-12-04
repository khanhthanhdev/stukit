## 1. Infrastructure Setup
- [x] 1.1 Add Qdrant collection constants for alternatives and categories in `services/qdrant.ts`
- [x] 1.2 Create collection ensure functions for alternatives and categories collections
- [x] 1.3 Add hybrid collection support for alternatives and categories (dense + sparse vectors)
- [x] 1.4 Create `config/search.ts` module with centralized search parameters (limits, thresholds, ef_search)

## 2. Vector Store Operations
- [x] 2.1 Define payload types for alternatives and categories in `lib/vector-store.ts`
- [x] 2.2 Implement `upsertAlternativeVector` and `upsertCategoryVector` functions
- [x] 2.3 Implement `deleteAlternativeVector` and `deleteCategoryVector` functions
- [x] 2.4 Implement `searchAlternativeVectors` and `searchCategoryVectors` functions
- [x] 2.5 Implement hybrid search functions for alternatives and categories
- [x] 2.6 Add reindexing functions for alternatives and categories

## 3. Related Tools Feature
- [x] 3.1 Create `lib/related-tools.ts` with `findRelatedTools` function using Qdrant recommendation API
- [x] 3.2 Implement recommendation by tool ID with configurable limit and score threshold
- [x] 3.3 Add filtering support for recommendations (category, published status)
- [x] 3.4 Integrate related tools into tool detail pages

## 4. Public Search Enhancements
- [ ] 4.1 Enhance `searchToolsUnified` to better handle Qdrant search modes
- [ ] 4.2 Add alternatives search using Qdrant in public search flows
- [ ] 4.3 Add categories search using Qdrant in public search flows
- [ ] 4.4 Improve fallback logic when Qdrant search returns no results
- [ ] 4.5 Add search result metadata (scores, match types) to response types

## 5. Admin Search Enhancements
- [x] 5.1 Update `actions/search.ts` to use Qdrant for categories search
- [x] 5.2 Update `actions/search.ts` to use Qdrant for collections search
- [x] 5.3 Update `actions/search.ts` to use Qdrant for tags search (if applicable)
- [x] 5.4 Maintain backward compatibility with keyword search mode
- [x] 5.5 Add search mode indicator in admin search results

## 6. Indexing and Lifecycle
- [x] 6.1 Update `scripts/setup-qdrant.ts` to create alternatives and categories collections
- [x] 6.2 Add initial indexing of alternatives and categories in setup script
- [x] 6.3 Create indexing functions for alternatives and categories in `lib/vector-store.ts`
- [x] 6.4 Add lifecycle hooks in `functions/tool-scheduled.ts` to index related alternatives
- [x] 6.5 Add lifecycle hooks in `functions/tool-submitted.ts` to index related alternatives
- [x] 6.6 Create functions to index categories when they are created/updated

## 7. Testing and Validation
- [x] 7.1 Test alternatives indexing and search end-to-end
- [x] 7.2 Test categories indexing and search end-to-end
- [x] 7.3 Test related tools recommendations with various inputs
- [x] 7.4 Validate search performance and fallback behavior
- [x] 7.5 Test admin search with all entity types using Qdrant
- [x] 7.6 Verify collection drift detection (optional: create `scripts/check-qdrant-drift.ts`)

## 8. Documentation
- [x] 8.1 Update `docs/rag.md` with alternatives and categories search information
- [x] 8.2 Document related tools recommendation API usage
- [x] 8.3 Add search configuration documentation

