#!/usr/bin/env node
// Honest-monetization audit.
//
// Material File Encryptor is free: no paid features, purchase or upgrade prompts, payment collection,
// license-key gating, trial timers, nag dialogs or unlocks gated by payment. This audit turns that
// statement into a check that fails when any of those appear in a shipped surface.
//
// Scanned surfaces: the desktop renderer, main process and shared code (src/), the browser extension
// (browser-extension/) and the documentation website (docs/site/). Bundled third-party trees, fonts,
// icons and licence texts are not project code and are skipped.
//
// Finding kinds (each is a documented pattern list below, matched case-insensitively):
//   payment-sdk        a payment processor or in-app purchase library named in code or markup
//   payment-host       a payment processor host in any source, manifest permission or CSP
//   payment-collection card-number style fields, PaymentRequest, payment forms
//   purchase-prompt    buy, upgrade, premium or subscribe call-to-action wording
//   license-gating     license-key or activation-key checks, entitlement flags, paywalls
//   trial-timer        trial periods, trial countdowns, expiry into a locked state
//   nag                donation, sponsorship, review or rating requests
//   pricing            currency amounts per month or year, or price tags
//   dependency         a payment dependency in package.json
//   manifest-permission a payment permission or payment host in the extension manifest
//   csp-payment-host   a payment host inside a Content-Security-Policy
//   missing-price-statement  a surface that does not plainly state the product is free
//
// The plain statement that the product is free is itself allowed, so the exact sentences below are
// neutralized before scanning. Any wording change to those sentences must change this list too.
//
// Usage: node scripts/audit-monetization.mjs [--json]
// Exit status: 0 with no findings, 1 otherwise.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE_DIRS = ['src', 'browser-extension', 'docs/site'];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.svg']);
const SKIPPED_DIRS = new Set(['node_modules', 'vendor', 'fonts', 'icons', 'images', 'screenshots', '.git']);
const SKIPPED_FILE = /(?:^|[-_.])(?:license|licence|notice)(?:[-_.]|$)|\.map$|\.min\./i;

