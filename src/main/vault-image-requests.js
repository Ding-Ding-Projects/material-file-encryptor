/** Main-owned confirmation and admission for data-only encrypted image export. */
export const VAULT_IMAGE_METHODS = new Set(['vaultImageStatus', 'prepareVaultImage', 'buildVaultImage', 'uploadVaultImage', 'discardVaultImage', 'cancelVaultImage']);

export function createVaultImageRequests({ service, confirm, available, exiting }) {
  return async function request(method, params, sessionId) {
    if (!available()) throw Error('Encrypted image export requires the Windows native vault helper.');
    if (method === 'vaultImageStatus') return service.status(sessionId);
    if (method === 'cancelVaultImage') return service.cancel(sessionId);
    if (exiting()) throw Error('The application is preparing to close.');
    if (method === 'prepareVaultImage') return service.prepare(sessionId, params.reference);
    if (method === 'buildVaultImage') return service.build(sessionId, params.previewId);
    if (method === 'discardVaultImage') { await service.discard(sessionId); return null; }
    if (method === 'uploadVaultImage') {
      const preview = service.status(sessionId);
      if (!preview || preview.previewId !== params.previewId || preview.phase !== 'built') throw Error('Build and review the selected vault image before uploading.');
      const answer = await confirm({ type: 'warning', buttons: ['Cancel · 取消', 'Upload encrypted image · 上載加密映像'], defaultId: 0, cancelId: 0,
        title: 'Upload to private Docker Hub repository · 上載至私人 Docker Hub 儲存庫',
        message: `Upload ${preview.fileCount} encrypted storage files (${preview.totalBytes} bytes) to ${preview.target}?`,
        detail: `Vault: ${preview.vaultId}\nImage: ${preview.imageId}\nOnly the reviewed storage snapshot and restore manifest are included. Pending cache changes are excluded. Your existing Docker sign-in will authenticate with Docker Hub. The repository must already be private with write access. This tag may replace an existing tag. Encryption does not prevent offline password guessing; use a strong vault password. No plaintext, password or unwrapped key is intentionally packaged.\n只會上載已檢視嘅加密儲存快照同還原清單，不包括未同步快取。會用現有 Docker 登入核實私人儲存庫。標籤可能取代現有版本；加密仍有離線猜密碼風險。` });
      if (answer.response !== 1) return preview;
      if (exiting()) throw Error('The application is preparing to close.');
      return service.upload(sessionId, params.previewId);
    }
    throw Error('Unsupported encrypted image action.');
  };
}
