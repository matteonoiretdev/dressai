/**
 * Redimensionne + recompresse une image côté navigateur avant upload.
 *
 * Les Route Handlers Next.js sur Vercel (runtime Node serverless) ont une
 * limite de taille de requête d'environ 4,5 Mo. Une photo de smartphone
 * moderne pèse souvent 3 à 12 Mo — largement suffisant pour dépasser cette
 * limite à elle seule, et l'onboarding en envoie jusqu'à 6 d'un coup dans la
 * même requête multipart. Sans compression, la requête est rejetée par la
 * plateforme *avant* d'atteindre notre code (413 "Request Entity Too Large"),
 * ce qui expliquait le crash "Unexpected token 'R' ... is not valid JSON"
 * côté client (voir lib/utils/fetch-json.ts pour l'autre moitié du correctif).
 */
export async function compressImage(
  file: File,
  { maxDimension = 1600, quality = 0.82 }: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  // Rien à faire pour un fichier déjà léger (évite le coût du re-encodage).
  if (file.size <= 1.5 * 1024 * 1024) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    // En cas d'échec (format non supporté par createImageBitmap, etc.), on
    // retombe sur le fichier d'origine plutôt que de bloquer l'utilisateur.
    return file;
  }
}

export async function compressImages(
  files: File[],
  options?: { maxDimension?: number; quality?: number }
): Promise<File[]> {
  return Promise.all(files.map((file) => compressImage(file, options)));
}
