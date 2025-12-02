import { EventSchemas, Inngest } from "inngest"
import { config } from "~/config"
import { inngestLogger } from "~/lib/logger"

type ToolEventData = { id: string; slug: string }

type Events = {
  "tool.submitted": { data: ToolEventData }
  "tool.expedited": { data: ToolEventData }
  "tool.featured": { data: ToolEventData }
  "tool.scheduled": { data: ToolEventData }
  "tool.published": { data: ToolEventData }
  "tool.deleted": { data: ToolEventData }
}

export const inngest = new Inngest({
  id: config.site.name,
  schemas: new EventSchemas().fromRecord<Events>(),
})

// Strongly-typed wrapper for inngest.send() with logging
export const sendInngestEvent = async <T extends keyof Events>(event: {
  name: T
  data: Events[T]["data"]
}) => {
  const startTime = performance.now()

  try {
    inngestLogger.eventTriggered(event.name, event.data)

    // Cast is safe because Events is exactly the schema used to configure Inngest
    const result = await inngest.send(event as any)

    const duration = performance.now() - startTime
    inngestLogger.info(`Event sent successfully: ${event.name}`, {
      event: event.name,
      toolId: event.data.id,
      toolSlug: event.data.slug,
      durationMs: duration.toFixed(2),
    })

    return result
  } catch (error) {
    const duration = performance.now() - startTime
    inngestLogger.error(`Failed to send event: ${event.name}`, {
      event: event.name,
      toolId: event.data.id,
      toolSlug: event.data.slug,
      durationMs: duration.toFixed(2),
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}
