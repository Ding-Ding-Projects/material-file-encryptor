// The public catalogue of dim sum and Hong Kong dishes. It is loaded from GitHub only when the person asks, searched
// locally, and its illustrations are published release assets: generated pictures, never photographs. These pure
// functions keep only well-formed dishes and the fields the interface shows; anything else in the file is ignored.

export const CATALOG_URL = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
export const RELEASES_URL = 'https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100';
export const DOWNLOAD_PREFIX = 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/';
export const FAVOURITES_KEY = 'mfe-desktop-dimsum-favourites-v1';
export const MAX_FAVOURITES = 200;
export const PHOTO_FILE = /^hk-dish-\d{4}-[a-z0-9-]+\.png$/;

const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const list = (value, limit) => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, limit).map(item => item.slice(0, 80)) : [];

export function normaliseCatalog(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.dishes)) return null;
  const dishes = [];
  for (const dish of json.dishes.slice(0, 5000)) {
    if (!dish || typeof dish.id !== 'string' || !/^hk-dish-\d{4}$/.test(dish.id) || typeof dish.name?.en !== 'string') continue;
    const file = typeof dish.image?.path === 'string' ? dish.image.path.split('/').pop() : '';
    dishes.push({
      id: dish.id, slug: text(dish.slug, 120), name: {en: text(dish.name.en, 160), zhHant: text(dish.name.zhHant, 80)}, jyutping: text(dish.jyutping, 120),
      category: text(dish.category, 60), subcategory: text(dish.subcategory, 120), description: {en: text(dish.description?.en, 1200), yue: text(dish.description?.yue, 600)},
      ingredients: list(dish.ingredients, 30), allergens: list(dish.allergens, 20), dietaryTags: list(dish.dietaryTags, 20),
      imageFile: PHOTO_FILE.test(file) ? file : '', alt: {en: text(dish.image?.alt?.en, 300), yue: text(dish.image?.alt?.yue, 200)}
    });
  }
  return {title: text(json.title, 200), status: text(json.catalogStatus, 40), total: dishes.length, dishes};
}

/** Maps illustration file names to their download addresses on normal catalogue releases only. */
export function photoMap(releases) {
  const map = new Map();
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!release || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('catalog-v1') || release.draft || release.prerelease) continue;
    for (const asset of Array.isArray(release.assets) ? release.assets : []) {
      if (asset?.state !== 'uploaded' || typeof asset.name !== 'string' || !PHOTO_FILE.test(asset.name)) continue;
      const url = String(asset.browser_download_url || '');
      if (url === `${DOWNLOAD_PREFIX}${release.tag_name}/${asset.name}` && !map.has(asset.name)) map.set(asset.name, {url, release: release.tag_name, size: Number(asset.size) || 0});
    }
  }
  return map;
}

export const categories = dishes => [...new Set(dishes.map(dish => dish.category).filter(Boolean))].sort();

/** Searches English and Chinese names, Jyutping and the short name, optionally within one category or a set of ids. */
export function searchDishes(dishes, {query = '', category = '', only = null} = {}) {
  const needle = String(query).trim().toLowerCase();
  return dishes.filter(dish => (!category || dish.category === category) && (!only || only.has(dish.id))
    && (!needle || [dish.name.en, dish.name.zhHant, dish.jyutping, dish.slug, dish.subcategory].some(value => value.toLowerCase().includes(needle))));
}

export function dishName(dish, language) {
  if (language === 'yue') return dish.name.zhHant || dish.name.en;
  if (language === 'bilingual' && dish.name.zhHant) return `${dish.name.en} · ${dish.name.zhHant}`;
  return dish.name.en;
}

export function dishDescription(dish, language) {
  if (language === 'yue') return dish.description.yue || dish.description.en;
  if (language === 'bilingual') return [dish.description.en, dish.description.yue].filter(Boolean).join(' ');
  return dish.description.en;
}

export function readFavourites(storage) {
  try { const parsed = JSON.parse(storage?.getItem(FAVOURITES_KEY) || '[]'); return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && /^hk-dish-\d{4}$/.test(id)).slice(0, MAX_FAVOURITES) : []); } catch { return new Set(); }
}

/** Flips one dish in the saved list. Returns the new set and, when it could not be saved, a reason key. */
export function toggleFavourite(storage, id) {
  const set = readFavourites(storage);
  if (set.has(id)) set.delete(id); else if (set.size < MAX_FAVOURITES) set.add(id); else return {set, error: 'full'};
  try { storage?.setItem(FAVOURITES_KEY, JSON.stringify([...set])); } catch { return {set, error: 'storage'}; }
  return {set};
}
