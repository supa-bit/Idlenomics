-- Run this in your Supabase SQL Editor to enable the 10-Snapshot Time Machine Vault
create table if not exists public.civilization_saves (
  id uuid primary key default gen_random_uuid(),
  sync_key text not null,
  era_name text not null default 'Stone Age',
  playtime_seconds integer not null default 0,
  game_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_civilization_saves_sync_key
  on public.civilization_saves (sync_key, created_at desc);

alter table public.civilization_saves enable row level security;

create policy "Allow passphrase snapshot access"
  on public.civilization_saves
  for all
  to anon
  using (true)
  with check (true);
