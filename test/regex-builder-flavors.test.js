import test from 'node:test';
import assert from 'node:assert/strict';
import { convertPattern, convertReplacement, compareFlavors, flavors } from '../src/shared/surface/regex/flavors.js';
import { generateCode, languages, actions, pythonString, csharpString, powershellString, jsRegexLiteral } from '../src/shared/surface/regex/codegen.js';

const convert = (pattern, flags, flavor) => convertPattern(pattern, flags, flavor);

test('only the JavaScript flavor is marked as executing', () => {
  assert.deepEqual(flavors.filter(f => f.executes).map(f => f.id), ['javascript']);
  assert.equal(convert('a+', 'i', 'javascript').status, 'native');
});

test('named groups and references use each flavor syntax', () => {
  assert.equal(convert('(?<y>a)\\k<y>', '', 'python').body, '(?P<y>a)(?P=y)');
  assert.equal(convert('(?<y>a)\\k<y>', '', 'dotnet').body, '(?<y>a)\\k<y>');
  assert.equal(convert('(?<y>a)', '', 'go').body, '(?P<y>a)');
  assert.equal(convert('(a)\\1', '', 'java').body, '(a)\\1');
});

test('anchors become exact end-of-text anchors and flags become inline modifiers', () => {
  assert.equal(convert('^a$', '', 'python').pattern, '^a\\Z');
  assert.equal(convert('^a$', '', 'dotnet').pattern, '^a\\z');
  assert.equal(convert('^a$', '', 'ruby').pattern, '\\Aa\\z');
  assert.equal(convert('^a$', 'm', 'python').pattern, '(?m)^a$');
  assert.equal(convert('a.b', 'is', 'java').pattern, '(?is)a.b');
  assert.equal(convert('a.b', 's', 'ruby').pattern, '(?m)a.b', 'Ruby uses m for dot-matches-newline');
});

test('lookaround and backreference support is reported per engine', () => {
  const lookbehind = (flavor) => convert('(?<=ab)c', '', flavor);
  assert.equal(lookbehind('go').status, 'unsupported'); assert.equal(lookbehind('rust').status, 'unsupported');
  assert.notEqual(lookbehind('python').status, 'unsupported');
  assert.equal(convert('a(?=b)', '', 'rust').status, 'unsupported');
  assert.equal(convert('(a)\\1', '', 'go').status, 'unsupported');
  assert.notEqual(convert('a(?=b)', '', 'dotnet').status, 'unsupported');
});

test('lookbehind width rules are enforced per engine', () => {
  assert.equal(convert('(?<=a+)b', 'u', 'python').status, 'unsupported');
  assert.equal(convert('(?<=a+)b', 'u', 'java').status, 'unsupported');
  assert.equal(convert('(?<=a|bc)d', 'u', 'pcre').status, 'converted', 'each alternative is fixed width');
  assert.equal(convert('(?<=a+)b', 'u', 'dotnet').status === 'unsupported', false);
  assert.equal(convert('(?<=a{1,3})b', 'u', 'java').status === 'unsupported', false);
});

test('Unicode escapes and properties are converted or refused with a reason', () => {
  assert.equal(convert('\\u{1F600}', 'u', 'python').body, '\\U0001F600');
  assert.equal(convert('\\u{1F600}', 'u', 'dotnet').body, '\\uD83D\\uDE00');
  assert.equal(convert('\\u{1F600}', 'u', 'java').body, '\\x{1F600}');
  assert.equal(convert('\\u0100', '', 'go').body, '\\x{0100}');
  assert.equal(convert('\\u0041', '', 'go').body, '\\x41');
  assert.equal(convert('\\p{L}', 'u', 'pcre').body, '\\p{L}');
  assert.equal(convert('\\p{Script=Han}', 'u', 'java').body, '\\p{IsHan}');
  assert.equal(convert('\\p{Script=Han}', 'u', 'rust').body, '\\p{Script=Han}');
  const python = convert('\\p{L}', 'u', 'python');
  assert.equal(python.status, 'unsupported'); assert.match(python.unsupported[0].en, /Python re does not support/);
  assert.equal(convert('\\p{Script=Han}', 'u', 'dotnet').status, 'unsupported');
  assert.equal(convert('\\p{Emoji}', 'u', 'pcre').status, 'unsupported');
});

test('JavaScript-specific syntax is refused instead of mistranslated', () => {
  for (const [pattern, flags] of [['[]', ''], ['[^]', ''], ['[\\p{L}&&\\p{ASCII}]', 'v'], ['(', '']]) assert.equal(convert(pattern, flags, 'dotnet').status, 'unsupported', pattern);
  assert.equal(convert('a', 'y', 'dotnet').status, 'unsupported');
});

test('class characters that mean something else in the target are escaped', () => {
  assert.equal(convert('[a[]', '', 'java').body, '[a\\[]');
  assert.equal(convert('[a&&b]', '', 'java').body, '[a\\&\\&b]');
  assert.equal(convert('a{', '', 'java').body, 'a\\{');
});

