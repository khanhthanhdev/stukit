import { H5 } from "~/components/common/heading"
import { Stack } from "~/components/common/stack"
import { Badge } from "~/components/web/ui/badge"
import { Card } from "~/components/web/ui/card"
import { config } from "~/config"
import { getQueueMetrics } from "~/lib/products"
import { isToolPublished } from "~/lib/tools"
import type { ToolOne } from "~/server/tools/payloads"
import { countUpcomingTools } from "~/server/tools/queries"

type SubmitProductsProps = {
  tool: ToolOne
}

export const SubmitProducts = async ({ tool }: SubmitProductsProps) => {
  const queueLength = await countUpcomingTools({})
  const metrics = getQueueMetrics(queueLength)
  const isPublished = isToolPublished(tool)

  const intro = isPublished
    ? `${tool.name} is already live on ${config.site.name}. We'll review any updates you requested and keep it in our queue.`
    : `${tool.name} is queued for review. One of our admins will publish it as soon as it clears moderation.`

  return (
    <Card hover={false} className="max-w-2xl gap-4 text-left">
      <Badge className="w-fit">Queue status</Badge>

      <Stack direction="column" size="sm" className="text-base text-pretty text-foreground/75">
        <H5 as="p" className="text-base font-semibold">
          What happens next?
        </H5>
        <p>{intro}</p>
        <p className="text-sm text-foreground/60">
          We manually publish about {metrics.postingRate} tools per week through an admin review
          flow that runs on a scheduled cron job.
        </p>
      </Stack>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-foreground/10 bg-foreground/[2.5%] p-4">
          <dt className="text-xs uppercase tracking-wider text-foreground/50">Tools ahead</dt>
          <dd className="text-2xl font-semibold">
            {metrics.queueLength}
            <span className="text-base font-normal text-foreground/50 ml-1">in queue</span>
          </dd>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/[2.5%] p-4">
          <dt className="text-xs uppercase tracking-wider text-foreground/50">Publishing rate</dt>
          <dd className="text-2xl font-semibold">
            {metrics.postingRate}
            <span className="text-base font-normal text-foreground/50 ml-1">per week</span>
          </dd>
        </div>

        <div className="rounded-lg border border-foreground/10 bg-foreground/[2.5%] p-4">
          <dt className="text-xs uppercase tracking-wider text-foreground/50">Estimated wait</dt>
          <dd className="text-2xl font-semibold">
            {metrics.weeks === 0 ? "<1" : `~${metrics.weeks}`}
            <span className="text-base font-normal text-foreground/50 ml-1">
              {metrics.weeks === 1 ? "week" : "weeks"}
            </span>
          </dd>
          <p className="mt-1 text-xs text-foreground/60">({metrics.eta})</p>
        </div>
      </dl>

      <p className="text-sm text-foreground/60">
        Sit tight&mdash;our cron-driven moderation pass will pick up every pending submission in
        order. We&apos;ll email you as soon as {tool.name} is scheduled.
      </p>
    </Card>
  )
}
