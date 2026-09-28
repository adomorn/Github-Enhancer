const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = path.join(__dirname, '../src/content/review-tools.js');

// Reduced fixture from live Chrome on refined-github/sandbox/pull/71/changes,
// observed 2026-09-28. The native Viewed action is an aria-pressed button.
function modern(id, file, viewed = false) {
  return `<div role="region" id="diff-${id}" aria-labelledby="heading-${id}" class="Diff-module__diffTargetable__pirZi"><div data-diff-header-wrapper="true"><h3 id="heading-${id}"><a href="#diff-${id}"><code>‎${file}‎</code></a></h3><span class="sr-only">Lines changed: 2 additions &amp; 1 deletion</span><button class="MarkAsViewedButton-module__iconOnly__kEP4e" aria-pressed="${viewed}" aria-label="${viewed ? 'Viewed' : 'Not Viewed'}">Viewed</button></div><table><tbody><tr><td>Visible source</td></tr></tbody></table></div>`;
}

function setup(html, suffix = 'pull/71/changes') {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `https://github.com/refined-github/sandbox/${suffix}` });
  dom.window.GHE = {};
  if (fs.existsSync(source)) dom.window.eval(fs.readFileSync(source, 'utf8'));
  assert.equal(typeof dom.window.GHE.collectReview, 'function', 'review adapter is implemented');
  assert.equal(typeof dom.window.GHE.reviewAction, 'function');
  const context = { type: suffix.startsWith('commit/') ? 'commit' : 'pull', url: dom.window.location.href };
  return { dom, document: dom.window.document, api: dom.window.GHE, context };
}

test('modern PR files are identified from real diff regions, classified, and read without mutations', () => {
  const x = setup(modern('aaa', 'tests/parser.test.ts', true) + modern('bbb', 'docs/usage.md') + '<div id="diff-file-tree-filter">Not a diff</div>');
  const before = x.document.body.innerHTML;
  const result = x.api.collectReview(x.document, x.context);
  assert.equal(result.loadedOnly, true);
  assert.equal(result.revision, null);
  assert.equal(result.files.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.files[0])), { id: 'diff-aaa', path: 'tests/parser.test.ts', group: 'tests', folder: 'tests', extension: '.ts', viewed: true, viewedKnown: true, additions: 2, deletions: 1, lockfile: false, generated: false });
  assert.equal(result.files[1].group, 'docs');
  assert.equal(x.document.body.innerHTML, before);
});

test('legacy file headers use explicit data paths and current native checkbox state', () => {
  const x = setup('<div class="file" id="diff-legacy"><div class="file-header" data-path=".github/workflows/test.yml"><input type="checkbox" class="js-reviewed-checkbox" checked></div><div class="diff-table">Source</div></div>', 'pull/71/files');
  let result = x.api.collectReview(x.document, x.context);
  assert.equal(result.files[0].path, '.github/workflows/test.yml');
  assert.equal(result.files[0].group, 'config');
  assert.equal(result.files[0].viewed, true);
  x.document.querySelector('input').checked = false;
  result = x.api.collectReview(x.document, x.context);
  assert.equal(result.files[0].viewed, false);
});

test('renamed modern files use the visible destination path without duplicate accessibility text', () => {
  const x = setup('<div role="region" id="diff-rename"><div data-diff-header-wrapper="true"><h3><a href="#diff-rename"><code><span aria-hidden="true">‎old.js‎ <svg class="octicon-arrow-right"></svg> ‎src/new.ts‎</span><span class="sr-only">old.js renamed to src/new.ts</span></code></a></h3></div></div>');
  const file = x.api.collectReview(x.document, x.context).files[0];
  assert.equal(file.path, 'src/new.ts');
  assert.equal(file.group, 'source');
  assert.equal(file.viewedKnown, false);
});

test('review collection rejects other pages, empty diff shells, and extension-owned content', () => {
  const x = setup(modern('aaa', 'src/main.js'), 'pull/71');
  assert.equal(x.api.collectReview(x.document, x.context), null);
  const empty = setup('<div role="region" id="diff-empty"></div><div data-ghe-host>' + modern('owned', 'private.js') + '</div>');
  assert.equal(empty.api.collectReview(empty.document, empty.context), null);
});

test('only explicit commit routes identify revision and heuristic labels remain separate from source group', () => {
  const sha = '3348bd65c87a77c86615c410c6a1acc138ef5c66';
  const x = setup(modern('a', 'package-lock.json') + modern('b', 'dist/bundle.min.js'), `commit/${sha}`);
  const result = x.api.collectReview(x.document, x.context);
  assert.equal(result.revision, sha);
  assert.equal(result.files[0].lockfile, true);
  assert.equal(result.files[0].group, 'config');
  assert.equal(result.files[1].generated, true);
  assert.equal(result.files[1].group, 'source');
  const pr = setup(modern('a', 'main.js'), `pull/71/changes/${sha}`);
  assert.equal(pr.api.collectReview(pr.document, pr.context).revision, sha);
});

