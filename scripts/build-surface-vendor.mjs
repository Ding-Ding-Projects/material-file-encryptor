import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Rebuild the checked-in local browser bundle after changing the pinned dependency.
const metadata=JSON.parse(readFileSync(new URL('../node_modules/@material/web/package.json',import.meta.url)));
if(metadata.version!=='2.5.0')throw new Error('Expected @material/web 2.5.0');
const args=['exec','--yes','--package=esbuild@0.25.11','--','esbuild','src/shared/surface/material-entry.js','--bundle','--alias:lit/directives/style-map.js=./src/shared/surface/style-map.js','--format=esm','--minify','--legal-comments=inline','--outfile=src/shared/surface/material.js'];
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{stdio:'inherit',shell:process.platform==='win32'});
if(result.status===0){
 const hash=path=>createHash('sha256').update(readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
 const banner=`// Vendor source: @material/web ${metadata.version}; esbuild 0.25.11.
// Upstream lit-html style-map normalized-LF SHA-256: ${hash('../node_modules/lit-html/directives/style-map.js')}.
// Strict-CSP CSSOM adapter normalized-LF SHA-256: ${hash('../src/shared/surface/style-map.js')}.
`;
 const output=new URL('../src/shared/surface/material.js',import.meta.url);
 // Preserve template-literal whitespace semantics without trailing source whitespace.
 const bundle=readFileSync(output,'utf8').replaceAll('\t\n','\\t\\n');
 writeFileSync(output,banner+bundle);
}
process.exit(result.status??1);
