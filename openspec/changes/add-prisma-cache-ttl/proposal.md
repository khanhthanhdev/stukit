# Change: Add Prisma cache TTL for read-heavy listings

## Why
- Public listing queries (tools, categories, collections) are read-heavy and the underlying data changes infrequently, so we can reduce latency and database load with Prisma Accelerate caching.
- The current code does not set `cacheStrategy`, so every request hits the database even when data is unchanged.

## What Changes
- Add `cacheStrategy` TTLs and cache tags to the Prisma listing queries for tools, categories, and collections (1h for tools, 2h for categories/collections).
- Introduce on-demand cache invalidation via `$accelerate.invalidate` using the same tags whenever these resources are created, updated, or deleted.
- Keep cache tags scoped per list surface to avoid cross-contamination between entity types.

## Impact
- Affected specs: data-caching
- Affected code: services/prisma.ts, server/tools/queries.ts, server/categories/queries.ts, server/collections/queries.ts, relevant mutation paths for invalidation
