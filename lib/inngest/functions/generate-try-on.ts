import { NonRetriableError } from "inngest";

import { generateTryOnImage, type TryOnReferenceImage } from "@/lib/gemini";
import { inngest, type TryOnGenerateEventData } from "@/lib/inngest/client";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAssetUrl, uploadToGeneratedImages } from "@/lib/supabase/storage";
import { extensionForMimeType, fetchImageAsBase64 } from "@/lib/utils/image";
import type { PoseAngle } from "@/lib/types";

const ANGLES: PoseAngle[] = ["full_body", "mid_shot", "close_up"];

interface PoseSubRef {
  url: string;
  description: string | null;
}

interface Context {
  neutralUrl: string;
  productUrl: string;
  productDetail: string;
  wardrobeUrl: string | null;
  wardrobeDetail: string | null;
  subRefs: Record<PoseAngle, PoseSubRef>;
}

/** Décrit un vêtement en une phrase concrète (catégorie + nom + couleur si connue),
 * utilisée dans le prompt à la place du terme générique "the garment"/"the paired
 * item" — voir TryOnReferenceImage.detail dans lib/gemini.ts. */
function describeGarment(category: string, name: string | null, color: string | null): string {
  const parts = [`a "${name ?? category}" (category: ${category})`];
  if (color) parts.push(`color: ${color}`);
  return parts.join(", ");
}

/**
 * Recharge les références "de base" (identité, produit, pairing garde-robe)
 * depuis leurs URLs déjà résolues. Refait à chaque tour plutôt que mise en
 * cache dans l'état d'un step Inngest (pour éviter de faire transiter des
 * gros payloads base64 dans le state du job) — coût réseau négligeable, ce
 * sont de petites images déjà compressées.
 */
async function loadBaseReferences(context: Context): Promise<TryOnReferenceImage[]> {
  const [person, garment, pairedGarment] = await Promise.all([
    fetchImageAsBase64(context.neutralUrl),
    fetchImageAsBase64(context.productUrl),
    context.wardrobeUrl ? fetchImageAsBase64(context.wardrobeUrl) : Promise.resolve(null),
  ]);

  const references: TryOnReferenceImage[] = [
    { role: "person", image: person },
    { role: "garment", image: garment, detail: context.productDetail },
  ];
  if (pairedGarment && context.wardrobeDetail) {
    references.push({ role: "pairedGarment", image: pairedGarment, detail: context.wardrobeDetail });
  }
  return references;
}

/**
 * Job de génération d'un try-on : 3 tours Gemini (plein pied, mi-corps, gros plan).
 *
 * Chaque tour est un step.run indépendant, généré à partir des MÊMES
 * person/garment/pairedGarment + SA PROPRE référence de pose pour cet angle —
 * volontairement sans réutiliser l'image générée au tour précédent (voir le
 * commentaire au-dessus de TRY_ON_REFERENCE_LABELS dans lib/gemini.ts pour le
 * pourquoi : chaîner les tours créait un conflit entre deux sources de pose
 * photoréalistes que le modèle réconciliait mal).
 */
export const generateTryOn = inngest.createFunction(
  {
    id: "generate-try-on",
    triggers: [{ event: "try-on/generate" }],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const { sessionId } = event.data.event.data as TryOnGenerateEventData;
      const supabase = createServiceClient();
      await supabase
        .from("try_on_sessions")
        .update({ status: "failed", error_message: error.message })
        .eq("id", sessionId);
    },
  },
  async ({ event, step }) => {
    const { sessionId } = event.data as TryOnGenerateEventData;
    const supabase = createServiceClient();

    await step.run("mark-processing", async () => {
      const { error } = await supabase
        .from("try_on_sessions")
        .update({ status: "processing" })
        .eq("id", sessionId);
      if (error) throw error;
    });

    const context: Context = await step.run("load-context", async () => {
      const { data: session, error: sessionError } = await supabase
        .from("try_on_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (sessionError || !session) {
        throw new NonRetriableError(`Session introuvable : ${sessionId}`);
      }

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("neutral_ref_url")
        .eq("id", session.user_id)
        .single();
      if (userError || !user?.neutral_ref_url) {
        throw new NonRetriableError("Le profil utilisateur n'a pas d'image neutre validée.");
      }

      let wardrobeImagePath: string | null = null;
      let wardrobeDetail: string | null = null;
      if (session.wardrobe_item_id) {
        const { data: item, error: itemError } = await supabase
          .from("wardrobe_items")
          .select("image_url, clean_image_url, category, name, color_primary")
          .eq("id", session.wardrobe_item_id)
          .single();
        if (itemError || !item) {
          throw new NonRetriableError("Article de garde-robe introuvable.");
        }
        wardrobeImagePath = item.clean_image_url ?? item.image_url;
        wardrobeDetail = describeGarment(item.category, item.name, item.color_primary);
      }

      if (!session.pose_reference_id) {
        throw new NonRetriableError("Aucune référence de pose associée à la session.");
      }

      const { data: subRefs, error: subRefsError } = await supabase
        .from("pose_sub_references")
        .select("angle, image_url, pose_description")
        .eq("reference_id", session.pose_reference_id);
      if (subRefsError || !subRefs?.length) {
        throw new NonRetriableError("Aucune sous-référence de pose trouvée pour cette session.");
      }

      const subRefByAngle = Object.fromEntries(
        subRefs.map((s) => [s.angle, { url: s.image_url, description: s.pose_description }])
      ) as Record<PoseAngle, PoseSubRef>;

      for (const angle of ANGLES) {
        if (!subRefByAngle[angle]) {
          throw new NonRetriableError(`Sous-référence de pose manquante pour l'angle "${angle}".`);
        }
      }

      const [neutralUrl, wardrobeUrl, productUrl] = await Promise.all([
        resolveAssetUrl(supabase, user.neutral_ref_url),
        wardrobeImagePath ? resolveAssetUrl(supabase, wardrobeImagePath) : Promise.resolve(null),
        resolveAssetUrl(supabase, session.product_image_url),
      ]);

      return {
        neutralUrl,
        productUrl,
        productDetail: describeGarment(
          session.product_category,
          session.product_name,
          session.product_color
        ),
        wardrobeUrl,
        wardrobeDetail,
        subRefs: subRefByAngle,
      };
    });

    for (const [index, angle] of ANGLES.entries()) {
      await step.run(`generate-${angle}`, async () => {
        const subRef = context.subRefs[angle];
        const [base, poseRefImage] = await Promise.all([
          loadBaseReferences(context),
          fetchImageAsBase64(subRef.url),
        ]);

        const result = await generateTryOnImage([
          ...base,
          { role: "poseRef", image: poseRefImage, detail: subRef.description ?? undefined },
        ]);

        const path = `${sessionId}/${angle}.${extensionForMimeType(result.image.mimeType)}`;
        const url = await uploadToGeneratedImages(supabase, path, result.image);

        const { error } = await supabase.from("generated_images").insert({
          session_id: sessionId,
          image_url: url,
          angle,
          order_index: index,
        });
        if (error) throw error;

        return { url };
      });
    }

    await step.run("mark-completed", async () => {
      const { error } = await supabase
        .from("try_on_sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
      if (error) throw error;
    });

    return { sessionId, status: "completed" };
  }
);
