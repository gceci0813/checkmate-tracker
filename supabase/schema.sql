-- ============================================================
-- Checkmate Project Tracker — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- PROJECTS
create table if not exists projects (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  client      text default '',
  region      text not null default 'romania',
  status      text not null default 'pipeline',
  owner       text default '',
  value       text default '',
  deadline    date,
  progress    integer default 0 check (progress >= 0 and progress <= 100),
  description text default '',
  next_steps  text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- COMMENTS
create table if not exists comments (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid references projects(id) on delete cascade not null,
  user_name   text not null,
  text        text not null,
  created_at  timestamptz default now()
);

-- SETTINGS (single row, id = 1)
create table if not exists settings (
  id            integer default 1 primary key check (id = 1),
  dash_title    text default 'All Regions',
  dash_subtitle text default 'Checkmate Government Relations — Project Dashboard',
  brand_name    text default 'CHECKMATE',
  users         jsonb default '[
    {"name":"GC",    "color":"#C12033","role":"Chief of Staff"},
    {"name":"Yoshi", "color":"#3D4F5F","role":"Japan Practice Lead"},
    {"name":"Nico",  "color":"#3a7fe0","role":"Senior Advisor"},
    {"name":"Ches",  "color":"#2a9d5c","role":"Managing Partner"}
  ]'::jsonb
);

-- Insert default settings row
insert into settings (id) values (1) on conflict (id) do nothing;

-- ENABLE ROW LEVEL SECURITY
alter table projects  enable row level security;
alter table comments  enable row level security;
alter table settings  enable row level security;

-- POLICIES: authenticated users only
create policy "Auth users full access on projects"
  on projects for all to authenticated using (true) with check (true);

create policy "Auth users full access on comments"
  on comments for all to authenticated using (true) with check (true);

create policy "Auth users read settings"
  on settings for select to authenticated using (true);

create policy "Auth users update settings"
  on settings for update to authenticated using (true) with check (true);

create policy "Auth users insert settings"
  on settings for insert to authenticated with check (true);

-- ENABLE REALTIME on all tables
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table settings;
