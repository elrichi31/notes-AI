"use client"

import Link from "next/link"
import { Activity, AlertCircle, CheckCircle2, Clock, Library, Loader2 } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

export type RunStatus = "idle" | "running" | "done" | "error"

export function StatusPanel({
  status,
  progress,
  logs,
  fileName,
}: {
  status: RunStatus
  progress: number
  logs: string[]
  fileName: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
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
            Sube un archivo y pulsa <span className="text-foreground">Iniciar transcripcion</span> para
            comenzar.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <Progress value={progress} className="h-1.5" />
            <p className="truncate text-xs text-muted-foreground">{fileName}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-muted-foreground" />
          Actividad
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Estado del proceso y salida del CLI.
        </p>
        <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-border bg-background p-3">
          {logs.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              Todavia no hay ejecuciones.
            </p>
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
      </div>

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
          className={`${buttonVariants({ variant: "secondary" })} mt-3 w-full`}
        >
          Abrir biblioteca completa
        </Link>
      </div>
    </div>
  )
}
