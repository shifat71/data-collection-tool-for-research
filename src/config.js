'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Personal config: one alias per developer, shared across every repo they instrument.
const CONFIG_DIR = path.join(os.homedir(), '.trust-hook');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const QUEUE_PATH = path.join(CONFIG_DIR, 'queue.json');

// Project config: Supabase credentials, committed to the repo by the project
// owner so every developer gets them for free just by cloning/pulling.
const PROJECT_CONFIG_FILENAME = 'trust-hook.config.json';

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

function projectConfigPath(repoRoot) {
  return path.join(repoRoot, PROJECT_CONFIG_FILENAME);
}

function readProjectConfig(repoRoot) {
  const root = repoRoot || findProjectRoot();
  if (!root) return null;
  try {
    return JSON.parse(fs.readFileSync(projectConfigPath(root), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeProjectConfig(newProjectConfig, repoRoot) {
  const root = repoRoot || findProjectRoot();
  if (!root) throw new Error('Not inside a git repository.');
  const dest = projectConfigPath(root);
  fs.writeFileSync(dest, JSON.stringify(newProjectConfig, null, 2) + '\n');
  return dest;
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  QUEUE_PATH,
  PROJECT_CONFIG_FILENAME,
  ensureConfigDir,
  readConfig,
  writeConfig,
  findProjectRoot,
  projectConfigPath,
  readProjectConfig,
  writeProjectConfig,
};
