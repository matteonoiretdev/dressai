import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { base64ToBlob, type ImagePart } from "@/lib/utils/image";

export const BUCKETS = {
  referenceLibrary: "reference-library",
  userAssets: "user-assets",
  generatedImages: "generated-images",
} as const;

/**
 * Les colonnes qui pointent vers `user-assets` (bucket privé) stockent un chemin
 * relatif au bucket (`{user_id}/...`), jamais une URL. Les colonnes qui pointent
 * vers `reference-library` / `generated-images` (buckets publics), ou une image
 * e-commerce externe, stockent une URL http(s) complète.
 *
 * Cette fonction résout n'importe laquelle des deux vers une URL réellement
 * fetch-able (signée pour le privé, publique/externe telle quelle).
 */
export async function resolveAssetUrl(
  supabase: SupabaseClient<Database>,
  urlOrPath: string,
  expiresIn = 3600
): Promise<string> {
  if (/^https?:\/\//i.test(urlOrPath)) {
    return urlOrPath;
  }

  const { data, error } = await supabase.storage
    .from(BUCKETS.userAssets)
    .createSignedUrl(urlOrPath, expiresIn);

  if (error || !data) {
    throw new Error(`Impossible de générer l'URL signée pour "${urlOrPath}" : ${error?.message}`);
  }

  return data.signedUrl;
}

export async function uploadToUserAssets(
  supabase: SupabaseClient<Database>,
  path: string,
  image: ImagePart
): Promise<string> {
  const blob = base64ToBlob(image.data, image.mimeType);
  const { error } = await supabase.storage
    .from(BUCKETS.userAssets)
    .upload(path, blob, { contentType: image.mimeType, upsert: true });

  if (error) throw error;
  return path; // chemin relatif, à résoudre plus tard via resolveAssetUrl()
}

export async function uploadToGeneratedImages(
  supabase: SupabaseClient<Database>,
  path: string,
  image: ImagePart
): Promise<string> {
  const blob = base64ToBlob(image.data, image.mimeType);
  const { error } = await supabase.storage
    .from(BUCKETS.generatedImages)
    .upload(path, blob, { contentType: image.mimeType, upsert: true });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKETS.generatedImages).getPublicUrl(path);

  return publicUrl;
}
