"use client"

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react"

type ToolInfo = {
  slug: string
  name: string
}

type ChatContextValue = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggleChat: () => void
  currentTool: ToolInfo | null
  setCurrentTool: (tool: ToolInfo | null) => void
  suggestedQuestions: string[]
  startNewChat: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

const DEFAULT_QUESTIONS = [
  "What Work & Study tools do you recommend?",
  "Help me find a tool for API testing",
  "What are the best free Work & Study tools?",
]

const getToolQuestions = (tool: ToolInfo): string[] => [
  `How do I use ${tool.name}?`,
  `What are alternatives to ${tool.name}?`,
  `What are the key features of ${tool.name}?`,
]

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentTool, setCurrentTool] = useState<ToolInfo | null>(null)
  const [, forceUpdate] = useState({})

  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const startNewChat = useCallback(() => {
    // Force re-render to reset chat messages
    forceUpdate({})
  }, [])

  const suggestedQuestions = useMemo(() => {
    return currentTool ? getToolQuestions(currentTool) : DEFAULT_QUESTIONS
  }, [currentTool])

  const value = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      toggleChat,
      currentTool,
      setCurrentTool,
      suggestedQuestions,
      startNewChat,
    }),
    [isOpen, toggleChat, currentTool, suggestedQuestions, startNewChat],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider")
  }
  return context
}
