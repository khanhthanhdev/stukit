## ADDED Requirements

### Requirement: Cache listing queries with TTL
The system SHALL apply Prisma Accelerate `cacheStrategy` to read-heavy listing queries with defined TTLs and tags so repeated requests are served from cache when data is unchanged.

#### Scenario: Tools list cached
- **WHEN** the public tools listing is requested via Prisma
- **THEN** the query uses `cacheStrategy` with `ttl: 3600` seconds and tag `tools_list`

#### Scenario: Categories list cached
- **WHEN** the public categories listing is requested via Prisma
- **THEN** the query uses `cacheStrategy` with `ttl: 7200` seconds and tag `categories_list`

#### Scenario: Collections list cached
- **WHEN** the public collections listing is requested via Prisma
- **THEN** the query uses `cacheStrategy` with `ttl: 7200` seconds and tag `collections_list`

### Requirement: Invalidate cached listings after mutations
Cached listing data MUST be refreshed whenever underlying entities change.

#### Scenario: Tool change invalidates tools listing cache
- **WHEN** a tool is created, updated, or deleted
- **THEN** `$accelerate.invalidate` is called with the `tools_list` tag so subsequent requests fetch fresh data

#### Scenario: Category change invalidates categories listing cache
- **WHEN** a category is created, updated, or deleted
- **THEN** `$accelerate.invalidate` is called with the `categories_list` tag so subsequent requests fetch fresh data

#### Scenario: Collection change invalidates collections listing cache
- **WHEN** a collection is created, updated, or deleted
- **THEN** `$accelerate.invalidate` is called with the `collections_list` tag so subsequent requests fetch fresh data
