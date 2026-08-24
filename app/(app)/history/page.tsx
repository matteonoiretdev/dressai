import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl } from "@/lib/supabase/storage";
import type { TryOnStatus } from "@/lib/types";

const STATUS_LABELS: Record<TryOnStatus, string> = {
  pending: "En attente",
  processing: "En cours",
  completed: "Terminé",
  failed: "Échoué",
};

const STATUS_VARIANTS: Record<TryOnStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  processing: "secondary",
  completed: "default",
  failed: "destructive",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: rawSessions } = await supabase
    .from("try_on_sessions")
    .select("id, product_name, product_image_url, status, created_at")
    .order("created_at", { ascending: false });

  const sessions = rawSessions
    ? await Promise.all(
        rawSessions.map(async (session) => ({
          ...session,
          product_image_url: await resolveAssetUrl(supabase, session.product_image_url),
        }))
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historique</h1>
        <p className="text-muted-foreground">Tous tes essayages précédents.</p>
      </div>

      {!sessions?.length ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Aucun essayage pour l&apos;instant.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {sessions.map((session) => (
            <Link key={session.id} href={`/try-on/${session.id}`}>
              <Card className="gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md">
                <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={session.product_image_url}
                    alt={session.product_name ?? "Produit"}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <p className="truncate text-sm font-medium">{session.product_name ?? "Produit"}</p>
                  <Badge variant={STATUS_VARIANTS[session.status as TryOnStatus]}>
                    {STATUS_LABELS[session.status as TryOnStatus]}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
