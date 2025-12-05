import { AsyncLocalStorage } from "node:async_hooks"
import { PrismaClient } from "@prisma/client"
import { deleteToolVector, upsertToolVector } from "~/lib/vector-store"

const vectorSyncStore = new AsyncLocalStorage<boolean>()

const toolVectorInclude = {
  categories: { select: { slug: true, name: true } },
  tags: { select: { slug: true } },
} as const

const runWithoutVectorSync = <T>(fn: () => Promise<T>) => vectorSyncStore.run(true, fn)

const createPrismaClient = () => {
  const baseClient = new PrismaClient()

  return baseClient.$extends({
    query: {
      tool: {
        async create({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("create", result.id)
          return result
        },
        async update({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("update", result.id)
          return result
        },
        async upsert({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("upsert", result.id)
          return result
        },
        async delete({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("delete", result.id)
          return result
        },
      },
    },
  })
}

async function syncToolVector(action: string, toolId: string) {
  const skipSync = vectorSyncStore.getStore()
  if (skipSync) return

  try {
    if (action === "delete") {
      await deleteToolVector(toolId)
      return
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
}

declare global {
  var prismaInstance: ReturnType<typeof createPrismaClient> | undefined
}

const prisma = globalThis.prismaInstance ?? createPrismaClient()

export { prisma }

if (process.env.NODE_ENV !== "production") globalThis.prismaInstance = prisma
