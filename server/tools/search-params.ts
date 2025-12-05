import { createSearchParamsCache, parseAsArrayOf, parseAsInteger, parseAsString } from "nuqs/server"
import { type SearchMode, normalizeSearchMode } from "~/lib/search/types"

export type { SearchMode }

export const searchParams = {
  q: parseAsString,
  category: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  sort: parseAsString.withDefault("publishedAt.desc"),
  perPage: parseAsInteger.withDefault(24),
  mode: parseAsString.withDefault("keyword"),
  tag: parseAsArrayOf(parseAsString).withDefault([]),
  collection: parseAsArrayOf(parseAsString).withDefault([]),
}

export const searchParamsCache = createSearchParamsCache(searchParams)

export type FilterSchema = Awaited<ReturnType<typeof searchParamsCache.parse>>

export const resolveSearchMode = (mode?: string | null): SearchMode => normalizeSearchMode(mode)
