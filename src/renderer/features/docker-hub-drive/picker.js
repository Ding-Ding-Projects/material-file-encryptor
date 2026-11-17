import { SurfaceElement, element, localized, register } from '../../../shared/surface/registry.js';
import { HUB_DRIVE_COPY } from './copy.js';
import { CHIPS, chipCounts, searchRows, visibleRepositories, plainMatcher, regexMatcher, suggestedRepository, catalogProblem, catalogBusy, repositoryProblemKey, formatBytes, formatTime, fill } from './model.js';

const POLL_MS = 700;
const STYLE = `
.stack{display:grid;gap:10px;min-width:0}
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bar mfe-search{flex:1 1 280px;min-width:0}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{--md-filter-chip-container-shape:16px}

.info{min-width:48px;min-height:48px;border:1px solid currentColor;border-radius:24px;background:transparent;color:inherit;font:700 14px/1 var(--mfe-font,system-ui);cursor:pointer}
.list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.repo{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--md-sys-color-outline-variant,#c6c8d8);border-radius:14px;background:var(--md-sys-color-surface-container-low,transparent);animation:rise 320ms cubic-bezier(.05,.7,.1,1) both}
.repo[data-selected=true]{border:2px solid var(--md-sys-color-primary,#4b57c9)}
.repo[data-error=true]{border-color:var(--md-sys-color-error,#b3261e)}
.head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.name{font-family:var(--mfe-mono,ui-monospace,monospace);font-weight:600;flex:1 1 220px;min-width:0;overflow-wrap:anywhere;background:transparent;border:0;color:inherit;text-align:start;cursor:pointer;min-height:48px;padding:0}
.badge{padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;background:var(--md-sys-color-surface-variant,#e4e6f0);color:var(--md-sys-color-on-surface-variant,#3a3c4c)}
.badge[data-vis=public]{background:var(--md-sys-color-tertiary-container,#ffe0b8);color:var(--md-sys-color-on-tertiary-container,#4a2c00)}
.badge[data-found=true]{background:var(--md-sys-color-tertiary-container,#cdefe3);color:var(--md-sys-color-on-tertiary-container,#063d31)}
.meta{color:var(--md-sys-color-on-surface-variant,#555);font-size:12px}
.err{padding:8px 10px;border-radius:8px;background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:8px}
md-list-item.card{border:2px solid var(--md-sys-color-outline-variant,#c6c8d8);border-radius:12px;min-height:48px;--md-list-item-container-shape:12px}
md-list-item.card[aria-pressed=true]{border-color:var(--md-sys-color-primary,#4b57c9);background:var(--md-sys-color-secondary-container,#f0f1ff)}
.problem{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;background:var(--md-sys-color-error-container,#ffdad6);color:var(--md-sys-color-on-error-container,#410002)}
.note{padding:10px 12px;border-radius:10px;background:var(--md-sys-color-surface-container,#f1f2f8)}
md-linear-progress{width:100%}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
:host-context([data-motion=reduced]) *,:host-context([data-low-stimulation=true]) *{animation:none!important;transition:none!important}`;

/**
 * Rich Docker Hub repository picker: search with the shared regex builder, filter chips, visibility, last pushed,
 * size, a drives found count and a card for every drive the host detected. In create mode the account's default
 * repository is proposed first; in open mode the drive cards are the choice. The host does the scanning; this
 * element only draws the snapshot it is given and never invents a drive.
 */
