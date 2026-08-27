"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import type { PoseAngle } from "@/lib/types";

const ANGLE_LABELS: Record<PoseAngle, string> = {
  full_body: "Plein pied",
  mid_shot: "Mi-corps",
  close_up: "Gros plan",
};

interface Attempt {
  id: number;
  imageDataUrl: string;
}

export function TestFaceForm({
  neutralPreviewUrl,
  referenceOptions,
}: {
  neutralPreviewUrl: string;
  referenceOptions: { id: string; label: string }[];
}) {
  const [poseReferenceId, setPoseReferenceId] = useState(referenceOptions[0]?.id ?? "");
  const [angle, setAngle] = useState<PoseAngle>("full_body");
  const [isGenerating, setIsGenerating] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  async function handleGenerate() {
    if (!poseReferenceId) {
      toast.error("Choisis une référence de pose.");
      return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch("/api/admin/test-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poseReferenceId, angle }),
      });
      const data = await parseJsonResponse<{ imageDataUrl: string }>(response);
      setAttempts((prev) => [{ id: Date.now(), imageDataUrl: data.imageDataUrl }, ...prev]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Ta référence (fixe)</span>
              <div className="size-20 overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={neutralPreviewUrl}
                  alt="Image neutre"
                  className="size-full object-cover"
                />
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Référence de pose</span>
                <Select value={poseReferenceId} onValueChange={setPoseReferenceId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceOptions.map((ref) => (
                      <SelectItem key={ref.id} value={ref.id}>
                        {ref.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Angle</span>
                <Tabs value={angle} onValueChange={(v) => setAngle(v as PoseAngle)}>
                  <TabsList>
                    {(Object.keys(ANGLE_LABELS) as PoseAngle[]).map((a) => (
                      <TabsTrigger key={a} value={a}>
                        {ANGLE_LABELS[a]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2 self-start">
            <RefreshCw className={isGenerating ? "size-4 animate-spin" : "size-4"} />
            {isGenerating ? "Génération..." : attempts.length > 0 ? "Régénérer" : "Générer"}
          </Button>
        </CardContent>
      </Card>

      {attempts.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {attempts.map((attempt, i) => (
            <Card key={attempt.id} className="gap-2 overflow-hidden p-0">
              <div className="aspect-[3/4] w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attempt.imageDataUrl}
                  alt={`Essai ${attempts.length - i}`}
                  className="size-full object-cover"
                />
              </div>
              <p className="p-2 text-xs text-muted-foreground">
                Essai #{attempts.length - i}
                {i === 0 && " (dernier)"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
