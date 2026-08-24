"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseJsonResponse } from "@/lib/utils/fetch-json";

interface SubReference {
  id: string;
  angle: string;
  angle_label: string;
  image_url: string;
}

interface ReferenceWithSubRefs {
  id: string;
  environment: string;
  environment_label: string;
  is_default: boolean | null;
  categorySlug: string;
  subReferences: SubReference[];
}

export function PoseLibraryList({ references }: { references: ReferenceWithSubRefs[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/poses?id=${id}`, { method: "DELETE" });
      await parseJsonResponse(response);
      toast.success("Référence supprimée.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setDeletingId(null);
    }
  }

  if (references.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucune référence de pose importée pour l&apos;instant.
      </p>
    );
  }

  const byCategory = new Map<string, ReferenceWithSubRefs[]>();
  for (const ref of references) {
    byCategory.set(ref.categorySlug, [...(byCategory.get(ref.categorySlug) ?? []), ref]);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...byCategory.entries()].map(([categorySlug, refs]) => (
        <div key={categorySlug} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight capitalize">{categorySlug}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {refs.map((ref) => (
              <Card key={ref.id} className="gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ref.environment_label}</span>
                    {ref.is_default && <Badge variant="secondary">Défaut</Badge>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === ref.id}
                    onClick={() => handleDelete(ref.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ref.subReferences.map((sub) => (
                    <div key={sub.id} className="aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sub.image_url}
                        alt={sub.angle_label}
                        className="size-full object-cover"
                      />
                    </div>
                  ))}
                  {ref.subReferences.length === 0 && (
                    <p className="col-span-3 text-xs text-muted-foreground">Aucune image.</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
