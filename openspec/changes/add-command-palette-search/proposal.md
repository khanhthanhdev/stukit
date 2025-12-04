# Change: Add command palette search

## Why
- The site only exposes a small header search box today; there is no global command palette for fast navigation or cross-entity discovery.
- We already have Qdrant-powered hybrid search for tools/categories but no UX that surfaces it across the app or falls back gracefully when vectors are unavailable.

## What Changes
- Add a keyboard-driven command palette (Mod+K) with grouped results for tools, categories, collections, and tags, plus quick links when no query is entered.
- Use the existing Qdrant hybrid search pipeline (with keyword fallback and circuit breaker) to populate palette results and show which mode was used.
- Include loading/error states, keyboard navigation, and routing so users can jump directly to tool/category/collection/tag pages.

## Impact
- Affected specs: command-search (new)
- Affected code: search server actions (public surface), vector search helpers, global layout/providers, header trigger, command palette UI components