// The sentences by which surfaces state that the product is free. Matching text is blanked before
// the pattern scan, so a plain "no purchases or paid features" statement is never a finding.
export const FREE_STATEMENTS = [
  /There are no purchases, subscriptions or paid features, nothing is unlocked by paying, and nothing (?:here|on this website) asks for payment details\./gi,
  /冇購買、冇訂閱、冇收費功能，(?:冇嘢要[^。"']*|付款唔會解鎖任何嘢，[^。"']*)。/g,
];

const word = source => new RegExp(source, 'gi');
export const PATTERNS = [
  { kind: 'payment-sdk', pattern: word('\\b(?:stripe(?:\\.js)?|paypal|braintree|paddle(?:\\.js)?|lemon\\s?squeezy|gumroad|adyen|razorpay|mollie|revenuecat|coinbase[ -]commerce|apple pay|google pay|in-app-purchase|play billing)\\b') },
  { kind: 'payment-host', pattern: word('(?:stripe|paypal|paypalobjects|braintreegateway|paddle|gumroad|lemonsqueezy|adyen|razorpay|mollie|2checkout|squareup|checkout)\\.(?:com|net|io|me|app|co)\\b') },
  { kind: 'payment-collection', pattern: word('\\bcc-(?:number|exp|csc|name)\\b|\\bcredit card\\b|\\bdebit card\\b|\\bcard number\\b|\\bcvv\\b|\\bcvc\\b|\\bnew PaymentRequest\\b|\\bbilling address\\b|\\bpayment (?:method|details|form|page|screen)\\b') },
  { kind: 'purchase-prompt', pattern: word('\\b(?:buy now|purchase now|order now|upgrade now|upgrade to (?:pro|premium|plus|paid)|go (?:pro|premium)|get (?:pro|premium)|unlock (?:pro|premium|the full version|all features)|subscribe now|pro plan|premium plan|premium feature|premium tier|paid feature|paid upgrade|add to cart)\\b') },
  { kind: 'license-gating', pattern: word('\\b(?:licen[sc]e[ _-]?(?:key|code|serial)|activation[ _-]?(?:key|code)|product[ _-]?key|serial[ _-]?key|paywall|entitlement|isPremium|isPro|isPaid|hasPurchased|hasLicen[sc]e|unlockedByPayment|requiresPayment|requirePayment)\\b|unlock(?:ed)? (?:by|with|after) (?:paying|payment|purchase)') },
  { kind: 'trial-timer', pattern: word('\\b(?:free trial|trial (?:period|expires|expired|ends|ended|days)|days (?:left|remaining) in (?:your )?trial|trial(?:End|Expir\\w*|Remaining|Days)|your trial)\\b') },
  { kind: 'nag', pattern: word('\\b(?:please (?:donate|rate|review|support)|rate (?:us|this app)|leave a review|support (?:us|the project) (?:by|on)|become a (?:sponsor|patron|supporter|backer)|buy me a coffee|ko-fi|patreon|github sponsors|open ?collective|donat(?:e|ion|ions))\\b') },
  { kind: 'pricing', pattern: word('\\$\\s?\\d+(?:\\.\\d{2})?\\s?(?:/|per)\\s?(?:mo|month|yr|year)\\b|(?<![\\w$\'"`\\\\])[€£]\\s?\\d|(?<![\\w$\'"`\\\\{])\\$\\s?\\d+\\.\\d{2}\\b|\\bper (?:month|year|seat|user)\\b|\\b(?:monthly|annual|yearly) (?:plan|subscription|fee)\\b|\\bsubscription (?:plan|fee|required|expires|renews)\\b') },
];

const PAYMENT_DEPENDENCY = word('^(?:@?stripe(?:\\/.*)?|.*paypal.*|.*braintree.*|.*paddle.*|.*lemon-?squeezy.*|.*gumroad.*|.*adyen.*|.*razorpay.*|.*mollie.*|.*revenuecat.*|.*in-app-purchase.*|.*react-native-iap.*|.*square(?:up)?(?:-|$).*|.*checkout.*|.*payment.*|.*coinbase-commerce.*)$');
const PAYMENT_PERMISSION = word('\\bpayments?\\b|\\bpaymentRequest\\b');
const CSP_TOKEN = /content[-_]security[-_]policy/gi;

// Every surface must state plainly that the product is free, in its own shipped source.
export const REQUIRED_PRICE_STATEMENTS = [
  { surface: 'desktop', file: 'src/renderer/index.html', pattern: /id="price-statement"[\s\S]*?Material File Encryptor is free\. There are no purchases, subscriptions or paid features/ },
  { surface: 'desktop (Cantonese)', file: 'src/renderer/i18n.js', pattern: /Material File Encryptor is free\.[^']*':'Material File Encryptor 係免費。冇購買、冇訂閱、冇收費功能/ },
  { surface: 'extension', file: 'browser-extension/options.html', pattern: /data-copy="priceText">Material File Encryptor and this extension are free\.\s+There are no purchases, subscriptions or paid features/ },
  { surface: 'extension (Cantonese)', file: 'browser-extension/options.js', pattern: /priceText:\['Material File Encryptor and this extension are free\.[^\]]*'[^\]]*冇購買、冇訂閱、冇收費功能/ },
  { surface: 'website', file: 'docs/site/index.html', pattern: /Price: Material File Encryptor is free\. There are no purchases, subscriptions or paid features/ },
  { surface: 'website (Cantonese)', file: 'docs/site/locales.js', pattern: /'Price: Material File Encryptor is free\.[^']*':'價錢：Material File Encryptor 係免費。冇購買、冇訂閱、冇收費功能/ },
];

const neutralize = text => FREE_STATEMENTS.reduce((current, statement) => current.replace(statement, match => ' '.repeat(match.length)), text);

const lineOf = (text, index) => {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
};

const snippet = (text, index, length) => text.slice(Math.max(0, index - 30), index + length + 30).replace(/\s+/g, ' ').trim();

/** Scans in-memory sources: [{ path, text }]. Returns findings: [{ kind, file, line, match, context }]. */
export function scanSources(sources) {
  const findings = [];
  for (const { path, text } of sources) {
    const clean = neutralize(text);
    for (const { kind, pattern } of PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of clean.matchAll(pattern)) {
        findings.push({ kind, file: path, line: lineOf(clean, match.index), match: match[0], context: snippet(clean, match.index, match[0].length) });
      }
    }
    CSP_TOKEN.lastIndex = 0;
    for (const token of clean.matchAll(CSP_TOKEN)) {
      const window = clean.slice(token.index, token.index + 1200);
      const host = window.match(PATTERNS.find(entry => entry.kind === 'payment-host').pattern);
      if (host) findings.push({ kind: 'csp-payment-host', file: path, line: lineOf(clean, token.index), match: host[0], context: snippet(window, host.index, host[0].length) });
    }
  }
  return findings;
}

const walk = (root, dir) => {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const out = [];
  for (const name of readdirSync(absolute)) {
    if (SKIPPED_DIRS.has(name)) continue;
    const relativePath = `${dir}/${name}`;
    const stats = statSync(join(root, relativePath));
    if (stats.isDirectory()) out.push(...walk(root, relativePath));
    else if (!SKIPPED_FILE.test(name) && TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf('.')).toLowerCase())) out.push(relativePath);
  }
  return out;
};

