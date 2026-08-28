# trust-hook

A developer trust measurement tool. It installs a git `post-commit` hook that asks a few quick questions about whether — and how — you used AI assistance for each commit, then sends the answers to Supabase for research analysis.

**There is exactly one command, for everyone.** Drop the `trust-hook/` folder into a project's repo, commit it, and from then on anyone on the team just runs:

```sh
npx ./trust-hook
```

- **First person to run it in a repo** (usually whoever owns the project): it notices there's no Supabase connection yet, offers to set one up right there in the same command (paste in a Project URL + anon key — see below for where to get them), saves it to `trust-hook.config.json`, and installs the hook.
- **Everyone after that**: the command notices the project is already connected and skips straight to installing the hook — the only thing it might ask is a participant alias, and only the very first time on your machine.

No `npm install`, no network fetch, no registry, no separate "configure" step to remember — it runs directly out of the `trust-hook/` folder already in your working copy, and Node.js built-ins only (`readline`, `fs`, `path`, `https`, `tty`, `child_process`) — zero dependencies.

## Getting a Supabase project ready

You need this once per project, before (or during) the first `npx ./trust-hook` run above.

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project** (the free tier is plenty for this). Pick an org, name, database password, and region, then wait ~2 minutes for it to provision. In the project dashboard, **Settings → API** gives you the two values you'll be asked for — the **Project URL** and the **anon / public key**. (Prefer local dev/testing? The [Supabase CLI](https://supabase.com/docs/guides/local-development) — `supabase init && supabase start` — runs the whole stack in Docker and prints the same two values for `http://localhost:...`, though that's only reachable from your own machine, not your teammates'.)
2. Open **SQL Editor** in the dashboard, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. It creates the `trust_events` table the hook writes to, plus a Row Level Security policy that lets the public anon key *insert* rows but never read/update/delete them — that's what makes it safe to commit the anon key.

Once you have those two values, run `npx ./trust-hook` (above) and paste them in when asked. It saves them to `trust-hook.config.json` at the repo root and runs a connectivity check — commit that file so every teammate picks it up automatically:

```sh
git add trust-hook.config.json && git commit -m "Configure trust-hook"
```

Nobody has the credentials yet and you just want the hook installed for now? Answer "n" when asked to connect — the hook installs anyway and runs in **dry-run mode** (prints the payload instead of sending it) until someone connects it later. Need to rotate the key or reconnect a project later without touching the hook install? `npx ./trust-hook configure` does just that step on its own.

## Uninstall

```sh
npx ./trust-hook uninstall
```

Removes the hook from the current repo's `.git/hooks/`. If a pre-existing `post-commit` hook was backed up during install, it's restored.

## What data is collected

After each commit, the hook auto-captures from git (no typing required):

- short commit hash
- commit message
- changed file extensions
- timestamp
- repo name

It then asks:

- Did you use AI assistance for this commit? (y/n)
- If yes: task type, AI tool used, a trust rating (1–5), and optional free-text feedback

If you say no to the first question, that's still recorded as a no-AI (control) data point — the rest of the questions are skipped.

Data is sent as JSON to the project's Supabase REST API. If the send fails (no internet, Supabase unreachable), the payload is queued locally in `~/.trust-hook/queue.json` and silently retried on your next commit — it never blocks or delays your git workflow. Credentials are re-read from `trust-hook.config.json` fresh on every commit, so if the project owner rotates the Supabase key later, a `git pull` is all developers need — no reinstalling the hook.

## Skipping the survey

Add `[no-survey]` anywhere in a commit message to skip the prompts entirely for that commit — a quick escape hatch for rapid-fire commits:

```sh
git commit -m "wip: quick fix [no-survey]"
```
