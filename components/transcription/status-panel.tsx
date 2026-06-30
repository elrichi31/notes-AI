"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Library,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Users,
  Lightbulb,
  ArrowRight,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export type RunStatus = "idle" | "running" | "done" | "error"

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

export function StatusPanel({
  status,
  progress,
  logs,
  fileName,
  jobId,
}: {
  status: RunStatus
  progress: number
  logs: string[]
  fileName: string | null
  jobId: string | null
}) {
  const [summary, setSummary] = useState<SummaryState>({ status: "idle" })
  const [logsExpanded, setLogsExpanded] = useState(false)

  async function handleSummarize() {
    if (!jobId || summary.status === "loading") return
    setSummary({ status: "loading" })

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
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
    <div className="flex flex-col gap-4">
      {/* Estado principal */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {status === "running" ? (
              <Loader2 className="size-4 animate-spin text-brand" />
            ) : status === "done" ? (
              <CheckCircle2 className="size-4 text-brand" />
            ) : status === "error" ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <Clock className="size-4 text-muted-foreground" />
            )}
            {status === "running"
              ? "Transcribiendo..."
              : status === "done"
                ? "Transcripcion lista"
                : status === "error"
                  ? "Transcripcion fallida"
                  : "Esperando archivo"}
          </h3>
          {status !== "idle" && (
            <span className="font-mono text-xs text-muted-foreground">
              {Math.round(progress)}%
            </span>
          )}
        </div>

        {status === "idle" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Sube un archivo y pulsa <span className="text-foreground">Iniciar transcripcion</span>{" "}
            para comenzar.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <Progress value={progress} className="h-1.5" />
            <p className="truncate text-xs text-muted-foreground">{fileName}</p>
          </div>
        )}
      </div>

      {/* Botón resumir con AI — visible solo cuando la transcripción terminó */}
      {status === "done" && jobId && (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/15">
              <Sparkles className="size-4 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Resumir con AI</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Genera un resumen ejecutivo con temas clave, decisiones, compromisos y tareas.
              </p>
              <Button
                onClick={handleSummarize}
                disabled={summary.status === "loading"}
                className="mt-3 w-full gap-2"
                size="sm"
              >
                {summary.status === "loading" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Analizando reunión...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    {summary.status === "done" ? "Regenerar resumen" : "Generar resumen"}
                  </>
                )}
              </Button>

              {summary.status === "error" && (
                <p className="mt-2 text-xs text-destructive">{summary.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel de resumen */}
      {summary.status === "done" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-brand" />
              Resumen de la reunión
            </h3>
          </div>

          <div className="divide-y divide-border">
            {/* Resumen ejecutivo */}
            {summary.data.overview && (
              <div className="p-4">
                <p className="text-sm leading-relaxed text-foreground/90">
                  {summary.data.overview}
                </p>
              </div>
            )}

            {/* Temas clave */}
            {summary.data.keyTopics.length > 0 && (
              <div className="p-4">
                <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Lightbulb className="size-3.5" />
                  Temas tratados
                </h4>
                <ul className="space-y-1.5">
                  {summary.data.keyTopics.map((topic, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                      {topic}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decisiones */}
            {summary.data.decisions.length > 0 && (
              <div className="p-4">
                <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="size-3.5" />
                  Decisiones tomadas
                </h4>
                <ul className="space-y-1.5">
                  {summary.data.decisions.map((decision, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand" />
                      {decision}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Compromisos */}
            {summary.data.commitments.length > 0 && (
              <div className="p-4">
                <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="size-3.5" />
                  Compromisos
                </h4>
                <ul className="space-y-2.5">
                  {summary.data.commitments.map((c, i) => (
                    <li key={i} className="rounded-lg border border-border bg-background p-2.5">
                      <div className="flex items-start justify-between gap-2">
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

            {/* Tareas accionables */}
            {summary.data.actionItems.length > 0 && (
              <div className="p-4">
                <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ListChecks className="size-3.5" />
                  Tareas a realizar
                </h4>
                <ul className="space-y-1.5">
                  {summary.data.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-border text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Próximos pasos */}
            {summary.data.nextSteps && (
              <div className="p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ArrowRight className="size-3.5" />
                  Próximos pasos
                </h4>
                <p className="text-sm text-foreground/85">{summary.data.nextSteps}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actividad / logs */}
      <div className="rounded-xl border border-border bg-card p-4">
        <button
          onClick={() => setLogsExpanded((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-muted-foreground" />
            Actividad
          </h3>
          {logsExpanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {!logsExpanded && (
          <p className="mt-1 text-xs text-muted-foreground">Estado del proceso y salida del CLI.</p>
        )}

        {logsExpanded && (
          <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-border bg-background p-3">
            {logs.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">Todavia no hay ejecuciones.</p>
            ) : (
              <ul className="space-y-1.5">
                {logs.map((line, index) => (
                  <li
                    key={`${line}-${index}`}
                    className="flex gap-2 font-mono text-xs text-muted-foreground"
                  >
                    <span className="text-brand">{">"}</span>
                    <span className="text-foreground/90">{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Biblioteca */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Library className="size-4 text-muted-foreground" />
          Biblioteca
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          El historial completo vive en una vista aparte para dejar mas espacio a la transcripcion
          actual.
        </p>
        <Link
          href="/biblioteca"
          className={cn(buttonVariants({ variant: "secondary" }), "mt-3 w-full")}
        >
          Abrir biblioteca completa
        </Link>
      </div>
    </div>
  )
}
