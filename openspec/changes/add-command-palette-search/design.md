## Context
- We need a global command palette UI similar to OpenAlternative’s, but powered by our existing Qdrant hybrid search (with keyword fallback and circuit breaker) instead of Meilisearch.
- Current search UX is a small header bar that only routes to `/tools`; there is no cross-entity search or keyboard-driven navigation.
- `actions/search.ts` already orchestrates admin-focused hybrid search for tools/categories with Prisma fallback; collections/tags are keyword-only. The palette should reuse this logic but expose it safely to public users.

## Goals / Non-Goals
- Goals: keyboard-triggered palette, grouped results for tools/categories/collections/tags, quick links when idle, surface which search mode was used (semantic vs keyword), resilient to Qdrant outages.
- Non-Goals: redesign of results pages, new ranking algorithms, or new entity types beyond tools/categories/collections/tags.

## Decisions
- Reuse the existing Qdrant hybrid search pipeline (vector + keyword fallback) and expose a public-safe server action that returns grouped results plus mode metadata; collections/tags remain keyword-only.
- Use a global client provider to manage palette open state, with a dialog component for the palette; Mod+K triggers open everywhere, and the header includes a search button trigger.
- Show quick links (Tools, Categories, Collections, Tags, Submit) when there is no query; once typing begins, show grouped results with entity-specific routing.
- Footer displays total hits/timing and the effective search modes per entity; errors show a friendly fallback message while preserving navigation links.

## Risks / Trade-offs
- Public exposure of search action must enforce limits and timeouts to avoid abuse—rate-limit at the UI level and reuse circuit breaker from `actions/search.ts`.
- Qdrant downtime would otherwise leave the palette empty; we mitigate with keyword fallback and clear “fallback to keyword” messaging.
- Palette adds client bundle weight; keep the implementation lean (reuse existing command primitives, avoid heavy dependencies).

## Open Questions
- Should admin-only quick actions be included when the user is an admin? (default assumption: defer until requested).
- Should search results include badges for match type (semantic vs keyword) per item, or just overall mode metadata? (default: overall mode in footer).
