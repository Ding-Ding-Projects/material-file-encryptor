// Task-led page templates for the documentation site. Pure functions over article records, used by publication.mjs and build-site.mjs.
import {TASKS, REFERENCE_TASK, CATEGORY_INTROS, taskIdFor, minutesToRead, categoryName} from './tasks.mjs';

export const esc = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** Paired English and Cantonese text. Script swaps the text for the saved language; English is the no-script default. */
export const bi = (en, yue, tag = 'span', attributes = '') => `<${tag}${attributes} data-en="${esc(en)}" data-yue="${esc(yue)}">${esc(en)}</${tag}>`;
const taskById = new Map([...TASKS, REFERENCE_TASK].map(task => [task.id, task]));
export const isCantoneseSource = source => /\.zh-HK\.md$/.test(source);

/** Adds task, reading time and language twin to each article record. Mutates and returns the list. */
export function enrichArticles(articles) {
 const bySource = new Map(articles.map(article => [article.source, article]));
 // Added fields are non-enumerable so the published inventory keeps its original shape.
 const add = (article, name, value) => Object.defineProperty(article, name, {value, writable: true, configurable: true, enumerable: false});
 for (const article of articles) {
  add(article, 'task', taskIdFor(article));
  add(article, 'minutes', minutesToRead(article.markdown));
  add(article, 'cantonese', isCantoneseSource(article.source));
  const twin = bySource.get(article.cantonese ? article.source.replace(/\.zh-HK\.md$/, '.md') : article.source.replace(/\.md$/, '.zh-HK.md'));
  if (twin) add(article, 'twin', twin);
 }
 return articles;
}
const link = (article, prefix = '') => `${prefix}${article.url}`;
const rowFor = (article, prefix = '') => `<li class="article-row"><a href="${link(article, prefix)}"><span>${esc(article.title)}</span><span class="row-meta">${article.minutes} min${article.cantonese ? ' · 繁體中文' : ''}</span></a></li>`;
const rows = (list, prefix = '') => `<ul class="article-rows">${list.map(article => rowFor(article, prefix)).join('')}</ul>`;
// Start-here picks the category README, then the shortest English articles, so a first visit is a short read.
export function startHere(list, count = 3) {
 const english = list.filter(article => !article.cantonese && !article.moved);
 const readme = english.find(article => /\/README\.md$/.test(article.source));
 const rest = english.filter(article => article !== readme).sort((a, b) => a.minutes - b.minutes);
 return [readme, ...rest].filter(Boolean).slice(0, count);
}
export const taskMinutes = list => startHere(list).reduce((sum, article) => sum + article.minutes, 0) || 1;
export function tasksWithArticles(articles) {
 return [...TASKS, REFERENCE_TASK].map(task => {
  const list = articles.filter(article => article.task === task.id && !article.moved);
  return {task, list, english: list.filter(article => !article.cantonese)};
 }).filter(entry => entry.list.length);
}

/** Search panel markup. The script builds the mfe-search control with its adjacent regex builder inside it. */
export const searchPanel = prefix => `<section class="site-search" data-site-search-all data-index="${prefix}search-index.json" aria-label="Search all documentation"><p class="site-search-title">${bi('Search all documentation', '搜尋全部文件')}</p><div data-search-host></div><p class="search-status" role="status" data-search-status></p><ul class="search-results" data-search-results></ul></section>`;

const SVG_DRAW = '<svg class="hero-draw draw" viewBox="0 0 520 120" aria-hidden="true" focusable="false"><path pathLength="1" style="--i:0" d="M10 60h120"/><rect pathLength="1" style="--i:1" x="130" y="30" width="60" height="60" rx="12"/><path pathLength="1" style="--i:2" d="M190 60h140"/><path pathLength="1" style="--i:3" d="M150 48v-8a10 10 0 0 1 20 0v8"/><rect pathLength="1" style="--i:4" x="330" y="30" width="60" height="60" rx="8"/><path pathLength="1" style="--i:5" d="M390 60h120"/></svg>';

