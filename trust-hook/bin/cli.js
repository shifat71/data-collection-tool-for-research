#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const config = require('../src/config');
const { colors, createPrompt, ask } = require('../src/prompt');
const { sendToSupabase } = require('../src/sender');

const HOOK_TEMPLATE_PATH = path.join(__dirname, '..', 'src', 'hook-script.sh');
const CONFIG_DIR_PLACEHOLDER = '__TRUST_HOOK_CONFIG_DIR__';
const HOOK_MARKER = 'trust-hook post-commit hook';

function findGitDir() {
  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return path.resolve(process.cwd(), gitDir);
  } catch (e) {
    return null;
  }
}

async function init() {
  const gitDir = findGitDir();
  if (!gitDir) {
    console.error(`${colors.red}Error:${colors.reset} not inside a git repository.`);
    process.exit(1);
  }

  console.log(`${colors.bold}${colors.cyan}trust-hook setup${colors.reset}`);
  console.log(`${colors.dim}Installs a post-commit hook that asks a few quick questions about AI-assisted coding.${colors.reset}\n`);

  const existing = config.readConfig() || {};
  const rl = createPrompt();

  const aliasSuffix = existing.participantAlias ? ` ${colors.dim}[${existing.participantAlias}]${colors.reset}` : '';
  const alias = await ask(rl, `${colors.cyan}Participant alias${colors.reset} ${colors.dim}(any string, used to identify you anonymously)${colors.reset}${aliasSuffix}: `);

  const urlSuffix = existing.supabaseUrl ? ` ${colors.dim}[${existing.supabaseUrl}]${colors.reset}` : '';
  const supabaseUrl = await ask(rl, `${colors.cyan}Supabase project URL${colors.reset} ${colors.dim}(leave blank for dry-run mode)${colors.reset}${urlSuffix}: `);

  let supabaseAnonKey = '';
  if (supabaseUrl || existing.supabaseUrl) {
    const keySuffix = existing.supabaseAnonKey ? ` ${colors.dim}[unchanged]${colors.reset}` : '';
    supabaseAnonKey = await ask(rl, `${colors.cyan}Supabase anon key${colors.reset}${keySuffix}: `);
  }

  rl.close();

  const newConfig = {
    participantAlias: alias || existing.participantAlias || '',
    supabaseUrl: supabaseUrl || existing.supabaseUrl || '',
    supabaseAnonKey: supabaseAnonKey || existing.supabaseAnonKey || '',
  };

  config.writeConfig(newConfig);
  console.log(`\n${colors.green}✓${colors.reset} Saved config to ${colors.dim}${config.CONFIG_PATH}${colors.reset}`);

  if (newConfig.supabaseUrl) {
    process.stdout.write(`${colors.dim}Checking Supabase connectivity...${colors.reset} `);
    const result = await sendToSupabase(newConfig, {
      participant_alias: newConfig.participantAlias,
      commit_hash: 'install-check',
      commit_message: 'trust-hook installation check',
      repo_name: path.basename(process.cwd()),
      file_types: [],
      used_ai: false,
      task_type: null,
      ai_tool: null,
      trust_rating: null,
      feedback_text: 'trust-hook init connectivity check',
      committed_at: new Date().toISOString(),
    });
    if (result.ok) {
      console.log(`${colors.green}OK${colors.reset}`);
    } else {
      console.log(`${colors.yellow}could not confirm (${result.error || result.status || 'unknown error'})${colors.reset}`);
      console.log(`${colors.dim}That's fine — commits will be queued locally and retried automatically until it's reachable.${colors.reset}`);
    }
  } else {
    console.log(`${colors.yellow}No Supabase URL set — the hook will run in dry-run mode (prints the payload instead of sending it).${colors.reset}`);
  }

  const hooksDir = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookDest = path.join(hooksDir, 'post-commit');

  if (fs.existsSync(hookDest)) {
    const content = fs.readFileSync(hookDest, 'utf8');
    if (!content.includes(HOOK_MARKER)) {
      console.log(`${colors.yellow}Warning:${colors.reset} an existing post-commit hook was found — backing it up to post-commit.bak`);
      fs.copyFileSync(hookDest, `${hookDest}.bak`);
    }
  }

  let hookScript = fs.readFileSync(HOOK_TEMPLATE_PATH, 'utf8');
  hookScript = hookScript.split(CONFIG_DIR_PLACEHOLDER).join(config.CONFIG_DIR);
  fs.writeFileSync(hookDest, hookScript);
  fs.chmodSync(hookDest, 0o755);

  console.log(`${colors.green}✓${colors.reset} Installed post-commit hook at ${colors.dim}${hookDest}${colors.reset}`);
  console.log(`\n${colors.bold}${colors.green}Setup complete!${colors.reset} You'll be asked a few quick questions after each commit.`);
  console.log(`${colors.dim}Add "[no-survey]" to a commit message to skip the prompts for that commit.${colors.reset}`);
}

function uninstall() {
  const gitDir = findGitDir();
  if (!gitDir) {
    console.error(`${colors.red}Error:${colors.reset} not inside a git repository.`);
    process.exit(1);
  }

  const hookDest = path.join(gitDir, 'hooks', 'post-commit');
  if (!fs.existsSync(hookDest)) {
    console.log(`${colors.yellow}No post-commit hook found — nothing to uninstall.${colors.reset}`);
    return;
  }

  const content = fs.readFileSync(hookDest, 'utf8');
  if (!content.includes(HOOK_MARKER)) {
    console.log(`${colors.yellow}The installed post-commit hook doesn't look like it was created by trust-hook — leaving it in place.${colors.reset}`);
    return;
  }

  fs.unlinkSync(hookDest);

  const backup = `${hookDest}.bak`;
  if (fs.existsSync(backup)) {
    fs.renameSync(backup, hookDest);
    console.log(`${colors.green}✓${colors.reset} Removed trust-hook and restored your previous post-commit hook.`);
  } else {
    console.log(`${colors.green}✓${colors.reset} Removed trust-hook post-commit hook from ${colors.dim}${hookDest}${colors.reset}`);
  }
}

function printHelp() {
  console.log(`${colors.bold}trust-hook${colors.reset} — developer trust measurement tool\n`);
  console.log('Usage:');
  console.log('  npx trust-hook init        Install the post-commit survey hook in this repo');
  console.log('  npx trust-hook uninstall   Remove the hook from this repo');
}

async function main() {
  const command = process.argv[2];
  if (command === 'init') {
    await init();
  } else if (command === 'uninstall') {
    uninstall();
  } else {
    printHelp();
    if (command && command !== '--help' && command !== '-h') {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(`${colors.red}Error:${colors.reset} ${err.message}`);
  process.exit(1);
});
