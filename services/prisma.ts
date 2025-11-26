import { PrismaClient } from "@prisma/client"
import { AsyncLocalStorage } from "node:async_hooks"
import { deleteToolVector, upsertToolVector } from "~/lib/vector-store"

declare global {
  var prismaInstance: PrismaClient | undefined
}

const prisma = globalThis.prismaInstance ?? new PrismaClient()

const vectorSyncStore = new AsyncLocalStorage<boolean>()

const toolVectorInclude = {
  categories: { select: { slug: true, name: true } },
  tags: { select: { slug: true } },
} as const

const runWithoutVectorSync = <T>(fn: () => Promise<T>) => vectorSyncStore.run(true, fn)

if (typeof prisma.$use === "function") {
  prisma.$use(async (params: any, next: (params: any) => Promise<any>) => {
    const skipSync = vectorSyncStore.getStore()
    const result = await next(params)

    if (skipSync || params.model !== "Tool") {
      return result
    }

    const action = params.action
    const toolId = (result as { id?: string } | undefined)?.id

    if (!toolId) {
      return result
    }

    try {
      if (action === "delete") {
        await deleteToolVector(toolId)
        return result
      }

      if (["create", "update", "upsert"].includes(action)) {
        await runWithoutVectorSync(async () => {
          const toolWithRelations = await prisma.tool.findUnique({
            where: { id: toolId },
            include: toolVectorInclude,
          })

          if (toolWithRelations) {
            await upsertToolVector(toolWithRelations)
          }
        })
      }
    } catch (error) {
      console.error("Failed to sync tool vector store", error)
    }

    return result
  })
} else {
  console.warn("Prisma middleware not available ($use is missing)")
}

export { prisma }

if (process.env.NODE_ENV !== "production") globalThis.prismaInstance = prisma
