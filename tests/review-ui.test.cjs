const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const sha = 'a'.repeat(40);
function setup(overrides = {}) {
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('src/shared/model.js', 'utf8'));
  if (fs.existsSync('src/shared/review.js')) dom.window.eval(fs.readFileSync('src/shared/review.js', 'utf8'));
  assert.equal(typeof dom.window.GHE.mountReview, 'function');
  let state = { reviews: [] }, context = { type: 'pull', repo: 'owner/repo', url: 'https://github.com/owner/repo/pull/3/changes' };
  let snapshot = { review: { revision: null, loadedOnly: true, files: [
    { id: 'diff-a', path: 'src/a.js', folder: 'src', group: 'source', viewed: true },
    { id: 'diff-b', path: 'tests/a.test.js', folder: 'tests', group: 'tests', viewed: false },
    { id: 'diff-c', path: 'package-lock.json', folder: '', group: 'config', lockfile: true }
  ] } };
  const calls = [], actions = [], notices = [];
  let fail = false;
  const root = dom.window.document.getElementById('root');
  const controller = dom.window.GHE.mountReview(root, {
    getState: () => state, getContext: () => context, getPageData: () => snapshot,
    request: async message => { calls.push(message); if (fail) throw new Error('Disk full'); return state; },
    onState: next => { state = next; }, notify: (...args) => notices.push(args),
    pageAction: async action => { actions.push(action); return true; }, ...overrides
  });
  return { dom, root, controller, calls, actions, notices,
    state(value) { state = value; }, snapshot(value) { snapshot = value; }, context(value) { context = value; }, fail(value) { fail = value; } };
}
function click(x, action) { const node = x.root.querySelector(`[data-review-action="${action}"]`); assert.ok(node, action); node.click(); }
function input(x, selector, value) { const node = x.root.querySelector(selector); node.value = value; node.dispatchEvent(new x.dom.window.Event('input', { bubbles: true })); }

test('review shows loaded-only counts, unknown revision and local marks separate from native Viewed', () => {
  const x = setup();
  assert.match(x.root.textContent, /3 loaded files/);
  assert.match(x.root.textContent, /Revision not verified/);
  assert.equal(x.root.querySelector('input[type=checkbox]').checked, false);
  assert.match(x.root.textContent, /Native Viewed/);
  assert.equal(x.calls.length, 0);
});

test('file path and type filtering supports focused keyboard navigation and resume', async () => {
  const x = setup();
  const type = x.root.querySelector('[data-review-filter="type"]'); type.value = 'tests'; type.dispatchEvent(new x.dom.window.Event('change'));
  assert.equal(x.root.querySelectorAll('[data-review-file]').length, 1);
  assert.match(x.root.querySelector('[data-review-file]').textContent, /tests\/a.test.js/);
  click(x, 'jump'); await flush();
  assert.equal(x.actions[0].id, 'diff-b');
  assert.equal(x.calls[0].type, 'SET_REVIEW_LAST_FILE');
  assert.equal(x.calls[0].prUrl, 'https://github.com/owner/repo/pull/3');
  x.state({ reviews: [{ prUrl: 'https://github.com/owner/repo/pull/3', lastFile: 'src/a.js', files: [] }] });
  x.controller.render(); click(x, 'resume'); await flush();
  assert.equal(x.actions.at(-1).id, 'diff-a');
});

test('private note draft survives state refresh and file changes; failed save preserves it', async () => {
  const x = setup();
  input(x, 'textarea', 'Unsaved private note');
  x.controller.render();
  assert.equal(x.root.querySelector('textarea').value, 'Unsaved private note');
  x.root.querySelectorAll('[data-review-file]')[1].click();
  input(x, 'textarea', 'Second note');
  x.root.querySelectorAll('[data-review-file]')[0].click();
  assert.equal(x.root.querySelector('textarea').value, 'Unsaved private note');
  x.fail(true); click(x, 'save-note'); await flush();
  assert.equal(x.root.querySelector('textarea').value, 'Unsaved private note');
  assert.match(x.notices.at(-1)[0], /Disk full/);
  assert.deepEqual(JSON.parse(JSON.stringify(x.calls[0])), { type: 'UPDATE_REVIEW_FILE', prUrl: 'https://github.com/owner/repo/pull/3', path: 'src/a.js', revision: null, patch: { note: 'Unsaved private note' } });
});

test('local check sends only reviewed patch and revision is never inferred from native Viewed', async () => {
  const x = setup();
  x.root.querySelector('input[type=checkbox]').click(); await flush();
  assert.equal(x.calls[0].revision, null);
  assert.deepEqual(JSON.parse(JSON.stringify(x.calls[0].patch)), { reviewed: true });
  assert.equal(x.actions.length, 0);
  x.state({ reviews: [{ prUrl: 'https://github.com/owner/repo/pull/3', files: [{ path: 'src/a.js', reviewed: true, reviewedRevision: sha }] }] });
  x.controller.render();
  assert.match(x.root.textContent, /Needs confirmation/);
  assert.doesNotMatch(x.root.textContent, /1 verified/);
});