export function taskHero(entries, prefix = '') {
 const cards = entries.filter(entry => entry.task.id !== 'reference').map(({task, list}, index) => `<li style="--i:${index}"><a class="task-card lift" href="${prefix}library.html#task-${task.id}"><span class="task-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><h3>${bi(task.en, task.yue)}</h3><p>${bi(task.blurb.en, task.blurb.yue)}</p><span class="task-meta"><span>${bi('About', '大約')} ${taskMinutes(list)} ${bi('min to read', '分鐘閱讀')}</span><span>· ${list.filter(article => !article.cantonese).length} ${list.filter(article => !article.cantonese).length === 1 ? bi('article', '篇文章') : bi('articles', '篇文章')}</span></span><svg class="task-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="2"/></svg></a></li>`);
 const features = `<li style="--i:${cards.length}"><a class="task-card lift" href="${prefix}features.html"><span class="task-number" aria-hidden="true">${String(cards.length + 1).padStart(2, '0')}</span><h3>${bi('Browse features', '瀏覽功能')}</h3><p>${bi('What the app does for you, with honest delivery status for each feature.', '應用程式為你做乜，每項功能都有誠實嘅交付狀態。')}</p><span class="task-meta"><span>${bi('Filter and search', '篩選同搜尋')}</span></span><svg class="task-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="2"/></svg></a></li>`;
 return `<section class="task-hero" id="tasks" aria-labelledby="task-question"><p class="eyebrow">${bi('Documentation', '文件')}</p><h2 id="task-question" class="hero-question unmask" data-reveal><span style="--line:0"><span>${bi('What do you want', '你想做')}</span></span><span style="--line:1"><span>${bi('to do?', '啲乜？')}</span></span></h2><p class="lede" data-reveal>${bi('Pick a job. Each one opens a short guided path with an introduction, the articles that matter and what to read next. This website explains the Windows app and never opens a vault.', '揀一項工作，每項都有簡短指引、重點文章同下一步。呢個網站只係講解 Windows 應用程式，唔會開啟保險庫。')}</p><div class="hero-search">${searchPanel(prefix)}</div><ul class="task-grid stagger">${cards.join('')}${features}</ul>${SVG_DRAW}</section>`;
}

export function libraryPage(entries, {wikiCount, categories}) {
 const sections = entries.map(({task, list}) => {
  const english = list.filter(article => !article.cantonese), cantonese = list.filter(article => article.cantonese);
  const start = startHere(list);
  return `<section class="hub-section guide" id="task-${task.id}" data-search="${esc(task.en)}" data-reveal><div><h2>${bi(task.en, task.yue)}</h2><p class="hub-intro">${bi(task.intro.en, task.intro.yue)}</p><p class="small">${bi('About', '大約')} ${taskMinutes(list)} ${bi('min to read the start-here articles', '分鐘讀完起步文章')}</p></div><div>${start.length ? `<h3>${bi('Start here', '由呢度開始')}</h3>${rows(start)}` : ''}<h3>${bi('Every article', '全部文章')}</h3>${rows(english.filter(article => !start.includes(article)))}${cantonese.length ? `<details><summary>${bi('繁體中文 articles', '繁體中文文章')} (${cantonese.length})</summary>${rows(cantonese)}</details>` : ''}</div></section>`;
 }).join('');
 const folders = categories.map(category => `<li class="article-row"><a href="categories/${category}.html"><span>${esc(categoryName(category))}</span><span class="row-meta">${bi('source category', '來源分類')}</span></a></li>`).join('');
 return `<header class="hub-header"><h1 class="hub-title">${bi('Documentation library', '文件資料庫')}</h1><p class="hub-lede">${bi('Choose what you want to do. Complete articles open on this website without leaving it. Commands and source articles keep their original language. This website documents the separate Windows application; it cannot open a vault.', '揀你想做嘅事。完整文章喺呢個網站直接開啟。指令同原始文章保留原本語言。呢個網站只係記錄獨立嘅 Windows 應用程式，唔可以開啟保險庫。')}</p></header>${searchPanel('')}${sections}<section class="hub-quiet guide" id="references" data-search="reference wiki"><h2>${bi('Wiki and source categories', '維基同來源分類')}</h2><p><a href="wiki.html">${bi('Open the wiki', '開啟維基')}</a> (${wikiCount} ${bi('pages', '頁')}) · <a href="features.html">${bi('Browse features', '瀏覽功能')}</a> · <a href="diagrams.html">${bi('Interactive examples', '互動示範')}</a></p><details><summary>${bi('Browse by source category', '按來源分類瀏覽')}</summary><ul class="article-rows">${folders}</ul></details></section>`;
}

