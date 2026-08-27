import { NextResponse } from "next/server";
import { z } from "zod";

import { generateTryOnImage } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl } from "@/lib/supabase/storage";
import { fetchImageAsBase64 } from "@/lib/utils/image";

// Laisse un peu de marge : une génération Gemini peut prendre 10-20s.
export const maxDuration = 60;

const bodySchema = z.object({
  poseReferenceId: z.string().uuid(),
  angle: z.enum(["full_body", "mid_shot", "close_up"]),
});

/**
 * Outil d'admin temporaire — génère UNE seule image (personne + pose,
 * SANS changement de vêtement) pour itérer rapidement sur la seule fidélité
 * du visage, indépendamment du reste du pipeline try-on. Ne persiste rien en
 * base ni en storage : l'image est renvoyée directement en base64.
 * Voir app/(app)/admin/test-face/page.tsx.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    const { data: profile } = await supabase
      .from("users")
      .select("neutral_ref_url")
      .eq("id", user.id)
      .single();
    if (!profile?.neutral_ref_url) {
      return NextResponse.json(
        { error: "Image neutre manquante sur ton profil." },
        { status: 422 }
      );
    }

    const { data: subRef, error: subRefError } = await supabase
      .from("pose_sub_references")
      .select("image_url, pose_description")
      .eq("reference_id", parsed.data.poseReferenceId)
      .eq("angle", parsed.data.angle)
      .single();
    if (subRefError || !subRef) {
      return NextResponse.json({ error: "Sous-référence de pose introuvable." }, { status: 404 });
    }

    const neutralUrl = await resolveAssetUrl(supabase, profile.neutral_ref_url);

    const [person, poseRefImage] = await Promise.all([
      fetchImageAsBase64(neutralUrl),
      fetchImageAsBase64(subRef.image_url),
    ]);

    const result = await generateTryOnImage([
      { role: "person", image: person },
      { role: "poseRef", image: poseRefImage, detail: subRef.pose_description ?? undefined },
    ]);

    return NextResponse.json({
      imageDataUrl: `data:${result.image.mimeType};base64,${result.image.data}`,
    });
  } catch (error) {
    console.error("[api/admin/test-face]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
