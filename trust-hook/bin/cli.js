#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const config = require('../src/config');
const { colors, createPrompt, ask, askYesNo } = require('../src/prompt');
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

function defaultAlias() {
  try {
    const name = execSync('git config user.name', {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (name) return name;
  } catch (e) {
    // fall through
  }
  try {
    return os.userInfo().username;
  } catch (e) {
    return '';
  }
}

// Prompts for Supabase credentials, writes them to the project config, and
// runs a connectivity check. Shared by the explicit `configure` command and
// by `init`'s automatic first-run setup.
async function promptAndWriteProjectConfig(repoRoot, existing) {
  const rl = createPrompt();

  const urlSuffix = existing.supabaseUrl ? ` ${colors.dim}[${existing.supabaseUrl}]${colors.reset}` : '';
  const supabaseUrl = await ask(rl, `${colors.cyan}Supabase project URL${colors.reset}${urlSuffix}: `);

  const keySuffix = existing.supabaseAnonKey ? ` ${colors.dim}[unchanged]${colors.reset}` : '';
  const supabaseAnonKey = await ask(rl, `${colors.cyan}Supabase anon key${colors.reset}${keySuffix}: `);

  rl.close();

  const newProjectConfig = {
    supabaseUrl: supabaseUrl || existing.supabaseUrl || '',
    supabaseAnonKey: supabaseAnonKey || existing.supabaseAnonKey || '',
  };

  const dest = config.writeProjectConfig(newProjectConfig, repoRoot);
  console.log(`${colors.green}✓${colors.reset} Saved project config to ${colors.dim}${dest}${colors.reset}`);

  if (newProjectConfig.supabaseUrl) {
    process.stdout.write(`${colors.dim}Checking Supabase connectivity...${colors.reset} `);
    const result = await sendToSupabase(newProjectConfig, {
      participant_alias: 'trust-hook-configure-check',
      commit_hash: 'project-config-check',
      commit_message: 'trust-hook project configuration check',
      repo_name: path.basename(repoRoot),
      file_types: [],
      used_ai: false,
      task_type: null,
      ai_tool: null,
      trust_rating: null,
      feedback_text: 'trust-hook configure connectivity check',
      committed_at: new Date().toISOString(),
    });
    console.log(result.ok ? `${colors.green}OK${colors.reset}` : `${colors.yellow}could not confirm (${result.error || result.status || 'unknown error'})${colors.reset}`);
  }

  console.log(`${colors.dim}Commit ${config.PROJECT_CONFIG_FILENAME} so every teammate picks it up automatically:${colors.reset}`);
  console.log(`${colors.dim}  git add ${config.PROJECT_CONFIG_FILENAME} && git commit -m "Configure trust-hook"${colors.reset}`);

  return newProjectConfig;
}

// Explicit command for rotating credentials later without touching the
// hook install or personal alias.
async function configureProject() {
  const repoRoot = config.findProjectRoot();
  if (!repoRoot) {
    console.error(`${colors.red}Error:${colors.reset} not inside a git repository.`);
    process.exit(1);
  }

  console.log(`${colors.bold}${colors.cyan}trust-hook project setup${colors.reset}`);
  console.log(`${colors.dim}Stores Supabase credentials for this project so developers don't have to.${colors.reset}\n`);

  const existing = config.readProjectConfig(repoRoot) || {};
  await promptAndWriteProjectConfig(repoRoot, existing);
}

// Developer-facing, single step: install the hook. Credentials come from the
// project config committed by the project owner — nothing to type here
// beyond (optionally, once) a participant alias.
async function init() {
  const gitDir = findGitDir();
  if (!gitDir) {
    console.error(`${colors.red}Error:${colors.reset} not inside a git repository.`);
    process.exit(1);
  }

  console.log(`${colors.bold}${colors.cyan}trust-hook setup${colors.reset}`);
  console.log(`${colors.dim}Installs a post-commit hook that asks a few quick questions about AI-assisted coding.${colors.reset}\n`);

  let personal = config.readConfig();
  if (!personal || !personal.participantAlias) {
    const rl = createPrompt();
    const suggested = defaultAlias();
    const suffix = suggested ? ` ${colors.dim}[${suggested}]${colors.reset}` : '';
    const alias = await ask(rl, `${colors.cyan}Participant alias${colors.reset} ${colors.dim}(any string, used to identify you anonymously — press Enter to accept the default)${colors.reset}${suffix}: `);
    rl.close();
    personal = { participantAlias: alias || suggested };
    config.writeConfig(personal);
    console.log(`${colors.green}✓${colors.reset} Saved your alias to ${colors.dim}${config.CONFIG_PATH}${colors.reset} (reused for every repo you instrument)`);
  } else {
    console.log(`${colors.dim}Using saved participant alias "${personal.participantAlias}" (from ${config.CONFIG_PATH}).${colors.reset}`);
  }

  const repoRoot = config.findProjectRoot();
  const existingProjectConfig = config.readProjectConfig(repoRoot);
  if (existingProjectConfig && existingProjectConfig.supabaseUrl) {
    console.log(`${colors.green}✓${colors.reset} Found project Supabase config at ${colors.dim}${config.PROJECT_CONFIG_FILENAME}${colors.reset} — nothing else to set up.`);
  } else {
    // Nobody has connected this repo to Supabase yet — whoever runs the
    // installer first (usually the project owner) gets offered the setup
    // right here, so there's still only ever one command to run.
    console.log(`${colors.yellow}No ${config.PROJECT_CONFIG_FILENAME} found in this repo yet.${colors.reset}`);
    const rl = createPrompt();
    const wantsSetup = await askYesNo(rl, `${colors.cyan}Connect this repo to a Supabase project now? (y/n)${colors.reset} `);
    rl.close();
    if (wantsSetup) {
      await promptAndWriteProjectConfig(repoRoot, existingProjectConfig || {});
    } else {
      console.log(`${colors.dim}Skipping — the hook will run in dry-run mode (prints the payload instead of sending it) until someone runs ${colors.reset}${colors.cyan}npx ./trust-hook configure${colors.reset}${colors.dim}.${colors.reset}`);
    }
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
  console.log('  npx ./trust-hook              Install the hook (default). First run in a repo also offers to connect Supabase.');
  console.log('  npx ./trust-hook init         Same as above');
  console.log('  npx ./trust-hook configure    Set or rotate this project\'s Supabase credentials without touching the hook install');
  console.log('  npx ./trust-hook uninstall    Remove the hook from this repo');
}

async function main() {
  const command = process.argv[2];
  if (!command || command === 'init') {
    await init();
  } else if (command === 'configure') {
    await configureProject();
  } else if (command === 'uninstall') {
    uninstall();
  } else {
    printHelp();
    if (command !== '--help' && command !== '-h') {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(`${colors.red}Error:${colors.reset} ${err.message}`);
  process.exit(1);
});
