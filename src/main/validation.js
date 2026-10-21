import { validateRegistrySchedule } from './registry-schedule.js';
import {ACCESS_HOST_ACTIONS,validateAccessHostRequest} from './access-host.js';
import {normalizeDriveName} from '../shared/drive-name.js';

// Managed-server (flavor, container and SSH target) requests. Only fixed identifiers and bounded plain values are accepted: no
// path, URL, command, key path or password can be expressed here. File and key choosers run in the main process.
const MANAGED_SERVER_ACTIONS = ['targets','servers','flavorVersions','chooseSshKey','createServer','cancelServer','acceptServerLicense','startServer','stopServer','restartServer','serverStatus','serverLogs','serverSettings','changeServerSetting','searchExtensions','installExtension','listExtensions'];
function managedServerSchemas() {
  const id = value => typeof value === 'string' && /^managed-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
  const optional = valid => value => value === undefined || valid(value);
  const int = (min, max) => value => Number.isSafeInteger(value) && value >= min && value <= max;
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const label = (max, min = 1) => value => typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
  const ssh = value => plain(value) && Object.keys(value).every(key => ['host', 'port', 'user', 'keyId'].includes(key)) && label(253)(value.host) && /^[a-z_][a-z0-9_-]{0,31}$/.test(value.user) && optional(int(1, 65535))(value.port) && optional(item => typeof item === 'string' && /^key-[a-f0-9-]{36}$/.test(item))(value.keyId);
  const server = {serverId: id};
  return {
    targets: {}, servers: {}, chooseSshKey: {},
    flavorVersions: {flavor: value => typeof value === 'string' && /^[a-z]{3,12}$/.test(value)},
    createServer: {target: value => ['local-process','local-container','ssh-process','ssh-container'].includes(value), flavor: value => typeof value === 'string' && /^[a-z]{3,12}$/.test(value), version: value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/.test(value), name: optional(label(80)), port: optional(int(1024, 65535)), memoryMb: optional(int(512, 32768)), containerMode: optional(value => ['itzg', 'jar'].includes(value)), ssh: optional(ssh)},
    cancelServer: server, acceptServerLicense: server, startServer: server, stopServer: server, restartServer: server, serverStatus: server, serverSettings: server, listExtensions: server,
    serverLogs: {...server, lines: optional(int(1, 500))},
    changeServerSetting: {...server, key: value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value), value: value => typeof value === 'boolean' || Number.isSafeInteger(value) || label(256, 0)(value)},
    searchExtensions: {...server, query: label(64, 0)},
    installExtension: {...server, source: value => ['modrinth', 'file'].includes(value), project: optional(value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(value)), version: optional(value => typeof value === 'string' && /^[A-Za-z0-9]{6,16}$/.test(value))},
  };
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const WORKFLOW_DESKTOP_ACTIONS = Object.freeze(['owners','accountState','signInAccount','refreshAccount','setActiveAccount','signOutAccount','preparePublication','publishPublication','cancelPublication','browserProposals','prepareCapturedDownload','cancelBrowserProposal']);
export function validateWorkflowAdmission(action, {locked,lockVerified,quitPending,shuttingDown,updateInstallLease} = {}) {
  if (!WORKFLOW_DESKTOP_ACTIONS.includes(action)) return;
  if (locked !== false || lockVerified === false) throw new Error('Unlock the drive before using account and publication workflows.');
  if (quitPending || shuttingDown || updateInstallLease) throw new Error('The application is not accepting new workflows.');
}
function validateDesktopWorkflow(action, payload) {
  const login=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value);
  const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
  const name=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value)&&!value.toLowerCase().endsWith('.git');
  const repository=value=>typeof value==='string'&&value.length<=140&&value.split('/').length===2&&login(value.split('/')[0])&&name(value.split('/')[1]);
  const identity={sourceKind:value=>['gh-keyring','protected-product'].includes(value),credentialRevision:value=>value===null||uuid(value)};
  const schemas={owners:{accountId:login,...identity},accountState:{},signInAccount:{},refreshAccount:{accountId:login,...identity},setActiveAccount:{accountId:login,...identity},signOutAccount:{accountId:login,...identity},cancelPublication:{},browserProposals:{},prepareCapturedDownload:{id:uuid},cancelBrowserProposal:{id:uuid},publishPublication:{id:uuid,confirmation:repository,...identity},preparePublication:{documentId:uuid,accountId:login,...identity,ownerId:login,name,visibility:value=>['public','private'].includes(value),route:value=>['copy-push','fork'].includes(value),upstream:value=>value===undefined||repository(value)}};
  const schema=schemas[action],prototype=Object.getPrototypeOf(payload);
  if ((prototype!==Object.prototype&&prototype!==null)||Reflect.ownKeys(payload).some(key=>typeof key!=='string'||!Object.hasOwn(schema,key))||Object.entries(schema).some(([key,valid])=>!valid(payload[key]))||(action==='preparePublication'&&payload.route==='fork'&&!payload.upstream)||Object.hasOwn(schema,'sourceKind')&&(payload.sourceKind==='gh-keyring'&&payload.credentialRevision!==null||payload.sourceKind==='protected-product'&&!uuid(payload.credentialRevision))) throw new Error('Unsupported account or publication payload.');
}
export function validateFeatureRequest(feature, action, payload, { browser = false } = {}) {
  const actions = {
    ...(!browser?{surprise:['resolvePublishedDish']}:{}),
    converter: ['catalog','inspect','enqueue','list','control','pickSources','pickDestination','pickDestinationDirectory'],
    workflow: ['documents','pickDocument','pickProject','readDocument','saveDocument','createDocument','templates','editors','pickEditor','openEditor','openInCode','editorDownload','downloads','prepareDownload','startDownload','cancelDownload','accounts','prepareHandoff','exportHandoff','openHandoff',...(!browser?WORKFLOW_DESKTOP_ACTIONS:[])],
    updates: ['status','check','download',...(!browser?['install']:[])],
    ollama: [...(!browser?['configureRuntime','runtimeInstall','runtimeInstallCancel','runtimeStop']:[]),'status','catalog','refreshCatalog','models','show','deleteModel','copyModel','generate','hardware','cart','addToCart','removeFromCart','retryPull','startPulls','cancel','sessions','session','renameSession','deleteSession','exportSession','chat','profiles','preflight','launch','snapshots','restore','events','runtimeInstallStatus','runtimeStart','chooseRuntimeExecutable','registerProfile'],
    documentation: ['catalog','changelog'], status: ['status'],
    ...(!browser?{'browser-pairing':['issue','clear']}:{}),
    personalization: [...(!browser?['accessibilityState']:[]),'sharedRead','sharedWrite','verifySharedCredential','setSharedCredential','fetchScheduleSource','listFonts',...(!browser?['setScheduleCredential','clearScheduleCredential','normalizeImage','fontMetadata','cancelFontMetadata']:[])],
    ...(!browser ? { 'server-manager': ['snapshot','refreshCatalogue','versions','resolveVersion','prepare','cancel','reviewLicense','capabilities','acceptLicense','start','status','stop','runtimeCandidate','prepareRuntime','runtimeStatus','cancelRuntime',...MANAGED_SERVER_ACTIONS] } : {}),
    ...(!browser ? { access: ['credentialGet','credentialSet','credentialDelete','credentialList','openDataFolder','dataFolder',...ACCESS_HOST_ACTIONS] } : {}),
  };
  const limit=!browser&&feature==='personalization'&&action==='normalizeImage'?Math.ceil(4*1024*1024*4/3)+256:262144;
  if (!actions[feature]?.includes(action) || !object(payload)) throw new Error('Unsupported feature request.');
  if(feature==='ollama'&&['runtimeInstall','runtimeStart','runtimeStop'].includes(action)){if(Reflect.ownKeys(payload).some(key=>!['confirmed','language'].includes(key))||typeof payload.confirmed!=='boolean'||payload.language!==undefined&&!['en','yue','bilingual'].includes(payload.language))throw new Error('Unsupported runtime action payload.');}
  if(feature==='access'&&ACCESS_HOST_ACTIONS.includes(action)){
    const inspect=(value,depth=0)=>{if(depth>12)throw Error('Access payload is too deeply nested.');if(value&&typeof value==='object'){const array=Array.isArray(value),keys=Reflect.ownKeys(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype)||keys.some(key=>typeof key!=='string'||['__proto__','prototype','constructor'].includes(key)||array&&key!=='length'&&!/^(?:0|[1-9][0-9]*)$/.test(key)))throw Error('Unsupported access payload.');if(array){if(value.length>128||keys.length!==value.length+1)throw Error('Unsupported access array.');for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index))throw Error('Unsupported access array.');}for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!Object.hasOwn(descriptor,'value'))throw Error('Unsupported access accessor.');if(!array||key!=='length')inspect(descriptor.value,depth+1);}}};
    inspect(payload);validateAccessHostRequest(action,payload);
  }
  if(Buffer.byteLength(JSON.stringify(payload))>limit)throw new Error('Unsupported feature request.');
  if ((feature==='surprise'||feature==='personalization'&&action==='accessibilityState') && (Object.getPrototypeOf(payload)!==Object.prototype&&Object.getPrototypeOf(payload)!==null||Reflect.ownKeys(payload).length!==0)) throw new Error('This read-only request accepts no payload.');
  if (feature === 'workflow' && WORKFLOW_DESKTOP_ACTIONS.includes(action)) validateDesktopWorkflow(action,payload);
  if (feature === 'server-manager') {
    const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
    const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const schemas = {
      snapshot: {}, refreshCatalogue: {}, capabilities: {},
      versions: { catalogueId: hash, cursor: value => value === undefined || typeof value === 'string' && /^\d{1,5}$/.test(value) },
      resolveVersion: { catalogueId: hash, versionId: value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value) },
      prepare: { selectionId: uuid }, cancel: { operationId: uuid },
      reviewLicense: { serverId: value => typeof value === 'string' && value.startsWith('server-') && uuid(value.slice(7)) },
      ...Object.fromEntries(['acceptLicense','start','status','stop','runtimeCandidate','prepareRuntime','runtimeStatus'].map(action=>[action,{serverId:value=>typeof value==='string'&&value.startsWith('server-')&&uuid(value.slice(7))}])),
      cancelRuntime:{operationId:uuid},
      ...managedServerSchemas(),
    };
    const schema = schemas[action];
    const prototype = Object.getPrototypeOf(payload);
    if (prototype !== Object.prototype && prototype !== null || Reflect.ownKeys(payload).some(key => typeof key !== 'string' || !Object.hasOwn(schema, key)) || Object.entries(schema).some(([key, valid]) => !valid(payload[key]))) throw new Error('Unsupported server preparation payload.');
  }
  return { feature, action, payload };
}
export function validateRequest(method, value = {}) {
  if (!object(value)) throw new Error('Invalid request.');
  if (method === 'configureRegistryStorage') {
    if (Object.keys(value).length !== 2 || typeof value.repository !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,38}\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/.test(value.repository) || value.repository.length > 220) throw Error('Invalid registry destination.');
    return { repository: value.repository, schedule: validateRegistrySchedule(value.schedule) };
  }
  if (method === 'featureRequest') {
    if (Object.keys(value).length !== 3) throw new Error('Unsupported feature request.');
    return validateFeatureRequest(value.feature, value.action, value.payload, { browser: true });
  }
  const schemas = {
    registryStorageStatus: {}, syncRegistryStorage: {}, listRegistrySnapshots: {}, restoreRegistrySnapshot: { digest: 'digest' }, cancelRegistryStorage: {},
    vaultImageStatus: {}, prepareVaultImage: { reference: 'short' }, buildVaultImage: { previewId: 'session' }, uploadVaultImage: { previewId: 'session' }, discardVaultImage: {}, cancelVaultImage: {},
    addSession: {}, selectSession: { sessionId: 'session' }, removeSession: { sessionId: 'session' }, getState: {}, buildMetadata: {}, browserPairing: {}, mount: { driveLetter: 'drive?', driveName: 'driveName?' }, unmount: {}, chooseFiles: {}, chooseExport: { name: 'path' }, chooseExportFolder: {}, importSelected: { paths: 'paths' }, startImport: { paths: 'paths' }, operations: {}, storageDiagnostics: {}, startPacking: { path: 'relative?', partSizeBytes: 'size?' }, cancelOperation: { operationId: 'path' }, forceLock: { language: 'language?' }, quit: {}, listFiles: { cursor: 'nonnegative?', limit: 'page?', revision: 'nonnegative?' }, listVersionLabels: { entryId: 'path' }, listActivity: { entryId: 'path?', cursor: 'path?', limit: 'page?', action: 'short?', from: 'short?', to: 'short?', fromUtc:'short?',toUtc:'short?',pattern:'short?' }, previewVersion: { versionId: 'path' }, labelVersion: { versionId: 'path', label: 'short' }, exportVersion: { versionId: 'path' }, exportText: { name: 'filename', mime: 'mime', content: 'text' }, fileAction: { id: 'path', action: 'fileAction', destination: 'path?' }, resplitAll: {}, createVault: { storageDir: 'path', cacheDir: 'path', driveLetter: 'drive', password: 'password?', keyFilePath: 'path?', partSizeBytes: 'size', transport: 'transport?', remoteRepository: 'repository?', autoUnlock: 'boolean?', driveName: 'driveName?' },
    unlockVault: { storageDir: 'path', cacheDir: 'path', driveLetter: 'drive', driveName: 'driveName?',password: 'password?', keyFilePath: 'path?', transport: 'transport?', remoteRepository: 'repository?', autoUnlock: 'boolean?' },
    lockVault: {}, selectFolder: { kind: 'kind' }, selectKeyFile: {}, createKeyFile: { storageDir: 'path?', cacheDir: 'path?' },
    importFiles: {}, openExplorer: {}, openFile: { path: 'relative' }, exportFile: { path: 'relative' },
    keepOffline: { path: 'relative' }, releaseOffline: { path: 'relative' }, setPartSize: { partSizeBytes: 'size' },
    resplit: { path: 'relative', partSizeBytes: 'size?' }, sync: {}, listVersions: { entryId: 'path?', retentionDays: 'days?' }, saveVersion: { path: 'relative?' }, restoreVersion: { versionId: 'path' }, listDeleted: {}, restoreDeleted: { ids: 'ids' }, emptyRecycleBin: {}, setPreferences: { historyRetentionDays: 'days?', startup: 'boolean?', autoUnlock: 'boolean?', driveLetter: 'drive?', performanceMode: 'performance?' },
    windowControl: { action: 'window' }, openExternal: { url: 'url' }, installDriver: {}, importVocabulary: {},
  };
  schemas.upgradeVault = schemas.createVault;
  if (typeof method !== 'string' || !Object.hasOwn(schemas, method)) throw new Error('Unsupported request.');
  const schema = schemas[method];
  if (!schema || Object.keys(value).some(key => !Object.hasOwn(schema, key))) throw new Error('Unsupported request.');
  for (const [key, specification] of Object.entries(schema)) {
    const optional = specification.endsWith('?'); const type = specification.replace('?', ''); const item = value[key];
    if ((item === undefined || item === null) && optional) continue;
    let valid = false;
    if (type === 'digest') valid = typeof item === 'string' && /^sha256:[a-f0-9]{64}$/.test(item);
    else if (type === 'language') valid = ['en','yue','bilingual'].includes(item);
    else if (type === 'days') valid = item === null || Number.isSafeInteger(item) && item >= 1 && item <= 36500;
    else if (type === 'nonnegative') valid = Number.isSafeInteger(item) && item >= 0;
    else if (type === 'page') valid = Number.isSafeInteger(item) && item >= 1 && item <= 1000;
    else if (type === 'short') valid = typeof item === 'string' && [...item].length <= 256 && !item.includes('\0');
    else if (type === 'filename') valid = typeof item === 'string' && /^[^\\/:*?"<>|\x00-\x1f]{1,160}$/.test(item) && item !== '.' && item !== '..';
    else if (type === 'mime') valid = ['application/json','text/plain','text/markdown','text/csv','text/html'].includes(item);
    else if (type === 'text') valid = typeof item === 'string' && Buffer.byteLength(item, 'utf8') <= 8 * 1024 * 1024;
    else if (type === 'transport') valid = ['folder','privateGit'].includes(item);
    else if (type === 'repository') valid = typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(item) && !item.endsWith('/.') && !item.endsWith('/..');
    else if (type === 'ids') valid = Array.isArray(item) && item.length > 0 && item.length <= 1000 && new Set(item).size === item.length && item.every(id => typeof id === 'string' && id.length > 0 && id.length <= 32767 && !id.includes('\0'));
    else if (type === 'paths') valid = Array.isArray(item) && item.length <= 1000 && item.every(file => typeof file === 'string' && file.length > 0 && file.length < 32768 && !file.includes('\0'));
    else if (type === 'fileAction') valid = ['open', 'export', 'keepOffline', 'releaseOffline', 'delete'].includes(item);
    else if (type === 'boolean') valid = typeof item === 'boolean';
    else if (type === 'session') valid = typeof item === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(item);
    else if (type === 'performance') valid = ['responsive','throughput'].includes(item);
    else if (type === 'size') valid = Number.isSafeInteger(item) && item >= 1024 && item <= 90000000;
    else if (type === 'drive') valid = typeof item === 'string' && /^[D-Z]:?$/i.test(item);
    else if (type === 'driveName') valid = normalizeDriveName(item) !== null;
    else if (type === 'kind') valid = ['storage', 'cache'].includes(item);
    else if (type === 'window') valid = ['minimize', 'maximize', 'close'].includes(item);
    else if (type === 'url') valid = ['https://github.com/Ding-Ding-Projects/material-file-encryptor', 'https://winfsp.dev/', 'https://ding-ding-projects.github.io/material-file-encryptor/'].includes(item);
    else if (typeof item === 'string' && !item.includes('\0')) {
      if (type === 'password') valid = item.length > 0 && item.length <= 4096;
      if (type === 'path') valid = item.length > 0 && item.length <= 32767;
      if (type === 'relative') valid = item.length > 0 && item.length <= 32767 && !/^[\\/]|:/.test(item) && item.split(/[\\/]/).every(part => part && part !== '.' && part !== '..');
    }
    if (!valid) throw new Error(`Invalid ${key}.`);
  }
  if (['createVault', 'unlockVault', 'upgradeVault'].includes(method) && Boolean(value.password) === Boolean(value.keyFilePath)) throw new Error('Choose either a password or a key file.');
  if (['createVault','unlockVault','upgradeVault'].includes(method) && value.transport === 'privateGit' && !value.remoteRepository) throw new Error('Enter the private repository as owner/repository.');
  const normalized = { ...value };
  if (value.driveLetter !== undefined) normalized.driveLetter = value.driveLetter[0].toUpperCase() + ':';
  if (value.driveName === undefined || value.driveName === null) delete normalized.driveName;
  else normalized.driveName = normalizeDriveName(value.driveName);
  return normalized;
}
export function trustedFrame(event, window, rendererURL) {
  return Boolean(window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === rendererURL);
}
