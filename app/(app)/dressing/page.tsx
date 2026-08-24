"use client";

import { useState } from "react";

import { AddItemModal } from "@/components/wardrobe/AddItemModal";
import { WardrobeGrid } from "@/components/wardrobe/WardrobeGrid";

export default function DressingPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mon dressing</h1>
          <p className="text-muted-foreground">Les pièces utilisées pour composer tes tenues.</p>
        </div>
        <AddItemModal onAdded={() => setRefreshKey((k) => k + 1)} />
      </div>

      <WardrobeGrid refreshKey={refreshKey} />
    </div>
  );
}
