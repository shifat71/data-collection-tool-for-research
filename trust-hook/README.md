# trust-hook

A developer trust measurement tool. It installs a git `post-commit` hook that asks a few quick questions about whether — and how — you used AI assistance for each commit, then sends the answers to Supabase for research analysis.

Credentials are configured once at the **project level** and committed to the repo, so individual developers never touch Supabase URLs or keys — installing the hook is a single command with nothing to type beyond an optional alias.

## Project owner: one-time setup

Run this once, from the repo root, after the `trust-hook/` folder has been added to the project:

```sh
npx ./trust-hook configure
```

This asks for the Supabase project URL and anon key and saves them to `trust-hook.config.json` at the repo root. Commit that file so every developer gets it for free:

```sh
git add trust-hook.config.json && git commit -m "Configure trust-hook"
```

Supabase anon keys are meant to be public (protected by your Row Level Security policies), so this is safe to commit — same as it's safe to ship in a client app. Make sure your `trust_events` table has an RLS policy that allows inserts from the anon role and nothing else.

## Developers: one-step install

From the repo root (after cloning/pulling, so `trust-hook.config.json` is already there):

```sh
npx ./trust-hook
```

That's it — single command, no flags, no prompts for credentials. It will:

1. Ask for a participant alias the first time only (any string, used to identify your commits anonymously) — press Enter to accept the suggested default (your `git config user.name`). It's saved to `~/.trust-hook/config.json` and reused automatically for every repo you instrument, so on every repo after the first, this step is skipped entirely.
2. Pick up the project's Supabase credentials automatically from `trust-hook.config.json` (no project config yet? the hook just runs in **dry-run mode** — prints the payload to stdout instead of sending it — until the project owner runs `configure`).
3. Copy the post-commit hook into `.git/hooks/post-commit` and make it executable.

No `npm install`, no network fetch, no registry — it runs directly out of the `trust-hook/` folder already in your working copy. Only Node.js built-ins are used (`readline`, `fs`, `path`, `https`, `tty`, `child_process`) — zero dependencies.

After that, every `git commit` in that repo prompts you with a couple of quick questions once the commit completes.

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
