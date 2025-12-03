import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export type SearchMode = "keyword" | "semantic" | "hybrid"

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
