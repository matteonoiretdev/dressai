import { GoogleGenAI, Modality, type Part } from "@google/genai";

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
 */
export interface TryOnReferenceImage {
  role: "person" | "garment" | "pairedGarment" | "poseRef";
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
          "preserving the exact colorway, silhouette, cut and material.",
      });
    } else {
      poseDescription = ref.detail;
      parts.push({
        text:
          `Using Reference Image ${index} ("the style"): replicate exactly this photo's ` +
          "atmosphere, lighting, background and depth of field. Do not use this photo's own " +
          "person or clothing.",
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
      "— not a new face, not a similar-looking model. Professional fashion photography, " +
      "photorealistic, high-end lookbook quality, sharp garment details.",
  });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      // Température basse : privilégie la fidélité aux références (identité,
      // produit) plutôt que la créativité.
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
 * Floute le visage du mannequin sur une photo de référence de pose, appelé à
 * l'upload (voir app/api/admin/poses/route.ts). Constaté par test isolé
 * (personne + pose, sans vêtement, plusieurs essais) : quand le mannequin de
 * la photo de pose a un visage net et bien visible, ce visage "fuite" dans le
 * résultat et prend le dessus sur la vraie référence utilisateur, quel que
 * soit le prompt. Anonymiser le mannequin à la source règle le problème sans
 * devoir chercher des photos stock "sans visage".
 */
export async function obscureFaceInPoseReference(image: ImagePart): Promise<GeneratedImageResult> {
  const prompt = `
Edit this photo: heavily blur ONLY the face of the person shown, so their
identity is not recognizable — like a strong gaussian blur applied just to
the face area.
Preserve everything else EXACTLY unchanged: body pose, body position,
clothing, hair, environment, background, lighting, framing and depth of
field. Do not blur or alter anything other than the face.
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
