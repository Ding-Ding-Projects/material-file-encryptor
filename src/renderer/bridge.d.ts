export {};
interface DriveState { sessionId: string; sessions: VaultSessionSummary[]; [key:string]: unknown }
interface VaultSessionSummary { sessionId:string; locked:boolean; mounted:boolean; driveLetter?:string; driveName?:string; storageDir?:string; cacheDir?:string; recoveryRequired?:boolean; operation?:string|null }


type FeatureName = 'converter'|'ollama'|'documentation'|'status'|'personalization'|'access'|'workflow'|'surprise';
interface FileEntry {id:string;entryId?:string;path:string;size:number;offline:boolean;modified:string;partCount?:number;partSizeBytes?:number}
interface FilePage {items:FileEntry[];nextCursor:string|null;revision?:string|number}
interface Operation {id?:string;operationId:string;kind?:'import'|'export'|'packing';phase?:'queued'|'staging'|'packing'|'publication'|'completed';bytesCompleted?:number;totalBytes?:number;type?:string;label?:string;state:string;progress?:number;error?:string}
interface VersionEntry {id:string;entryId:string;path:string;timestampUtc:string;length:number;label?:string;isAvailable:boolean}
interface ActivityPage {items:Array<{id:string;entryId?:string;action:string;path?:string;timestampUtc:string;detail?:string}>;nextCursor:string|null}
interface VaultImagePreview {
 previewId:string; sessionId:string; target:string; fileCount:number; totalBytes:number; vaultId:string;
 phase:'prepared'|'building'|'built'|'uploading'|'uploaded'|'build-unverified'|'upload-unverified';
 imageId?:string; storageOnly:true; excludesPendingCache:true;
 receipt?:{uploaded:true; private:true; digest:string; repository:string};
}
interface DriveBridge {
  prepareVaultImage(reference:string):Promise<VaultImagePreview>;
  buildVaultImage(previewId:string):Promise<VaultImagePreview>;
  uploadVaultImage(previewId:string):Promise<VaultImagePreview|{cancelled:true}|null>;
  discardVaultImage():Promise<unknown>;
  cancelVaultImage():Promise<{cancelling:boolean}>;
  vaultImageStatus():Promise<VaultImagePreview|null>;
  addSession(): Promise<DriveState>;
  selectSession(sessionId: string): Promise<DriveState>;
  removeSession(sessionId: string): Promise<DriveState>;
  storageDiagnostics(): Promise<StorageDiagnostics>;
  startPacking(options?: {path?: string; partSizeBytes?: number}): Promise<{operationId: string}>;
 status():Promise<DriveState&{packing?:{pendingFiles:number;running:boolean;paused:boolean;activeWriters:number;lastError:string|null;targetPartSizeBytes:number};files?:FileEntry[];filesRevision?:string|number;operations?:Operation[];build?:{version?:string;builtAt?:string}}>;
 onStatus(callback:(state:DriveState)=>void):()=>void;
 featureRequest<T=unknown>(feature:FeatureName,action:string,payload?:Record<string,unknown>):Promise<T>;
 onFeatureEvent(feature:FeatureName,callback:(event:Record<string,unknown>)=>void):()=>void;
 exportText(payload:{name:string;mime:string;content:string}):Promise<unknown>;
 listFiles(query:{cursor?:string|null;limit:number;revision?:string|number}):Promise<FilePage>;
 listVersions(entryId:string):Promise<VersionEntry[]>;
 listActivity(query:{entryId?:string;action?:string|null;fromUtc?:string|null;toUtc?:string|null;pattern?:string|null;cursor?:string|null;limit:number}):Promise<ActivityPage>;
 previewVersion(id:string):Promise<{text:string}>;
 labelVersion(id:string,label:string):Promise<unknown>;
 exportVersion(id:string):Promise<unknown>;
 restoreVersion(id:string):Promise<unknown>;
 startImport(paths:string[]):Promise<{operationId:string}>;
 cancelOperation(id:string):Promise<unknown>;
 forceLock():Promise<unknown>;
 quit():Promise<unknown>;
 [method:string]:unknown;
}
declare global {interface Window {drive:DriveBridge}}

interface StorageDiagnostics {targetPartSizeBytes:number;pendingPackingFiles:number;activeWriters:number;packingRunning:boolean;packingPaused:boolean;packingError:string|null;currentReferencedParts:number;currentReferencedBytes:number;historicalOnlyParts:number;historicalOnlyBytes:number;temporaryFiles:number;temporaryBytes:number}
