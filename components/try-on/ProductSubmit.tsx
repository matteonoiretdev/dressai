"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PairingSelector } from "@/components/try-on/PairingSelector";
import { compressImage } from "@/lib/utils/compress-image";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import type { ExtractedProduct } from "@/lib/types";

interface ExtractedState extends ExtractedProduct {
  previewUrl: string;
  productUrl?: string;
}

export function ProductSubmit() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedState | null>(null);
  const [wardrobeItemId, setWardrobeItemId] = useState<string | null>(null);

  async function handleExtract() {
    if (!url && !file) return;
    setIsExtracting(true);
    setExtracted(null);
    setWardrobeItemId(null);

    try {
      let requestInit: RequestInit;
      if (file) {
        const compressed = await compressImage(file);
        const formData = new FormData();
        formData.append("image", compressed);
        requestInit = { method: "POST", body: formData };
      } else {
        requestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        };
      }

      const response = await fetch("/api/product", requestInit);
      const data = await parseJsonResponse<ExtractedState>(response);
      setExtracted(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleGenerate() {
    if (!extracted) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: extracted.name,
          productUrl: extracted.productUrl,
          productImageUrl: extracted.image_url_clean,
          productCategory: extracted.category,
          productColor: extracted.color ?? undefined,
          // null = "Aucun" choisi explicitement (respecté), pas coercé en
          // undefined (qui déclencherait une auto-sélection serveur non voulue).
          wardrobeItemId,
        }),
      });
      const data = await parseJsonResponse<{ sessionId: string }>(response);
      router.push(`/try-on/${data.sessionId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <Tabs defaultValue="url">
            <TabsList>
              <TabsTrigger value="url" className="gap-2">
                <Link2 className="size-4" />
                Lien produit
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="size-4" />
                Capture d&apos;écran
              </TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="mt-4 flex gap-2">
              <Input
                placeholder="https://boutique.com/produit/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button onClick={handleExtract} disabled={!url || isExtracting}>
                {isExtracting ? "..." : "Analyser"}
              </Button>
            </TabsContent>

            <TabsContent value="upload" className="mt-4 flex gap-2">
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button onClick={handleExtract} disabled={!file || isExtracting}>
                {isExtracting ? "..." : "Analyser"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {extracted && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="size-24 shrink-0 overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={extracted.previewUrl} alt={extracted.name} className="size-full object-cover" />
              </div>
              <div>
                <p className="font-medium">{extracted.name}</p>
                <p className="text-sm text-muted-foreground capitalize">{extracted.category}</p>
              </div>
            </div>

            <PairingSelector
              productCategory={extracted.category}
              selectedId={wardrobeItemId}
              onSelect={setWardrobeItemId}
            />

            <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              <Sparkles className="size-4" />
              {isGenerating ? "Lancement..." : "Générer mes photos"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
