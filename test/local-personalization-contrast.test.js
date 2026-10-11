import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contrastRatio} from '../src/renderer/features/personalization/color.js';
test('selected personalization tabs and attention status use paired readable theme colors',async()=>{
 const css=await readFile(new URL('../src/renderer/features/personalization/personalization.css',import.meta.url),'utf8');
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 const pairs=rules.filter(([,selector,body])=>selector.includes('.local-ux-attention-status')&&body.includes('--local-ux-selected-container:'));
 assert.equal(pairs.length,2);
 for(const [,selector,body]of pairs){const background=/--local-ux-selected-container:(#[a-f0-9]{6})/.exec(body)?.[1],foreground=/--local-ux-on-selected-container:(#[a-f0-9]{6})/.exec(body)?.[1];assert.ok(background&&foreground);assert.ok(contrastRatio(foreground,background)>=4.5,selector);}
 for(const selector of ['.local-ux [role=tab][aria-selected=true]','.local-ux-attention-status']){const body=rules.find(([,s,b])=>s.trim()===selector&&b.includes('background:'))?.[2];assert.match(body,/background:var\(--local-ux-selected-container\)/);assert.match(body,/color:var\(--local-ux-on-selected-container\)/);}
});
