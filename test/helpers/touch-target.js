import assert from 'node:assert/strict';

export async function assertOwnedTouchTarget(locator,minimum=44) {
 assert.equal(await locator.count(),1,'Touch target must resolve exactly one control.');
 await locator.scrollIntoViewIfNeeded();
 const measured=await locator.evaluate((host,minimum)=>{
  const touch=host.shadowRoot?.querySelector('.touch');if(!touch)throw Error('Registered internal touch layer unavailable.');
  const rectangle=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const parent=node=>node.parentElement||node.getRootNode()?.host;
  const r=touch.getBoundingClientRect(),radius=minimum/2-0.5,hits=[];
  for(const dx of [-radius,0,radius])for(const dy of [-radius,0,radius]){
   const x=r.x+r.width/2+dx,y=r.y+r.height/2+dy;let node=host.ownerDocument.elementFromPoint(x,y);const visited=new Set();
   while(node?.shadowRoot&&!visited.has(node)){visited.add(node);const inner=node.shadowRoot.elementFromPoint(x,y);if(!inner||inner===node)break;node=inner;}
   let owned=false;for(let current=node;current;current=parent(current))if(current===host){owned=true;break;}
   hits.push({x,y,owned,hitTag:node?.localName??null,hitId:node?.id??null});
  }
  return {host:rectangle(host),touch:rectangle(touch),hits,minimum,disabled:!!host.disabled};
 },minimum);
 assert.equal(measured.disabled,false,'Touch control must be enabled.');
 assert.ok(measured.touch.width>=minimum&&measured.touch.height>=minimum,`Internal touch area must be at least ${minimum} CSS pixels in both dimensions.`);
 assert.ok(measured.hits.every(point=>point.owned),'Control must own all nine minimum-area hit points: '+JSON.stringify(measured));
 return measured;
}

export async function assertReducedTouchTargetRejected(locator,minimum=44) {
 const previous=await locator.evaluate(host=>{const touch=host.shadowRoot.querySelector('.touch'),style=touch.getAttribute('style');touch.style.width='40px';touch.style.height='40px';return style;});
 try{await assert.rejects(assertOwnedTouchTarget(locator,minimum),/Internal touch area must be at least/);}
 finally{await locator.evaluate((host,previous)=>{const touch=host.shadowRoot.querySelector('.touch');if(previous===null)touch.removeAttribute('style');else touch.setAttribute('style',previous);},previous);}
 return assertOwnedTouchTarget(locator,minimum);
}
