import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CATALOG_URL, RELEASES_URL, normaliseCatalog, photoMap, categories, searchDishes, dishName, dishDescription, readFavourites, toggleFavourite} from '../src/features/dimsum/catalogue.mjs';
import {createDimsumCatalogueService} from '../src/main/dimsum-catalogue-service.js';
import {validateFeatureRequest} from '../src/main/validation.js';
import {DIMSUM_COPY} from '../src/renderer/features/dimsum/copy.js';

const dish = (n, extra = {}) => ({id: `hk-dish-${String(n).padStart(4, '0')}`, slug: `dish-${n}`, name: {en: `Dish ${n}`, zhHant: `菜${n}`}, jyutping: `caai${n}`, category: n % 2 ? 'steamed' : 'fried', subcategory: 'x', description: {en: 'English text', yue: '廣東話文字'}, ingredients: ['rice'], allergens: ['soy'], dietaryTags: [], image: {path: `images/hk-dish-${String(n).padStart(4, '0')}-dish-${n}.png`, alt: {en: 'alt', yue: '圖'}}, ...extra});
const catalogJson = {title: 'T', catalogStatus: 'ready', dishes: [dish(1), dish(2), {id: 'bad', name: {en: 'x'}}, dish(3)]};
const releases = [{tag_name: 'catalog-v1.0', draft: false, prerelease: false, assets: [{name: 'hk-dish-0001-dish-1.png', state: 'uploaded', size: 40, browser_download_url: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.0/hk-dish-0001-dish-1.png'}, {name: 'hk-dish-0002-dish-2.png', state: 'uploaded', size: 40, browser_download_url: 'https://evil.example/hk-dish-0002-dish-2.png'}]}, {tag_name: 'catalog-v1.1', prerelease: true, assets: [{name: 'hk-dish-0003-dish-3.png', state: 'uploaded', browser_download_url: 'x'}]}];
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(40)]);

function fakeFetch(log = []) {
  return async url => {
    log.push(url);
    const reply = (body, ok = true) => ({ok, status: ok ? 200 : 500, headers: {get: () => null}, arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }});
    if (url === CATALOG_URL) return reply(catalogJson);
    if (url === RELEASES_URL) return reply(releases);
    if (url.endsWith('hk-dish-0001-dish-1.png')) return reply(png);
    return reply({}, false);
  };
}

test('the catalogue keeps only well-formed dishes and bounds every text', () => {
  const catalog = normaliseCatalog(catalogJson);
  assert.equal(catalog.total, 3);
  assert.equal(normaliseCatalog({dishes: 'no'}), null);
  assert.equal(catalog.dishes[0].imageFile, 'hk-dish-0001-dish-1.png');
  assert.deepEqual(categories(catalog.dishes), ['fried', 'steamed']);
});

test('only normal catalogue releases and exact download addresses name illustrations', () => {
  const map = photoMap(releases);
  assert.deepEqual([...map.keys()], ['hk-dish-0001-dish-1.png']);
  assert.equal(map.get('hk-dish-0001-dish-1.png').release, 'catalog-v1.0');
});

test('search reaches English, Chinese and Jyutping names, a category and the personal list', () => {
  const {dishes} = normaliseCatalog(catalogJson);
  assert.equal(searchDishes(dishes, {query: '菜2'}).length, 1);
  assert.equal(searchDishes(dishes, {query: 'CAAI3'}).length, 1);
  assert.equal(searchDishes(dishes, {category: 'steamed'}).length, 2);
  assert.equal(searchDishes(dishes, {only: new Set(['hk-dish-0002'])}).length, 1);
  assert.equal(dishName(dishes[0], 'bilingual'), 'Dish 1 · 菜1');
  assert.equal(dishName(dishes[0], 'yue'), '菜1');
  assert.equal(dishDescription(dishes[0], 'yue'), '廣東話文字');
});

test('the personal list persists, caps at 200 and survives unreadable storage', () => {
  const values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  assert.deepEqual(toggleFavourite(storage, 'hk-dish-0001').set, new Set(['hk-dish-0001']));
  assert.equal(readFavourites(storage).has('hk-dish-0001'), true);
  assert.equal(toggleFavourite(storage, 'hk-dish-0001').set.size, 0);
  for (let n = 1; n <= 200; n++) toggleFavourite(storage, `hk-dish-${String(n).padStart(4, '0')}`);
  assert.equal(toggleFavourite(storage, 'hk-dish-0999').error, 'full');
  assert.equal(readFavourites({getItem() { throw Error('blocked'); }}).size, 0);
  assert.equal(toggleFavourite({getItem: () => null, setItem() { throw Error('blocked'); }}, 'hk-dish-0001').error, 'storage');
});

test('the main-process service requests nothing until asked, caches for a day and serves one illustration at a time', async () => {
  const log = []; let now = 1_000;
  const service = createDimsumCatalogueService({fetchImpl: fakeFetch(log), now: () => now});
  assert.deepEqual(log, [], 'construction fetches nothing');
  const first = await service.catalogue();
  assert.equal(first.cached, false);
  assert.equal(first.catalog.total, 3);
  assert.deepEqual(first.photoFiles, [['hk-dish-0001-dish-1.png', 'catalog-v1.0']]);
  const requests = log.length;
  assert.equal((await service.catalogue()).cached, true);
  assert.equal(log.length, requests, 'the copy kept in memory is used');
  now += 86400001;
  assert.equal((await service.catalogue()).cached, false, 'a day later it is fetched again');
  const photo = await service.photo({file: 'hk-dish-0001-dish-1.png'});
  assert.match(photo.dataUrl, /^data:image\/png;base64,/);
  await assert.rejects(service.photo({file: 'hk-dish-0002-dish-2.png'}), /not published/);
  await assert.rejects(service.photo({file: '../etc/passwd'}), /Unsupported/);
});

test('a failed refresh keeps the earlier copy and says so, and a first failure is an error', async () => {
  let fail = false;
  const base = fakeFetch();
  const service = createDimsumCatalogueService({fetchImpl: async url => fail ? ({ok: false, status: 503, headers: {get: () => null}, arrayBuffer: async () => new ArrayBuffer(0)}) : base(url)});
  await service.catalogue();
  fail = true;
  const again = await service.catalogue({force: true});
  assert.equal(again.cached, true);
  assert.match(again.refreshError, /HTTP 503/);
  const cold = createDimsumCatalogueService({fetchImpl: async () => ({ok: false, status: 503, headers: {get: () => null}, arrayBuffer: async () => new ArrayBuffer(0)})});
  await assert.rejects(cold.catalogue(), /HTTP 503/);
});

test('an oversized illustration or a non-PNG body is refused', async () => {
  const base = fakeFetch();
  const service = createDimsumCatalogueService({fetchImpl: async url => url.endsWith('.png') ? ({ok: true, status: 200, headers: {get: () => String(9 * 1024 * 1024)}, arrayBuffer: async () => new ArrayBuffer(10)}) : base(url)});
  await service.catalogue();
  await assert.rejects(service.photo({file: 'hk-dish-0001-dish-1.png'}), /larger than allowed/);
  const notPng = createDimsumCatalogueService({fetchImpl: async url => url.endsWith('.png') ? ({ok: true, status: 200, headers: {get: () => null}, arrayBuffer: async () => Buffer.alloc(64).buffer}) : base(url)});
  await notPng.catalogue();
  await assert.rejects(notPng.photo({file: 'hk-dish-0001-dish-1.png'}), /not a PNG/);
});

test('the request validator admits only the two actions with exact payloads and never for the browser', () => {
  assert.deepEqual(validateFeatureRequest('dimsum', 'catalogue', {}).payload, {});
  assert.deepEqual(validateFeatureRequest('dimsum', 'catalogue', {force: true}).payload, {force: true});
  assert.deepEqual(validateFeatureRequest('dimsum', 'photo', {file: 'hk-dish-0001-dish-1.png'}).payload, {file: 'hk-dish-0001-dish-1.png'});
  for (const [action, payload] of [['catalogue', {force: 'yes'}], ['catalogue', {extra: 1}], ['photo', {}], ['photo', {file: 'hk-dish-0001.exe'}], ['photo', {file: '../x.png'}], ['nope', {}]]) assert.throws(() => validateFeatureRequest('dimsum', action, payload), /Unsupported/);
  assert.throws(() => validateFeatureRequest('dimsum', 'catalogue', {}, {browser: true}), /Unsupported/);
});

test('the view is wired, passive, and every visible string has a Cantonese pair', async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const [view, app, services] = await Promise.all([read('src/renderer/features/dimsum/index.js'), read('src/renderer/app.js'), read('src/main/feature-services.js')]);
  assert.match(app, /mountFeature\('dimsum'/);
  assert.match(app, /\.\.\.DIMSUM_COPY/);
  assert.match(services, /'dimsum:catalogue','dimsum:photo'/);
  const literals = [...view.matchAll(/translate\('((?:[^'\\]|\\.)*)'\)/g)].map(match => match[1].replace(/\\'/g, "'"));
  const ternaries = [...view.matchAll(/translate\([a-zA-Z.]+ \? '([^']+)' : '([^']+)'\)/g)].flatMap(match => [match[1], match[2]]);
  const nested = [...view.matchAll(/'((?:Show|Remove|Add|Your|Dietary|Ingredients|Allergens)[^']*)'/g)].map(match => match[1]);
  const missing = [...new Set([...literals, ...ternaries, ...nested])].filter(text => /^[A-Z]/.test(text) && text.length > 3 && !DIMSUM_COPY[text]);
  assert.deepEqual(missing, []);
});
