# trust-hook

A lightweight developer trust measurement tool. It installs a git `post-commit` hook that asks a short survey about whether, and how, AI assistance was used for each commit, then records the answers to a Supabase project for research analysis.

Zero dependencies, one command to install. Supabase credentials are never committed to the repo — they're shared with the team privately and entered locally by each developer (see [Privacy and security](#privacy-and-security) for why).

---

## Contents

- [Who this is for](#who-this-is-for)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Setup — connecting a project](#setup--connecting-a-project)
- [Using it as a developer](#using-it-as-a-developer)
- [Command reference](#command-reference)
- [Data collection](#data-collection)
- [Privacy and security](#privacy-and-security)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Who this is for

- **Just told to install this on a project you're already working on?** Jump to [Using it as a developer](#using-it-as-a-developer), or read the standalone [Developer Guide](./DEVELOPER_GUIDE.md) — it's the same content, trimmed to only what a day-to-day user needs.
- **Adding trust-hook to a project for the first time, or own the Supabase project behind it?** Read [Setup — connecting a project](#setup--connecting-a-project) below; everything else on this page is useful background too.

## How it works

| Piece | Role |
|---|---|
| `bin/cli.js` | Installer CLI — connects a project to Supabase and copies the hook into `.git/hooks/post-commit`. |
| `src/hook-script.sh` | The hook itself. Fully self-contained (shell + inline Node.js), so copying this one file is all install needs to do. |
| `trust-hook.config.json` | **Project-level** config — Supabase URL and anon key. **Git-ignored, never committed** — this repo is public, so credentials are shared with the team privately and each developer creates this file locally. |
| `~/.trust-hook/config.json` | **Personal** config — a participant profile (alias plus optional name/email/team/company) and registration status, stored per developer, reused across every repo they instrument. |
| Supabase | Stores registrations in `participants` and survey rows in `trust_events` (see [Data collection](#data-collection)). |

The first time a developer installs the hook, it registers them in the `participants` table — the project maintainer approves new registrations manually from the Supabase dashboard. From then on, on every `git commit`, the hook auto-captures commit metadata from git, asks two to five short questions in the terminal, and posts the result to Supabase, accepted only for approved participants (see [Privacy and security](#privacy-and-security)). Credentials are re-read from `trust-hook.config.json` fresh on each commit — rotating a key just needs each developer to re-run `npx ./trust-hook configure` with the new value, never a hook reinstall.

## Requirements

- Git
- Node.js (any reasonably recent version — only built-in modules are used: `readline`, `fs`, `path`, `https`, `tty`, `child_process`)
- A Supabase project (free tier is sufficient)

## Setup — connecting a project

### 1. Get the tool into your project

This repository *is* the tool — there's no separate package to install, just files to have present in a project.

**Working in this repository directly?** Everything's already at the root — skip to step 2.

**Bringing it into a *different* project:** copy this repo's contents into a subfolder there (`trust-hook/` is the recommended name — the rest of these docs assume it). Grab just the files, no `.git` history, using [degit](https://github.com/Rich-Harris/degit) via `npx`:

```sh
cd /path/to/your-project
npx degit shifat71/data-collection-tool-for-research trust-hook
git add trust-hook && git commit -m "Add trust-hook"
```

Would rather not run a third-party package to fetch it? A plain `git clone` works too:

```sh
git clone https://github.com/shifat71/data-collection-tool-for-research.git /tmp/trust-hook-src
cp -r /tmp/trust-hook-src /path/to/your-project/trust-hook
rm -rf /path/to/your-project/trust-hook/.git /tmp/trust-hook-src
cd /path/to/your-project
git add trust-hook && git commit -m "Add trust-hook"
```

Either way, that's the only file-transfer step, ever — everything after this is a single command.

Because everything lives nested inside `trust-hook/`, it can't collide with your project's own `bin/`, `src/`, `package.json`, etc. at the root — the two coexist fine. **This `trust-hook/` folder itself is meant to be committed** (unlike `trust-hook.config.json` inside it, which never is — see below); committing it is exactly how the rest of your team gets the tool with a single `git pull`, no separate distribution step. Just trying it out solo before deciding whether to adopt it for the team? Add `trust-hook/` to your project's `.gitignore` for now, and remove that line once you're ready to commit it for everyone.

### 2. Create a Supabase project and table

1. At [supabase.com](https://supabase.com), create a new project. Once it's provisioned, open **Settings → API** and note the **Project URL** and **anon / public key**.
2. Open **SQL Editor** in the dashboard, paste in [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the `participants` table (registrations, gated by your manual approval) and the `trust_events` table (survey rows, gated by an approved `participants` match) — both with a Row Level Security policy that restricts the anon key to `INSERT` only.
3. **Keep the URL and key private — do not commit them anywhere in this public repo.** Insert-only still means *anyone holding the key* can submit rows; RLS stops them from reading, editing, or deleting data, but not from spamming fake entries into your dataset — the approval gate on `trust_events` is what actually stops that. Share the two values with your team through a private channel instead (Slack DM, password manager, etc.) — see [Privacy and security](#privacy-and-security).

### 3. Install, connect, and approve your team

From wherever the tool's files live — the repo root if you're here directly, or the `trust-hook/` subfolder if you copied it into another project:

```sh
npx .          # from inside the tool's own folder
npx ./trust-hook   # equivalently, from one level up (e.g. your project root)
```

The first person to run this in a repo is offered the chance to enter the Supabase URL and anon key from step 2 inline. It saves them to `trust-hook.config.json` and installs the hook in the same step. This file is **git-ignored** — it stays on your machine only. Every other developer runs the exact same command and, when asked, pastes in the same URL/key you shared with them privately.

Every developer's install also registers them in `participants` (see [Setup, step 2](#setup--connecting-a-project)). As the maintainer, open the **Table Editor → participants** in Supabase, find each teammate's row by username, and flip `approved` to `true` once you recognize them. Until then, their commits still trigger the survey locally and queue the results — nothing is lost, it just doesn't reach `trust_events` until you approve them.

## Using it as a developer

Don't have the `trust-hook/` folder in your project yet? Grab it into your project root:

```sh
cd /path/to/your-project
npx degit shifat71/data-collection-tool-for-research trust-hook
```

(See [Setup, step 1](#setup--connecting-a-project) for a `git clone`-based alternative if you'd rather not run a third-party package.)

Already there (most common — someone on your team added it)? Every developer's install is the same single command, run once from wherever the tool's files live in their clone:

```sh
npx ./trust-hook
```

(If the tool sits at the root of the repo you're in — as it does in this repository itself — that's `npx .` instead.)

It'll ask for a participant alias the first time only — it defaults to your `git config user.name`, so pressing Enter is enough — plus a few optional details (full name, email, team/role, company) that just help your maintainer recognize you; press Enter to skip any of them. If nobody on your machine has set up Supabase for this repo yet, it'll also ask for the Project URL and anon key; **ask your project maintainer for these two values privately** (Slack, email, etc.) — they're never committed to the repo, so `git pull` alone won't get them to you. Once entered, that's a one-time step per machine.

This also registers you with the project. Your maintainer approves new registrations manually in Supabase — until they do, your survey answers still get asked and saved locally exactly like an offline commit, and start counting automatically the moment you're approved. No message, no blocking, nothing to redo.

From then on, every `git commit` triggers a short survey:

```
Did you use AI assistance for this commit? (y/n)
  → n: recorded as a control data point, nothing further asked
  → y: Task type → AI tool → Trust rating (1–5) → Feedback (optional)
```

**Escape hatch:** add `[no-survey]` anywhere in a commit message to skip the prompts entirely — useful for rapid or automated commits:

```sh
git commit -m "wip: quick fix [no-survey]"
```

The hook never blocks a commit: if there's no terminal to prompt on (CI, a GUI git client, an automated commit), or if you hit Ctrl+C mid-survey, it exits silently and the commit stands as-is.

The full walkthrough of this section, without the setup material above, is in the standalone [Developer Guide](./DEVELOPER_GUIDE.md) — worth sharing directly with teammates who just need to install and go.

## Command reference

| Command | Effect |
|---|---|
| `npx ./trust-hook` (or `npx .` from inside the tool's own folder) | Install the hook. First run in a repo also offers to connect Supabase. |
| `npx ./trust-hook init` | Same as above (explicit form). |
| `npx ./trust-hook configure` | Set or rotate this project's Supabase credentials without touching the hook install. |
| `npx ./trust-hook uninstall` | Remove the hook from `.git/hooks/`. Restores any pre-existing `post-commit` hook that was backed up on install. |

## Data collection

### Registration (once per developer, per machine)

On first install, the CLI sends one row to the `participants` table:

```json
{
  "username": "carol",
  "full_name": "Carol Danvers",
  "email": "carol@example.com",
  "team": "backend",
  "company": "Acme Corp"
}
```

`username` is always present (it's the same alias used as `participant_alias` below); `full_name`, `email`, `team`, and `company` are each optional and `null` if skipped. This row exists purely so the project maintainer can recognize and approve the developer — see [Setup, step 3](#setup--connecting-a-project) and [Privacy and security](#privacy-and-security).

### Survey submissions (every commit)

Each survey response is sent as one JSON row to the `trust_events` table. Example payload:

```json
{
  "participant_alias": "carol",
  "commit_hash": "9afda5b",
  "commit_message": "fix auth token refresh",
  "repo_name": "my-project",
  "file_types": [".ts", ".tsx"],
  "used_ai": true,
  "task_type": "bug_fixing",
  "ai_tool": "claude_code",
  "trust_rating": 4,
  "feedback_text": "correct fix but verbose",
  "committed_at": "2026-08-28T14:30:00.000Z"
}
```

| Field | Source | Notes |
|---|---|---|
| `participant_alias` | Local config | Any string a developer picks to identify their own commits anonymously. |
| `commit_hash` | Auto (git) | Short hash of the commit. |
| `commit_message` | Auto (git) | Full commit message. |
| `repo_name` | Auto (git) | Basename of the repository. |
| `file_types` | Auto (git) | Unique file extensions changed in the commit. |
| `committed_at` | Auto | ISO 8601 timestamp. |
| `used_ai` | Survey | `true`/`false`. |
| `task_type` | Survey | One of the values below, `null` if `used_ai` is `false`. |
| `ai_tool` | Survey | One of the values below, `null` if `used_ai` is `false`. |
| `trust_rating` | Survey | Integer 1–5 (1 = no trust, 5 = full trust), `null` if `used_ai` is `false`. |
| `feedback_text` | Survey | Free text, optional — `null` if skipped or `used_ai` is `false`. |

**`task_type` values:** `code_generation`, `bug_fixing`, `refactoring`, `code_review`, `test_writing`, `documentation`, `architecture_design`, `devops_config`, `dependency_api_lookup`

**`ai_tool` values:** `github_copilot`, `claude_code`, `cursor`, `chatgpt_claude_web`, `other`

A "no" answer to the first question is still recorded — as a no-AI control data point, with the survey fields set to `null` — so the dataset captures both AI-assisted and non-AI-assisted commits.

If a send fails — offline, Supabase unreachable, or the participant isn't approved yet — the payload is queued locally in `~/.trust-hook/queue.json` and silently retried on the next commit. No submission is ever lost or blocks the developer's workflow. With no Supabase connection configured at all, the hook runs in **dry-run mode** and prints the payload to stdout instead. A failed registration retries the same way, silently, on the next commit.

## Privacy and security

- **`trust-hook.config.json` (the Supabase URL and anon key) is never committed — it's `.gitignore`'d.** The Row Level Security policies in `supabase/schema.sql` restrict the anon key to `INSERT` only, so it can't read, edit, or delete existing data on either table — but insert-only alone would still let anyone holding the key submit fabricated rows. That's a real risk for a public repo specifically, since research data integrity depends on only trusted contributors being able to write to it. Treat the anon key as a team secret: share it privately (Slack DM, password manager, etc.), never in a commit, issue, PR, or anywhere else visible on GitHub.
- **The approval gate closes that gap for actual survey data.** `trust_events` only accepts a row when its `participant_alias` matches a `participants` row the maintainer has manually set `approved = true` on — enforced by Postgres itself, not by the hook. Anyone with the key can still *register* (harmless — it's just a name in a list awaiting review) but can't get real submissions into the dataset without a human approving them first. `participants` itself has no read/update/delete policy for the anon key either, so registrants can't see or approve each other.
- If the key is ever exposed anyway, rotate it from the Supabase dashboard (**Settings → API**) and re-share the new one the same way — each developer then re-runs `npx ./trust-hook configure` with the new value.
- `participant_alias` (== `username` at registration) is self-chosen by each developer, not derived from any account or credential — the optional full name/email/team/company collected at registration exist solely to help the maintainer identify who to approve, live only in `participants` (never in `trust_events`), and are never readable through the anon key — only the project owner, via the Supabase dashboard or a service-role key, can see them.
- The hook never transmits file contents, diffs, or anything beyond what's listed in [Data collection](#data-collection).

## Project structure

```
trust-hook/
├── .gitignore                        Ignores trust-hook.config.json (see Privacy and security)
├── README.md                        This file — main documentation
├── DEVELOPER_GUIDE.md                Standalone guide for developers using the tool
├── package.json
├── bin/
│   └── cli.js                       CLI entry point (init / configure / uninstall)
├── src/
│   ├── hook-script.sh                The post-commit hook (self-contained shell + inline Node.js)
│   ├── config.js                     Reads/writes personal and project config
│   ├── prompt.js                     Terminal prompt helpers
│   └── sender.js                     Posts payloads to any Supabase table
├── supabase/
│   └── schema.sql                    Creates participants + trust_events and their RLS policies
└── trust-hook.config.example.json    Example project config shape — not the real one
```

`trust-hook.config.json` itself — the real one, holding actual credentials — is created locally by each developer and is not part of this tree; it's git-ignored.

When copied into another project, this whole tree typically lives inside a `trust-hook/` subfolder of that project (see [Setup](#setup--connecting-a-project)) — the layout above is identical either way, just nested one level deeper.

## Troubleshooting

- **Nothing happens after a commit.** Confirm the hook is installed (`.git/hooks/post-commit` should mention `trust-hook`) and that Node.js is on your `PATH`. If either is missing, the hook exits silently by design rather than breaking your commit.
- **Payload printed to the terminal instead of being sent.** That's dry-run mode — no local `trust-hook.config.json` (or no Supabase URL in it) was found on your machine. Run `npx ./trust-hook configure` with the URL/key your project maintainer shared with you.
- **"Could not reach Supabase" / submissions never seem to land.** Two possibilities, both self-healing: a real connectivity issue (queued and retried automatically), or the developer just hasn't been approved in `participants` yet — the maintainer needs to flip `approved` to `true` for that username in the Supabase Table Editor. Either way, nothing is lost; it starts flowing the moment the cause is fixed.
- **Want to stop being surveyed on a repo?** `npx ./trust-hook uninstall`.
