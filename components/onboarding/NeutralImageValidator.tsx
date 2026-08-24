"use client";

import { Check, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const MAX_ATTEMPTS = 3;

export function NeutralImageValidator({
  previewUrl,
  attempt,
  isValidating,
  isRetrying,
  onValidate,
  onRetry,
}: {
  previewUrl: string;
  attempt: number;
  isValidating: boolean;
  isRetrying: boolean;
  onValidate: () => void;
  onRetry: () => void;
}) {
  const attemptsLeft = MAX_ATTEMPTS - attempt;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Image neutre générée" className="size-full object-cover" />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Cette image te ressemble-t-elle fidèlement ? Elle servira de base à toutes tes
          générations de vêtements.
        </p>

        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={onRetry}
            disabled={isRetrying || isValidating || attemptsLeft <= 0}
          >
            <RotateCcw className="size-4" />
            {isRetrying ? "Génération..." : `Relancer (${attemptsLeft} restant${attemptsLeft > 1 ? "s" : ""})`}
          </Button>
          <Button className="flex-1 gap-2" onClick={onValidate} disabled={isValidating || isRetrying}>
            <Check className="size-4" />
            {isValidating ? "..." : "Valider cette image"}
          </Button>
        </div>

        {attemptsLeft <= 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Nombre maximum de relances atteint — tu peux quand même valider cette dernière version.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