test('loaded snapshots are bounded and clearly report truncation', () => {
  const x = setup(Array.from({ length: 205 }, (_, i) => modern(String(i), `src/file${i}.js`)).join(''));
  const result = x.api.collectReview(x.document, x.context);
  assert.equal(result.files.length, 200);
  assert.equal(result.truncated, true);
  assert.equal(result.loadedOnly, true);
});

test('jump focuses and scrolls the actual diff without toggling Viewed or changing the page URL', () => {
  const x = setup(modern('aaa', 'main.js'));
  const container = x.document.getElementById('diff-aaa');
  let scrolled = 0, clicked = 0;
  container.scrollIntoView = () => { scrolled += 1; };
  container.querySelector('button').addEventListener('click', () => { clicked += 1; });
  const original = x.document.location.href;
  assert.equal(x.api.reviewAction(x.document, { type: 'review-jump', id: 'diff-aaa' }), true);
  assert.equal(scrolled, 1);
  assert.equal(x.document.activeElement, container);
  assert.equal(clicked, 0);
  assert.equal(container.querySelector('button').getAttribute('aria-pressed'), 'false');
  assert.equal(container.hasAttribute('tabindex'), false);
  assert.equal(x.document.location.href, original);
  assert.equal(x.api.reviewAction(x.document, { type: 'review-jump', id: 'diff-missing' }), false);
  assert.equal(x.api.reviewAction(x.document, { type: 'submit-review', id: 'diff-aaa' }), false);
});

test('explicit collapse hides only observed diff tables and reset restores owned changes', () => {
  const x = setup(modern('aaa', 'package-lock.json'));
  const container = x.document.getElementById('diff-aaa');
  const table = container.querySelector('table');
  assert.equal(x.api.reviewAction(x.document, { type: 'review-collapse', id: container.id, collapsed: true }), true);
  assert.equal(x.document.defaultView.getComputedStyle(table).display, 'none');
  assert.notEqual(x.document.defaultView.getComputedStyle(container.querySelector('[data-diff-header-wrapper]')).display, 'none');
  assert.equal(container.querySelector('button').getAttribute('aria-pressed'), 'false');
  assert.equal(x.api.collectReview(x.document, x.context).files[0].collapsed, true);
  x.api.resetReviewTools(x.document);
  assert.equal(table.classList.contains('ghe-review-collapsed-body'), false);
  assert.equal(x.document.querySelector('[data-ghe-review-style]'), null);
});

test('abbreviated route hashes and arbitrary commit links never verify aggregate review revision', () => {
  const short = setup(modern('a', 'main.js'), 'pull/71/changes/3348bd6');
  assert.equal(short.api.collectReview(short.document, short.context).revision, null);
  const aggregate = setup(`<a href="/refined-github/sandbox/commit/${'a'.repeat(40)}">Latest commit</a><button id="changes-selector-button">All commits</button>` + modern('a', 'main.js'));
  assert.equal(aggregate.api.collectReview(aggregate.document, aggregate.context).revision, null);
});

test('deleted-file deferred placeholder collapses without loading its diff or hiding comments', () => {
  // Captured on /refined-github/sandbox/pull/71/changes: file 5854 has no table.
  const x = setup(`<div role="region" id="diff-deleted"><div data-diff-header-wrapper="true"><h3><a><code>5854</code></a></h3><button class="MarkAsViewedButton-native" aria-pressed="false">Viewed</button></div><div class="border position-relative rounded-bottom-2"><div id="placeholder" class="tmp-px-3 tmp-py-4 fgColor-muted" data-diff-anchor="diff-deleted"><div class="HiddenDiffPatch-module__gridColumnTemplate__o4otv"><button>Load Diff</button><span>This file was deleted.</span></div></div><div id="comment"><textarea>Unsaved comment</textarea></div></div></div>`);
  let clicks = 0; x.document.querySelector('#placeholder button').addEventListener('click', () => clicks++);
  assert.equal(x.api.reviewAction(x.document, { type: 'review-collapse', id: 'diff-deleted', collapsed: true }), true);
  assert.equal(x.document.defaultView.getComputedStyle(x.document.getElementById('placeholder')).display, 'none');
  assert.notEqual(x.document.defaultView.getComputedStyle(x.document.getElementById('comment')).display, 'none');
  assert.equal(x.document.querySelector('textarea').value, 'Unsaved comment');
  assert.equal(x.document.querySelector('[aria-pressed]').getAttribute('aria-pressed'), 'false');
  assert.equal(clicks, 0);
  assert.equal(x.api.collectReview(x.document, x.context).files[0].collapsed, true);
  assert.equal(x.api.reviewAction(x.document, { type: 'review-collapse', id: 'diff-deleted', collapsed: false }), true);
  assert.notEqual(x.document.defaultView.getComputedStyle(x.document.getElementById('placeholder')).display, 'none');
  x.document.getElementById('placeholder').setAttribute('data-diff-anchor', 'diff-other');
  assert.equal(x.api.reviewAction(x.document, { type: 'review-collapse', id: 'diff-deleted', collapsed: true }), false);
});
