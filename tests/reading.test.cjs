const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const readingPath = path.join(__dirname, '../src/content/reading.js');
const modelPath = path.join(__dirname, '../src/shared/model.js');
const settings = { enabled: true, exactDates: true, wide: false, focus: false, locale: 'en-US', timeZone: 'UTC' };

function fixture(html) {
  const dom = new JSDOM(html, { url: 'https://github.com/octocat/hello-world', runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(modelPath, 'utf8'));
  if (fs.existsSync(readingPath)) dom.window.eval(fs.readFileSync(readingPath, 'utf8'));
  assert.equal(typeof dom.window.GHE.createReadingEnhancer, 'function', 'reading enhancer is exposed');
  const enhancer = dom.window.GHE.createReadingEnhancer(dom.window.document);
  return { dom, document: dom.window.document, enhancer };
}

test('exact dates preserve the native timestamp and appear only once after repeated apply', () => {
  const { document, enhancer } = fixture('<relative-time datetime="2026-09-28T12:30:00Z" title="native tooltip">yesterday</relative-time>');
  const time = document.querySelector('relative-time');
  const original = time.outerHTML;
  enhancer.apply(settings, { type: 'repository' });
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(time.outerHTML, original);
  assert.equal(document.querySelectorAll('[data-ghe-date]').length, 1);
  assert.equal(time.nextElementSibling.hasAttribute('data-ghe-date'), true);
  assert.match(time.nextElementSibling.textContent, /2026/);
  assert.match(time.nextElementSibling.title, /UTC/);
});

test('changing datetime updates the existing exact date and invalid values remove it', () => {
  const { document, enhancer } = fixture('<time-ago datetime="2026-09-28T12:30:00Z">yesterday</time-ago>');
  enhancer.apply(settings, { type: 'repository' });
  const time = document.querySelector('time-ago');
  const span = time.nextElementSibling;
  const oldText = span.textContent;
  time.setAttribute('datetime', '2027-01-02T03:00:00Z');
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(time.nextElementSibling, span);
  assert.notEqual(span.textContent, oldText);
  assert.match(span.textContent, /2027/);
  time.setAttribute('datetime', 'not-a-date');
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(document.querySelector('[data-ghe-date]'), null);
});

test('invalid or missing dates and dates inside extension hosts are left alone', () => {
  const { document, enhancer } = fixture('<relative-time>today</relative-time><relative-time datetime="bad">today</relative-time><div data-ghe-host><relative-time datetime="2026-09-28T12:30:00Z">today</relative-time></div>');
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(document.querySelector('[data-ghe-date]'), null);
});

test('turning dates off and master disable restore the original page', () => {
  const { document, enhancer } = fixture('<div class="repository-content"><relative-time datetime="2026-09-28T12:30:00Z">today</relative-time><div class="Layout-sidebar">About</div></div>');
  enhancer.apply({ ...settings, wide: true, focus: true }, { type: 'repository' });
  enhancer.apply({ ...settings, exactDates: false, wide: true, focus: true }, { type: 'repository' });
  assert.equal(document.querySelector('[data-ghe-date]'), null);
  enhancer.apply({ ...settings, enabled: false, wide: true, focus: true }, { type: 'repository' });
  assert.equal(document.querySelector('.ghe-wide, .ghe-focus-sidebar, style[data-ghe-reading]'), null);
  assert.equal(document.querySelector('relative-time').textContent, 'today');
});

test('focus affects only the repository overview sidebar and restores it on PR navigation', () => {
  const { document, enhancer } = fixture('<aside class="Layout-sidebar" id="unrelated">Account</aside><div class="repository-content"><aside class="Layout-sidebar" id="about">About</aside></div>');
  enhancer.apply({ ...settings, focus: true }, { type: 'repository' });
  assert.equal(document.querySelector('#about').classList.contains('ghe-focus-sidebar'), true);
  assert.equal(document.querySelector('#unrelated').classList.contains('ghe-focus-sidebar'), false);
  enhancer.apply({ ...settings, focus: true }, { type: 'pull' });
  assert.equal(document.querySelector('.ghe-focus-sidebar'), null);
  enhancer.apply({ ...settings, focus: true }, { type: 'issue' });
  assert.equal(document.querySelector('.ghe-focus-sidebar'), null);
});

test('wide changes known repository content without widening arbitrary main elements', () => {
  const { document, enhancer } = fixture('<main id="global"><div class="repository-content">Repo</div><div data-testid="repos-split-pane-content">Files</div></main>');
  enhancer.apply({ ...settings, wide: true }, { type: 'repository' });
  assert.equal(document.querySelector('#global').classList.contains('ghe-wide'), false);
  assert.equal(document.querySelector('.repository-content').classList.contains('ghe-wide'), true);
  assert.equal(document.querySelector('[data-testid="repos-split-pane-content"]').classList.contains('ghe-wide'), true);
  enhancer.apply({ ...settings, wide: false }, { type: 'repository' });
  assert.equal(document.querySelector('.ghe-wide'), null);
});

test('wide releases the modern repository layout limit while retaining README width', () => {
  const { document, enhancer } = fixture('<main><div class="repository-content"><div id="layout" class="prc-PageLayout-PageLayoutRoot--KH-d container-xl"><article><div id="readme" class="container-lg">README</div></article></div></div><div id="other" class="container-xl">Unrelated</div></main>');
  enhancer.apply({ ...settings, wide: true }, { type: 'repository' });
  assert.equal(document.querySelector('#layout').classList.contains('ghe-wide'), true);
  assert.equal(document.querySelector('#readme').classList.contains('ghe-wide'), false);
  assert.equal(document.querySelector('#other').classList.contains('ghe-wide'), false);
  assert.equal(document.defaultView.getComputedStyle(document.querySelector('#layout')).maxWidth, 'none');
  enhancer.destroy();
  assert.equal(document.querySelector('#layout').classList.contains('ghe-wide'), false);
});

test('focus does not hide controls on repository subpages even when their context type is repository', () => {
  const { document, dom, enhancer } = fixture('<div class="repository-content"><aside class="Layout-sidebar">Filters</aside></div>');
  dom.window.history.replaceState({}, '', '/octocat/hello-world/issues');
  const context = dom.window.GHE.parseContext(document.location.href);
  assert.equal(context.type, 'repository');
  enhancer.apply({ ...settings, focus: true }, context);
  assert.equal(document.querySelector('.ghe-focus-sidebar'), null);
});

test('wide removes both modern content caps without changing the About pane or README', () => {
  const { document, enhancer } = fixture(`
    <style>
      .prc-PageLayout-ContentWrapper-native { max-width: 1280px; }
      .prc-PageLayout-Content-native[data-width="large"] { max-width: 960px; }
      .container-lg { max-width: 1012px; }
      .prc-PageLayout-PaneWrapper-native { width: 320px; }
    </style>
    <div class="repository-content"><div class="container-xl">
      <div class="prc-PageLayout-PageLayoutContent-native">
        <div id="wrapper" data-component="SplitPageLayout.Content" class="prc-PageLayout-ContentWrapper-native">
          <div id="content" class="prc-PageLayout-Content-native" data-width="large" style="--spacing: 16px">
            <table><tbody><tr><td>Files</td></tr></tbody></table>
            <article><div id="readme" class="container-lg">README</div></article>
          </div>
        </div>
        <div id="about" class="prc-PageLayout-PaneWrapper-native" data-position="end">About</div>
      </div>
    </div></div>
    <div id="unrelated" data-component="SplitPageLayout.Content" class="prc-PageLayout-ContentWrapper-native"></div>`);
  const styleOf = id => document.defaultView.getComputedStyle(document.getElementById(id));
  const originalAttributes = document.getElementById('content').outerHTML;
  enhancer.apply({ ...settings, wide: true }, { type: 'repository' });
  for (const id of ['wrapper', 'content']) {
    assert.equal(document.getElementById(id).classList.contains('ghe-wide'), true);
    assert.equal(styleOf(id).maxWidth, 'none');
    assert.equal(styleOf(id).width, '100%');
  }
  assert.equal(styleOf('readme').maxWidth, '1012px');
  assert.equal(styleOf('about').width, '320px');
  assert.equal(styleOf('unrelated').maxWidth, '1280px');
  assert.equal(document.getElementById('about').classList.contains('ghe-wide'), false);
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(styleOf('wrapper').maxWidth, '1280px');
  assert.equal(styleOf('content').maxWidth, '960px');
  assert.equal(document.getElementById('content').outerHTML, originalAttributes);
  enhancer.apply({ ...settings, wide: true }, { type: 'repository' });
  enhancer.destroy();
  assert.equal(document.querySelector('.ghe-wide, [data-ghe-reading]'), null);
  assert.equal(styleOf('content').maxWidth, '960px');
});

test('modern focus hides only the identified About pane and removes its layout gap reversibly', () => {
  const { document, enhancer } = fixture('<div class="repository-content"><div id="layout" class="prc-PageLayout-PageLayoutContent-BneH9"><div data-component="SplitPageLayout.Content">Files</div><div id="about" class="prc-PageLayout-PaneWrapper-pHPop pr-2" data-position="end"><div data-component="SplitPageLayout.Pane"><div class="CodeViewSidebar-module__borderGrid__Lpx5q"><h2><span class="SidebarAbout-module__aboutHeading__M1IAF">Hakkında</span></h2></div></div></div></div><div id="filetree" class="prc-PageLayout-PaneWrapper-other" data-position="end"><div data-component="SplitPageLayout.Pane">File tree</div></div></div>');
  enhancer.apply({ ...settings, focus: true }, { type: 'repository' });
  assert.equal(document.defaultView.getComputedStyle(document.querySelector('#about')).display, 'none');
  assert.equal(document.querySelector('#filetree').classList.contains('ghe-focus-sidebar'), false);
  assert.equal(document.defaultView.getComputedStyle(document.querySelector('#layout')).display, 'block');
  assert.equal(document.querySelector('#layout').classList.contains('ghe-focus-layout'), true);
  enhancer.apply({ ...settings, focus: true }, { type: 'pull', url: 'https://github.com/octocat/hello-world/pull/1' });
  assert.equal(document.querySelector('.ghe-focus-sidebar, .ghe-focus-layout'), null);
  enhancer.apply({ ...settings, focus: true }, { type: 'repository' });
  enhancer.destroy();
  assert.equal(document.querySelector('.ghe-focus-sidebar, .ghe-focus-layout'), null);
  assert.equal(document.querySelector('#about').getAttribute('data-position'), 'end');
});

test('removed timestamps lose their owned spans and newly inserted timestamps are enhanced', () => {
  const { document, enhancer } = fixture('<div id="row"><relative-time datetime="2026-09-28T12:30:00Z">today</relative-time></div>');
  enhancer.apply(settings, { type: 'repository' });
  document.querySelector('relative-time').remove();
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(document.querySelector('[data-ghe-date]'), null);
  document.querySelector('#row').innerHTML = '<relative-time datetime="2026-09-29T12:30:00Z">tomorrow</relative-time>';
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(document.querySelectorAll('[data-ghe-date]').length, 1);
});

test('destroy removes only owned additions and can be called repeatedly before reuse', () => {
  const { document, enhancer } = fixture('<style id="native">body{color:red}</style><div class="repository-content native-class"><relative-time datetime="2026-09-28T12:30:00Z">today</relative-time><aside class="Layout-sidebar">About</aside></div>');
  enhancer.apply({ ...settings, wide: true, focus: true }, { type: 'repository' });
  enhancer.destroy();
  enhancer.destroy();
  assert.equal(document.querySelector('[data-ghe-date], .ghe-wide, .ghe-focus-sidebar, style[data-ghe-reading]'), null);
  assert.ok(document.querySelector('#native'));
  assert.ok(document.querySelector('.native-class'));
  enhancer.apply(settings, { type: 'repository' });
  assert.equal(document.querySelectorAll('[data-ghe-date]').length, 1);
  assert.equal(document.querySelectorAll('style[data-ghe-reading]').length, 1);
});

test('table dates show one compact date line while preserving native time and full tooltip', () => {
  const { document, enhancer } = fixture('<table><tbody><tr class="react-directory-row"><td><relative-time datetime="2026-01-02T13:04:00Z" title="native">2 days ago</relative-time></td></tr></tbody></table>');
  const time = document.querySelector('relative-time');
  const original = time.outerHTML;
  enhancer.apply(settings, { type: 'repository' });
  const span = document.querySelector('[data-ghe-date]');
  assert.equal(span.textContent, 'Jan 2, 2026');
  assert.equal(span.hasAttribute('data-ghe-compact'), true);
  assert.match(span.title, /13:04.*UTC/);
  assert.equal(time.outerHTML, original);
  const style = document.defaultView.getComputedStyle(span);
  assert.equal(style.display, 'block');
  assert.equal(style.whiteSpace, 'nowrap');
  assert.equal(style.fontSize, '11px');
});

test('compact dates inherit Turkish locale and UTC date boundaries and restore full text outside tables', () => {
  const { document, enhancer } = fixture('<table><tbody><tr><td><time-ago datetime="2026-01-02T23:30:00-03:00">yesterday</time-ago></td></tr></tbody></table><div id="conversation"></div>');
  enhancer.apply({ ...settings, locale: 'tr-TR' }, { type: 'repository' });
  const span = document.querySelector('[data-ghe-date]');
  assert.equal(span.textContent, '3 Oca 2026');
  assert.match(span.title, /02:30.*UTC/);
  document.querySelector('#conversation').append(document.querySelector('time-ago'));
  enhancer.apply({ ...settings, locale: 'tr-TR' }, { type: 'issue' });
  assert.equal(span.hasAttribute('data-ghe-compact'), false);
  assert.match(span.textContent, /02:30.*UTC/);
});
