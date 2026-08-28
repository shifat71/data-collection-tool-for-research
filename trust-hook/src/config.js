'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.trust-hook');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const QUEUE_PATH = path.join(CONFIG_DIR, 'queue.json');

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

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  QUEUE_PATH,
  ensureConfigDir,
  readConfig,
  writeConfig,
};
