/* Read loaded GitHub diffs; native review state remains authoritative. */
(() => {
  'use strict';
  const G = globalThis.GHE = globalThis.GHE || {};
  const SELECTOR = '[role="region"][id^="diff-"], .file[id^="diff-"]';
  const MAX_FILES = 200;
  const collapsedDocuments = new WeakMap();

  function resetReviewTools(document) {
    const owned = collapsedDocuments.get(document);
    if (!owned) return;
    for (const table of owned.nodes) table.classList.remove('ghe-review-collapsed-body');
    owned.style.remove();
    collapsedDocuments.delete(document);
  }

  function reviewRoute(value) {
    try {
      const url = new URL(value);
      if (url.origin !== 'https://github.com' || url.username || url.password) return null;
      const pr = url.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+\/(?:files|changes)(?:\/([a-f0-9]{7,40}))?\/?$/i);
      const commit = url.pathname.match(/^\/[^/]+\/[^/]+\/commit\/([a-f0-9]{6,40})\/?$/i);
      if (!pr && !commit) return null;
      const revision = pr?.[1] || commit?.[1] || '';
      // A short hash cannot be compared safely with persisted full revisions.
      // Aggregate views expose no authoritative head marker in the observed DOM.
      return { revision: /^[a-f0-9]{40}$/i.test(revision) ? revision.toLowerCase() : null };
    } catch { return null; }
  }

  function cleanPath(value) {
    if (typeof value !== 'string') return '';
    const text = value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    return text.length && text.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(text) ? text : '';
  }

  function groupPath(path) {
    const lower = path.toLowerCase();
    const name = lower.split('/').pop();
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const extension = name.includes('.') && !name.startsWith('.') ? '.' + name.split('.').pop() : '';
    const lockfile = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|cargo\.lock|poetry\.lock|pipfile\.lock|gemfile\.lock|composer\.lock|go\.sum)$/.test(name);
    const generated = /(^|\/)(dist|build|coverage|vendor|generated|__generated__)(\/|$)/.test(lower) || /\.(min\.[^./]+|generated\.[^./]+|map)$/.test(name);
    let group = 'source';
    if (/(^|\/)(__tests__|tests?|specs?|e2e|cypress)(\/|$)/.test(lower) || /\.(test|spec)\.[^./]+$/.test(name)) group = 'tests';
    else if (/(^|\/)(docs?|documentation)(\/|$)/.test(lower) || /\.(md|mdx|rst|adoc)$/.test(name) || /^(readme|license|changelog|contributing)(\.|$)/.test(name)) group = 'docs';
    else if (lockfile || lower.startsWith('.github/') || /\.(json|ya?ml|toml|ini|cfg)$/.test(name) || /(^\.|\.config\.|^dockerfile$|^makefile$|^gemfile$|^go\.mod$)/.test(name)) group = 'config';
    return { group, folder, extension, lockfile, generated };
  }

  function describe(container) {
    if (!/^diff-[a-z0-9_-]{1,128}$/i.test(container.id) || container.closest('[data-ghe-host], [hidden], [aria-hidden="true"], .markdown-body')) return null;
    const header = container.querySelector('[data-diff-header-wrapper], .file-header');
    if (!header) return null;
    const code = header.querySelector('h3 a code');
    let path = cleanPath(header.getAttribute('data-path') || header.querySelector('[data-file-path]')?.getAttribute('data-file-path'));
    if (!path && code) {
      const renameArrow = code.querySelector('span[aria-hidden="true"] svg.octicon-arrow-right');
      if (renameArrow) {
        let destination = '';
        for (let node = renameArrow.nextSibling; node; node = node.nextSibling) destination += node.textContent || '';
        path = cleanPath(destination);
      } else path = cleanPath(code.textContent);
    }
    if (!path) return null;
    const nativeButton = header.querySelector('[class*="MarkAsViewedButton-"][aria-pressed]');
    const nativeCheckbox = header.querySelector('input.js-reviewed-checkbox[type="checkbox"]');
    const viewedKnown = Boolean(nativeButton || nativeCheckbox);
    const viewed = nativeButton ? nativeButton.getAttribute('aria-pressed') === 'true' : Boolean(nativeCheckbox?.checked);
    const stats = {};
    for (const label of header.querySelectorAll('.sr-only')) {
      const match = label.textContent.match(/^Lines changed:\s*([\d,]+) additions?\s*&\s*([\d,]+) deletions?$/);
      if (match) {
        const additions = Number(match[1].replaceAll(',', ''));
        const deletions = Number(match[2].replaceAll(',', ''));
        if (Number.isSafeInteger(additions) && Number.isSafeInteger(deletions)) Object.assign(stats, { additions, deletions });
        break;
      }
    }
    return { id: container.id, path, ...groupPath(path), viewed, viewedKnown, ...stats,
      ...(container.querySelector('.ghe-review-collapsed-body') ? { collapsed: true } : {}) };
  }

  function collectReview(document, context) {
    if (!context || !['pull', 'commit'].includes(context.type)) return null;
    const route = reviewRoute(context.url || document.location.href);
    if (!route) return null;
    const files = [];
    const ids = new Set();
    let truncated = false;
    for (const container of document.querySelectorAll(SELECTOR)) {
      const file = describe(container);
      if (!file || ids.has(file.id)) continue;
      if (files.length === MAX_FILES) { truncated = true; break; }
      ids.add(file.id);
      files.push(file);
    }
    return files.length ? { files, loadedOnly: true, revision: route.revision, truncated } : null;
  }

  function reviewAction(document, action) {
    if (!['review-jump', 'review-collapse'].includes(action?.type) || typeof action.id !== 'string' || !reviewRoute(document.location.href)) return false;
    const container = document.getElementById(action.id);
    if (!container?.matches(SELECTOR) || !describe(container)) return false;
    if (action.type === 'review-collapse') {
      if (typeof action.collapsed !== 'boolean') return false;
      // Modern rendered diffs use tables; deferred/deleted diffs use a
      // HiddenDiffPatch placeholder tied to this exact diff anchor. Neither
      // selector includes the header or arbitrary sibling comment panels.
      const bodies = [...container.querySelectorAll('table, .diff-table')];
      for (const placeholder of container.querySelectorAll('div[data-diff-anchor]')) {
        if (placeholder.getAttribute('data-diff-anchor') === container.id &&
          placeholder.querySelector(':scope > [class*="HiddenDiffPatch-module__"]')) bodies.push(placeholder);
      }
      const tables = bodies.filter(table =>
        !table.closest('[data-diff-header-wrapper], .file-header, .markdown-body, [data-ghe-host]'));
      if (!tables.length) return false;
      let owned = collapsedDocuments.get(document);
      if (!owned && action.collapsed) {
        const style = document.createElement('style');
        style.setAttribute('data-ghe-review-style', '');
        style.textContent = '.ghe-review-collapsed-body{display:none !important}';
        (document.head || document.documentElement).append(style);
        owned = { nodes: new Set(), style };
        collapsedDocuments.set(document, owned);
      }
      for (const table of tables) {
        if (action.collapsed && !table.classList.contains('ghe-review-collapsed-body')) {
          table.classList.add('ghe-review-collapsed-body'); owned.nodes.add(table);
        } else if (!action.collapsed && owned?.nodes.has(table)) {
          table.classList.remove('ghe-review-collapsed-body'); owned.nodes.delete(table);
        }
      }
      if (owned && !owned.nodes.size) resetReviewTools(document);
      return true;
    }
    const previousTabIndex = container.getAttribute('tabindex');
    try {
      if (previousTabIndex === null) container.setAttribute('tabindex', '-1');
      container.scrollIntoView({ block: 'start', behavior: 'auto' });
      container.focus({ preventScroll: true });
      return true;
    } catch { return false; }
    finally {
      if (previousTabIndex === null) container.removeAttribute('tabindex');
    }
  }

  Object.assign(G, { collectReview, reviewAction, resetReviewTools });
})();
