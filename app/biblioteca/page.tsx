import { TooltipProvider } from "@/components/ui/tooltip"
import { LibraryView } from "@/components/transcription/library-view"

export default function LibraryPage() {
  return (
    <TooltipProvider>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <LibraryView />
      </main>
    </TooltipProvider>
  )
}
