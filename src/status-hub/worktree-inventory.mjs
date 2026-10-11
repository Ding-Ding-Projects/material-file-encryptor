// Machine and git worktree reporting for Status Hub sessions.
//
// Produces the complete inventory the hub schema expects: resolved path, branch,
// commit, dirty flag, and measured byte size for every local worktree. Git is
// invoked directly (never through a shell) and the disk walk is bounded by a
// wall-clock budget so reporting can never stall the caller.

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';

const GIT_TIMEOUT_MS = 10000;
const DEFAULT_WALK_BUDGET_MS = 2000;
const MAX_WALK_ENTRIES = 100000;
const MAX_WORKTREE_ROOTS = 128;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'dist-release', 'out']);

function git(args, cwd) {
  return new Promise((resolveRun) => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      resolveRun(error ? null : String(stdout));
    });
  });
}

/** Bounded recursive byte count; returns what it measured inside the budget. */
export async function measureBytes(root, budgetMs = DEFAULT_WALK_BUDGET_MS) {
  const deadline = Date.now() + Math.max(0, Number.isFinite(Number(budgetMs)) ? Number(budgetMs) : DEFAULT_WALK_BUDGET_MS);
  let total = 0;
  const queue = [root];
  let cursor = 0;
  let inspected = 0;
  while (cursor < queue.length && inspected < MAX_WALK_ENTRIES) {
    if (Date.now() > deadline) break;
    const dir = queue[cursor++];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (Date.now() > deadline) break;
      inspected += 1;
      if (inspected > MAX_WALK_ENTRIES) break;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) queue.push(full);
        continue;
      }
      try {
        total += (await stat(full)).size;
      } catch {
        // A file that vanished mid-walk simply is not counted.
      }
    }
  }
  return total;
}

async function inspectWorktree(path, budgetMs) {
  if (typeof path !== 'string' || !path) return null;
  const commitOut = await git(['rev-parse', 'HEAD'], path);
  const commit = (commitOut || '').trim().toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(commit)) return null;
  const branchOut = await git(['rev-parse', '--abbrev-ref', 'HEAD'], path);
  const statusOut = await git(['status', '--porcelain'], path);
  return {
    path: resolve(path),
    branch: (branchOut || '').trim(),
    commit,
    bytes: await measureBytes(path, budgetMs),
    dirty: statusOut === null ? true : statusOut.trim().length > 0
  };
}

/**
 * Collects every worktree linked to the repository at repoPath, plus any extra
 * roots the caller supplies. Unreadable entries are dropped rather than reported
 * as guesses, and the result matches the hub's worktree schema exactly.
 */
export async function collectWorktrees({ repoPath = process.cwd(), extraRoots = [], walkBudgetMs = DEFAULT_WALK_BUDGET_MS } = {}) {
  try {
    const roots = new Set();
    const listed = await git(['worktree', 'list', '--porcelain'], repoPath);
    if (listed) {
      for (const line of listed.split('\n')) {
        if (line.startsWith('worktree ') && roots.size < MAX_WORKTREE_ROOTS) roots.add(line.slice('worktree '.length).trim());
      }
    } else if (typeof repoPath === 'string' && repoPath) {
      roots.add(repoPath);
    }
    if (Array.isArray(extraRoots)) {
      for (const root of extraRoots) {
        if (roots.size >= MAX_WORKTREE_ROOTS) break;
        if (typeof root === 'string' && root) roots.add(root);
      }
    }
    const worktrees = [];
    for (const root of roots) {
      const entry = await inspectWorktree(root, walkBudgetMs);
      if (entry) worktrees.push(entry);
    }
    return worktrees.slice(0, MAX_WORKTREE_ROOTS);
  } catch {
    return [];
  }
}

/** The machine label the aggregated capacity dashboard groups by. */
export function machineLabel() {
  try {
    return hostname();
  } catch {
    return 'unknown-machine';
  }
}
