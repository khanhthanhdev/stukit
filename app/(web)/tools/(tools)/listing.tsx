import type { Prisma } from "@prisma/client"
import type { SearchParams } from "nuqs/server"
import type { ComponentProps } from "react"
import { ToolList } from "~/components/web/tool-list"
import { findCategories } from "~/server/categories/queries"
import { searchToolsUnified } from "~/server/tools/queries"

type ToolsListingProps = Omit<
  ComponentProps<typeof ToolList>,
  "tools" | "categories" | "totalCount"
> & {
  searchParams: Promise<SearchParams>
  where?: Prisma.ToolWhereInput
}

export const ToolsListing = async ({ searchParams, where, ...props }: ToolsListingProps) => {
  const resolvedParams = await searchParams

  const [{ tools, totalCount }, categories] = await Promise.all([
    searchToolsUnified(resolvedParams, { where }),
    findCategories({}),
  ])

  return (
    <ToolList
      tools={tools}
      totalCount={totalCount}
      categories={where?.categories ? undefined : categories}
      {...props}
    />
  )
}
