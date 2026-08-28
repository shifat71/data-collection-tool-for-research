# trust-hook

A developer trust measurement tool. It installs a git `post-commit` hook that asks a few quick questions about whether — and how — you used AI assistance for each commit, then sends the answers to Supabase for research analysis.

## Install and setup

From inside the git repository you want to instrument:

```sh
npx trust-hook init
```

This will:

1. Ask for a participant alias (any string — used to identify your commits anonymously).
2. Ask for your Supabase project URL and anon key. These are stored in `~/.trust-hook/config.json` so they're shared across every repo you instrument (leave the URL blank to run in **dry-run mode**, which just prints the payload to stdout instead of sending it — handy for testing without a Supabase backend).
3. Copy the post-commit hook into the current repo's `.git/hooks/post-commit` and make it executable.

Only node built-ins are used (`readline`, `fs`, `path`, `https`, `child_process`) — no dependencies to install.

After that, every `git commit` in that repo will prompt you with a couple of quick questions once the commit completes.

## Uninstall

```sh
npx trust-hook uninstall
```

Removes the hook from the current repo's `.git/hooks/`. If a pre-existing `post-commit` hook was backed up during `init`, it's restored.

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

Data is sent as JSON to your Supabase project's REST API. If the send fails (no internet, Supabase unreachable), the payload is queued locally in `~/.trust-hook/queue.json` and silently retried on your next commit — it never blocks or delays your git workflow.

## Skipping the survey

Add `[no-survey]` anywhere in a commit message to skip the prompts entirely for that commit — a quick escape hatch for rapid-fire commits:

```sh
git commit -m "wip: quick fix [no-survey]"
```
