"use client"

import { LoaderIcon, SearchIcon, SparklesIcon, TypeIcon } from "lucide-react"
import { type Values, useQueryStates } from "nuqs"
import { useEffect, useState, useTransition } from "react"
import { Stack } from "~/components/common/stack"
import { Input } from "~/components/web/ui/input"
import { Select } from "~/components/web/ui/select"
import { useDebounce } from "~/hooks/use-debounce"
import type { CategoryMany } from "~/server/categories/payloads"
import { searchParams, type SearchMode } from "~/server/tools/search-params"

export type ToolListFiltersProps = {
  categories?: CategoryMany[]
  placeholder?: string
  enableModeToggle?: boolean
}

export const ToolListFilters = ({
  categories,
  placeholder,
  enableModeToggle = true,
}: ToolListFiltersProps) => {
  const [isLoading, startTransition] = useTransition()
  const [filters, setFilters] = useQueryStates(searchParams, { shallow: false, startTransition })
  const [inputValue, setInputValue] = useState(filters.q || "")
  const q = useDebounce(inputValue, 300)

  const updateFilters = (values: Partial<Values<typeof searchParams>>) => {
    setFilters({ ...values, page: null })
  }

  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      q: q || null,
      page: q && q !== prev.q ? null : prev.page,
    }))
  }, [q])

  useEffect(() => {
    setInputValue(filters.q || "")
  }, [filters])

  const sortOptions = [
    { value: "publishedAt.desc", label: "Newest" },
    { value: "publishedAt.asc", label: "Oldest" },
    { value: "name.asc", label: "Name A-Z" },
    { value: "name.desc", label: "Name Z-A" },
  ]

  const modeOptions: { value: SearchMode; label: string; icon: typeof TypeIcon }[] = [
    { value: "keyword", label: "Keyword", icon: TypeIcon },
    { value: "hybrid", label: "AI Search", icon: SparklesIcon },
  ]

  const currentMode = (filters.mode || "keyword") as SearchMode
  const hasSearchQuery = Boolean(inputValue.trim())

  return (
    <Stack className="w-full">
      <div className="relative grow min-w-0">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none">
          {isLoading ? <LoaderIcon className="animate-spin" /> : <SearchIcon />}
        </div>

        <Input
          size="lg"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder={placeholder || "Search tools..."}
          className="w-full truncate pl-10"
        />
      </div>

      {enableModeToggle && hasSearchQuery && (
        <Select
          size="lg"
          className="min-w-32 max-sm:flex-1"
          value={currentMode}
          onChange={e => updateFilters({ mode: e.target.value as SearchMode })}
          title="Search mode"
        >
          {modeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}

      {categories && (
        <Select
          size="lg"
          className="min-w-40 max-sm:flex-1"
          value={filters.category}
          onChange={e => updateFilters({ category: e.target.value })}
        >
          <option value="">All categories</option>

          {categories.map(category => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </Select>
      )}

      <Select
        size="lg"
        className="min-w-36 max-sm:flex-1"
        value={filters.sort}
        onChange={e => updateFilters({ sort: e.target.value })}
      >
        <option value="" disabled>
          Order by
        </option>

        {sortOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Stack>
  )
}
