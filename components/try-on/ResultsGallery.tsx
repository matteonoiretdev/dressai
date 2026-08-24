"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvironmentSwitcher } from "@/components/try-on/EnvironmentSwitcher";
import type { GeneratedImage, PoseAngle, TryOnSession } from "@/lib/types";

const ANGLE_LABELS: Record<PoseAngle, string> = {
  full_body: "Plein pied",
  mid_shot: "Mi-corps",
  close_up: "Gros plan",
};
const ANGLES: PoseAngle[] = ["full_body", "mid_shot", "close_up"];

interface SessionResponse {
  session: TryOnSession;
  images: GeneratedImage[];
  environments: { id: string; environment: string; environment_label: string }[];
}

export function ResultsGallery({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      const response = await fetch(`/api/try-on/${sessionId}`);
      if (!response.ok) return;
      const json: SessionResponse = await response.json();
      setData(json);

      if (json.session.status === "completed" || json.session.status === "failed") {
        if (intervalRef.current) clearInterval(intervalRef.current);
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
