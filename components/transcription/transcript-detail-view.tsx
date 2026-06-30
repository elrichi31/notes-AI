"use client"

import { useEffect, useState } from "react"
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
  Sparkles,
  Users,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type FormatKey = "TXT" | "SRT" | "VTT" | "JSON"

type TranscriptRun = {
  id: string
  title: string
  model: string
  createdAt: string
  diarize: boolean
  aiTitle?: string
  aiDescription?: string
  transcriptPath?: string | null
  srtPath?: string | null
  vttPath?: string | null
  metadataPath?: string | null
  transcriptContent?: string
  srtContent?: string
  vttContent?: string
  metadata?: unknown
}

type Commitment = { person: string; task: string; dueDate: string | null }

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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function inferFormats(run: Partial<TranscriptRun>): FormatKey[] {
  const formats: FormatKey[] = []
  if (run.transcriptPath) formats.push("TXT")
  if (run.srtPath) formats.push("SRT")
  if (run.vttPath) formats.push("VTT")
  if (run.metadataPath) formats.push("JSON")
  return formats
}

function getFormatContent(run: TranscriptRun, format: FormatKey): string {
  if (format === "TXT") return run.transcriptContent || ""
  if (format === "SRT") return run.srtContent || ""
  if (format === "VTT") return run.vttContent || ""
  return JSON.stringify(run.metadata ?? {}, null, 2)
}

function compactWhitespace(v: string) {
  return v.replace(/\s+/g, " ").trim()
}

function resolveTitle(run: TranscriptRun) {
  return compactWhitespace(run.aiTitle?.trim() || run.title)
}

export function TranscriptDetailView({ runId }: { runId: string }) {
  const [run, setRun] = useState<TranscriptRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [viewFormat, setViewFormat] = useState<FormatKey>("TXT")
  const [copyState, setCopyState] = useState<"idle" | "done">("idle")

  const [summary, setSummary] = useState<SummaryState>({ status: "idle" })

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/transcript?run=${encodeURIComponent(runId)}`)
        const payload = await res.json()
        if (!res.ok) throw new Error(payload.error || "No se pudo cargar la transcripción.")
        const loaded: TranscriptRun = payload.run
        setRun(loaded)
        const formats = inferFormats(loaded)
        setViewFormat(formats.includes("TXT") ? "TXT" : formats[0] ?? "TXT")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar la transcripción.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [runId])

  async function handleSummarize() {
    if (!run || summary.status === "loading") return
    setSummary({ status: "loading" })
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
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

  async function copyContent() {
    if (!run) return
    await navigator.clipboard.writeText(getFormatContent(run, viewFormat))
    setCopyState("done")
    window.setTimeout(() => setCopyState("idle"), 1800)
  }

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando transcripción...
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{error || "Transcripción no encontrada."}</p>
        <Link href="/biblioteca" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <ArrowLeft className="size-4" />
          Volver a la biblioteca
        </Link>
      </div>
    )
  }

  const formats = inferFormats(run)
  const content = getFormatContent(run, viewFormat)
  const title = resolveTitle(run)

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/biblioteca"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2 gap-1.5 text-muted-foreground")}
        >
          <ArrowLeft className="size-4" />
          Biblioteca
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {formatDateLabel(run.createdAt)} · {run.model}
              {run.diarize && " · diarizado"}
            </p>
            {run.aiDescription && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {run.aiDescription}
              </p>
            )}
          </div>

          <Button
            onClick={handleSummarize}
            disabled={summary.status === "loading"}
            variant={summary.status === "done" ? "secondary" : "default"}
            className="shrink-0 gap-2"
          >
            {summary.status === "loading" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {summary.status === "done" ? "Regenerar resumen" : "Resumir con AI"}
              </>
            )}
          </Button>
        </div>

        {summary.status === "error" && (
          <p className="mt-2 text-sm text-destructive">{summary.message}</p>
        )}
      </div>

      {/* Layout principal */}
      <div className={cn(
        "grid gap-6",
        summary.status === "done" ? "lg:grid-cols-[1fr_1.2fr]" : "grid-cols-1"
      )}>
        {/* Panel resumen AI */}
        {summary.status === "done" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-brand/20 bg-brand/5 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-brand/15 bg-brand/10 px-5 py-3">
                <Sparkles className="size-4 text-brand" />
                <span className="text-sm font-semibold">Resumen ejecutivo</span>
              </div>

              <div className="divide-y divide-brand/10">
                {summary.data.overview && (
                  <div className="px-5 py-4">
                    <p className="text-sm leading-relaxed text-foreground/90">{summary.data.overview}</p>
                  </div>
                )}

                {summary.data.keyTopics.length > 0 && (
                  <div className="px-5 py-4">
                    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Lightbulb className="size-3.5" />
                      Temas tratados
                    </h3>
                    <ul className="space-y-2">
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
                  <div className="px-5 py-4">
                    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <CheckCircle2 className="size-3.5" />
                      Decisiones tomadas
                    </h3>
                    <ul className="space-y-2">
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
            </div>

            {summary.data.commitments.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Compromisos</span>
                </div>
                <ul className="divide-y divide-border">
                  {summary.data.commitments.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                        {c.person.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-brand">{c.person}</span>
                          {c.dueDate && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {c.dueDate}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-foreground/85">{c.task}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.data.actionItems.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
                  <ListChecks className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Tareas a realizar</span>
                </div>
                <ul className="divide-y divide-border">
                  {summary.data.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-background text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </span>
                      <p className="text-sm text-foreground/85">{item}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.data.nextSteps && (
              <div className="rounded-2xl border border-border bg-card px-5 py-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ArrowRight className="size-3.5" />
                  Próximos pasos
                </h3>
                <p className="text-sm leading-relaxed text-foreground/85">{summary.data.nextSteps}</p>
              </div>
            )}
          </div>
        )}

        {/* Panel transcripción */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {formats.map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setViewFormat(format)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
                    viewFormat === format
                      ? "border-brand/50 bg-brand/10 text-brand"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {format}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyContent}
                disabled={!content}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-1.5")}
              >
                {copyState === "done" ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copyState === "done" ? "Copiado" : `Copiar ${viewFormat}`}
              </button>

              <details className="group relative">
                <summary className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "list-none gap-1.5 [&::-webkit-details-marker]:hidden")}>
                  <Download className="size-4" />
                  Descargar
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-44 rounded-xl border border-border bg-popover p-2 shadow-lg">
                  {formats.map((format) => (
                    <a
                      key={format}
                      href={`/api/download?run=${encodeURIComponent(run.id)}&format=${format.toLowerCase()}`}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                    >
                      <FileText className="size-4 text-muted-foreground" />
                      Descargar {format}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          </div>

          <div
            className={cn(
              "overflow-y-auto px-5 py-5 text-sm text-foreground",
              summary.status === "done" ? "max-h-[calc(100vh-12rem)] min-h-[500px]" : "max-h-[680px] min-h-[560px]",
              viewFormat === "TXT" ? "font-sans leading-7 whitespace-pre-wrap" : "font-mono leading-6 whitespace-pre overflow-x-auto"
            )}
          >
            {content || <span className="text-muted-foreground">Este formato no tiene contenido disponible.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
