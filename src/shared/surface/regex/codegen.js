// Code generation (the "Use" tab). Every snippet quotes the pattern with the target language's own
// string rules instead of blindly adding backslashes. Non-JavaScript targets use the converted
// pattern from flavors.js and refuse to generate when the conversion is unsupported.
import { convertPattern, convertReplacement } from './flavors.js';
import { parsePattern } from './parser.js';

export const languages = Object.freeze([
  { id: 'javascript', name: 'JavaScript', flavor: 'javascript' },
  { id: 'python', name: 'Python', flavor: 'python' },
  { id: 'csharp', name: 'C#', flavor: 'dotnet' },
  { id: 'powershell', name: 'PowerShell', flavor: 'dotnet' }
]);

export const actions = Object.freeze([
  { id: 'test', en: 'Test for a match', yue: '檢查是否符合' },
  { id: 'first', en: 'Get the first match', yue: '取得第一個符合' },
  { id: 'all', en: 'Get all matches', yue: '取得全部符合' },
  { id: 'replace', en: 'Replace matches', yue: '取代符合' },
  { id: 'split', en: 'Split the text', yue: '分割文字' }
]);

export function jsRegexLiteral(pattern, flags) {
  if (/[\n\r\u2028\u2029]/.test(pattern) || pattern === '') return null;
  let out = '', inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { out += c + (pattern[i + 1] ?? ''); i++; continue; }
    if (c === '[') inClass = true; else if (c === ']') inClass = false;
    out += c === '/' && !inClass ? '\\/' : c;
  }
  return `/${out}/${flags}`;
}
export const jsString = s => JSON.stringify(s);

export function pythonString(s) {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (cp < 32 || cp === 127) out += `\\x${cp.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return out + '"';
}
export const csharpString = s => `@"${s.replace(/"/g, '""')}"`;
export const powershellString = s => `'${s.replace(/['\u2018\u2019\u201A\u201B]/g, m => m + m)}'`;

function quoteFor(language) { return { javascript: jsString, python: pythonString, csharp: csharpString, powershell: powershellString }[language]; }

export function generateCode({ language, action, pattern, flags = '', replacement = '' }) {
  const lang = languages.find(l => l.id === language);
  if (!lang) throw Error('Unknown language');
  if (!actions.some(a => a.id === action)) throw Error('Unknown action');
  const notes = [];
  if (language === 'javascript') {
    // The g flag makes test() and exec() stateful, so it is only kept where the call needs it.
    const base = flags.replace(/[gy]/g, '');
    const useFlags = action === 'all' || action === 'replace' ? `${base}g` : action === 'split' ? base : base + (flags.includes('y') ? 'y' : '');
    const literal = jsRegexLiteral(pattern, useFlags);
    const decl = `const pattern = ${literal ?? `new RegExp(${jsString(pattern)}, ${jsString(useFlags)})`};`;
    const body = {
      test: 'console.log(pattern.test(text));',
      first: 'const match = pattern.exec(text);\nif (match) {\n  console.log(match[0], match.index, match.groups);\n}',
      all: 'for (const match of text.matchAll(pattern)) {\n  console.log(match[0], match.index, match.groups);\n}',
      replace: `const result = text.replace(pattern, ${jsString(replacement)});\nconsole.log(result);`,
      split: 'const parts = text.split(pattern);\nconsole.log(parts);'
    }[action];
    return { ok: true, language, action, code: `// Replace the text below with your own input.\nconst text = "";\n${decl}\n${body}\n`, warnings: [], unsupported: [], notes };
  }
  const converted = convertPattern(pattern, flags, lang.flavor);
  const info = parsePattern(pattern, flags);
  if (converted.status === 'unsupported') return { ok: false, language, action, code: '', warnings: converted.warnings, unsupported: converted.unsupported, notes };
  const rep = action === 'replace' ? convertReplacement(replacement, lang.flavor, { groupCount: info.captureCount, names: info.names }) : { ok: true, text: '', unsupported: [] };
  if (!rep.ok) return { ok: false, language, action, code: '', warnings: converted.warnings, unsupported: rep.unsupported, notes };
  const q = quoteFor(language);
  const P = q(converted.pattern), R = q(rep.text);
  notes.push(...converted.notes.map(n => n.en));
  if (language === 'python') {
    const lines = ['import re', '', '# Replace the text below with your own input.', 'text = ""', `pattern = re.compile(${P})`];
    lines.push(...{
      test: ['print(pattern.search(text) is not None)'],
      first: ['m = pattern.search(text)', 'if m:', '    print(m.group(0), m.start(), m.groupdict())'],
      all: ['for m in pattern.finditer(text):', '    print(m.group(0), m.start(), m.groupdict())'],
      replace: [`result = pattern.sub(${R}, text)`, 'print(result)'],
      split: ['parts = pattern.split(text)', 'print(parts)']
    }[action]);
    return { ok: true, language, action, code: lines.join('\n') + '\n', warnings: converted.warnings, unsupported: [], notes };
  }
  if (language === 'csharp') {
    const lines = ['using System;', 'using System.Text.RegularExpressions;', '', '// Replace the text below with your own input.', 'var text = "";', `var regex = new Regex(${P}, RegexOptions.None, TimeSpan.FromSeconds(1));`];
    lines.push(...{
      test: ['Console.WriteLine(regex.IsMatch(text));'],
      first: ['var match = regex.Match(text);', 'if (match.Success) Console.WriteLine($"{match.Value} at {match.Index}");'],
      all: ['foreach (Match match in regex.Matches(text))', '    Console.WriteLine($"{match.Value} at {match.Index}");'],
      replace: [`var result = regex.Replace(text, ${R});`, 'Console.WriteLine(result);'],
      split: ['var parts = regex.Split(text);', 'Console.WriteLine(string.Join(" | ", parts));']
    }[action]);
    return { ok: true, language, action, code: lines.join('\n') + '\n', warnings: converted.warnings, unsupported: [], notes };
  }
  const lines = ['# Replace the text below with your own input.', "$text = ''", `$pattern = ${P}`];
  lines.push(...{
    test: ['[regex]::IsMatch($text, $pattern)'],
    first: ['$match = [regex]::Match($text, $pattern)', 'if ($match.Success) { "$($match.Value) at $($match.Index)" }'],
    all: ['foreach ($match in [regex]::Matches($text, $pattern)) { "$($match.Value) at $($match.Index)" }'],
    replace: [`[regex]::Replace($text, $pattern, ${R})`],
    split: ['[regex]::Split($text, $pattern)']
  }[action]);
  return { ok: true, language, action, code: lines.join('\n') + '\n', warnings: converted.warnings, unsupported: [], notes };
}
