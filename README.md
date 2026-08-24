# DressAI — Virtual Try-On (V1)

Application web permettant à un utilisateur de visualiser des vêtements e-commerce
portés par lui-même — avec son propre visage, sa propre morphologie, et des vêtements
de sa garde-robe personnelle. Les images sont générées par l'API Google Gemini
(`gemini-2.5-flash-image`, alias "Nano Banana") en qualité photo professionnelle,
sous 3 angles différents, en suivant des photos de référence de pose réelles.

## Stack

| Couche | Techno |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript strict, Turbopack) |
| Styling | Tailwind CSS v4 + composants shadcn/ui (écrits à la main, voir note ci-dessous) |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Base de données | Supabase (PostgreSQL + RLS) |
| Stockage | Supabase Storage (3 buckets) |
| IA génération | Google Gemini (`@google/genai`) |
| Queue async | Inngest |

> **Next.js 16, pas 14.** Le projet a été scaffoldé avec la dernière version stable
> (create-next-app installe toujours la dernière). Next 16 renomme `middleware.ts`
> en `proxy.ts` (fait ici), et rend `params`/`searchParams` toujours asynchrones —
> déjà pris en compte dans tout le code.
>
> **Composants shadcn/ui écrits à la main.** Le CLI `shadcn init`/`add` appelle
> `ui.shadcn.com`, injoignable depuis cet environnement (proxy réseau restreint).
> Les composants dans `components/ui/` reproduisent fidèlement le style "new-york"
> shadcn (mêmes classes, mêmes primitives Radix). Une fois en local avec un accès
> réseau normal, `npx shadcn@latest add <composant>` fonctionnera normalement et
> régénérera ces fichiers à l'identique si besoin.

## Ce qui reste à faire avant de lancer l'app

### 1. Supabase — ✅ fait

Le projet Supabase **"DressAI"** (`anavmdbydqvvkwetrxrz`, région eu-west-1) a été
créé et configuré directement via le connecteur MCP Supabase :

- Les 5 migrations de `supabase/migrations/` sont appliquées (schéma, RLS, trigger
  `handle_new_user`, 3 buckets + policies storage, seed des 6 catégories de pose).
- L'audit de sécurité (`get_advisors`) est passé de 5 alertes à 0 — RLS a été
  activée sur `pose_categories`/`pose_references`/`pose_sub_references` (lecture
  publique uniquement, écriture réservée au `service_role`), et le privilège
  `EXECUTE` sur `handle_new_user()` a été retiré du rôle `PUBLIC`.
- `lib/types/database.ts` est généré depuis le vrai schéma (via
  `generate_typescript_types`), avec les unions strictes (`WardrobeCategory`,
  `TryOnStatus`, ...) reportées à la main par-dessus pour un typage plus précis
  que ce que le générateur produit seul.