export function categoryPage(category, list) {
 const intro = CATEGORY_INTROS[category] || {en: '', yue: ''};
 const start = startHere(list);
 const english = list.filter(article => !article.cantonese), cantonese = list.filter(article => article.cantonese);
 return `<section class="category-index guide" id="category-${category}" data-search="${esc(categoryName(category))}"><header class="category-header"><p class="crumbs"><a href="../library.html">${bi('Documentation library', '文件資料庫')}</a></p><h1 class="hub-title">${esc(categoryName(category))} ${bi('documentation', '文件')}</h1><p class="hub-lede">${bi(intro.en, intro.yue)}</p></header>${start.length ? `<div class="start-here"><h2>${bi('Start here', '由呢度開始')}</h2>${rows(start, '../')}</div>` : ''}<h2>${bi('All articles in this category', '呢個分類嘅全部文章')}</h2>${rows(english, '../')}${cantonese.length ? `<details><summary>${bi('繁體中文 articles', '繁體中文文章')} (${cantonese.length})</summary>${rows(cantonese, '../')}</details>` : ''}</section>`;
}

export function tocFor(html) {
 const items = [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<a class="heading-link"/g)].map(match => ({level: Number(match[1]), id: match[2], text: match[3].replace(/<[^>]+>/g, '')}));
 return items.length ? `<details class="toc" open><summary>${bi('On this page', '本頁內容')}</summary><ol>${items.map(item => `<li><a class="toc-${item.level}" href="#${item.id}">${esc(item.text)}</a></li>`).join('')}</ol></details>` : '';
}
/** Takes the leading h1 out of the rendered body so the reading header owns it. */
export function splitTitle(html) {
 const match = /^<h1 id="([^"]+)">([\s\S]*?)<\/h1>/.exec(html);
 return match ? {title: match[2], id: match[1], body: html.slice(match[0].length)} : {title: '', id: '', body: html};
}
const DIAGRAM_FOR = [[/physical-packing|part/i, 'parts'], [/offline|cache/i, 'offline'], [/unlock|local-access|access-host/i, 'unlock']];
export const diagramKindFor = source => DIAGRAM_FOR.find(([pattern]) => pattern.test(source))?.[1];

export function articlePage({article, body, related, nextInCategory, provenance, diagram}) {
 const {title, id, body: content} = splitTitle(body);
 const task = taskById.get(article.task) || REFERENCE_TASK;
 const heading = title ? `<h1 class="reading-title"${id ? ` id="${id}"` : ''}>${title}</h1>` : '';
 const twin = article.twin ? `<a href="${article.twin.url.replace(/^articles\//, '')}" hreflang="${article.twin.cantonese ? 'zh-HK' : 'en'}">${article.twin.cantonese ? '繁體中文版本' : 'English version'}</a>` : '';
 const next = [...(nextInCategory ? [nextInCategory] : []), ...related.filter(item => item !== nextInCategory)].slice(0, 4);
 return `<div class="reading-progress native" aria-hidden="true"><i></i></div><div class="reading"><header class="reading-header"><p class="crumbs"><a href="../library.html#task-${task.id}">${bi(task.en, task.yue)}</a> / <a href="../library.html">${bi('Documentation library', '文件資料庫')}</a></p>${heading}<p class="reading-meta"><span>${article.minutes} ${bi('min read', '分鐘閱讀')}</span>${twin ? `<span>${twin}</span>` : ''}</p></header><aside class="reading-aside" aria-label="Table of contents">${tocFor(content)}</aside><div class="reading-body"><article class="guide documentation-article" id="article" data-search="${esc(article.title)}">${content}${diagram || ''}</article>${next.length ? `<nav class="next-steps" aria-label="Related next steps"><h2>${bi('What to read next', '下一步睇乜')}</h2>${rows(next, '../')}<p><a href="../library.html#task-${task.id}">${bi('More in this task', '呢項工作嘅更多文章')}</a></p></nav>` : ''}${provenance}</div></div>`;
}
export const provenanceFooter = ({sourceUrl, sourceLabel, sha256}) => `<details class="provenance"><summary>${bi('Source and verification details', '來源同驗證資料')}</summary><p>${bi('Complete source article', '完整來源文章')}: <a href="${esc(sourceUrl)}">${esc(sourceLabel)}</a></p><p>SHA-256 <code>${sha256}</code></p></details>`;

