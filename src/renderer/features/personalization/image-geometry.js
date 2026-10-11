export const IMAGE_TRANSFORM_SURFACE=Object.freeze({tag:'mfe-image-transform-inspector',role:'region',module:'../../renderer/features/personalization/image-transform-inspector.js',primitives:Object.freeze(['md-outlined-text-field','md-outlined-button','mfe-control-guidance'])});
/** Geometry only. No pixels, network, storage or target mutation. */
export const IMAGE_FITS=Object.freeze(['contain','cover','stretch']);
export function validateImagePlacement(value={}){
 const fit=value.fit;if(fit!==undefined&&!IMAGE_FITS.includes(fit))throw Error('Unsupported image fit.');
 const focalX=value.focalX??50,focalY=value.focalY??50;
 if(![focalX,focalY].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))throw Error('Image focal point must be between 0 and 100.');
 return fit===undefined?{}:{fit,focalX,focalY};
}
export function imageGeometry(sourceWidth,sourceHeight,width,height,transform={},legacyFit='contain'){
 if(![sourceWidth,sourceHeight,width,height].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))throw Error('Positive image and viewport dimensions are required.');
 const crop=transform.crop??[0,0,100,100];
 if(!Array.isArray(crop)||crop.length!==4||!crop.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100)||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>100||crop[1]+crop[3]>100)throw Error('Invalid image crop.');
 const placement=validateImagePlacement(transform),fit=placement.fit??legacyFit;
 if(!IMAGE_FITS.includes(fit))throw Error('Unsupported image fit.');
 const source=[sourceWidth*(crop[0]/100),sourceHeight*(crop[1]/100),sourceWidth*(crop[2]/100),sourceHeight*(crop[3]/100)];
 const scale=fit==='cover'?Math.max(width/source[2],height/source[3]):Math.min(width/source[2],height/source[3]);
 const dw=fit==='stretch'?width:source[2]*scale,dh=fit==='stretch'?height:source[3]*scale;
 const destination=[(width-dw)*(placement.focalX??50)/100,(height-dh)*(placement.focalY??50)/100,dw,dh];
 if(![...source,...destination].every(Number.isFinite))throw Error('Image geometry exceeds finite bounds.');
 return {source,destination:destination.map(n=>n===0?0:n),fit,explicit:placement.fit!==undefined};
}
