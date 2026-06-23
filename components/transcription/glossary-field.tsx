"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Plus, Search, Tag, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export function GlossaryField({
  terms,
  onChange,
  disabled,
}: {
  terms: string[]
  onChange: (terms: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")

  function addTerms(raw: string) {
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    if (parts.length === 0) return

    const next = [...terms]
    for (const part of parts) {
      if (!next.some((term) => term.toLowerCase() === part.toLowerCase())) {
        next.push(part)
      }
    }

    onChange(next)
    setDraft("")
  }

  function remove(term: string) {
    onChange(terms.filter((current) => current !== term))
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return terms
    return terms.filter((term) =>
      term.toLowerCase().includes(query.toLowerCase())
    )
  }, [terms, query])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border bg-secondary/30"
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Tag className="size-4 text-muted-foreground" />
          Glosario de terminos
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
            {terms.length}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border px-3.5 pb-3.5 pt-3">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addTerms(draft)
              }
            }}
            placeholder="Escribe una palabra o pega varias separadas por coma"
            className="h-9"
          />
          <Button
            type="button"
            variant="secondary"
            className="h-9 shrink-0 gap-1"
            disabled={disabled || !draft.trim()}
            onClick={() => addTerms(draft)}
          >
            <Plus className="size-4" />
            Agregar
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Presiona Enter o usa comas para agregar etiquetas.
        </p>

        {terms.length > 0 && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el glosario..."
              className="h-9 pl-9"
            />
          </div>
        )}

        <div className="mt-3 max-h-48 overflow-y-auto rounded-md">
          <div className="flex flex-wrap gap-1.5">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                {terms.length === 0 ? "Aun no hay terminos." : "Sin coincidencias."}
              </p>
            ) : (
              filtered.map((term) => (
                <span
                  key={term}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs"
                >
                  {term}
                  <button
                    type="button"
                    onClick={() => remove(term)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Quitar ${term}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
