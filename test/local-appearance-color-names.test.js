import test from 'node:test';
import assert from 'node:assert/strict';
import {CSS_NAMED_COLORS,parseColorEntry,colorRepresentations,parseColor} from '../src/renderer/features/personalization/color.js';

test('complete CSS named-color table includes transparent and all standard aliases',()=>{
 assert.equal(Object.keys(CSS_NAMED_COLORS).length,149);assert.ok(Object.isFrozen(CSS_NAMED_COLORS));
 assert.equal(CSS_NAMED_COLORS.aliceblue,'#f0f8ffff');assert.equal(CSS_NAMED_COLORS.rebeccapurple,'#663399ff');assert.equal(CSS_NAMED_COLORS.transparent,'#00000000');
 for(const [a,b]of [['aqua','cyan'],['fuchsia','magenta'],['gray','grey'],['darkgray','darkgrey'],['dimgray','dimgrey'],['lightgray','lightgrey'],['lightslategray','lightslategrey'],['slategray','slategrey'],['darkslategray','darkslategrey']])assert.equal(CSS_NAMED_COLORS[a],CSS_NAMED_COLORS[b]);
 for(const [name,hex]of Object.entries(CSS_NAMED_COLORS)){assert.equal(parseColorEntry(name.toUpperCase()),hex);assert.equal(parseColorEntry(` ${name} `),hex);assert.ok(colorRepresentations(hex).names.includes(name));assert.deepEqual(parseColor(parseColorEntry(name)),parseColor(hex));}
});
test('reverse translation reports every exact alias and respects alpha',()=>{
 assert.deepEqual(colorRepresentations('#00ffffff').names,['aqua','cyan']);assert.deepEqual(colorRepresentations('#808080').names,['gray','grey']);assert.equal(colorRepresentations('RebeccaPurple').name,'rebeccapurple');
 assert.deepEqual(colorRepresentations('#00000000').names,['transparent']);assert.deepEqual(colorRepresentations('#00000080').names,[]);assert.equal(colorRepresentations('#010203').name,null);
 assert.throws(()=>parseColorEntry('currentcolor'));assert.throws(()=>parseColorEntry('__proto__'));assert.throws(()=>parseColorEntry('constructor'));assert.throws(()=>parseColorEntry('not-a-color'));
 assert.equal(parseColorEntry('rgba(255,0,0,.5)'),'#ff000080');assert.throws(()=>parseColorEntry('oklab(1 2 2)'));
});
