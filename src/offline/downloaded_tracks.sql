-- Run this in the Supabase SQL editor so downloads sync across devices.
-- Metadata only (title, artist, thumbnail) — audio is re-cached per device.

create table if not exists public.downloaded_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id text not null,
  title text,
  artist text,
  thumbnail text,
  album text,
  downloaded_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists downloaded_tracks_user_id_idx
  on public.downloaded_tracks (user_id);

alter table public.downloaded_tracks enable row level security;

create policy "Users can read own downloads"
  on public.downloaded_tracks for select
  using (auth.uid() = user_id);

create policy "Users can insert own downloads"
  on public.downloaded_tracks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own downloads"
  on public.downloaded_tracks for update
  using (auth.uid() = user_id);

create policy "Users can delete own downloads"
  on public.downloaded_tracks for delete
  using (auth.uid() = user_id);
