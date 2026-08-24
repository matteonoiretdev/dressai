"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuthActionState } from "@/lib/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "..." : label}
    </Button>
  );
}

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "register";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const isLogin = mode === "login";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isLogin ? "Connexion" : "Créer un compte"}</CardTitle>
        <CardDescription>
          {isLogin
            ? "Retrouve ta garde-robe et tes essayages."
            : "Commence par créer ton image neutre pour essayer des vêtements."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

          <SubmitButton label={isLogin ? "Se connecter" : "Créer mon compte"} />

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? (
              <>
                Pas encore de compte ?{" "}
                <Link href="/register" className="underline underline-offset-4">
                  Inscris-toi
                </Link>
              </>
            ) : (
              <>
                Déjà un compte ?{" "}
                <Link href="/login" className="underline underline-offset-4">
                  Connecte-toi
                </Link>
              </>
            )}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
