import test from 'node:test';
import assert from 'node:assert/strict';
import {documentCategory, documentTitle} from '../src/features/documentation/catalog.mjs';

test('files directly under docs/features get the general category, not their own file name', () => {
  assert.equal(documentCategory('docs/features/README.md'), 'features');
  assert.equal(documentCategory('docs/features/access-local.md'), 'features');
  assert.equal(documentCategory('docs/features/access/local-access.md'), 'access');
  assert.equal(documentCategory('docs/wiki/Home.md'), 'wiki');
  assert.equal(documentCategory('README.md'), 'project');
});

test('a page that only points to the moved article is labelled as moved in both languages', () => {
  assert.equal(documentTitle('Local access components', '# Local access components\n\nThis article has moved to [Access](access/local-access.md). More text.\n'), 'Local access components (moved)');
  assert.equal(documentTitle('本機存取元件', '# 本機存取元件\r\n\r\n本文已移至 [存取](access/local-access.md)。\r\n'), '本機存取元件（已移至新位置）');
  assert.equal(documentTitle('Local access components', '# Local access components\n\n`mountAccess(container, services)` mounts the access settings.\n\nThis article has moved to [x](y) only later.\n'), 'Local access components', 'a full article that mentions a move later is not a moved page');
});
