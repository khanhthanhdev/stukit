"use server"

import "server-only"
import { slugify } from "@curiousleaf/utils"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { toolSchema } from "~/app/admin/tools/_lib/validations"
import { generateContent } from "~/lib/generate-content"
import { logger } from "~/lib/logger"
import { uploadFavicon, uploadScreenshot } from "~/lib/media"
import { authedProcedure } from "~/lib/safe-actions"
import { upsertToolVector } from "~/lib/vector-store"
import { inngest } from "~/services/inngest"
import { prisma } from "~/services/prisma"

const log = logger.action

export const createTool = authedProcedure
  .createServerAction()
  .input(toolSchema)
  .handler(async ({ input: { categories, collections, tags, ...input } }) => {
    const tool = await prisma.tool.create({
      data: {
        ...input,
        slug: input.slug || slugify(input.name),

        // Relations
        categories: { connect: categories?.map(id => ({ id })) },
        collections: { connect: collections?.map(id => ({ id })) },
        tags: { connect: tags?.map(id => ({ id })) },
      },
    })

    revalidatePath("/admin/tools")

    // Send an event to the Inngest pipeline
    if (tool.publishedAt) {
      await inngest.send({ name: "tool.scheduled", data: { slug: tool.slug } })
    }

    return tool
  })

export const updateTool = authedProcedure
  .createServerAction()
  .input(toolSchema.extend({ id: z.string() }))
  .handler(async ({ input: { id, categories, collections, tags, ...input } }) => {
    const previous = await prisma.tool.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true },
    })

    const tool = await prisma.tool.update({
      where: { id },
      data: {
        ...input,

        // Relations
        categories: { set: categories?.map(id => ({ id })) },
        collections: { set: collections?.map(id => ({ id })) },
        tags: { set: tags?.map(id => ({ id })) },
      },
    })

    revalidatePath("/admin/tools")
    revalidatePath(`/admin/tools/${tool.slug}`)

    if (!previous.publishedAt && tool.publishedAt) {
      await inngest.send({ name: "tool.scheduled", data: { slug: tool.slug } })
    }

    return tool
  })

export const updateTools = authedProcedure
  .createServerAction()
  .input(z.object({ ids: z.array(z.string()), data: toolSchema.partial() }))
  .handler(async ({ input: { ids, data } }) => {
    await prisma.tool.updateMany({
      where: { id: { in: ids } },
      data,
    })

    revalidatePath("/admin/tools")

    return true
  })

export const deleteTools = authedProcedure
  .createServerAction()
  .input(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input: { ids } }) => {
    const tools = await prisma.tool.findMany({
      where: { id: { in: ids } },
      select: { slug: true },
    })

    await prisma.tool.deleteMany({
      where: { id: { in: ids } },
    })

    revalidatePath("/admin/tools")

    // Send an event to the Inngest pipeline
    for (const tool of tools) {
      await inngest.send({ name: "tool.deleted", data: { slug: tool.slug } })
    }

    return true
  })

export const scheduleTools = authedProcedure
  .createServerAction()
  .input(z.object({ ids: z.array(z.string()), publishedAt: z.date() }))
  .handler(async ({ input: { ids, publishedAt } }) => {
    const tools = await prisma.tool.findMany({
      where: { id: { in: ids } },
      select: { slug: true },
    })

    await prisma.tool.updateMany({
      where: { id: { in: ids } },
      data: { publishedAt },
    })

    revalidatePath("/admin/tools")

    // Send an event to the Inngest pipeline
    for (const tool of tools) {
      await inngest.send({ name: "tool.scheduled", data: { slug: tool.slug } })
    }

    return true
  })

export const reuploadToolAssets = authedProcedure
  .createServerAction()
  .input(z.object({ id: z.string() }))
  .handler(async ({ input: { id } }) => {
    const tool = await prisma.tool.findUniqueOrThrow({ where: { id } })

    const [faviconUrl, screenshotUrl] = await Promise.all([
      uploadFavicon(tool.websiteUrl, `tools/${tool.slug}/favicon`),
      uploadScreenshot(tool.websiteUrl, `tools/${tool.slug}/screenshot`),
    ])

    await prisma.tool.update({
      where: { id: tool.id },
      data: { faviconUrl, screenshotUrl },
    })
  })

const processToolPipeline = async (toolId: string) => {
  log.info(`Starting tool pipeline for ID: ${toolId}`)
  const tool = await prisma.tool.findUniqueOrThrow({ where: { id: toolId } })
  log.info(`Processing tool: ${tool.name}`, { slug: tool.slug, url: tool.websiteUrl })

  try {
    // Run content generation, screenshot, and favicon uploads in parallel
    await Promise.all([
      (async () => {
        log.debug(`[${tool.slug}] Starting content generation`)
        const { tags, ...content } = await generateContent(tool)
        const normalizedTags = (tags ?? []) as string[]
        log.debug(`[${tool.slug}] Content generated, updating database`)

        await prisma.tool.update({
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
        log.info(`[${tool.slug}] Content saved successfully`)
      })(),

      (async () => {
        log.debug(`[${tool.slug}] Starting screenshot upload`)
        const screenshotUrl = await uploadScreenshot(
          tool.websiteUrl,
          `tools/${tool.slug}/screenshot`,
        )
        await prisma.tool.update({
          where: { id: tool.id },
          data: { screenshotUrl },
        })
        log.info(`[${tool.slug}] Screenshot uploaded: ${screenshotUrl}`)
      })(),

      (async () => {
        log.debug(`[${tool.slug}] Starting favicon upload`)
        const faviconUrl = await uploadFavicon(tool.websiteUrl, `tools/${tool.slug}/favicon`)
        await prisma.tool.update({
          where: { id: tool.id },
          data: { faviconUrl },
        })
        log.info(`[${tool.slug}] Favicon uploaded: ${faviconUrl}`)
      })(),
    ])

    // Sync to Qdrant vector store
    log.debug(`[${tool.slug}] Syncing to vector store`)
    const latestTool = await prisma.tool.findUniqueOrThrow({
      where: { id: tool.id },
      include: {
        categories: { select: { slug: true, name: true } },
        tags: { select: { slug: true } },
      },
    })

    await upsertToolVector(latestTool)
    log.info(`[${tool.slug}] Pipeline completed successfully`)
  } catch (error) {
    log.error(`[${tool.slug}] Pipeline failed`, { error })
    throw error
  }
}

export const processTools = authedProcedure
  .createServerAction()
  .input(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input: { ids } }) => {
    log.info("Process tools requested", { count: ids.length, ids })

    const tools = await prisma.tool.findMany({
      where: { id: { in: ids } },
      select: { slug: true, id: true },
    })

    log.info(`Found ${tools.length} tools to process`, { slugs: tools.map(t => t.slug) })

    if (process.env.NODE_ENV === "production") {
      log.info("Running in production mode - sending to Inngest")
      for (const tool of tools) {
        await inngest.send({ name: "tool.submitted", data: { slug: tool.slug } })
        log.debug(`Sent tool.submitted event for: ${tool.slug}`)
      }
    } else {
      log.info("Running in development mode - executing directly")
      await Promise.all(tools.map(t => processToolPipeline(t.id)))
    }

    revalidatePath("/admin/tools")
    log.info("Process tools completed")
    return true
  })
