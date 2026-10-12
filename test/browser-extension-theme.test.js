import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
test('forced light palette is not overwritten by the host dark media rule',async()=>{const css=await fs.readFile(new URL('../browser-extension/popup.css',import.meta.url),'utf8');assert.match(css,/@media\(prefers-color-scheme:dark\)\{:root:not\(\[data-theme=light\]\)/);});
