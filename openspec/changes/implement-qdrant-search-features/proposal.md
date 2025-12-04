# Change: Implement Qdrant Search Features

## Why
The codebase already has Qdrant integrated for tool search with hybrid (dense + sparse) vector search, but the implementation is incomplete. The existing `qdrant-search-plan.md` outlines a vision for comprehensive Qdrant-based search across tools, alternatives, and categories. Currently, only tools are indexed in Qdrant, while alternatives and categories rely on Prisma keyword search. Additionally, public search could better leverage Qdrant's semantic capabilities, and related/recommendation features are missing.

This change completes the Qdrant search implementation by:
- Indexing alternatives and categories in Qdrant collections
- Enhancing public search to fully utilize Qdrant hybrid search
- Adding related tool recommendations using Qdrant's recommendation API
- Improving admin search to use Qdrant for all entity types
- Adding proper collection management and indexing utilities

## What Changes
- **ADDED**: Qdrant collections for alternatives and categories with hybrid search support
- **ADDED**: Vector indexing functions for alternatives and categories in `lib/vector-store.ts`
- **ADDED**: Related tool recommendations using Qdrant's recommendation API
- **MODIFIED**: Public search (`server/tools/queries.ts`) to better integrate Qdrant search modes
- **MODIFIED**: Admin search (`actions/search.ts`) to use Qdrant for categories, collections, and tags
- **ADDED**: Collection setup script enhancements to include alternatives and categories collections
- **ADDED**: Indexing utilities for alternatives and categories with lifecycle hooks
- **ADDED**: Search configuration module for centralized search parameters

## Impact
- **Affected specs**: New `search` capability specification
- **Affected code**:
  - `lib/vector-store.ts` - Add alternative and category vector operations
  - `services/qdrant.ts` - Add collection definitions for alternatives and categories
  - `actions/search.ts` - Enhance to use Qdrant for all entity types
  - `server/tools/queries.ts` - Improve public search Qdrant integration
  - `scripts/setup-qdrant.ts` - Add alternatives and categories collection setup
  - `functions/tool-*.ts` - Add indexing hooks for alternatives and categories
  - New: `config/search.ts` - Centralized search configuration
  - New: `lib/related-tools.ts` - Related tool recommendations using Qdrant

