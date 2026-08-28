# data-collection-tool-for-research

**trust-hook** — a lightweight developer trust measurement tool. It installs a git `post-commit` hook that asks a short survey about whether, and how, AI assistance was used for each commit, then records the answers to a Supabase project for research analysis.

Zero dependencies, one command to install, credentials configured once per project — not once per developer.

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

- **Just told to install this on a project you're already working on?** Jump to [Using it as a developer](#using-it-as-a-developer), or read the standalone [Developer Guide](./trust-hook/DEVELOPER_GUIDE.md) — it's the same content, trimmed to only what a day-to-day user needs.
- **Adding trust-hook to a project for the first time, or own the Supabase project behind it?** Read [Setup — connecting a project](#setup--connecting-a-project) below; everything else on this page is useful background too.

## How it works

| Piece | Role |
|---|---|
| `trust-hook/bin/cli.js` | Installer CLI — connects a project to Supabase and copies the hook into `.git/hooks/post-commit`. |
| `trust-hook/src/hook-script.sh` | The hook itself. Fully self-contained (shell + inline Node.js), so copying this one file is all install needs to do. |
| `trust-hook.config.json` | **Project-level** config — Supabase URL and anon key. Committed to the repo, shared by the whole team. |
| `~/.trust-hook/config.json` | **Personal** config — just a participant alias, stored per developer, reused across every repo they instrument. |
| Supabase | Stores submitted survey rows in the `trust_events` table (see [Data collection](#data-collection)). |

On every `git commit`, the hook auto-captures commit metadata from git, asks two to five short questions in the terminal, and posts the result to Supabase. Credentials are re-read from `trust-hook.config.json` fresh on each commit — rotating a key only requires a `git pull`, never a hook reinstall.

## Requirements

- Git
- Node.js (any reasonably recent version — only built-in modules are used: `readline`, `fs`, `path`, `https`, `tty`, `child_process`)
- A Supabase project (free tier is sufficient)

## Setup — connecting a project

### 1. Get the tool

Already working in this repository? `trust-hook/` is already at the root — skip to step 2.

Bringing it into a *different* project — grab just the `trust-hook/` folder (no full repo, no `.git` history) using [degit](https://github.com/Rich-Harris/degit), run once via `npx`:

```sh
cd /path/to/your-project
npx degit shifat71/data-collection-tool-for-research/trust-hook trust-hook
git add trust-hook && git commit -m "Add trust-hook"
```

Would rather not run a third-party package to fetch it? A plain `git clone` works too — it pulls the whole repo locally, but there's nothing else in it to worry about:

```sh
git clone https://github.com/shifat71/data-collection-tool-for-research.git
cp -r data-collection-tool-for-research/trust-hook /path/to/your-project/
cd /path/to/your-project
git add trust-hook && git commit -m "Add trust-hook"
```

Either way, that's the only file-transfer step, ever — everything after this is a single command.

### 2. Create a Supabase project and table

1. At [supabase.com](https://supabase.com), create a new project. Once it's provisioned, open **Settings → API** and note the **Project URL** and **anon / public key**.
2. Open **SQL Editor** in the dashboard, paste in [`trust-hook/supabase/schema.sql`](./trust-hook/supabase/schema.sql), and run it. This creates the `trust_events` table with a Row Level Security policy that restricts the anon key to `INSERT` only — it can never read, update, or delete rows. That's what makes it safe to commit that key to the repo.

### 3. Install and connect

From the repo root:

```sh
npx ./trust-hook
```

The first person to run this in a repo is offered the chance to connect Supabase inline (paste in the URL and anon key from step 2). It saves them to `trust-hook.config.json` and installs the hook in the same step. Commit the file so the rest of the team picks it up automatically:

```sh
git add trust-hook.config.json && git commit -m "Configure trust-hook"
```

Everyone after that just runs `npx ./trust-hook` too — see below.

## Using it as a developer

Once a project is connected (or even before — it just runs in dry-run mode until then), every developer's install is the same single command, run once from the repo root:

```sh
npx ./trust-hook
```

The only thing it might ask is a participant alias, and only the first time on your machine — it defaults to your `git config user.name`, so pressing Enter is enough.

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

The full walkthrough of this section, without the setup material above, is in the standalone [Developer Guide](./trust-hook/DEVELOPER_GUIDE.md) — worth sharing directly with teammates who just need to install and go.

## Command reference

| Command | Effect |
|---|---|
| `npx ./trust-hook` | Install the hook. First run in a repo also offers to connect Supabase. |
| `npx ./trust-hook init` | Same as above (explicit form). |
| `npx ./trust-hook configure` | Set or rotate this project's Supabase credentials without touching the hook install. |
| `npx ./trust-hook uninstall` | Remove the hook from `.git/hooks/`. Restores any pre-existing `post-commit` hook that was backed up on install. |

## Data collection

Each survey response is sent as one JSON row to Supabase. Example payload:

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

If a send fails (offline, Supabase unreachable), the payload is queued locally in `~/.trust-hook/queue.json` and silently retried on the next commit. No submission is ever lost or blocks the developer's workflow. With no Supabase connection configured at all, the hook runs in **dry-run mode** and prints the payload to stdout instead.

## Privacy and security

- The Supabase **anon key** is designed to be public (the same key a client-side web app would ship) and is safe to commit — access is enforced entirely by the Row Level Security policy in `trust-hook/supabase/schema.sql`, which permits inserts only. Nothing submitted through the hook can be read, edited, or deleted using that key.
- `participant_alias` is self-chosen by each developer, not derived from any account or credential — it exists to distinguish participants in the dataset, not to identify them externally.
- The hook never transmits file contents, diffs, or anything beyond what's listed in [Data collection](#data-collection).

## Project structure

```
data-collection-tool-for-research/
├── README.md                          This file — the project's main documentation
└── trust-hook/
    ├── DEVELOPER_GUIDE.md             Standalone guide for developers using the tool
    ├── README.md                      Package-level readme (points back here)
    ├── package.json
    ├── bin/
    │   └── cli.js                     CLI entry point (init / configure / uninstall)
    ├── src/
    │   ├── hook-script.sh             The post-commit hook (self-contained shell + inline Node.js)
    │   ├── config.js                  Reads/writes personal and project config
    │   ├── prompt.js                  Terminal prompt helpers
    │   └── sender.js                  Posts survey payloads to Supabase
    ├── supabase/
    │   └── schema.sql                 Creates the trust_events table + RLS policy
    └── trust-hook.config.example.json Example project config shape
```

## Troubleshooting

- **Nothing happens after a commit.** Confirm the hook is installed (`.git/hooks/post-commit` should mention `trust-hook`) and that Node.js is on your `PATH`. If either is missing, the hook exits silently by design rather than breaking your commit.
- **Payload printed to the terminal instead of being sent.** That's dry-run mode — no `trust-hook.config.json` (or no Supabase URL in it) was found. Run `npx ./trust-hook configure` to connect it.
- **"Could not reach Supabase."** The payload was queued locally and will be retried automatically on your next commit — no action needed.
- **Want to stop being surveyed on a repo?** `npx ./trust-hook uninstall`.
