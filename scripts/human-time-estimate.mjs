#!/usr/bin/env node
// Estimates how long a person would take to write this project by hand, from what the repository
// actually contains. It is an estimate, never a measurement: nobody built the project that way.
//
// Method (every input is printed, so a reader can disagree with an assumption, not just the answer):
//   1. List tracked files with `git ls-files`. Read each text file from the working tree.
//   2. Count non-blank lines of hand-written code in five buckets (see BUCKETS).
//   3. Leave out, and state, everything that is not hand-written code: vendored and bundled trees,
//      fonts, lockfiles, minified files, images and other binaries, JSON data and catalogues, design
//      reference prototypes, and Markdown prose. Markdown is reported but not estimated.
//   4. Weight each bucket by a multiplier for how much harder than its size it is, and sum.
//   5. Divide by a lines-per-working-day rate. The rate is a range, so the answer is a range:
//        optimistic   50 non-blank lines per 8-hour day of finished, reviewed, debugged code
//        conservative 25 non-blank lines per 8-hour day
//      Twenty working days make one person-month.
//
// Known limits, stated plainly: part of the application source is written as long lines, so line
// counts understate its size; the rates are common industry rules of thumb, not measurements of
// this team; and the figure says nothing about design, research, review or testing time beyond the
// test code counted here.
//
// Usage:
//   node scripts/human-time-estimate.mjs            print the table and the estimate
//   node scripts/human-time-estimate.mjs --json     print machine-readable inputs and results
//   node scripts/human-time-estimate.mjs --readme   print the README block
//   node scripts/human-time-estimate.mjs --write    rewrite the README block in place
//   node scripts/human-time-estimate.mjs --check    exit 1 unless the README block is current
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const RATES = Object.freeze({ optimistic: 50, conservative: 25 });
export const WORKING_DAYS_PER_MONTH = 20;
/** The README figure may drift from a fresh count by this fraction before the check fails. */
export const TOLERANCE = 0.1;
/** The README section this script owns: this heading up to the next level-two heading. */
export const SECTION_HEADING = '## Project size and human-time estimate';

export const BUCKETS = Object.freeze([
  { id: 'application', label: 'Application source (JavaScript)', multiplier: 1, why: 'Renderer, main process, shared code, browser extension and documentation website scripts.' },
  { id: 'native', label: 'Native engine and drive adapter (C#)', multiplier: 1.5, why: 'Encrypted storage engine, journal and filesystem adapter: harder than its size suggests.' },
  { id: 'markup', label: 'Styles and markup (CSS, HTML)', multiplier: 1, why: 'Stylesheets and page templates.' },
  { id: 'tests', label: 'Tests', multiplier: 1, why: 'Automated tests in any language.' },
  { id: 'tooling', label: 'Build, release and tooling scripts', multiplier: 1, why: 'Root entrypoints, scripts/, workflows and hooks.' },
]);

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.cs', '.css', '.html', '.py', '.ps1', '.bat', '.sh', '.yml', '.yaml']);
const VENDOR_SEGMENT = /(?:^|\/)(?:vendor|node_modules|fonts|bin|obj)(?:\/|$)/i;
const LOCKFILE = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.lock)$/i;
const MINIFIED = /\.min\.[a-z]+$/i;

const extensionOf = path => { const dot = path.lastIndexOf('.'); return dot < 0 ? '' : path.slice(dot).toLowerCase(); };

