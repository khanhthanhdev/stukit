import type { Metadata } from "next"
import type { SearchParams } from "nuqs/server"
import { Suspense, cache } from "react"
import { ToolListSkeleton } from "~/components/web/tool-list-skeleton"
import { Intro, IntroDescription, IntroTitle } from "~/components/web/ui/intro"
import { Wrapper } from "~/components/web/ui/wrapper"
import { config } from "~/config"
import { parseMetadata } from "~/utils/metadata"
import { ToolsListing } from "./listing"

type PageProps = {
  searchParams: Promise<SearchParams>
}

const getMetadata = cache(
  (metadata?: Metadata): Metadata => ({
    ...metadata,
    title: "Browse All Work & Study Tools",
    description: config.site.description,
  }),
)

export const metadata = parseMetadata(
  getMetadata({
    alternates: { canonical: "/tools" },
    openGraph: { url: "/tools" },
  }),
)

export default function Tools({ searchParams }: PageProps) {
  const { title, description } = getMetadata()

  return (
    <Wrapper>
      <Intro>
        <IntroTitle>{title?.toString()}</IntroTitle>
        <IntroDescription>{description}</IntroDescription>
      </Intro>

      <Suspense fallback={<ToolListSkeleton />}>
        <ToolsListing searchParams={searchParams} />
      </Suspense>
    </Wrapper>
  )
}
