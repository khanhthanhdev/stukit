import { AsyncLocalStorage } from "node:async_hooks"
import { PrismaClient } from "@prisma/client"
import { deleteToolVector, upsertToolVector } from "~/lib/vector-store"
import { withAccelerate } from "@prisma/extension-accelerate"
const vectorSyncStore = new AsyncLocalStorage<boolean>()

const toolVectorInclude = {
  categories: { select: { slug: true, name: true } },
  tags: { select: { slug: true } },
} as const

const runWithoutVectorSync = <T>(fn: () => Promise<T>) => vectorSyncStore.run(true, fn)

const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL || ""
  const isAccelerateUrl = databaseUrl.startsWith("prisma://") || databaseUrl.startsWith("prisma+postgres://")
  
  // Always apply withAccelerate() to ensure consistent TypeScript types for cacheStrategy
  // The extension is safe with regular database URLs - caching features are only active with Accelerate URLs
  const baseClient = new PrismaClient().$extends(withAccelerate())

  const invalidateListings = async (tags: ReadonlyArray<string>) => {
    if (!isAccelerateUrl) return // Skip cache invalidation when not using Accelerate
    
    try {
      // Type assertion is safe here because we've applied withAccelerate() and checked isAccelerateUrl
      const accelerateClient = baseClient as unknown as { $accelerate: { invalidate: (args: { tags: string[] }) => Promise<void> } }
      await accelerateClient.$accelerate.invalidate({ tags: [...tags] })
    } catch (error) {
      console.error("Failed to invalidate Accelerate cache", { tags, error })
    }
  }

  return baseClient.$extends({
    query: {
      tool: {
        async create({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("create", result.id)
          await invalidateListings(["tools_list"])
          return result
        },
        async update({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("update", result.id)
          await invalidateListings(["tools_list"])
          return result
        },
        async upsert({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("upsert", result.id)
          await invalidateListings(["tools_list"])
          return result
        },
        async delete({ args, query }) {
          const result = await query(args)
          if (result.id) await syncToolVector("delete", result.id)
          await invalidateListings(["tools_list"])
          return result
        },
        async updateMany({ args, query }) {
          const result = await query(args)
          await invalidateListings(["tools_list"])
          return result
        },
        async deleteMany({ args, query }) {
          const result = await query(args)
          await invalidateListings(["tools_list"])
          return result
        },
      },
      category: {
        async create({ args, query }) {
          const result = await query(args)
          await invalidateListings(["categories_list"])
          return result
        },
        async update({ args, query }) {
          const result = await query(args)
          await invalidateListings(["categories_list"])
          return result
        },
        async upsert({ args, query }) {
          const result = await query(args)
          await invalidateListings(["categories_list"])
          return result
        },
        async delete({ args, query }) {
          const result = await query(args)
          await invalidateListings(["categories_list"])
          return result
        },
        async updateMany({ args, query }) {
          const result = await query(args)
          await invalidateListings(["categories_list"])
          return result
        },
        async deleteMany({ args, query }) {
          const result = await query(args)
          await invalidateListings(["categories_list"])
          return result
        },
      },
      collection: {
        async create({ args, query }) {
          const result = await query(args)
          await invalidateListings(["collections_list"])
          return result
        },
        async update({ args, query }) {
          const result = await query(args)
          await invalidateListings(["collections_list"])
          return result
        },
        async upsert({ args, query }) {
          const result = await query(args)
          await invalidateListings(["collections_list"])
          return result
        },
        async delete({ args, query }) {
          const result = await query(args)
          await invalidateListings(["collections_list"])
          return result
        },
        async updateMany({ args, query }) {
          const result = await query(args)
          await invalidateListings(["collections_list"])
          return result
        },
        async deleteMany({ args, query }) {
          const result = await query(args)
          await invalidateListings(["collections_list"])
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
