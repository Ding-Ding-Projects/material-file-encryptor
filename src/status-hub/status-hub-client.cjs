// CommonJS entry for Electron main processes and other require() consumers.
//
// The library itself is ESM; this shim loads it lazily so a plain
// require('status-hub-client') works without a build step. Every exported
// function forwards to the ESM implementation.

'use strict';

const { randomBytes } = require('node:crypto');
const { hostname } = require('node:os');

let modulePromise = null;

function load() {
  if (!modulePromise) modulePromise = import('./status-hub-client.mjs');
  return modulePromise;
}

module.exports = {
  /** Async: resolves the ESM module with every named export. */
  load,
  async createStatusHubClient(options) {
    const mod = await load();
    return mod.createStatusHubClient(options);
  },
  async resolveBaseUrl(options) {
    const mod = await load();
    return mod.resolveBaseUrl(options);
  },
  generateSessionKey() {
    return randomBytes(32).toString('hex');
  },
  async collectWorktrees(options) {
    const mod = await import('./worktree-inventory.mjs');
    return mod.collectWorktrees(options);
  },
  machineLabel() {
    try { return hostname(); } catch { return 'unknown-machine'; }
  },
  async clampSession(input, warnings) {
    const mod = await load();
    return mod.clampSession(input, warnings);
  },
  async clampQuestion(input, warnings) {
    const mod = await load();
    return mod.clampQuestion(input, warnings);
  },
  async clampPanicEvent(input, warnings) {
    const mod = await load();
    return mod.clampPanicEvent(input, warnings);
  },
  async clampEvidence(input, warnings) {
    const mod = await load();
    return mod.clampEvidence(input, warnings);
  },
  async clampNextGates(input, warnings) {
    const mod = await load();
    return mod.clampNextGates(input, warnings);
  },
  async clampWorktrees(input, warnings) {
    const mod = await load();
    return mod.clampWorktrees(input, warnings);
  },
  async buildEvidence(input, warnings) {
    const mod = await load();
    return mod.buildEvidence(input, warnings);
  },
  async buildNextGates(input, warnings) {
    const mod = await load();
    return mod.buildNextGates(input, warnings);
  },
  async buildProgress(input, warnings) {
    const mod = await load();
    return mod.buildProgress(input, warnings);
  },
  async clampProgress(input, warnings) {
    const mod = await load();
    return mod.clampProgress(input, warnings);
  },
  async buildLowlevel(input, warnings) {
    const mod = await load();
    return mod.buildLowlevel(input, warnings);
  },
  async clampLowlevel(input, warnings) {
    const mod = await load();
    return mod.clampLowlevel(input, warnings);
  },
  async buildQuestion(input, warnings) {
    const mod = await load();
    return mod.buildQuestion(input, warnings);
  },
  async buildSession(input, warnings) {
    const mod = await load();
    return mod.buildSession(input, warnings);
  }
};
