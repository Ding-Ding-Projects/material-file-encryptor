import qrcode from '../access/vendor/qrcode-generator.js';

/** A QR code for a download link. Only http(s) links of a sane length are drawn. */
export function linkQrMatrix(url) {
  if (typeof url !== 'string' || url.length > 1200 || !/^https?:\/\/[^\s]+$/.test(url)) throw new Error('Only a download link can be drawn as a QR code.');
  const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => qr.isDark(y, x)));
}

/** An SVG element (built with DOM calls) for the link, with a four-module quiet zone. */
export function linkQrSvg(url, doc = document, label = 'QR code') {
  const matrix = linkQrMatrix(url), size = matrix.length + 8, ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', '232'); svg.setAttribute('height', '232');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); svg.setAttribute('shape-rendering', 'crispEdges');
  const background = doc.createElementNS(ns, 'rect'); background.setAttribute('width', String(size)); background.setAttribute('height', String(size)); background.setAttribute('fill', '#ffffff');
  let d = '';
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++) if (matrix[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const path = doc.createElementNS(ns, 'path'); path.setAttribute('d', d); path.setAttribute('fill', '#000000');
  svg.append(background, path);
  return svg;
}

/** A PNG data URL of the QR code, for saving. */
export function linkQrPng(url, doc = document, scale = 10) {
  const matrix = linkQrMatrix(url), size = (matrix.length + 8) * scale;
  const canvas = doc.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size); context.fillStyle = '#000000';
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++) if (matrix[y][x]) context.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
  return canvas.toDataURL('image/png');
}
