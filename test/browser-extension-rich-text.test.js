import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRichText, safeLink, MAX_CHARS} from '../browser-extension/rich-text.js';

const walk = (tokens, found = []) => { for (const token of tokens) { found.push(token); if (token.children) walk(token.children, found); if (token.items) for (const item of token.items) walk(item, found); } return found; };
const links = tokens => walk(tokens).filter(token => token.type === 'link');
const plain = tokens => walk(tokens).filter(token => token.type === 'text').map(token => token.text).join('');

test('paragraphs split on blank lines and keep their line breaks', () => {
  const blocks = parseRichText('First line\nsecond line\n\nNext paragraph');
  assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'paragraph']);
  assert.equal(plain(blocks[0].children), 'First line\nsecond line');
  assert.deepEqual(parseRichText('   \n '), []);
  assert.deepEqual(parseRichText(undefined), []);
  assert.equal(plain(parseRichText('a\r\nb')[0].children), 'a\nb');
});

test('headings carry their level and inline content', () => {
  const [one, three] = parseRichText('# Title\n\n### Part **two**');
  assert.deepEqual([one.type, one.level, plain(one.children)], ['heading', 1, 'Title']);
  assert.equal(three.level, 3);
  assert.ok(three.children.some(token => token.type === 'bold'));
  assert.equal(parseRichText('#hashtag')[0].type, 'paragraph');
  assert.equal(parseRichText('####### seven')[0].type, 'paragraph');
});

test('bullet and numbered lists group their items and join indented continuations', () => {
  const [bullets, numbers] = parseRichText('- one\n* two\n  more of two\n+ three\n\n1. first\n2) second');
  assert.equal(bullets.type, 'list');
  assert.equal(bullets.ordered, false);
  assert.equal(bullets.items.length, 3);
  assert.equal(plain(bullets.items[1]), 'two\nmore of two');
  assert.equal(numbers.ordered, true);
  assert.equal(numbers.items.length, 2);
  assert.equal(parseRichText('**not a bullet**')[0].type, 'paragraph');
});

test('inline code, bold and italics nest and leave code untouched', () => {
  const [paragraph] = parseRichText('Use `a *b* c` with **bold _and italic_** and *slanted* text');
  const types = paragraph.children.map(token => token.type);
  assert.deepEqual(types, ['text', 'code', 'text', 'bold', 'text', 'italic', 'text']);
  assert.equal(paragraph.children[1].text, 'a *b* c');
  assert.deepEqual(paragraph.children[3].children.map(token => token.type), ['text', 'italic']);
  const [snake] = parseRichText('keep snake_case_name and 2 * 3 * 4 as written');
  assert.equal(snake.children.length, 1);
  assert.equal(plain(snake.children), 'keep snake_case_name and 2 * 3 * 4 as written');
  const [open] = parseRichText('an **unfinished bold and `unfinished code');
  assert.equal(plain(open.children), 'an **unfinished bold and `unfinished code');
});

test('fenced code keeps its text exactly and shows the language', () => {
  const [before, code, after] = parseRichText('Run this:\n```js\nconst a = "**x**";\n\n# not a heading\n```\nDone');
  assert.equal(before.type, 'paragraph');
  assert.deepEqual([code.type, code.lang, code.closed], ['code', 'js', true]);
  assert.equal(code.text, 'const a = "**x**";\n\n# not a heading');
  assert.equal(plain(after.children), 'Done');
});

test('an unclosed code fence runs to the end of the text, as it does while a reply is still streaming', () => {
  const [code] = parseRichText('```python\nprint("hi")\nmore');
  assert.deepEqual([code.type, code.lang, code.closed, code.text], ['code', 'python', false, 'print("hi")\nmore']);
  const [empty] = parseRichText('```');
  assert.deepEqual([empty.type, empty.closed, empty.text], ['code', false, '']);
  assert.equal(parseRichText('```not a fence```')[0].type, 'paragraph');
});

test('only http and https links become links, as markdown links or bare addresses', () => {
  const [paragraph] = parseRichText('See [the docs](https://example.com/a?b=1) and http://example.org/path, or https://example.net/x.');
  const found = links([paragraph]);
  assert.deepEqual(found.map(link => link.href), ['https://example.com/a?b=1', 'http://example.org/path', 'https://example.net/x']);
  assert.equal(found[0].text, 'the docs');
  assert.equal(found[1].text, 'http://example.org/path');
  assert.equal(safeLink('https://example.com'), 'https://example.com/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://example.com/x', 'vbscript:x', '//example.com', 'example.com', 'https://user:pass@example.com/', 'http://', '']) assert.equal(safeLink(bad), '', bad);
});

test('javascript, data and other schemes stay plain text, never links', () => {
  for (const source of ['[click](javascript:alert(1))', '[x](data:text/html;base64,PHNjcmlwdD4=)', '[x](JaVaScRiPt:alert(1))', '[x](  javascript:alert(1))', 'javascript:alert(1)', 'data:text/html,hi', '[x](file:///c:/secret)', '[x](https://user:pw@example.com/)']) {
    const blocks = parseRichText(source);
    assert.equal(links(blocks).length, 0, source);
    assert.equal(plain(blocks), source, source);
  }
});

test('HTML and script markup in a reply stays literal text', () => {
  const source = '<script>alert(1)</script> <img src=x onerror=alert(1)> <b>bold</b> &amp; <a href="https://example.com">x</a>';
  const [paragraph] = parseRichText(source);
  // The only token that is not text is the genuine address inside the attribute text, shown as ordinary link text.
  assert.equal(walk(paragraph.children).map(token => token.text).join(''), source);
  assert.deepEqual(walk([paragraph]).filter(token => token.type !== 'text' && token.type !== 'paragraph').map(token => [token.type, token.href]), [['link', 'https://example.com/']]);
  const [code] = parseRichText('```html\n<script>alert(1)</script>\n```');
  assert.equal(code.text, '<script>alert(1)</script>');
  const [heading] = parseRichText('# <img src=x onerror=alert(1)>');
  assert.equal(plain(heading.children), '<img src=x onerror=alert(1)>');
});

test('a link address cannot smuggle markup or break out of its token', () => {
  const [paragraph] = parseRichText('[a](https://example.com/"onmouseover="x) https://example.com/<b>x');
  for (const link of links([paragraph])) assert.ok(!/[<>"]/.test(link.href.replace(/%22|%3C|%3E/g, '')), link.href);
});

test('oversized text is returned as one plain paragraph without parsing', () => {
  const huge = '**x** '.repeat(Math.ceil(MAX_CHARS / 6) + 10);
  const blocks = parseRichText(huge);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].children.map(token => token.type), ['text']);
});

test('deeply nested emphasis stays bounded', () => {
  const [paragraph] = parseRichText('**a *b **c *d **e *f* e** d* c** b* a**');
  let depth = 0, level = paragraph.children;
  while (level.some(token => token.children)) { level = level.find(token => token.children).children; depth++; }
  assert.ok(depth <= 3);
});
