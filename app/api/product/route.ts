import { NextResponse } from "next/server";
import { z } from "zod";

import { generateStructuredJson, PROMPTS } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl, uploadToUserAssets } from "@/lib/supabase/storage";
import { extensionForMimeType, fetchImageAsBase64, fileToBase64 } from "@/lib/utils/image";
import { scrapeProductPage } from "@/lib/utils/scrape-product";
import type { ExtractedProduct, WardrobeCategory } from "@/lib/types";

const urlSchema = z.object({ url: z.string().url() });

const CATEGORIES: WardrobeCategory[] = [
  "tops",
  "bottoms",
  "dresses",
  "shoes",
  "jackets",
  "accessories",
];

/**
 * POST /api/product
 * - JSON { url } : scraping d'une page e-commerce
 * - multipart/form-data { image } : capture d'écran / photo uploadée
 *
 * Dans les deux cas, l'image du produit est classifiée par Gemini Vision
 * (catégorie, couleur) puis stockée dans user-assets/{user_id}/products/.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    let imagePart;
    let scrapedTitle: string | undefined;
    let productUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Fichier image manquant." }, { status: 400 });
      }
      imagePart = await fileToBase64(file);
    } else {
      const body = urlSchema.parse(await request.json());
      productUrl = body.url;
      const scraped = await scrapeProductPage(body.url);
      scrapedTitle = scraped.title;
      imagePart = await fetchImageAsBase64(scraped.imageUrl);
    }

    const classification = await generateStructuredJson<{
      name: string;
      category: WardrobeCategory;
      color: string;
    }>({ images: [imagePart], prompt: PROMPTS.extractProductFromImage });

    if (!CATEGORIES.includes(classification.category)) {
      throw new Error(`Catégorie inattendue renvoyée par Gemini : ${classification.category}`);
    }

    const path = `${user.id}/products/${Date.now()}.${extensionForMimeType(imagePart.mimeType)}`;
    await uploadToUserAssets(supabase, path, imagePart);
    const previewUrl = await resolveAssetUrl(supabase, path);

    const extracted: ExtractedProduct = {
      name: scrapedTitle || classification.name,
      image_url_clean: path,
      category: classification.category,
      color: classification.color,
    };

    return NextResponse.json({ ...extracted, previewUrl, productUrl });
  } catch (error) {
    console.error("[api/product]", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
