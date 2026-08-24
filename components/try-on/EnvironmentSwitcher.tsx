"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import type { TryOnSession } from "@/lib/types";

export function EnvironmentSwitcher({
  session,
  environments,
}: {
  session: TryOnSession;
  environments: { id: string; environment: string; environment_label: string }[];
}) {
  const router = useRouter();
  const [isSwitching, setIsSwitching] = useState<string | null>(null);

  if (environments.length <= 1) return null;

  async function switchEnvironment(poseReferenceId: string) {
    setIsSwitching(poseReferenceId);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: session.product_name ?? undefined,
          productUrl: session.product_url ?? undefined,
          productImageUrl: session.product_image_url,
          productCategory: session.product_category,
          productColor: session.product_color ?? undefined,
          wardrobeItemId: session.wardrobe_item_id ?? undefined,
          poseReferenceId,
        }),
      });
      const data = await parseJsonResponse<{ sessionId: string }>(response);
      router.push(`/try-on/${data.sessionId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
      setIsSwitching(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Changer d&apos;environnement</p>
      <div className="flex flex-wrap gap-2">
        {environments.map((env) => (
          <Button
            key={env.id}
            variant={env.id === session.pose_reference_id ? "default" : "outline"}
            size="sm"
            disabled={isSwitching !== null}
            onClick={() => switchEnvironment(env.id)}
          >
            {isSwitching === env.id ? "..." : env.environment_label}
          </Button>
        ))}
      </div>
    </div>
  );
}
