"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PhotoUploader, MIN_PHOTOS } from "@/components/onboarding/PhotoUploader";
import { NeutralImageValidator } from "@/components/onboarding/NeutralImageValidator";
import { compressImages } from "@/lib/utils/compress-image";
import { parseJsonResponse } from "@/lib/utils/fetch-json";

type Step = "upload" | "validate";

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [candidatePath, setCandidatePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  async function generateCandidate() {
    setIsGenerating(true);
    try {
      const compressed = await compressImages(files);
      const formData = new FormData();
      compressed.forEach((file) => formData.append("photos", file));

      const response = await fetch("/api/onboarding", { method: "POST", body: formData });
      const data = await parseJsonResponse<{ candidatePath: string; previewUrl: string }>(
        response
      );

      setCandidatePath(data.candidatePath);
      setPreviewUrl(data.previewUrl);
      setAttempt((a) => a + 1);
      setStep("validate");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleValidate() {
    if (!candidatePath) return;
    setIsValidating(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidatePath }),
      });
      await parseJsonResponse(response);

      toast.success("Image neutre enregistrée !");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsValidating(false);
    }
  }

  if (step === "validate" && previewUrl) {
    return (
      <NeutralImageValidator
        previewUrl={previewUrl}
        attempt={attempt}
        isValidating={isValidating}
        isRetrying={isGenerating}
        onValidate={handleValidate}
        onRetry={generateCandidate}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PhotoUploader files={files} onChange={setFiles} />
      <Button onClick={generateCandidate} disabled={files.length < MIN_PHOTOS || isGenerating}>
        {isGenerating ? "Génération en cours..." : "Générer mon image neutre"}
      </Button>
    </div>
  );
}
