"use client"

import {
  ArrowUpRightIcon,
  BookmarkIcon,
  FolderIcon,
  HashIcon,
  LoaderIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  WrenchIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { inferServerActionReturnData } from "zsa"
import { useServerAction } from "zsa-react"
import { searchPaletteItems } from "~/actions/search"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/components/web/ui/command"
import { Favicon } from "~/components/web/ui/favicon"
import { Shortcut } from "~/components/web/ui/shortcut"
import { useCommandPalette } from "~/contexts/command-palette-context"
import { useDebouncedState } from "~/hooks/use-debounced-state"

type PaletteResults = inferServerActionReturnData<typeof searchPaletteItems>

const quickLinks = [
  { label: "All tools", href: "/tools", icon: SearchIcon },
  { label: "Categories", href: "/categories", icon: FolderIcon },
  { label: "Collections", href: "/collections", icon: BookmarkIcon },
  { label: "Tags", href: "/tags", icon: TagIcon },
  { label: "Submit a tool", href: "/submit", icon: SparklesIcon },
]

const shouldIgnoreHotkeyTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName
  const editable = target.getAttribute("contenteditable")
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    editable === "true" ||
    target.isContentEditable
  )
}

export const CommandPalette = () => {
  const router = useRouter()
  const palette = useCommandPalette()
  const [input, setInput] = useState("")
  const [query, setQuery] = useDebouncedState("", 300)
  const [results, setResults] = useState<PaletteResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { execute, isPending } = useServerAction(searchPaletteItems, {
    onSuccess: ({ data }) => {
      setResults(data)
      setError(null)
    },
    onError: ({ err }) => {
      console.error(err)
      setResults(null)
      setError(err.message || "Search failed")
    },
  })

  const clearState = useCallback(() => {
    setInput("")
    setResults(null)
    setError(null)
  }, [])

  const handleClose = useCallback(() => {
    palette.close()
    clearState()
  }, [clearState, palette])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        palette.open()
      } else {
        handleClose()
      }
    },
    [handleClose, palette],
  )

  const handleSelect = useCallback(
    (href: string) => {
      router.push(href)
      handleClose()
    },
    [handleClose, router],
  )

  // Keyboard shortcut: Mod+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Allow closing even when focused on input
        if (palette.isOpen) {
          e.preventDefault()
          handleClose()
        } else if (!shouldIgnoreHotkeyTarget(e.target)) {
          e.preventDefault()
          palette.open()
        }
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [palette.isOpen, palette.open, handleClose])

  useEffect(() => {
    setQuery(input)
  }, [input, setQuery])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length > 1) {
      execute({ q: trimmed, mode: "semantic" })
    } else {
      setResults(null)
      setError(null)
    }
  }, [query, execute])

  const hasQuery = input.trim().length > 0
  const totalHits = results
    ? results.tools.length +
      results.categories.length +
      results.collections.length +
      results.tags.length
    : 0
  const hasTools = !!results?.tools.length
  const hasCategories = !!results?.categories.length
  const hasCollections = !!results?.collections.length
  const hasTags = !!results?.tags.length

  const fallbackNotice =
    results?.requestedMode === "semantic" &&
    ["tools", "categories"].some(
      key => results?.searchModes[key as keyof PaletteResults["searchModes"]] === "keyword",
    )

  const modeSummary = useMemo(() => {
    if (!results) return ""
    const { searchModes } = results
    return `tools:${searchModes.tools} • categories:${searchModes.categories} • collections:${searchModes.collections} • tags:${searchModes.tags}`
  }, [results])

  return (
    <CommandDialog open={palette.isOpen} onOpenChange={handleOpenChange} shouldFilter={false}>
      <div className="relative">
        <CommandInput
          placeholder="Search tools, categories, collections, tags..."
          value={input}
          onValueChange={setInput}
        />

        <div className="absolute inset-y-0 right-3 flex items-center gap-2 text-muted-foreground">
          {isPending && <LoaderIcon className="size-4 animate-spin" aria-label="Searching" />}
          <Shortcut size="h6" className="text-xs text-muted-foreground/80"/>
        </div>
      </div>

      <CommandList>
        <CommandEmpty>
          {error
            ? `Search failed: ${error}`
            : hasQuery
              ? "No results found. Try a different query."
              : "Type to search across tools, categories, collections, and tags."}
        </CommandEmpty>

        {!hasQuery && (
          <CommandGroup heading="Quick links">
            {quickLinks.map(link => (
              <CommandItem key={link.href} onSelect={() => handleSelect(link.href)}>
                <link.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{link.label}</span>
                <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasTools && (
          <CommandGroup heading="Tools">
            {results.tools.map((tool: PaletteResults["tools"][0]) => (
              <CommandItem
                key={tool.id}
                value={`tool:${tool.slug}`}
                onSelect={() => handleSelect(`/tools/${tool.slug}`)}
              >
                {tool.faviconUrl ? (
                  <Favicon src={tool.faviconUrl} title={tool.name} className="size-5" />
                ) : (
                  <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium leading-tight">{tool.name}</span>
                  {tool.tagline && (
                    <span className="text-xs text-muted-foreground/80 line-clamp-1">
                      {tool.tagline}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasCategories && (
          <>
            {hasTools && <CommandSeparator />}
            <CommandGroup heading="Categories">
              {results.categories.map((category: PaletteResults["categories"][0]) => (
                <CommandItem
                  key={category.id}
                  value={`category:${category.slug}`}
                  onSelect={() => handleSelect(`/categories/${category.slug}`)}
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{category.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hasCollections && (
          <>
            {(hasTools || hasCategories) && <CommandSeparator />}
            <CommandGroup heading="Collections">
              {results.collections.map((collection: PaletteResults["collections"][0]) => (
                <CommandItem
                  key={collection.id}
                  value={`collection:${collection.slug}`}
                  onSelect={() => handleSelect(`/collections/${collection.slug}`)}
                >
                  <BookmarkIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{collection.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hasTags && (
          <>
            {(hasTools || hasCategories || hasCollections) && <CommandSeparator />}
            <CommandGroup heading="Tags">
              {results.tags.map((tag: PaletteResults["tags"][0]) => (
                <CommandItem
                  key={tag.id}
                  value={`tag:${tag.slug}`}
                  onSelect={() => handleSelect(`/tags/${tag.slug}`)}
                >
                  <HashIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{tag.slug}</span>
                  <CommandShortcut>Tag</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {results && (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            Found {totalHits} {totalHits === 1 ? "result" : "results"} in {results.elapsedMs}ms
          </span>

          <span className="h-3 w-px bg-border/70" aria-hidden />

          <span className="truncate" title={modeSummary}>
            {modeSummary}
          </span>

          {fallbackNotice && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
              Semantic unavailable – showing keyword matches
            </span>
          )}
        </div>
      )}
    </CommandDialog>
  )
}