- `.env.local` est rempli avec `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Il ne manque qu'une chose** : `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`.
Cette clé secrète n'est volontairement pas exposée par le connecteur MCP (aucun
outil ne la retourne) — récupère-la toi-même dans
[Project Settings > API](https://supabase.com/dashboard/project/anavmdbydqvvkwetrxrz/settings/api)
(section **service_role**, "secret").

### 2. Clé API Gemini

Crée une clé sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
et mets-la dans `GEMINI_API_KEY`. Le modèle utilisé est `gemini-2.5-flash-image`
(configurable via `GEMINI_IMAGE_MODEL` si Google fait évoluer l'identifiant).

### 3. Inngest

```bash
npx inngest-cli@latest dev
```
lance un serveur Inngest local qui découvre automatiquement les fonctions via
`app/api/inngest/route.ts` (`http://localhost:3000/api/inngest`). En production,
connecte le projet sur [app.inngest.com](https://app.inngest.com) et renseigne
`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.

### 4. Bibliothèque de photos de référence de poses

**C'est la seule partie non automatisable** : il faut de vraies photos d'un
mannequin aux traits neutres, sous 3 angles (`full_body`, `mid_shot`, `close_up`),
pour au moins un environnement par catégorie de vêtement.

1. Place les photos dans :
   ```
   seed-assets/reference-library/
     tops/
       urban/
         full_body.jpg
         mid_shot.jpg
         close_up.jpg
       studio/...
     bottoms/urban/...
     dresses/urban/...
     shoes/urban/...
     jackets/urban/...
     accessories/urban/...
   ```
   (dossier ignoré par git — voir `.gitignore`). Le premier environnement trouvé
   pour chaque catégorie est marqué par défaut (`is_default = true`).
2. Lance :
   ```bash
   npm run seed:poses
   ```
   Le script uploade les images dans le bucket `reference-library` et insère les
   lignes `pose_references` / `pose_sub_references` correspondantes.

Sans cette étape, la génération d'un try-on échouera avec l'erreur *"Aucune
référence de pose disponible pour cette catégorie"* — le reste de l'app
(auth, dressing, onboarding) fonctionne normalement sans elle.

## Lancer en local

```bash
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev                  # terminal 1
npx inngest-cli@latest dev   # terminal 2
```

## Structure du projet

```
app/
  (auth)/login, register/        — pages publiques
  (app)/                          — pages protégées (proxy.ts redirige sinon)
    page.tsx                      — soumettre un produit
    dressing/                     — garde-robe
    profile/                      — onboarding image neutre + infos morpho
    history/                      — historique des essayages
    try-on/[sessionId]/           — galerie de résultats (polling)
  api/
    generate/route.ts             — crée une session + déclenche Inngest
    product/route.ts              — extraction produit (scraping ou upload)
    wardrobe/route.ts             — CRUD garde-robe (détourage + classification Gemini)
    onboarding/route.ts           — génération + validation de l'image neutre
    try-on/[sessionId]/route.ts   — statut + résultats (pour le polling)
    inngest/route.ts              — endpoint Inngest (serve handler)

components/
  ui/            — primitives shadcn/ui (écrites à la main, voir note plus haut)
  onboarding/    — PhotoUploader, NeutralImageValidator, OnboardingFlow
  wardrobe/      — WardrobeGrid, AddItemModal
  try-on/        — ProductSubmit, PairingSelector, ResultsGallery, EnvironmentSwitcher

lib/
  gemini.ts                       — client @google/genai + tous les prompts
  supabase/{server,client,service,proxy,storage}.ts
  inngest/{client,functions/generate-try-on}.ts
  actions/{auth,profile}.ts       — Server Actions
  utils/{image,scrape-product,wardrobe-pairing}.ts
  types/{index,database}.ts

supabase/migrations/    — SQL à exécuter dans l'éditeur Supabase
scripts/seed-poses.ts   — seed de la bibliothèque de poses
```

## Notes d'implémentation

- **Génération multi-tours** (`lib/inngest/functions/generate-try-on.ts`) : chaque
  angle (plein pied / mi-corps / gros plan) est un `step.run` Inngest indépendant.
  Plutôt que de garder une session de chat Gemini vivante entre les steps (ce qui
  ne survit pas à la ré-exécution durable d'Inngest), la cohérence
  identité/tenue/environnement est maintenue en réinjectant l'image générée au tour
  précédent comme image de référence du tour suivant. `lib/gemini.ts` expose aussi
  `TryOnChatSession`, une vraie session multi-tours Gemini (historique de
  conversation), utilisable pour un flux synchrone hors Inngest si besoin.
- **Conventions de stockage** : les colonnes pointant vers le bucket privé
  `user-assets` stockent un chemin relatif (`{user_id}/...`), résolu à la demande
  via `resolveAssetUrl()` (URL signée, 1h). Les colonnes pointant vers un bucket
  public ou une image e-commerce externe stockent une URL `http(s)` complète.
- **RLS** : chaque table utilisateur (`users`, `wardrobe_items`, `try_on_sessions`)
  est filtrée par `auth.uid()`. Les écritures faites par le job Inngest utilisent
  la `service_role` key (`lib/supabase/service.ts`) qui bypass la RLS — c'est
  volontaire, le job tourne côté serveur sans session utilisateur.
