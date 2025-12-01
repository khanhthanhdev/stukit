import { EventSchemas, Inngest } from "inngest"
import { config } from "~/config"

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
