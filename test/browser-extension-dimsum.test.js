import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseCatalog, photoMap, categories, searchDishes, readFavourites, toggleFavourite, favouritesKey} from '../browser-extension/dimsum.js';

const dish = (n, extra = {}) => ({id: `hk-dish-000${n}`, slug: `dish-${n}`, name: {en: `Dish ${n}`, zhHant: `點心${n}`}, jyutping: `dim2 sam1 ${n}`, category: n % 2 ? 'steamed-dim-sum' : 'fried-dim-sum', description: {en: 'English', yue: '廣東話'}, ingredients: ['shrimp'], allergens: ['shellfish'], image: {path: `images/hk-dish-000${n}-dish-${n}.png`, alt: {en: 'Alt', yue: '替代'}}, ...extra});

test('the catalogue keeps only well-formed dishes and bounded fields', () => {
  const catalog = normaliseCatalog({title: 'Catalog', catalogStatus: 'in-progress', dishes: [dish(1), {id: 'bad', name: {en: 'x'}}, dish(2, {image: {path: '../../etc/passwd'}}), 'junk']});
  assert.equal(catalog.total, 2);
  assert.equal(catalog.dishes[0].imageFile, 'hk-dish-0001-dish-1.png');
  assert.equal(catalog.dishes[1].imageFile, '');
  assert.equal(normaliseCatalog({dishes: 'nope'}), null);
  assert.deepEqual(categories(catalog.dishes), ['fried-dim-sum', 'steamed-dim-sum']);
});

test('illustrations come only from normal catalog releases with exact download addresses', () => {
  const asset = (name, tag, extra = {}) => ({name, state: 'uploaded', size: 10, browser_download_url: `https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/${tag}/${name}`, ...extra});
  const map = photoMap([
    {tag_name: 'catalog-v1', draft: false, prerelease: false, assets: [asset('hk-dish-0001-dish-1.png', 'catalog-v1'), asset('hk-dish-0002-dish-2.png', 'catalog-v1', {browser_download_url: 'https://evil.example/x.png'})]},
    {tag_name: 'catalog-v1-part-002', draft: true, prerelease: false, assets: [asset('hk-dish-0003-dish-3.png', 'catalog-v1-part-002')]},
    {tag_name: 'desktop-67', draft: false, prerelease: false, assets: [asset('hk-dish-0004-dish-4.png', 'desktop-67')]},
  ]);
  assert.deepEqual([...map.keys()], ['hk-dish-0001-dish-1.png']);
  assert.equal(map.get('hk-dish-0001-dish-1.png').release, 'catalog-v1');
});

test('search covers English, Chinese, Jyutping and category, and my list is bounded and saved', () => {
  const {dishes} = normaliseCatalog({dishes: [dish(1), dish(2), dish(3)]});
  assert.deepEqual(searchDishes(dishes, {query: '點心2'}).map(d => d.id), ['hk-dish-0002']);
  assert.deepEqual(searchDishes(dishes, {query: 'sam1 3'}).map(d => d.id), ['hk-dish-0003']);
  assert.deepEqual(searchDishes(dishes, {category: 'fried-dim-sum'}).map(d => d.id), ['hk-dish-0002']);
  const values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  toggleFavourite(storage, 'hk-dish-0001');
  assert.deepEqual([...readFavourites(storage)], ['hk-dish-0001']);
  assert.deepEqual(searchDishes(dishes, {only: readFavourites(storage)}).map(d => d.id), ['hk-dish-0001']);
  toggleFavourite(storage, 'hk-dish-0001');
  assert.equal(readFavourites(storage).size, 0);
  values.set(favouritesKey, JSON.stringify(['../x', 'hk-dish-0002']));
  assert.deepEqual([...readFavourites(storage)], ['hk-dish-0002']);
});
