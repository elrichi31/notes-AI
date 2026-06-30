import { NextResponse } from "next/server"
import { getJob } from "@/lib/server/transcription-service"
import { generateDetailedMeetingSummary } from "@/lib/server/detailed-summary"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const { jobId } = await request.json()

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Falta el ID del trabajo." }, { status: 400 })
    }

    const job = await getJob(jobId)
    if (!job) {
      return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 })
    }

    if (job.status !== "success") {
      return NextResponse.json({ error: "La transcripcion aun no ha terminado." }, { status: 400 })
    }

    const transcriptPath = job.result?.transcriptPath
    if (!transcriptPath) {
      return NextResponse.json({ error: "No se encontro la transcripcion." }, { status: 404 })
    }

    const summary = await generateDetailedMeetingSummary({ transcriptPath })
    return NextResponse.json({ summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar el resumen." },
      { status: 500 }
    )
  }
}
