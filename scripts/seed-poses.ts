/**
 * Seed de la bibliothèque de poses.
 *
 * Lit un dossier local organisé comme le bucket `reference-library` :
 *
 *   seed-assets/reference-library/
 *     tops/
 *       urban/
 *         full_body.jpg
 *         mid_shot.jpg
 *         close_up.jpg
 *       studio/
 *         full_body.jpg
 *         ...
 *     shoes/
 *       urban/
 *         full_body.jpg
 *         ...
 *     ...
 *
 * Pour chaque catégorie × environnement trouvé sur disque :
 *  1. upload des 3 angles dans le bucket `reference-library`
 *  2. insertion d'une ligne `pose_references` (le premier environnement
 *     rencontré pour une catégorie est marqué `is_default = true`)
 *  3. insertion des 3 lignes `pose_sub_references` associées
 *
 * Usage :
 *   npm run seed:poses
 *
 * Prérequis : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local,
 * les migrations SQL appliquées (pose_categories doit déjà être seedé), et les
 * photos placées dans seed-assets/reference-library/ (voir doc du projet).
 */
import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { ANGLE_LABELS, ANGLES, ENVIRONMENT_LABELS, ENVIRONMENTS } from "@/lib/constants/poses";
import type { Database } from "@/lib/types/database";
import type { PoseAngle, WardrobeCategory } from "@/lib/types";

const ASSETS_DIR = join(process.cwd(), "seed-assets", "reference-library");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function findAngleFile(dir: string, angle: PoseAngle): Promise<string | null> {
  for (const ext of Object.keys(MIME_BY_EXT)) {
    const path = join(dir, `${angle}${ext}`);
    try {
      const stats = await stat(path);
      if (stats.isFile()) return path;
    } catch {
      // fichier absent avec cette extension, on essaie la suivante
    }
  }
  return null;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis dans .env.local"
    );
  }

  if (!(await dirExists(ASSETS_DIR))) {
    console.log(
      `Aucun dossier ${ASSETS_DIR} trouvé — rien à seed.\n` +
        "Crée seed-assets/reference-library/{categorie}/{environnement}/{angle}.jpg puis relance."
    );
    return;
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: categories, error: categoriesError } = await supabase
    .from("pose_categories")
    .select("id, slug");

  if (categoriesError) throw categoriesError;
  if (!categories?.length) {
    throw new Error(
      "pose_categories est vide — applique d'abord la migration 0003_seed_pose_categories.sql."
    );
  }

  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const categoryDirs = await readdir(ASSETS_DIR, { withFileTypes: true });

  for (const categoryDir of categoryDirs) {
    if (!categoryDir.isDirectory()) continue;
    const categorySlug = categoryDir.name as WardrobeCategory;
    const categoryId = categoryIdBySlug.get(categorySlug);

    if (!categoryId) {
      console.warn(`⚠️  Catégorie inconnue en base : "${categorySlug}", ignorée.`);
      continue;
    }

    let isFirstEnvironment = true;

    for (const environment of ENVIRONMENTS) {
      const envDir = join(ASSETS_DIR, categorySlug, environment);
      if (!(await dirExists(envDir))) continue;

      const angleFiles: Partial<Record<PoseAngle, string>> = {};
      for (const angle of ANGLES) {
        const file = await findAngleFile(envDir, angle);
        if (file) angleFiles[angle] = file;
      }

      const foundAngles = Object.keys(angleFiles) as PoseAngle[];
      if (foundAngles.length === 0) {
        console.warn(`⚠️  ${categorySlug}/${environment} : aucune image d'angle trouvée, ignoré.`);
        continue;
      }

      const { data: reference, error: refError } = await supabase
        .from("pose_references")
        .insert({
          category_id: categoryId,
          environment,
          environment_label: ENVIRONMENT_LABELS[environment],
          is_default: isFirstEnvironment,
          order_index: 0,
        })
        .select("id")
        .single();

      if (refError) throw refError;
      isFirstEnvironment = false;

      let orderIndex = 0;
      for (const angle of foundAngles) {
        const filePath = angleFiles[angle]!;
        const ext = filePath.slice(filePath.lastIndexOf("."));
        const mimeType = MIME_BY_EXT[ext] ?? "image/jpeg";
        const storagePath = `${categorySlug}/${environment}/${angle}${ext}`;

        const fileBuffer = await readFile(filePath);
        const { error: uploadError } = await supabase.storage
          .from("reference-library")
          .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("reference-library").getPublicUrl(storagePath);

        const { error: subRefError } = await supabase.from("pose_sub_references").insert({
          reference_id: reference.id,
          angle,
          angle_label: ANGLE_LABELS[angle],
          image_url: publicUrl,
          order_index: orderIndex++,
        });

        if (subRefError) throw subRefError;

        console.log(`✅ ${storagePath}`);
      }
    }
  }

  console.log("Seed de la bibliothèque de poses terminé.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
