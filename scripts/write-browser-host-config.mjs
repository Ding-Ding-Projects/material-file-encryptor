import fs from 'node:fs/promises';
import path from 'node:path';
import {hostConfigFromIdentity} from '../src/main/browser-host-registration.js';

// Writes the reviewed browser-host-config.json next to the published native host.
const root = process.cwd();
const output = path.resolve(root, process.argv[2] || 'out/browser-host');
const identity = JSON.parse(await fs.readFile(path.join(root, 'browser-extension/reviewed-identity.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'browser-extension/manifest.json'), 'utf8'));
const config = hostConfigFromIdentity(identity);
if (manifest.key !== identity.publicKeyDerBase64) throw new Error('The extension manifest key does not match the reviewed identity.');
await fs.mkdir(output, {recursive: true});
await fs.writeFile(path.join(output, 'browser-host-config.json'), JSON.stringify(config, null, 2) + '\n');
console.log('Wrote browser-host-config.json for extension ' + identity.extensionId + '.');
