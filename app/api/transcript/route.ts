import { NextResponse } from "next/server"
import { getTranscriptRun } from "@/lib/server/transcription-service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get("run") ?? ""

    if (!runId) {
      return NextResponse.json(
        { error: "Falta el identificador de la transcripcion." },
        { status: 400 }
      )
    }

    const run = await getTranscriptRun(runId)
    return NextResponse.json({ run })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo abrir la transcripcion."
    const status = message === "Transcripcion no encontrada." ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
