## 1. Implementation
- [] 1.1 Add `cacheStrategy` TTL + tags to Prisma listing queries for tools, categories, and collections (tools: 1h, categories/collections: 24h).
- [] 1.2 Add `$accelerate.invalidate` calls on create/update/delete of tools, categories, and collections using the matching tags.
- [] 1.3 Confirm admin or mutation flows that must bypass caching remain uncached or use `noStore` equivalents.
- [] 1.4 Validate with `openspec validate add-prisma-cache-ttl --strict` and document any manual verification steps.
