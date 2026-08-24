import * as cheerio from "cheerio";

export interface ScrapedProduct {
  imageUrl: string;
  title?: string;
}

/**
 * Scraping minimal d'une page produit e-commerce : récupère l'image principale
 * (og:image en priorité) et un titre (og:title) pour pré-remplir le formulaire.
 * La catégorie et la couleur sont ensuite déterminées par Gemini Vision sur
 * l'image extraite (voir PROMPTS.extractProductFromImage).
 */
export async function scrapeProductPage(url: string): Promise<ScrapedProduct> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; DressAIBot/1.0; +https://dressai.app) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Impossible de charger la page produit (${response.status}).`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const ogImage = $('meta[property="og:image"]').attr("content");
  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  const firstLargeImg = $("img")
    .toArray()
    .map((el) => $(el).attr("src") ?? $(el).attr("data-src"))
    .find((src) => !!src);

  const rawImageUrl = ogImage || twitterImage || firstLargeImg;
  if (!rawImageUrl) {
    throw new Error("Aucune image produit trouvée sur cette page.");
  }

  const title =
    $('meta[property="og:title"]').attr("content") ??
    $("title").first().text() ??
    undefined;

  return {
    imageUrl: new URL(rawImageUrl, url).toString(),
    title: title?.trim(),
  };
}
