import { GoogleGenAI, Modality, ThinkingLevel, type Part } from "@google/genai";

import type { ImagePart } from "@/lib/utils/image";
import type { WardrobeClassification } from "@/lib/types";

// Modèle de génération d'images "Nano Banana 2" — bien meilleure préservation
// d'identité que gemini-2.5-flash-image (Nano Banana 1) sur ce cas d'usage,
// confirmé par comparaison directe dans AI Studio. Configurable via env var
// au cas où Google fait à nouveau évoluer l'identifiant.
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-lite-image";
// gemini-2.5-flash n'est plus accessible aux nouvelles clés API ("This model
// ... is no longer available to new users") — Google recommande
// gemini-3.6-flash comme remplacement direct. Reste configurable via env var
// si Google fait à nouveau évoluer les identifiants.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY manquant dans les variables d'environnement.");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const PROMPTS = {
  onboarding: `
Generate a photorealistic full-body image of this exact person.
White fitted t-shirt, white straight-leg pants, white sneakers.
Standing upright, neutral expression, front-facing, arms slightly away from body.
Pure white studio background, soft even lighting from both sides.
Preserve ALL facial features, skin tone, body proportions, tattoos and
all physical characteristics exactly. No makeup changes, no alterations.
Professional studio photography quality.
  `.trim(),

  classifyWardrobeItem: `
Analyze this clothing item and return ONLY a valid JSON object, no markdown, no explanation:
{
  "category": "tops|bottoms|dresses|shoes|jackets|accessories",
  "name": "short descriptive name in French",
  "color_primary": "#hexcolor",
  "is_neutral": true or false (true if black, white, grey, beige, navy or camel),
  "style_tags": ["casual"|"formal"|"sportswear"|"streetwear"|"elegant"]
}
  `.trim(),

  removeBackground: `
Remove the background from this clothing item.
Return the garment isolated on a pure white (#FFFFFF) background.
Preserve all fabric details, textures and natural shadows.
Clean crisp edges. No artifacts or halos.
  `.trim(),

  extractProductFromImage: `
Analyze this e-commerce product screenshot or photo. Identify the main clothing
item being sold and return ONLY a valid JSON object, no markdown, no explanation:
{
  "name": "short descriptive product name in French",
  "category": "tops|bottoms|dresses|shoes|jackets|accessories",
  "color": "#hexcolor"
}
  `.trim(),

  describePoseReference: `
Describe ONLY the body pose, camera angle, framing distance and environment of
the main person in this photo, as a concise photography direction (2-4
sentences), in this style: "seated on concrete steps, body turned 3/4 toward
camera, left elbow resting on left knee, right arm hanging loosely, legs bent
and slightly apart, looking directly at camera with a relaxed confident
expression. Both feet flat on a lower step."
Do NOT describe their face, hair, skin tone, body type, or ANY clothing —
describe only the pose, camera framing/distance and background/environment.
Return plain text only, no markdown, no preamble, no quotes.
  `.trim(),
};

function toPart(image: ImagePart): Part {
  return { inlineData: { data: image.data, mimeType: image.mimeType } };
}

export interface GeneratedImageResult {
  image: ImagePart;
  text?: string;
}

function extractResult(response: {
  candidates?: Array<{ content?: { parts?: Part[] } }>;
}): GeneratedImageResult {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  const textPart = parts.find((part) => typeof part.text === "string");

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini n'a renvoyé aucune image dans sa réponse.");
  }

  return {
    image: {
      data: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
    },
    text: textPart?.text,
  };
}

/**
 * Appel image-en-image en un seul tour (onboarding, détourage garde-robe).
 */
export async function generateImage(params: {
  images: ImagePart[];
  prompt: string;
}): Promise<GeneratedImageResult> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: "user",
        parts: [...params.images.map(toPart), { text: params.prompt }],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  return extractResult(response);
}

/**
 * Génération try-on — prompt court et concret façon "Reference Image N (nom) :
 * instruction", calqué sur un prompt manuel testé par l'utilisateur dans AI
 * Studio qui donnait de bien meilleurs résultats que notre version précédente
 * (verbeuse, très répétitive sur les interdictions "do not..."). Chaque image
 * a UNE instruction courte, positive et concrète ; la pose est donnée comme un
 * bloc de texte autonome (pas attachée à l'image de style) ; une seule phrase
 * de génération à la fin relie le tout — pas de répétition de "the most
 * important constraint" ni de longues listes de négations, qui semblent
 * nuire plus qu'aider sur ce modèle.
 *
 * Chaque tour (plein pied / mi-corps / gros plan) est généré indépendamment à
 * partir des MÊMES person/garment/pairedGarment + SA PROPRE pose_reference —
 * volontairement sans réutiliser l'image générée au tour précédent (voir
 * lib/inngest/functions/generate-try-on.ts).
 *
 * Exception : le gros plan est généré en premier, puis réutilisé comme
 * référence "garmentCloseup" pour les plans plus larges. Constaté sur un cas
 * réel : à petite échelle (plein pied, mi-corps), le produit occupe trop peu
 * de pixels et le modèle a tendance à approximer ses détails fins (couleurs,
 * motifs, logo) — alors qu'il les rend fidèlement en gros plan, où le produit
 * occupe une grande partie du cadre. Donner ce gros plan déjà réussi comme
 * référence de détail (pas de pose : uniquement l'apparence du produit) aux
 * plans larges aide le modèle à garder la même fidélité même en petit.
 */
