"use client"

import { useEffect } from "react"
import { useChatContext } from "./chat-context"

type ToolContextSetterProps = {
  slug: string
  name: string
}

export function ToolContextSetter({ slug, name }: ToolContextSetterProps) {
  const { setCurrentTool } = useChatContext()

  useEffect(() => {
    setCurrentTool({ slug, name })
    return () => setCurrentTool(null)
  }, [slug, name, setCurrentTool])

  return null
}
