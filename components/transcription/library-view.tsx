"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  Search,
  Sparkles,
  Users,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
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

type TranscriptDetail = TranscriptRun & {
  transcriptContent?: string
  srtContent?: string
  vttContent?: string
  metadata?: unknown
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

type Commitment = {
  person: string
  task: string
  dueDate: string | null
}

type MeetingSummary = {
  overview: string
  keyTopics: string[]
  decisions: string[]
  commitments: Commitment[]
  actionItems: string[]
  nextSteps: string | null
}

type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: MeetingSummary }
  | { status: "error"; message: string }

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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function isRawTimestampTitle(title: string) {
  return /^\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2}$/.test(title)
}

function sentenceCasePreview(preview: string) {
  const compact = compactWhitespace(preview)
  if (!compact) return "Reunion sin titulo"

  const firstSentence = compact.split(/[.!?]/)[0] || compact
  const words = firstSentence.split(" ").slice(0, 8).join(" ")
  const trimmed = words.slice(0, 62).trim()
  return trimmed || "Reunion sin titulo"
}

function splitLongTitle(title: string, fallbackSummary: string) {
  const cleanTitle = compactWhitespace(title)

  if (!cleanTitle || isRawTimestampTitle(cleanTitle)) {
    return {
      displayTitle: sentenceCasePreview(fallbackSummary),
      displaySubtitle: "",
    }
  }

  const parentheticalIndex = cleanTitle.indexOf(" (")
  if (parentheticalIndex > 0) {
    return {
      displayTitle: cleanTitle.slice(0, parentheticalIndex).trim(),
      displaySubtitle: cleanTitle.slice(parentheticalIndex + 1).replace(/[()]/g, "").trim(),
    }
  }

  if (cleanTitle.length > 72) {
    const shortTitle = cleanTitle.slice(0, 69).trimEnd()
    return {
      displayTitle: `${shortTitle}...`,
      displaySubtitle: "",
    }
  }

  return {
    displayTitle: cleanTitle,
    displaySubtitle: "",
  }
}

function buildEntry(run: TranscriptRun): Entry {
  const preview = run.preview || ""
  const summary = compactWhitespace(run.aiDescription?.trim() || preview)
  const preferredTitle = compactWhitespace(run.aiTitle?.trim() || run.title)
  const { displayTitle, displaySubtitle } = splitLongTitle(preferredTitle, summary || preview)

  return {
    id: run.id,
    rawTitle: run.title,
    displayTitle,
    displaySubtitle,
    summary,
    model: run.model,
    createdAt: run.createdAt,
    formats: inferFormats(run),
    preview,
  }
}

function getFormatValue(run: TranscriptDetail | null, format: FormatKey) {
  if (!run) return ""

  if (format === "TXT") return run.transcriptContent || ""
  if (format === "SRT") return run.srtContent || ""
  if (format === "VTT") return run.vttContent || ""
  return JSON.stringify(run.metadata ?? {}, null, 2)
}

function formatExtension(format: FormatKey) {
  return format.toLowerCase()
}

