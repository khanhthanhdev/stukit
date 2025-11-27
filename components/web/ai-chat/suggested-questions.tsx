"use client"

import { SparklesIcon } from "lucide-react"

type SuggestedQuestionsProps = {
  questions: string[]
  onSelect: (question: string) => void
  disabled?: boolean
}

export function SuggestedQuestions({ questions, onSelect, disabled }: SuggestedQuestionsProps) {
  if (!questions.length) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SparklesIcon className="size-3" />
        <span>Suggested questions</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map(question => (
          <button
            key={question}
            type="button"
            onClick={() => onSelect(question)}
            disabled={disabled}
            className="rounded-full border border-border/50 bg-background/50 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-foreground/5 disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
