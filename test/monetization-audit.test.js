import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditRepository, scanSources, FREE_STATEMENTS } from '../scripts/audit-monetization.mjs';

const kinds = findings => [...new Set(findings.map(finding => finding.kind))].sort();

test('the shipped surfaces contain no paid features, purchase prompts or payment collection', () => {
  const { filesScanned, findings } = auditRepository();
  assert.ok(filesScanned > 100, `the audit should scan the renderer, extension and site sources (scanned ${filesScanned})`);
  assert.deepEqual(findings, [], findings.map(f => `${f.file}:${f.line} ${f.kind} "${f.match}"`).join('\n'));
});

test('the audit fails on every kind of planted violation', () => {
  const planted = [
    ['payment-sdk', "import Stripe from 'stripe';"],
    ['payment-host', "fetch('https://checkout.stripe.com/pay/abc')"],
    ['payment-collection', '<input autocomplete="cc-number">'],
    ['purchase-prompt', '<button>Upgrade to Pro</button>'],
    ['license-gating', 'if (!settings.licenseKey) lockEverything();'],
    ['trial-timer', 'banner.textContent = "Your trial has 3 days left";'],
    ['nag', 'toast("Please donate to keep this project alive")'],
    ['pricing', 'label.textContent = "$4.99 per month";'],
  ];
  for (const [kind, text] of planted) {
    const findings = scanSources([{ path: 'src/renderer/planted.js', text }]);
    assert.ok(findings.some(finding => finding.kind === kind), `${kind} should be reported for: ${text}`);
  }
  const csp = scanSources([{ path: 'src/main/csp.js', text: "const policy = \"Content-Security-Policy: default-src 'self'; script-src 'self' https://js.stripe.com; connect-src https://api.paypal.com\";" }]);
  assert.ok(csp.some(finding => finding.kind === 'csp-payment-host'));
});

test('the plain statement that the product is free is not a finding', () => {
  const english = 'Material File Encryptor is free. There are no purchases, subscriptions or paid features, nothing is unlocked by paying, and nothing here asks for payment details.';
  const extension = 'Material File Encryptor and this extension are free. There are no purchases, subscriptions or paid features, nothing is unlocked by paying, and nothing here asks for payment details.';
  const website = 'Price: Material File Encryptor is free. There are no purchases, subscriptions or paid features, nothing is unlocked by paying, and nothing on this website asks for payment details.';
  const cantonese = 'Material File Encryptor 係免費。冇購買、冇訂閱、冇收費功能，付款唔會解鎖任何嘢，呢度亦唔會要求你輸入付款資料。';
  assert.equal(FREE_STATEMENTS.length, 2);
  assert.deepEqual(scanSources([english, extension, website, cantonese].map((text, index) => ({ path: `statement-${index}.html`, text }))), []);
  // The exemption covers only the exact statement: the same words in a paid-feature sentence still fail.
  assert.ok(scanSources([{ path: 'x.html', text: 'Pro adds paid features and a premium tier.' }]).length > 0);
});

test('structural checks reject payment dependencies, extension permissions and missing price statements', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'monetization-audit-'));
  try {
    await fs.mkdir(path.join(root, 'browser-extension'), { recursive: true });
    await fs.mkdir(path.join(root, 'src/renderer'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@stripe/stripe-js': '1.0.0' } }));
    await fs.writeFile(path.join(root, 'browser-extension/manifest.json'), JSON.stringify({
      permissions: ['storage', 'payments'],
      host_permissions: ['https://www.paypal.com/*'],
      content_security_policy: { extension_pages: "script-src 'self'; connect-src https://js.stripe.com" },
    }));
    await fs.writeFile(path.join(root, 'src/renderer/index.html'), '<p>A drive.</p>');
    const result = auditRepository(root);
    assert.deepEqual(kinds(result.findings), ['csp-payment-host', 'dependency', 'manifest-permission', 'missing-price-statement', 'payment-host', 'payment-sdk'].sort());
    assert.equal(result.findings.filter(finding => finding.kind === 'missing-price-statement').length, 6);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the desktop Help view carries a localized price statement in a Material control', async () => {
  const html = await fs.readFile('src/renderer/index.html', 'utf8');
  const statement = html.match(/<section class="card price-statement"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(statement, /<md-list>\s*<md-list-item>/);
  assert.match(statement, /data-i18n>Price</);
  const i18n = await fs.readFile('src/renderer/i18n.js', 'utf8');
  for (const english of ['Price', 'Free, with nothing to buy']) assert.ok(i18n.includes(`'${english}':'`), `Cantonese entry for "${english}"`);
  const css = await fs.readFile('src/renderer/style.css', 'utf8');
  assert.match(css, /\.view:not\(\[hidden\]\)/, 'views, and the card inside them, enter with the shared Material motion');
});
