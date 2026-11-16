import {control} from '../../../shared/surface/controls.js';
import {createScopedSearch} from '../../scoped-search.js';
import {createCollapsibleSection} from '../../../shared/surface/collapsible-section.js';
import {categories, searchDishes, dishName, dishDescription, readFavourites, toggleFavourite} from '../../../features/dimsum/catalogue.mjs';

const PAGE = 50;

/**
 * The dim sum catalogue. Nothing is requested until the person presses Load; search, category and the personal list
 * run locally; illustrations are fetched one at a time and only when asked for. `request(action, payload)` reaches
 * the main process, `getLanguage()` returns en, yue or bilingual.
 */
export function mountDimsum(host, {translate = value => value, getLanguage = () => 'en', request, storage = globalThis.localStorage} = {}) {
  host.replaceChildren();
  let disposed = false, catalogue = null, photos = new Map(), selected = null, limit = PAGE, mineOnly = false, loadToken = 0, renderToken = 0;
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, handler, kind = 'md-outlined-button') => { const node = control('button', {type: 'button'}); node.textContent = text; node.addEventListener('click', handler); return node; };

  const title = el('h2', translate('Dim sum catalogue'));
  const intro = el('p', translate('The catalogue is loaded from GitHub only when you press Load. Nothing else in the app needs the network for it. Pictures are generated illustrations, not photographs of real dishes.'));
  const actions = el('div', undefined, 'dimsum-actions');
  const load = button(translate('Load the catalogue'), () => void loadCatalogue(false));
  const refresh = button(translate('Refresh the catalogue'), () => void loadCatalogue(true));
  refresh.disabled = true;
  actions.append(load, refresh);
  const status = el('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const browser = el('div', undefined, 'dimsum-browser'); browser.hidden = true;

  const searchHost = el('div');
  const category = control('select'); category.label = translate('Category'); category.setAttribute('aria-label', translate('Category'));
  const mine = button(translate('Show my list'), () => { mineOnly = !mineOnly; limit = PAGE; void render(); });
  mine.setAttribute('aria-pressed', 'false');
  const filterRow = el('div', undefined, 'dimsum-filters'); filterRow.append(category, mine);
  const filters = createCollapsibleSection({doc: document, id: 'desktop-dimsum-filters', title: translate('Search and filters'), storage, open: true, children: [searchHost, filterRow]});
  const count = el('p'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const list = el('ul', undefined, 'dimsum-list'); list.setAttribute('aria-label', translate('Dim sum catalogue'));
  const more = button(translate('Show more dishes'), () => { limit += PAGE; void render(); }); more.hidden = true;
  const detail = el('section', undefined, 'dimsum-detail'); detail.tabIndex = -1;
  const layout = el('div', undefined, 'dimsum-layout');
  const results = el('div'); results.append(count, list, more);
  layout.append(results, detail);
  browser.append(filters.root, layout);
  host.append(title, intro, actions, status, browser);

  const search = createScopedSearch(searchHost, translate, () => void render());
  category.addEventListener('change', () => { limit = PAGE; void render(); });

  async function loadCatalogue(force) {
    const token = ++loadToken;
    load.disabled = true; refresh.disabled = true;
    status.textContent = translate('Loading the catalogue from GitHub…');
    try {
      const result = await request('catalogue', force ? {force: true} : {});
      if (disposed || token !== loadToken) return;
      catalogue = result.catalog; photos = new Map(result.photoFiles || []); limit = PAGE;
      const where = result.cached ? `${translate('from the copy kept on')} ${result.fetchedAt.slice(0, 16).replace('T', ' ')} UTC` : translate('from GitHub');
      status.textContent = result.refreshError ? translate('The refresh failed, so the earlier copy is shown.') : result.photosAvailable ? `${catalogue.total} ${translate('dishes loaded')} ${where}.` : translate('Illustrations are unavailable right now; dish details still work.');
      browser.hidden = false; refresh.disabled = false;
      const current = category.value || '';
      category.replaceChildren(...['', ...categories(catalogue.dishes)].map(value => { const option = control('option'); option.value = value; option.textContent = value ? value.replace(/-/g, ' ') : translate('All categories'); return option; }));
      category.value = current;
      await render();
    } catch {
      if (disposed || token !== loadToken) return;
      status.textContent = translate('The catalogue could not be loaded. Check the connection and try again; nothing else in the app needs the network.');
      refresh.disabled = !catalogue;
    } finally { if (!disposed && token === loadToken) load.disabled = false; }
  }

  async function render() {
    if (!catalogue || disposed) return;
    const token = ++renderToken;
    const favourites = readFavourites(storage);
    const language = getLanguage();
    mine.setAttribute('aria-pressed', String(mineOnly));
    mine.textContent = translate(mineOnly ? 'Show all dishes' : 'Show my list');
    const byCategory = searchDishes(catalogue.dishes, {category: category.value, only: mineOnly ? favourites : null});
    const rows = byCategory.map(dish => ({...dish, path: [dish.name.en, dish.name.zhHant, dish.jyutping, dish.slug, dish.subcategory].join(' ')}));
    const result = await search.filterWithOutcome(rows);
    if (disposed || token !== renderToken || result.outcome === 'superseded') return;
    const found = result.rows, shown = found.slice(0, limit);
    filters.setActive(found.length < catalogue.total ? `${translate('Search and filters')}: ${found.length} ${translate('of')} ${catalogue.total}` : '');
    count.textContent = `${found.length} ${translate('of')} ${catalogue.total} ${translate('dishes')}`;
    more.hidden = found.length <= limit;
    list.replaceChildren(...shown.map(dish => {
      const item = el('li'); const choose = button(`${dishName(dish, language)}${favourites.has(dish.id) ? ' ★' : ''}`, () => { selected = dish.id; void render(); detail.focus(); });
      if (dish.id === selected) choose.setAttribute('aria-current', 'true');
      item.append(choose); return item;
    }));
    renderDetail(favourites, language);
  }

  function renderDetail(favourites, language) {
    detail.replaceChildren();
    const dish = catalogue?.dishes.find(item => item.id === selected);
    if (!dish) { detail.append(el('p', translate('Choose a dish to see its description and illustration.'))); return; }
    detail.append(el('h3', dishName(dish, language)), el('p', [dish.jyutping, dish.category.replace(/-/g, ' '), dish.subcategory].filter(Boolean).join(' · ')), el('p', dishDescription(dish, language)));
    for (const [label, values] of [['Ingredients', dish.ingredients], ['Allergens', dish.allergens], ['Dietary notes', dish.dietaryTags]]) if (values.length) detail.append(el('p', `${translate(label)}: ${values.join(', ')}`));
    const toggle = button(translate(favourites.has(dish.id) ? 'Remove from my list' : 'Add to my list'), () => {
      const outcome = toggleFavourite(storage, dish.id);
      if (outcome.error) status.textContent = translate(outcome.error === 'full' ? 'Your list holds 200 dishes; remove one first.' : 'Your list could not be saved on this device.');
      void render();
    });
    detail.append(toggle);
    const figure = el('figure', undefined, 'dimsum-figure'); detail.append(figure);
    if (!dish.imageFile || !photos.has(dish.imageFile)) { figure.append(el('p', translate('No illustration has been published for this dish yet.'))); return; }
    const show = button(translate('Show the illustration'), async () => {
      show.disabled = true; figure.replaceChildren(el('p', translate('Loading the illustration…')));
      try {
        const result = await request('photo', {file: dish.imageFile});
        if (disposed || selected !== dish.id) return;
        const image = document.createElement('img'); image.src = result.dataUrl; image.alt = language === 'yue' ? (dish.alt.yue || dish.alt.en) : (dish.alt.en || dishName(dish, language));
        figure.replaceChildren(image, el('figcaption', translate('Generated illustration from the public dim sum catalogue, not a photograph of a real dish.')));
      } catch { if (!disposed) figure.replaceChildren(el('p', translate('The illustration could not be loaded.'))); }
    });
    figure.append(show);
  }

  status.textContent = translate('The catalogue has not been loaded in this session.');
  return {
    refresh: () => render(), load: () => loadCatalogue(false),
    destroy() { disposed = true; loadToken++; renderToken++; search.destroy?.(); filters.destroy(); host.replaceChildren(); }
  };
}
