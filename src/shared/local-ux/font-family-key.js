import {CASE_FOLDING} from '../unicode/case-folding-17.0.0.js';
/** CSS Fonts localized name matching: Unicode Default Caseless Matching using
 * pinned C/F mappings only, without normalization or locale tailoring. */
export function fontFamilyKey(value){
 if(typeof value!=='string')throw Error('A font family name must be text.');
 let result='';for(const character of value)result+=CASE_FOLDING[character.codePointAt(0)]??character;return result;
}
