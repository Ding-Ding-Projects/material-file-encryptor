import qrcode from './vendor/qrcode-generator.js';
import jsQR from './vendor/jsqr.js';
import {parseOtpUri,validateOtp} from './crypto.js';
export function otpUri(entry) {
  validateOtp(entry);
  const label=entry.issuer?`${entry.issuer}:${entry.account}`:entry.account;
  const params=new URLSearchParams({secret:entry.secret,issuer:entry.issuer||'',algorithm:entry.algorithm,digits:String(entry.digits),period:String(entry.period)});
  return `otpauth://totp/${encodeURIComponent(label)}?${params}`;
}
export function qrMatrix(uri) {
  if(typeof uri!=='string'||uri.length>2048)throw new Error('Registration URI is too large.');
  parseOtpUri(uri);
  const qr=qrcode(0,'M');qr.addData(uri,'Byte');qr.make();
  return Array.from({length:qr.getModuleCount()},(_,y)=>Array.from({length:qr.getModuleCount()},(_,x)=>qr.isDark(y,x)));
}
export function qrPixels(uri,scale=6) {
  const matrix=qrMatrix(uri),width=(matrix.length+8)*scale,data=new Uint8ClampedArray(width*width*4);data.fill(255);
  for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const at=(((y+4)*scale+dy)*width+(x+4)*scale+dx)*4;data[at]=data[at+1]=data[at+2]=0;}
  return {data,width,height:width};
}
export function qrSvg(uri) {
  const matrix=qrMatrix(uri),size=matrix.length+8;let path='';
  for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])path+=`M${x+4},${y+4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size*6}" height="${size*6}" role="img" aria-label="Authenticator registration QR code"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
export function decodeQrPixels(data,width,height) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>4194304||data.length!==width*height*4)throw new Error('QR image exceeds the 4 megapixel limit.');
  const found=jsQR(data,width,height,{inversionAttempts:'attemptBoth'});if(!found)throw new Error('No readable QR code was found.');parseOtpUri(found.data);return found.data;
}
export async function decodeQrBlob(blob,document) {
  if(!blob||blob.size>8*1024*1024||!['image/png','image/jpeg','image/webp','image/gif'].includes(blob.type))throw new Error('Choose a PNG, JPEG, WebP or GIF image smaller than 8 MiB.');
  const bitmap=await createImageBitmap(blob);try{if(bitmap.width*bitmap.height>4194304)throw new Error('QR image exceeds the 4 megapixel limit.');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);return decodeQrPixels(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);}finally{bitmap.close();}
}
