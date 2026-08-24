import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { ProfileDetailsForm } from "@/components/onboarding/ProfileDetailsForm";
import { createClient } from "@/lib/supabase/server";
import { resolveAssetUrl } from "@/lib/supabase/storage";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("neutral_ref_url, height_cm, body_type")
    .eq("id", user!.id)
    .single();

  const neutralPreviewUrl = profile?.neutral_ref_url
    ? await resolveAssetUrl(supabase, profile.neutral_ref_url)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
        <p className="text-muted-foreground">
          Ton image neutre sert de base à toutes les générations de vêtements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Image neutre</CardTitle>
          <CardDescription>
            Une photo studio générée par IA, fidèle à ton visage et ta morphologie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {neutralPreviewUrl ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="aspect-[3/4] w-48 overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={neutralPreviewUrl} alt="Image neutre" className="size-full object-cover" />
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Tu peux régénérer ton image neutre si elle ne te ressemble plus (nouvelle coupe
                  de cheveux, etc.).
                </p>
                <details>
                  <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">
                    Régénérer mon image neutre
                  </summary>
                  <div className="mt-4">
                    <OnboardingFlow />
                  </div>
                </details>
              </div>
            </div>
          ) : (
            <OnboardingFlow />
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Informations complémentaires</CardTitle>
          <CardDescription>Optionnel — aide à affiner le rendu des essayages.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileDetailsForm
            defaultHeightCm={profile?.height_cm ?? null}
            defaultBodyType={profile?.body_type ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
