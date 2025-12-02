import { isProd } from "~/env"
import { removeS3Directory } from "~/lib/media"
import { inngestLogger } from "~/lib/logger"
import { deleteToolVector } from "~/lib/vector-store"
import { inngest } from "~/services/inngest"

const FUNCTION_ID = "tool.deleted"

export const toolDeleted = inngest.createFunction(
  { id: FUNCTION_ID },
  { event: "tool.deleted" },
  async ({ event, step }) => {
    const functionStartTime = performance.now()
    const toolSlug = event.data.slug

    try {
      inngestLogger.functionStarted(FUNCTION_ID, "tool.deleted", event.data)

      // Delete from Qdrant vector store
      await step.run("delete-tool-vector", async () => {
        const stepStartTime = performance.now()
        inngestLogger.stepStarted("delete-tool-vector", FUNCTION_ID, toolSlug)

        try {
          await deleteToolVector(event.data.id)
          const duration = performance.now() - stepStartTime
          inngestLogger.stepCompleted("delete-tool-vector", FUNCTION_ID, toolSlug, duration)
        } catch (error) {
          inngestLogger.stepError("delete-tool-vector", FUNCTION_ID, toolSlug, error)
          throw error
        }
      })

      await step.run("remove-s3-directory", async () => {
        const stepStartTime = performance.now()
        inngestLogger.stepStarted("remove-s3-directory", FUNCTION_ID, toolSlug)

        try {
          const result = isProd
            ? await removeS3Directory(`${event.data.slug}`)
            : Promise.resolve()
          const duration = performance.now() - stepStartTime
          inngestLogger.stepCompleted("remove-s3-directory", FUNCTION_ID, toolSlug, duration)
          inngestLogger.info("S3 cleanup skipped in non-production", {
            functionId: FUNCTION_ID,
            toolSlug,
            isProd,
          })
          return result
        } catch (error) {
          inngestLogger.stepError("remove-s3-directory", FUNCTION_ID, toolSlug, error)
          throw error
        }
      })

      const duration = performance.now() - functionStartTime
      inngestLogger.functionCompleted(FUNCTION_ID, "tool.deleted", event.data, duration)
    } catch (error) {
      const duration = performance.now() - functionStartTime
      inngestLogger.functionError(FUNCTION_ID, "tool.deleted", event.data, error, duration)
      throw error
    }
  },
)
