// The public catalogue of dim sum and Hong Kong dishes, loaded from GitHub only when the user
// asks. Catalogue images are generated illustrations published as release
// assets; a dish without a published illustration shows an honest empty state.

export const CATALOG_URL = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
export const RELEASES_URL = 'https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100';
const DOWNLOAD_PREFIX = 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/';
export const favouritesKey = 'mfe-extension-dimsum-favourites-v1';

const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const list = (value, limit) => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, limit).map(item => item.slice(0, 80)) : [];

/** Keeps only well-formed dishes and the fields the workspace shows; anything else in the file is ignored. */
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
      imageFile: /^hk-dish-\d{4}-[a-z0-9-]+\.png$/.test(file) ? file : '', alt: {en: text(dish.image?.alt?.en, 300), yue: text(dish.image?.alt?.yue, 200)},
    });
  }
  return {title: text(json.title, 200), status: text(json.catalogStatus, 40), total: dishes.length, dishes};
}

/** Maps illustration file names to their download addresses on normal catalog releases only. */
export function photoMap(releases) {
  const map = new Map();
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!release || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('catalog-v1') || release.draft || release.prerelease) continue;
    for (const asset of Array.isArray(release.assets) ? release.assets : []) {
      if (asset?.state !== 'uploaded' || typeof asset.name !== 'string' || !/^hk-dish-\d{4}-[a-z0-9-]+\.png$/.test(asset.name)) continue;
      const url = String(asset.browser_download_url || '');
      if (url === `${DOWNLOAD_PREFIX}${release.tag_name}/${asset.name}` && !map.has(asset.name)) map.set(asset.name, {url, release: release.tag_name, size: Number(asset.size) || 0});
    }
  }
  return map;
}

export function categories(dishes) { return [...new Set(dishes.map(dish => dish.category).filter(Boolean))].sort(); }

/** Searches English and Chinese names, Jyutping and the short name, optionally within one category or a set of ids. */
export function searchDishes(dishes, {query = '', category = '', only = null} = {}) {
  const needle = String(query).trim().toLowerCase();
  return dishes.filter(dish => (!category || dish.category === category) && (!only || only.has(dish.id))
    && (!needle || [dish.name.en, dish.name.zhHant, dish.jyutping, dish.slug, dish.subcategory].some(value => value.toLowerCase().includes(needle))));
}

export function readFavourites(storage) {
  try { const parsed = JSON.parse(storage?.getItem(favouritesKey) || '[]'); return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && /^hk-dish-\d{4}$/.test(id)).slice(0, 200) : []); } catch { return new Set(); }
}
export function toggleFavourite(storage, id) {
  const set = readFavourites(storage);
  if (set.has(id)) set.delete(id); else if (set.size < 200) set.add(id); else return {set, error: 'Your list holds 200 dishes; remove one first.'};
  try { storage?.setItem(favouritesKey, JSON.stringify([...set])); } catch { return {set, error: 'Your list could not be saved in this browser.'}; }
  return {set};
}
