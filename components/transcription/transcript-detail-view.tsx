"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
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
  Star,
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

type ActionItem = { item: string; owner: string | null; priority: string | null }
type Commitment = { person: string; task: string; dueDate: string | null }
type Decision = { decision: string; rationale: string | null }
type KeyTopic = { title: string; detail: string }

type MeetingSummary = {
  overview: string
  highlights: string[]
  keyTopics: KeyTopic[]
  decisions: Decision[]
  commitments: Commitment[]
  actionItems: ActionItem[]
  blockers: string[]
  nextSteps: string | null
  sentiment: string | null
}

type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: MeetingSummary }
  | { status: "error"; message: string }

const PRIORITY_STYLES: Record<string, string> = {
  alta: "bg-red-500/10 text-red-500 border-red-500/20",
  media: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  baja: "bg-green-500/10 text-green-600 border-green-500/20",
}

const SENTIMENT_STYLES: Record<string, { label: string; cls: string }> = {
  positivo: { label: "Positivo", cls: "bg-green-500/10 text-green-600 border-green-500/20" },
  neutral:  { label: "Neutral",  cls: "bg-muted text-muted-foreground border-border" },
  tenso:    { label: "Tenso",    cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  mixto:    { label: "Mixto",    cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
}

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("es", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date)
}

function inferFormats(run: Partial<TranscriptRun>): FormatKey[] {
  const f: FormatKey[] = []
  if (run.transcriptPath) f.push("TXT")
  if (run.srtPath) f.push("SRT")
  if (run.vttPath) f.push("VTT")
  if (run.metadataPath) f.push("JSON")
  return f
}

function getFormatContent(run: TranscriptRun, format: FormatKey): string {
  if (format === "TXT") return run.transcriptContent || ""
  if (format === "SRT") return run.srtContent || ""
  if (format === "VTT") return run.vttContent || ""
  return JSON.stringify(run.metadata ?? {}, null, 2)
}

function resolveTitle(run: TranscriptRun) {
  return (run.aiTitle?.trim() || run.title).replace(/\s+/g, " ").trim()
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  )
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
  const hasSummary = summary.status === "done"
  const s = hasSummary ? summary.data : null

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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
              {s?.sentiment && SENTIMENT_STYLES[s.sentiment] && (
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", SENTIMENT_STYLES[s.sentiment].cls)}>
                  {SENTIMENT_STYLES[s.sentiment].label}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {formatDateLabel(run.createdAt)} · {run.model}{run.diarize ? " · diarizado" : ""}
            </p>
            {run.aiDescription && !hasSummary && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{run.aiDescription}</p>
            )}
          </div>

          <Button
            onClick={handleSummarize}
            disabled={summary.status === "loading"}
            variant={hasSummary ? "secondary" : "default"}
            className="shrink-0 gap-2"
          >
            {summary.status === "loading" ? (
              <><Loader2 className="size-4 animate-spin" />Analizando...</>
            ) : (
              <><Sparkles className="size-4" />{hasSummary ? "Regenerar resumen" : "Resumir con AI"}</>
            )}
          </Button>
        </div>

        {summary.status === "error" && (
          <p className="mt-2 text-sm text-destructive">{summary.message}</p>
        )}
      </div>

      {/* Layout principal */}
      <div className={cn("grid gap-6", hasSummary ? "xl:grid-cols-[1fr_1fr]" : "grid-cols-1")}>

        {/* ── Panel resumen ── */}
        {hasSummary && s && (
          <div className="flex flex-col gap-4 xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto xl:pr-1">

            {/* Overview */}
            <div className="rounded-2xl border border-brand/20 bg-brand/5 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-brand/15 bg-brand/10 px-5 py-3">
                <Sparkles className="size-4 text-brand" />
                <span className="text-sm font-semibold">Resumen ejecutivo</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm leading-relaxed text-foreground/90">{s.overview}</p>
              </div>
            </div>

            {/* Highlights */}
            {s.highlights.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <SectionHeader icon={<Star className="size-4" />} label="Puntos clave" />
                <ul className="divide-y divide-border">
                  {s.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand">
                        {i + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-foreground/85">{h}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key topics */}
            {s.keyTopics.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <SectionHeader icon={<Lightbulb className="size-4" />} label="Temas tratados" />
                <ul className="divide-y divide-border">
                  {s.keyTopics.map((t, i) => (
                    <li key={i} className="px-5 py-4">
                      <p className="text-sm font-semibold text-foreground">{t.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/75">{t.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decisions */}
            {s.decisions.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <SectionHeader icon={<CheckCircle2 className="size-4" />} label="Decisiones tomadas" />
                <ul className="divide-y divide-border">
                  {s.decisions.map((d, i) => (
                    <li key={i} className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{d.decision}</p>
                          {d.rationale && (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.rationale}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Commitments */}
            {s.commitments.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <SectionHeader icon={<Users className="size-4" />} label="Compromisos" />
                <ul className="divide-y divide-border">
                  {s.commitments.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                        {c.person.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-brand">{c.person}</span>
                          {c.dueDate && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {c.dueDate}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-foreground/85">{c.task}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action items */}
            {s.actionItems.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <SectionHeader icon={<ListChecks className="size-4" />} label="Tareas a realizar" />
                <ul className="divide-y divide-border">
                  {s.actionItems.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-background text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground/85">{a.item}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {a.owner && (
                            <span className="text-xs text-muted-foreground">→ {a.owner}</span>
                          )}
                          {a.priority && PRIORITY_STYLES[a.priority] && (
                            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", PRIORITY_STYLES[a.priority])}>
                              {a.priority}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Blockers */}
            {s.blockers.length > 0 && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-destructive/15 bg-destructive/10 px-5 py-3">
                  <AlertTriangle className="size-4 text-destructive" />
                  <span className="text-sm font-semibold">Riesgos y bloqueadores</span>
                </div>
                <ul className="divide-y divide-destructive/10">
                  {s.blockers.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 px-5 py-3">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      <p className="text-sm text-foreground/85">{b}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next steps */}
            {s.nextSteps && (
              <div className="rounded-2xl border border-border bg-card px-5 py-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ArrowRight className="size-3.5" />
                  Próximos pasos
                </h3>
                <p className="text-sm leading-relaxed text-foreground/85">{s.nextSteps}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Panel transcripción ── */}
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

          <div className={cn(
            "overflow-y-auto px-5 py-5 text-sm text-foreground",
            hasSummary
              ? "xl:max-h-[calc(100vh-10rem)] min-h-[500px]"
              : "max-h-[700px] min-h-[560px]",
            viewFormat === "TXT"
              ? "font-sans leading-7 whitespace-pre-wrap"
              : "font-mono leading-6 whitespace-pre overflow-x-auto"
          )}>
            {content || <span className="text-muted-foreground">Este formato no tiene contenido disponible.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
