/* Extension-origin private review workspace. Never submits a GitHub review. */
(() => {
  'use strict';
  const G = globalThis.GHE;
  G.mountReview = function mountReview(root, options) {
    const doc = root.ownerDocument, drafts = new Map(), collapsed = new Map();
    const touchedDrafts = new Set(), draftWrites = new Map();
    let selected = '', query = '', type = 'all', grouping = 'folder', busy = false, currentPR = '', destroyed = false;
    function node(tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
    function button(label, action, fn) { const b = node('button', 'button compact', label); b.type = 'button'; b.dataset.reviewAction = action; b.addEventListener('click', fn); return b; }
    function data() {
      const context = options.getContext(), review = options.getPageData()?.review;
      let prUrl = null;
      try { const url = new URL(context?.url); const match = url.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/); if (context?.type === 'pull' && url.origin === 'https://github.com' && match) prUrl = url.origin + match[0].replace(/\/$/, ''); } catch {}
      const record = (options.getState()?.reviews || []).find(r => r.prUrl === prUrl);
      const revision = /^[a-f0-9]{40}$/i.test(review?.revision || '') ? review.revision.toLowerCase() : null;
      return { prUrl, review, record, revision, files: review?.files || [] };
    }
    function status(file, revision) {
      if (G.reviewStatus) return G.reviewStatus(file, revision);
      if (!file?.reviewed) return 'unreviewed';
      if (!revision || !file.reviewedRevision) return 'unverified';
      return file.reviewedRevision === revision ? 'verified' : 'changed';
    }
    const statusText = { unreviewed: 'Not marked', verified: 'Verified at this revision', changed: 'Revision changed', unverified: 'Needs confirmation' };
    function draftKey(prUrl, path) { return prUrl + '\n' + path; }
    function persistDraft(key, note) {
      if (!options.saveToolDraft) return;
      // Keep writes from this surface in input order. Conditional deletion in
      // the shared store protects newer snapshots from another surface too.
      const pending = (draftWrites.get(key) || Promise.resolve())
        .then(() => options.saveToolDraft('review', key, { note }))
        .catch(error => options.notify(`Draft recovery could not be saved: ${error.message}`, true));
      draftWrites.set(key, pending);
    }
    function hasDrafts() {
      const reviews = options.getState()?.reviews || [];
      for (const [key, text] of drafts) {
        const [prUrl, path] = key.split('\n');
        const saved = reviews.find(review => review.prUrl === prUrl)?.files.find(file => file.path === path)?.note || '';
        if (text !== saved) return true;
      }
      return false;
    }
    async function collapseBatch(files, value) {
      if (busy) return;
      const { prUrl } = data();
      const pageUrl = options.getContext()?.url;
      busy = true; render();
      let changed = 0, unavailable = 0;
      try {
        for (const file of files) {
          if (options.getContext()?.url !== pageUrl) break;
          try {
            const result = await options.pageAction({ type: 'review-collapse', id: file.id, collapsed: value });
            if (result === false || result?.ok === false) { unavailable++; continue; }
            collapsed.set(draftKey(prUrl, file.path), value); changed++;
          } catch { unavailable++; }
        }
        options.notify(`${changed} loaded diff bodies ${value ? 'collapsed' : 'expanded'}${unavailable ? `; ${unavailable} unavailable` : ''}.`);
      } finally { busy = false; render(); }
    }
    async function write(message, success) {
      if (busy) return false;
      busy = true; render();
      try { const next = await options.request(message); options.onState(next); if (success) options.notify(success); return true; }
      catch (error) { options.notify(error.message || 'Could not save review.', true); return false; }
      finally { busy = false; render(); }
    }
    async function jump(file) {
      const { prUrl } = data(); if (!file || !prUrl) return;
      selected = file.path; render();
      try {
        const result = await options.pageAction({ type: 'review-jump', id: file.id });
        if (result === false || result?.ok === false) throw new Error('This diff is no longer loaded. Refresh the page data.');
        await write({ type: 'SET_REVIEW_LAST_FILE', prUrl, path: file.path });
      } catch (error) { options.notify(error.message, true); }
    }
    function render() {
      if (destroyed) return;
      const active = doc.activeElement;
      const focus = root.contains(active) ? active?.dataset.reviewFocus : null;
      const cursor = focus === 'note' || focus === 'search' ? [active.selectionStart, active.selectionEnd] : null;
      const d = data();
      if (currentPR !== d.prUrl) { currentPR = d.prUrl; selected = ''; query = ''; type = 'all'; collapsed.clear(); }
      root.classList.add('review-workspace'); root.setAttribute('aria-busy', String(busy));
      root.replaceChildren();
      const title = node('h2', '', 'Private review'); root.append(title);
      if (!d.prUrl || !d.files.length) {
        root.append(node('p', 'review-empty', 'Open a pull request’s Files changed page to work through its loaded diffs.'));
        return;
      }
      const marks = d.record?.files || [];
      const locallyMarked = d.files.filter(f => marks.some(m => m.path === f.path && m.reviewed)).length;
      root.append(node('p', 'review-summary', `${locallyMarked} locally marked of ${d.files.length} loaded files${d.review.truncated ? ' · list capped at 200' : ''}`));
      root.append(node('p', 'review-revision', d.revision ? `Commit ${d.revision.slice(0, 12)} · marks apply to this revision` : 'Revision not verified; previous marks need confirmation.'));
      root.append(node('p', 'review-privacy', 'Notes and marks stay on this device. GitHub Viewed and submitted reviews are unchanged.'));
      const toolbar = node('div', 'review-toolbar');
      const search = node('input', 'review-search'); search.type = 'search'; search.placeholder = 'Filter loaded file paths…'; search.value = query; search.setAttribute('aria-label', 'Filter loaded file paths'); search.dataset.reviewFocus = 'search';
      search.addEventListener('input', () => { query = search.value; render(); }); toolbar.append(search);
      function select(label, key, choices, value, change) {
        const field = node('label', 'review-select', label); const select = node('select'); select.setAttribute('aria-label', label); select.dataset.reviewFilter = key; select.dataset.reviewFocus = 'filter:' + key;
        for (const [id, text] of choices) { const option = node('option', '', text); option.value = id; select.append(option); }
        select.value = value; select.addEventListener('change', () => { change(select.value); render(); }); field.append(select); return field;
      }
      toolbar.append(select('Type', 'type', [['all', 'All types'], ['source', 'Source'], ['tests', 'Tests'], ['docs', 'Docs'], ['config', 'Config']], type, value => { type = value; }));
      toolbar.append(select('Group', 'group', [['folder', 'Folder'], ['type', 'Type']], grouping, value => { grouping = value; }));
      root.append(toolbar);
      const batch = node('div', 'review-batch');
      const generatedFiles = d.files.filter(file => file.lockfile || file.generated);
      const collapseGenerated = button(`Collapse lock / generated (${generatedFiles.length})`, 'collapse-generated', () => collapseBatch(generatedFiles, true));
      collapseGenerated.disabled = busy || !generatedFiles.length;
      const expandAll = button('Expand loaded diff bodies', 'expand-all', () => collapseBatch(d.files, false));
      expandAll.disabled = busy;
      batch.append(collapseGenerated, expandAll, node('small', '', 'File-name heuristics only; these files still need review.'));
      root.append(batch);
      const files = d.files.filter(f => (type === 'all' || f.group === type) && f.path.toLowerCase().includes(query.toLowerCase()));
      if (!files.some(f => f.path === selected)) selected = files[0]?.path || '';
      const resumeFile = d.files.find(f => f.path === d.record?.lastFile);
      if (resumeFile) root.append(button('Resume last file', 'resume', () => { query = ''; type = 'all'; jump(resumeFile); }));
      const list = node('div', 'review-files'); list.setAttribute('aria-label', 'Loaded diff files');
      const groups = new Map();
      for (const file of files) {
        const label = grouping === 'type' ? file.group : (file.folder || (file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : 'Repository root'));
        if (!groups.has(label)) groups.set(label, []); groups.get(label).push(file);
      }
      const displayedFiles = [...groups.values()].flat();
      root.append(node('p', 'review-keyboard-hint muted small', 'In the file list: ↑ / ↓ or j / k moves between files.'));
      for (const [label, members] of groups) {
        const section = node('section', 'review-file-group'); section.append(node('h3', '', label));
        for (const file of members) {
          const mark = marks.find(m => m.path === file.path), state = status(mark, d.revision);
          const b = node('button', 'review-file'); b.type = 'button'; b.dataset.reviewFile = file.path; b.dataset.reviewFocus = 'file:' + file.path; b.dataset.status = state; b.setAttribute('aria-pressed', String(selected === file.path));
          b.append(node('span', 'review-file-path', file.path));
          const badges = [statusText[state]]; if (file.lockfile) badges.push('Lockfile'); if (file.generated) badges.push('Likely generated');
          b.append(node('small', '', badges.join(' · ')));
          b.addEventListener('click', () => { selected = file.path; render(); });
          b.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
            event.preventDefault(); const offset = ['ArrowDown', 'j'].includes(event.key) ? 1 : -1;
            selected = displayedFiles[Math.max(0, Math.min(displayedFiles.length - 1, displayedFiles.indexOf(file) + offset))].path;
            render(); [...root.querySelectorAll('[data-review-file]')].find(el => el.dataset.reviewFile === selected)?.focus();
          }); section.append(b);
        }
        list.append(section);
      }
      if (!files.length) list.append(node('p', 'review-empty', 'No loaded files match these filters.'));
      root.append(list);
      const file = files.find(f => f.path === selected);
      if (file) {
        const editor = node('section', 'review-detail'), mark = marks.find(m => m.path === file.path), key = draftKey(d.prUrl, file.path);
        editor.append(node('h3', 'review-detail-path', file.path));
        const nav = node('div', 'review-navigation');
        const index = displayedFiles.indexOf(file);
        const previous = button('← Previous', 'previous', () => jump(displayedFiles[index - 1])); previous.disabled = index === 0 || busy;
        const next = button('Next →', 'next', () => jump(displayedFiles[index + 1])); next.disabled = index === displayedFiles.length - 1 || busy;
        nav.append(previous, button('Jump to diff', 'jump', () => jump(file)), next); editor.append(nav);
        const isCollapsed = collapsed.has(key) ? collapsed.get(key) : Boolean(file.collapsed);
        editor.append(button(isCollapsed ? 'Expand diff body' : 'Collapse diff body', 'collapse', async () => {
          try {
            const result = await options.pageAction({ type: 'review-collapse', id: file.id, collapsed: !isCollapsed });
            if (result === false || result?.ok === false) throw new Error('This diff body is not available to collapse.');
            collapsed.set(key, !isCollapsed); render();
          } catch (error) { options.notify(error.message, true); }
        }));
        if (file.viewedKnown || file.viewed) editor.append(node('p', 'review-native', `Native Viewed: ${file.viewed ? 'yes' : 'no'} · read only`));
        const checkLabel = node('label', 'review-check'); const check = node('input'); check.type = 'checkbox'; check.checked = Boolean(mark?.reviewed); check.disabled = busy;
        check.addEventListener('change', () => write({ type: 'UPDATE_REVIEW_FILE', prUrl: d.prUrl, path: file.path, revision: d.revision, patch: { reviewed: check.checked } }, d.revision ? 'Local review mark saved.' : 'Local mark saved; revision is unverified.'));
        checkLabel.append(check, node('span', '', 'Marked locally')); editor.append(checkLabel);
        editor.append(node('p', 'review-mark-status', statusText[status(mark, d.revision)]));
        if (mark?.reviewed && d.revision && status(mark, d.revision) !== 'verified') {
          const confirm = button('Confirm at this revision', 'confirm-mark', () => write({
            type: 'UPDATE_REVIEW_FILE', prUrl: d.prUrl, path: file.path, revision: d.revision, patch: { reviewed: true }
          }, 'Local mark confirmed at this revision.'));
          confirm.disabled = busy; editor.append(confirm);
        }
        const label = node('label', 'review-note-label', 'Private file note'); const note = node('textarea'); note.dataset.reviewFocus = 'note'; note.setAttribute('aria-label', 'Private file note'); note.maxLength = 10000; note.value = drafts.has(key) ? drafts.get(key) : mark?.note || ''; note.placeholder = 'Questions, edge cases, follow-up…';
        const cue = node('p', 'review-mark-status', note.value !== (mark?.note || '') ? 'Unsaved note' : 'Note saved');
        cue.setAttribute('role', 'status'); cue.dataset.reviewDraftStatus = '';
        note.addEventListener('input', () => {
          touchedDrafts.add(key); drafts.set(key, note.value); persistDraft(key, note.value);
          cue.textContent = note.value !== (mark?.note || '') ? 'Unsaved note' : 'Note saved';
        }); label.append(note); editor.append(label, cue);
        const save = button('Save note', 'save-note', async () => {
          const text = note.value;
          touchedDrafts.add(key);
          const pendingDraft = draftWrites.get(key);
          const saved = await write({ type: 'UPDATE_REVIEW_FILE', prUrl: d.prUrl, path: file.path, revision: d.revision, patch: { note: text } }, 'Private note saved.');
          if (saved) {
            await pendingDraft;
            try { await options.deleteToolDraft?.('review', key, { note: text }); }
            catch (error) { options.notify(`Note saved, but its recovery copy could not be cleared: ${error.message}`, true); }
            if (drafts.get(key) === text) drafts.delete(key);
            render();
          }
        }); save.disabled = busy; editor.append(save); root.append(editor);
      }
      if (focus) {
        const target = [...root.querySelectorAll('[data-review-focus]')].find(el => el.dataset.reviewFocus === focus);
        if (target) { target.focus({ preventScroll: true }); if (cursor && target.setSelectionRange) target.setSelectionRange(...cursor); }
      }
    }
    render();
    const ready = (async () => {
      try {
        const entries = await options.loadToolDrafts?.('review') || [];
        for (const entry of entries) {
          if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1]?.note !== 'string' || entry[1].note.length > 10000) continue;
          if (!touchedDrafts.has(entry[0])) drafts.set(entry[0], entry[1].note);
        }
        render();
      } catch (error) { options.notify(`Review drafts could not be recovered: ${error.message}`, true); }
    })();
    return { render, hasDrafts, ready, destroy() { destroyed = true; root.replaceChildren(); } };
  };
})();
