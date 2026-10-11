export {};

type FeatureName = 'converter'|'ollama'|'documentation'|'status'|'personalization'|'access';
interface FileEntry {id:string;entryId?:string;path:string;size:number;offline:boolean;modified:string;partCount?:number;partSizeBytes?:number}
interface FilePage {items:FileEntry[];nextCursor:string|null;revision?:string|number}
interface Operation {id:string;type?:string;label?:string;state:string;progress?:number;error?:string}
interface VersionEntry {id:string;entryId:string;path:string;timestampUtc:string;length:number;label?:string;isAvailable:boolean}
interface ActivityPage {items:Array<{id:string;entryId?:string;action:string;path?:string;timestampUtc:string;detail?:string}>;nextCursor:string|null}
interface DriveBridge {
 status():Promise<Record<string,unknown>&{files?:FileEntry[];filesRevision?:string|number;operations?:Operation[];build?:{version?:string;builtAt?:string}}>;
 onStatus(callback:(state:Record<string,unknown>)=>void):()=>void;
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
