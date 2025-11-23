import type { Viewport } from "next"
import type { PropsWithChildren } from "react"
import Providers from "~/app/providers"
import { GeistSans, UncutSans } from "~/lib/fonts"

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" className={`${UncutSans.variable} ${GeistSans.variable}`}>
      <body className="min-h-dvh flex flex-col bg-background text-foreground font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
