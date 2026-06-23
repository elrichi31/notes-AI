import { NextResponse } from "next/server"
import { getJob } from "@/lib/server/transcription-service"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const job = await getJob(jobId)

  if (!job) {
    return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 })
  }

  return NextResponse.json(job)
}
