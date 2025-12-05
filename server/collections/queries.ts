import type { Prisma } from "@prisma/client"
import {
  collectionManyPayload,
  collectionOnePayload,
  type CollectionMany,
} from "~/server/collections/payloads"
import { prisma } from "~/services/prisma"

type FindCollectionsArgs = Omit<Prisma.CollectionFindManyArgs, "select" | "include">

export const findCollections = async ({
  where,
  orderBy,
  ...args
}: FindCollectionsArgs): Promise<CollectionMany[]> => {
  return (prisma.collection.findMany({
    cacheStrategy: { ttl: 7200, tags: ["collections_list"] },
    ...args,
    orderBy: { name: "asc", ...orderBy },
    where,
    include: collectionManyPayload,
  }) as unknown) as Promise<CollectionMany[]>
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
