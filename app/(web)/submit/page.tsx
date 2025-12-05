import type { Metadata } from "next"
import { cache } from "react"
import { SubmitForm } from "~/app/(web)/submit/form"
import { Intro, IntroDescription, IntroTitle } from "~/components/web/ui/intro"
import { Wrapper } from "~/components/web/ui/wrapper"
import { config } from "~/config"
import { parseMetadata } from "~/utils/metadata"

const getMetadata = cache(
  (metadata?: Metadata): Metadata => ({
    ...metadata,
    title: "Submit a Tool",
    description: `Listing on ${config.site.name} is a great way to get more exposure for your tool. We only list high-quality tools that are useful for work & study.`,
  }),
)

export const metadata = parseMetadata(
  getMetadata({
    alternates: { canonical: "/submit" },
    openGraph: { url: "/submit" },
  }),
)

export default function SubmitPage() {
  const { title, description } = getMetadata()

  return (
    <Wrapper size="sm">
      <Intro>
        <IntroTitle>{title?.toString()}</IntroTitle>
        <IntroDescription>{description}</IntroDescription>
      </Intro>

      <SubmitForm />
    </Wrapper>
  )
}
