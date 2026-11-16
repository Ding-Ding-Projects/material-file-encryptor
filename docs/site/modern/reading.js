// Reading view behaviour: progress bar, active table-of-contents heading, copy buttons and reading preferences.
import {readJson, writeJson, removeKey} from './storage.js';
import {toast} from './toast.js';
import {playCue} from './sound.js';
import {pick} from './i18n.js';
export const READING_KEY = 'mfe.site.reading.v1';
const DEFAULTS = {width: 'standard', progress: true};
export const loadReading = () => readJson(READING_KEY, DEFAULTS);
export function applyReading(state = loadReading()) {
 document.documentElement.dataset.readingWidth = state.width;
 for (const body of document.querySelectorAll('.reading-body')) body.classList.toggle('wide', state.width === 'wide');
 for (const bar of document.querySelectorAll('.reading-progress')) bar.hidden = !state.progress;
}
export function setReading(patch) { const next = {...loadReading(), ...patch}; writeJson(READING_KEY, next); applyReading(next); }
export function resetReading() { removeKey(READING_KEY); applyReading(DEFAULTS); }

function mountProgress() {
 const bar = document.querySelector('.reading-progress');
 if (!bar) return;
 const fill = bar.querySelector('i');
 const update = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.setProperty('--progress', max > 0 ? Math.min(1, Math.max(0, scrollY / max)).toFixed(4) : '0');
 };
 update();
 addEventListener('scroll', update, {passive: true});
 addEventListener('resize', update);
 return fill;
}
function mountToc() {
 const links = [...document.querySelectorAll('.toc a[href^="#"]')];
 const toc = document.querySelector('details.toc');
 if (toc) toc.open = innerWidth > 1000;
 if (!links.length || !('IntersectionObserver' in window)) return;
 const byId = new Map(links.map(link => [decodeURIComponent(link.hash.slice(1)), link]));
 const headings = [...byId.keys()].map(id => document.getElementById(id)).filter(Boolean);
 const visible = new Set();
 const mark = () => {
  const first = headings.find(heading => visible.has(heading)) || [...headings].reverse().find(heading => heading.getBoundingClientRect().top < 120);
  for (const link of links) link.removeAttribute('aria-current');
  if (first) byId.get(first.id)?.setAttribute('aria-current', 'true');
 };
 const observer = new IntersectionObserver(entries => { for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target); mark(); }, {rootMargin: '-96px 0px -65% 0px'});
 for (const heading of headings) observer.observe(heading);
 mark();
}
const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" class="check-draw" aria-hidden="true"><path pathLength="1" d="M5 12.5 10 17.5 19 7"/></svg>';
function mountCopy() {
 for (const pre of document.querySelectorAll('.reading-body pre')) {
  const button = document.createElement('md-icon-button');
  button.className = 'copy-button';
  button.setAttribute('aria-label', pick('Copy code', '複製程式碼'));
  button.innerHTML = COPY_ICON;
  button.addEventListener('click', async () => {
   try {
    await navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? pre.textContent);
    button.innerHTML = CHECK_ICON;
    playCue('copy');
    toast(pick('Copied to the clipboard', '已複製到剪貼簿'));
    setTimeout(() => { button.innerHTML = COPY_ICON; }, 1800);
   } catch { toast(pick('Copy was not allowed by the browser', '瀏覽器唔允許複製'), {error: true}); playCue('invalid'); }
  });
  pre.append(button);
 }
}
export function mountReading() {
 applyReading();
 if (!document.querySelector('.reading')) return;
 mountProgress();
 mountToc();
 mountCopy();
}
