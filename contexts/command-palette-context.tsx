"use client"

import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

type CommandPaletteContextType = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextType | null>(null)

export const CommandPaletteProvider = ({ children }: PropsWithChildren) => {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
    }),
    [isOpen, open, close, toggle],
  )

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>
}

export const useCommandPalette = () => {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider")
  }

  return context
}
