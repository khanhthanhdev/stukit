"use client"

import { MessageCircleIcon } from "lucide-react"
import { useChatContext } from "./chat-context"

export function ChatButton() {
  const { isOpen, toggleChat } = useChatContext()

  // Button is hidden when modal is open
  if (isOpen) return null

  return (
    <button
      type="button"
      onClick={toggleChat}
      className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      aria-label="Open chat"
    >
      <MessageCircleIcon className="size-6" />
    </button>
  )
}
