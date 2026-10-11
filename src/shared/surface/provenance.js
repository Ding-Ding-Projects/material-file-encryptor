import { SurfaceElement, element, register } from './registry.js';
export function formatProvenance(provenance,language='en',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const date = typeof provenance?.builtAt==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(provenance.builtAt) ? new Date(provenance.builtAt) : null;
  const valid=date && Number.isFinite(date.getTime());
  const version=typeof provenance?.version==='string' && provenance.version.trim() ? provenance.version.trim() : (language==='yue'?'無法取得版本':'Version unavailable');
  const updated=valid?new Intl.DateTimeFormat(language==='yue'?'zh-HK':'en-CA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone}).format(date):language==='yue'?'無法取得建置時間':'Build time unavailable';
  return {version,updated,timeZone:valid?timeZone:null};
}
export class BuildProvenance extends SurfaceElement {
  connectedCallback(){this.render();}
  set value(value){this.provenance=value;this.render();}
  render(){this.style(':host{font-size:12px;overflow-wrap:anywhere;padding:4px 0}');const p=formatProvenance(this.provenance,this.language);this.shadowRoot.append(element('span',{role:'status',text:`${p.version} · ${p.updated}${p.timeZone?` (${p.timeZone})`:''}`}));}
}
register('mfe-build-provenance',BuildProvenance);
