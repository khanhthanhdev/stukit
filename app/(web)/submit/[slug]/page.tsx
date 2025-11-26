import type { Tool } from "@prisma/client"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs"
import { createSearchParamsCache, parseAsBoolean } from "nuqs/server"
import { cache } from "react"
import { SubmitProducts } from "~/app/(web)/submit/[slug]/products"
import { Prose } from "~/components/common/prose"
import { Intro, IntroDescription, IntroTitle } from "~/components/web/ui/intro"
import { Wrapper } from "~/components/web/ui/wrapper"
import { config } from "~/config"
import { isToolPublished } from "~/lib/tools"
import { findToolSlugs, findUniqueTool } from "~/server/tools/queries"
import { parseMetadata } from "~/utils/metadata"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}

const searchParamsCache = createSearchParamsCache({
  success: parseAsBoolean.withDefault(false),
})

const getTool = cache(async ({ slug, success }: { slug: string; success: boolean }) => {
  return findUniqueTool({
    where: { slug, publishedAt: undefined, isFeatured: success ? undefined : false },
  })
})

const getMetadata = cache((tool: Tool, success: boolean, metadata?: Metadata): Metadata => {
  if (success) {
    return {
      ...metadata,
      title: `Thanks for submitting ${tool.name}!`,
      description: `${tool.name} is now sitting in our moderation queue. An admin will publish it once it clears review.`,
    }
  }

  if (isToolPublished(tool)) {
    return {
      ...metadata,
      title: `${tool.name} is already live`,
      description: `We'll review any new details you requested and keep ${tool.name} in the queue for future updates.`,
    }
  }

  return {
    ...metadata,
    title: `Submission status for ${tool.name}`,
    description: `You're all set. We publish new listings every week once they move through the admin queue.`,
  }
})

export const generateStaticParams = async () => {
  const tools = await findToolSlugs({ where: { publishedAt: undefined } })
  return tools.map(({ slug }) => ({ slug }))
}

export const generateMetadata = async ({ params, searchParams }: PageProps): Promise<Metadata> => {
  const { slug } = await params
  const { success } = searchParamsCache.parse(await searchParams)

  const tool = await getTool({ slug, success })
  const url = `/submit/${slug}`

  if (!tool) {
    return {}
  }

  return parseMetadata(
    getMetadata(tool, success, {
      alternates: { canonical: url },
      openGraph: { url },
    }),
  )
}

export default async function SubmitPackages({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { success } = searchParamsCache.parse(await searchParams)

  const tool = await getTool({ slug, success })

  if (!tool) {
    notFound()
  }

  const { title, description } = getMetadata(tool, success)

  return (
    <Wrapper>
      <Intro>
        <IntroTitle>{title?.toString()}</IntroTitle>
        <IntroDescription>{description}</IntroDescription>
      </Intro>

      {/* {success && (
        <Image
          src={`${config.media.staticHost}/3d-heart.webp`}
          alt=""
          className="max-w-64 w-2/3 h-auto mx-auto"
          width={256}
          height={228}
        />
      )} */}

      <div className="flex justify-center">
        <SubmitProducts tool={tool} />
      </div>

      <Intro>
        <IntroTitle size="h3">Have questions?</IntroTitle>

        <Prose>
          <p>
            If you have any questions, please contact us at{" "}
            <Link href={`mailto:${config.site.email}`}>{config.site.email}</Link>.
          </p>
        </Prose>
      </Intro>
    </Wrapper>
  )
}
