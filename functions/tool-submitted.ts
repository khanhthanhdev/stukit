import EmailSubmission from "~/emails/submission"
import { sendEmails } from "~/lib/email"
import { generateContent } from "~/lib/generate-content"
import { uploadFavicon, uploadScreenshot } from "~/lib/media"
import { inngestLogger } from "~/lib/logger"
import { upsertToolVector, upsertAlternativeVector } from "~/lib/vector-store"
import { inngest } from "~/services/inngest"
import { prisma } from "~/services/prisma"

const FUNCTION_ID = "tool.submitted"

export const toolSubmitted = inngest.createFunction(
  { id: FUNCTION_ID, concurrency: { limit: 2 } },
  { event: "tool.submitted" },
  async ({ event, step }) => {
    const functionStartTime = performance.now()
    const toolSlug = event.data.slug

    try {
      inngestLogger.functionStarted(FUNCTION_ID, "tool.submitted", event.data)

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

      // Run content generation, screenshot, and favicon uploads in parallel
      await Promise.all([
        step.run("generate-content", async () => {
          const stepStartTime = performance.now()
          inngestLogger.stepStarted("generate-content", FUNCTION_ID, toolSlug)

          try {
            const { tags, ...content } = await generateContent(tool)
            const normalizedTags = (tags ?? []) as string[]

            const result = await prisma.tool.update({
              where: { id: tool.id },
              data: {
                ...content,
                tags: {
                  connectOrCreate: normalizedTags.map(tagSlug => ({
                    where: { slug: tagSlug },
                    create: { name: tagSlug, slug: tagSlug },
                  })),
                },
              },
            })

            const duration = performance.now() - stepStartTime
            inngestLogger.stepCompleted("generate-content", FUNCTION_ID, toolSlug, duration)
            return result
          } catch (error) {
            inngestLogger.stepError("generate-content", FUNCTION_ID, toolSlug, error)
            throw error
          }
        }),

        step.run("upload-screenshot", async () => {
          const stepStartTime = performance.now()
          inngestLogger.stepStarted("upload-screenshot", FUNCTION_ID, toolSlug)

          try {
            const { id, slug, websiteUrl } = tool
            const screenshotUrl = await uploadScreenshot(
              websiteUrl,
              `tools/${slug}/screenshot`,
            )

            const result = await prisma.tool.update({
              where: { id },
              data: { screenshotUrl },
            })

            const duration = performance.now() - stepStartTime
            inngestLogger.stepCompleted("upload-screenshot", FUNCTION_ID, toolSlug, duration)
            return result
          } catch (error) {
            inngestLogger.stepError("upload-screenshot", FUNCTION_ID, toolSlug, error)
            throw error
          }
        }),

        step.run("upload-favicon", async () => {
          const stepStartTime = performance.now()
          inngestLogger.stepStarted("upload-favicon", FUNCTION_ID, toolSlug)

          try {
            const { id, slug, websiteUrl } = tool
            const faviconUrl = await uploadFavicon(websiteUrl, `tools/${slug}/favicon`)

            const result = await prisma.tool.update({
              where: { id },
              data: { faviconUrl },
            })

            const duration = performance.now() - stepStartTime
            inngestLogger.stepCompleted("upload-favicon", FUNCTION_ID, toolSlug, duration)
            return result
          } catch (error) {
            inngestLogger.stepError("upload-favicon", FUNCTION_ID, toolSlug, error)
            throw error
          }
        }),
      ])

      // Sync to Qdrant vector store after all updates
      await step.run("sync-tool-vector", async () => {
        const stepStartTime = performance.now()
        inngestLogger.stepStarted("sync-tool-vector", FUNCTION_ID, toolSlug)

        try {
          const latestTool = await prisma.tool.findUniqueOrThrow({
            where: { id: tool.id },
            include: {
              categories: { select: { slug: true, name: true } },
              tags: { select: { slug: true } },
            },
          })

          await upsertToolVector(latestTool)

          const duration = performance.now() - stepStartTime
          inngestLogger.stepCompleted("sync-tool-vector", FUNCTION_ID, toolSlug, duration)
        } catch (error) {
          inngestLogger.stepError("sync-tool-vector", FUNCTION_ID, toolSlug, error)
          throw error
        }
      })

      // Also index as an alternative for related tools recommendations
      await step.run("sync-alternative-vector", async () => {
        const stepStartTime = performance.now()
        inngestLogger.stepStarted("sync-alternative-vector", FUNCTION_ID, toolSlug)

        try {
          const latestTool = await prisma.tool.findUniqueOrThrow({
            where: { id: tool.id },
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
            },
          })

          await upsertAlternativeVector({
            id: latestTool.id,
            slug: latestTool.slug,
            name: latestTool.name,
            description: latestTool.description,
            relatedToolIds: [],
          })

          const duration = performance.now() - stepStartTime
          inngestLogger.stepCompleted("sync-alternative-vector", FUNCTION_ID, toolSlug, duration)
        } catch (error) {
          inngestLogger.stepError("sync-alternative-vector", FUNCTION_ID, toolSlug, error)
          throw error
        }
      })

      // Wait for 30 minutes for expedited or featured event
      const [expedited, featured] = await Promise.all([
        step.waitForEvent("wait-for-expedited", {
          event: "tool.expedited",
          timeout: "30m",
          match: "data.slug",
        }),

        step.waitForEvent("wait-for-featured", {
          event: "tool.featured",
          timeout: "30m",
          match: "data.slug",
        }),
      ])

      inngestLogger.waitForEventResult(
        "tool.expedited",
        FUNCTION_ID,
        toolSlug,
        !!expedited,
        !expedited,
      )
      inngestLogger.waitForEventResult(
        "tool.featured",
        FUNCTION_ID,
        toolSlug,
        !!featured,
        !featured,
      )

      // Send submission email to user if not expedited
      if (!expedited && !featured && tool.submitterEmail) {
        await step.run("send-submission-email", async () => {
          const stepStartTime = performance.now()
          inngestLogger.stepStarted("send-submission-email", FUNCTION_ID, toolSlug)

          try {
            if (!tool.submitterEmail) return

            const to = tool.submitterEmail
            const subject = `🙌 Thanks for submitting ${tool.name}!`

            const result = await sendEmails({
              to,
              subject,
              react: EmailSubmission({ tool, to, subject }),
            })

            const duration = performance.now() - stepStartTime
            inngestLogger.stepCompleted(
              "send-submission-email",
              FUNCTION_ID,
              toolSlug,
              duration,
            )
            return result
          } catch (error) {
            inngestLogger.stepError("send-submission-email", FUNCTION_ID, toolSlug, error)
            throw error
          }
        })
      }

      const duration = performance.now() - functionStartTime
      inngestLogger.functionCompleted(FUNCTION_ID, "tool.submitted", event.data, duration)
    } catch (error) {
      const duration = performance.now() - functionStartTime
      inngestLogger.functionError(FUNCTION_ID, "tool.submitted", event.data, error, duration)
      throw error
    }
  },
)
