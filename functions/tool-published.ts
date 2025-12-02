import { inngestLogger } from "~/lib/logger"
import { inngest } from "~/services/inngest"
import { prisma } from "~/services/prisma"

const FUNCTION_ID = "tool.published"

export const toolPublished = inngest.createFunction(
  { id: FUNCTION_ID },
  { event: "tool.published" },
  async ({ event, step }) => {
    const functionStartTime = performance.now()
    const toolSlug = event.data.slug

    try {
      inngestLogger.functionStarted(FUNCTION_ID, "tool.published", event.data)

      const tool = await step.run("fetch-tool", async () => {
        const stepStartTime = performance.now()
        inngestLogger.stepStarted("fetch-tool", FUNCTION_ID, toolSlug)

        try {
          const result = await prisma.tool.findUniqueOrThrow({
            where: { slug: event.data.slug },
          })
          const duration = performance.now() - stepStartTime
          inngestLogger.stepCompleted("fetch-tool", FUNCTION_ID, toolSlug, duration)
          return result
        } catch (error) {
          inngestLogger.stepError("fetch-tool", FUNCTION_ID, toolSlug, error)
          throw error
        }
      })

      // TODO: send email to the submitter
      inngestLogger.info("Tool published - email notification not yet implemented", {
        functionId: FUNCTION_ID,
        toolSlug,
        toolId: tool.id,
      })

      const duration = performance.now() - functionStartTime
      inngestLogger.functionCompleted(FUNCTION_ID, "tool.published", event.data, duration)
    } catch (error) {
      const duration = performance.now() - functionStartTime
      inngestLogger.functionError(FUNCTION_ID, "tool.published", event.data, error, duration)
      throw error
    }
  },
)
