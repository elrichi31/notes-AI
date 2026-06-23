import { NextResponse } from "next/server"
import { getTranscriptDownload } from "@/lib/server/transcription-service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get("run") ?? ""
    const format = searchParams.get("format") ?? ""

    if (!runId || !format) {
      return NextResponse.json(
        { error: "Faltan parametros para descargar el archivo." },
        { status: 400 }
      )
    }

    const file = await getTranscriptDownload(runId, format)

    return new NextResponse(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo descargar el archivo." },
      { status: 500 }
    )
  }
}