export class HubRepositoryPicker extends SurfaceElement {
  constructor() {
    super();
    this.services = {}; this.mode = 'create'; this.translateText = value => value; this.disposed = false; this.snapshot = null;
    this.chip = 'all'; this.matchedIds = null; this.query = { query: '', regex: false, flags: 'iu' }; this.selected = null; this.timer = null; this.filterSequence = 0; this.account = null;
    this.style(STYLE);
    this.help = element('p', { class: 'meta' });
    this.search = element('mfe-search'); this.search.addEventListener('search-change', event => { this.query = event.detail || this.query; void this.applySearch(); });
    this.refreshButton = element('md-outlined-button'); this.refreshButton.addEventListener('click', () => { void this.load(true); });
    this.infoButton = element('button', { type: 'button', class: 'info', id: 'hub-picker-info', text: 'i' });
    this.chipsGroup = element('md-chip-set', { class: 'chips', role: 'group' });
    this.status = element('p', { class: 'meta', role: 'status', 'aria-live': 'polite' });
    this.progress = element('md-linear-progress', { indeterminate: true });
    this.problem = element('div', { class: 'problem', role: 'alert' });
    this.signInButton = element('md-filled-button'); this.signInButton.addEventListener('click', () => this.emit('hub-sign-in-needed', {}));
    this.problemText = element('span', { class: 'grow' }); this.problem.append(this.problemText, this.signInButton);
    this.notes = element('div', { class: 'stack' });
    this.list = element('ul', { class: 'list', role: 'listbox' });
    this.empty = element('p', { class: 'meta', role: 'status' });
    this.visibility = element('p', { class: 'meta' });
    this.shadowRoot.append(element('div', { class: 'stack' }, [this.help, element('div', { class: 'bar' }, [this.search, this.refreshButton, this.infoButton]), this.chipsGroup, this.status, this.progress, this.problem, this.notes, this.list, this.empty, this.visibility]));
    this.list.addEventListener('keydown', event => this.keyboard(event));
  }
  configure({ services = {}, mode = 'create', account = null, translate = value => value, language = 'en' } = {}) {
    this.services = services; this.mode = mode; this.account = account; this.translateText = translate; this.language = language; this.render();
    return this;
  }
  setLanguage(language) { this.language = language; this.render(); }
  setAccount(account) { this.account = account; this.render(); }
  t(key, values) {
    const [en, yue] = HUB_DRIVE_COPY[key] || [key, key], translated = this.translateText(en);
    const base = translated !== en ? translated : localized({ en, yue }, this.language === 'zh-HK' ? 'yue' : this.language);
    return values ? fill(base, values) : base;
  }
  get available() { return typeof this.services.hubCatalogStart === 'function' && typeof this.services.hubCatalogStatus === 'function'; }
  /** Starts (or re-reads) the scan and follows it until it settles. */
  async load(force = false) {
    if (!this.available || this.disposed) { this.render(); return; }
    try { this.snapshot = await this.services.hubCatalogStart({ force }); }
    catch { this.snapshot = { phase: 'failed', reason: 'PROVIDER_UNAVAILABLE', repositories: [], progress: { total: 0, done: 0 }, namespaces: [] }; }
    this.account = this.snapshot.account ?? this.account;
    this.render(); void this.applySearch(); this.follow();
  }
  follow() {
    clearTimeout(this.timer); this.timer = null;
    if (this.disposed || !catalogBusy(this.snapshot)) return;
    this.timer = setTimeout(async () => {
      this.timer = null; if (this.disposed) return;
      try { this.snapshot = await this.services.hubCatalogStatus(); } catch { /* keep the last snapshot, try again */ }
      this.account = this.snapshot?.account ?? this.account;
      this.render(); void this.applySearch(); this.follow();
    }, POLL_MS);
  }
  async applySearch() {
    const sequence = ++this.filterSequence, repositories = this.snapshot?.repositories ?? [];
    let matched = null;
    if (this.query.query) {
      const rows = searchRows(repositories);
      if (typeof this.search.filter === 'function') { const result = await this.search.filter(rows); matched = result ? result.map(row => row.id) : []; }
      else { const matcher = this.query.regex ? regexMatcher(this.query.query, this.query.flags) : plainMatcher(this.query.query); matched = matcher ? matcher(rows).map(row => row.id) : []; }
    }
    if (sequence !== this.filterSequence || this.disposed) return;
    this.matchedIds = matched; this.renderList();
  }
  choose(repository, drive = null) {
    this.selected = drive ? `${repository.id}#${drive.id}` : repository.id;
    this.renderList();
    this.emit('hub-repository-choose', { repository: repository.id, visibility: repository.visibility, drive, driveCount: repository.drives.length });
  }
  chooseSuggested() { const suggestion = suggestedRepository(this.account ?? 'you', this.snapshot?.repositories ?? []); const existing = (this.snapshot?.repositories ?? []).find(item => item.id === suggestion.repository); this.choose(existing ?? { id: suggestion.repository, visibility: 'public', drives: [] }); }
  render() {
    const snapshot = this.snapshot, problem = catalogProblem(snapshot), busy = catalogBusy(snapshot);
    this.help.textContent = this.t('pickerHelp');
    this.search.setAttribute('label', this.t('searchLabel')); this.search.language = this.language === 'zh-HK' ? 'yue' : this.language; this.search.setLanguage?.(this.search.language);
    this.refreshButton.textContent = this.t(busy ? 'refreshing' : 'refresh'); this.refreshButton.disabled = busy || !this.available;
    this.infoButton.setAttribute('aria-label', this.t('info')); this.infoButton.title = this.t('info');
    this.chipsGroup.setAttribute('aria-label', this.t('filterGroup'));
    const counts = chipCounts(snapshot?.repositories ?? []);
    this.chipsGroup.replaceChildren(...CHIPS.map(chip => {
      const node = element('md-filter-chip', { class: 'chip' });
      node.label = `${this.t('chip' + chip[0].toUpperCase() + chip.slice(1))} (${counts[chip]})`; node.selected = this.chip === chip;
      node.addEventListener('click', () => { this.chip = chip; this.render(); }); return node;
    }));
    this.progress.hidden = !busy;
    const total = snapshot?.progress?.total ?? 0;
    this.status.textContent = !snapshot ? this.t('listing') : snapshot.phase === 'listing' ? this.t('listing') : snapshot.phase === 'scanning' ? this.t('scanning', { done: snapshot.progress.done, total })
      : snapshot.phase === 'cancelled' ? this.t('scanCancelled') : snapshot.phase === 'done' ? this.t('scanDone', { repos: snapshot.repositories.length, drives: snapshot.repositories.reduce((sum, item) => sum + item.drives.length, 0) }) : '';
    if (busy && total) { this.progress.indeterminate = false; this.progress.value = snapshot.progress.done / total; } else this.progress.indeterminate = true;
    this.problem.hidden = !problem; this.problemText.textContent = problem ? this.t(problem) : ''; this.signInButton.textContent = this.t('signInAgain'); this.signInButton.hidden = problem !== 'problemSignedOut';
    const notes = [];
    if (snapshot?.truncated) notes.push(element('p', { class: 'note', text: this.t('truncated') }));
    if (snapshot?.organizationsUnavailable) notes.push(element('p', { class: 'note', text: this.t('orgUnavailable') }));
    this.notes.replaceChildren(...notes);
    this.visibility.textContent = this.t('nameVisible');
    this.renderList();
  }
  renderList() {
    const repositories = visibleRepositories(this.snapshot?.repositories ?? [], this.chip, this.matchedIds);
    const items = [];
    if (this.mode === 'create' && this.account) items.push(this.suggestedItem());
    for (const repository of repositories) items.push(this.repositoryItem(repository));
    this.list.replaceChildren(...items);
    const shown = items.length - (this.mode === 'create' && this.account ? 1 : 0);
    this.empty.hidden = shown > 0 || catalogBusy(this.snapshot) || Boolean(catalogProblem(this.snapshot));
    this.empty.textContent = shown > 0 ? '' : (this.snapshot?.repositories ?? []).length ? this.t('nothingShown') : this.t('noRepositories');
  }
  suggestedItem() {
    const suggestion = suggestedRepository(this.account, this.snapshot?.repositories ?? []);
    const node = element('li', { class: 'repo', role: 'option', 'aria-selected': String(this.selected === suggestion.repository), 'data-selected': String(this.selected === suggestion.repository), 'data-key': suggestion.repository });
    const name = element('button', { type: 'button', class: 'name', text: suggestion.repository }); name.addEventListener('click', () => this.chooseSuggested());
    node.append(element('div', { class: 'head' }, [name, element('span', { class: 'badge', 'data-vis': 'public', text: this.t('visPublic') })]),
      element('p', { class: 'meta', text: suggestion.exists ? this.t('repositoryHolds', { n: suggestion.driveCount }) : this.t('repositoryNew') }));
    return node;
  }
  repositoryItem(repository) {
    const selectedRepo = this.selected === repository.id || String(this.selected ?? '').startsWith(`${repository.id}#`);
    const node = element('li', { class: 'repo', role: 'option', 'aria-selected': String(selectedRepo), 'data-selected': String(selectedRepo), 'data-error': String(Boolean(repository.error)), 'data-key': repository.id });
    const name = element('button', { type: 'button', class: 'name', text: repository.id }); name.addEventListener('click', () => this.choose(repository));
    const count = repository.drives.length;
    node.append(element('div', { class: 'head' }, [name,
      element('span', { class: 'badge', 'data-vis': repository.visibility, text: this.t(repository.visibility === 'public' ? 'visPublic' : 'visPrivate') }),
      element('span', { class: 'meta', text: repository.lastPushed ? this.t('lastPushed', { when: formatTime(repository.lastPushed) }) : this.t('neverPushed') }),
      element('span', { class: 'meta', text: repository.size === null ? this.t('sizeUnknown') : formatBytes(repository.size) }),
      element('span', { class: 'badge', 'data-found': String(count > 0), text: count === 0 ? (repository.scan === 'scanning' || repository.scan === 'pending' ? '…' : this.t('noDrives')) : count === 1 ? this.t('oneDriveFound') : this.t('drivesFound', { n: count }) })]));
    const key = repositoryProblemKey(repository.error);
    if (key) node.append(element('div', { class: 'err', role: 'alert', text: this.t(key) }));
    if (count) node.append(element('div', { class: 'cards' }, repository.drives.map(drive => this.driveCard(repository, drive))));
    return node;
  }
  driveCard(repository, drive) {
    const picked = this.selected === `${repository.id}#${drive.id}`;
    const card = element('md-list-item', { type: 'button', class: 'card', 'aria-pressed': String(picked), 'data-key': `${repository.id}#${drive.id}` });
    card.append(element('div', { slot: 'headline', text: drive.name ?? this.t('unnamedDrive') }),
      element('div', { slot: 'supporting-text', text: `${this.t('driveCardLabel', { id: drive.shortId })} · ${this.t('driveMeta', { when: formatTime(drive.lastBackup), n: drive.snapshots, size: formatBytes(drive.bytes) })}` }),
      element('div', { slot: 'trailing-supporting-text', text: this.t(this.mode === 'open' ? 'openLatest' : 'addHere') }));
    card.addEventListener('click', () => this.choose(repository, drive));
    return card;
  }
  /** The stops of the list in reading order: each repository name, then its drive cards. */
  focusStops() {
    const stops = [];
    const collect = node => { for (const child of node.children || []) { if (!child || typeof child !== 'object') continue; if (child.className === 'card' || child.className === 'name') stops.push(child); collect(child); } };
    collect(this.list);
    return stops;
  }
  /** Arrow keys, Home and End move through repository names and drive cards. Enter or Space choose, as buttons do. */
  keyboard(event) {
    const stops = this.focusStops(), current = stops.indexOf(event.target);
    const move = index => { event.preventDefault?.(); const node = stops[Math.max(0, Math.min(stops.length - 1, index))]; node?.focus?.(); this.focused = node; };
    if (event.key === 'ArrowDown') move(current + 1);
    else if (event.key === 'ArrowUp') move(current < 0 ? 0 : current - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(stops.length - 1);
  }
  focusSearch() { this.search.focus?.(); }
  destroy() { this.disposed = true; clearTimeout(this.timer); this.timer = null; this.services.hubCatalogCancel?.(); }
}
register('mfe-hub-repository-picker', HubRepositoryPicker);
