// Adds Open Graph and Twitter card metadata to a built page. Only ordinary public wording is used.
export const SITE_URL = 'https://ding-ding-projects.github.io/material-file-encryptor/';
export const SOCIAL_IMAGE = { path: 'images/drive-workflow.png', type: 'image/png', alt: 'Conceptual diagram of how an encrypted folder appears as a drive in File Explorer' };
const SITE_NAME = 'Material File Encryptor';
const CANTONESE_DESCRIPTION = '完整產品文件同有來源綁定嘅截圖紀錄。';

const attribute = value => String(value).replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function addSocialMetadata(html, file) {
  if (/property="og:title"/.test(html)) return html;
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1];
  const closing = html.indexOf('</head>');
  if (!title || closing < 0) throw new Error(`Cannot add social metadata to ${file}: missing title or head`);
  const cantonese = file.endsWith('.zh-HK.html');
  let description = /<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? SITE_NAME;
  if (cantonese && description === 'Complete product documentation and source-bound capture records.') {
    description = CANTONESE_DESCRIPTION;
    html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`);
  }
  const url = file === 'index.html' ? SITE_URL : SITE_URL + file.split('/').map(encodeURIComponent).join('/');
  const image = SITE_URL + SOCIAL_IMAGE.path;
  const tags = [
    ['property', 'og:title', title], ['property', 'og:description', description],
    ['property', 'og:type', file.startsWith('articles/') ? 'article' : 'website'],
    ['property', 'og:url', url], ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:locale', cantonese ? 'zh_HK' : 'en_US'],
    ...(file === 'index.html' ? [['property', 'og:locale:alternate', 'zh_HK']] : []),
    ['property', 'og:image', image], ['property', 'og:image:type', SOCIAL_IMAGE.type], ['property', 'og:image:alt', SOCIAL_IMAGE.alt],
    ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', title], ['name', 'twitter:description', description],
    ['name', 'twitter:image', image], ['name', 'twitter:image:alt', SOCIAL_IMAGE.alt],
  ].map(([kind, name, content]) => `<meta ${kind}="${name}" content="${attribute(content)}">`).join('');
  const at = html.indexOf('</head>');
  return html.slice(0, at) + tags + html.slice(at);
}
