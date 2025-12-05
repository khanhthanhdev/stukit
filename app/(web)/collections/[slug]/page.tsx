import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense, cache } from "react"
import { ToolsListing } from "~/app/(web)/tools/(tools)/listing"
import { ToolListSkeleton } from "~/components/web/tool-list-skeleton"
import { Intro, IntroDescription, IntroTitle } from "~/components/web/ui/intro"
import { Wrapper } from "~/components/web/ui/wrapper"
import type { CollectionOne } from "~/server/collections/payloads"
import { findCollectionSlugs, findUniqueCollection } from "~/server/collections/queries"
import { parseMetadata } from "~/utils/metadata"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}

export const generateStaticParams = async () => {
  const collections = await findCollectionSlugs({})
  return collections.map(({ slug }) => ({ slug }))
}

const getMetadata = cache((collection: CollectionOne, metadata?: Metadata): Metadata => {
  return {
    ...metadata,
    title: `${collection.name} Work & Study Tools`,
    description: collection.description,
  }
})

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata | undefined> => {
  const { slug } = await params
  const collection = await findUniqueCollection({ where: { slug } })
  const url = `/collections/${slug}`

  if (!collection) {
    return
  }

  return parseMetadata(
    getMetadata(collection, {
      alternates: { canonical: url },
      openGraph: { url },
    }),
  )
}

export default async function CollectionPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const collection = await findUniqueCollection({ where: { slug } })

  if (!collection) {
    notFound()
  }

  const { title, description } = getMetadata(collection)

  return (
    <Wrapper>
      <Intro>
        <IntroTitle>{title?.toString()}</IntroTitle>
        <IntroDescription>{description}</IntroDescription>
      </Intro>

      <Suspense fallback={<ToolListSkeleton />}>
        <ToolsListing
          searchParams={searchParams}
          where={{ collections: { some: { slug } } }}
          placeholder={`Search ${collection.name.toLowerCase()} tools...`}
        />
      </Suspense>
    </Wrapper>
  )
}
