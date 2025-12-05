# Change: Production Inngest Workflows

## Why
- Background jobs must sync tools with external services (vector store, media, email) reliably, and today the production readiness of these workflows (logging, notifications, runtime limits) is only partially specified.
- We need clear requirements for how Inngest is configured and how lifecycle events are processed so we can harden observability and external integrations before shipping.

## What Changes
- Specify a typed Inngest client plus event dispatch helper with structured logging, and ensure the Next.js ingress route is configured for production execution limits.
- Define end-to-end workflows for tool submission, scheduling, publishing, expedited/featured requests, deletions, and link-checker cron so they consistently update downstream services (vectors, media, email) and emit durable logs.
- Add production logging expectations (step-level timings, errors), cover admin-controlled publish notifications, and report failed link-checker targets.

## Impact
- Affected specs: inngest-workflows
- Affected code: services/inngest.ts, app/api/inngest/route.ts, functions/tool-*.ts, functions/link-checker.ts, lib/logger.ts (structured logging/metrics)