/** Returns { bucket } for hand-written code, or { excluded: reason }. */
export function classify(path) {
  if (/^design\//.test(path)) return { excluded: 'design reference prototypes' };
  if (VENDOR_SEGMENT.test(path)) return { excluded: 'vendored, bundled or build-output trees' };
  if (LOCKFILE.test(path)) return { excluded: 'lockfiles' };
  if (MINIFIED.test(path)) return { excluded: 'minified files' };
  const extension = extensionOf(path);
  if (extension === '.md') return { excluded: 'Markdown prose (counted separately, not estimated)' };
  if (!CODE_EXTENSIONS.has(extension)) return { excluded: 'images, JSON data and catalogues, and other non-code files' };
  const isTest = /^test\//.test(path) || /(?:^|\/)[^/]*\.Tests?\//.test(path) || /\.test\.[cm]?js$/.test(path) || /(?:^|\/)test_[^/]*\.py$/.test(path);
  if (isTest) return { bucket: 'tests' };
  if (extension === '.cs') return { bucket: 'native' };
  if (extension === '.css' || extension === '.html') return { bucket: 'markup' };
  if (/^scripts\//.test(path) || /^\.github\//.test(path) || /^\.githooks\//.test(path) || !path.includes('/')) return { bucket: 'tooling' };
  if (['.js', '.mjs', '.cjs'].includes(extension)) return { bucket: 'application' };
  return { bucket: 'tooling' };
}

const countLines = text => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return { total: lines.length, nonBlank: lines.filter(line => line.trim() !== '').length };
};

/** The arithmetic from weighted lines to days and months, shared by the script and its test. */
export function arithmetic(weighted) {
  const dayRange = { low: Math.round(weighted / RATES.optimistic), high: Math.round(weighted / RATES.conservative) };
  const monthRange = {
    low: Math.round((weighted / RATES.optimistic / WORKING_DAYS_PER_MONTH) * 10) / 10,
    high: Math.round((weighted / RATES.conservative / WORKING_DAYS_PER_MONTH) * 10) / 10,
  };
  return { days: dayRange, months: monthRange };
}

/** Counts a list of tracked paths. `read(path)` returns text, or null when the file is binary or missing. */
export function estimateFromFiles(paths, read) {
  const buckets = Object.fromEntries(BUCKETS.map(bucket => [bucket.id, { files: 0, total: 0, nonBlank: 0 }]));
  const excluded = {};
  let markdown = { files: 0, nonBlank: 0 };
  for (const path of paths) {
    const result = classify(path);
    if (result.excluded) {
      excluded[result.excluded] = (excluded[result.excluded] || 0) + 1;
      if (result.excluded.startsWith('Markdown prose')) {
        const text = read(path);
        if (text !== null) { markdown = { files: markdown.files + 1, nonBlank: markdown.nonBlank + countLines(text).nonBlank }; }
      }
      continue;
    }
    const text = read(path);
    if (text === null) { excluded['binary or unreadable files'] = (excluded['binary or unreadable files'] || 0) + 1; continue; }
    const counts = countLines(text);
    const bucket = buckets[result.bucket];
    bucket.files += 1; bucket.total += counts.total; bucket.nonBlank += counts.nonBlank;
  }
  const weighted = Math.round(BUCKETS.reduce((sum, bucket) => sum + buckets[bucket.id].nonBlank * bucket.multiplier, 0));
  const nonBlank = BUCKETS.reduce((sum, bucket) => sum + buckets[bucket.id].nonBlank, 0);
  return { buckets, excluded, markdown, nonBlank, weighted, ...arithmetic(weighted) };
}

/** Counts the tracked files of a working tree. */
export function computeEstimate(root = defaultRoot) {
  const listing = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const paths = listing.split('\0').filter(Boolean);
  return estimateFromFiles(paths, path => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) return null;
    const bytes = readFileSync(absolute);
    return bytes.includes(0) ? null : bytes.toString('utf8');
  });
}

const number = value => value.toLocaleString('en-US');

