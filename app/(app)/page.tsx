import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { ProductSubmit } from "@/components/try-on/ProductSubmit";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("neutral_ref_url")
    .eq("id", user!.id)
    .single();

  if (!profile?.neutral_ref_url) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-16 text-center">
        <AlertTriangle className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Ton profil n&apos;est pas encore prêt</p>
          <p className="text-sm text-muted-foreground">
            Génère d&apos;abord ton image neutre pour pouvoir essayer des vêtements.
          </p>
        </div>
        <Link href="/profile" className="text-sm underline underline-offset-4">
          Aller à mon profil
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Essayer un vêtement</h1>
        <p className="text-muted-foreground">
          Colle le lien d&apos;un produit, ou envoie une capture d&apos;écran.
        </p>
      </div>
      <ProductSubmit />
    </div>
  );
}
