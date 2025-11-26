import EmailSubmission from "~/emails/submission"
import { sendEmails } from "~/lib/email"
import { generateContent } from "~/lib/generate-content"
import { uploadFavicon, uploadScreenshot } from "~/lib/media"
import { upsertToolVector } from "~/lib/vector-store"
import { inngest } from "~/services/inngest"
import { prisma } from "~/services/prisma"

export const toolSubmitted = inngest.createFunction(
  { id: "tool.submitted", concurrency: { limit: 2 } },
  { event: "tool.submitted" },
  async ({ event, step }) => {
    const tool = await step.run("fetch-tool", async () => {
      return prisma.tool.findUniqueOrThrow({ where: { slug: event.data.slug } })
    })

    // Run content generation, screenshot, and favicon uploads in parallel
    await Promise.all([
      step.run("generate-content", async () => {
        const { tags, ...content } = await generateContent(tool)
        const normalizedTags = (tags ?? []) as string[]

        return prisma.tool.update({
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
      }),

      step.run("upload-screenshot", async () => {
        const { id, slug, websiteUrl } = tool
        const screenshotUrl = await uploadScreenshot(websiteUrl, `tools/${slug}/screenshot`)

        return prisma.tool.update({
          where: { id },
          data: { screenshotUrl },
        })
      }),

      step.run("upload-favicon", async () => {
        const { id, slug, websiteUrl } = tool
        const faviconUrl = await uploadFavicon(websiteUrl, `tools/${slug}/favicon`)

        return prisma.tool.update({
          where: { id },
          data: { faviconUrl },
        })
      }),
    ])

    // Sync to Qdrant vector store after all updates
    await step.run("sync-tool-vector", async () => {
      const latestTool = await prisma.tool.findUniqueOrThrow({
        where: { id: tool.id },
        include: {
          categories: { select: { slug: true, name: true } },
          tags: { select: { slug: true } },
        },
      })

      await upsertToolVector(latestTool)
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

    // Send submission email to user if not expedited
    if (!expedited && !featured && tool.submitterEmail) {
      await step.run("send-submission-email", async () => {
        if (!tool.submitterEmail) return

        const to = tool.submitterEmail
        const subject = `🙌 Thanks for submitting ${tool.name}!`

        return sendEmails({ to, subject, react: EmailSubmission({ tool, to, subject }) })
      })
    }
  },
)
