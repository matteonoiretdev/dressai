import { PoseImportForm } from "@/components/admin/PoseImportForm";
import { PoseLibraryList } from "@/components/admin/PoseLibraryList";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPosesPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: references }, { data: subReferences }] = await Promise.all([
    supabase.from("pose_categories").select("id, slug, name").order("name"),
    supabase
      .from("pose_references")
      .select("id, category_id, environment, environment_label, is_default")
      .order("environment_label"),
    supabase
      .from("pose_sub_references")
      .select("id, reference_id, angle, angle_label, image_url, order_index")
      .order("order_index"),
  ]);

  const referencesWithSubRefs = (references ?? []).map((reference) => ({
    ...reference,
    subReferences: (subReferences ?? []).filter((s) => s.reference_id === reference.id),
    categorySlug: (categories ?? []).find((c) => c.id === reference.category_id)?.slug ?? "?",
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import de la bibliothèque de poses
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Outil d&apos;admin temporaire, non lié dans le menu — cette page n&apos;est pas destinée
          à rester : supprime <code>app/(app)/admin/</code>,{" "}
          <code>components/admin/</code> et <code>app/api/admin/poses/route.ts</code> une fois la
          bibliothèque de poses complète.
        </p>
      </div>

      <PoseImportForm categories={categories ?? []} />

      <PoseLibraryList references={referencesWithSubRefs} />
    </div>
  );
}
