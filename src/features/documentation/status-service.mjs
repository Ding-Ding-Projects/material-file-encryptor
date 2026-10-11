// Trusted-process adapter. Supply the shipped status-hub-client factory, never renderer credentials.
export async function createApplicationStatus({ createClient, clientOptions, collectWorktrees = async () => [], repoPath }) {
  if (typeof createClient !== 'function') return {
    snapshot: () => ({ state: 'unavailable', code: 'CLIENT_NOT_CONFIGURED', message: 'Status client is not configured.' }),
    checkpoint: async () => ({ ok: false, code: 'CLIENT_NOT_CONFIGURED' }),
    finish: async () => ({ ok: false, code: 'CLIENT_NOT_CONFIGURED' })
  };
  const client = await createClient({ ...clientOptions, worktrees: await collectWorktrees({ repoPath }) });
  return {
    snapshot() {
      const value = client.status();
      // Deliberate allowlist: credentials, session keys, paths and raw payloads never cross IPC.
      return { state: value.degraded ? 'unavailable' : 'configured', message: value.degraded ? 'Status updates are unavailable. Check trusted-process configuration.' : 'Status client is configured.', lastSuccessAt: value.lastSuccessAt || null };
    },
    checkpoint: async (summary, progress) => client.pollAtCheckpoint({ summary, progress, worktrees: await collectWorktrees({ repoPath }) }),
    finish: state => client.finish(state)
  };
}
