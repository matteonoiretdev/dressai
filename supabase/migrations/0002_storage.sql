-- Buckets Supabase Storage + policies RLS associées.

insert into storage.buckets (id, name, public)
values
  ('reference-library', 'reference-library', true),
  ('user-assets', 'user-assets', false),
  ('generated-images', 'generated-images', true)
on conflict (id) do nothing;

-- reference-library : lecture publique, écriture réservée au service_role (admin/seed script)
drop policy if exists "public read reference-library" on storage.objects;
create policy "public read reference-library" on storage.objects
  for select using (bucket_id = 'reference-library');

-- user-assets : chaque utilisateur accède uniquement à son propre dossier
-- {user_id}/... — le service_role (jobs serveur) bypass toujours la RLS.
drop policy if exists "users access their own assets" on storage.objects;
create policy "users access their own assets" on storage.objects
  for all using (
    bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- generated-images : lecture publique (les URLs sont non devinables — uuid),
-- écriture réservée au service_role (job Inngest).
drop policy if exists "public read generated-images" on storage.objects;
create policy "public read generated-images" on storage.objects
  for select using (bucket_id = 'generated-images');
