import { NextResponse } from "next/server";
import { z } from "zod";

import { generateImage, PROMPTS } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl, uploadToUserAssets } from "@/lib/supabase/storage";
import { extensionForMimeType, fileToBase64 } from "@/lib/utils/image";

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 3;

/**
 * POST /api/onboarding — génère une nouvelle proposition d'image neutre à
 * partir de 3 à 6 photos personnelles. Peut être appelé plusieurs fois
 * (relance) : le candidat est toujours écrasé au même chemin.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);

    if (files.length < MIN_PHOTOS || files.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Envoie entre ${MIN_PHOTOS} et ${MAX_PHOTOS} photos.` },
        { status: 400 }
      );
    }

    const photos = await Promise.all(files.map(fileToBase64));

    await Promise.all(
      photos.map((photo, i) =>
        uploadToUserAssets(
          supabase,
          `${user.id}/face/${Date.now()}-${i}.${extensionForMimeType(photo.mimeType)}`,
          photo
        )
      )
    );

    const result = await generateImage({ images: photos, prompt: PROMPTS.onboarding });

    const candidatePath = `${user.id}/neutral-ref-candidate.${extensionForMimeType(result.image.mimeType)}`;
    await uploadToUserAssets(supabase, candidatePath, result.image);
    const previewUrl = await resolveAssetUrl(supabase, candidatePath);

    return NextResponse.json({ candidatePath, previewUrl });
  } catch (error) {
    console.error("[api/onboarding POST]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

const validateSchema = z.object({ candidatePath: z.string().min(1) });

/** PATCH /api/onboarding — valide le candidat courant comme image neutre définitive. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const parsed = validateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "candidatePath manquant." }, { status: 400 });
  }

  const ext = parsed.data.candidatePath.slice(parsed.data.candidatePath.lastIndexOf("."));
  const finalPath = `${user.id}/neutral-ref${ext}`;

  const { error: copyError } = await supabase.storage
    .from("user-assets")
    .copy(parsed.data.candidatePath, finalPath);
  if (copyError) {
    return NextResponse.json({ error: copyError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ neutral_ref_url: finalPath })
    .eq("id", user.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const previewUrl = await resolveAssetUrl(supabase, finalPath);
  return NextResponse.json({ neutralRefUrl: finalPath, previewUrl });
}
