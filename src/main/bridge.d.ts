export interface DriveFile { id: string; path: string; size: number; modified: string; partCount: number; partSizeBytes: number; offline: boolean }
export interface DriveState {
  locked: boolean; mounted: boolean; driveLetter?: string; storageDir?: string; cacheDir: string;
  files: DriveFile[]; availableDriveLetters: string[]; partSizeBytes?: number; autoUnlock?: boolean;
  operation: string | null; driver: { available: boolean; error?: string | null };
  defaults: { cacheDir: string; driveLetter: string };
  preferences: { startup: boolean; autoUnlock: boolean; driveLetter: string; storageDir?: string; cacheDir?: string };
  sync: { running: boolean; lastSync: string | null; error: string | null };
}
export type VaultOptions = { storageDir: string; cacheDir: string; driveLetter: string; autoUnlock?: boolean } & ({ password: string; keyFilePath?: never } | { password?: never; keyFilePath: string });
export interface DriveBridge {
  status(): Promise<DriveState>; create(options: VaultOptions & { partSizeBytes: number }): Promise<DriveState>;
  unlock(options: VaultOptions): Promise<DriveState>; lock(): Promise<DriveState>;
  mount(options?: { driveLetter?: string }): Promise<DriveState>; unmount(): Promise<DriveState>;
  chooseFolder(kind?: 'storage' | 'cache'): Promise<string | null>; chooseFiles(): Promise<string[]>;
  chooseExport(name: string): Promise<string | null>; chooseKeyFile(): Promise<string | null>;
  generateKeyFile(options?: { storageDir?: string; cacheDir?: string }): Promise<string | null>;
  importFiles(paths: string[]): Promise<DriveState>; open(id: string): Promise<void>; openExplorer(): Promise<void>;
  exportFile(options: { id: string; destination: string }): Promise<string>;
  keepOffline(id: string): Promise<DriveState>; releaseOffline(id: string): Promise<DriveState>;
  sync(): Promise<DriveState>; setPartSize(bytes: number): Promise<DriveState>; resplit(): Promise<DriveState>;
  setStartup(enabled: boolean): Promise<DriveState>; setAutoUnlock(enabled: boolean): Promise<DriveState>;
  forgetSavedCredential(): Promise<DriveState>; windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  installDriver(): Promise<void>; openExternal(url: string): Promise<void>; importVocabulary(): Promise<unknown>;
  onStatus(callback: (state: DriveState) => void): () => void;
}
declare global { interface Window { drive: DriveBridge } }
