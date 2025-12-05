## Context
- Inngest handles tool lifecycle and cron workflows (submission, scheduling, expedited/featured, publish, delete, link-checker) that touch Prisma, vector storage (Qdrant), media (S3/screenshots), and email (Resend).
- The client is typed via `EventSchemas`, but production expectations for runtime settings, logging shape, and notification coverage (e.g., publish emails) are not formally specified.
- Logging uses `lib/logger` with JSON output in production, and handlers manually log step timings; we need consistent structure to make operational debugging reliable.

## Goals / Non-Goals
- Goals: define production-ready Inngest configuration, structured logging for all workflows, and end-to-end steps for syncing with external services across tool lifecycle events and cron link checks.
- Goals: ensure safety guards (DB disconnects, prod-only destructive cleanup) and notification coverage (e.g., publish emails).
- Non-Goals: introduce a new job runner or observability stack; change business rules outside Inngest workflows; redesign email templates.

## Decisions
- Use a single Inngest client with typed `tool.*` events and a `sendInngestEvent` helper that logs dispatch success/failure with duration and tool metadata.
- Expose `/api/inngest` with Node.js runtime, forced dynamic, and 300s max duration; register lifecycle and cron functions there.
- Keep concurrency conservative (1–2) to protect shared resources; batch where necessary (link-checker).
- Standardize logging to JSON in production with function start/end, step start/end, durations, and error payloads; ensure timeouts/errors propagate to Inngest for retries.
- Workflows sync external systems as steps: content/social/media updates, vector upserts/deletes, email notifications, and S3 cleanup guarded by environment checks.
- Close Prisma connections at workflow end to avoid leaked handles; skip destructive storage cleanup outside production to keep developer environments safe.

## Risks / Trade-offs
- Long-running steps (scraping, vector writes) could approach function time limits; parallelization helps but increases resource spikes.
- Logging every step may increase log volume; mitigated by structured JSON and concise payloads.
- Email and external API dependencies can fail; retries and clear error logs are required for triage.

## Migration Plan
- No schema migrations expected. Roll out by updating Inngest config/route, instrumenting workflows per spec, and validating in staging before production.
- Verify environment variables for external services (Resend, S3, Qdrant) are present in deployment targets.

## Open Questions
- Should publish notifications include additional recipients (e.g., admin digest) or just the submitter? **Answered:** submitter email is controlled by an admin toggle; no extra recipients required.
- Do we need alerting thresholds for link-checker results (e.g., % broken) in logging/monitoring? **Answered:** on failure, log the list of tools whose link checks failed; no additional thresholds specified.
