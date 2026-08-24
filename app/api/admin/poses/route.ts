import { NextResponse } from "next/server";
import { z } from "zod";

import { ANGLES, ANGLE_LABELS, ENVIRONMENTS } from "@/lib/constants/poses";
import { describePoseReference } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fileToBase64 } from "@/lib/utils/image";
import type { PoseAngle, PoseEnvironment, WardrobeCategory } from "@/lib/types";

const CATEGORIES: WardrobeCategory[] = [
  "tops",
  "bottoms",
  "dresses",
  "shoes",
  "jackets",
  "accessories",
];

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Outil d'admin temporaire — voir app/(app)/admin/poses/page.tsx pour le
 * contexte (à retirer une fois la bibliothèque de poses complète).
 *
 * POST : crée une pose_reference (catégorie × environnement) + jusqu'à 3
 * pose_sub_references (une par angle), et uploade les images dans le bucket
 * reference-library. Écrit via le service_role car ces tables sont en lecture
 * publique seule côté RLS.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const admin = createServiceClient();

  try {
    const formData = await request.formData();
    const category = formData.get("category");
    const environment = formData.get("environment");
    const environmentLabel = formData.get("environmentLabel");
    const isDefault = formData.get("isDefault") === "true";

    if (
      typeof category !== "string" ||
      !CATEGORIES.includes(category as WardrobeCategory) ||
      typeof environment !== "string" ||
      !ENVIRONMENTS.includes(environment as PoseEnvironment) ||
      typeof environmentLabel !== "string" ||
      !environmentLabel.trim()
    ) {
      return NextResponse.json({ error: "Champs manquants ou invalides." }, { status: 400 });
    }

    const files = ANGLES.map((angle) => ({
      angle,
      file: formData.get(angle),
    })).filter((f): f is { angle: PoseAngle; file: File } => f.file instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Ajoute au moins une photo (plein pied, mi-corps ou gros plan)." },
        { status: 400 }
      );
    }

    const { data: categoryRow, error: categoryError } = await admin
      .from("pose_categories")
      .select("id")
      .eq("slug", category)
      .single();
    if (categoryError || !categoryRow) {
      return NextResponse.json({ error: "Catégorie introuvable en base." }, { status: 404 });
    }

    if (isDefault) {
      await admin
        .from("pose_references")
        .update({ is_default: false })
        .eq("category_id", categoryRow.id);
    }

    const { data: reference, error: refError } = await admin
      .from("pose_references")
      .insert({
        category_id: categoryRow.id,
        environment: environment as PoseEnvironment,
        environment_label: environmentLabel.trim(),
        is_default: isDefault,
        order_index: 0,
      })
      .select("id")
      .single();
    if (refError || !reference) throw refError ?? new Error("Échec de la création.");

    let orderIndex = 0;
    for (const { angle, file } of files) {
      const ext = MIME_EXT[file.type] ?? "jpg";
      const path = `${category}/${environment}/${angle}.${ext}`;

      const [uploadResult, poseDescription] = await Promise.all([
        admin.storage
          .from("reference-library")
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true }),
        // Décrit la pose en mots — donné à la génération try-on en plus de
        // l'image (voir lib/gemini.ts). Best-effort : une photo mal décrite
        // reste utilisable via l'image seule, donc on ne bloque pas l'upload
        // si Gemini échoue sur cette étape.
        fileToBase64(file)
          .then((image) => describePoseReference(image))
          .catch((error) => {
            console.error("[api/admin/poses] describePoseReference a échoué", error);
            return null;
          }),
      ]);
      if (uploadResult.error) throw uploadResult.error;

      const {
        data: { publicUrl },
      } = admin.storage.from("reference-library").getPublicUrl(path);

      const { error: subRefError } = await admin.from("pose_sub_references").insert({
        reference_id: reference.id,
        angle,
        angle_label: ANGLE_LABELS[angle],
        image_url: publicUrl,
        order_index: orderIndex++,
        pose_description: poseDescription,
      });
      if (subRefError) throw subRefError;
    }

    return NextResponse.json({ referenceId: reference.id });
  } catch (error) {
    console.error("[api/admin/poses POST]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** DELETE : supprime une pose_reference, ses sub_references (cascade) et les fichiers storage associés. */
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

  const admin = createServiceClient();

  const { data: subRefs } = await admin
    .from("pose_sub_references")
    .select("image_url")
    .eq("reference_id", parsed.data.id);

  const paths = (subRefs ?? [])
    .map((s) => s.image_url.split("/reference-library/")[1])
    .filter((p): p is string => !!p);

  if (paths.length > 0) {
    await admin.storage.from("reference-library").remove(paths);
  }

  const { error } = await admin.from("pose_references").delete().eq("id", parsed.data.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
