"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  height_cm: z.coerce.number().int().min(100).max(230).optional(),
  body_type: z.enum(["slim", "regular", "athletic", "curvy"]).optional(),
});

export interface UpdateProfileState {
  error?: string;
  success?: boolean;
}

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié." };

  const heightRaw = formData.get("height_cm");
  const bodyTypeRaw = formData.get("body_type");

  const parsed = schema.safeParse({
    height_cm: heightRaw ? heightRaw : undefined,
    body_type: bodyTypeRaw ? bodyTypeRaw : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { error } = await supabase.from("users").update(parsed.data).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { success: true };
}
