import { validateLink } from "~/lib/link-validator"
import { inngest } from "~/services/inngest"
import { prisma } from "~/services/prisma"

const BATCH_SIZE = 50

export const linkChecker = inngest.createFunction(
  { id: "link.checker", concurrency: { limit: 1 } },
  { cron: "0 3 * * 0" }, // Run every Sunday at 3 AM
  async ({ step }) => {
    const tools = await step.run("fetch-published-tools", async () => {
      return prisma.tool.findMany({
        where: { publishedAt: { lte: new Date() } },
        select: { id: true, websiteUrl: true, isBroken: true },
      })
    })

    // Process tools in batches to avoid overwhelming the system
    const batches = []
    for (let i = 0; i < tools.length; i += BATCH_SIZE) {
      batches.push(tools.slice(i, i + BATCH_SIZE))
    }

    let brokenCount = 0
    let fixedCount = 0

    for (const [index, batch] of batches.entries()) {
      const results = await step.run(`check-batch-${index}`, async () => {
        const checks = await Promise.all(
          batch.map(async tool => {
            const result = await validateLink(tool.websiteUrl)
            return {
              id: tool.id,
              wasBroken: tool.isBroken,
              isNowBroken: !result.isValid,
            }
          }),
        )
        return checks
      })

      await step.run(`update-batch-${index}`, async () => {
        const updates = results.map(result => {
          if (result.wasBroken && !result.isNowBroken) {
            fixedCount++
          } else if (!result.wasBroken && result.isNowBroken) {
            brokenCount++
          }

          return prisma.tool.update({
            where: { id: result.id },
            data: {
              isBroken: result.isNowBroken,
              lastCheckedAt: new Date(),
            },
          })
        })

        return Promise.all(updates)
      })
    }

    await step.run("disconnect-from-db", async () => {
      return prisma.$disconnect()
    })

    return {
      totalChecked: tools.length,
      newlyBroken: brokenCount,
      fixed: fixedCount,
    }
  },
)
