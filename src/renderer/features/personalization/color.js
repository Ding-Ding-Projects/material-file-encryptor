export const RAINBOW = Object.freeze({ kind: 'rainbow' });
export const rainbowDuration = level => `${61 - Math.max(1, Math.min(10, Number(level) || 5)) * 6}s`;
export function parseColor(value) {
  const match = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(String(value));
  if (!match) throw new TypeError('Use #RRGGBB or #RRGGBBAA.');
  return [...match[1].match(/../g).map(n => parseInt(n, 16)), match[2] ? parseInt(match[2], 16) / 255 : 1];
}
export function colorRepresentations(value) {
  const [r,g,b,a] = parseColor(value), channels=[r,g,b].map(v=>v/255), max=Math.max(...channels), min=Math.min(...channels), d=max-min;
  let h=0; if(d) h=60*(max===channels[0]?((channels[1]-channels[2])/d)%6:max===channels[1]?(channels[2]-channels[0])/d+2:(channels[0]-channels[1])/d+4); if(h<0)h+=360;
  const l=(max+min)/2, s=d?d/(1-Math.abs(2*l-1)):0;
  return {...perceptualColors(value),hex:value, rgb:`rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`, hsl:`hsla(${+h.toFixed(2)}, ${+(s*100).toFixed(2)}%, ${+(l*100).toFixed(2)}%, ${+a.toFixed(3)})`, hsv:[h,max?d/max:0,max,a], hwb:[h,min,1-max,a], cmyk:[max?(max-channels[0])/max:0,max?(max-channels[1])/max:0,max?(max-channels[2])/max:0,1-max,a]};
}
export function contrastRatio(foreground,background) {
  const fg=parseColor(foreground), bg=parseColor(background);
  const lum=rgb=>rgb.slice(0,3).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const blended=fg.slice(0,3).map((c,i)=>c*fg[3]+bg[i]*(1-fg[3]));
  const a=lum(blended),b=lum(bg); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const gamma=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
const polar=([l,a,b])=>[l,Math.hypot(a,b),(Math.atan2(b,a)*180/Math.PI+360)%360];
const cartesian=([l,c,h])=>[l,c*Math.cos(h*Math.PI/180),c*Math.sin(h*Math.PI/180)];
export function perceptualColors(value){
 const [r,g,b,alpha]=parseColor(value),[R,G,B]=[r,g,b].map(c=>linear(c/255));
 const f=t=>t>216/24389?Math.cbrt(t):t*841/108+4/29;
 const x=f((.4124564*R+.3575761*G+.1804375*B)/.95047),y=f(.2126729*R+.7151522*G+.072175*B),z=f((.0193339*R+.119192*G+.9503041*B)/1.08883);
 const lab=[116*y-16,500*(x-y),200*(y-z)];
 const l=Math.cbrt(.4122214708*R+.5363325363*G+.0514459929*B),m=Math.cbrt(.2119034982*R+.6806995451*G+.1073969566*B),s=Math.cbrt(.0883024619*R+.2817188376*G+.6299787005*B);
 const oklab=[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
 return {lab:[...lab,alpha],lch:[...polar(lab),alpha],oklab:[...oklab,alpha],oklch:[...polar(oklab),alpha]};
}
/** Parse bounded sRGB and D65 perceptual entries; never silently clip gamut. */
export function parseColorEntry(input){
 if(/^#[\da-f]{6}([\da-f]{2})?$/i.test(input)){parseColor(input);return input.toLowerCase();}
 const m=/^(lab|lch|oklab|oklch|rgb|rgba|hsl|hsla)\(\s*([^)]*)\)$/i.exec(String(input));if(!m)throw new Error('Use HEX, RGB, HSL, Lab, LCH, OKLab or OKLCH.');
 const parts=m[2].split(/[\s,\/]+/).filter(Boolean);if(parts.length<3||parts.length>4||parts.some(p=>!/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?%?$/i.test(p)))throw new Error('Invalid color channels.');
 const nums=parts.map(p=>parseFloat(p)),alpha=parts.length===4?nums[3]/(parts[3].endsWith('%')?100:1):1;let rgb;
 const kind=m[1].toLowerCase();let [a,b,c]=nums;
 if(kind.startsWith('rgb'))rgb=parts.slice(0,3).map((p,i)=>nums[i]/(p.endsWith('%')?100:255));
 else if(kind.startsWith('hsl')){b/=100;c/=100;const q=(1-Math.abs(2*c-1))*b,x=q*(1-Math.abs(((a%360+360)%360/60)%2-1)),off=c-q/2;rgb=(a=((a%360+360)%360),a<60?[q,x,0]:a<120?[x,q,0]:a<180?[0,q,x]:a<240?[0,x,q]:a<300?[x,0,q]:[q,0,x]).map(v=>v+off);}
 else {if(kind==='lch'||kind==='oklch')[a,b,c]=cartesian([a,b,c]);let values;
 if(kind.startsWith('ok')){const l=(a+.3963377774*b+.2158037573*c)**3,m=(a-.1055613458*b-.0638541728*c)**3,s=(a-.0894841775*b-1.291485548*c)**3;values=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];}
 else{const f=t=>t**3>216/24389?t**3:(t-4/29)*108/841,y=(a+16)/116,x=.95047*f(y+b/500),Y=f(y),z=1.08883*f(y-c/200);values=[3.2404542*x-1.5371385*Y-.4985314*z,-.969266*x+1.8760108*Y+.041556*z,.0556434*x-.2040259*Y+1.0572252*z];}rgb=values.map(gamma);}
 if(![...rgb,alpha].every(v=>Number.isFinite(v)&&v>=-.00001&&v<=1.00001))throw new Error('Color is outside the sRGB gamut or alpha range.');
 return '#'+[...rgb,alpha].map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
}
