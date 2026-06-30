import { NextResponse } from "next/server"
import { getJob, getTranscriptRun } from "@/lib/server/transcription-service"
import { generateDetailedMeetingSummary } from "@/lib/server/detailed-summary"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { jobId, runId, force } = body as { jobId?: string; runId?: string; force?: boolean }

    let transcriptPath: string | undefined
    let metadataPath: string | undefined

    if (runId) {
      const run = await getTranscriptRun(runId)
      if (!run?.transcriptPath) {
        return NextResponse.json({ error: "No se encontro la transcripcion." }, { status: 404 })
      }
      transcriptPath = run.transcriptPath
      metadataPath = run.metadataPath ?? undefined
    } else if (jobId) {
      const job = await getJob(jobId)
      if (!job) {
        return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 })
      }
      if (job.status !== "success") {
        return NextResponse.json({ error: "La transcripcion aun no ha terminado." }, { status: 400 })
      }
      transcriptPath = job.result?.transcriptPath
      metadataPath = job.result?.metadataPath ?? undefined
      if (!transcriptPath) {
        return NextResponse.json({ error: "No se encontro la transcripcion." }, { status: 404 })
      }
    } else {
      return NextResponse.json({ error: "Falta jobId o runId." }, { status: 400 })
    }

    const summary = await generateDetailedMeetingSummary({ transcriptPath, metadataPath, force })
    return NextResponse.json({ summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar el resumen." },
      { status: 500 }
    )
  }
}
