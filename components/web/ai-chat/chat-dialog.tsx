"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/admin/ui/dialog"
import { Button } from "~/components/admin/ui/button"
import { LoaderIcon, SendIcon, TrashIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  const { isOpen, setIsOpen, currentTool, suggestedQuestions, startNewChat } = useChatContext()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState("")
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])

  const { messages, sendMessage, status, setMessages } = useChat({
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
      inputRef.current?.focus()
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex h-[90vh] max-w-4xl flex-col p-0">
        <DialogHeader className="flex-shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-green-500" />
                <DialogTitle>DevSuite Assistant</DialogTitle>
              </div>
              {currentTool && (
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-sm text-muted-foreground">
                  {currentTool.name}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              className="text-muted-foreground hover:text-foreground"
            >
              <TrashIcon className="size-4" />
              <span className="ml-2 hidden sm:inline">New Chat</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {displayMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center px-6">
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
                <h3 className="text-lg font-semibold mb-2">How can I help you?</h3>
                <p className="text-muted-foreground">Ask me about developer tools, get recommendations, or explore new technologies</p>
              </div>
              <div className="w-full max-w-2xl">
                <SuggestedQuestions
                  questions={currentSuggestions}
                  onSelect={handleQuestionSelect}
                  disabled={isLoading}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  {displayMessages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                          message.role === "user"
                            ? "bg-foreground text-background"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {message.role === "user" ? (
                          <p className="whitespace-pre-wrap">{message.displayContent}</p>
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ChatMarkdown>{message.displayContent}</ChatMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3">
                        <LoaderIcon className="size-4 animate-spin" />
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
              </div>

              <div className="flex-shrink-0 border-t p-4">
                <form onSubmit={handleSubmit}>
                  <div className="flex items-end gap-3">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about developer tools..."
                      disabled={isLoading}
                      rows={1}
                      className="flex-1 resize-none rounded-lg border-2 bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="flex-shrink-0 px-3"
                    >
                      <SendIcon className="size-4" />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
