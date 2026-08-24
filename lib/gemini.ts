import { GoogleGenAI, Modality, type Content, type Part } from "@google/genai";

import type { ImagePart } from "@/lib/utils/image";
import type { WardrobeClassification } from "@/lib/types";

// Modèle de génération d'images "Nano Banana". Configurable via env var au cas
// où Google fait évoluer l'identifiant (ex: gemini-2.5-flash-image-preview).
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";

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

  tryOnTurn1: `
Create a professional fashion photograph.
Person: use the exact identity from image 1 (face, skin tone, body proportions,
all distinctive physical features including tattoos).
Outfit: the person is wearing the garment from image 2, paired with image 3.
Composition, environment, pose, lighting: follow image 4 exactly.
Photorealistic, editorial fashion photography quality.
Sharp fabric details. No face alterations.
  `.trim(),

  tryOnTurn2: `
Image 1 is a fashion photograph already generated: same person, same outfit,
same environment and lighting. Preserve identity, outfit and environment from
image 1 EXACTLY, pixel-perfect consistent.
Image 2 is a pose/composition reference. Recompose the same person and outfit
from image 1 using the framing, camera angle and pose from image 2.
Photorealistic, editorial fashion photography quality. No face alterations.
  `.trim(),

  tryOnTurn3: `
Image 1 is a fashion photograph already generated: same person, same outfit,
same environment and lighting. Preserve identity, outfit and environment from
image 1 EXACTLY, pixel-perfect consistent.
Image 2 is a pose/composition reference. Recompose the same person and outfit
from image 1 using the framing, camera angle and pose from image 2.
Photorealistic, editorial fashion photography quality. No face alterations.
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
 * Session de chat Gemini multi-tours : conserve l'historique de la conversation
 * (identité, tenue, environnement) entre les 3 angles de la génération try-on.
 */
export class TryOnChatSession {
  private chat;

  constructor() {
    const ai = getClient();
    this.chat = ai.chats.create({
      model: IMAGE_MODEL,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
  }

  async send(images: ImagePart[], prompt: string): Promise<GeneratedImageResult> {
    const message: Part[] = [...images.map(toPart), { text: prompt }];
    const response = await this.chat.sendMessage({ message });
    return extractResult(response);
  }

  getHistory(): Content[] {
    return this.chat.getHistory();
  }
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
