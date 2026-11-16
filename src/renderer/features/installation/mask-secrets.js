// Masks credentials in command lines and process output before they are shown or copied.
// This is a display safeguard, not a parser: it errs on the side of masking.
const MASK = '********';
const KEY = String.raw`(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|auth)`;

const RULES = [
  // Authorization headers mask the scheme and the credential together
  [/(\bauthorization\s*[:=]\s*["']?)(?:(?:Bearer|Basic)\s+)?[^\s"',;]+/gi, `$1${MASK}`],
  // --password value, -p value, /password:value
  [new RegExp(String.raw`(\s(?:--?|/)${KEY}(?:[=:]|\s+))("[^"]*"|'[^']*'|\S+)`, 'gi'), `$1${MASK}`],
  // key=value, key: value, "key": "value"
  [new RegExp(String.raw`(["']?\b[\w.-]*${KEY}[\w.-]*["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)`, 'gi'), `$1${MASK}`],
  // Authorization headers and bearer tokens
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${MASK}`],
  // Credentials embedded in URLs
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+@/gi, `$1${MASK}@`],
  // Well known token shapes
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, MASK]
];

export function maskSecrets(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

/** The last real lines of process output, masked and bounded. Returns [] when there is no output. */
export function lastOutputLines(output, {lines = 12, width = 240} = {}) {
  const source = Array.isArray(output) ? output.map(String) : String(output ?? '').split(/\r?\n/);
  return source
    .map(line => maskSecrets(line).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trimEnd())
    .filter(line => line.trim().length > 0)
    .slice(-lines)
    .map(line => line.length > width ? `${line.slice(0, width - 1)}…` : line);
}
