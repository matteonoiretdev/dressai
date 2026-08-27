"use client";

import { useEffect, useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import { COMPLEMENTARY } from "@/lib/utils/wardrobe-pairing";
import type { WardrobeCategory, WardrobeItem } from "@/lib/types";

const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  tops: "Hauts",
  bottoms: "Bas",
  dresses: "Robes",
  shoes: "Chaussures",
  jackets: "Vestes",
  accessories: "Accessoires",
};

export function PairingSelector({
  productCategory,
  selectedId,
  onSelect,
}: {
  productCategory: WardrobeCategory;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [items, setItems] = useState<WardrobeItem[] | null>(null);
  const [filter, setFilter] = useState<WardrobeCategory | "all">("all");

  useEffect(() => {
    fetch("/api/wardrobe")
      .then((res) => parseJsonResponse<{ items: WardrobeItem[] }>(res))
      // On exclut la même catégorie que le produit (pas très utile de proposer
      // une autre paire de chaussures pour accompagner des chaussures).
      .then((data) => {
        const eligible = (data.items ?? []).filter((i) => i.category !== productCategory);
        setItems(eligible);

        if (eligible.length > 0 && !selectedId) {
          // Pré-sélection : la suggestion "traditionnelle" (catégorie
          // complémentaire, neutre en priorité) reste le défaut, mais
          // l'utilisateur peut maintenant parcourir tout le reste du dressing.
          const target = COMPLEMENTARY[productCategory];
          const inTarget = target ? eligible.filter((i) => i.category === target) : [];
          const suggestion = inTarget.find((i) => i.is_neutral) ?? inTarget[0] ?? eligible[0];
          onSelect(suggestion.id);
          setFilter(suggestion.category);
        }
      })
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productCategory]);

  if (items && items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune autre pièce dans ton dressing — ajoutes-en une pour un rendu complet.
      </p>
    );
  }

  const categoriesPresent = Array.from(new Set(items?.map((i) => i.category) ?? []));
  const filtered = items?.filter((i) => filter === "all" || i.category === filter);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Associer avec (optionnel)</p>

      {categoriesPresent.length > 1 && (
        <Tabs value={filter} onValueChange={(v) => setFilter(v as WardrobeCategory | "all")}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">Tout</TabsTrigger>
            {categoriesPresent.map((c) => (
              <TabsTrigger key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex size-16 items-center justify-center rounded-md border-2 text-xs text-muted-foreground transition-colors",
            selectedId === null
              ? "border-primary"
              : "border-dashed border-muted-foreground/30 hover:border-muted-foreground/60"
          )}
        >
          Aucun
        </button>
        {filtered?.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            title={item.name ?? undefined}
            className={cn(
              "size-16 overflow-hidden rounded-md border-2 transition-colors",
              selectedId === item.id
                ? "border-primary"
                : "border-transparent hover:border-muted-foreground/30"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.clean_image_url ?? item.image_url}
              alt={item.name ?? ""}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
