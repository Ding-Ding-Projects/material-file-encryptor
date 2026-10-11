import {BUNDLED_FONT_MANIFEST} from './manifest.js';
export {BUNDLED_FONT_MANIFEST};
/** Asset presence must come from the staging receipt, not this static inventory.
 * The integration owns exact alias/style mapping and actual renderer acceptance. */
export function bundledFontDescriptors({baseURL,verifiedAssets=false}={}){
 if(!baseURL)throw Error('A local bundled font base URL is required.');
 const base=new URL(baseURL),source=new URL(import.meta.url);if(!['file:','http:','https:'].includes(base.protocol)||base.protocol!==source.protocol||base.origin!==source.origin||!base.pathname.endsWith('/'))throw Error('A same-origin local asset directory is required.');
 return BUNDLED_FONT_MANIFEST.assets.filter(asset=>asset.face).map(asset=>({...structuredClone(asset.face),source:'bundled',url:new URL('assets/'+asset.name,base).href,bytes:asset.bytes,sha256:asset.sha256,availability:verifiedAssets?'staged-awaiting-renderer-validation':'unavailable',reason:verifiedAssets?'Exact CSS alias/style integration and rendered acceptance are pending.':'Verified local font staging is required.'}));
}
