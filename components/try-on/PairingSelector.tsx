"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { COMPLEMENTARY } from "@/lib/utils/wardrobe-pairing";
import type { WardrobeCategory, WardrobeItem } from "@/lib/types";

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
  const target = COMPLEMENTARY[productCategory];

  useEffect(() => {
    if (!target) return;
    fetch("/api/wardrobe")
      .then((res) => res.json())
      .then((data) => {
        const filtered = (data.items ?? []).filter((i: WardrobeItem) => i.category === target);
        setItems(filtered);
        if (filtered.length > 0 && !selectedId) {
          const neutral = filtered.find((i: WardrobeItem) => i.is_neutral) ?? filtered[0];
          onSelect(neutral.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  if (items && items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune pièce complémentaire dans ton dressing — ajoutes-en une pour un rendu complet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Associer avec</p>
      <div className="flex flex-wrap gap-2">
        {items?.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "size-16 overflow-hidden rounded-md border-2 transition-colors",
              selectedId === item.id ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
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
