"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Info, Play } from "lucide-react"
import { DEFAULT_GLOSSARY } from "@/lib/default-glossary"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { FileDropzone } from "./file-dropzone"
import { GlossaryField } from "./glossary-field"
import { StatusPanel, type RunStatus } from "./status-panel"

const MODELS = [
  { value: "gpt-4o-transcribe", label: "gpt-4o-transcribe" },
  { value: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" },
  { value: "whisper-1", label: "whisper-1" },
  { value: "gpt-4o-transcribe-diarize", label: "gpt-4o-transcribe-diarize" },
]

const LANGUAGES = [
  { value: "es", label: "Espanol" },
  { value: "en", label: "Ingles" },
  { value: "pt", label: "Portugues" },
  { value: "fr", label: "Frances" },
  { value: "auto", label: "Deteccion automatica" },
]

function buildGlossaryPrompt(terms: string[]) {
  return terms.length > 0
    ? `Terminos de ciberseguridad: ${terms.map((term) => `[${term}]`).join(" ")}`
    : ""
}

function estimateProgress(logs: string[], status: string) {
  if (status === "success") return 100
  if (status === "error") return 100
  if (status === "queued") return 10

  const chunkLine = logs.find((line) => /Transcribing chunk\s+\d+\/\d+/i.test(line))
  if (chunkLine) {
    const match = chunkLine.match(/(\d+)\/(\d+)/)
    if (match) {
      const current = Number.parseInt(match[1], 10)
      const total = Number.parseInt(match[2], 10)
      if (total > 0) return 28 + (current / total) * 52
    }
  }

  if (logs.some((line) => line.includes("Extracting audio"))) return 22
  if (logs.some((line) => line.startsWith("SRT:") || line.startsWith("VTT:"))) return 88
  if (logs.some((line) => line.startsWith("Done:"))) return 96
  return 48
}

export function Workspace() {
  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState("gpt-4o-transcribe")
  const [language, setLanguage] = useState("es")
  const [chunk, setChunk] = useState("600")
  const [diarize, setDiarize] = useState(false)
  const [terms, setTerms] = useState<string[]>(DEFAULT_GLOSSARY)

  const [status, setStatus] = useState<RunStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const jobIdRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  async function refreshJob(jobId: string) {
    const response = await fetch(`/api/jobs/${jobId}`)
    const job = await response.json()

    if (!response.ok) {
      throw new Error(job.error || "No se pudo leer el estado del proceso.")
    }

    setLogs(job.logs || [])

    if (job.status === "queued" || job.status === "running") {
      setStatus("running")
      setProgress(estimateProgress(job.logs || [], job.status))
      return
    }

    if (timer.current) clearInterval(timer.current)
    timer.current = null

    if (job.status === "success") {
      setStatus("done")
      setProgress(100)
      return
    }

    setStatus("error")
    setProgress(100)
    setLogs((current) => {
      if (current.some((line) => line === (job.error || "La transcripcion fallo."))) {
        return current
      }
      return [...current, job.error || "La transcripcion fallo."]
    })
  }

  async function start() {
    if (!file || status === "running") return

    setStatus("running")
    setProgress(6)
    setLogs([
      `Cargando "${file.name}"`,
      `Modelo: ${model} | idioma: ${language === "auto" ? "auto" : language}`,
      `Dividiendo en bloques de ${chunk}s`,
    ])

    const formData = new FormData()
    formData.append("file", file)
    formData.append("model", model)
    formData.append("language", language === "auto" ? "" : language)
    formData.append("diarize", String(diarize || model.includes("diarize")))
    formData.append("chunkSeconds", chunk)
    formData.append("glossary", buildGlossaryPrompt(terms))

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo iniciar la transcripcion.")
      }

      jobIdRef.current = payload.jobId
      await refreshJob(payload.jobId)

      if (timer.current) clearInterval(timer.current)
      timer.current = setInterval(() => {
        if (!jobIdRef.current) return
        refreshJob(jobIdRef.current).catch((error: Error) => {
          if (timer.current) clearInterval(timer.current)
          timer.current = null
          setStatus("error")
          setProgress(100)
          setLogs((current) => [...current, error.message])
        })
      }, 2000)
    } catch (error) {
      setStatus("error")
      setProgress(100)
      setLogs((current) => [
        ...current,
        error instanceof Error ? error.message : "No se pudo iniciar la transcripcion.",
      ])
    }
  }

  const diarizeActive = diarize || model.includes("diarize")

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold">Nueva transcripcion</h2>
          <p className="text-sm text-muted-foreground">
            Configura el archivo, el modelo y el contexto antes de iniciar.
          </p>
        </div>

        <FileDropzone file={file} onSelect={setFile} />

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Label className="text-sm">Modelo</Label>
              <Tooltip>
                <TooltipTrigger
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Info del modelo"
                >
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Los modelos gpt-4o-transcribe usan salida json o text y no siempre
                  devuelven segmentos con tiempo para SRT y VTT.
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={model}
              onValueChange={(value) => setModel(value ?? "gpt-4o-transcribe")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Idioma del audio</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value ?? "es")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="chunk" className="mb-1.5 block text-sm">
              Bloque (segundos)
            </Label>
            <Input
              id="chunk"
              type="number"
              min={30}
              value={chunk}
              onChange={(event) => setChunk(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="diarize" className="text-sm font-medium">
              Separar por hablante
            </Label>
            <Switch
              id="diarize"
              checked={diarizeActive}
              onCheckedChange={setDiarize}
              disabled={model.includes("diarize")}
            />
          </div>
          {diarizeActive && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Con diarizacion el glosario se conserva en pantalla pero no se envia al
              modelo, porque gpt-4o-transcribe-diarize no acepta prompt.
            </p>
          )}
        </div>

        <div className="mt-4">
          <GlossaryField terms={terms} onChange={setTerms} disabled={diarizeActive} />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            size="lg"
            className="gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={!file || status === "running"}
            onClick={start}
          >
            <Play className="size-4" />
            Iniciar transcripcion
          </Button>
          <Link
            href="/biblioteca"
            className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}
          >
            Ver biblioteca
          </Link>
        </div>
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <StatusPanel
          status={status}
          progress={progress}
          logs={logs}
          fileName={file?.name ?? null}
        />
      </aside>
    </div>
  )
}
