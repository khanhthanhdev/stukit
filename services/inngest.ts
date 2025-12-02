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

// Wrapper for inngest.send() with logging
export const sendInngestEvent = async <T extends keyof Events>(
  event: { name: T; data: Events[T]["data"] },
): Promise<ReturnType<typeof inngest.send>> => {
  const startTime = performance.now()

  try {
    inngestLogger.eventTriggered(event.name, event.data)

    const result = await inngest.send(event)

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
