// An explicit >>> segment enters one open shadow root. It never substitutes a
// guessed descendant when the inventoried target is missing or ambiguous.
export function resolveLayoutTargets(selector){
 let roots=[document],matches=[];const parts=selector.split(' >>> ');
 for(let index=0;index<parts.length;index++){
  matches=roots.flatMap(root=>[...root.querySelectorAll(parts[index])]);
  if(index<parts.length-1){if(matches.length!==1||!matches[0].shadowRoot)throw Error('Layout shadow path is missing or ambiguous');roots=[matches[0].shadowRoot];}
 }
 return matches.filter(node=>node.getClientRects().length>0);
}

export function composedLayoutExpression(selector){
 return `(()=>{const selector=${JSON.stringify(selector)},resolve=${resolveLayoutTargets.toString()};const matches=resolve(selector);if(matches.length!==1)throw Error('Expected one visible composed layout target');const target=matches[0];const properties=['display','position','boxSizing','width','minWidth','maxWidth','height','minHeight','maxHeight','margin','padding','gap','flexDirection','flexBasis','flexGrow','flexShrink','gridTemplateColumns','gridTemplateRows','alignItems','justifyContent','overflowX','overflowY','transform','fontSize','lineHeight','visibility','opacity','zIndex'];const measure=(node,label)=>{const style=getComputedStyle(node),r=node.getBoundingClientRect();return {selector:label,matchedCount:1,chosenIndex:0,rect:Object.fromEntries(['x','y','top','right','bottom','left','width','height'].map(key=>[key,r[key]])),computed:Object.fromEntries(properties.map(key=>[key,style[key]]))};};const elements=[measure(target,selector)];let ancestor=target.parentElement||target.getRootNode()?.host;for(let i=0;ancestor&&i<4;i++,ancestor=ancestor.parentElement||ancestor.getRootNode()?.host)elements.push(measure(ancestor,'composed-ancestor:'+i));return {selector,matchedCount:matches.length,chosenIndex:0,selectionStrategy:'explicit-open-shadow-path',viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio},pageOverflow:document.documentElement.scrollWidth>innerWidth+1,elements,fields:[]};})()`;
}
