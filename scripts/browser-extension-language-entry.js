// Reuse shared message styles without bundling unrelated desktop dictionaries.
import {MESSAGE_STYLES} from '../src/shared/local-ux/message-styles.js';
// Reduced motion inside Material Web shadow roots, shared with the desktop renderer and the documentation site.
export {installShadowReducedMotion} from '../src/shared/surface/reduced-motion.js';
export function styleExtensionMessage(pair,settings){
 if(!Array.isArray(pair)||pair.length!==2||pair.some(value=>typeof value!=='string'))throw new Error('A bounded translated message pair is required.');
 const level=value=>Number.isInteger(value)&&value>=1&&value<=5?value:5;
 return [pair[0]+MESSAGE_STYLES.en[level(settings.funnyEnglish)],pair[1]+MESSAGE_STYLES.yue[level(settings.funnyCantonese)]];
}
