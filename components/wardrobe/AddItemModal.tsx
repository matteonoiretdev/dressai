"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { compressImage } from "@/lib/utils/compress-image";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import type { WardrobeItem } from "@/lib/types";

export function AddItemModal({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!file) return;
    setIsSubmitting(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("image", compressed);
      const response = await fetch("/api/wardrobe", { method: "POST", body: formData });
      const data = await parseJsonResponse<{ item: WardrobeItem }>(response);

      toast.success(`"${data.item.name}" ajouté au dressing.`);
      setOpen(false);
      setFile(null);
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" />
          Ajouter un vêtement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter au dressing</DialogTitle>
          <DialogDescription>
            Photo d&apos;un vêtement de ta garde-robe. Le détourage et la catégorisation sont
            automatiques.
          </DialogDescription>
        </DialogHeader>

        <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!file || isSubmitting}>
            {isSubmitting ? "Analyse en cours..." : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