function isSameDay(date: Date, reference: Date) {
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

function isWithinLastDays(date: Date, days: number, reference: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  return reference.getTime() - date.getTime() <= days * msPerDay
}

export function LibraryView() {
  const [query, setQuery] = useState("")
  const [entries, setEntries] = useState<Entry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<TranscriptDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "done">("idle")
  const [viewFormat, setViewFormat] = useState<FormatKey>("TXT")
  const [summary, setSummary] = useState<SummaryState>({ status: "idle" })
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

        if (!response.ok) {
          throw new Error(payload.error || "No se pudo cargar la biblioteca.")
        }

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
    return [...new Set(entries.map((entry) => entry.model))].sort()
  }, [entries])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const now = new Date()

    const nextEntries = entries.filter((entry) => {
      if (modelFilter !== "all" && entry.model !== modelFilter) return false

      const createdAt = new Date(entry.createdAt)
      if (dateFilter === "today" && !isSameDay(createdAt, now)) return false
      if (dateFilter === "week" && !isWithinLastDays(createdAt, 7, now)) return false

      if (!normalizedQuery) return true

      const haystack = [
        entry.displayTitle,
        entry.displaySubtitle,
        entry.summary,
        entry.rawTitle,
        entry.model,
        formatDateLabel(entry.createdAt),
        entry.preview,
      ]
        .join(" ")
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })

    nextEntries.sort((a, b) => {
      const left = new Date(a.createdAt).getTime()
      const right = new Date(b.createdAt).getTime()
      return sortOrder === "newest" ? right - left : left - right
    })

    return nextEntries
  }, [dateFilter, entries, modelFilter, query, sortOrder])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
      setSelectedRun(null)
      return
    }

    if (!selectedId || !filtered.some((entry) => entry.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  useEffect(() => {
    async function loadDetail(runId: string) {
      try {
        setLoadingDetail(true)
        setDetailError(null)
        setCopyState("idle")

        const response = await fetch(`/api/transcript?run=${encodeURIComponent(runId)}`)
        const payload = (await response.json()) as { run?: TranscriptDetail; error?: string }

        if (!response.ok) {
          throw new Error(payload.error || "No se pudo abrir la transcripcion.")
        }

        const run = payload.run ?? null
        setSelectedRun(run)

        const availableFormats = inferFormats(run ?? {})
        const defaultFormat = availableFormats.includes("TXT")
          ? "TXT"
          : availableFormats[0] ?? "JSON"

        setViewFormat(defaultFormat)
      } catch (loadError) {
        setSelectedRun(null)
        setDetailError(loadError instanceof Error ? loadError.message : "No se pudo abrir la transcripcion.")
      } finally {
        setLoadingDetail(false)
      }
    }

    if (!selectedId) return
    setSummary({ status: "idle" })
    loadDetail(selectedId)
  }, [selectedId])

  const availableDetailFormats = useMemo(() => {
    return inferFormats(selectedRun ?? {})
  }, [selectedRun])

  const selectedContent = useMemo(() => {
    return getFormatValue(selectedRun, viewFormat)
  }, [selectedRun, viewFormat])

  async function copyCurrentContent() {
    if (!selectedContent) return
    await navigator.clipboard.writeText(selectedContent)
    setCopyState("done")
    window.setTimeout(() => setCopyState("idle"), 1800)
  }

  async function handleSummarize() {
    if (!selectedRun || summary.status === "loading") return
    setSummary({ status: "loading" })
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: selectedRun.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar el resumen.")
      setSummary({ status: "done", data: json.summary })
    } catch (err) {
      setSummary({
        status: "error",
        message: err instanceof Error ? err.message : "Error al generar el resumen.",
      })
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "mb-2 -ml-2 gap-1.5 text-muted-foreground"
            )}
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
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, fecha o texto..."
              className="pl-9"
            />
          </div>

          <Select value={modelFilter} onValueChange={(value) => setModelFilter(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los modelos</SelectItem>
              {modelOptions.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={(value) => setDateFilter((value as DateFilter) ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Fecha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Ultimos 7 dias</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={(value) => setSortOrder((value as SortOrder) ?? "newest")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Orden" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Mas recientes</SelectItem>
              <SelectItem value="oldest">Mas antiguas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {error}
        </p>
      ) : loading ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Cargando biblioteca...
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.82fr_1.58fr]">
          <section className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-2 px-2 pt-1">
              <h2 className="text-sm font-semibold">Transcripciones</h2>
              <p className="text-xs text-muted-foreground">
                Titulo fuerte, contexto breve y acceso rapido por formato.
              </p>
            </div>

            <div className="grid gap-2">
              {filtered.map((entry) => {
                const active = entry.id === selectedId
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className={cn(
                      "relative rounded-xl border px-4 py-3 text-left transition-colors",
                      active
                        ? "border-brand/55 bg-brand/10 shadow-[inset_0_0_0_1px_rgba(90,204,194,0.12)]"
                        : "border-border bg-background hover:border-brand/30 hover:bg-secondary/20",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-3 left-0 w-1 rounded-r-full transition-opacity",
                        active ? "bg-brand opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">{entry.displayTitle}</h3>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {entry.model} | {formatDateLabel(entry.createdAt)}
                        </p>

                        {entry.displaySubtitle && (
                          <p className="mt-1 truncate text-[11px] text-muted-foreground/85">
                            {entry.displaySubtitle}
                          </p>
                        )}

                        {(entry.summary || entry.preview) && (
                          <p className="mt-2 line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">
                            {entry.summary || entry.preview}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {entry.formats.map((format) => (
                            <a
                              key={format}
                              href={`/api/download?run=${encodeURIComponent(entry.id)}&format=${formatExtension(format)}`}
                              onClick={(event) => event.stopPropagation()}
                              className="rounded-md border border-border bg-secondary/45 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand/35 hover:bg-secondary hover:text-foreground"
                              title={`Descargar ${format} | archivo: ${entry.rawTitle}`}
                            >
                              {format}
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}

              {filtered.length === 0 && (
                <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                  No se encontraron transcripciones.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            {!selectedId ? (
              <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Selecciona una transcripcion para verla.
              </div>
            ) : loadingDetail ? (
              <div className="flex min-h-72 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Cargando transcripcion...
              </div>
            ) : detailError ? (
              <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                {detailError}
              </div>
            ) : selectedRun ? (
              <div>
                <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 max-w-3xl">
                    <h2 className="text-balance text-xl font-semibold leading-tight">
                      {buildEntry(selectedRun).displayTitle}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedRun.model} | {formatDateLabel(selectedRun.createdAt)}
                    </p>
                    {buildEntry(selectedRun).displaySubtitle && (
                      <p className="mt-1 text-xs text-muted-foreground/85">
                        {buildEntry(selectedRun).displaySubtitle}
                      </p>
                    )}
                    {(selectedRun.aiDescription || "").trim() && (
                      <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {selectedRun.aiDescription}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <Button
                      onClick={handleSummarize}
                      disabled={summary.status === "loading"}
                      variant={summary.status === "done" ? "secondary" : "default"}
                      size="sm"
                      className="gap-2"
                    >
                      {summary.status === "loading" ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Analizando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          {summary.status === "done" ? "Regenerar resumen" : "Resumir con AI"}
                        </>
                      )}
                    </Button>
                    {summary.status === "error" && (
                      <p className="mt-1.5 max-w-48 text-xs text-destructive">{summary.message}</p>
                    )}
                  </div>
                </div>

                {/* Panel de resumen AI */}
                {summary.status === "done" && (
                  <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-brand/15 bg-brand/10 px-4 py-2.5">
                      <Sparkles className="size-4 text-brand" />
                      <span className="text-sm font-semibold text-foreground">Resumen de la reunión</span>
                    </div>

                    <div className="divide-y divide-brand/10">
                      {summary.data.overview && (
                        <div className="px-4 py-3">
                          <p className="text-sm leading-relaxed text-foreground/90">
                            {summary.data.overview}
                          </p>
                        </div>
                      )}

                      <div className="grid gap-0 sm:grid-cols-2">
                        {summary.data.keyTopics.length > 0 && (
                          <div className="px-4 py-3 sm:border-r sm:border-brand/10">
                            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <Lightbulb className="size-3.5" />
                              Temas tratados
                            </h4>
                            <ul className="space-y-1.5">
                              {summary.data.keyTopics.map((topic, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                                  {topic}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {summary.data.decisions.length > 0 && (
                          <div className="px-4 py-3">
                            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <CheckCircle2 className="size-3.5" />
                              Decisiones
                            </h4>
                            <ul className="space-y-1.5">
                              {summary.data.decisions.map((d, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand" />
                                  {d}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {summary.data.commitments.length > 0 && (
                        <div className="px-4 py-3">
                          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Users className="size-3.5" />
                            Compromisos
                          </h4>
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {summary.data.commitments.map((c, i) => (
                              <li key={i} className="rounded-lg border border-border bg-background/60 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-brand">{c.person}</span>
                                  {c.dueDate && (
                                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                      {c.dueDate}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-foreground/85">{c.task}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {summary.data.actionItems.length > 0 && (
                        <div className="px-4 py-3">
                          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <ListChecks className="size-3.5" />
                            Tareas a realizar
                          </h4>
                          <ul className="space-y-1.5">
                            {summary.data.actionItems.map((item, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-border bg-background text-xs text-muted-foreground">
                                  {i + 1}
                                </span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {summary.data.nextSteps && (
                        <div className="px-4 py-3">
                          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <ArrowRight className="size-3.5" />
                            Próximos pasos
                          </h4>
                          <p className="text-sm text-foreground/85">{summary.data.nextSteps}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-border bg-background">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {availableDetailFormats.map((format) => (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setViewFormat(format)}
                          className={cn(
                            "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
                            viewFormat === format
                              ? "border-brand/50 bg-brand/10 text-brand"
                              : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {format}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={copyCurrentContent}
                        disabled={!selectedContent}
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "sm" }),
                          "gap-1.5"
                        )}
                      >
                        {copyState === "done" ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copyState === "done" ? "Copiado" : `Copiar ${viewFormat}`}
                      </button>

                      <details className="group relative">
                        <summary
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "list-none gap-1.5 [&::-webkit-details-marker]:hidden"
                          )}
                        >
                          <Download className="size-4" />
                          Descargar
                          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                        </summary>

                        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-44 rounded-xl border border-border bg-popover p-2 shadow-lg">
                          {availableDetailFormats.map((format) => (
                            <a
                              key={format}
                              href={`/api/download?run=${encodeURIComponent(selectedRun.id)}&format=${formatExtension(format)}`}
                              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                            >
                              <FileText className="size-4 text-muted-foreground" />
                              <span>{`Descargar ${format}`}</span>
                            </a>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "max-h-[560px] min-h-[460px] overflow-y-auto px-4 py-4 text-sm text-foreground",
                      viewFormat === "TXT"
                        ? "font-sans leading-7 whitespace-pre-wrap"
                        : "overflow-x-auto font-mono leading-6 whitespace-pre-wrap"
                    )}
                  >
                    {selectedContent || "Este formato no tiene contenido disponible."}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