test('semantic differences are warned about, not hidden', () => {
  const w = convert('\\d+.', 'm', 'python');
  assert.ok(w.warnings.length >= 2);
  assert.ok(w.warnings.some(x => /non-ASCII/.test(x.en)) && w.warnings.some(x => /"\."/.test(x.en)));
  assert.equal(w.status, 'converted-with-differences');
  assert.equal(convert('abc', '', 'python').status, 'converted');
  assert.ok(convert('(a)\\1', '', 'java').warnings.some(x => /backreference/.test(x.en)));
  assert.ok(w.notes.length === 0 && convert('a', 'gd', 'java').notes.length === 2);
});

test('replacement templates convert per flavor and refuse what has no equivalent', () => {
  const opts = { groupCount: 1, names: ['n'] };
  assert.equal(convertReplacement('$1-$<n>-$&', 'python', opts).text, '\\g<1>-\\g<n>-\\g<0>');
  assert.equal(convertReplacement('$1-$<n>-$&$$', 'dotnet', opts).text, '${1}-${n}-$&$$');
  assert.equal(convertReplacement('\\$x', 'python', opts).text, '\\\\$x');
  assert.equal(convertReplacement('$`', 'python', opts).ok, false);
  assert.equal(convertReplacement('$`|$\'', 'dotnet', opts).text, "$`|$'");
  assert.equal(convertReplacement('$<n>', 'pcre', opts).ok, false);
  assert.equal(convertReplacement('$1 0', 'java', opts).text, '$1 0');
  assert.equal(convertReplacement('$10', 'java', { groupCount: 10, names: [] }).text, '$10');
  assert.equal(convertReplacement('$1', 'ruby', opts).text, '\\1');
  assert.equal(convertReplacement('x$1', 'rust', opts).text, 'x${1}');
});

test('flavor comparison reports every flavor for the current expression', () => {
  const rows = compareFlavors('(a)(?<=b)c', 'u', '$1');
  assert.equal(rows.length, flavors.length);
  const byId = Object.fromEntries(rows.map(r => [r.flavor.id, r.converted.status]));
  assert.equal(byId.javascript, 'native'); assert.equal(byId.go, 'unsupported');
  assert.ok(rows.every(r => r.replacement));
});

test('string quoting follows each language rules', () => {
  const nasty = 'a"b\\c\n\'d$';
  assert.equal(JSON.parse(pythonString('x"\\\n')), 'x"\\\n');
  assert.equal(csharpString('a"b'), '@"a""b"');
  assert.equal(powershellString("it's"), "'it''s'");
  assert.equal(powershellString('\u2018x\u2019'), "'\u2018\u2018x\u2019\u2019'");
  assert.equal(jsRegexLiteral('a/b[/]', 'g'), '/a\\/b[/]/g');
  assert.equal(jsRegexLiteral('a\nb', ''), null);
  assert.ok(nasty);
});

test('generated JavaScript is executable and does what the action says', () => {
  const run = (action, pattern, flags, replacement = '') => {
    const { code, ok } = generateCode({ language: 'javascript', action, pattern, flags, replacement });
    assert.ok(ok);
    return code;
  };
  assert.match(run('all', 'a(\\d)', 'i'), /\/a\(\\d\)\/ig;|\/a\(\\d\)\/gi;|\/a\(\\d\)\/ig/);
  const replaceCode = run('replace', '(\\d+)', '', '[$1]');
  const text = 'a1b22';
  const fn = new Function(`${replaceCode.replace('const text = "";', `const text = ${JSON.stringify(text)};`).replace('console.log(result);', 'return result;')}`);
  assert.equal(fn(), 'a[1]b[22]');
  const multiline = generateCode({ language: 'javascript', action: 'test', pattern: 'a\nb', flags: '' }).code;
  assert.match(multiline, /new RegExp\("a\\nb", ""\)/);
});

test('generated code exists for every language and action, or states why not', () => {
  for (const language of languages) {
    for (const action of actions) {
      const r = generateCode({ language: language.id, action: action.id, pattern: '(?<w>\\w+)@x', flags: 'i', replacement: '$<w>' });
      assert.ok(r.ok, `${language.id} ${action.id}`);
      assert.ok(r.code.includes(language.id === 'python' ? 're.compile' : language.id === 'csharp' ? 'new Regex' : language.id === 'powershell' ? '[regex]' : 'const pattern'));
    }
  }
  const unsupported = generateCode({ language: 'python', action: 'test', pattern: '\\p{L}', flags: 'u' });
  assert.equal(unsupported.ok, false); assert.equal(unsupported.code, ''); assert.ok(unsupported.unsupported.length);
  const lookup = generateCode({ language: 'python', action: 'replace', pattern: 'a', flags: '', replacement: '$`' });
  assert.equal(lookup.ok, false);
  assert.throws(() => generateCode({ language: 'cobol', action: 'test', pattern: 'a' }), /Unknown language/);
});

test('generated Python and C# literals round-trip the converted pattern', () => {
  const py = generateCode({ language: 'python', action: 'test', pattern: 'say "hi"\\\\n\\d', flags: '' }).code;
  const literal = /re\.compile\((".*")\)/.exec(py)[1];
  assert.equal(JSON.parse(literal), 'say "hi"\\\\n\\d');
  const cs = generateCode({ language: 'csharp', action: 'test', pattern: 'say "hi"\\d', flags: '' }).code;
  assert.match(cs, /new Regex\(@"say ""hi""\\d"/);
  const ps = generateCode({ language: 'powershell', action: 'test', pattern: "it's", flags: '' }).code;
  assert.match(ps, /\$pattern = 'it''s'/);
});