export interface TryOnReferenceImage {
  role: "person" | "garment" | "pairedGarment" | "poseRef" | "garmentCloseup";
  image: ImagePart;
  /**
   * garment/pairedGarment : nom concret de l'article (ex. "denim shorts",
   * "Nike Vaporwaffle sneakers") — remplace le nom générique dans le prompt.
   * poseRef : description textuelle de la pose (voir describePoseReference
   * ci-dessous), insérée comme bloc "POSE (strictly follow):" autonome.
   */
  detail?: string;
}

export async function generateTryOnImage(
  references: TryOnReferenceImage[]
): Promise<GeneratedImageResult> {
  const ai = getClient();

  const parts: Part[] = [];
  const garmentNames: string[] = [];
  let poseDescription: string | undefined;

  references.forEach((ref, i) => {
    const index = i + 1;

    if (ref.role === "person") {
      parts.push({
        text:
          `Using Reference Image ${index} ("the person"): use this exact person's real face ` +
          "in the output — the same face, not a new or similar-looking one. Also match their " +
          "hair, skin tone, height and body morphology exactly.",
      });
    } else if (ref.role === "garment" || ref.role === "pairedGarment") {
      const name = ref.detail ?? "this item";
      garmentNames.push(name);
      parts.push({
        text:
          `Using Reference Image ${index} ("${name}"): the person must wear exactly this, ` +
          "preserving the exact colorway, silhouette, cut and material, at its true-to-life " +
          "size and proportions relative to the body — never stretch, elongate, shrink or " +
          "enlarge it to fill the frame, however close or cropped the shot is. This image is " +
          "the single source of truth for its appearance — copy its print, pattern, embroidery " +
          "and logo exactly as shown, pixel for pixel where possible. Never add, remove, " +
          "resize or reposition any decorative detail, and never invent a different color, " +
          "pattern, logo or design for it, even if a variation would look equally plausible.",
      });
    } else if (ref.role === "garmentCloseup") {
      parts.push({
        text:
          `Using Reference Image ${index} ("product detail"): a close-up of the exact same ` +
          "product(s), already correctly rendered. Even though the product appears smaller and " +
          "farther away in this new photo, render its exact colors, pattern, logo and material " +
          "with this same level of detail and accuracy — do not simplify or generalize it just " +
          "because it is farther from the camera.",
      });
    } else {
      poseDescription = ref.detail;
      parts.push({
        text:
          `Using Reference Image ${index} ("the style"): replicate exactly this photo's pose, ` +
          "atmosphere, lighting, time of day, background and depth of field — do not substitute " +
          "a different but similar-looking setting or moment, even if it would look equally " +
          "plausible. The person shown in this photo is not real and is unrelated to this " +
          "generation — never use their face, body or any of their clothing; it must not " +
          "influence the outfit in any way.",
      });
    }

    parts.push(toPart(ref.image));
  });

  if (poseDescription) {
    parts.push({ text: `POSE (strictly follow): ${poseDescription}` });
  }

  const outfitPhrase = garmentNames.length > 0 ? ` wearing ${garmentNames.join(" and ")}` : "";

  parts.push({
    text:
      `Generate a fashion editorial photo using the exact same face as Reference Image 1 in ` +
      `this exact pose${outfitPhrase}, matching the atmosphere, lighting and background from ` +
      "the style reference. The face must be the real face from Reference Image 1, unchanged " +
      "— not a new face, not a similar-looking model. Keep realistic human anatomy and " +
      "realistic, true-to-life garment proportions throughout — a close or cropped framing " +
      "must never be used as a reason to lengthen, enlarge or otherwise distort a garment or " +
      "shoe beyond its real-world size. Professional fashion photography, photorealistic, " +
      "high-end lookbook quality, sharp garment details.",
  });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      // Température basse : privilégie la fidélité aux références (identité,
      // produit) plutôt que la créativité.
      temperature: 0.3,
      // Thinking level élevé : testé par l'utilisateur dans AI Studio sur ce
      // même prompt, donne de meilleurs résultats (plus de raisonnement avant
      // de générer l'image, donc plus fidèle aux références) qu'en laissant
      // le niveau par défaut.
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  return extractResult(response);
}

