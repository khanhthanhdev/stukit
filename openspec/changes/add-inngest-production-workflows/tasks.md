## 1. Inngest configuration and logging
- [x] 1.1 Update Inngest client setup and route to use typed schemas, production runtime settings, and structured logging on event dispatch.
- [x] 1.2 Harmonize logging utilities for step-level timings and error payloads so production logs are JSON-structured.

## 2. Workflow implementations
- [x] 2.1 Align `tool.submitted` with spec: parallel content/media, vector sync, wait-for expedited/featured, conditional submission email.
- [x] 2.2 Align `tool.scheduled` with spec: socials/content/media updates, vector sync, DB disconnect, schedule email.
- [x] 2.3 Implement `tool.published` notification flow and ensure it logs start/end with tool metadata.
- [x] 2.4 Ensure expedited/featured workflows deliver submitter/admin emails and use shared logging patterns.
- [x] 2.5 Ensure deletion and link-checker workflows respect production guards (e.g., S3 cleanup) and emit summary metrics.

## 3. Validation
- [x] 3.1 Run `openspec validate add-inngest-production-workflows --strict`.
- [ ] 3.2 Run lint/typecheck commands (e.g., `bun run lint`, `bun run check`) and document manual verification of key workflows (blocked: biome errors in existing files and permission-denied paths).
