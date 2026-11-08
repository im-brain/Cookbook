-- Cookbook cloud tables (Phase 4). No secrets in this file.
-- Run it once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it only creates what is missing).

create table if not exists public.recipes (
  owner       uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id          text        not null,                 -- the recipe's own id from the phone
  kind        text        not null default 'mine',  -- 'mine' or 'elsewhere'
  source      text        not null default '',
  notes       text        not null default '',
  current     jsonb       not null,                 -- title, ingredients, steps, servings, timeMinutes, tags
  original    jsonb,                                -- untouched first copy (recipes from somewhere else)
  photo       jsonb,                                -- for a later phase
  created_at  date,
  updated_at  date,
  version     integer     not null default 1,       -- counts saved changes; used to spot conflicts
  deleted_at  timestamptz,                          -- set = in "Recently deleted"
  modified_at timestamptz not null default now(),   -- set by the server on every change
  primary key (owner, id),
  constraint recipes_kind_ok check (kind in ('mine', 'elsewhere')),
  constraint recipes_size_ok check (pg_column_size(current) < 200000 and coalesce(pg_column_size(original), 0) < 200000)
);

create index if not exists recipes_owner_modified on public.recipes (owner, modified_at);

-- The server stamps the time of every change itself, so phones with a wrong clock can't confuse syncing.
create or replace function public.recipes_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.modified_at = now();
  return new;
end $$;

drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before insert or update on public.recipes
  for each row execute function public.recipes_touch();

-- Privacy: a row can only be seen or changed by the signed-in person it belongs to.
alter table public.recipes enable row level security;

drop policy if exists recipes_select on public.recipes;
drop policy if exists recipes_insert on public.recipes;
drop policy if exists recipes_update on public.recipes;
drop policy if exists recipes_delete on public.recipes;

create policy recipes_select on public.recipes for select to authenticated
  using (owner = (select auth.uid()));
create policy recipes_insert on public.recipes for insert to authenticated
  with check (owner = (select auth.uid()));
create policy recipes_update on public.recipes for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
-- Only "Recently deleted" recipes may be removed for good.
create policy recipes_delete on public.recipes for delete to authenticated
  using (owner = (select auth.uid()) and deleted_at is not null);

-- Nobody who isn't signed in gets anything.
revoke all on public.recipes from anon;
grant select, insert, update, delete on public.recipes to authenticated;

-- ======================================================================
-- Photos (Phase 6, Version 30): a private storage bucket for recipe pictures.
-- Run this part once in Supabase too (SQL Editor -> New query -> paste -> Run). Safe to run again.
-- Pictures live at  <your user id>/<photo id>.jpg  and only you can see, add, change or remove yours.
-- ======================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists recipe_photos_select on storage.objects;
drop policy if exists recipe_photos_insert on storage.objects;
drop policy if exists recipe_photos_update on storage.objects;
drop policy if exists recipe_photos_delete on storage.objects;

create policy recipe_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy recipe_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy recipe_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy recipe_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
