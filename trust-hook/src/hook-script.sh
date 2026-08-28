#!/bin/sh
# trust-hook post-commit hook
# Installed by `npx trust-hook init` — safe to delete, or run `npx trust-hook uninstall`.
# This file is self-contained: the node code below is embedded inline so that
# copying this single file into .git/hooks/post-commit is all that's needed.

trap 'exit 0' INT

# Don't break the developer's workflow if node isn't available.
if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

# Escape hatch: "[no-survey]" in the commit message skips the prompts entirely.
COMMIT_MSG_CHECK=$(git log -1 --pretty=%B 2>/dev/null)
case "$COMMIT_MSG_CHECK" in
  *"[no-survey]"*) exit 0 ;;
esac

TMP_SCRIPT=$(mktemp "${TMPDIR:-/tmp}/trust-hook.XXXXXX.js") || exit 0
trap 'rm -f "$TMP_SCRIPT"; exit 0' INT

cat > "$TMP_SCRIPT" <<'NODE_EOF'
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const tty = require('tty');
const { execSync } = require('child_process');
const { URL } = require('url');

const CONFIG_DIR = '__TRUST_HOOK_CONFIG_DIR__';
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const QUEUE_PATH = path.join(CONFIG_DIR, 'queue.json');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const TASK_TYPES = [
  ['Code Generation', 'code_generation'],
  ['Bug Fixing / Debugging', 'bug_fixing'],
  ['Refactoring', 'refactoring'],
  ['Code Review / Explanation', 'code_review'],
  ['Test Writing', 'test_writing'],
  ['Documentation', 'documentation'],
  ['Architecture / Design', 'architecture_design'],
  ['DevOps / Config', 'devops_config'],
  ['Dependency / API Lookup', 'dependency_api_lookup'],
];

const AI_TOOLS = [
  ['GitHub Copilot', 'github_copilot'],
  ['Claude Code', 'claude_code'],
  ['Cursor', 'cursor'],
  ['ChatGPT / Claude.ai (web)', 'chatgpt_claude_web'],
  ['Other', 'other'],
];

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function git(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return '';
  }
}

function collectAutoData() {
  const commitHash = git('git rev-parse --short HEAD');
  const commitMessage = git('git log -1 --pretty=%B');
  const repoRoot = git('git rev-parse --show-toplevel');
  const repoName = repoRoot ? path.basename(repoRoot) : '';

  let changedFiles = git('git diff --name-only HEAD~1 HEAD');
  if (!changedFiles) {
    // First commit in the repo has no parent - fall back to the commit's own file list.
    changedFiles = git('git show --name-only --pretty=format: HEAD');
  }

  const extSet = new Set();
  changedFiles.split('\n').forEach((f) => {
    f = f.trim();
    if (!f) return;
    const ext = path.extname(f);
    if (ext) extSet.add(ext);
  });

  return {
    commit_hash: commitHash,
    commit_message: commitMessage,
    repo_name: repoName,
    file_types: Array.from(extSet),
    committed_at: new Date().toISOString(),
  };
}

