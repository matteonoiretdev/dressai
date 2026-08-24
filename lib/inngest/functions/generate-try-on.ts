import { NonRetriableError } from "inngest";

import { inngest, type TryOnGenerateEventData } from "@/lib/inngest/client";
import { generateImage, PROMPTS } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAssetUrl, uploadToGeneratedImages } from "@/lib/supabase/storage";
import { extensionForMimeType, fetchImageAsBase64, type ImagePart } from "@/lib/utils/image";
import type { PoseAngle } from "@/lib/types";

const ANGLES: PoseAngle[] = ["full_body", "mid_shot", "close_up"];

/**
 * Job de génération d'un try-on : 3 tours Gemini (plein pied, mi-corps, gros plan).
 *
 * Chaque tour est un step.run indépendant : Gemini est repris de zéro à chaque
 * angle (pas de session de chat persistée entre steps, incompatible avec le
 * modèle d'exécution durable d'Inngest), la cohérence identité/tenue/environnement
 * est maintenue en réinjectant l'image générée au tour précédent comme référence
 * visuelle du tour suivant (voir PROMPTS.tryOnTurn2/3 dans lib/gemini.ts).
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

    const context = await step.run("load-context", async () => {
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
      if (session.wardrobe_item_id) {
        const { data: item, error: itemError } = await supabase
          .from("wardrobe_items")
          .select("image_url, clean_image_url")
          .eq("id", session.wardrobe_item_id)
          .single();
        if (itemError || !item) {
          throw new NonRetriableError("Article de garde-robe introuvable.");
        }
        wardrobeImagePath = item.clean_image_url ?? item.image_url;
      }

      if (!session.pose_reference_id) {
        throw new NonRetriableError("Aucune référence de pose associée à la session.");
      }

      const { data: subRefs, error: subRefsError } = await supabase
        .from("pose_sub_references")
        .select("angle, image_url")
        .eq("reference_id", session.pose_reference_id);
      if (subRefsError || !subRefs?.length) {
        throw new NonRetriableError("Aucune sous-référence de pose trouvée pour cette session.");
      }

      const subRefByAngle = Object.fromEntries(
        subRefs.map((s) => [s.angle, s.image_url])
      ) as Record<PoseAngle, string>;

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
        wardrobeUrl,
        subRefs: subRefByAngle,
      };
    });

    const fullBody = await step.run("generate-full-body", async () => {
      const [neutral, product, wardrobe, poseRef] = await Promise.all([
        fetchImageAsBase64(context.neutralUrl),
        fetchImageAsBase64(context.productUrl),
        context.wardrobeUrl ? fetchImageAsBase64(context.wardrobeUrl) : Promise.resolve(null),
        fetchImageAsBase64(context.subRefs.full_body),
      ]);

      const images = [neutral, product, wardrobe, poseRef].filter(
        (img): img is ImagePart => img !== null
      );
      const result = await generateImage({ images, prompt: PROMPTS.tryOnTurn1 });

      const path = `${sessionId}/full_body.${extensionForMimeType(result.image.mimeType)}`;
      const url = await uploadToGeneratedImages(supabase, path, result.image);

      const { error } = await supabase.from("generated_images").insert({
        session_id: sessionId,
        image_url: url,
        angle: "full_body",
        order_index: 0,
      });
      if (error) throw error;

      return { url };
    });

    const midShot = await step.run("generate-mid-shot", async () => {
      const [previous, poseRef] = await Promise.all([
        fetchImageAsBase64(fullBody.url),
        fetchImageAsBase64(context.subRefs.mid_shot),
      ]);
      const result = await generateImage({
        images: [previous, poseRef],
        prompt: PROMPTS.tryOnTurn2,
      });

      const path = `${sessionId}/mid_shot.${extensionForMimeType(result.image.mimeType)}`;
      const url = await uploadToGeneratedImages(supabase, path, result.image);

      const { error } = await supabase.from("generated_images").insert({
        session_id: sessionId,
        image_url: url,
        angle: "mid_shot",
        order_index: 1,
      });
      if (error) throw error;

      return { url };
    });

    await step.run("generate-close-up", async () => {
      const [previous, poseRef] = await Promise.all([
        fetchImageAsBase64(midShot.url),
        fetchImageAsBase64(context.subRefs.close_up),
      ]);
      const result = await generateImage({
        images: [previous, poseRef],
        prompt: PROMPTS.tryOnTurn3,
      });

      const path = `${sessionId}/close_up.${extensionForMimeType(result.image.mimeType)}`;
      const url = await uploadToGeneratedImages(supabase, path, result.image);

      const { error } = await supabase.from("generated_images").insert({
        session_id: sessionId,
        image_url: url,
        angle: "close_up",
        order_index: 2,
      });
      if (error) throw error;

      return { url };
    });

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
