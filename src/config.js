'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Personal config: one alias per developer, shared across every repo they instrument.
const CONFIG_DIR = path.join(os.homedir(), '.trust-hook');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const QUEUE_PATH = path.join(CONFIG_DIR, 'queue.json');

// Project config: Supabase credentials, git-ignored and distributed privately.
const PROJECT_CONFIG_FILENAME = 'trust-hook.config.json';

// The tool's own directory — config written here travels with the folder
// when the maintainer distributes it to developers.
const TOOL_ROOT = path.resolve(__dirname, '..');

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeConfig(newConfig) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
}

function findProjectRoot(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      cwd: cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (e) {
    return null;
  }
}

function readProjectConfig(repoRoot) {
  // Check the tool's own directory first (supports pre-configured folders).
  try {
    return JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, PROJECT_CONFIG_FILENAME), 'utf8'));
  } catch (e) {
    // not there — fall through
  }
  // Fall back to git repo root.
  const root = repoRoot || findProjectRoot();
  if (!root) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(root, PROJECT_CONFIG_FILENAME), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeProjectConfig(newProjectConfig) {
  const dest = path.join(TOOL_ROOT, PROJECT_CONFIG_FILENAME);
  fs.writeFileSync(dest, JSON.stringify(newProjectConfig, null, 2) + '\n');
  return dest;
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  QUEUE_PATH,
  PROJECT_CONFIG_FILENAME,
  TOOL_ROOT,
  ensureConfigDir,
  readConfig,
  writeConfig,
  findProjectRoot,
  readProjectConfig,
  writeProjectConfig,
};
