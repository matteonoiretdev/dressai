import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { selectPairingItem } from "@/lib/utils/wardrobe-pairing";
import type { WardrobeCategory } from "@/lib/types";

const CATEGORIES = ["tops", "bottoms", "dresses", "shoes", "jackets", "accessories"] as const;

const bodySchema = z.object({
  productName: z.string().optional(),
  productUrl: z.string().url().optional(),
  productImageUrl: z.string().min(1),
  productCategory: z.enum(CATEGORIES),
  productColor: z.string().optional(),
  wardrobeItemId: z.string().uuid().optional(),
  poseReferenceId: z.string().uuid().optional(),
});

/**
 * POST /api/generate
 * Crée une try_on_session (pairing garde-robe + pose par défaut auto-sélectionnés
 * si non fournis) puis déclenche le job Inngest de génération multi-tours.
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const { data: profile } = await supabase
      .from("users")
      .select("neutral_ref_url")
      .eq("id", user.id)
      .single();

    if (!profile?.neutral_ref_url) {
      return NextResponse.json(
        { error: "Complète d'abord ton image neutre dans ton profil." },
        { status: 422 }
      );
    }

    let wardrobeItemId = body.wardrobeItemId ?? null;
    if (!wardrobeItemId) {
      const pairing = await selectPairingItem(
        supabase,
        user.id,
        body.productCategory as WardrobeCategory
      );
      wardrobeItemId = pairing?.id ?? null;
    }

    let poseReferenceId = body.poseReferenceId ?? null;
    if (!poseReferenceId) {
      const { data: category } = await supabase
        .from("pose_categories")
        .select("id")
        .eq("slug", body.productCategory)
        .single();

      if (category) {
        const { data: defaultPose } = await supabase
          .from("pose_references")
          .select("id")
          .eq("category_id", category.id)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        poseReferenceId = defaultPose?.id ?? null;
      }
    }

    if (!poseReferenceId) {
      return NextResponse.json(
        {
          error:
            "Aucune référence de pose disponible pour cette catégorie. Uploade d'abord la bibliothèque de poses (scripts/seed-poses.ts).",
        },
        { status: 422 }
      );
    }

    const { data: session, error: insertError } = await supabase
      .from("try_on_sessions")
      .insert({
        user_id: user.id,
        product_name: body.productName,
        product_url: body.productUrl,
        product_image_url: body.productImageUrl,
        product_category: body.productCategory,
        product_color: body.productColor,
        wardrobe_item_id: wardrobeItemId,
        pose_reference_id: poseReferenceId,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !session) {
      throw insertError ?? new Error("Échec de la création de la session.");
    }

    await inngest.send({
      name: "try-on/generate",
      data: { sessionId: session.id },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error("[api/generate]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
