import {control, connectSelectSearch, setControlLanguage} from '../../../shared/surface/controls.js';
import {renderMarkdown} from './markdown.js';
import { createScopedSearch } from '../../scoped-search.js';

export function filterChanges(entries, { from = '', to = '', category = '' } = {}) {
  return entries.filter(entry => (!from || (entry.date && entry.date >= from)) && (!to || (entry.date && entry.date <= to)) && (!category || entry.category === category));
}
export function mountChangelog(host, { entries = [], translate = value => value, onExport, language = 'en' } = {}) {
  let resolveReady;const ready=new Promise(resolve=>resolveReady=resolve);const finishReady=outcome=>{resolveReady?.(outcome);resolveReady=null;};
  host.replaceChildren();setControlLanguage(host,language); let generation = 0, selected = [], disposed = false;
  const searchHost = document.createElement('div'), controls = document.createElement('div'), content = document.createElement('div');
  const date = label => { const wrap = document.createElement('label'), input = control('input', {type:'date',label:translate(label),'aria-label':translate(label)}); wrap.textContent = translate(label); input.type = 'date'; wrap.append(input); controls.append(wrap); return input; };
  const from = date('From date'), to = date('To date');
  const category = control('select'); category.setAttribute('aria-label', translate('Category'));
  for (const value of ['', ...new Set(entries.map(row => row.category).filter(Boolean))]) { const option = control('option'); option.value = value; option.textContent = value || translate('All categories'); category.append(option); }
  const exportButton = control('button', {type:'button'}); exportButton.type = 'button'; exportButton.textContent = translate('Export filtered changes');
  const stopSelectSearch = connectSelectSearch(category, {language});
  controls.style.cssText='display:flex;flex-wrap:wrap;gap:12px;align-items:center'; content.style.cssText='max-height:60dvh;overflow:auto;overflow-wrap:anywhere';
  controls.append(category, exportButton); host.append(searchHost, controls, content);
  const search = createScopedSearch(searchHost, translate, render);
  async function render() {
    const request = ++generation;try{
    const filtered = filterChanges(entries, { from: from.value, to: to.value, category: category.value });
    const result = await search.filterWithOutcome(filtered.map((row, index) => ({ ...row, id: String(index), path: `${row.title}\n${row.markdown}` })));
    if (disposed || request !== generation) return;
    if(result.outcome==='superseded')return;const rows=result.rows;selected = rows; content.replaceChildren();
    if (!rows.length) { const empty = document.createElement('p'); empty.textContent = translate('No matching changes.'); content.append(empty); }
    for (const row of rows) { const section = document.createElement('section'), heading = document.createElement('h3'), body = document.createElement('article'); heading.textContent = row.title; renderMarkdown(body,row.markdown,{translate,catalog:{documents:[],assets:[]},source:'CHANGELOG.md',headings:[],open:()=>false}); section.append(heading, body); content.append(section); }
    exportButton.disabled = !rows.length;finishReady(result.outcome);
    }catch(error){if(!disposed&&request===generation)finishReady('failed');throw error;}
  }
  for (const control of [from, to, category]) control.addEventListener('change', render);
  exportButton.addEventListener('click', () => {
    const data = { name: 'changelog.md', mime: 'text/markdown', text: selected.map(row => `## ${row.title}\n${row.markdown}`).join('\n') };
    if (onExport) return onExport(data);
    const url = URL.createObjectURL(new Blob([data.text], { type: data.mime })); const link = document.createElement('a'); link.href = url; link.download = data.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render(); return { ready,setLanguage(value){language=value;for(const [field,label]of [[from,'From date'],[to,'To date']]){field.label=translate(label);field.setAttribute('aria-label',translate(label));if(field.parentNode?.firstChild?.nodeType===3)field.parentNode.firstChild.nodeValue=translate(label);}category.setAttribute('aria-label',translate('Category'));exportButton.textContent=translate('Export filtered changes');setControlLanguage(host,language);}, refresh: render, destroy() { disposed = true; generation++;finishReady('disposed'); stopSelectSearch(); search.destroy(); host.replaceChildren(); } };
}
