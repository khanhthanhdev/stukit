"use server"

import "server-only"
import { slugify } from "@curiousleaf/utils"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { categorySchema } from "~/app/admin/categories/_lib/validations"
import { authedProcedure } from "~/lib/safe-actions"
import { upsertCategoryVector, deleteCategoryVector } from "~/lib/vector-store"
import { prisma } from "~/services/prisma"

export const createCategory = authedProcedure
  .createServerAction()
  .input(categorySchema)
  .handler(async ({ input: { tools, ...input } }) => {
    const category = await prisma.category.create({
      data: {
        ...input,
        slug: input.slug || slugify(input.name),

        // Relations
        tools: { connect: tools?.map((id: string) => ({ id })) },
      },
    })

    // Index category in Qdrant for semantic search
    try {
      await upsertCategoryVector(category)
    } catch (error) {
      console.error("Failed to index category vector:", error)
      // Don't fail the operation if vector indexing fails
    }

    revalidatePath("/admin/categories")

    return category
  })

export const updateCategory = authedProcedure
  .createServerAction()
  .input(categorySchema.extend({ id: z.string() }))
  .handler(async ({ input: { id, tools, ...input } }) => {
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...input,

        // Relations
        tools: { set: tools?.map((id: string) => ({ id })) },
      },
    })

    // Update category vector in Qdrant
    try {
      await upsertCategoryVector(category)
    } catch (error) {
      console.error("Failed to update category vector:", error)
      // Don't fail the operation if vector indexing fails
    }

    revalidatePath("/admin/categories")
    revalidatePath(`/admin/categories/${category.slug}`)

    return category
  })

export const updateCategories = authedProcedure
  .createServerAction()
  .input(z.object({ ids: z.array(z.string()), data: categorySchema.partial() }))
  .handler(async ({ input: { ids, data } }) => {
    await prisma.category.updateMany({
      where: { id: { in: ids } },
      data,
    })

    // Update category vectors in Qdrant
    try {
      const updatedCategories = await prisma.category.findMany({
        where: { id: { in: ids } },
      })
      await Promise.all(updatedCategories.map(category => upsertCategoryVector(category)))
    } catch (error) {
      console.error("Failed to update category vectors:", error)
      // Don't fail the operation if vector indexing fails
    }

    revalidatePath("/admin/categories")

    return true
  })

export const deleteCategories = authedProcedure
  .createServerAction()
  .input(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input: { ids } }) => {
    await prisma.category.deleteMany({
      where: { id: { in: ids } },
    })

    // Delete category vectors from Qdrant
    try {
      await Promise.all(ids.map((id: string) => deleteCategoryVector(id)))
    } catch (error) {
      console.error("Failed to delete category vectors:", error)
      // Don't fail the operation if vector deletion fails
    }

    revalidatePath("/admin/categories")

    return true
  })
