-- Run this once in your Supabase project's SQL Editor (Database -> SQL Editor -> New query).
-- This sets up everything the app needs: a profiles table (for username + password
-- recovery), a playlists table, and a theme_settings table — each protected by Row
-- Level Security so a signed-in user can only ever read or write their own rows.

-- ---------------------------------------------------------------- profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  recovery_question text not null,
  recovery_answer_hash text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------- playlists
create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tracks jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table playlists enable row level security;

create policy "Users can manage their own playlists"
  on playlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- theme_settings
create table if not exists theme_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'solid',
  solid text not null default '#f5f5f2',
  cycle_a text not null default '#f5f5f2',
  cycle_b text not null default '#7dd3fc',
  speed int not null default 6,
  updated_at timestamptz default now()
);

alter table theme_settings enable row level security;

create policy "Users can manage their own theme"
  on theme_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
