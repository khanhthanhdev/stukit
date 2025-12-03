# Project Context

## Purpose
DevSuite ("AI Knowledge Cloud") is a curated discovery platform that helps developers pick the right tools for their next project. The public site highlights featured/latest tools, deep-dive detail pages, and taxonomy-driven navigation, while an authenticated admin dashboard lets us review submissions, schedule launches, and maintain categories, collections, and tags. Background jobs keep tool metadata fresh (copy, screenshots, social stats) and power downstream AI and RAG experiences.

## Tech Stack
- Next.js 15 App Router with React 19 RC and Turbopack dev server (`bun run dev`)
- TypeScript (strict mode) compiled/run via Bun; Biome handles lint/format/import order
- Prisma 6 + PostgreSQL (Neon) with `citext` columns for case-insensitive search and relations
- Tailwind CSS (separate `tailwind.web.config.ts` / `tailwind.admin.config.ts`) + component primitives in `components/` and `cva`
- Authentication through NextAuth (Google provider + `lib/auth.ts`) guarding admin-only areas and server actions
- Inngest for background functions (tool lifecycle events) invoked from `app/api/inngest/route.ts`
- Qdrant (vector DB) + Vercel AI SDK (Gemini, Anthropic, OpenAI) for hybrid semantic/keyword search and content generation
- AWS S3 + ScreenshotOne + Firecrawl for media ingestion and scraping; Resend for transactional email

## Project Conventions

### Code Style
- Enforced by Biome (`biome.json`): 2-space indentation, 100-character lines, double quotes, trailing commas, and import re-ordering via `bun run lint|format|check`.
- TypeScript is on `strict` with `noEmit`, so every change must satisfy the compiler; prefer typed helpers in `lib/`/`utils/` over `any`.
- Use the `~/*` path alias defined in `tsconfig.json` for intra-repo imports; keep server-only files free of client components unless wrapped in a dynamic boundary.
- Prefer server actions created via `authedProcedure`/`lib/safe-actions` with Zod schemas so errors surface consistently to UI toasts.

### Architecture Patterns
- App Router structure: `app/(web)` for the marketing/discovery surface, `app/admin` for the internal dashboard, and `app/api/*` for route handlers (Inngest, NextAuth, webhooks). Shared providers live in `app/layout.tsx` and `app/providers.tsx`.
- Domain logic lives under `server/<domain>` (queries, payload builders, search param helpers) and only talks to Prisma via the singleton in `services/prisma.ts`.
- Background work happens inside `functions/*.ts` and is triggered by lifecycle events such as `tool.submitted`, `tool.scheduled`, and `tool.deleted`. These functions orchestrate AI copy generation, screenshot uploads, and email notifications.
- Search uses a hybrid model (`lib/vector-store`, `actions/search.ts`): we call Qdrant for dense/sparse retrieval, enforce a score threshold, and fall back to Prisma keyword queries when needed to guarantee results.
- UI components lean on Tailwind + Radix primitives; styling differences between the marketing site and admin panel are isolated with config-specific `tailwind` files.

### Testing Strategy
- There is no automated test suite yet; reliability comes from strict TypeScript types, Prisma schema validation, linting, and manual flows in staging/admin.
- Before pushing, run `bun run lint`, `bun run check`, and `bun run typecheck`; these commands are our regression gates.
- When adding risky flows (imports, submissions, background jobs), add ad-hoc scripts or seed data under `scripts/` and document manual verification steps in the PR/spec so reviewers can replay them.

### Git Workflow
- Default branch is `main` (deployed by Vercel). Create short-lived feature branches from `main`, typically named after the OpenSpec change ID (e.g., `add-hybrid-search/admin-panels`).
- Each branch should reference an approved change proposal under `openspec/changes/`; keep commits scoped/imperative so specs and code diffs stay aligned.
- Open a PR against `main` once lint/typecheck pass locally, tag reviewers, and merge via squash after approval. Run any required `openspec validate --strict` steps before requesting review.

## Domain Context
- Public experience: `app/(web)/(home)/page.tsx` surfaces featured/latest tools, while `/tools/[slug]` shows detailed metadata (pricing, gallery, taxonomy counts) built from `server/tools/payloads.ts` and Prisma eager-loading helpers.
- Taxonomy pages (`/categories`, `/collections`, `/tags`) use domain-specific queries and only count/present tools with `publishedAt <= now` so unpublished content never leaks.
- Tool submission lives at `/submit` and calls the `submitTool` server action (`actions/submit.ts`). Submissions dedupe on `websiteUrl`, enqueue `tool.submitted`, and get reviewed in the admin dashboard before being scheduled/published.
- Admin dashboard (`app/admin`) provides CRUD for tools, categories, collections, and tags with `authedProcedure` wrappers enforcing Google-authenticated staff access. Bulk scheduling emits `tool.scheduled` so jobs can generate copy, scrape assets, and notify submitters.
- AI/RAG: scripts in `scripts/` plus `docs/rag.md` describe the Gemini + Qdrant hybrid retrieval strategy that powers semantic search and future AI assistants.

## Important Constraints
- Public queries must always filter `publishedAt <= now` (enforced in `server/*/queries.ts`) so drafts and embargoed tools stay private.
- `Tool.websiteUrl` is unique and used to dedupe submissions; do not bypass this in migrations or seeds unless you are intentionally merging records.
- Admin-only mutations must go through `authedProcedure` to ensure Google-authenticated access; calling Prisma directly from client components is prohibited.
- Qdrant hybrid search enforces a score threshold (0.3 today). If the query does not meet it, fall back to Prisma keyword search to avoid empty responses.
- Inngest handlers assume assets live in S3 under a predictable prefix and will attempt cleanup on `tool.deleted`; always keep storage paths/versioning in sync when refactoring media code.
- Env vars are validated via `env.ts`; missing providers (AI keys, Qdrant, auth secrets) cause boot failures, so update `.env`/symlinks when introducing new settings.

## External Dependencies
- **Neon PostgreSQL**: primary database accessed through Prisma (`prisma/schema.prisma`).
- **Qdrant**: vector database for semantic + sparse search (`lib/vector-store.ts`, `scripts/setup-qdrant.ts`).
- **Inngest**: background job processor invoked via `app/api/inngest/route.ts` to run lifecycle functions in `functions/*.ts`.
- **AWS S3 & ScreenshotOne**: store/generated favicons and screenshots through `services/aws-s3.ts` and `lib/media` helpers.
- **Resend**: transactional email delivery from `services/resend.ts` for submission + scheduling notifications.
- **Firecrawl**: scraping service used during scheduling (`services/firecrawl.ts`) to enrich tool metadata.
- **Google/Anthropic/OpenAI via Vercel AI SDK**: used for copy generation, embeddings, and query routing (`services/openai.ts`, `docs/rag.md`).
- **NextAuth + Google OAuth**: authenticates admins through `lib/auth.ts` and protects server actions/layouts.
