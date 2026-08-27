"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANGLES, ANGLE_LABELS, ENVIRONMENT_LABELS, ENVIRONMENTS } from "@/lib/constants/poses";
import { compressImage } from "@/lib/utils/compress-image";
import { parseJsonResponse } from "@/lib/utils/fetch-json";
import type { PoseAngle, PoseEnvironment } from "@/lib/types";

export function PoseImportForm({
  categories,
}: {
  categories: { id: string; slug: string; name: string }[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [environment, setEnvironment] = useState<PoseEnvironment>("urban");
  const [environmentLabel, setEnvironmentLabel] = useState(ENVIRONMENT_LABELS.urban);
  const [isDefault, setIsDefault] = useState(true);
  const [files, setFiles] = useState<Partial<Record<PoseAngle, File>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleEnvironmentChange(value: string) {
    const env = value as PoseEnvironment;
    setEnvironment(env);
    setEnvironmentLabel(ENVIRONMENT_LABELS[env]);
  }

  async function handleSubmit() {
    if (!category) {
      toast.error("Choisis une catégorie.");
      return;
    }
    if (Object.keys(files).length === 0) {
      toast.error("Ajoute au moins une photo.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("category", category);
      formData.append("environment", environment);
      formData.append("environmentLabel", environmentLabel);
      formData.append("isDefault", String(isDefault));

      for (const angle of ANGLES) {
        const file = files[angle];
        if (file) formData.append(angle, await compressImage(file));
      }

      const response = await fetch("/api/admin/poses", { method: "POST", body: formData });
      await parseJsonResponse(response);

      toast.success("Référence de pose ajoutée.");
      setFiles({});
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajouter une référence de pose</CardTitle>
        <CardDescription>
          Une catégorie × un environnement = jusqu&apos;à 3 photos (plein pied, mi-corps, gros
          plan), idéalement les 3 angles d&apos;une même prise de vue continue (même pose, même
          instant). Le visage du mannequin est automatiquement flouté à l&apos;upload (pour qu&apos;il
          ne &laquo;&nbsp;déteigne&nbsp;&raquo; pas sur le visage de l&apos;utilisateur généré) —
          une tenue neutre et discrète sur le mannequin reste préférable, mais n&apos;est plus
          critique.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Environnement</Label>
            <Select value={environment} onValueChange={handleEnvironmentChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENTS.map((env) => (
                  <SelectItem key={env} value={env}>
                    {ENVIRONMENT_LABELS[env]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="environment-label">Libellé affiché</Label>
            <Input
              id="environment-label"
              value={environmentLabel}
              onChange={(e) => setEnvironmentLabel(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ANGLES.map((angle) => (
            <div key={angle} className="flex flex-col gap-2">
              <Label htmlFor={`file-${angle}`}>{ANGLE_LABELS[angle]}</Label>
              <Input
                id={`file-${angle}`}
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setFiles((prev) => ({ ...prev, [angle]: e.target.files?.[0] ?? undefined }))
                }
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="is-default"
            checked={isDefault}
            onCheckedChange={(checked) => setIsDefault(checked === true)}
          />
          <Label htmlFor="is-default" className="font-normal">
            Environnement par défaut pour cette catégorie (utilisé automatiquement si l&apos;utilisateur
            ne choisit pas)
          </Label>
        </div>

        <Button onClick={handleSubmit} disabled={isSubmitting} className="self-start">
          {isSubmitting ? "Envoi en cours..." : "Ajouter cette référence"}
        </Button>
      </CardContent>
    </Card>
  );
}
