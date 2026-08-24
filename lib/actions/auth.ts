"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("Adresse email invalide."),
  password: z.string().min(6, "6 caractères minimum."),
});

export interface AuthActionState {
  error?: string;
  message?: string;
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "Email ou mot de passe incorrect." };
  }

  redirect("/");
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    return { error: error.message };
  }

  // Si la confirmation email est activée sur le projet Supabase, aucune session
  // n'est ouverte tant que le lien reçu par mail n'est pas cliqué.
  if (!data.session) {
    return { message: "Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse." };
  }

  redirect("/profile?welcome=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
