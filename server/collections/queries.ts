import type { Prisma } from "@prisma/client"
import { collectionManyPayload, collectionOnePayload } from "~/server/collections/payloads"
import { prisma } from "~/services/prisma"

export const findCollections = async ({
  where,
  orderBy,
  ...args
}: Prisma.CollectionFindManyArgs) => {
  return prisma.collection.findMany({
    ...args,
    orderBy: { name: "asc", ...orderBy },
    where,
    include: collectionManyPayload,
  })
}

export const findCollectionSlugs = async ({
  where,
  orderBy,
  ...args
}: Prisma.CollectionFindManyArgs) => {
  return prisma.collection.findMany({
    ...args,
    orderBy: { name: "asc", ...orderBy },
    where,
    select: { slug: true },
  })
}

export const findUniqueCollection = async ({ ...args }: Prisma.CollectionFindUniqueArgs) => {
  return prisma.collection.findUnique({
    ...args,
    include: collectionOnePayload,
  })
}
