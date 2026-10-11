import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Rebuild the checked-in local browser bundle after changing the pinned dependency.
const metadata=JSON.parse(readFileSync(new URL('../node_modules/@material/web/package.json',import.meta.url)));
if(metadata.version!=='2.5.0')throw new Error('Expected @material/web 2.5.0');
const args=['exec','--yes','--package=esbuild@0.25.11','--','esbuild','src/shared/surface/material-entry.js','--bundle','--format=esm','--minify','--legal-comments=inline','--outfile=src/shared/surface/material.js'];
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{stdio:'inherit',shell:process.platform==='win32'});
process.exit(result.status??1);
