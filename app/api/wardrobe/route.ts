import { NextResponse } from "next/server";
import { z } from "zod";

import { classifyWardrobeItem, removeBackground } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl, uploadToUserAssets } from "@/lib/supabase/storage";
import { extensionForMimeType, fileToBase64 } from "@/lib/utils/image";

/** GET /api/wardrobe — liste la garde-robe de l'utilisateur courant (RLS). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = await Promise.all(
    (data ?? []).map(async (item) => ({
      ...item,
      image_url: await resolveAssetUrl(supabase, item.image_url),
      clean_image_url: item.clean_image_url
        ? await resolveAssetUrl(supabase, item.clean_image_url)
        : null,
    }))
  );

  return NextResponse.json({ items });
}

/**
 * POST /api/wardrobe — ajoute une pièce à la garde-robe.
 * multipart/form-data { image } : détourage + classification Gemini, puis insertion.
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
    const file = formData.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier image manquant." }, { status: 400 });
    }

    const original = await fileToBase64(file);

    const [classification, cleaned] = await Promise.all([
      classifyWardrobeItem(original),
      removeBackground(original),
    ]);

    const timestamp = Date.now();
    const originalPath = `${user.id}/wardrobe/${timestamp}.${extensionForMimeType(original.mimeType)}`;
    const cleanPath = `${user.id}/wardrobe/${timestamp}-clean.${extensionForMimeType(cleaned.image.mimeType)}`;

    await uploadToUserAssets(supabase, originalPath, original);
    await uploadToUserAssets(supabase, cleanPath, cleaned.image);

    const { data, error } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: user.id,
        image_url: originalPath,
        clean_image_url: cleanPath,
        category: classification.category,
        color_primary: classification.color_primary,
        is_neutral: classification.is_neutral,
        name: classification.name,
        style_tags: classification.style_tags,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      item: {
        ...data,
        image_url: await resolveAssetUrl(supabase, originalPath),
        clean_image_url: await resolveAssetUrl(supabase, cleanPath),
      },
    });
  } catch (error) {
    console.error("[api/wardrobe POST]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** DELETE /api/wardrobe?id=... — supprime une pièce (RLS garantit la propriété). */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = deleteSchema.safeParse({ id: searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "id invalide." }, { status: 400 });
  }

  const { error } = await supabase.from("wardrobe_items").delete().eq("id", parsed.data.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
