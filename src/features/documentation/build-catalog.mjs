import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDocumentationCatalog } from './catalog.mjs';
export async function writeDocumentationCatalog(root, destination) {
  const catalog = await buildDocumentationCatalog(root);
  await writeFile(destination, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  return catalog.documents.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [root, destination] = process.argv.slice(2);
  if (!root || !destination) throw new Error('Usage: node build-catalog.mjs <repository-root> <output.json>');
  console.log(`Bundled ${await writeDocumentationCatalog(root, destination)} documents.`);
}
