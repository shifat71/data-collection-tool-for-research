# trust-hook — Developer Guide

This is the guide for **using** trust-hook on a project that already has it. If you need to set the tool up for a project for the first time (connect a Supabase project, create the database table), see the [main README](./README.md) instead — this page assumes that's already done, or that someone else will do it.

## What it is

A git `post-commit` hook. After every commit, it asks two quick questions about whether you used AI assistance, then gets out of your way. Nothing to remember day to day beyond the one install command below.

## Install

Don't have the `trust-hook/` folder in your project yet? Grab it into your project root:

```sh
cd /path/to/your-project
npx degit shifat71/data-collection-tool-for-research trust-hook
```

Already there (most common — someone on your team added it)? Skip straight to installing the hook, from your project root:

```sh
npx ./trust-hook
```

That's the whole install. No `npm install`, nothing else downloaded — it runs directly out of the folder already in your clone.

The only thing it may ask is a **participant alias** — any string you choose to identify your own commits anonymously in the dataset. It's asked once, ever, on your machine: saved to `~/.trust-hook/config.json` and reused automatically the next time you install the hook in a different project.

If the project isn't connected to Supabase yet, the install still finishes and installs the hook — it just runs in **dry-run mode** (prints what it would send instead of sending it) until someone connects it. That's not something you need to fix yourself; ping your project maintainer.

## What happens after a commit

Right after `git commit` completes, you'll see:

```
Did you use AI assistance for this commit? (y/n)
```

- **n** — recorded as-is, nothing further asked. This is useful control data, not a "wrong" answer.
- **y** — three quick follow-ups, then you're done:
  1. **Task type** — pick a number from a short list (code generation, bug fixing, refactoring, etc.)
  2. **AI tool used** — pick a number (Copilot, Claude Code, Cursor, ChatGPT/Claude.ai, other)
  3. **Trust rating (1–5)** — how much you trusted the AI's output, 1 = not at all, 5 = fully
  4. **Feedback** — free text, entirely optional, press Enter to skip

Takes a few seconds. It only ever asks about the commit you just made — nothing retroactive, nothing about code it hasn't seen.

## Skipping it

Add `[no-survey]` anywhere in the commit message and the hook skips the prompts entirely for that commit:

```sh
git commit -m "wip: quick fix [no-survey]"
```

Handy for rapid-fire WIP commits you don't want to interrupt.

## It will never block your commit

- No terminal available (a GUI git client, a CI job, an automated commit)? The hook exits silently — your commit is unaffected either way, since it already happened by the time the hook runs.
- Hit Ctrl+C mid-survey? Same — it aborts immediately, no partial data is sent, and the commit stands as-is.
- Offline, or Supabase is down? Your answers are saved locally and sent automatically on your next commit — you never lose a response and never get blocked waiting on a network call.

## What data leaves your machine

Only what you see in the prompts, plus a few things pulled automatically from git for that one commit: the short commit hash, commit message, changed file extensions, a timestamp, and the repo name. No file contents, no diffs, nothing beyond that. See [Data collection](./README.md#data-collection) in the main README for the exact schema if you want the full picture.

## Uninstall

```sh
npx ./trust-hook uninstall
```

Removes the hook from this repo. If it replaced a pre-existing `post-commit` hook on install, that original hook is restored.

## Troubleshooting

| Symptom | What's happening |
|---|---|
| Nothing happens after a commit | Check `.git/hooks/post-commit` exists and mentions `trust-hook`, and that `node` is on your `PATH`. Both are required for the hook to run at all. |
| The JSON payload gets printed to your terminal instead of sent | Dry-run mode — the project isn't connected to Supabase yet. Nothing wrong on your end. |
| "Could not reach Supabase" message | Queued locally, retried automatically on your next commit. No action needed. |
| Want out entirely | `npx ./trust-hook uninstall` |