/**
 * Appel texte -> JSON structuré (classification garde-robe, extraction produit).
 */
export async function generateStructuredJson<T>(params: {
  images: ImagePart[];
  prompt: string;
}): Promise<T> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        role: "user",
        parts: [...params.images.map(toPart), { text: params.prompt }],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini n'a renvoyé aucun texte JSON.");
  }

  // Sécurité : au cas où le modèle entoure quand même la réponse de ```json ... ```
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  return JSON.parse(cleaned) as T;
}

export async function classifyWardrobeItem(image: ImagePart): Promise<WardrobeClassification> {
  return generateStructuredJson<WardrobeClassification>({
    images: [image],
    prompt: PROMPTS.classifyWardrobeItem,
  });
}

export async function removeBackground(image: ImagePart): Promise<GeneratedImageResult> {
  return generateImage({ images: [image], prompt: PROMPTS.removeBackground });
}

/**
 * Isole le produit d'une photo e-commerce (souvent : mannequin portant une
 * tenue complète, fond de studio/lifestyle) — contrairement à une photo de
 * garde-robe qui montre déjà un seul vêtement. Sans cette isolation ciblée,
 * la génération try-on peut confondre le produit avec une autre pièce visible
 * sur la même photo (ex : un short confondu avec le jean porté à côté).
 */
export async function isolateProductGarment(
  image: ImagePart,
  category: string,
  name: string
): Promise<GeneratedImageResult> {
  const prompt = `
Analyze this e-commerce product photo, which may show a full outfit, a model,
or a lifestyle background. Isolate ONLY the "${name}" (category: ${category})
being sold — ignore any other garment worn in the same photo, the person, and
the background.
Return this single item alone, isolated on a pure white (#FFFFFF) background.
Preserve its exact color, pattern, silhouette and fabric details.
Clean crisp edges. No artifacts or halos. No other garment visible.
  `.trim();

  return generateImage({ images: [image], prompt });
}

/**
 * Neutralise le mannequin d'une photo de référence de pose (visage ET
 * vêtements), appelé à l'upload (voir app/api/admin/poses/route.ts).
 *
 * Le floutage du visage seul a d'abord réglé la fuite d'identité : constaté
 * par test isolé (personne + pose, sans vêtement, plusieurs essais), un
 * visage net et bien visible sur la photo de pose "fuite" dans le résultat et
 * prend le dessus sur la vraie référence utilisateur, quel que soit le
 * prompt.
 *
 * Même constat ensuite sur les VÊTEMENTS du mannequin stock : un blazer bien
 * visible sur une photo de pose "mi-corps" s'est mélangé à la chemise réelle
 * de l'utilisateur dans le résultat, et une paire de chaussures visible sur
 * une photo de pose "gros plan" a pris le dessus sur le produit shoes en
 * cours d'essayage — alors que le prompt dit explicitement d'ignorer les
 * vêtements de cette photo. On aplatit donc aussi leur couleur/texture ici,
 * en gardant la silhouette/coupe pour ne pas perdre les repères de pose (bras
 * dans une manche, pied dans une chaussure, etc.).
 */
export async function neutralizePoseReference(image: ImagePart): Promise<GeneratedImageResult> {
  const prompt = `
Edit this photo: heavily blur ONLY the face of the person shown, so their
identity is not recognizable — like a strong gaussian blur applied just to
the face area.
Also replace all of their clothing with a plain, flat, mid-gray outfit: no
color, no pattern, no texture, no logo, no distinguishing design — but keep
the exact same clothing silhouette, cut and fit (same sleeve length, same
shoe shape, etc.) so the body pose stays exactly as readable as before.
Preserve everything else EXACTLY unchanged: body pose, body position, hair,
environment, background, lighting, framing and depth of field. Do not alter
anything other than the face and the clothing's color/texture/pattern.
  `.trim();

  return generateImage({ images: [image], prompt });
}

/**
 * Décrit en mots la pose/le cadrage/l'environnement d'une photo de référence
 * de pose (voir app/api/admin/poses/route.ts, appelé à l'upload). Donner
 * cette description en texte à la génération try-on, en complément de
 * l'image, s'est avéré nettement plus fiable que l'image seule pour empêcher
 * Gemini de recopier le mannequin de la photo stock (voir generateTryOnImage
 * et TRY_ON_REFERENCE_LABELS.poseRef).
 */
export async function describePoseReference(image: ImagePart): Promise<string> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      {
        role: "user",
        parts: [toPart(image), { text: PROMPTS.describePoseReference }],
      },
    ],
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error("Gemini n'a renvoyé aucune description de pose.");
  }
  return text;
}
