/**
 * Parse la réponse d'un fetch en JSON, sans planter si le serveur (ou la
 * plateforme d'hébergement) renvoie autre chose que du JSON — par exemple la
 * page d'erreur texte/HTML de Vercel quand une requête dépasse la limite de
 * taille (413 "Request Entity Too Large"), qui ferait planter un `res.json()`
 * direct avec "Unexpected token 'R' ... is not valid JSON".
 *
 * Lève une Error avec le message le plus utile disponible : celui du corps
 * JSON `{ error }` si le serveur en a renvoyé un, sinon un message générique
 * basé sur le status HTTP.
 */
export async function parseJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  let data: unknown = null;
  if (contentType.includes("application/json") && raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : null) ?? describeHttpError(response.status, raw);
    throw new Error(message);
  }

  if (data === null) {
    throw new Error("Réponse du serveur invalide (pas du JSON).");
  }

  return data as T;
}

function describeHttpError(status: number, raw: string): string {
  if (status === 413) {
    return "Fichier(s) trop volumineux (limite ~4,5 Mo par requête). Réessaie avec des photos plus légères.";
  }
  if (status === 504) {
    return "Le serveur a mis trop de temps à répondre. Réessaie.";
  }
  if (raw.trim()) {
    return `Erreur serveur (${status}) : ${raw.slice(0, 200)}`;
  }
  return `Erreur serveur (${status}).`;
}
