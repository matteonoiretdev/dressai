import { TestFaceForm } from "@/components/admin/TestFaceForm";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl } from "@/lib/supabase/storage";

export default async function TestFacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: references }, { data: categories }] = await Promise.all([
    supabase.from("users").select("neutral_ref_url").eq("id", user!.id).single(),
    supabase
      .from("pose_references")
      .select("id, category_id, environment_label")
      .order("environment_label"),
    supabase.from("pose_categories").select("id, slug, name"),
  ]);

  const neutralPreviewUrl = profile?.neutral_ref_url
    ? await resolveAssetUrl(supabase, profile.neutral_ref_url)
    : null;

  const referenceOptions = (references ?? []).map((r) => ({
    id: r.id,
    label: `${categories?.find((c) => c.id === r.category_id)?.name ?? "?"} — ${r.environment_label}`,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Test rapide : visage seul</h1>
        <p className="max-w-2xl text-muted-foreground">
          Outil d&apos;admin temporaire (non lié dans le menu, à retirer une fois le problème de
          fidélité du visage résolu). Génère une seule image — <strong>personne + pose, sans
          vêtement</strong> — pour itérer vite sur la fidélité du visage sans repasser par tout
          le pipeline try-on. Rien n&apos;est sauvegardé en base, juste affiché.
        </p>
      </div>

      {!neutralPreviewUrl ? (
        <p className="text-sm text-destructive">
          Aucune image neutre sur ton profil — va d&apos;abord sur /profile.
        </p>
      ) : (
        <TestFaceForm neutralPreviewUrl={neutralPreviewUrl} referenceOptions={referenceOptions} />
      )}
    </div>
  );
}
