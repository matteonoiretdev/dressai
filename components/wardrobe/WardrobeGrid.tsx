"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WardrobeCategory, WardrobeItem } from "@/lib/types";

const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  tops: "Hauts",
  bottoms: "Bas",
  dresses: "Robes",
  shoes: "Chaussures",
  jackets: "Vestes",
  accessories: "Accessoires",
};

const CATEGORIES: (WardrobeCategory | "all")[] = [
  "all",
  "tops",
  "bottoms",
  "dresses",
  "shoes",
  "jackets",
  "accessories",
];

export function WardrobeGrid({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<WardrobeItem[] | null>(null);
  const [filter, setFilter] = useState<WardrobeCategory | "all">("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wardrobe")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Impossible de charger le dressing.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleDelete(id: string) {
    const previous = items;
    setItems((current) => current?.filter((i) => i.id !== id) ?? null);
    const response = await fetch(`/api/wardrobe?id=${id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Suppression impossible.");
      setItems(previous ?? null);
    }
  }

  const filtered = items?.filter((item) => filter === "all" || item.category === filter);

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as WardrobeCategory | "all")}>
        <TabsList className="flex-wrap">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c === "all" ? "Tout" : CATEGORY_LABELS[c]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!items ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Aucune pièce dans cette catégorie pour l&apos;instant.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {filtered?.map((item) => (
            <Card key={item.id} className="group relative gap-0 overflow-hidden p-0">
              <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.clean_image_url ?? item.image_url}
                  alt={item.name ?? "Article de garde-robe"}
                  className="size-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <div className="mt-1 flex gap-1">
                    <Badge variant="secondary">{CATEGORY_LABELS[item.category]}</Badge>
                    {item.is_neutral && <Badge variant="outline">Neutre</Badge>}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
