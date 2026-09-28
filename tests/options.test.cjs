const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../src/options');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

async function setup(handler) {
  const htmlPath = path.join(base, 'options.html');
  const dom = new JSDOM(fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '<body></body>', { runScripts: 'outside-only', url: 'https://extension.test/options.html' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../src/shared/model.js'), 'utf8'));
  dom.window.TextEncoder = TextEncoder;
  dom.window.GHE.request = handler;
  const scriptPath = path.join(base, 'options.js');
  if (fs.existsSync(scriptPath)) dom.window.eval(fs.readFileSync(scriptPath, 'utf8'));
  assert.equal(typeof dom.window.GHE.createOptions, 'function', 'settings controller is available');
  const controller = dom.window.GHE.createOptions(dom.window.document);
  await controller.ready;
  return { dom, document: dom.window.document, controller };
}

function state(patch = {}) {
  return { settings: { enabled: true, exactDates: true, wide: false, focus: false, theme: 'auto', locale: 'auto', timeZone: 'local', shortcut: true, ...patch }, items: [] };
}

test('settings load committed values and save only the changed field', async () => {
  let current = state({ locale: 'tr-TR', wide: true });
  const messages = [];
  const { document } = await setup(async message => {
    messages.push(message);
    if (message.type === 'SET_SETTINGS') current = state({ ...current.settings, ...message.patch });
    return current;
  });
  assert.equal(document.querySelector('[name="locale"]').value, 'tr-TR');
  assert.equal(document.querySelector('[name="wide"]').checked, true);
  const enabled = document.querySelector('[name="enabled"]');
  enabled.checked = false;
  enabled.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(messages[1])), { type: 'SET_SETTINGS', patch: { enabled: false } });
  assert.match(document.querySelector('#save-status').textContent, /saved/i);
});

test('failed setting writes restore the committed value and show the error', async () => {
  const { document } = await setup(async message => {
    if (message.type === 'SET_SETTINGS') throw new Error('Storage is full. Export a backup and remove unused items.');
    return state({ theme: 'light' });
  });
  const theme = document.querySelector('[name="theme"]');
  theme.value = 'dark';
  theme.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  await tick();
  assert.equal(theme.value, 'light');
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.match(document.querySelector('#save-status').textContent, /Storage is full/);
  assert.equal(theme.disabled, false);
});

test('initial load failure leaves controls disabled and offers a working retry', async () => {
  let fail = true;
  const { document } = await setup(async () => { if (fail) throw new Error('Connection lost.'); return state(); });
  assert.equal(document.querySelector('[name="enabled"]').disabled, true);
  assert.match(document.querySelector('#save-status').textContent, /Connection lost/);
  const retry = document.querySelector('#retry-load');
  assert.equal(retry.hidden, false);
  fail = false;
  retry.click();
  await tick();
  assert.equal(document.querySelector('[name="enabled"]').disabled, false);
  assert.equal(retry.hidden, true);
});

test('import sends the file contents for backend validation and reports failure without replacing settings', async () => {
  let imported;
  const { document, dom } = await setup(async message => {
    if (message.type === 'IMPORT_ITEMS') { imported = message.text; throw new Error('This file is not valid JSON.'); }
    return state({ locale: 'tr-TR' });
  });
  const input = document.querySelector('#import-file');
  Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File(['broken'], 'backup.json', { type: 'application/json' })] });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick();
  await tick();
  assert.equal(imported, 'broken');
  assert.match(document.querySelector('#backup-status').textContent, /not valid JSON/);
  assert.equal(document.querySelector('[name="locale"]').value, 'tr-TR');
});

test('successful import applies the committed merged state', async () => {
  const { document, dom } = await setup(async message => message.type === 'IMPORT_ITEMS' ? { ...state({ locale: 'tr-TR', theme: 'dark' }), items: [{ url: 'https://github.com/a/b' }] } : state());
  const input = document.querySelector('#import-file');
  Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File(['{"version":1,"items":[]}'], 'backup.json')] });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick();
  await tick();
  assert.equal(document.querySelector('[name="locale"]').value, 'tr-TR');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.match(document.querySelector('#backup-status').textContent, /imported/i);
  assert.match(document.querySelector('#workspace-count').textContent, /1 saved page/);
});

test('oversized import is rejected before reading with the current limit in its error', async () => {
  let imports = 0;
  const { document, dom } = await setup(async message => { if (message.type === 'IMPORT_ITEMS') imports += 1; return state(); });
  const file = new dom.window.File(['{}'], 'oversized.json');
  Object.defineProperty(file, 'size', { value: 33 * 1024 * 1024 });
  const input = document.querySelector('#import-file');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick();
  assert.equal(imports, 0);
  assert.match(document.querySelector('#backup-status').textContent, /32 MB/);
  assert.equal(document.querySelector('#import-button').disabled, false);
});

test('export downloads the latest committed workspace including notes and settings', async () => {
  let calls = 0;
  const item = { url: 'https://github.com/octocat/hello-world', title: 'Hello World', note: 'Private context',createdAt:1,updatedAt:1 };
  const { document, dom } = await setup(async () => { calls += 1; return calls > 1 ? { ...state({ locale: 'tr-TR' }), items: [item] } : state(); });
  let blob;
  dom.window.URL.createObjectURL = value => { blob = value; return 'blob:backup'; };
  dom.window.URL.revokeObjectURL = () => {};
  document.addEventListener('click', event => { if (event.target.matches('a[download]')) event.preventDefault(); });
  document.querySelector('#export-button').click();
  await tick();
  assert.ok(blob, 'export creates a downloadable blob');
  const text = await new Promise((resolve, reject) => {
    const reader = new dom.window.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(blob);
  });
  const backup = JSON.parse(text);
  assert.equal(backup.version, 2);
  assert.deepEqual(backup.snippets, []);
  assert.deepEqual(backup.workspaces, []);
  assert.deepEqual(backup.reviews, []);
  assert.equal(backup.items[0].note, 'Private context');
  assert.equal(backup.settings.locale, 'tr-TR');
});
