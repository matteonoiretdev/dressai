"use client";

import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 6;

export function PhotoUploader({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const merged = [...files, ...Array.from(newFiles)].slice(0, MAX_PHOTOS);
    onChange(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  }

  function removeAt(index: number) {
    const merged = files.filter((_, i) => i !== index);
    onChange(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/50"
        )}
      >
        <UploadCloud className="size-6" />
        <span>
          Ajoute {MIN_PHOTOS} à {MAX_PHOTOS} photos : visage, plein pied, tatouages...
        </span>
        <span className="text-xs">{files.length} / {MAX_PHOTOS} sélectionnées</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {previews.map((src, i) => (
            <div key={src} className="group relative aspect-square overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute top-1 right-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => removeAt(i)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { MIN_PHOTOS, MAX_PHOTOS };
