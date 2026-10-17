import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {checkIcons,inspectIco,inspectPng} from '../scripts/desktop-icons.mjs';
import path from 'node:path';
import {desktopIconPath,brandedBrowserWindow} from '../src/main/desktop-icons.js';

test('desktop icon assets contain nine RGBA frames of the established mark',()=>{
  checkIcons();
  const ico=fs.readFileSync(new URL('../assets/branding/app.ico',import.meta.url));
  assert.throws(()=>inspectIco(fs.readFileSync(new URL('../assets/branding/app.png',import.meta.url))),/ICON_ICO_DIRECTORY/);
  const damaged=Buffer.from(ico);damaged.writeUInt32LE(1,18);
  assert.throws(()=>inspectIco(damaged),/ICON_ICO_FRAME/);
  assert.throws(()=>inspectIco(ico.subarray(0,ico.length-1)),/ICON_ICO_FRAME/);
  assert.throws(()=>inspectPng(fs.readFileSync(new URL('../assets/branding/app.png',import.meta.url)),16),/ICON_PNG_RGBA_DIMENSIONS/);
});

test('development and packaged runtime resolve native icons without the working directory',()=>{
  const options={resourcesPath:path.resolve('fixture/resources'),applicationRoot:path.resolve('fixture/source')};
  assert.equal(desktopIconPath({...options,packaged:true,platform:'win32'}),path.join(options.resourcesPath,'branding','app.ico'));
  assert.equal(desktopIconPath({...options,packaged:false,platform:'win32'}),path.join(options.applicationRoot,'assets','branding','app.ico'));
  for(const platform of ['linux','darwin'])assert.equal(desktopIconPath({...options,packaged:true,platform}),path.join(options.resourcesPath,'branding','app.png'));
});

test('owned window wrapper preserves parent, security settings and native lifecycle',()=>{
  class NativeWindow { constructor(options){this.options=options;} close(){return 'closed';} }
  const Window=brandedBrowserWindow(NativeWindow,'product.ico'), parent={},webPreferences={sandbox:true,contextIsolation:true};
  const child=new Window({parent,modal:true,show:false,webPreferences});
  assert.equal(Object.getPrototypeOf(child),NativeWindow.prototype);assert.ok(child instanceof NativeWindow);assert.equal(child.close(),'closed');
  assert.deepEqual(child.options,{parent,modal:true,show:false,webPreferences,icon:'product.ico'});
  const main=fs.readFileSync(new URL('../src/main/main.js',import.meta.url),'utf8');
  assert.match(main,/createMaterialDialogs\(\{ BrowserWindow: DesktopBrowserWindow,/);
  assert.match(main,/createProfileAuthenticationDialog\(\{BrowserWindow:DesktopBrowserWindow,/);
  assert.match(main,/new DesktopBrowserWindow\(/);
  assert.match(main,/new Tray\(desktopIcon\)/);
  assert.doesNotMatch(main,/createFromDataURL|new BrowserWindow\(/);
});

test('desktop package and Squirrel share the immutable project icon',()=>{
  const config=createRequire(import.meta.url)('../forge.config.cjs');
  assert.match(config.packagerConfig.icon??'',/assets[\\/]branding[\\/]app\.ico$/);
  assert.ok(config.packagerConfig.extraResource.some(item=>/assets[\\/]branding$/.test(item)));
  const maker=config.makers.find(item=>item.name==='@electron-forge/maker-squirrel').config;
  assert.equal(maker.setupIcon,config.packagerConfig.icon);
  assert.match(maker.iconUrl??'',/^https:\/\/raw\.githubusercontent\.com\/Ding-Ding-Projects\/material-file-encryptor\/[a-f0-9]{40}\/assets\/branding\/app\.ico$/);
});
