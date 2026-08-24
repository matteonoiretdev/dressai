import { GoogleGenAI, Modality, type Part } from "@google/genai";

import type { ImagePart } from "@/lib/utils/image";
import type { WardrobeClassification } from "@/lib/types";

// Modèle de génération d'images "Nano Banana". Configurable via env var au cas
// où Google fait évoluer l'identifiant (ex: gemini-2.5-flash-image-preview).
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
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
 * Rôles de référence pour la génération try-on. Chaque image envoyée à Gemini
 * est précédée d'un label + une instruction dédiée plutôt que désignée par sa
 * position ("image 1", "image 2"...) — plus robuste quand le nombre d'images
 * varie (pas de pairing garde-robe, pas de tour précédent sur le 1er angle),
 * et ça évite que le modèle confonde le rôle d'une image.
 *
 * Point important : POSE_REF précise explicitement d'ignorer les vêtements
 * visibles sur la photo de référence de pose (des mannequins stock) — sans
 * ça, Gemini a tendance à faire fuiter leurs vêtements/chaussures dans le
 * résultat au lieu de ceux du produit.
 */
const TRY_ON_REFERENCE_LABELS = {
  person: {
    label: "PERSON REFERENCE",
    instructions:
      "This is the exact person to render in the output. Preserve their face shape, " +
      "facial features, hairstyle, hair color, skin tone, height and body proportions " +
      "EXACTLY as shown. Do not beautify, do not change ethnicity, do not alter facial " +
      "structure.",
  },
  garment: {
    label: "GARMENT REFERENCE — MUST WEAR EXACTLY THIS",
    instructions:
      "This is the exact garment/product the person must be wearing in the output. " +
      "Reproduce its silhouette, cut, color, pattern, texture and material precisely. " +
      "Do not substitute, simplify or reinterpret it as a different garment.",
  },
  pairedGarment: {
    label: "PAIRED GARMENT REFERENCE",
    instructions:
      "An additional garment from the person's own wardrobe, worn together with the " +
      "garment above. Reproduce it precisely as well.",
  },
  poseRef: {
    label: "POSE & ENVIRONMENT REFERENCE",
    instructions:
      "Use ONLY the body pose, camera angle, framing, environment, background and " +
      "lighting from this image. Completely IGNORE any clothing, shoes or accessories " +
      "visible on the person in this image — they belong to a different photoshoot and " +
      "must NOT appear in the output.",
  },
  previousShot: {
    label: "PREVIOUS SHOT — SAME PHOTOSHOOT",
    instructions:
      "The same person, wearing the same outfit, in the same environment and lighting, " +
      "already generated moments ago as part of this same photoshoot. Keep identity, " +
      "outfit, environment and lighting perfectly consistent with it — only the framing " +
      "and camera angle should change, driven by the pose & environment reference below.",
  },
} as const;

const TRY_ON_GENERATION_INSTRUCTIONS = `
Generate a single photorealistic fashion editorial photograph combining all the reference
images above according to their labelled roles.
Sharp, accurate garment rendering. Natural, professional editorial lighting consistent with
the pose & environment reference. No face alterations. No text, no watermark, no collage —
a single clean photograph.
`.trim();

export interface TryOnReferenceImage {
  role: keyof typeof TRY_ON_REFERENCE_LABELS;
  image: ImagePart;
}

/**
 * Génération try-on avec références labellisées par rôle (voir
 * TRY_ON_REFERENCE_LABELS ci-dessus). Utilisée pour les 3 angles — l'identité,
 * le produit et l'éventuel pairing garde-robe sont réinjectés à CHAQUE tour
 * (pas seulement le premier) pour éviter la dérive d'identité/tenue observée
 * en ne les fournissant qu'au premier tour.
 */
export async function generateTryOnImage(
  references: TryOnReferenceImage[]
): Promise<GeneratedImageResult> {
  const ai = getClient();

  const parts: Part[] = references.flatMap(({ role, image }) => {
    const { label, instructions } = TRY_ON_REFERENCE_LABELS[role];
    return [{ text: `--- ${label} ---\n${instructions}` }, toPart(image)];
  });
  parts.push({ text: TRY_ON_GENERATION_INSTRUCTIONS });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
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
