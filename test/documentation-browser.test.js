import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { documentHeadings } from '../src/features/documentation/catalog.mjs';

const enabled = process.env.DOCS_LOWLEVEL_CLI && process.env.DOCS_PLAYWRIGHT;
test('real isolated browser: safe Markdown, navigation, search, anchors, images and export', { skip: enabled ? false : 'Set DOCS_LOWLEVEL_CLI and DOCS_PLAYWRIGHT for the isolated browser test.' }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.DOCS_PLAYWRIGHT));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = '# Start\n\n[Details](details.md#target)\n\n[External](https://example.com/)\n\n[Unsafe](javascript:alert(1))\n\n| Name | Result |\n| --- | --- |\n| **Safe** | *Rendered* |\n\n```js\n<script>window.compromised=true</script>\n```\n\n![Local image](pixel.png)\n\n<script>window.compromised=true</script>';
  const detail = '# Details\n\n## Target\n\nUnique search phrase.\n\n- [x] Complete\n- Pending';
  const catalog = { documents: [{ id: 'docs/start', source: 'docs/start.md', title: 'Start', category: 'guide', markdown: source, headings: documentHeadings(source) }, { id: 'docs/details', source: 'docs/details.md', title: 'Details', category: 'guide', markdown: detail, headings: documentHeadings(detail) }], assets: [{ source: 'docs/pixel.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lksAAAAASUVORK5CYII=' }] };
  const html = `<!doctype html><meta charset="utf-8"><div id="host"></div><script type="module">import {mountDocumentation} from '/src/renderer/features/documentation/index.js'; import {mountChangelog} from '/src/renderer/features/documentation/changelog.js'; const catalog=${JSON.stringify(catalog).replaceAll('<', '\\u003c')}; window.view=mountDocumentation(document.getElementById('host'),{catalog,onExport:value=>window.exported=value}); window.showChanges=()=>{window.view.destroy();window.view=mountChangelog(document.getElementById('host'),{entries:[{title:'Version one',date:'2026-10-09',category:'Fix',markdown:'Old fix'},{title:'Version two',date:'2026-10-10',category:'Feature',markdown:'New addition'}],onExport:value=>window.exported=value})}; window.ready=true;</script>`;
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
      const file = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
      if (!file.startsWith(path.join(root, 'src') + path.sep)) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve)); const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const profile = await mkdtemp(path.join(tmpdir(), 'documentation-browser-'));
  const desktop = `documentation-${process.pid}-${Date.now()}`;
  const edge = process.env.DOCS_EDGE || path.join(process.env['ProgramFiles(x86)'] || process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe');
  const command = `"${edge}" --app=${url} --user-data-dir="${profile}" --remote-debugging-port=${port} --guest --disable-sync --disable-extensions --disable-component-extensions-with-background-pages --no-first-run --no-default-browser-check --edge-skip-compat-layer-relaunch --disable-features=msEdgeFirstRunExperience,msEdgeSignin,msEdgeSync`;
  let browser, launchPid;
  try {
    const launched = spawnSync(process.env.DOCS_LOWLEVEL_CLI, ['launch_on_headless_desktop', '--name', desktop, '--command', command], { encoding: 'utf8', windowsHide: true });
    assert.equal(launched.status, 0, launched.stderr); const receipt = JSON.parse(launched.stdout); assert.equal(receipt.ok, true); assert.ok(receipt.pid > 0); launchPid = receipt.pid;
    let targets;
    for (let attempt = 0; attempt < 100; attempt++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
    const preflight = () => { assert.equal(targets.length, 1, 'Only the exact test page may exist.'); assert.equal(targets[0].type, 'page'); assert.equal(targets[0].url, url); };
    preflight(); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser.contexts()[0].pages()[0]; const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.ready);
    assert.equal(await page.locator('table tbody strong').textContent(), 'Safe');
    assert.equal(await page.locator('table tbody em').textContent(), 'Rendered');
    assert.match(await page.locator('pre code').textContent(), /<script>/);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.locator('a[data-external="true"]').getAttribute('rel'), 'noopener noreferrer');
    await page.waitForFunction(() => document.querySelector('article img')?.naturalWidth === 1);
    await page.locator('article a', { hasText: 'Details' }).click();
    assert.equal(await page.locator('article h2').getAttribute('id'), 'target');
    await page.getByRole('button', { name: 'Export article', exact: true }).click();
    assert.equal(await page.evaluate(() => window.exported.text), detail);
    await page.getByRole('searchbox').fill('Unique search phrase');
    await page.waitForFunction(() => document.querySelectorAll('nav button').length === 1);
    assert.equal(await page.locator('nav button').textContent(), 'Details');
    await page.getByRole('searchbox').fill('');
    await page.waitForFunction(() => document.querySelectorAll('nav button').length === 2);
    await page.getByText('Regex builder', { exact: true }).click();
    await page.getByLabel('Use regular expression', { exact: true }).check();
    await page.getByRole('combobox').selectOption('Starts with');
    await page.getByRole('searchbox').fill('guide Start');
    await page.waitForFunction(() => document.querySelectorAll('nav button').length === 1);
    assert.equal(await page.locator('nav button').textContent(), 'Start');
    await page.evaluate(() => window.showChanges());
    await page.getByLabel('From date', { exact: true }).fill('2026-10-10');
    await page.getByLabel('Category', { exact: true }).selectOption('Feature');
    await page.waitForFunction(() => document.querySelectorAll('section').length === 1);
    assert.equal(await page.locator('section h3').textContent(), 'Version two');
    await page.getByRole('button', { name: 'Export filtered changes', exact: true }).click();
    assert.equal(await page.evaluate(() => window.exported.text), '## Version two\nNew addition');
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); preflight();
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 1500))]);
    // Only the PID returned by this test's launch is eligible for termination.
    if (launchPid) spawnSync('taskkill.exe', ['/PID', String(launchPid), '/T', '/F'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    let endpointGone = false;
    for (let attempt = 0; attempt < 30; attempt++) { try { await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(250) }); await new Promise(resolve => setTimeout(resolve, 100)); } catch { endpointGone = true; break; } }
    assert.ok(endpointGone, 'The owned browser endpoint must be gone.');
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // The browser profile is task-owned and was created directly above.
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    spawnSync(process.env.DOCS_LOWLEVEL_CLI, ['close_headless_desktop', '--name', desktop], { encoding: 'utf8', windowsHide: true });
  }
});
