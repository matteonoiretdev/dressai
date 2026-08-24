import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import type { WardrobeCategory, WardrobeItem } from "@/lib/types";

export const COMPLEMENTARY: Record<WardrobeCategory, WardrobeCategory | null> = {
  tops: "bottoms",
  bottoms: "tops",
  dresses: "jackets",
  shoes: "bottoms",
  jackets: "tops",
  accessories: "tops",
};

/**
 * Sélectionne automatiquement l'article de garde-robe complémentaire au produit
 * soumis : priorité aux pièces neutres, puis la plus récente.
 */
export async function selectPairingItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  productCategory: WardrobeCategory
): Promise<WardrobeItem | null> {
  const target = COMPLEMENTARY[productCategory];
  if (!target) return null;

  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", userId)
    .eq("category", target)
    .order("is_neutral", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as WardrobeItem | null;
}
