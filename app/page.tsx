import { Sparkles } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Workspace } from "@/components/transcription/workspace"

export default function Page() {
  return (
    <TooltipProvider>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-card to-background p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
              Transcribe, organiza y revisa tus reuniones
            </h1>
            <p className="mt-1 max-w-xl text-pretty text-sm text-muted-foreground">
              Sube audio o video, elige el modelo de OpenAI y genera subtitulos SRT y VTT desde una sola pantalla.
            </p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
            <Sparkles className="size-3.5" />
            Nuevo: glosario y selector de modelo
          </span>
        </div>

        <Workspace />
      </main>
    </TooltipProvider>
  )
}