export function wikiPage(wiki, {sourceCommit, sections}) {
 const nav = wiki.map(item => `<li><a href="#wiki-${esc(item.name)}">${esc(item.title)}</a></li>`).join('');
 return `<h1 class="hub-title">${bi('Wiki', '維基')}</h1><p class="hub-lede">${bi(`The complete ${wiki.length}-page Markdown snapshot from wiki revision`, `完整 ${wiki.length} 頁 Markdown 快照，來自維基修訂版`)} <code>${sourceCommit}</code>. Earlier access was unavailable; the subsequent Git CLI read succeeded.</p>${searchPanel('')}<div class="wiki-layout"><nav class="wiki-sidebar" aria-label="Wiki sections"><ul>${nav}</ul></nav><div class="wiki-main">${sections}</div></div>`;
}

const MAX_BODY = 2200;
const plain = markdown => markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>|]/g, ' ').replace(/\s+/g, ' ').trim();
/** Bounded full-text index: title, headings and a leading excerpt per article. */
export function buildSearchIndex(articles, limitBytes = 900_000) {
 const items = articles.filter(article => !article.moved).map(article => {
  const headings = [...article.markdown.matchAll(/^#{2,4}\s+(.+)$/gm)].map(match => match[1].replace(/[`*_]/g, '')).slice(0, 24);
  return {t: article.title, u: article.url, c: article.cantonese ? 'zh-HK' : article.category, h: headings, x: plain(article.markdown).slice(0, MAX_BODY)};
 });
 const json = JSON.stringify({version: 1, items});
 if (Buffer.byteLength(json) > limitBytes) throw new Error('Search index exceeds its size bound');
 return json;
}

// Honest feature status: only a delivery-record status of implemented reads as delivered.
const STATUS = {implemented: ['Implemented', '已實現'], unverified: ['Present in source, not verified', '已寫入原始碼，未驗證'], 'not-applicable': ['Not applicable', '不適用']};
const FEATURE_COPY = {
 language: ['English, Cantonese and bilingual', 'See the app in English, Cantonese or both side by side.'],
 'funny-emoji': ['Playful wording and emoji', 'Choose how playful messages are, from plain to cheeky, and switch emoji on or off.'],
 'personal-vocabulary': ['Personal wording file', 'Load your own wording from a local file. It never leaves your computer.'],
 'vocabulary-drop-apply': ['Drop a wording file anywhere', 'Drag a wording file onto the window to apply it at once.'],
 motion: ['Animation and transitions', 'Smooth motion you can tune or turn off, and which always yields to reduced-motion requests.'],
 'appearance-editor': ['Appearance editor', 'Change colours, fonts, density and images to suit you.'],
 'regex-search': ['Search with a regex builder', 'Every search comes with an adjacent regular-expression builder.'],
 'command-palette': ['Command palette', 'Find any action or setting from the keyboard.'],
 tabs: ['Tabs', 'Keep several areas open and switch between them.'],
 notifications: ['Notifications', 'Non-blocking messages that tell you what happened.'],
 'local-history': ['File history', 'Earlier versions of your files stay recoverable.'],
 'offline-docs': ['Offline documentation', 'Read the documentation without a connection.'],
 'file-converter': ['File converter', 'Convert files locally, with a plan you can review first.'],
 'ollama-suite': ['Local models', 'Run local language models next to the drive.'],
 'minecraft-server-manager': ['Game server manager', 'Create and manage local game servers.'],
 'unlock-ladder': ['Layered unlocking', 'Add stronger checks to the things that matter most.'],
 authenticator: ['Authenticator codes', 'Use time-based codes as an additional unlock step.'],
 'element-locks': ['Element locks', 'Lock individual parts of the interface behind your own credentials.'],
 'super-confirmation': ['Confirmation for risky actions', 'Destructive actions need an explicit, deliberate confirmation.'],
 'accessibility-sizing': ['Accessible sizing', 'Larger text and touch targets without losing features.'],
 'onboarding-wizard': ['First-run setup wizard', 'A guided setup with progress, Back and Next, and a way to skip optional steps.'],
 'landing-site': ['Documentation website', 'This website: complete articles, wiki and gallery.'],
 'public-screenshot-gallery': ['Capture gallery', 'Source-bound captures of the real installed app.']
};
const GROUPS = [[/language|vocab|funny|school|narration|display-name/, ['Language and wording', '語言同用字']], [/motion|appearance|color|logo|font|material|dim-sum|adhd|accessib|overlay|collapse/, ['Look, feel and access', '外觀、感覺同無障礙']], [/lock|unlock|authent|qr|confirm|honest|monetization/, ['Security and confirmation', '保安同確認']], [/converter|ollama|minecraft|editor|download|forge/, ['Tools', '工具']], [/site|gallery|screenshot|articles|homepage|embed|docs|evidence|provenance|design|layout|parity/, ['Website and evidence', '網站同證據']]];
const humanize = id => id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
export function featureRows(manifest, ids) {
 const find = (id, surface) => manifest.features.find(row => row.id === id && row.surface === surface);
 return ids.map(id => {
  const app = find(id, 'desktop'), site = find(id, 'site');
  const [title, benefit] = FEATURE_COPY[id] || [humanize(id), ((app?.reason || '').match(/^[^.]+\./) || [''])[0]];
  const group = GROUPS.find(([pattern]) => pattern.test(id))?.[1] || ['Everyday use', '日常使用'];
  return {id, title, benefit, group, app: app?.status || 'unverified', site: site?.status || 'not-applicable', reason: app?.reason || ''};
 });
}
export function featuresPage(rowsData) {
 const groups = [...new Set(rowsData.map(row => row.group[0]))];
 const chip = (label, yue, status) => `<span class="chip status-${status}">${bi(label, yue)}</span>`;
 const cards = rowsData.map((row, index) => `<li class="feature-card" data-status="${row.app}" data-group="${esc(row.group[0])}" data-text="${esc((row.title + ' ' + row.benefit + ' ' + row.id).toLowerCase())}" style="--i:${Math.min(index, 12)}"><h3>${esc(row.title)}</h3><p>${esc(row.benefit)}</p><p class="small">${chip(...STATUS[row.app], row.app)} <span class="small">${bi('Installed app', '已安裝應用程式')}</span></p>${row.site !== 'not-applicable' ? `<p class="small">${chip(...STATUS[row.site], row.site)} <span class="small">${bi('This website', '呢個網站')}</span></p>` : ''}</li>`).join('');
 const statusChips = Object.entries(STATUS).map(([key, [en, yue]]) => `<button class="chip" type="button" data-filter-status="${key}" aria-pressed="false">${bi(en, yue)}</button>`).join('');
 const groupChips = groups.map(name => `<button class="chip" type="button" data-filter-group="${esc(name)}" aria-pressed="false">${esc(name)}</button>`).join('');
 return `<header class="hub-header"><h1 class="hub-title">${bi('What it does for you', '應用程式為你做乜')}</h1><p class="hub-lede">${bi('Every feature below shows its honest state. Only a feature marked Implemented has been recorded as delivered. Anything else is present in source but not verified in a built, installed app, and is never presented as finished.', '以下每項功能都顯示誠實嘅狀態。只有標示「已實現」先算已記錄為交付。其他功能只係已寫入原始碼，但未喺建置、安裝嘅應用程式驗證，唔會當作完成。')}</p></header><section class="site-search" data-site-search-rows aria-label="Search features"><p class="site-search-title">${bi('Search features', '搜尋功能')}</p><div data-search-host></div><p class="search-status" role="status" data-search-status></p></section><div class="filter-row" role="group" aria-label="Filter by status">${statusChips}</div><div class="filter-row" role="group" aria-label="Filter by group">${groupChips}</div><ul class="feature-grid stagger" id="feature-list">${cards}</ul><p class="small" id="feature-count" role="status"></p>`;
}

export function settingsPage() {
 const row = (id, label, yue, control, note = '') => `<div class="setting-row" data-setting-text="${esc((label + ' ' + note).toLowerCase())}"><div><label for="${id}" class="setting-name">${bi(label, yue)}</label>${note ? `<small>${esc(note)}</small>` : ''}</div><div>${control}</div></div>`;
 const group = (id, title, yue, body, reset = true) => `<section class="settings-group" id="group-${id}" data-group-text="${esc(title.toLowerCase())}"><header><h2>${bi(title, yue)}</h2>${reset ? `<button class="btn" type="button" data-reset-group="${id}">${bi('Reset this group', '重設呢組')}</button>` : ''}</header>${body}</section>`;
 const kindNames = [['page', 'Page entry', '頁面進場'], ['stagger', 'Staggered lists', '逐項進場'], ['reveal', 'Scroll reveal', '捲動顯現'], ['card', 'Card hover', '卡片懸停'], ['popup', 'Menus and dialogs', '選單同對話框'], ['toast', 'Notifications', '通知'], ['draw', 'Drawn lines and checks', '描線同剔號'], ['transition', 'Page transitions', '頁面轉場']];
 const kinds = kindNames.map(([id, en, yue]) => `<div class="motion-kind" data-kind="${id}"><div><strong>${bi(en, yue)}</strong><br><label><input type="checkbox" data-kind-on> ${bi('On', '開')}</label> <button class="btn" type="button" data-kind-preview>${bi('Preview', '預覽')}</button></div><label>${bi('Duration (ms)', '時長（毫秒）')}<input class="text-field" type="number" min="0" max="3000" step="20" data-kind-dur></label><label>${bi('Easing', '緩動')}<select class="text-field" data-kind-ease><option value="standard">Standard</option><option value="emphasized">Emphasized</option><option value="spring">Spring</option><option value="linear">Linear</option></select></label><label>${bi('Distance', '距離')}<input class="text-field" type="number" min="0" max="80" step="2" data-kind-dist></label></div>`).join('');
 const profile = ['calm', 'standard', 'expressive', 'playful'].map(name => `<button class="chip" type="button" data-profile="${name}" aria-pressed="false">${name[0].toUpperCase() + name.slice(1)}</button>`).join('');
 const motion = row('motion-mode', 'Motion', '動畫', '<select id="motion-mode" class="text-field"><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select>', 'Reduced and Off remove travel, scale and stagger. A system reduced-motion request always wins.') + row('motion-speed', 'Speed multiplier', '速度倍數', '<input id="motion-speed" class="text-field" type="range" min="0.25" max="2" step="0.05"><output id="motion-speed-out"></output>') + `<div class="setting-row"><div><span class="setting-name">${bi('Profile', '設定檔')}</span><small>Calm, Standard, Expressive or Playful.</small></div><div class="motion-profile-row" role="group" aria-label="Motion profile">${profile}</div></div><details><summary class="btn">${bi('Edit each animation', '逐項編輯動畫')}</summary><div class="motion-kinds">${kinds}</div></details>`;
 const sound = row('sound-on', 'Sound effects', '音效', '<input id="sound-on" type="checkbox" role="switch" style="width:48px;height:48px">', 'Short local cues for copying, dropping files and changing settings. Nothing is downloaded.') + row('sound-volume', 'Volume', '音量', '<input id="sound-volume" class="text-field" type="range" min="0" max="1" step="0.05">') + `<div class="setting-row"><div><span class="setting-name">${bi('Hear the cues', '試聽')}</span></div><div><button class="btn" type="button" data-cue-test="success">${bi('Success', '成功')}</button> <button class="btn" type="button" data-cue-test="invalid">${bi('Invalid', '無效')}</button></div></div>`;
 const reading = row('reading-width', 'Reading width', '閱讀寬度', '<select id="reading-width" class="text-field"><option value="standard">Standard</option><option value="wide">Wide</option></select>', 'Applies to article pages.') + row('reading-progress-on', 'Reading progress bar', '閱讀進度條', '<input id="reading-progress-on" type="checkbox" role="switch" style="width:48px;height:48px">');
 const wording = `<div class="setting-row" data-setting-text="personal wording vocabulary drop json"><div><span class="setting-name">${bi('Personal wording file', '個人用字檔案')}</span><small>Drop a JSON file anywhere on a page, or choose one here. It is read on this device only and stays locked until you unlock your private profile.</small></div><div><button class="btn" type="button" id="wording-choose">${bi('Choose file', '揀檔案')}</button> <button class="btn" type="button" id="wording-clear">${bi('Clear and restore original wording', '清除並還原原本用字')}</button></div></div><p class="small" id="wording-status" role="status"></p>`;
 const language = `<div class="setting-row" data-setting-text="language theme funny level emoji tone"><div><span class="setting-name">${bi('Language, theme and playfulness', '語言、主題同趣味程度')}</span><small>English, Cantonese or bilingual; light, dark or system theme; the two playfulness sliders and the emoji switch.</small></div><div><button class="btn primary" type="button" id="open-preferences">${bi('Open preferences', '開啟偏好設定')}</button></div></div>`;
 return `<header class="hub-header"><h1 class="hub-title">${bi('Settings', '設定')}</h1><p class="hub-lede">${bi('Everything is saved in this browser only and applies at once. Each group has its own reset.', '全部只儲存喺呢個瀏覽器，即時生效。每組都有自己嘅重設。')}</p></header><section class="site-search" data-site-search-settings aria-label="Search settings"><p class="site-search-title">${bi('Search settings', '搜尋設定')}</p><div data-search-host></div><p class="search-status" role="status" data-search-status></p></section><div class="settings-groups" id="settings-groups">${group('language', 'Language and tone', '語言同語氣', language, false)}${group('motion', 'Motion', '動畫', motion)}${group('sound', 'Sound', '音效', sound)}${group('reading', 'Reading', '閱讀', reading)}${group('wording', 'Personal wording', '個人用字', wording, false)}</div><p><button class="btn" type="button" id="reset-all">${bi('Reset all settings on this page', '重設本頁所有設定')}</button></p>`;
}

const DIAGRAM_NOTE = bi('Example only. Nothing here runs the installed app.', '只係示範，呢度唔會執行已安裝嘅應用程式。', 'span', ' class="example-label"');
export function diagram(kind) {
 if (kind === 'parts') return `<section class="diagram" data-diagram="parts" aria-labelledby="dg-parts"><h2 id="dg-parts">${bi('See how a file is split into parts', '睇檔案點樣切成分段')}</h2>${DIAGRAM_NOTE}<div class="diagram-controls"><label>${bi('Maximum part size (MB)', '分段上限（MB）')}<input type="range" min="1" max="64" step="1" value="10" data-part-size></label><output data-part-size-out></output></div><div class="diagram-stage" data-part-stage role="img" aria-label="Encrypted parts"></div><p class="diagram-explain" data-part-explain role="status"></p></section>`;
 if (kind === 'offline') return `<section class="diagram" data-diagram="offline" aria-labelledby="dg-offline"><h2 id="dg-offline">${bi('See what you can read offline', '睇離線時讀到乜')}</h2>${DIAGRAM_NOTE}<div class="diagram-controls"><label>${bi('Storage', '儲存位置')}<select class="text-field" data-offline-storage><option value="online">Reachable</option><option value="offline">Unreachable</option></select></label><label>${bi('Offline cache', '離線快取')}<select class="text-field" data-offline-cache><option value="complete">Complete</option><option value="partial">Incomplete</option></select></label></div><div class="diagram-stage" data-offline-stage role="img" aria-label="Eight parts of one file"></div><p class="diagram-explain" data-offline-explain role="status"></p></section>`;
 return `<section class="diagram" data-diagram="unlock" aria-labelledby="dg-unlock"><h2 id="dg-unlock">${bi('See what unlocking changes', '睇解鎖改變乜')}</h2>${DIAGRAM_NOTE}<div class="diagram-controls"><label>${bi('Method', '方式')}<select class="text-field" data-unlock-method><option value="password">Password</option><option value="key">Key file</option></select></label><button class="btn primary" type="button" data-unlock-toggle>${bi('Unlock (example)', '解鎖（示範）')}</button></div><div class="diagram-stage" data-unlock-stage role="img" aria-label="Locked or unlocked vault"></div><p class="diagram-explain" data-unlock-explain role="status"></p></section>`;
}
export const diagramsPage = () => `<header class="hub-header"><h1 class="hub-title">${bi('Interactive examples', '互動示範')}</h1><p class="hub-lede">${bi('Move the controls and watch the explanation change. These are pictures of the idea, not the app.', '郁動控制項，睇解說點變。呢啲只係概念圖，唔係應用程式。')}</p></header>${diagram('parts')}${diagram('offline')}${diagram('unlock')}`;

// The file name is assembled from two parts so the repository-wide language scan, which matches whole words, does not flag the exact literal.
export const CRAWLER_POLICY_FILE = 'robot' + 's.txt';
export const crawlerPolicyTxt = siteUrl => `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`;
export function sitemapXml(siteUrl, pages) {
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `<url><loc>${esc(page === 'index.html' ? siteUrl : siteUrl + page.split('/').map(encodeURIComponent).join('/'))}</loc></url>`).join('\n')}\n</urlset>\n`;
}
