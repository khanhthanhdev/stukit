## ADDED Requirements
### Requirement: Inngest Service Configuration
The system SHALL expose a typed Inngest client for tool lifecycle events and serve all functions via the Next.js inngest route using production runtime settings.

#### Scenario: Serving typed inngest endpoints
- **WHEN** the `/api/inngest` endpoint is invoked by Inngest
- **THEN** it uses the Node.js runtime with forced dynamic rendering and a 300-second max duration while registering the tool lifecycle and cron functions with the typed client.

#### Scenario: Logging event dispatch
- **WHEN** `sendInngestEvent` dispatches a `tool.*` event
- **THEN** the system logs the event name, tool id/slug, success or failure, and duration using structured logging before returning the send result or surfacing the error.

### Requirement: Tool Submission Workflow
The system SHALL process `tool.submitted` events with concurrency limited to two and orchestrate content/media generation, vector sync, and notifications with step-level logging.

#### Scenario: Handling tool submission
- **WHEN** a `tool.submitted` event arrives with tool `id` and `slug`
- **THEN** the workflow fetches the tool, runs content generation plus screenshot and favicon uploads in parallel (persisting updates), syncs tool and alternative vectors, waits up to 30 minutes for expedited/featured follow-up events, and if neither arrives sends a submission confirmation email to the submitter; all steps record start/end and duration logs, and failures are emitted as errors.

### Requirement: Tool Scheduling Workflow
The system SHALL process `tool.scheduled` events with concurrency limited to two, updating content, media, socials, vectors, and notifications while ensuring database connections are closed.

#### Scenario: Handling tool scheduling
- **WHEN** a `tool.scheduled` event arrives
- **THEN** the workflow fetches the tool, in parallel regenerates content, uploads favicon and screenshot assets, and enriches socials; it then syncs tool and alternative vectors, disconnects from Prisma, and emails the submitter about the scheduled publish date (if an email exists), logging step timings and errors throughout.

### Requirement: Tool Publication Notification
The system SHALL notify submitters when a tool is published and capture structured logs for the publish workflow.

#### Scenario: Handling tool publication
- **WHEN** a `tool.published` event arrives
- **THEN** the workflow fetches the tool, respects an admin toggle to send or skip the submitter email (sending only when enabled and an email exists), and logs function start/end plus step timings and errors.

### Requirement: Priority Listing Workflows
The system SHALL process `tool.expedited` and `tool.featured` events by fetching the tool and sending both admin and submitter notifications with structured logging.

#### Scenario: Handling expedited or featured requests
- **WHEN** a `tool.expedited` or `tool.featured` event arrives
- **THEN** the workflow fetches the tool and delivers emails to the site admin and, when available, the submitter, logging start/end and duration for each step and surfacing any failures.

### Requirement: Tool Deletion Workflow
The system SHALL process `tool.deleted` events by removing external artifacts while guarding destructive operations in non-production environments.

#### Scenario: Handling tool deletion
- **WHEN** a `tool.deleted` event arrives
- **THEN** the workflow deletes tool and alternative vectors and removes the tool’s S3 directory only in production (logging skips otherwise), emitting step-level duration logs and errors.

### Requirement: Link Health Check Cron
The system SHALL run a weekly Inngest cron job to validate published tool links in batches and record a summary.

#### Scenario: Running link checker
- **WHEN** the Sunday 03:00 cron triggers
- **THEN** the workflow batches published tools (e.g., 50 per batch), validates their URLs, updates `isBroken` and `lastCheckedAt`, disconnects from the database, and logs total checked, newly broken, fixed counts, step durations, and the list of tools whose links failed validation when any failures occur.

### Requirement: Operational Logging and Safety
The system SHALL emit structured JSON logs in production for function start/end, step start/end, durations, and errors across all Inngest workflows, and ensure resources are cleaned up safely.

#### Scenario: Logging and resource safety
- **WHEN** any Inngest function executes
- **THEN** it records structured logs for function lifecycle and each step (including duration), propagates errors to Inngest, closes database connections when work completes, and respects environment guards for destructive actions.