test('empty or mismatched context cannot write a review and page strings remain text', () => {
  const x = setup();
  x.snapshot({ review: { revision: sha, files: [{ id: 'diff-x', path: '<img src=x onerror=alert(1)>', group: 'source' }], loadedOnly: true } });
  x.controller.render(); assert.equal(x.root.querySelector('img'), null);
  x.context({ type: 'repository', url: 'https://github.com/owner/repo' }); x.controller.render();
  assert.equal(x.root.querySelector('textarea'), null);
  assert.match(x.root.textContent, /Open a pull request/);
});

test('collapse is an explicit reversible page action, never a storage review mark', async () => {
  const x = setup(); click(x, 'collapse'); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(x.actions[0])), { type: 'review-collapse', id: 'diff-a', collapsed: true });
  click(x, 'collapse'); await flush();
  assert.equal(x.actions[1].collapsed, false);
  assert.equal(x.calls.length, 0);
});

test('changed marks can be reconfirmed directly and keyboard stays scoped to file list', async () => {
  const x = setup();
  x.state({ reviews: [{ prUrl: 'https://github.com/owner/repo/pull/3', files: [{ path: 'src/a.js', reviewed: true, reviewedRevision: 'b'.repeat(40) }] }] });
  x.snapshot({ review: { revision: sha, loadedOnly: true, files: [
    { id: 'diff-a', path: 'src/a.js', group: 'source' }, { id: 'diff-b', path: 'src/b.js', group: 'source' }
  ] } });
  x.controller.render(); click(x, 'confirm-mark'); await flush();
  assert.equal(x.calls[0].revision, sha); assert.equal(x.calls[0].patch.reviewed, true);
  const first = x.root.querySelector('[data-review-file]'); first.focus();
  first.dispatchEvent(new x.dom.window.KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  assert.equal(x.dom.window.document.activeElement.dataset.reviewFile, 'src/b.js');
  const note = x.root.querySelector('textarea'); note.focus(); note.dispatchEvent(new x.dom.window.KeyboardEvent('keydown', { key: 'k', bubbles: true }));
  assert.equal(x.dom.window.document.activeElement, note);
});

test('navigation guard detects only changed drafts and preserves drafts on other files', async () => {
  const x = setup();
  assert.equal(x.controller.hasDrafts(), false);
  input(x, 'textarea', 'draft'); assert.equal(x.controller.hasDrafts(), true);
  input(x, 'textarea', ''); assert.equal(x.controller.hasDrafts(), false);
  input(x, 'textarea', 'retained');
  x.root.querySelectorAll('[data-review-file]')[1].click();
  assert.equal(x.controller.hasDrafts(), true);
  x.root.querySelectorAll('[data-review-file]')[0].click();
  click(x, 'save-note'); await flush(); assert.equal(x.controller.hasDrafts(), false);
});

test('batch collapse targets only loaded lock or generated files and expand restores loaded bodies', async () => {
  const x = setup();
  click(x, 'collapse-generated'); await flush();
  assert.deepEqual(x.actions.map(a => a.id), ['diff-c']);
  assert.equal(x.actions[0].collapsed, true);
  click(x, 'expand-all'); await flush();
  assert.deepEqual(x.actions.slice(1).map(a => a.id), ['diff-a', 'diff-b', 'diff-c']);
  assert.ok(x.actions.slice(1).every(a => a.collapsed === false));
  assert.equal(x.calls.length, 0);
});

function sessionDrafts() {
  const records = new Map();
  return { records, options: {
    loadToolDrafts: async kind => { assert.equal(kind, 'review'); return [...records]; },
    saveToolDraft: async (kind, key, value) => { assert.equal(kind, 'review'); records.set(key, { ...value }); },
    deleteToolDraft: async (kind, key, expected) => { assert.equal(kind, 'review'); if (records.get(key)?.note === expected.note) records.delete(key); }
  } };
}

test('review notes recover after close and remount, and successful save clears their recovery copy', async () => {
  const session = sessionDrafts();
  const first = setup(session.options); await first.controller.ready;
  input(first, 'textarea', 'Recover this note'); await flush();
  assert.match(first.root.textContent, /Unsaved note/);
  first.controller.destroy();
  const second = setup(session.options); await second.controller.ready;
  assert.equal(second.root.querySelector('textarea').value, 'Recover this note');
  assert.equal(second.controller.hasDrafts(), true);
  click(second, 'save-note'); await flush();
  assert.equal(session.records.size, 0);
  assert.equal(second.controller.hasDrafts(), false);
});

test('delayed recovery never overwrites edits entered before loading completes', async () => {
  let resolveLoad;
  const x = setup({ loadToolDrafts: () => new Promise(resolve => { resolveLoad = resolve; }) });
  input(x, 'textarea', 'New local edit');
  resolveLoad([['https://github.com/owner/repo/pull/3\nsrc/a.js', { note: 'Old recovery' }]]);
  await x.controller.ready;
  assert.equal(x.root.querySelector('textarea').value, 'New local edit');
});

test('saving an older note cannot remove a newer recovery draft entered during persistence', async () => {
  const session = sessionDrafts(); let acknowledge;
  const x = setup({ ...session.options, request: () => new Promise(resolve => { acknowledge = resolve; }) });
  await x.controller.ready;
  input(x, 'textarea', 'Old snapshot'); await flush();
  click(x, 'save-note');
  input(x, 'textarea', 'Newer edit'); await flush();
  acknowledge({ reviews: [{ prUrl: 'https://github.com/owner/repo/pull/3', files: [{ path: 'src/a.js', note: 'Old snapshot' }] }] });
  await flush();
  assert.equal([...session.records.values()][0].note, 'Newer edit');
  assert.equal(x.root.querySelector('textarea').value, 'Newer edit');
  assert.equal(x.controller.hasDrafts(), true);
});

test('draft persistence errors leave the note editable and visibly unsaved', async () => {
  const x = setup({ saveToolDraft: async () => { throw new Error('Session storage full'); } });
  await x.controller.ready;
  input(x, 'textarea', 'Keep me'); await flush();
  assert.match(x.notices.at(-1)[0], /Session storage full/);
  assert.equal(x.root.querySelector('textarea').value, 'Keep me');
  assert.match(x.root.textContent, /Unsaved note/);
});

test('grouped file navigation follows visible order and preserves selection across regrouping', async () => {
  const x = setup(); await x.controller.ready;
  x.snapshot({review:{revision:null,files:[
    {id:'diff-a',path:'src/a.js',group:'source'},
    {id:'diff-test',path:'tests/a.js',group:'tests'},
    {id:'diff-b',path:'src/b.js',group:'source'}
  ]}}); x.controller.render();
  assert.deepEqual([...x.root.querySelectorAll('[data-review-file]')].map(n=>n.dataset.reviewFile), ['src/a.js','src/b.js','tests/a.js']);
  const first=x.root.querySelector('[data-review-file]'); first.focus();
  first.dispatchEvent(new x.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(x.dom.window.document.activeElement.dataset.reviewFile,'src/b.js');
  click(x,'next'); await flush(); assert.equal(x.actions.at(-1).id,'diff-test');
  click(x,'previous'); await flush(); assert.equal(x.actions.at(-1).id,'diff-b');
  const group=x.root.querySelector('[data-review-filter="group"]');group.value='type';group.dispatchEvent(new x.dom.window.Event('change'));
  assert.equal(x.root.querySelector('[data-review-file][aria-pressed="true"]').dataset.reviewFile,'src/b.js');
  x.dom.window.close();
});

test('local progress counts loaded marks independently of revision verification', async () => {
  const x=setup(); await x.controller.ready;
  x.state({reviews:[{prUrl:'https://github.com/owner/repo/pull/3',files:[
    {path:'src/a.js',reviewed:true,reviewedRevision:sha},
    {path:'not-loaded.js',reviewed:true,reviewedRevision:sha}
  ]}]});x.controller.render();
  assert.match(x.root.querySelector('.review-summary').textContent,/1 locally marked of 3 loaded files/);
  assert.match(x.root.querySelector('.review-revision').textContent,/Revision not verified/);
  assert.doesNotMatch(x.root.querySelector('.review-summary').textContent,/verified/);
  const search=x.root.querySelector('[data-review-focus="search"]');search.value='src';search.dispatchEvent(new x.dom.window.Event('input'));
  assert.match(x.root.querySelector('.review-summary').textContent,/1 locally marked of 3 loaded files/);
  x.dom.window.close();
});

test('review refresh preserves the full selected search text and filter focus', async () => {
  const x=setup(); await x.controller.ready;
  input(x,'[data-review-focus="search"]','src');
  const search=x.root.querySelector('[data-review-focus="search"]');search.focus();search.setSelectionRange(0,2);
  x.controller.render();
  assert.equal(x.dom.window.document.activeElement.dataset.reviewFocus,'search');
  assert.equal(x.dom.window.document.activeElement.selectionStart,0);
  assert.equal(x.dom.window.document.activeElement.selectionEnd,2);
  const filter=x.root.querySelector('[data-review-filter="type"]');filter.focus();filter.value='source';filter.dispatchEvent(new x.dom.window.Event('change'));
  assert.equal(x.dom.window.document.activeElement.dataset.reviewFilter,'type');x.dom.window.close();
});
