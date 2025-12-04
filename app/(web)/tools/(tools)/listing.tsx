import type { Prisma } from "@prisma/client"
import type { SearchParams } from "nuqs/server"
import type { ComponentProps } from "react"
import { ToolList } from "~/components/web/tool-list"
import { findCategories } from "~/server/categories/queries"
import { searchTools } from "~/server/tools/queries"
import type { ToolMany } from "~/server/tools/payloads"

type ToolsListingProps = Omit<
  ComponentProps<typeof ToolList>,
  "tools" | "categories" | "totalCount"
> & {
  searchParams: Promise<SearchParams>
  where?: Prisma.ToolWhereInput
}

export const ToolsListing = async ({ searchParams, where, ...props }: ToolsListingProps) => {
  const resolvedParams = await searchParams

  const [{ items: tools, totalCount }, categories] = await Promise.all([
    searchTools(resolvedParams, { where }),
    findCategories({}),
  ])

  return (
    <ToolList
      tools={tools as ToolMany[]}
      totalCount={totalCount}
      categories={where?.categories ? undefined : categories}
      {...props}
    />
  )
}
