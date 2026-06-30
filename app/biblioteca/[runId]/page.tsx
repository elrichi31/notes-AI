import { TooltipProvider } from "@/components/ui/tooltip"
import { TranscriptDetailView } from "@/components/transcription/transcript-detail-view"

export default async function TranscriptDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  const decodedRunId = decodeURIComponent(runId)

  return (
    <TooltipProvider>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <TranscriptDetailView runId={decodedRunId} />
      </main>
    </TooltipProvider>
  )
}
