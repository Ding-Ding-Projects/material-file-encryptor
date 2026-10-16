#!/usr/bin/env node
// Generates the information icon article (English and Cantonese) from the registered inventories, so the
// documentation can never drift from the explanations the icons show.
//
// Usage: node scripts/generate-info-icon-article.mjs [--check]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {DESKTOP_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-desktop.js';
import {SITE_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-site.js';
import {EXTENSION_POPUP_INFO_ICON_INVENTORY, EXTENSION_OPTIONS_INFO_ICON_INVENTORY} from '../src/shared/local-ux/info-icon-extension.js';
import {INFO_ICON_COPY, INFO_ICON_KINDS} from '../src/shared/local-ux/info-icon-inventory.js';

const SURFACES = [
  {inventory: DESKTOP_INFO_ICON_INVENTORY, title: ['Desktop app', '桌面程式'], page: 'src/renderer/index.html'},
  {inventory: SITE_INFO_ICON_INVENTORY, title: ['Website', '網站'], page: 'docs/site/index.html'},
  {inventory: EXTENSION_POPUP_INFO_ICON_INVENTORY, title: ['Browser extension popup', '瀏覽器擴充功能彈出視窗'], page: 'browser-extension/popup.html'},
  {inventory: EXTENSION_OPTIONS_INFO_ICON_INVENTORY, title: ['Browser extension workspace', '瀏覽器擴充功能工作區'], page: 'browser-extension/options.html'}
];
const yue = text => INFO_ICON_COPY[text] ?? text;

export function articleText(locale) {
  const cantonese = locale === 'yue';
  const pick = (en, zh) => cantonese ? zh : en;
  const word = text => cantonese ? yue(text) : text;
  const lines = [];
  lines.push(pick('# Information icons', '# 資訊圖示'), '');
  lines.push(pick(
    'Every capable control has its own compact information icon placed immediately before it, so it comes first in reading and keyboard order and stays attached to its control when a row wraps. The icon is a Material icon button bundled with the product, so it needs no network access. It stays closed until you open it.',
    '每個有功能的控制項，緊接在前面都有自己的精簡資訊圖示，所以在閱讀和鍵盤次序上排在控制項之前，換行時亦會跟住自己的控制項。圖示是隨產品附帶的 Material 圖示按鈕，不需要網絡連線，在你開啟之前都會保持關閉。'), '');
  lines.push(pick('## What the icon does', '## 圖示的作用'), '');
  lines.push(pick(
    '- Opens an explanation written for that one control: its purpose, options, default, effects, an example, validation and recovery.',
    '- 開啟專為該控制項撰寫的說明：用途、選項、預設值、影響、例子、驗證及復原方法。'));
  lines.push(pick(
    '- Offers guided steps with Back and Next. The last step only moves keyboard focus to the real control. The guide never presses it for you.',
    '- 提供有「上一步」和「下一步」的逐步指引。最後一步只會把鍵盤焦點移到真正的控制項，指引不會替你按下它。'));
  lines.push(pick(
    '- Shows an isolated sample with a worked example. The sample uses fixed demonstration values, runs only inside the explanation and never starts a real operation.',
    '- 顯示附有實例的獨立樣本。樣本使用固定的示範數值，只會在說明內運作，不會啟動任何真正的操作。'));
  lines.push(pick(
    '- Works from the keyboard. Enter or Space opens the icon, Escape closes it and returns focus to the icon. The desktop app and the website also list Guide and Explain commands in the command palette.',
    '- 可以用鍵盤操作。按 Enter 或空白鍵開啟圖示，按 Esc 關閉並把焦點交還圖示。桌面程式和網站亦會在指令面板列出「指引」和「解釋」指令。'));
  lines.push(pick(
    '- Names its target in the active language: English, Cantonese or both together.',
    '- 以目前使用的語言（英文、廣東話或兩者並列）說明它的目標。'), '');
  lines.push(pick('## Privacy and safety boundaries', '## 私隱及安全界線'), '');
  lines.push(pick(
    'An icon never reads the live value of its control, never copies private text such as a password, and never starts the original operation. A control that is disabled still explains itself, and only the guided start is disabled. The credential samples accept one fixed public demonstration text and store nothing.',
    '圖示不會讀取控制項的實際數值，不會複製密碼等私人文字，也不會啟動原有操作。停用的控制項仍然會解釋自己，只有「開啟逐步操作」會停用。憑證樣本只接受一段固定的公開示範文字，並且不儲存任何內容。'), '');
  lines.push(pick('## Coverage', '## 涵蓋範圍'), '');
  lines.push(pick(
    'The inventories below cover the static markup of each page and the controls that the page code creates at start-up. A coverage check reads each page as text and fails when a capable control has neither an explanation nor a stated reason.',
    '以下清單涵蓋各頁面的靜態標記，以及頁面程式在啟動時建立的控制項。涵蓋檢查會把每個頁面當作文字讀取，只要有功能的控制項既沒有說明、也沒有列明原因，檢查就會失敗。'), '');
  for (const surface of SURFACES) {
    const [capable, group, exempt] = [surface.inventory.descriptors.length, surface.inventory.descriptors.filter(row => row.group).length, surface.inventory.exemptions.length];
    lines.push(pick(
      `- ${surface.title[0]} (\`${surface.page}\`): ${capable} explanations (${group} for groups of related controls), ${exempt} stated exemptions.`,
      `- ${surface.title[1]}（\`${surface.page}\`）：${capable} 項說明（其中 ${group} 項涵蓋一組相關控制項），${exempt} 項列明的豁免。`));
  }
  lines.push('');
  lines.push(pick('## Controls not yet covered', '## 尚未涵蓋的控制項'), '');
  lines.push(pick(
    'Controls that feature modules create after start-up do not have an icon of this kind yet. This is partial coverage, not completion.',
    '功能模組在啟動後才建立的控制項，暫時還沒有這種圖示。這是部分涵蓋，並非完成。'), '');
  lines.push(pick('- Desktop app: the file table row controls, the history and recycle bin rows, and the controls of the access, converter, local models, server manager, storage maintenance, updates and status modules. The settings and server preparation modules already carry their own registered guidance.',
    '- 桌面程式：檔案表格的列控制項、歷史及資源回收筒的列，以及存取、轉換工具、本機模型、伺服器管理、儲存維護、更新和狀態模組的控制項。設定及伺服器準備模組已有各自登記的指引。'));
  lines.push(pick('- Website: the controls inside the workspace page, which reuse the settings guidance.', '- 網站：工作區頁面內的控制項，它們沿用設定指引。'));
  lines.push(pick('- Browser extension: the rows and panels that the notes, tickets, models, publishing, servers and converter modules create.', '- 瀏覽器擴充功能：筆記、支援單、模型、發佈、伺服器和轉換工具模組建立的列和面板。'), '');
  lines.push(pick('## Control kinds', '## 控制項類型'), '');
  lines.push(pick(
    'Options, validation, recovery and the guided steps are shared by every control of the same kind. Each control section below states its own purpose, effects, default and example.',
    '同一類型的控制項共用選項、驗證、復原方法和逐步指引。下面每個控制項的部分會列出它自己的用途、影響、預設值和例子。'), '');
  const all = SURFACES.flatMap(surface => surface.inventory.descriptors);
  for (const kind of INFO_ICON_KINDS) {
    const sample = all.find(row => row.kind === kind && row.options === all.find(item => item.kind === kind).options);
    if (!sample) continue;
    lines.push(`### kind-${kind}`, '');
    lines.push(`- ${pick('Options', '選項')}: ${word(sample.options)}`);
    lines.push(`- ${pick('Validation', '驗證')}: ${word(sample.validation)}`);
    lines.push(`- ${pick('Recovery', '復原方法')}: ${word(sample.recovery)}`);
    lines.push(`- ${pick('Steps', '步驟')}: ${sample.steps.map(word).join(' / ')}`, '');
  }
  lines.push(pick('## Verification', '## 驗證'), '');
  lines.push(pick(
    'Source checks mount every icon on a document fixture and open it from the keyboard. A guard test removes the icon, the target binding, the keyboard action and the contextual panel one at a time and requires each removal to fail. Built interaction and visual evidence are not recorded yet.',
    '原始碼檢查會在文件測試環境中掛載每個圖示，並用鍵盤開啟。守衛測試會逐一移除圖示、目標綁定、鍵盤操作和情境面板，並要求每次移除都導致失敗。已建置程式的互動及畫面證據尚未記錄。'), '');
  for (const surface of SURFACES) {
    lines.push(pick(`## ${surface.title[0]}`, `## ${surface.title[1]}`), '');
    for (const row of surface.inventory.descriptors) {
      lines.push(`### ${row.concept}`, '');
      lines.push(`**${word(row.label)}** — \`${row.selector}\``, '');
      lines.push(`- ${pick('Kind', '類型')}: ${row.kind}`);
      lines.push(`- ${pick('Purpose', '用途')}: ${word(row.purpose)}`);
      lines.push(`- ${pick('Effects', '影響')}: ${word(row.effects)}`);
      lines.push(`- ${pick('Default', '預設值')}: ${word(row.default)}`);
      lines.push(`- ${pick('Example', '例子')}: ${word(row.example)}`, '');
    }
    if (surface.inventory.exemptions.length) {
      lines.push(pick(`### Exemptions on the ${surface.title[0].toLowerCase()}`, `### ${surface.title[1]}的豁免項目`), '');
      for (const row of surface.inventory.exemptions) lines.push(`- \`${row.selector}\`: ${word(row.reason)}`);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

export const ARTICLE_FILES = Object.freeze({en: 'docs/features/interface/info-icon-guidance.md', yue: 'docs/features/interface/info-icon-guidance.zh-HK.md'});

export async function writeArticles(root, {check = false} = {}) {
  const stale = [];
  for (const [locale, relative] of Object.entries(ARTICLE_FILES)) {
    const file = path.join(root, relative), next = articleText(locale);
    let current = null;
    try { current = (await fs.readFile(file, 'utf8')).replaceAll('\r\n', '\n'); } catch { current = null; }
    if (current !== next) { stale.push(relative); if (!check) await fs.writeFile(file, next); }
  }
  return stale;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url)), check = process.argv.includes('--check');
  const stale = await writeArticles(root, {check});
  if (check && stale.length) { console.error('Stale generated article: ' + stale.join(', ')); process.exitCode = 1; }
  else console.log(check ? 'Information icon articles are current.' : 'Updated: ' + (stale.join(', ') || 'nothing'));
}
