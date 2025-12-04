import type { Prisma } from "@prisma/client"
import { categoryManyPayload, categoryOnePayload } from "~/server/categories/payloads"
import { prisma } from "~/services/prisma"

export const findCategories = async ({ where, orderBy, ...args }: Prisma.CategoryFindManyArgs) => {
  return prisma.category.findMany({
    ...args,
    orderBy: { name: "asc", ...orderBy },
    where,
    include: categoryManyPayload,
  })
}

export const findCategorySlugs = async ({
  where,
  orderBy,
  ...args
}: Prisma.CategoryFindManyArgs) => {
  return prisma.category.findMany({
    ...args,
    orderBy: { name: "asc", ...orderBy },
    where,
    select: { slug: true },
  })
}

export const findUniqueCategory = async ({ ...args }: Prisma.CategoryFindUniqueArgs) => {
  return prisma.category.findUnique({
    ...args,
    include: categoryOnePayload,
  })
}
