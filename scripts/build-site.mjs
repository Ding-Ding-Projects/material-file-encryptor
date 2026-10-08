import fs from 'node:fs/promises';
await fs.mkdir('out/site/images', { recursive: true });
await fs.cp('docs/site', 'out/site', { recursive: true });
await fs.cp('docs/images', 'out/site/images', { recursive: true });
console.log('Staged GitHub Pages site in out/site.');
