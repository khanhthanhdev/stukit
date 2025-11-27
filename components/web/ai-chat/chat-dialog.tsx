"use client"

import { useChat } from "@ai-sdk/react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { DefaultChatTransport, type UIMessage } from "ai"
import { LoaderIcon, MessageSquarePlusIcon, SendIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cx } from "~/utils/cva"
import { useChatContext } from "./chat-context"
import { ChatMarkdown } from "./chat-markdown"
import { SuggestedQuestions } from "./suggested-questions"

function parseFollowUpQuestions(text: string): { content: string; suggestions: string[] } {
  const parts = text.split("---SUGGESTIONS---")
  if (parts.length < 2) return { content: text, suggestions: [] }

  const content = parts[0].trim()
  const suggestionsText = parts[1].trim()
  const suggestions = suggestionsText
    .split("\n")
    .map(line => line.replace(/^-\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)

  return { content, suggestions }
}

function getMessageText(message: UIMessage): string {
  for (const part of message.parts) {
    if (part.type === "text") {
      return part.text
    }
  }
  return ""
}

export function ChatDialog() {
  const { isOpen, setIsOpen, currentTool, suggestedQuestions } = useChatContext()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState("")
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
  const [chatKey, setChatKey] = useState(0)

  const { messages, sendMessage, status, setMessages } = useChat({
    id: `chat-${chatKey}`,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        toolSlug: currentTool?.slug,
      },
    }),
  })

  const isLoading = status === "streaming" || status === "submitted"

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === "assistant" && status === "ready") {
      const text = getMessageText(lastMessage)
      const { suggestions } = parseFollowUpQuestions(text)
      if (suggestions.length) {
        setFollowUpQuestions(suggestions)
      }
    }
  }, [messages, status])

  const handleStartNewChat = useCallback(() => {
    setMessages([])
    setFollowUpQuestions([])
    setInput("")
    setChatKey(prev => prev + 1)
  }, [setMessages])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim() || isLoading) return

      sendMessage({ text: input.trim() })
      setInput("")
      setFollowUpQuestions([])
    },
    [input, isLoading, sendMessage],
  )

  const handleQuestionSelect = useCallback(
    (question: string) => {
      if (isLoading) return
      sendMessage({ text: question })
      setFollowUpQuestions([])
    },
    [isLoading, sendMessage],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit],
  )

  const displayMessages = useMemo(() => {
    return messages.map(message => {
      const text = getMessageText(message)
      if (message.role === "assistant") {
        const { content } = parseFollowUpQuestions(text)
        return { ...message, displayContent: content }
      }
      return { ...message, displayContent: text }
    })
  }, [messages])

  const currentSuggestions = useMemo(() => {
    if (messages.length === 0) return suggestedQuestions
    return followUpQuestions
  }, [messages.length, suggestedQuestions, followUpQuestions])

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cx(
            "fixed inset-0 z-50 bg-black/80",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cx(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex h-[85vh] w-[95vw] max-w-3xl flex-col overflow-hidden",
            "rounded-xl border border-border bg-background shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            DevSuite Assistant Chat
          </DialogPrimitive.Title>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-foreground/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="size-2.5 rounded-full bg-green-500" />
              <span className="font-semibold text-lg">DevSuite Assistant</span>
              {currentTool && (
                <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs text-muted-foreground">
                  {currentTool.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartNewChat}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                title="Start new chat"
              >
                <MessageSquarePlusIcon className="size-4" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
              <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground">
                <XIcon className="size-5" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {displayMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <div className="rounded-full bg-foreground/5 p-6">
                  <svg
                    className="size-12 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-lg">How can I help you?</p>
                  <p className="text-sm text-muted-foreground">
                    Ask me about developer tools, recommendations, or alternatives
                  </p>
                </div>
                <div className="w-full max-w-md">
                  <SuggestedQuestions
                    questions={currentSuggestions}
                    onSelect={handleQuestionSelect}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {displayMessages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-foreground text-background"
                          : "bg-foreground/5 text-foreground"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p className="whitespace-pre-wrap text-sm">{message.displayContent}</p>
                      ) : (
                        <ChatMarkdown>{message.displayContent}</ChatMarkdown>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-foreground/5 px-4 py-3">
                      <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}

                {!isLoading && currentSuggestions.length > 0 && messages.length > 0 && (
                  <div className="mt-4">
                    <SuggestedQuestions
                      questions={currentSuggestions}
                      onSelect={handleQuestionSelect}
                      disabled={isLoading}
                    />
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="border-t border-border p-4">
            <div className="mx-auto flex max-w-2xl items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about developer tools..."
                disabled={isLoading}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <SendIcon className="size-5" />
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
