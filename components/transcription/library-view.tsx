"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  FileText,
  Search,
} from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type TranscriptRun = {
  id: string
  title: string
  model: string
  createdAt: string
  aiTitle?: string
  aiDescription?: string
  transcriptPath?: string | null
  srtPath?: string | null
  vttPath?: string | null
  metadataPath?: string | null
  preview?: string
}

type Entry = {
  id: string
  rawTitle: string
  displayTitle: string
  displaySubtitle: string
  summary: string
  model: string
  createdAt: string
  formats: FormatKey[]
  preview: string
}

type FormatKey = "TXT" | "SRT" | "VTT" | "JSON"
type DateFilter = "all" | "today" | "week"
type SortOrder = "newest" | "oldest"

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function inferFormats(entry: Partial<TranscriptRun>): FormatKey[] {
  const formats: FormatKey[] = []
  if (entry.transcriptPath) formats.push("TXT")
  if (entry.srtPath) formats.push("SRT")
  if (entry.vttPath) formats.push("VTT")
  if (entry.metadataPath) formats.push("JSON")
  return formats
}

function buildEntry(run: TranscriptRun): Entry {
  const preview = run.preview || ""
  const displayTitle = (run.aiTitle?.trim() || run.title).replace(/\s+/g, " ").trim()
  const summary = (run.aiDescription?.trim() || preview).replace(/\s+/g, " ").trim()

  return {
    id: run.id,
    rawTitle: run.title,
    displayTitle,
    displaySubtitle: "",
    summary,
    model: run.model,
    createdAt: run.createdAt,
    formats: inferFormats(run),
    preview,
  }
}

function isSameDay(date: Date, reference: Date) {
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

function isWithinLastDays(date: Date, days: number, reference: Date) {
  return reference.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000
}

export function LibraryView() {
  const [query, setQuery] = useState("")
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelFilter, setModelFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest")

  useEffect(() => {
    async function loadRuns() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch("/api/transcripts")
        const payload = (await response.json()) as { runs?: TranscriptRun[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "No se pudo cargar la biblioteca.")
        setEntries((payload.runs || []).map(buildEntry))
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la biblioteca.")
      } finally {
        setLoading(false)
      }
    }
    loadRuns()
  }, [])

  const modelOptions = useMemo(() => {
    return [...new Set(entries.map((e) => e.model))].sort()
  }, [entries])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const now = new Date()

    return entries
      .filter((entry) => {
        if (modelFilter !== "all" && entry.model !== modelFilter) return false
        const createdAt = new Date(entry.createdAt)
        if (dateFilter === "today" && !isSameDay(createdAt, now)) return false
        if (dateFilter === "week" && !isWithinLastDays(createdAt, 7, now)) return false
        if (!normalizedQuery) return true
        const haystack = [entry.displayTitle, entry.displaySubtitle, entry.summary, entry.rawTitle, entry.model, entry.preview]
          .join(" ").toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      .sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        return sortOrder === "newest" ? diff : -diff
      })
  }, [dateFilter, entries, modelFilter, query, sortOrder])

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 -ml-2 gap-1.5 text-muted-foreground")}
          >
            <ArrowLeft className="size-4" />
            Volver a transcribir
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando transcripciones..." : `${entries.length} transcripciones guardadas.`}
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(18rem,22rem)_10rem_10rem_10rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, fecha o texto..."
              className="pl-9"
            />
          </div>

          <Select value={modelFilter} onValueChange={(v) => setModelFilter(v ?? "all")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Modelo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los modelos</SelectItem>
              {modelOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={(v) => setDateFilter((v as DateFilter) ?? "all")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Fecha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Últimos 7 días</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={(v) => setSortOrder((v as SortOrder) ?? "newest")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Orden" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Más recientes</SelectItem>
              <SelectItem value="oldest">Más antiguas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : loading ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Cargando biblioteca...</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No se encontraron transcripciones.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <Link
              key={entry.id}
              href={`/biblioteca/${encodeURIComponent(entry.id)}`}
              className="group relative flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-secondary/20"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand transition-colors group-hover:bg-brand/25">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-snug">{entry.displayTitle}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.model} · {formatDateLabel(entry.createdAt)}
                  </p>
                </div>
              </div>

              {(entry.summary || entry.preview) && (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {entry.summary || entry.preview}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {entry.formats.map((format) => (
                  <span
                    key={format}
                    className="rounded-md border border-border bg-secondary/45 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {format}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
