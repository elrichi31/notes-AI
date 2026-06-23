import { NextResponse } from "next/server"
import { createTranscriptionJob } from "@/lib/server/transcription-service"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se recibio ningun archivo." }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const job = await createTranscriptionJob({
      fileBuffer: buffer,
      fileName: file.name,
      model: String(formData.get("model") ?? "").trim(),
      language: String(formData.get("language") ?? "").trim(),
      diarize: String(formData.get("diarize") ?? "").toLowerCase() === "true",
      chunkSeconds: String(formData.get("chunkSeconds") ?? "600"),
      glossary: String(formData.get("glossary") ?? "").trim(),
    })

    return NextResponse.json({ jobId: job.id }, { status: 202 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo iniciar la transcripcion." },
      { status: 500 }
    )
  }
}
