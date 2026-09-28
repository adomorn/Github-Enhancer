const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
// Reduced observed structures: sandbox/pull/71 and sandbox/issues/136.
const legacy = (id, body = 'Visible text') => `<div id="${id}" class="timeline-comment"><div class="timeline-comment-header"><a class="author">fregante</a><a href="#${id}">date</a></div><div class="comment-body markdown-body js-comment-body">${body}</div></div>`;
const modern = (id, body = '<p>First paragraph</p><p>Second</p>') => `<div class="react-issue-comment"><div data-testid="comment-viewer-outer-box-IC_abc"><div id="${id}" data-testid="comment-header"><a data-testid="avatar-link">author</a><a href="#${id}">date</a></div><div class="IssueCommentViewer-module__IssueCommentBody__IXu9t"><div data-testid="markdown-body" class="markdown-body"><div class="markdown-body NewMarkdownViewer-module__safe-html-box__ZT1eD">${body}</div></div></div></div></div>`;
function setup(html, pathname = '/refined-github/sandbox/issues/136') {
  const dom = new JSDOM(html, { url: 'https://github.com' + pathname, runScripts: 'outside-only' });
  dom.window.GHE = {};
  if (fs.existsSync('src/content/conversation-tools.js')) dom.window.eval(fs.readFileSync('src/content/conversation-tools.js', 'utf8'));
  assert.equal(typeof dom.window.GHE.collectConversation, 'function');
  return { dom, document: dom.window.document, api: dom.window.GHE, context: { url: dom.window.location.href, type: pathname.includes('/pull/') ? 'pull' : pathname.includes('/discussions/') ? 'discussion' : 'issue' } };
}
function collect(x) { return x.api.collectConversation(x.document, x.context); }

test('modern comment header owns its sibling Markdown body with no nested duplicates', () => {
  const x = setup(modern('issuecomment-4406075459') + modern('issuecomment-4406075669'));
  const before = x.document.body.innerHTML, result = collect(x);
  assert.equal(result.comments.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.comments[0])), { id: 'issuecomment-4406075459', url: 'https://github.com/refined-github/sandbox/issues/136#issuecomment-4406075459', author: 'author', body: 'First paragraph\nSecond', kind: 'comment' });
  assert.equal(result.loadedOnly, true); assert.equal(result.truncated, false);
  assert.equal(x.document.body.innerHTML, before);
});

test('legacy PR description and review comments retain verified source anchors and text', () => {
  const x = setup(legacy('issue-1734285236', '&lt;script&gt;literal&lt;/script&gt;') + legacy('discussion_r123', '<p>Review note</p>'), '/refined-github/sandbox/pull/71');
  const result = collect(x);
  assert.deepEqual(Array.from(result.comments, c => c.kind), ['description', 'review']);
  assert.equal(result.comments[0].body, '<script>literal</script>');
  assert.equal(result.comments[1].url, 'https://github.com/refined-github/sandbox/pull/71#discussion_r123');
});

test('unsupported routes, previews, hidden/extension bodies and unverified permalinks are excluded', () => {
  const x = setup(`<div data-ghe-host>${legacy('issuecomment-1')}</div><div hidden>${legacy('issuecomment-2')}</div><form>${legacy('issuecomment-3')}</form>${legacy('issuecomment-new')}${legacy('event-5')}${legacy('issuecomment-6').replace('href="#issuecomment-6"','href="https://evil.test/#issuecomment-6"')}${legacy('issuecomment-7', '<span hidden>secret</span><script>evil()</script><p>Read me</p>')}`);
  assert.deepEqual(Array.from(collect(x).comments, c => c.id), ['issuecomment-7']);
  assert.equal(collect(x).comments[0].body, 'Read me');
  const diff = setup(legacy('issuecomment-8'), '/refined-github/sandbox/pull/71/changes');
  assert.equal(collect(diff), null);
});

test('comment count, individual body and total text are bounded and flagged', () => {
  const x = setup(Array.from({ length: 201 }, (_, i) => legacy(`issuecomment-${i}`, 'short')).join(''));
  assert.equal(collect(x).comments.length, 200); assert.equal(collect(x).truncated, true);
  const large = setup(Array.from({ length: 40 }, (_, i) => legacy(`issuecomment-${i}`, 'x'.repeat(10001))).join(''));
  const result = collect(large);
  assert.equal(result.comments[0].body.length, 10000);
  assert.equal(result.comments.reduce((sum, c) => sum + c.body.length, 0), 300000);
  assert.equal(result.truncated, true);
});

test('jump revalidates an exact collected native anchor and never clicks or changes location', () => {
  const x = setup(modern('issuecomment-1'));
  const header = x.document.getElementById('issuecomment-1');
  let scrolled = 0, clicks = 0; header.scrollIntoView = () => scrolled++; header.addEventListener('click', () => clicks++);
  const url = x.document.location.href;
  assert.equal(x.api.conversationAction(x.document, { type: 'conversation-jump', id: 'issuecomment-1' }), true);
  assert.equal(scrolled, 1); assert.equal(clicks, 0);
  assert.equal(x.document.activeElement, header); assert.equal(header.hasAttribute('tabindex'), false);
  assert.equal(x.document.location.href, url);
  header.closest('.react-issue-comment').remove();
  assert.equal(x.api.conversationAction(x.document, { type: 'conversation-jump', id: 'issuecomment-1' }), false);
});
