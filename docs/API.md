# API & Data Contracts

## Conventions
- **Server actions**: Implemented with `zsa`/`zsa-react` or `authedProcedure`. Inputs validated via Zod schemas in `app/admin/*/_lib/validations.ts` and `server/schemas.ts`. Errors throw typed exceptions surfaced to UI toasts.
- **Database**: Prisma client singleton from `services/prisma.ts`; public-facing queries always filter `publishedAt <= now` unless explicitly bypassed with auth.
- **Events**: Inngest is the integration point for async work; HTTP entry at `app/api/inngest/route.ts` exposes `GET/POST/PUT`.

## Public Server Actions
- `submitTool` (`actions/submit.ts`)
  ```ts
  // Input schema: submitToolSchema (server/schemas.ts)
  {
    name: string
    websiteUrl: string // URL
    submitterName: string
    submitterEmail: string
  }
  // Behavior: dedupe by websiteUrl, generate unique slug, create tool,
  // emit Inngest event "tool.submitted". Returns created or existing tool row.
  ```

## Admin Server Actions (auth required via authedProcedure)
- **Tools** (`app/admin/tools/_lib/actions.ts`)
  - `createTool` / `updateTool` / `updateTools` / `deleteTools`
  - `scheduleTools` (bulk set `publishedAt` and emit `tool.scheduled`)
  - `reuploadToolAssets` (refresh favicon/screenshot via `lib/media`)
  - Input schema: `toolSchema` (`app/admin/tools/_lib/validations.ts`) plus IDs/slug params.
- **Categories** (`app/admin/categories/_lib/actions.ts`)
  - `createCategory`, `updateCategory`, `updateCategories`, `deleteCategories`
  - Schema: `categorySchema`.
- **Collections** (`app/admin/collections/_lib/actions.ts`)
  - `createCollection`, `updateCollection`, `updateCollections`, `deleteCollections`
  - Schema: `collectionSchema`.
- **Tags** (`app/admin/tags/_lib/actions.ts`)
  - `createTag`, `updateTag`, `updateTags`, `deleteTags`
  - Schema: `tagSchema`.
- All admin actions revalidate relevant `/admin/*` paths to refresh caches.

## Query Helpers (server-only)
- **Public site**: `server/tools/queries.ts` exposes `searchTools`, `findTools`, `findToolSlugs`, `findUniqueTool`, `findFirstTool`, `countTools`, `countUpcomingTools`. Default filters: published items only; includes `toolManyPayload` or `toolOnePayload` relations.
- **Taxonomies**: `server/{categories,collections,tags}/queries.ts` provide list + slug lookups with published tool gating. Payload files include `_count` of published tools.
- **Admin tables**: `app/admin/*/_lib/queries.ts` give paginated lists with sorting/date filters and basic select payloads.

## Events & Background Jobs (Inngest)
- HTTP endpoint: `app/api/inngest/route.ts` registers:
  - `tool.submitted` → `functions/tool-submitted.ts` (dedupe, wait for expedite/feature, email submitter unless expedited/featured)
  - `tool.scheduled` → `functions/tool-scheduled.ts` (AI content generation, S3 favicon/screenshot uploads, social scraping, submitter email)
  - `tool.published` → `functions/tool-published.ts` (currently TODO)
  - `tool.expedited` → `functions/tool-expedited.ts` (admin + submitter emails)
  - `tool.featured` → `functions/tool-featured.ts` (admin + submitter emails)
  - `tool.deleted` → `functions/tool-deleted.ts` (prunes S3 directory in prod)
- Emitters: `actions/submit.ts` (submitted), `app/admin/tools/_lib/actions.ts` (scheduled/deleted), and `functions/tool-submitted.ts` (waits for expedite/feature events).

## Data Shapes (Prisma)
- Tool fields: see `prisma/schema.prisma` (`name`, `slug`, `tagline`, `description`, `content`, `websiteUrl`, `affiliateUrl`, `faviconUrl`, `screenshotUrl`, `pricing`, `socials: Json`, `isFeatured`, `xHandle`, `submitterName`, `submitterEmail`, `publishedAt`, timestamps) with many-to-many relations to Category/Collection/Tag.
- Payload helpers:
  - `server/tools/payloads.ts`: `toolOnePayload` includes categories/collections/tags; `toolManyPayload` includes collections.
  - `server/{categories,collections,tags}/payloads.ts`: `_count` of published tools for badges.
