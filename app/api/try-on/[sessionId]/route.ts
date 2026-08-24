import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/try-on/[sessionId] — statut + images générées (pour le polling
 * de la galerie de résultats), et les environnements de pose disponibles pour
 * la catégorie du produit (pour l'EnvironmentSwitcher).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("try_on_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  }

  const { data: images } = await supabase
    .from("generated_images")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  let environments: { id: string; environment: string; environment_label: string }[] = [];
  const { data: category } = await supabase
    .from("pose_categories")
    .select("id")
    .eq("slug", session.product_category)
    .single();

  if (category) {
    const { data: refs } = await supabase
      .from("pose_references")
      .select("id, environment, environment_label")
      .eq("category_id", category.id)
      .order("order_index", { ascending: true });
    environments = refs ?? [];
  }

  return NextResponse.json({ session, images: images ?? [], environments });
}