const readJson = (root, file) => {
  const path = join(root, file);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
};

function structuralFindings(root) {
  const findings = [];
  const push = (kind, file, match, context) => findings.push({ kind, file, line: 1, match, context });
  const pkg = readJson(root, 'package.json');
  if (pkg === undefined) push('dependency', 'package.json', 'unparseable', 'package.json could not be parsed');
  else if (pkg) {
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const name of Object.keys(pkg[group] || {})) {
        PAYMENT_DEPENDENCY.lastIndex = 0;
        if (PAYMENT_DEPENDENCY.test(name)) push('dependency', 'package.json', name, `${group} lists ${name}`);
      }
    }
  }
  const manifest = readJson(root, 'browser-extension/manifest.json');
  if (manifest === undefined) push('manifest-permission', 'browser-extension/manifest.json', 'unparseable', 'manifest could not be parsed');
  else if (manifest) {
    const hostPattern = PATTERNS.find(entry => entry.kind === 'payment-host').pattern;
    const grants = [...(manifest.permissions || []), ...(manifest.optional_permissions || []), ...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])];
    for (const grant of grants) {
      PAYMENT_PERMISSION.lastIndex = 0; hostPattern.lastIndex = 0;
      if (PAYMENT_PERMISSION.test(String(grant)) || hostPattern.test(String(grant))) push('manifest-permission', 'browser-extension/manifest.json', String(grant), `permission ${grant}`);
    }
    const csp = manifest.content_security_policy;
    const policies = typeof csp === 'string' ? [csp] : Object.values(csp || {}).map(String);
    for (const policy of policies) {
      hostPattern.lastIndex = 0;
      const host = policy.match(hostPattern);
      if (host) push('csp-payment-host', 'browser-extension/manifest.json', host[0], `extension CSP names ${host[0]}`);
    }
  }
  return findings;
}

function priceStatementFindings(root) {
  const findings = [];
  for (const { surface, file, pattern } of REQUIRED_PRICE_STATEMENTS) {
    const path = join(root, file);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (!pattern.test(text)) findings.push({ kind: 'missing-price-statement', file, line: 1, match: surface, context: `The ${surface} surface must state plainly that the product is free.` });
  }
  return findings;
}

/** Audits a repository root. Returns { filesScanned, findings }. */
export function auditRepository(root = defaultRoot) {
  const files = SOURCE_DIRS.flatMap(dir => walk(root, dir));
  const sources = files.map(file => ({ path: file, text: readFileSync(join(root, file), 'utf8') }));
  const findings = [...scanSources(sources), ...structuralFindings(root), ...priceStatementFindings(root)];
  return { filesScanned: files.length, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { filesScanned, findings } = auditRepository();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ filesScanned, findings }, null, 2));
  else {
    for (const finding of findings) console.log(`${finding.file}:${finding.line}  ${finding.kind}  "${finding.match}"  ${finding.context}`);
    console.log(`monetization audit: ${findings.length} finding(s) across ${filesScanned} files`);
  }
  process.exitCode = findings.length ? 1 : 0;
}

