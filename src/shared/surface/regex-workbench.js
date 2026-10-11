export const guidedTokens = Object.freeze([
 ['start','Start anchor','開頭錨點','^'],['end','End anchor','結尾錨點','$'],['any','Any character','任何字元','.'],
 ['word','Word boundary','文字邊界','\\b'],['digit','Digit','數字','\\d'],['space','Whitespace','空白','\\s'],
 ['unicode','Unicode letters','Unicode 字母','\\p{L}'],['codepoint','Unicode code point','Unicode 字碼','\\u{1F600}'],
 ['class','Character class','字元類別','[a-z]'],['negated','Negated class','排除字元類別','[^a-z]'],
 ['capture','Capture group','擷取群組','(text)'],['named','Named group','命名群組','(?<name>text)'],
 ['noncapture','Non-capturing group','非擷取群組','(?:text)'],['alternative','Alternative','選項','(?:one|two)'],
 ['optional','Optional','可選','?'],['many','Zero or more','零次或以上','*'],['one','One or more','一次或以上','+'],
 ['lazy','Lazy repetition','最少重複','+?'],['bounded','Bounded repetition','指定次數','{1,3}'],
 ['lookahead','Positive lookahead','正向前瞻','(?=text)'],['negativeAhead','Negative lookahead','負向前瞻','(?!text)'],
 ['lookbehind','Positive lookbehind','正向後顧','(?<=text)'],['negativeBehind','Negative lookbehind','負向後顧','(?<!text)'],
 ['reference','Numbered backreference','編號反向參照','\\1'],['namedReference','Named backreference','命名反向參照','\\k<name>']
]);

export const capabilities = Object.freeze([
 ['Named groups','命名群組','(?<name>a)','u'],['Lookbehind','後顧','(?<=a)b','u'],
 ['Unicode property escapes','Unicode 屬性逸出','\\p{L}','u'],['Match indices','符合位置','a','d'],
 ['Class intersection (v flag)','字元類別交集（v 旗標）','[\\p{ASCII}&&\\p{Letter}]','v'],
 ['Class subtraction (v flag)','字元類別相減（v 旗標）','[\\p{Letter}--[a-z]]','v'],
 ['Inline modifiers','行內修飾符','(?i:a)',''],['Atomic groups','原子群組','(?>a)',''],
 ['Possessive quantifiers','佔有式量詞','a++',''],['Conditionals','條件式','(?(1)a|b)',''],
 ['Subroutines / recursion','子程序／遞迴','(?R)','']
].map(([en,yue,pattern,flags])=>{try{new RegExp(pattern,flags);return{en,yue,pattern,flags,supported:true};}catch{return{en,yue,pattern,flags,supported:false};}}));

/** Lexical explanation, not a substitute for the browser's actual parser. */
export function describePattern(pattern) {
 const tokens=[];const stack=[];let classOpen=false;
 for(let i=0;i<pattern.length;){const start=i;const c=pattern[i++];let kind='literal';let explanation='Literal character';
  if(c==='\\'){kind='escape';i=Math.min(pattern.length,i+1);if(pattern[i-1]==='p'||pattern[i-1]==='P'||pattern[i-1]==='u'){if(pattern[i]==='{'){while(i<pattern.length&&pattern[i++]!=='}'){}}}explanation='Escaped character, class, boundary, or reference';}
  else if(c==='['){kind='class-open';classOpen=true;explanation='Start character class';}
  else if(c===']'&&classOpen){kind='class-close';classOpen=false;explanation='End character class';}
  else if(!classOpen&&c==='('){kind='group-open';stack.push(tokens.length);if(pattern[i]==='?'){i++;if(pattern[i]==='<'){i++;if(pattern[i]==='='||pattern[i]==='!')i++;else while(i<pattern.length&&pattern[i++]!=='>'){}}else if(':=!'.includes(pattern[i]))i++;}explanation='Start group or assertion';}
  else if(!classOpen&&c===')'){kind='group-close';explanation='End group';const open=stack.pop();if(open!==undefined)tokens[open].closesAt=start;}
  else if(!classOpen&&c==='|'){kind='alternation';explanation='Choose either alternative';}
  else if(!classOpen&&'^$'.includes(c)){kind='anchor';explanation='Assert input or line boundary';}
  else if(!classOpen&&'*+?{'.includes(c)){kind='quantifier';if(c==='{')while(i<pattern.length&&pattern[i++]!=='}'){}if(pattern[i]==='?')i++;explanation='Repeat preceding atom';}
  tokens.push({start,end:i,text:pattern.slice(start,i),kind,explanation,depth:stack.length});
 }
 const warnings=[];
 if(/\([^)]*[*+][^)]*\)[*+{]/.test(pattern))warnings.push('Nested repetition can cause exponential backtracking.');
 if(/\([^)]*\|[^)]*\)[*+{]/.test(pattern))warnings.push('Repeated alternatives can cause heavy backtracking.');
 if(/\\[1-9]|\\k</.test(pattern))warnings.push('Backreferences can make matching expensive.');
 if(pattern.length>256)warnings.push('Long expressions are harder to review and profile.');
 return{tokens,warnings,traceAvailable:false,traceReason:'JavaScript RegExp does not expose parser or backtracking steps. Worker timing and a hard timeout are provided instead.'};
}

export function createWorkbenchStore(storage,key) {
 let state={version:1,snippets:[],history:[],rememberHistory:false};
 try{const raw=storage?.getItem(key);if(raw&&raw.length<=131072){const parsed=JSON.parse(raw);if(parsed.version===1){state.rememberHistory=parsed.rememberHistory===true;state.snippets=sanitize(parsed.snippets,30);state.history=state.rememberHistory?sanitize(parsed.history,20):[];}}}catch{}
 function sanitize(entries,limit){return(Array.isArray(entries)?entries:[]).filter(e=>{if(!e||typeof e.pattern!=='string'||e.pattern.length>512||typeof e.flags!=='string'||!/^[dgimsuv]*$/.test(e.flags))return false;try{new RegExp(e.pattern,e.flags);return true;}catch{return false;}}).slice(-limit).map(e=>({name:String(e.name||'Expression').slice(0,80),pattern:e.pattern,flags:e.flags}));}
 function save(){try{storage?.setItem(key,JSON.stringify(state));}catch{}}
 return{get:()=>JSON.parse(JSON.stringify(state)),setHistory(enabled){state.rememberHistory=!!enabled;if(!enabled)state.history=[];save();},remember(pattern,flags){if(state.rememberHistory){state.history=state.history.filter(e=>e.pattern!==pattern||e.flags!==flags);state.history.push({name:'Recent expression',pattern,flags});state.history=state.history.slice(-20);save();}},add(name,pattern,flags){const entry=sanitize([{name,pattern,flags}],1)[0];if(!entry)return false;state.snippets.push(entry);state.snippets=state.snippets.slice(-30);save();return true;},remove(index){state.snippets.splice(index,1);save();},clear(){state.snippets=[];state.history=[];save();},import(value){if(value?.version!==1||!Array.isArray(value.snippets)||value.snippets.length>30)throw Error('Invalid snippet document');const entries=sanitize(value.snippets,30);if(entries.length!==value.snippets.length)throw Error('Invalid snippet entry');state.snippets=entries;save();},export:()=>JSON.stringify({version:1,snippets:state.snippets},null,2)};
}
