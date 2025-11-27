import { DollarSignIcon, HashIcon, SparkleIcon, TagIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"
import { RelatedTools } from "~/app/(web)/tools/[slug]/related-tools"
import { RelatedToolsSkeleton } from "~/app/(web)/tools/[slug]/related-tools-skeleton"
import { ToolLink } from "~/app/(web)/tools/[slug]/tool-link"
import { H2, H6 } from "~/components/common/heading"
import { Markdown } from "~/components/common/markdown"
import { Stack } from "~/components/common/stack"
import { ToolContextSetter } from "~/components/web/ai-chat"
import { Nav } from "~/components/web/nav"
import { Badge } from "~/components/web/ui/badge"
import { FaviconImage } from "~/components/web/ui/favicon"
import { Gallery } from "~/components/web/ui/gallery"
import { IntroDescription } from "~/components/web/ui/intro"
import { Tag } from "~/components/web/ui/tag"
import { Wrapper } from "~/components/web/ui/wrapper"
import { findFirstTool, findToolSlugs, findUniqueTool } from "~/server/tools/queries"
import { parseMetadata } from "~/utils/metadata"

type PageProps = {
  params: Promise<{ slug: string }>
}

export const generateStaticParams = async () => {
  const tools = await findToolSlugs({})
  return tools.map(({ slug }) => ({ slug }))
}

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata | undefined> => {
  const { slug } = await params
  const tool = await findUniqueTool({ where: { slug } })
  const url = `/tools/${slug}`

  if (!tool) {
    return
  }

  const title = `${tool.name}${tool.tagline ? `: ${tool.tagline}` : ""}`
  const description = tool.description || ""

  return parseMetadata({
    title,
    description,
    alternates: { canonical: url },
    openGraph: { url },
  })
}

export default async function ToolPage({ params }: PageProps) {
  const { slug } = await params
  const tool = await findUniqueTool({ where: { slug } })

  if (!tool) {
    notFound()
  }

  const [previous, next] = await Promise.all([
    findFirstTool({
      where: { id: { lt: tool.id } },
      select: { slug: true },
      orderBy: { id: "desc" },
    }),

    findFirstTool({
      where: { id: { gt: tool.id } },
      select: { slug: true },
      orderBy: { id: "asc" },
    }),
  ])

  const socials = z
    .array(z.object({ url: z.string(), name: z.string() }))
    .nullable()
    .safeParse(tool.socials)

  return (
    <>
      <ToolContextSetter slug={tool.slug} name={tool.name} />
      <Wrapper size="sm">
        <div className="flex w-full flex-col items-start gap-y-4">
          <Stack size="lg" className="relative w-full justify-between">
            <Stack size="lg">
              {tool.faviconUrl && (
                <FaviconImage
                  src={tool.faviconUrl}
                  title={tool.name}
                  className="size-10 rounded-md"
                />
              )}

              <H2 as="h1" className="!leading-snug -my-1.5">
                {tool.name}
              </H2>
            </Stack>

            <Stack size="sm" className="items-stretch">
              <ToolLink size="md" variant="primary" tool={tool} />
            </Stack>
          </Stack>

          <IntroDescription>{tool.description}</IntroDescription>

          <Stack className="mt-4 empty:contents">
            {tool.isFeatured && (
              <Badge variant="outline" prefix={<SparkleIcon className="text-yellow-500" />}>
                Featured
              </Badge>
            )}

            {tool.collections.map(collection => (
              <Badge key={collection.id} variant="outline" asChild>
                <Link href={`/collections/${collection.slug}`}>{collection.name}</Link>
              </Badge>
            ))}

            {tool.pricing && (
              <Badge variant="ghost" prefix={<DollarSignIcon className="text-green-500" />}>
                {tool.pricing}
              </Badge>
            )}
          </Stack>

          {/* {!!socials.data?.length && (
            <Stack size="sm">
              {socials.data.map(({ url, name }) => (
                <Button key={url} size="md" variant="secondary" suffix={<EllipsisIcon />}>
                  More
                </Button>
              ))}
            </Stack>
          )} */}
        </div>

        {tool.screenshotUrl && (
          <Gallery
            images={[{ url: tool.screenshotUrl, alt: `Screenshot of ${tool.name} website` }]}
          />
        )}

        {tool.content && <Markdown>{tool.content}</Markdown>}

        {!!tool.categories.length && (
          <Stack direction="column">
            <H6 as="h4">Categories:</H6>

            <Stack>
              {tool.categories.map(category => (
                <Tag key={category.id} prefix={<TagIcon className="mr-0.5" />} asChild>
                  <Link href={`/categories/${category.slug}`}>
                    {category.name}
                    <span className="text-foreground/50">({category._count.tools})</span>
                  </Link>
                </Tag>
              ))}
            </Stack>
          </Stack>
        )}

        {!!tool.tags.length && (
          <Stack direction="column">
            <H6 as="h4">Tags:</H6>

            <Stack>
              {tool.tags.map(tag => (
                <Tag key={tag.id} prefix={<HashIcon />} asChild>
                  <Link href={`/tags/${tag.slug}`}>{tag.slug}</Link>
                </Tag>
              ))}
            </Stack>
          </Stack>
        )}

        <Nav
          className="sticky bottom-4 z-30 mx-auto"
          tool={tool}
          previous={previous?.slug}
          next={next?.slug}
        />

        {/* <p className="text-foreground/50 text-sm">
          Last updated: {formatDistanceToNowStrict(tool.updatedAt, { addSuffix: true })}
        </p> */}
      </Wrapper>

      <Suspense fallback={<RelatedToolsSkeleton />}>
        <RelatedTools tool={tool} />
      </Suspense>
    </>
  )
}
