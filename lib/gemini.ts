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
 * Rôles de référence pour la génération try-on. Chaque image envoyée à Gemini
 * est précédée d'un label + une instruction dédiée plutôt que désignée par sa
 * position ("image 1", "image 2"...) — plus robuste quand le nombre d'images
 * varie (pas de pairing garde-robe), et ça évite que le modèle confonde le
 * rôle d'une image.
 *
 * Chaque tour (plein pied / mi-corps / gros plan) est généré indépendamment à
 * partir des MÊMES person/garment/pairedGarment + SA PROPRE pose_reference —
 * volontairement sans réutiliser l'image générée au tour précédent : la
 * chaîner créait un conflit entre deux sources de pose photoréalistes
 * (l'ancienne image générée + la nouvelle référence de pose) que le modèle
 * réconciliait mal, d'où des tours identiques entre eux ou une tenue qui
 * dérivait vers celle du mannequin stock plutôt que celle du produit.
 *
 * Point critique : les photos de référence de pose sont des photos stock
 * photoréalistes montrant un mannequin habillé au complet (veste, jean,
 * sneakers...), pas un simple squelette de pose neutre. En pratique, une
 * simple mention "ignore ses vêtements" ne suffit pas à empêcher Gemini de
 * reprendre quasiment tel quel l'outfit (voire le visage) de cette photo —
 * d'où le double renforcement ci-dessous : instruction négative répétée sur
 * POSE_REF lui-même, ET rappel explicite + contrasté dans les instructions
 * de clôture (buildTryOnGenerationInstructions), qui sont la dernière chose
 * lue par le modèle avant de générer.
 */
const TRY_ON_REFERENCE_LABELS = {
  person: {
    label: "PERSON REFERENCE — MOST IMPORTANT CONSTRAINT",
    instructions:
      "This is the exact, real individual to render in the output — not a generic or " +
      "idealized fashion model. Matching this specific person's identity is the single " +
      "most important constraint of this entire request, more important than pose or " +
      "environment accuracy. Preserve their exact face shape, nose shape, jaw shape, eye " +
      "shape and spacing, eyebrows, lips, skin tone and texture, hairstyle, hair color, " +
      "height and body proportions. Do not beautify, do not idealize, do not change " +
      "ethnicity, do not blend with a different face, do not alter facial structure in any " +
      "way. The output must be immediately recognizable as this same individual. This is " +
      "the ONLY source for the output's face and body — no other image in this request.",
    detailPrefix: "",
  },
  garment: {
    label: "GARMENT REFERENCE — MUST WEAR EXACTLY THIS",
    instructions:
      "This is the exact garment/product the person must be wearing in the output. " +
      "Reproduce its silhouette, cut, color, pattern, texture and material precisely. " +
      "Do not substitute, simplify or reinterpret it as a different garment. This is the " +
      "ONLY source for the output's main garment — no other image in this request.",
    detailPrefix: "Specifically, this item is:",
  },
  pairedGarment: {
    label: "PAIRED GARMENT REFERENCE — MUST WEAR EXACTLY THIS TOO",
    instructions:
      "An additional garment from the person's own wardrobe, worn together with the " +
      "garment above. Reproduce its silhouette, cut, color, pattern, texture and material " +
      "precisely, exactly as shown — do not substitute or reinterpret it.",
    detailPrefix: "Specifically, this item is:",
  },
  poseRef: {
    label: "ENVIRONMENT, LIGHTING & ATMOSPHERE REFERENCE — STOCK PHOTO, DO NOT COPY ITS PERSON",
    instructions:
      "This stock photo shows a DIFFERENT, unrelated person wearing DIFFERENT clothes. Use " +
      "it ONLY for the background, environment, lighting mood and depth-of-field/bokeh " +
      "style. Do NOT copy this image's person, face, body type, body pose, or ANY item of " +
      "clothing (jacket, shirt, pants, shoes) — none of it must appear in the output. The " +
      "exact body pose is given separately below as a text description and takes priority " +
      "over whatever pose this image shows.",
    detailPrefix: "POSE (strictly follow this, not the pose shown in the reference photo):",
  },
} as const;

function buildTryOnGenerationInstructions(
  references: TryOnReferenceImage[]
): string {
  const garment = references.find((r) => r.role === "garment");
  const pairedGarment = references.find((r) => r.role === "pairedGarment");
  const poseRef = references.find((r) => r.role === "poseRef");

  const outfitSentence = pairedGarment
    ? `wearing ${garment?.detail ?? "the exact garment"} from GARMENT REFERENCE together with ` +
      `${pairedGarment.detail ?? "the exact paired item"} from PAIRED GARMENT REFERENCE`
    : `wearing ${garment?.detail ?? "the exact garment"} from GARMENT REFERENCE`;

  const poseSentence = poseRef?.detail
    ? `POSE (strictly follow): ${poseRef.detail}`
    : "Pose comes from the ENVIRONMENT REFERENCE image.";

  return `
Generate a single photorealistic fashion editorial photograph of the exact person from
PERSON REFERENCE (see above — this is the most important constraint), ${outfitSentence}.
${poseSentence}
Background, environment, lighting and atmosphere: replicate the ENVIRONMENT REFERENCE photo's
mood exactly (urban background, lighting, depth of field) — but not its person, pose or
clothing, which must be completely absent from the output.
Sharp, accurate garment rendering. Photorealistic, professional editorial fashion photography
quality. No face alterations, no generic/idealized face. No text, no watermark, no collage —
a single clean photograph.
  `.trim();
}

export interface TryOnReferenceImage {
  role: keyof typeof TRY_ON_REFERENCE_LABELS;
  image: ImagePart;
  /**
   * Détail spécifique à cette instance, ajouté après l'instruction de base du
   * rôle. Pour garment/pairedGarment : nomme concrètement l'article (ex. "a
   * pair of sneakers (\"Nike Vaporwaffle\")") au lieu du terme générique
   * "the garment" — rend le prompt spécifique à la situation plutôt que
   * générique. Pour poseRef : description textuelle explicite de la pose
   * (voir describePoseReference ci-dessous), qui guide bien plus fiablement
   * le modèle que l'image seule.
   */
  detail?: string;
}

/**
 * Génération try-on avec références labellisées par rôle (voir
 * TRY_ON_REFERENCE_LABELS ci-dessus). Utilisée pour les 3 angles — l'identité,
 * le produit et l'éventuel pairing garde-robe sont réinjectés à CHAQUE tour
 * (pas seulement le premier) pour éviter la dérive d'identité/tenue observée
 * en ne les fournissant qu'au premier tour. Chaque tour est indépendant :
 * pas d'image du tour précédent parmi les références (voir le commentaire
 * au-dessus de TRY_ON_REFERENCE_LABELS pour le pourquoi).
 */
export async function generateTryOnImage(
  references: TryOnReferenceImage[]
): Promise<GeneratedImageResult> {
  const ai = getClient();

  const parts: Part[] = references.flatMap(({ role, image, detail }) => {
    const { label, instructions, detailPrefix } = TRY_ON_REFERENCE_LABELS[role];
    const text = detail ? `${instructions}\n${detailPrefix} ${detail}` : instructions;
    return [{ text: `--- ${label} ---\n${text}` }, toPart(image)];
  });
  parts.push({ text: buildTryOnGenerationInstructions(references) });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      // Température basse : privilégie la fidélité aux références (identité,
      // produit) plutôt que la créativité — la valeur par défaut plus élevée
      // laissait trop de marge au modèle pour dériver vers un visage
      // générique de mannequin plutôt que la vraie personne.
      temperature: 0.3,
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