export function renderReadmeBlock(estimate) {
  const { months, days, weighted } = estimate;
  const rows = BUCKETS.map(bucket => {
    const counts = estimate.buckets[bucket.id];
    return `| ${bucket.label} | ${number(counts.files)} | ${number(counts.nonBlank)} | ${bucket.multiplier} | ${number(Math.round(counts.nonBlank * bucket.multiplier))} |`;
  });
  const excludedList = Object.entries(estimate.excluded).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${reason} (${number(count)} files)`).join('; ');
  return [
    SECTION_HEADING,
    '',
    `**Estimate, not a measurement:** writing this project by hand would plausibly take one person about **${months.low} to ${months.high} person-months** (${number(days.low)} to ${number(days.high)} working days). Nobody built it that way; this gives a sense of scale and is not a claim about effort, quality or value.`,
    '',
    '| Hand-written code | Files | Non-blank lines | Multiplier | Weighted lines |',
    '|---|---:|---:|---:|---:|',
    ...rows,
    `| **Total** | | **${number(estimate.nonBlank)}** | | **${number(weighted)}** |`,
    '',
    `**Arithmetic:** ${number(weighted)} weighted lines ÷ ${RATES.optimistic} lines per day = ${number(days.low)} days, and ${number(weighted)} ÷ ${RATES.conservative} = ${number(days.high)} days; at ${WORKING_DAYS_PER_MONTH} working days per month that is ${months.low} to ${months.high} person-months.`,
    '',
    `**Assumptions:** ${RATES.conservative} (conservative) to ${RATES.optimistic} (optimistic) non-blank lines per 8-hour day of finished, reviewed, debugged code, a common industry rule of thumb rather than a measurement of this team. The native engine counts at 1.5 times because encrypted storage and a filesystem adapter are harder than their size suggests. Part of the application source is written as long lines, so line counts understate it. Design, research and review time beyond the test code are not included.`,
    '',
    `**Left out, exactly as the line count leaves them out:** ${excludedList}. Markdown prose (${number(estimate.markdown.nonBlank)} non-blank lines in ${number(estimate.markdown.files)} files) is not estimated.`,
    '',
    'Reproduce it with `node scripts/human-time-estimate.mjs` (prints the same table from `git ls-files`) and refresh this block with `node scripts/human-time-estimate.mjs --write`. The block may lag the tree by up to 10 percent before `--check` and the test fail.',
    '',
    '',
  ].join('\n');
}

/** Finds the owned README section: [start, end) offsets in LF-normalized text, or null. */
function sectionBounds(text) {
  const start = text.indexOf(SECTION_HEADING + '\n');
  if (start < 0) return null;
  const next = text.indexOf('\n## ', start + SECTION_HEADING.length);
  return { start, end: next < 0 ? text.length : next + 1 };
}

/** Reads the visible figures back from README text, or returns null. */
export function parseReadmeBlock(readmeText) {
  const text = readmeText.replace(/\r\n/g, '\n');
  const bounds = sectionBounds(text);
  if (!bounds) return null;
  const block = text.slice(bounds.start, bounds.end);
  const headline = block.match(/about \*\*([\d.]+) to ([\d.]+) person-months\*\* \(([\d,]+) to ([\d,]+) working days\)/);
  const cells = prefix => block.split('\n').find(line => line.startsWith(prefix))?.split('|').map(cell => cell.replace(/[*,\s]/g, ''));
  const nonBlank = {};
  for (const bucket of BUCKETS) {
    const row = cells(`| ${bucket.label} |`);
    if (!row || !/^\d+$/.test(row[3])) return null;
    nonBlank[bucket.id] = Number(row[3]);
  }
  const total = cells('| **Total** |');
  if (!headline || !total || !/^\d+$/.test(total[5])) return null;
  return {
    block,
    inputs: { nonBlank, weighted: Number(total[5]) },
    months: { low: Number(headline[1]), high: Number(headline[2]) },
    days: { low: Number(headline[3].replace(/,/g, '')), high: Number(headline[4].replace(/,/g, '')) },
  };
}

/** Compares a README block with a fresh estimate. Returns a list of problems (empty when current). */
export function checkReadme(readmeText, estimate) {
  const parsed = parseReadmeBlock(readmeText);
  if (!parsed) return ['The README has no readable human-time estimate block.'];
  const problems = [];
  const expected = arithmetic(parsed.inputs.weighted);
  if (expected.days.low !== parsed.days.low || expected.days.high !== parsed.days.high) problems.push('The README days do not follow from its own weighted line count.');
  if (expected.months.low !== parsed.months.low || expected.months.high !== parsed.months.high) problems.push('The README months do not follow from its own weighted line count.');
  const recomputed = Math.round(BUCKETS.reduce((sum, bucket) => sum + (parsed.inputs.nonBlank[bucket.id] || 0) * bucket.multiplier, 0));
  if (recomputed !== parsed.inputs.weighted) problems.push('The README weighted total does not follow from its bucket counts and multipliers.');
  const drift = Math.abs(estimate.weighted - parsed.inputs.weighted) / Math.max(1, estimate.weighted);
  if (drift > TOLERANCE) problems.push(`The README weighted total ${parsed.inputs.weighted} differs from the current tree (${estimate.weighted}) by ${(drift * 100).toFixed(1)} percent; run --write.`);
  return problems;
}

export function writeReadmeBlock(readmeText, estimate) {
  const eol = readmeText.includes('\r\n') ? '\r\n' : '\n';
  const text = readmeText.replace(/\r\n/g, '\n');
  const bounds = sectionBounds(text);
  if (!bounds) throw new Error(`The README has no "${SECTION_HEADING}" section.`);
  return (text.slice(0, bounds.start) + renderReadmeBlock(estimate) + text.slice(bounds.end)).replace(/\n/g, eol);
}

function printTable(estimate) {
  for (const bucket of BUCKETS) {
    const counts = estimate.buckets[bucket.id];
    console.log(`${bucket.label.padEnd(44)} files ${String(counts.files).padStart(4)}  lines ${String(counts.total).padStart(7)}  non-blank ${String(counts.nonBlank).padStart(7)}  x${bucket.multiplier}`);
  }
  console.log(`${'Total'.padEnd(44)} non-blank ${number(estimate.nonBlank)}, weighted ${number(estimate.weighted)}`);
  console.log(`Markdown prose (not estimated): ${number(estimate.markdown.nonBlank)} non-blank lines in ${number(estimate.markdown.files)} files`);
  console.log('Left out:', Object.entries(estimate.excluded).map(([reason, count]) => `${reason} (${count})`).join('; '));
  console.log(`Estimate: ${estimate.months.low} to ${estimate.months.high} person-months (${number(estimate.days.low)} to ${number(estimate.days.high)} working days), ${RATES.conservative} to ${RATES.optimistic} lines per day, ${WORKING_DAYS_PER_MONTH} days per month.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const estimate = computeEstimate();
  const flags = new Set(process.argv.slice(2));
  const readmePath = join(defaultRoot, 'README.md');
  if (flags.has('--json')) console.log(JSON.stringify(estimate, null, 2));
  else if (flags.has('--readme')) console.log(renderReadmeBlock(estimate));
  else if (flags.has('--write')) { writeFileSync(readmePath, writeReadmeBlock(readFileSync(readmePath, 'utf8'), estimate)); console.log(`Rewrote the README estimate: ${estimate.months.low} to ${estimate.months.high} person-months.`); }
  else if (flags.has('--check')) {
    const problems = checkReadme(readFileSync(readmePath, 'utf8'), estimate);
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1; else console.log('The README estimate is current.');
  } else printTable(estimate);
}
