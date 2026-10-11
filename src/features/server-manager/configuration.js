const types = new Set(['boolean','enum','integer','number','string']);
const controls = Object.freeze({boolean:'switch',enum:'searchable-select',integer:'numeric-stepper',number:'numeric-stepper',string:'text'});
const safeKey = key => typeof key==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(key) && !['constructor','prototype','__proto__'].includes(key);
export function validateDescriptors(descriptors, binding) {
  if(!binding || !['java','bedrock'].includes(binding.edition) || typeof binding.version!=='string' || !binding.version || !/^[a-f0-9]{64}$/.test(binding.distributionSha256)) throw new Error('Verified selected-distribution binding is required.');
  if(!Array.isArray(descriptors)||descriptors.length>4096) throw new Error('Invalid descriptor inventory.');
  const ids=new Set();
  return descriptors.map(d=>{
    if(!d||!safeKey(d.id)||ids.has(d.id)||!types.has(d.type)||d.edition!==binding.edition||d.version!==binding.version||d.distributionSha256!==binding.distributionSha256) throw new Error('Configuration descriptor binding mismatch.');
    ids.add(d.id);
    const source=new URL(d.sourceUrl);
    if(source.protocol!=='https:'||source.username||source.password||!['learn.microsoft.com','www.minecraft.net','github.com'].includes(source.hostname)||!d.sourceRevision||!d.helpId||!d.permission||!d.consumer||!['live','restart','unknown'].includes(d.applyMode)) throw new Error('Descriptor source or consumer is incomplete.');
    if(d.type==='enum'&&(!Array.isArray(d.choices)||d.choices.length===0||d.choices.some(x=>typeof x!=='string')||new Set(d.choices).size!==d.choices.length)) throw new Error('Invalid supported choices.');
    for(const key of ['min','max']) if(d[key]!==undefined&&!Number.isFinite(d[key])) throw new Error('Invalid numeric bound.');
    if(d.min!==undefined&&d.max!==undefined&&d.min>d.max) throw new Error('Reversed numeric bounds.');
    const descriptor=structuredClone({...d,control:controls[d.type]});
    if(Object.hasOwn(d,'default')) validateConfigurationValue(descriptor,d.default);
    return descriptor;
  });
}
export function validateConfigurationValue(d,value) {
  if(d.type==='boolean'&&typeof value!=='boolean'||d.type==='string'&&(typeof value!=='string'||value.length>65536)||d.type==='enum'&&!d.choices.includes(value)||['integer','number'].includes(d.type)&&(!Number.isFinite(value)||d.type==='integer'&&!Number.isSafeInteger(value)||d.min!==undefined&&value<d.min||d.max!==undefined&&value>d.max)) throw new Error('Configuration value violates selected-version descriptor.');
  return value;
}
export function applyConfigurationPatch(original,patch,descriptors,binding) {
  const inventory=validateDescriptors(descriptors,binding);
  if(!original||typeof original!=='object'||Array.isArray(original)||!patch||typeof patch!=='object'||Array.isArray(patch)) throw new Error('Configuration records are required.');
  const result=structuredClone(original);
  for(const [key,value] of Object.entries(patch)) {
    const d=inventory.find(x=>x.id===key);
    if(!d||!safeKey(key)) throw new Error('Unknown extensions are preserved but cannot be edited without a descriptor.');
    Object.defineProperty(result,key,{value:validateConfigurationValue(d,value),writable:true,enumerable:true,configurable:true});
  }
  return result;
}
