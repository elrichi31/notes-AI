"use client"

import { useRef, useState } from "react"
import { FileAudio, UploadCloud, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileDropzone({
  file,
  onSelect,
}: {
  file: File | null
  onSelect: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">Archivo</label>
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/50 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
              <FileAudio className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onSelect(null)}
            aria-label="Quitar archivo"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const dropped = event.dataTransfer.files?.[0]
            if (dropped) onSelect(dropped)
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center transition-colors",
            dragging
              ? "border-brand bg-brand/5"
              : "border-border bg-secondary/30 hover:border-brand/50 hover:bg-secondary/50",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <UploadCloud className="size-5" />
          </span>
          <span className="text-sm font-medium">Arrastra un archivo o haz clic para subir</span>
          <span className="text-xs text-muted-foreground">
            Audio o video | MP3, WAV, M4A, MP4, MOV
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
      />
    </div>
  )
}
