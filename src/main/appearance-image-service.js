import {inspectPngSource, validateImageSource, IMAGE_SOURCE_LIMITS} from '../renderer/features/personalization/image-source.js';

export const APPEARANCE_IMAGE_REQUEST_BYTES = Math.ceil(IMAGE_SOURCE_LIMITS.bytes * 4 / 3) + 256;

/** Decode untrusted image bytes only through the verified operating-system sandbox. */
export function createAppearanceImageService({getProvider}) {
  let closed=false, active=null, generation=0;
  async function normalize({dataUrl}={}) {
    if(closed)throw new Error('Image processing is stopping.');
    if(active)throw new Error('Another image is being processed.');
    if(typeof dataUrl!=='string'||dataUrl.length>APPEARANCE_IMAGE_REQUEST_BYTES||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl))throw new Error('Choose a static PNG no larger than 4 MiB.');
    const encoded=dataUrl.slice(22),input=Buffer.from(encoded,'base64');
    let before;
    try {if(input.toString('base64')!==encoded)throw new Error('Invalid PNG encoding.');before=inspectPngSource(input);}
    catch(error){input.fill(0);throw error;}
    const epoch=generation;
    const operation={worker:null,finished:null};active=operation;
    operation.finished=(async()=>{
      let output;
      try {
        const provider=await getProvider();
        if(closed||epoch!==generation)throw new Error('Image processing was cancelled.');
        if(provider?.verifiedOsIsolation!==true||provider?.verifiedMediaRuntime!==true)throw new Error('Verified isolated image decoding is unavailable.');
        operation.worker=provider.launch({inputs:[input],adapterId:'image-png',options:{},timeout:30000});
        const result=await operation.worker.result;
        if(closed||epoch!==generation)throw new Error('Image processing was cancelled.');
        if(result?.outputs?.length!==1||result.details?.decoded!==true||result.details?.metadataRemoved!==true)throw new Error('Image decoding did not return verified output.');
        output=result.outputs[0].bytes;
        if(!Buffer.isBuffer(output)||output.length>IMAGE_SOURCE_LIMITS.normalizedBytes)throw new Error('Normalized PNG exceeds 1 MiB.');
        const after=inspectPngSource(output);
        if(after.width!==before.width||after.height!==before.height)throw new Error('Image dimensions changed during decoding.');
        const source=validateImageSource({version:1,...after,dataUrl:'data:image/png;base64,'+output.toString('base64')});
        return {...source,isolation:'app-container'};
      } finally { input.fill(0);output?.fill(0);if(active===operation)active=null; }
    })();
    return operation.finished;
  }
  async function cancelAll(){generation++;const operation=active;if(operation){await operation.worker?.terminate();await operation.finished.catch(()=>{});}}
  return {normalize,cancelAll,get pending(){return active?1:0;},async close(){closed=true;await cancelAll();}};
}
