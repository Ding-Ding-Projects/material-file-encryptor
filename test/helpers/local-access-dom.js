// Minimal DOM for exercising actual access rendering and refresh callbacks in Node.
// This fixture makes no claim about browser layout or assistive-technology behavior.
class Node {
 constructor(document,tag=null,text=''){this.ownerDocument=document;this.tagName=tag?.toUpperCase();this.nodeType=tag?1:3;this.nodeValue=text;this.childNodes=[];this.parentNode=null;this.attributes=new Map();this.dataset={};this.listeners=new Map();this._value=undefined;}
 get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
 get children(){return this.childNodes.filter(n=>n.nodeType===1);}
 get isConnected(){return this===this.ownerDocument.body||!!this.parentNode?.isConnected;}
 get textContent(){return this.nodeType===3?this.nodeValue:this.childNodes.map(n=>n.textContent).join('');}
 set textContent(value){if(this.nodeType===3){this.nodeValue=String(value);return;}this.replaceChildren();if(value!=='')this.append(this.ownerDocument.createTextNode(String(value)));}
 get value(){return this._value??(this.tagName==='SELECT'?this.children[0]?.value||'':'');}
 set value(value){this._value=String(value);}
 append(...nodes){for(let node of nodes){if(typeof node==='string')node=this.ownerDocument.createTextNode(node);node.remove();node.parentNode=this;this.childNodes.push(node);}}
 replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];this.append(...nodes);}
 remove(){if(this.parentNode)this.parentNode.childNodes=this.parentNode.childNodes.filter(node=>node!==this);this.parentNode=null;}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
 hasAttribute(name){return this.attributes.has(name);}
 addEventListener(name,listener){const list=this.listeners.get(name)||[];list.push(listener);this.listeners.set(name,list);}
 removeEventListener(name,listener){this.listeners.set(name,(this.listeners.get(name)||[]).filter(fn=>fn!==listener));}
 dispatchEvent(event){return Promise.all((this.listeners.get(event.type)||[]).map(fn=>fn(event)));}
 click(){return this.dispatchEvent({type:'click',target:this,preventDefault(){},stopImmediatePropagation(){}});}
 focus(){this.ownerDocument.activeElement=this;}
 scrollIntoView(){}
 matches(selector){if(selector==='*')return this.nodeType===1;if(selector.startsWith('[')){const match=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);if(!match)return false;const name=match[1],value=name.startsWith('data-')?this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.getAttribute(name);return value!==undefined&&value!==null&&(match[2]===undefined||String(value)===match[2]);}return this.tagName===selector.toUpperCase();}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
}
export function createAccessDocument(){const document={activeElement:null,createElement(tag){return new Node(document,tag);},createTextNode(text){return new Node(document,null,text);},createTreeWalker(root){const nodes=[];const walk=node=>{for(const child of node.childNodes){if(child.nodeType===3)nodes.push(child);else walk(child);}};walk(root);let index=0;return{nextNode:()=>nodes[index++]||null};}};document.body=new Node(document,'body');document.activeElement=document.body;return document;}
