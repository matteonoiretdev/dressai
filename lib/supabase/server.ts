import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/types/database";

/**
 * Client Supabase pour les Server Components, Server Actions et Route Handlers.
 * Respecte la RLS via le cookie de session de l'utilisateur.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Le set peut être appelé depuis un Server Component : sans effet,
            // le middleware/proxy rafraîchit la session à la place.
          }
        },
      },
    }
  );
}
