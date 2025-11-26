import { createSearchParamsCache, parseAsInteger, parseAsString } from "nuqs/server"

export type SearchMode = "keyword" | "semantic" | "hybrid"

export const searchParams = {
  q: parseAsString,
  category: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  sort: parseAsString.withDefault("publishedAt.desc"),
  perPage: parseAsInteger.withDefault(24),
  mode: parseAsString.withDefault("keyword"),
}

export const searchParamsCache = createSearchParamsCache(searchParams)
