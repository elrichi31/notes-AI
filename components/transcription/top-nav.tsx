"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AudioLines, Library, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

export function TopNav() {
  const pathname = usePathname()
  const tabs = [
    { href: "/", id: "transcribe", label: "Transcribir", icon: Mic },
    { href: "/biblioteca", id: "library", label: "Biblioteca", icon: Library },
  ]

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-brand/15 text-brand">
            <AudioLines className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-wide">NOTES AI</span>
        </div>

        <nav className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {tabs.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
