export interface VaultVersionInfo { descendantIds?: string[]; id: string; entryId: string; path: string; timestampUtc: string; length: number; isDirectory: boolean; deleted: boolean; isAvailable: boolean }
export interface DriveFile { id: string; path: string; size: number; modified: string; partCount: number; partSizeBytes: number; offline: boolean }
export interface VaultSessionSummary { sessionId:string; locked:boolean; mounted:boolean; driveLetter?:string; driveName?:string; storageDir?:string; cacheDir?:string; recoveryRequired?:boolean; operation?:string|null }
export interface DriveState {
  modelStartupReadiness?: {schemaVersion:1;state:'not-started'|'pending'|'settled'|'failed';initialization:'not-started'|'pending'|'settled'|'failed';inspection:'not-started'|'pending'|'settled'|'failed';pendingRequests:number|null;pendingOperations:number|null};
  sessionId: string; sessions: VaultSessionSummary[];
  storageFormat?: 1 | 2;
  packing?: {pendingFiles:number;running:boolean;paused:boolean;activeWriters:number;lastError:string|null;targetPartSizeBytes:number};
  locked: boolean; mounted: boolean; driveLetter?: string; driveName?: string; storageDir?: string; cacheDir: string;
  files: DriveFile[]; availableDriveLetters: string[]; partSizeBytes?: number; autoUnlock?: boolean;
  history?: { versionCount: number; recycledCount: number; pendingVersionCount: number; retentionDays: number | null; gitAvailable: boolean };
  transport?: { mode: 'folder' | 'privateGit'; remoteRepository?: string; available: boolean; pendingPublication?: boolean; pendingSynchronization?: boolean; lastError?: string };
  operation: string | null; driver: { available: boolean; checking?: boolean; error?: string | null };
  defaults: { cacheDir: string; driveLetter: string; driveName: string };
  preferences: { historyRetentionDays?: number | null; transport?: string; remoteRepository?: string; startup: boolean; autoUnlock: boolean; driveLetter: string; driveName?: string; storageDir?: string; cacheDir?: string };
  sync: { running: boolean; lastSync: string | null; error: string | null; pendingCommits?: number };
}
export type VaultOptions = { storageDir: string; cacheDir: string; driveLetter: string; driveName?: string; transport?: 'folder' | 'privateGit'; remoteRepository?: string; autoUnlock?: boolean } & ({ password: string; keyFilePath?: never } | { password?: never; keyFilePath: string });
export interface RegistryLoginStatus { state:'idle'|'checking'|'signed-in'|'authorizing'|'verifying'|'cancelled'|'expired'|'failed'|'unavailable'|'stale';deviceCode:string|null;canOpenPage:boolean;expiresAt:string|null;account:string|null;reason:string|null }
export interface BackupAllDrivePlan { sessionId:string;name:string;letter:string;locked:boolean;ineligibleReason:'locked'|'no-storage'|'not-folder'|null;suffix:string;configured:{repository:string;visibility:'public'|'private';enabled:boolean}|null;lastSync:string|null;nextSync:string|null }
export interface BackupAllDriveStatus { sessionId:string;name:string;repository:string;visibility:'public'|'private';state:'queued'|'repository'|'configuring'|'syncing'|'done'|'failed'|'cancelled';error:{code:string;message:string}|null;digest:string|null;published:boolean|null;lastSync:string|null;nextSync:string|null }
export interface BackupAllStatus { phase:'idle'|'running'|'finished'|'cancelled';startedAt:string|null;finishedAt:string|null;namespace:string|null;drives:BackupAllDriveStatus[] }
export interface AutoBackupSettings { enabled:boolean;idleDelaySeconds:number;intervalMinutes:number;onLock:boolean;whileClosed:boolean;repositoryLayout:'shared'|'per-drive';retention:{keepLatest:number;keepDaily:number;keepWeekly:number};noticeAcknowledged:boolean }
export interface AutoBackupDrive { sessionId:string;name:string;enabled:boolean;phase:'idle'|'waiting-idle'|'backing-up'|'paused'|'waiting-connection'|'needs-attention'|'off'|'unavailable';dirty:boolean;dueAt:number|null;retryAt:number|null;failures:number;lastError:string|null;lastBackup:string|null;repository:string|null;visibility:'public'|'private'|null;deviceId:string|null;progress:object|null;syncState:string|null;snapshots:number|null;tagCount:number|null;lastPrune:{state:string;at:string;pruned:number;failed:number;kept:number|null}|null }
export interface AutoBackupStatus { settings:AutoBackupSettings;signedIn:boolean;account:string|null;online:boolean;noticeRequired:boolean;running:string|null;drives:AutoBackupDrive[] }
export interface DriveBridge {
  autoBackupStatus():Promise<AutoBackupStatus>;autoBackupUpdate(patch:Partial<AutoBackupSettings>):Promise<AutoBackupStatus>;autoBackupSetDrive(sessionId:string,enabled:boolean):Promise<AutoBackupStatus>;
  autoBackupNow(sessionId:string):Promise<AutoBackupStatus>;autoBackupPrune(sessionId:string):Promise<{state:string;pruned:number;failed:number;kept:number|null}>;autoBackupMove(sessionId:string):Promise<AutoBackupStatus>;autoBackupListOwn(sessionId:string):Promise<{repository:string;snapshots:{tag:string;digest:string;createdAt:string|null}[]}>;autoBackupRemove(sessionId:string,tags:string[]):Promise<{removed:number;failed:number}>;
  registryLoginStatus():Promise<RegistryLoginStatus>;recheckRegistryLogin():Promise<RegistryLoginStatus>;startRegistryLogin():Promise<RegistryLoginStatus>;
  backupAllPlan():Promise<{drives:BackupAllDrivePlan[];running:boolean}>;backupAllStart(selection:{sessionIds:string[];names?:Record<string,string>}):Promise<BackupAllStatus>;backupAllStatus():Promise<BackupAllStatus>;backupAllCancel():Promise<BackupAllStatus>;
  cancelRegistryLogin():Promise<RegistryLoginStatus>;openRegistryLoginPage():Promise<RegistryLoginStatus>;
  addSession(): Promise<DriveState>;
  selectSession(sessionId: string): Promise<DriveState>;
  removeSession(sessionId: string): Promise<DriveState>;
  featureRequest<T=unknown>(feature:'workflow',action:string,payload?:Record<string,unknown>):Promise<T>;
  featureRequest<T=unknown>(feature:'toolbox',action:string,payload?:Record<string,unknown>):Promise<T>;
  toolboxWrite(id:string,data:ArrayBuffer|ArrayBufferView):Promise<number>;
  storageDiagnostics(): Promise<StorageDiagnostics>;
  startPacking(options?: {path?: string; partSizeBytes?: number}): Promise<{operationId: string}>;
  status(): Promise<DriveState>; create(options: VaultOptions & { partSizeBytes: number }): Promise<DriveState>;
  upgrade(options: VaultOptions & { partSizeBytes: number }): Promise<DriveState>;
  unlock(options: VaultOptions): Promise<DriveState>; lock(): Promise<DriveState>;
  mount(options?: { driveLetter?: string; driveName?: string }): Promise<DriveState>; unmount(): Promise<DriveState>;
  chooseFolder(kind?: 'storage' | 'cache'): Promise<string | null>; chooseFiles(): Promise<string[]>;
  chooseExport(name: string): Promise<string | null>; chooseKeyFile(): Promise<string | null>;
  generateKeyFile(options?: { storageDir?: string; cacheDir?: string }): Promise<string | null>;
  importFiles(paths: string[]): Promise<DriveState>; open(id: string): Promise<void>; openExplorer(): Promise<void>;
  exportFile(options: { id: string; destination: string }): Promise<string>;
  keepOffline(id: string): Promise<DriveState>; releaseOffline(id: string): Promise<DriveState>;
  history(options?: { entryId?: string; retentionDays?: number | null }): Promise<VaultVersionInfo[]>;
  saveVersion(path?: string): Promise<DriveState>; restoreVersion(id: string): Promise<DriveState>;
  recycled(): Promise<VaultVersionInfo[]>; restoreDeleted(ids: string[]): Promise<DriveState>; emptyRecycleBin(): Promise<DriveState>;
  setHistoryRetention(days: number | null): Promise<DriveState>;
  sync(): Promise<DriveState>; setPartSize(bytes: number): Promise<DriveState>; resplit(): Promise<DriveState>;
  setStartup(enabled: boolean): Promise<DriveState>; setAutoUnlock(enabled: boolean): Promise<DriveState>;
  forgetSavedCredential(): Promise<DriveState>; windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  installDriver(): Promise<void>; openExternal(url: string): Promise<void>; importVocabulary(): Promise<unknown>;
  onStatus(callback: (state: DriveState) => void): () => void;
}
declare global { interface Window { drive: DriveBridge } }

interface StorageDiagnostics {targetPartSizeBytes:number;pendingPackingFiles:number;activeWriters:number;packingRunning:boolean;packingPaused:boolean;packingError:string|null;currentReferencedParts:number;currentReferencedBytes:number;historicalOnlyParts:number;historicalOnlyBytes:number;temporaryFiles:number;temporaryBytes:number}
