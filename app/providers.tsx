"use client"

import { NuqsAdapter } from "nuqs/adapters/next/app"
import type { PropsWithChildren } from "react"

export default function Providers({ children }: PropsWithChildren) {
  return <NuqsAdapter>{children}</NuqsAdapter>
}
