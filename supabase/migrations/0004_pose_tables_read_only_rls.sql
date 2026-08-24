-- Tables de référence "publiques en lecture" : RLS activée avec une policy
-- SELECT ouverte à tous, mais aucune policy INSERT/UPDATE/DELETE — seul le
-- service_role (qui bypass toujours la RLS) peut donc écrire, via
-- scripts/seed-poses.ts.
--
-- Sans ceci, RLS désactivée = lecture ET écriture ouvertes à quiconque a la
-- clé anon, pas seulement la lecture voulue.

alter table public.pose_categories enable row level security;
alter table public.pose_references enable row level security;
alter table public.pose_sub_references enable row level security;

drop policy if exists "public read pose_categories" on public.pose_categories;
create policy "public read pose_categories" on public.pose_categories
  for select using (true);

drop policy if exists "public read pose_references" on public.pose_references;
create policy "public read pose_references" on public.pose_references
  for select using (true);

drop policy if exists "public read pose_sub_references" on public.pose_sub_references;
create policy "public read pose_sub_references" on public.pose_sub_references
  for select using (true);