function sendToSupabase(config, payload) {
  return new Promise((resolve) => {
    if (!config || !config.supabaseUrl) {
      resolve({ ok: false, dryRun: true });
      return;
    }
    let url;
    try {
      url = new URL(config.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/trust_events');
    } catch (e) {
      resolve({ ok: false, error: 'invalid_supabase_url' });
      return;
    }
    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        apikey: config.supabaseAnonKey || '',
        Authorization: `Bearer ${config.supabaseAnonKey || ''}`,
        Prefer: 'return=minimal',
      },
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

function readQueue() {
  try {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    return Array.isArray(queue) ? queue : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(queue) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (queue.length === 0) {
      fs.rmSync(QUEUE_PATH, { force: true });
    } else {
      fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    }
  } catch (e) {
    // Never let queue persistence problems break the developer's workflow.
  }
}

function enqueue(payload) {
  const queue = readQueue();
  queue.push(payload);
  writeQueue(queue);
}

// Best-effort retry of anything left over from a previous commit where the
// send failed (no internet, Supabase down, etc). Never blocks or throws.
async function flushQueue(config) {
  if (!config || !config.supabaseUrl) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    const result = await sendToSupabase(config, item);
    if (!result.ok) remaining.push(item);
  }
  writeQueue(remaining);
}

async function deliver(config, payload) {
  const result = await sendToSupabase(config, payload);
  if (result.dryRun) {
    console.log(`\n${c.dim}${JSON.stringify(payload, null, 2)}${c.reset}`);
    console.log(`${c.yellow}[trust-hook] Dry run (no Supabase URL configured) — payload printed above, nothing sent.${c.reset}`);
    return;
  }
  if (result.ok) {
    console.log(`${c.green}✓ Thanks — feedback recorded.${c.reset}`);
  } else {
    enqueue(payload);
    console.log(`${c.yellow}[trust-hook] Could not reach Supabase — saved locally and will retry on your next commit.${c.reset}`);
  }
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askChoice(rl, label, options) {
  console.log(`\n${c.cyan}${label}${c.reset}`);
  options.forEach((opt, i) => {
    console.log(`  ${c.bold}${i + 1}${c.reset}. ${opt[0]}`);
  });
  for (;;) {
    const answer = await ask(rl, `${c.cyan}> ${c.reset}`);
    const n = parseInt(answer, 10);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      return options[n - 1][1];
    }
    console.log(`${c.red}Please enter a number between 1 and ${options.length}.${c.reset}`);
  }
}

async function askRating(rl) {
  console.log(`\n${c.cyan}Trust rating (1-5)${c.reset} ${c.dim}— 1 = didn't trust it at all, 5 = fully trusted${c.reset}`);
  for (;;) {
    const answer = await ask(rl, `${c.cyan}> ${c.reset}`);
    const n = parseInt(answer, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
    console.log(`${c.red}Please enter a number from 1 to 5.${c.reset}`);
  }
}

async function askYesNo(rl, question) {
  for (;;) {
    const answer = (await ask(rl, question)).toLowerCase();
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    console.log(`${c.red}Please answer y or n.${c.reset}`);
  }
}

async function main() {
  const config = readConfig();
  if (!config) {
    // Not configured (run `npx trust-hook init`) - stay silent, don't nag.
    process.exit(0);
  }

  // Best-effort: clear out anything queued from a previous commit.
  await flushQueue(config);

  const auto = collectAutoData();

  // Git runs post-commit hooks with stdin connected to /dev/null, so
  // process.stdin can't be used for prompts — open the controlling
  // terminal directly. If there isn't one (CI, no-tty environment,
  // automated commit), there's no one to ask - skip the survey silently
  // rather than block or hang the commit.
  let ttyInput;
  try {
    ttyInput = new tty.ReadStream(fs.openSync('/dev/tty', 'r'));
  } catch (e) {
    process.exit(0);
  }

  const rl = readline.createInterface({ input: ttyInput, output: process.stdout });
  // Ctrl+C must abort immediately, even mid-question — the commit already
  // happened (this is a post-commit hook), so there's nothing to save here.
  process.on('SIGINT', () => process.exit(0));

  console.log(`\n${c.bold}${c.cyan}trust-hook${c.reset} ${c.dim}— quick feedback on commit ${auto.commit_hash}${c.reset}`);

  const usedAi = await askYesNo(rl, `${c.cyan}Did you use AI assistance for this commit? (y/n)${c.reset} `);

  let survey = {
    used_ai: false,
    task_type: null,
    ai_tool: null,
    trust_rating: null,
    feedback_text: null,
  };

  if (usedAi) {
    const taskType = await askChoice(rl, 'Task type:', TASK_TYPES);
    const aiTool = await askChoice(rl, 'AI tool used:', AI_TOOLS);
    const trustRating = await askRating(rl);
    const feedbackText = await ask(rl, `\n${c.cyan}Feedback (optional, press Enter to skip):${c.reset} `);

    survey = {
      used_ai: true,
      task_type: taskType,
      ai_tool: aiTool,
      trust_rating: trustRating,
      feedback_text: feedbackText || null,
    };
  }

  const payload = {
    participant_alias: config.participantAlias || '',
    commit_hash: auto.commit_hash,
    commit_message: auto.commit_message,
    repo_name: auto.repo_name,
    file_types: auto.file_types,
    used_ai: survey.used_ai,
    task_type: survey.task_type,
    ai_tool: survey.ai_tool,
    trust_rating: survey.trust_rating,
    feedback_text: survey.feedback_text,
    committed_at: auto.committed_at,
  };

  rl.close();
  ttyInput.destroy();

  await deliver(config, payload);
}

main().catch(() => process.exit(0));
NODE_EOF

node "$TMP_SCRIPT"
rm -f "$TMP_SCRIPT"
exit 0
