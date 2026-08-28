-- trust-hook: run this once in your Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Creates the table the hook writes to, and a Row Level Security policy
-- that lets the public "anon" key insert rows but never read, update, or
-- delete them - safe to commit the anon key in trust-hook.config.json.

create table if not exists trust_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),

  participant_alias text not null,
  commit_hash text not null,
  commit_message text not null,
  repo_name text not null,
  file_types text[] not null default '{}',
  committed_at timestamptz not null,

  used_ai boolean not null,
  task_type text,
  ai_tool text,
  trust_rating smallint,
  feedback_text text,

  constraint trust_rating_range check (trust_rating is null or trust_rating between 1 and 5)
);

alter table trust_events enable row level security;

-- The anon key (used by every developer's hook) may only insert.
create policy "trust-hook: anon can insert" on trust_events
  for insert
  to anon
  with check (true);

-- Nobody using the anon key can read, update, or delete survey rows.
-- Query the data from the Supabase dashboard (as the table owner) or via
-- the service_role key from a trusted analysis script instead.
