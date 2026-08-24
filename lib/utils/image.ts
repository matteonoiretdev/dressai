export interface ImagePart {
  data: string; // base64, sans le préfixe data:...;base64,
  mimeType: string;
}

/**
 * Télécharge une image (URL publique ou signée) et la convertit en base64
 * pour l'envoyer à l'API Gemini.
 */
export async function fetchImageAsBase64(url: string): Promise<ImagePart> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de télécharger l'image (${response.status}) : ${url}`);
  }

  const mimeType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = await response.arrayBuffer();
  const data = Buffer.from(buffer).toString("base64");

  return { data, mimeType };
}

/**
 * Convertit un File/Blob uploadé côté client en base64 (utilisé côté serveur
 * après réception d'un FormData dans un Route Handler).
 */
export async function fileToBase64(file: File): Promise<ImagePart> {
  const buffer = await file.arrayBuffer();
  const data = Buffer.from(buffer).toString("base64");
  return { data, mimeType: file.type || "image/jpeg" };
}

export function base64ToBlob(data: string, mimeType: string): Blob {
  const buffer = Buffer.from(data, "base64");
  return new Blob([buffer], { type: mimeType });
}

/** Extension de fichier déduite d'un mime type image. */
export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    default:
      return "jpg";
  }
}
