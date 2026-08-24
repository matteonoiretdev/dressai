"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvironmentSwitcher } from "@/components/try-on/EnvironmentSwitcher";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import type { GeneratedImage, PoseAngle, TryOnSession } from "@/lib/types";

const ANGLE_LABELS: Record<PoseAngle, string> = {
  full_body: "Plein pied",
  mid_shot: "Mi-corps",
  close_up: "Gros plan",
};
const ANGLES: PoseAngle[] = ["full_body", "mid_shot", "close_up"];

// Si le statut reste "pending" au-delà de ce délai, le job Inngest n'a
// vraisemblablement jamais démarré (le premier step, "mark-processing", passe
// le statut à "processing" en quelques secondes en temps normal) — le plus
// souvent parce qu'Inngest n'est pas connecté au déploiement en production.
const PENDING_STALL_MS = 20_000;

interface SessionResponse {
  session: TryOnSession;
  images: GeneratedImage[];
  environments: { id: string; environment: string; environment_label: string }[];
}

export function ResultsGallery({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [stalledPending, setStalledPending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();

    async function poll() {
      try {
        const response = await fetch(`/api/try-on/${sessionId}`);
        const json = await parseJsonResponse<SessionResponse>(response);
        setData(json);

        if (json.session.status === "completed" || json.session.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }

        setStalledPending(
          json.session.status === "pending" &&
            Date.now() - (startedAtRef.current ?? Date.now()) > PENDING_STALL_MS
        );
      } catch {
        // Erreur transitoire (réseau, 5xx) : on retentera au prochain tick du polling.
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId]);

  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ANGLES.map((a) => (
          <Skeleton key={a} className="aspect-[3/4] w-full" />
        ))}
      </div>
    );
  }

  const { session, images, environments } = data;
  const imageByAngle = Object.fromEntries(images.map((i) => [i.angle, i]));
  const progress = (images.length / ANGLES.length) * 100;

  return (
    <div className="flex flex-col gap-6">
      {session.status === "failed" ? (
        <Card className="flex flex-col items-center gap-2 border-destructive/50 py-10 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="font-medium">La génération a échoué</p>
          {session.error_message && (
            <p className="max-w-md text-sm text-muted-foreground">{session.error_message}</p>
          )}
        </Card>
      ) : (
        <>
          {session.status !== "completed" && (
            <div className="flex flex-col gap-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">
                Génération en cours... ({images.length}/{ANGLES.length})
              </p>
            </div>
          )}

          {stalledPending && (
            <Card className="flex flex-row items-start gap-3 border-amber-500/50 bg-amber-500/5 p-4">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <p className="text-sm text-muted-foreground">
                Ça reste bloqué à &laquo;&nbsp;en attente&nbsp;&raquo; depuis plus de 20 secondes :
                le job de génération n&apos;a probablement jamais démarré. En général ça veut dire
                qu&apos;Inngest n&apos;est pas encore connecté à ce déploiement (voir la section
                Inngest du README).
              </p>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ANGLES.map((angle) => {
              const image = imageByAngle[angle] as GeneratedImage | undefined;
              return (
                <Card key={angle} className="gap-0 overflow-hidden p-0">
                  <div className="aspect-[3/4] w-full bg-muted">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image.image_url}
                        alt={ANGLE_LABELS[angle]}
                        className="size-full object-cover"
                      />
                    ) : (
                      <Skeleton className="size-full rounded-none" />
                    )}
                  </div>
                  <p className="p-3 text-sm text-muted-foreground">{ANGLE_LABELS[angle]}</p>
                </Card>
              );
            })}
          </div>

          {session.status === "completed" && (
            <EnvironmentSwitcher session={session} environments={environments} />
          )}
        </>
      )}
    </div>
  );
}
