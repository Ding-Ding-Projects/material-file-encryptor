import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { writeDocumentationCatalog } from '../src/features/documentation/build-catalog.mjs';
const root=process.cwd();
const manifest=JSON.parse(await fs.readFile('package.json','utf8'));
let sourceCommit=null;
try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
await fs.writeFile('src/shared/build-metadata.json',JSON.stringify({version:manifest.version,builtAt:new Date().toISOString(),sourceCommit})+'\n');
await writeDocumentationCatalog(root,'src/shared/documentation-catalog.json');
try{execFileSync(process.execPath,['scripts/build-surface-vendor.mjs'],{cwd:root,stdio:'inherit'});}catch(error){process.exit(Number.isInteger(error.status)&&error.status>0?error.status:1);}

const {stageBrowserExtension}=await import('./build-browser-extension.mjs');
await stageBrowserExtension({root});
