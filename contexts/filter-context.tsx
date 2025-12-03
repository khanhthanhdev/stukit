"use client"

import { type Values, useQueryStates } from "nuqs"
import { type PropsWithChildren, createContext, use, useTransition } from "react"
import { searchParams, type SearchMode } from "~/server/tools/search-params"

export type FiltersContextType = {
  filters: Values<typeof searchParams>
  isLoading: boolean
  enableSort: boolean
  enableFilters: boolean
  enableModeToggle: boolean
  updateFilters: (values: Partial<Values<typeof searchParams>>) => void
  setSearchMode: (mode: SearchMode) => void
}

const FiltersContext = createContext<FiltersContextType>(null!)

export type FiltersProviderProps = {
  enableSort?: boolean
  enableFilters?: boolean
  enableModeToggle?: boolean
}

export const FiltersProvider = ({
  children,
  enableSort = true,
  enableFilters = true,
  enableModeToggle = true,
}: PropsWithChildren<FiltersProviderProps>) => {
  const [isLoading, startTransition] = useTransition()

  const [filters, setFilters] = useQueryStates(searchParams, {
    shallow: false,
    throttleMs: 300,
    startTransition,
  })

  const updateFilters = (values: Partial<Values<typeof searchParams>>) => {
    setFilters(prev => ({ ...prev, ...values, page: null }))
  }

  const setSearchMode = (mode: SearchMode) => {
    updateFilters({ mode })
  }

  return (
    <FiltersContext.Provider
      value={{
        filters,
        isLoading,
        updateFilters,
        setSearchMode,
        enableSort,
        enableFilters,
        enableModeToggle,
      }}
    >
      {children}
    </FiltersContext.Provider>
  )
}

export const useFilters = () => {
  const context = use(FiltersContext)

  if (context === undefined) {
    throw new Error("useFilters must be used within a FiltersProvider")
  }

  return context
}

