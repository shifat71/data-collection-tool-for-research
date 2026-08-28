-- trust-hook: run this once in your Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Creates two tables:
--   - participants: one row per developer who has ever run `npx ./trust-hook`,
--     used to gate access (see below) and let you recognize who's who.
--   - trust_events: the actual survey submissions.
--
-- Both use Row Level Security so the public "anon" key (shared with every
-- developer, and never committed to the repo - see the README) can only
-- INSERT - never read, update, or delete. That alone still lets anyone
-- holding the key submit fabricated data, so trust_events additionally
-- requires the submitting participant_alias to match an *approved* row in
-- participants. Nothing is accepted until you manually flip that flag.

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  registered_at timestamptz not null default now(),

  username text not null,
  full_name text,
  email text,
  team text,
  company text,

  approved boolean not null default false,
  approved_at timestamptz
);

alter table participants enable row level security;

-- Anyone with the anon key can register themselves...
create policy "trust-hook: anon can register" on participants
  for insert
  to anon
  with check (true);

-- ...but nobody using the anon key can read, update, or delete
-- registrations, including their own. Review and approve new
-- registrations from the Supabase dashboard's Table Editor (as the table
-- owner, which bypasses RLS) - open the participants table, find the row
-- by username, and set approved to true.

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

-- The anon key may only insert, and only for a participant_alias that
-- matches an approved participant. An unapproved (or unregistered)
-- developer's submissions are rejected by Postgres itself - the hook
-- queues them locally and retries automatically, so nothing is lost once
-- you approve them (see README: Privacy and security).
create policy "trust-hook: anon can insert for approved participants" on trust_events
  for insert
  to anon
  with check (
    exists (
      select 1 from participants p
      where p.username = trust_events.participant_alias
        and p.approved = true
    )
  );

-- Nobody using the anon key can read, update, or delete survey rows.
-- Query the data from the Supabase dashboard (as the table owner) or via
-- the service_role key from a trusted analysis script instead.
