-- Virtual Try-On App — schéma initial
-- À exécuter dans l'éditeur SQL Supabase, ou via `supabase db push`.

create extension if not exists pgcrypto;

-- =========================================================================
-- users
-- =========================================================================
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  neutral_ref_url text,
  height_cm       int,
  body_type       text check (body_type in ('slim', 'regular', 'athletic', 'curvy')),
  created_at      timestamptz default now()
);

alter table public.users enable row level security;

drop policy if exists "users manage their own profile" on public.users;
create policy "users manage their own profile" on public.users
  for all using (auth.uid() = id);

-- Trigger : crée automatiquement une ligne dans public.users à l'inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- wardrobe_items
-- =========================================================================
create table if not exists public.wardrobe_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade not null,
  image_url       text not null,
  clean_image_url text,
  category        text not null check (category in ('tops','bottoms','dresses','shoes','jackets','accessories')),
  color_primary   text,
  is_neutral      boolean default false,
  name            text,
  style_tags      text[],
  created_at      timestamptz default now()
);

alter table public.wardrobe_items enable row level security;

drop policy if exists "users manage their own wardrobe" on public.wardrobe_items;
create policy "users manage their own wardrobe" on public.wardrobe_items
  for all using (auth.uid() = user_id);

create index if not exists wardrobe_items_user_id_idx on public.wardrobe_items(user_id);
create index if not exists wardrobe_items_category_idx on public.wardrobe_items(category);

-- =========================================================================
-- pose_categories (lecture publique, pas de RLS)
-- =========================================================================
create table if not exists public.pose_categories (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text unique not null,
  name                   text not null,
  complementary_category text
);

-- =========================================================================
-- pose_references
-- =========================================================================
create table if not exists public.pose_references (
  id                     uuid primary key default gen_random_uuid(),
  category_id            uuid references public.pose_categories(id) on delete cascade,
  environment            text not null check (environment in ('urban','studio','outdoor','cafe')),
  environment_label      text not null,
  is_default             boolean default false,
  order_index            int default 0
);

create index if not exists pose_references_category_id_idx on public.pose_references(category_id);

-- =========================================================================
-- pose_sub_references
-- =========================================================================
create table if not exists public.pose_sub_references (
  id           uuid primary key default gen_random_uuid(),
  reference_id uuid references public.pose_references(id) on delete cascade,
  angle        text not null check (angle in ('full_body','mid_shot','close_up')),
  angle_label  text not null,
  image_url    text not null,
  order_index  int default 0
);

create index if not exists pose_sub_references_reference_id_idx on public.pose_sub_references(reference_id);

-- =========================================================================
-- try_on_sessions
-- =========================================================================
create table if not exists public.try_on_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete cascade not null,
  product_name      text,
  product_url       text,
  product_image_url text not null,
  product_category  text not null check (product_category in ('tops','bottoms','dresses','shoes','jackets','accessories')),
  product_color     text,
  wardrobe_item_id  uuid references public.wardrobe_items(id) on delete set null,
  pose_reference_id uuid references public.pose_references(id) on delete set null,
  status            text default 'pending' check (status in ('pending','processing','completed','failed')),
  error_message     text,
  created_at        timestamptz default now()
);

alter table public.try_on_sessions enable row level security;

drop policy if exists "users manage their own sessions" on public.try_on_sessions;
create policy "users manage their own sessions" on public.try_on_sessions
  for all using (auth.uid() = user_id);

create index if not exists try_on_sessions_user_id_idx on public.try_on_sessions(user_id);
create index if not exists try_on_sessions_status_idx on public.try_on_sessions(status);

-- =========================================================================
-- generated_images
-- =========================================================================
create table if not exists public.generated_images (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.try_on_sessions(id) on delete cascade,
  image_url   text not null,
  angle       text not null check (angle in ('full_body','mid_shot','close_up')),
  order_index int default 0,
  created_at  timestamptz default now()
);

alter table public.generated_images enable row level security;

drop policy if exists "users read their own generated images" on public.generated_images;
create policy "users read their own generated images" on public.generated_images
  for select using (
    exists (
      select 1 from public.try_on_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create index if not exists generated_images_session_id_idx on public.generated_images(session_id);
