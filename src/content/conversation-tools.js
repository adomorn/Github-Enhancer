/* Read only rendered, anchored conversation text. No requests or posting. */
(() => {
  'use strict';
  const G = globalThis.GHE = globalThis.GHE || {};
  const IDS = '[id^="issue-"], [id^="issuecomment-"], [id^="discussion_r"], [id^="discussioncomment-"]';
  const VALID_ID = /^(?:issue-|issuecomment-|discussion_r|discussioncomment-)\d+$/;
  const BODY = '[data-testid="markdown-body"], .js-comment-body, .comment-body';
  const EXCLUDED = '[data-ghe-host], [data-ghe-date], [hidden], [aria-hidden="true"], .d-none, form, .js-preview-body, script, style, textarea, input, [contenteditable="true"]';
  const MAX_COMMENTS = 200, MAX_BODY = 10000, MAX_TOTAL = 300000;

  function route(value) {
    try {
      const url = new URL(value);
      if (url.origin !== 'https://github.com' || url.username || url.password || !/^\/[^/]+\/[^/]+\/(issues|pull|discussions)\/\d+\/?$/.test(url.pathname)) return null;
      return url.origin + url.pathname.replace(/\/$/, '');
    } catch { return null; }
  }
  function excluded(element) {
    if (!element || element.closest(EXCLUDED)) return true;
    for (let e = element; e; e = e.parentElement) {
      if (e.tagName === 'DETAILS' && !e.hasAttribute('open')) return true;
      const style = e.style;
      if (style?.display === 'none' || style?.visibility === 'hidden') return true;
    }
    return false;
  }
  function identify(anchor, base) {
    if (!VALID_ID.test(anchor.id) || excluded(anchor) || anchor.closest('.markdown-body')) return null;
    // React issues put the anchor on their header, not the body wrapper.
    const scope = anchor.matches('[data-testid="comment-header"]') ? anchor.closest('.react-issue-comment') : anchor;
    if (!scope) return null;
    const body = [...scope.querySelectorAll(BODY)].find(candidate => {
      if (excluded(candidate) || candidate.classList.contains('js-preview-body')) return false;
      if (scope !== anchor) return candidate.closest('.react-issue-comment') === scope;
      let owner = candidate.parentElement;
      while (owner && owner !== anchor) {
        if (VALID_ID.test(owner.id)) return false;
        owner = owner.parentElement;
      }
      return owner === anchor;
    });
    if (!body) return null;
    // Require the page's own permalink outside user-authored Markdown.
    const permalink = [...scope.querySelectorAll('a[href]')].find(link => {
      if (link.closest('.markdown-body') || excluded(link)) return false;
      try { const url = new URL(link.getAttribute('href'), base); return route(url.href) === base && url.hash === '#' + anchor.id; }
      catch { return false; }
    });
    if (!permalink) return null;
    const authorNode = scope.querySelector('[data-testid="avatar-link"], .timeline-comment-header .author, .author');
    const author = (authorNode?.textContent || '').trim().slice(0, 100);
    const kind = anchor.id.startsWith('issue-') ? 'description' : anchor.id.startsWith('discussion_r') ? 'review' : anchor.id.startsWith('discussioncomment-') ? 'discussion' : 'comment';
    return { anchor, body, id: anchor.id, url: base + '#' + anchor.id, author, kind };
  }
  function bodyText(body, limit) {
    const walker = body.ownerDocument.createTreeWalker(body, 4);
    let text = '', previousBlock = null;
    for (let leaf = walker.nextNode(); leaf; leaf = walker.nextNode()) {
      if (excluded(leaf.parentElement)) continue;
      const block = leaf.parentElement.closest('p, pre, li, blockquote, h1, h2, h3, h4, h5, h6, tr');
      if (block && previousBlock && block !== previousBlock && !text.endsWith('\n')) text += '\n';
      text += (leaf.nodeValue || '').slice(0, Math.max(0, limit + 1 - text.length));
      if (block) previousBlock = block;
      if (text.length > limit) return { text: text.slice(0, limit).trim(), truncated: true };
    }
    return { text: text.trim(), truncated: false };
  }
  function scan(document, base) {
    const comments = [], ids = new Set(), bodies = new Set();
    let length = 0, truncated = false;
    for (const anchor of document.querySelectorAll(IDS)) {
      const item = identify(anchor, base);
      if (!item || ids.has(item.id) || bodies.has(item.body)) continue;
      if (comments.length === MAX_COMMENTS || length >= MAX_TOTAL) { truncated = true; break; }
      const result = bodyText(item.body, Math.min(MAX_BODY, MAX_TOTAL - length));
      truncated ||= result.truncated;
      if (!result.text) continue;
      ids.add(item.id); bodies.add(item.body); length += result.text.length;
      comments.push({ id: item.id, url: item.url, author: item.author, body: result.text, kind: item.kind });
    }
    return { comments, loadedOnly: true, truncated };
  }
  function collectConversation(document, context) {
    if (!context || !['issue', 'pull', 'discussion'].includes(context.type)) return null;
    const base = route(context.url || document.location.href);
    if (!base || base !== route(document.location.href)) return null;
    return scan(document, base);
  }
  function conversationAction(document, action) {
    const base = route(document.location.href);
    if (!base || action?.type !== 'conversation-jump' || !VALID_ID.test(action.id || '')) return false;
    // The action is limited to this bounded snapshot, not arbitrary page IDs.
    if (!scan(document, base).comments.some(comment => comment.id === action.id)) return false;
    const anchor = document.getElementById(action.id);
    if (!anchor || !identify(anchor, base)) return false;
    const previous = anchor.getAttribute('tabindex');
    try {
      if (previous === null) anchor.setAttribute('tabindex', '-1');
      anchor.scrollIntoView({ block: 'start', behavior: 'auto' }); anchor.focus({ preventScroll: true });
      return true;
    } catch { return false; }
    finally { if (previous === null) anchor.removeAttribute('tabindex'); }
  }
  Object.assign(G, { collectConversation, conversationAction });
})();
