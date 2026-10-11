export function inspectImageAttachment(encoded){
  if(typeof encoded!=='string'||encoded.length>1398104||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Invalid or oversized image attachment.');
  const bytes=Buffer.from(encoded,'base64');if(bytes.length>1024*1024||bytes.toString('base64')!==encoded)throw new Error('Invalid or oversized image attachment.');
  let width=0,height=0,type=null;
  if(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'){
    type='image/png';width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  }else if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216){
    type='image/jpeg';let offset=2;
    while(offset+4<=bytes.length){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;if([192,193,194].includes(marker)&&length>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;}offset+=length;}
  }else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    type='image/webp';const format=bytes.toString('ascii',12,16);
    if(format==='VP8X'){width=bytes.readUIntLE(24,3)+1;height=bytes.readUIntLE(27,3)+1;}
    else if(format==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
    else if(format==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  }
  if(!type||width<1||height<1||width>8192||height>8192||width*height>16000000)throw new Error('Image must be PNG, JPEG or WebP with known dimensions, at most 8192 pixels per side and 16 megapixels.');
  return {type,width,height,bytes:bytes.length};
}
