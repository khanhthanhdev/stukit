# Code Quick Tour

- **Stack**: Next.js 15 App Router on Bun/TypeScript, Prisma + Postgres, Tailwind, and assorted platform SDKs (AWS S3, Resend, OpenAI/Anthropic/Google via `ai`, Inngest jobs).
- **Entry**: `app/layout.tsx` sets shared providers; `app/providers.tsx` wires client-wide context. Grouped routes live under `app/(web)` (marketing/public), `app/admin` (internal dashboard), and `app/api` (route handlers).
- **UI**: Reusable UI lives in `components/`; MDX support via `mdx-components.tsx`. Styling is split into `tailwind.web.config.ts` and `tailwind.admin.config.ts`.
- **Data**: `prisma/schema.prisma` defines Tool, Category, Collection, and Tag models (citext columns, many-to-many relations). Prisma client singleton is exported from `services/prisma.ts`. Generated client artifacts land in `node_modules/.prisma/client`.
- **Server logic**: `server/` holds server actions and loaders grouped by domain (`server/tools`, `server/categories`, etc.). `functions/` contains Inngest job handlers for tool lifecycle events.
- **Integrations**: `services/` wraps third parties (`aws-s3.ts`, `resend.ts`, `openai.ts`, `firecrawl.ts`, `inngest.ts`).
- **Config/utilities**: `env.ts` validates environment, `config/` stores app-level config, `utils/` and `lib/` hold helpers (formatting, schemas, fetchers).
- **Data flow**: Pages/actions call domain helpers in `server/`, which use Prisma from `services/prisma.ts` and reuse helpers from `lib/`/`utils/`. Background tasks in `functions/` react to events and hit the same services.
- **Common commands**: `bun run dev` (app), `bun run build` (prod build), `bun run db:generate` (Prisma client), `bun run db:push` (sync schema), `bun run lint` / `format` / `check` (Biome).

For local setup: copy `.env.example` → `.env` with `DATABASE_URL`/`DATABASE_URL_UNPOOLED` and other service keys, run `bun install`, `bun run db:push`, then `bun run dev`.
