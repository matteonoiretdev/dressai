"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateProfile, type UpdateProfileState } from "@/lib/actions/profile";
import type { BodyType } from "@/lib/types";

const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "slim", label: "Fine" },
  { value: "regular", label: "Standard" },
  { value: "athletic", label: "Athlétique" },
  { value: "curvy", label: "Pulpeuse" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement..." : "Enregistrer"}
    </Button>
  );
}

export function ProfileDetailsForm({
  defaultHeightCm,
  defaultBodyType,
}: {
  defaultHeightCm: number | null;
  defaultBodyType: BodyType | null;
}) {
  const [state, formAction] = useActionState<UpdateProfileState, FormData>(updateProfile, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="height_cm">Taille (cm)</Label>
          <Input
            id="height_cm"
            name="height_cm"
            type="number"
            min={100}
            max={230}
            defaultValue={defaultHeightCm ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="body_type">Morphologie</Label>
          <Select name="body_type" defaultValue={defaultBodyType ?? undefined}>
            <SelectTrigger id="body_type" className="w-full">
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              {BODY_TYPES.map((bt) => (
                <SelectItem key={bt.value} value={bt.value}>
                  {bt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-muted-foreground">Profil mis à jour.</p>}

      <SubmitButton />
    </form>
  );
}
