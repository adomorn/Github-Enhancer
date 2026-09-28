/* Local code excerpts. Page text is never interpreted as HTML. */
(() => {
  'use strict';
  const G = globalThis.GHE = globalThis.GHE || {};
  const MAX_CODE = 20000;
  const MAX_NOTE = 10000;
  const MAX_TITLE = 300;
  const plain = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const markdownText = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&');

  function sourceURL(snippet) {
    const context = G.parseContext(snippet?.url);
    if (!context || context.type !== 'code' || !/^\/[^/]+\/[^/]+\/blob\//.test(new URL(context.url).pathname)) throw new Error('Choose a supported GitHub code source.');
    const url = new URL(context.url);
    if (!Number.isSafeInteger(snippet.lineStart) || !Number.isSafeInteger(snippet.lineEnd) || snippet.lineStart < 1 || snippet.lineEnd < snippet.lineStart) throw new Error('Choose a valid source line range.');
    url.hash = snippet.lineStart === snippet.lineEnd ? `L${snippet.lineStart}` : `L${snippet.lineStart}-L${snippet.lineEnd}`;
    return url;
  }

  function provenance(snippet) {
    const url = sourceURL(snippet);
    const match = url.pathname.match(/^\/[^/]+\/[^/]+\/blob\/([a-f0-9]{40})\//i);
    return match ? `Commit permalink · ${match[1].slice(0, 12)}` : 'Branch or tag link · source may change';
  }

  function snippetMarkdown(snippet) {
    const url = sourceURL(snippet).href.replace(/\(/g, '%28').replace(/\)/g, '%29');
    const code = String(snippet.code ?? '');
    const longest = Math.max(0, ...(code.match(/`+/g) || []).map(run => run.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const language = /^[a-z0-9_+.-]{1,40}$/i.test(snippet.language || '') ? snippet.language : '';
    const title = markdownText(plain(snippet.title || snippet.path || 'Code excerpt'));
    const path = markdownText(plain(snippet.path || 'Source'));
    const range = snippet.lineStart === snippet.lineEnd ? `line ${snippet.lineStart}` : `lines ${snippet.lineStart}–${snippet.lineEnd}`;
    const note = String(snippet.note || '').trim();
    return `## ${title}\n\n[${path} · ${range}](${url})\n\n${provenance(snippet)}\n\n${fence}${language}\n${code}${code.endsWith('\n') ? '' : '\n'}${fence}${note ? '\n\n' + note.split(/\r?\n/).map(line => '> ' + markdownText(line)).join('\n') : ''}\n`;
  }

  function basketMarkdown(snippets, title = 'Code basket') {
    return `# ${markdownText(plain(title) || 'Code basket')}\n\n${snippets.map(snippetMarkdown).join('\n')}`;
  }

  function mountBasket(root, options) {
    const document = root.ownerDocument;
    const view = document.defaultView;
    const composerDrafts = new Map();
    const composerBaselines = new Map();
    const snippetDrafts = new Map();
    const snippetBaselines = new Map();
    const touchedDraftKeys = new Set();
    const recoverySnapshots = new Map();
    const composerFields = ['start', 'end', 'title', 'note'];
    const snippetFields = ['title', 'note'];
    const editors = new Set();
    const expanded = new Set();
    let query = '', busy = false, undoItem = null;
    let composer, list, listCount, search, undoArea, exportNotice;
    root.classList.add('basket');

    const state = () => options.getState() || {};
    const snippets = () => Array.isArray(state().snippets) ? state().snippets : [];
    const findSnippet = id => snippets().find(item => item.id === id);
    const sameFields = (left, right, fields) => fields.every(key => left?.[key] === right?.[key]);
    function hasDrafts() {
      for (const [url, draft] of composerDrafts) if (!sameFields(draft, composerBaselines.get(url), composerFields)) return true;
      for (const [id, draft] of snippetDrafts) if (!sameFields(draft, snippetBaselines.get(id), snippetFields)) return true;
      return false;
    }
    function draftSnapshot(key, draft) {
      const fields = key.startsWith('composer:') ? composerFields : snippetFields;
      return Object.fromEntries(fields.map(field => [field, draft[field]]));
    }
    async function clearRecovery(key, expected, message = 'Draft recovery could not be cleared. Please try again.') {
      if (!expected) return true;
      try {
        await options.deleteToolDraft?.('basket', key, expected);
        if (JSON.stringify(recoverySnapshots.get(key)) === JSON.stringify(expected)) recoverySnapshots.delete(key);
        return true;
      } catch { notify(message, true); return false; }
    }
    function persistDraft(key, draft, baseline) {
      touchedDraftKeys.add(key);
      const snapshot = draftSnapshot(key, draft);
      const fields = key.startsWith('composer:') ? composerFields : snippetFields;
      if (sameFields(snapshot, baseline, fields)) {
        const previous = recoverySnapshots.get(key);
        if (previous) void clearRecovery(key, previous);
        return;
      }
      recoverySnapshots.set(key, snapshot);
      const failed = () => notify('Draft recovery unavailable. Save your basket edits before closing.', true);
      try { Promise.resolve(options.saveToolDraft?.('basket', key, snapshot)).catch(failed); }
      catch { failed(); }
    }
    function persistComposer(url) { persistDraft('composer:' + url, composerDrafts.get(url), composerBaselines.get(url)); }
    function persistSnippet(id) { persistDraft('snippet:' + id, snippetDrafts.get(id), snippetBaselines.get(id)); updateExportNotice(); }
    function updateExportNotice(){if(exportNotice)exportNotice.hidden=!snippets().some(item=>snippetDrafts.has(item.id)&&!sameFields(snippetDrafts.get(item.id),item,snippetFields));}
    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function button(text, action, id, primary = false) {
      const element = node('button', `button compact${primary ? ' primary' : ''}`, text);
      element.type = 'button';
      element.dataset.basketAction = action;
      if (id !== undefined) element.dataset.snippetId = id;
      element.disabled = busy;
      return element;
    }
    function field(labelText, input, key) {
      const label = node('label', 'basket-field');
      input.dataset.basketFocus = key;
      label.append(node('span', 'basket-label', labelText), input);
      return label;
    }
    function notify(message, error = false) { options.notify?.(message, error); }
    function activeFocus() {
      const active = document.activeElement;
      return root.contains(active) && active.dataset.basketFocus
        ? {key: active.dataset.basketFocus, start: active.selectionStart, end: active.selectionEnd}
        : null;
    }
    function restoreFocus(focus) {
      if (!focus) return;
      const target = [...root.querySelectorAll('[data-basket-focus]')].find(element => element.dataset.basketFocus === focus.key);
      if (!target) return;
      target.focus({preventScroll: true});
      if (typeof focus.start === 'number' && typeof target.setSelectionRange === 'function') {
        try { target.setSelectionRange(focus.start, focus.end); } catch { /* Number fields have no selection range. */ }
      }
    }

    function currentCode() {
      const code = options.getPageData()?.code;
      if (!code || typeof code.text !== 'string' || typeof code.path !== 'string') return null;
      const parsed = G.parseContext(code.url);
      if (!parsed || parsed.type !== 'code' || !new URL(parsed.url).pathname.includes('/blob/')) return null;
      const current = options.getContext?.();
      if (current?.url) {
        const context = G.parseContext(current.url);
        if (!context || new URL(context.url).pathname !== new URL(parsed.url).pathname) return null;
      }
      // A bounded page snapshot may end halfway through a source line. Never
      // label that partial fragment as the complete line in a saved citation.
      const text = code.truncated ? code.text.slice(0, Math.max(0, code.text.lastIndexOf('\n'))) : code.text;
      return {...code, text, url: parsed.url.split('#')[0]};
    }
    function composerDraft(code) {
      if (!composerBaselines.has(code.url)) {
        const length = code.text.split('\n').length;
        const start = Number(code.selection?.start ?? 1);
        const end = Number(code.selection?.end ?? Math.min(12, length));
        composerBaselines.set(code.url, {start: String(start), end: String(end), title: '', note: ''});
      }
      if (!composerDrafts.has(code.url)) composerDrafts.set(code.url, {...composerBaselines.get(code.url)});
      return composerDrafts.get(code.url);
    }
    function selectedSnippet(code, draft) {
      const lines = code.text.split('\n');
      const start = Number(draft.start), end = Number(draft.end);
      if (!/^\d+$/.test(draft.start) || !/^\d+$/.test(draft.end) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > lines.length) throw new Error(code.selectionError&&start===code.selection?.start&&end===code.selection?.end?code.selectionError:`Selected lines are not fully available in this loaded snapshot. Choose a line range from 1 to ${lines.length.toLocaleString()}.`);
      const selected = lines.slice(start - 1, end).join('\n');
      if (!selected.length) throw new Error('This range is empty. Choose lines containing code.');
      if (selected.length > MAX_CODE) throw new Error('Choose fewer lines. Each excerpt can contain up to 20,000 characters.');
      const revision = new URL(code.url).pathname.match(/^\/[^/]+\/[^/]+\/blob\/([a-f0-9]{40})\//i)?.[1]?.toLowerCase() || null;
      return {url: code.url, title: plain(draft.title).slice(0, MAX_TITLE), path: code.path, language: code.language || '', lineStart: start, lineEnd: end, code: selected, note: draft.note, revision};
    }

    function renderComposer() {
      composer.replaceChildren();
      const code = currentCode();
      composer.append(node('h3', 'basket-heading', 'Capture an excerpt'));
      if (!code) {
        composer.append(node('p', 'basket-description', 'Open a code file on GitHub to choose lines and add an excerpt. Your saved excerpts stay available below.'));
        return;
      }
      if (!code.text.length) {
        composer.append(node('p', 'basket-description', code.truncated ? 'This loaded source ends before its first complete line. No excerpt can be captured from this partial text.' : 'This file has no code to capture. Your saved excerpts remain available below.'));
        return;
      }
      const draft = composerDraft(code);
      const totalLines = code.text.split('\n').length;
      composer.append(node('p', 'basket-path', code.path));
      const bytes = Number.isFinite(code.bytes) ? `${code.bytes.toLocaleString()} bytes` : null;
      composer.append(node('p', 'basket-meta', `${totalLines.toLocaleString()} loaded lines${bytes ? ' · ' + bytes : ''}`));
      if (code.truncated) composer.append(node('p', 'basket-warning', 'Only part of this file is available. Excerpts use the loaded text shown here.'));
      const fields = node('div', 'basket-range');
      for (const [name, label] of [['start', 'From line'], ['end', 'To line']]) {
        const input = node('input', 'basket-input');
        input.type = 'number'; input.min = '1'; input.max = String(totalLines); input.step = '1'; input.value = draft[name];
        input.dataset.basketField = name;
        fields.append(field(label, input, `composer:${code.url}:${name}`));
        input.addEventListener('input', () => { draft[name] = input.value; persistComposer(code.url); updatePreview(); });
      }
      const useSelection = button('Use GitHub selection', 'use-selection');
      fields.append(useSelection);
      const titleInput = node('input', 'basket-input');
      titleInput.type = 'text'; titleInput.maxLength = MAX_TITLE; titleInput.placeholder = 'A short label for this excerpt'; titleInput.value = draft.title; titleInput.dataset.basketField = 'title';
      titleInput.addEventListener('input', () => { draft.title = titleInput.value; persistComposer(code.url); updatePreview(); });
      const preview = node('pre', 'basket-preview'); preview.tabIndex = 0; preview.setAttribute('aria-label', 'Code excerpt preview'); preview.dataset.basketPreview = '';
      const rangeStatus = node('p', 'basket-meta'); rangeStatus.dataset.basketRangeStatus = ''; rangeStatus.setAttribute('role', 'status');
      const note = node('textarea', 'basket-note'); note.rows = 2; note.maxLength = MAX_NOTE; note.placeholder = 'Why is this code useful?'; note.value = draft.note; note.dataset.basketField = 'note';
      note.addEventListener('input', () => { draft.note = note.value; persistComposer(code.url); updatePreview(); });
      const actions = node('div', 'basket-actions');
      const save = button('Save excerpt', 'save-excerpt', undefined, true), copy = button('Copy Markdown', 'copy-excerpt');
      const discard = button('Discard draft', 'discard-composer');
      actions.append(save, copy, discard);
      composer.append(fields, field('Title (optional)', titleInput, `composer:${code.url}:title`), preview, rangeStatus, field('Private note (optional)', note, `composer:${code.url}:note`), actions);
      function updatePreview() {
        discard.disabled = busy || sameFields(draft, composerBaselines.get(code.url), composerFields);
        try {
          const selected = selectedSnippet(code, draft);
          preview.textContent = selected.code;
          rangeStatus.textContent = `${(selected.lineEnd - selected.lineStart + 1).toLocaleString()} lines · ${selected.code.length.toLocaleString()} characters · ${provenance(selected)}`;
          rangeStatus.classList.remove('basket-error'); save.disabled = busy; copy.disabled = busy;
        } catch (error) {
          preview.textContent = 'Choose a valid range to preview the code.';
          rangeStatus.textContent = error.message; rangeStatus.classList.add('basket-error'); save.disabled = true; copy.disabled = true;
        }
      }
      updatePreview();
    }

    function renderList() {
      const focus = activeFocus();
      list.replaceChildren();
      const all = snippets();
      const files = new Set(all.map(item => `${G.parseContext(item.url)?.repo}/${item.path}`));
      listCount.textContent = `${all.length} ${all.length === 1 ? 'excerpt' : 'excerpts'} · ${files.size} ${files.size === 1 ? 'file' : 'files'}`;
      const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const filtered = all.filter(item => words.every(word => [item.title, item.path, item.note, item.code, item.url].join(' ').toLocaleLowerCase().includes(word)));
      if (!filtered.length) {
        list.append(node('p', 'basket-empty', all.length ? 'No excerpts match this search.' : 'Collect code from several files, add your context, and export it together.'));
      }
      for (const item of filtered) {
        const article = node('article', 'basket-item'); article.dataset.basketSnippet = item.id;
        const heading = node('div', 'basket-item-heading');
        const title = node('h4', 'basket-item-title', item.title || item.path);
        heading.append(title);
        article.append(heading);
        const link = node('a', 'basket-source-link', `${item.path} · ${item.lineStart === item.lineEnd ? 'L' + item.lineStart : 'L' + item.lineStart + '–L' + item.lineEnd}`);
        try { link.href = sourceURL(item).href; } catch { /* Invalid data remains inert. */ }
        link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link);
        try { article.append(node('p', 'basket-meta', provenance(item))); } catch { /* Backend validates saved records. */ }
        const details = node('details', 'basket-code-details'); details.open = expanded.has(item.id);
        details.append(node('summary', '', 'Preview code'));
        const preview = node('pre', 'basket-preview', item.code); preview.tabIndex = 0; preview.setAttribute('aria-label', `Code from ${item.path}`); details.append(preview);
        details.addEventListener('toggle', () => { if (details.open) expanded.add(item.id); else expanded.delete(item.id); });
        article.append(details);
        if (editors.has(item.id)) {
          const draft = snippetDrafts.get(item.id) || {title: item.title || '', note: item.note || ''};
          if (!snippetBaselines.has(item.id)) snippetBaselines.set(item.id, {title: item.title || '', note: item.note || ''});
          snippetDrafts.set(item.id, draft);
          const titleInput = node('input', 'basket-input'); titleInput.type = 'text'; titleInput.maxLength = MAX_TITLE; titleInput.value = draft.title; titleInput.dataset.basketEdit = 'title';
          titleInput.addEventListener('input', () => { draft.title = titleInput.value; persistSnippet(item.id); });
          const note = node('textarea', 'basket-note'); note.rows = 3; note.maxLength = MAX_NOTE; note.value = draft.note; note.dataset.basketEdit = 'note';
          note.addEventListener('input', () => { draft.note = note.value; persistSnippet(item.id); });
          const editActions = node('div', 'basket-actions'); editActions.append(button('Save note', 'save-snippet', item.id, true), button('Cancel edits', 'cancel-edit', item.id));
          article.append(field('Excerpt title', titleInput, `snippet:${item.id}:title`), field('Private note', note, `snippet:${item.id}:note`), editActions);
        } else if (item.note) article.append(node('p', 'basket-saved-note', item.note));
        const actions = node('div', 'basket-actions basket-item-actions');
        if (!editors.has(item.id)) actions.append(button('Edit note', 'edit-snippet', item.id));
        actions.append(button('Copy excerpt', 'copy-snippet', item.id), button('Remove', 'remove-snippet', item.id));
        article.append(actions); list.append(article);
      }
      restoreFocus(focus);
    }

    function renderUndo() {
      undoArea.replaceChildren();
      if (undoItem) undoArea.append(node('span', '', 'Excerpt removed.'), button('Undo', 'undo-remove'));
    }
    function render() {
      const focus = activeFocus();
      root.replaceChildren();
      const header = node('header', 'basket-header');
      header.append(node('h2', 'basket-title', 'Code basket'), node('p', 'basket-description', 'Keep useful code from different files, with the source and your notes.'));
      composer = node('section', 'basket-composer'); composer.dataset.basketComposer = '';
      const savedSection = node('section', 'basket-saved');
      const heading = node('div', 'basket-section-heading');
      heading.append(node('h3', 'basket-heading', 'Saved excerpts'));
      listCount = node('span', 'basket-meta'); heading.append(listCount);
      const exportActions = node('div', 'basket-actions');
      const copy = button('Copy basket', 'copy-basket'), download = button('Download .md', 'download-basket');
      copy.disabled = download.disabled = busy || !snippets().length;
      exportActions.append(copy, download);
      exportNotice=node('p','basket-meta','Export uses saved notes and titles. Save your edits to include them.');exportNotice.dataset.basketExportNotice='';updateExportNotice();
      search = node('input', 'basket-input basket-search'); search.type = 'search'; search.placeholder = 'Search paths, code, or notes…'; search.value = query; search.setAttribute('aria-label', 'Search code basket'); search.dataset.basketFocus = 'search';
      search.addEventListener('input', () => { query = search.value; renderList(); });
      list = node('div', 'basket-list');
      undoArea = node('div', 'basket-undo'); undoArea.setAttribute('role', 'status');
      savedSection.append(heading, exportActions, exportNotice, search, list, undoArea);
      root.append(header, composer, savedSection);
      renderComposer(); renderList(); renderUndo(); restoreFocus(focus);
    }

    async function mutate(message, success, after) {
      if (busy) return;
      busy = true; render();
      try {
        const next = await options.request(message);
        options.onState(next);
        if (await after?.() !== false) notify(success);
      } catch (error) { notify(error.message || 'Could not save this change. Try again.', true); }
      finally { busy = false; render(); }
    }
    async function copyMarkdown(text, label) {
      try { await options.copy(text); notify(`${label} copied`); }
      catch { notify('Clipboard unavailable. Try the Chrome toolbar popup.', true); }
    }
    function downloadMarkdown() {
      const text = basketMarkdown(snippets());
      const url = view.URL.createObjectURL(new view.Blob([text], {type: 'text/markdown;charset=utf-8'}));
      const link = node('a'); link.href = url; link.download = `github-code-basket-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.append(link); link.click(); link.remove();
      view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
      notify('Markdown download started. It includes saved code and notes.');
    }

    root.addEventListener('click', async event => {
      const control = event.target.closest('[data-basket-action]');
      if (!control || !root.contains(control) || control.disabled) return;
      const action = control.dataset.basketAction, id = control.dataset.snippetId;
      try {
        if (action === 'use-selection') {
          const code = currentCode(); if (!code) return;
          const draft = composerDraft(code), lines = code.text.split('\n').length;
          draft.start = String(code.selection?.start ?? 1);
          draft.end = String(code.selection?.end ?? Math.min(12, lines));
          persistComposer(code.url);
          render();
        } else if (action === 'discard-composer') {
          const code = currentCode(); if (!code) return;
          const key = 'composer:' + code.url, expected = draftSnapshot(key, composerDraft(code));
          touchedDraftKeys.add(key);
          composerDrafts.set(code.url, {...composerBaselines.get(code.url)}); render();
          if (await clearRecovery(key, expected)) notify('Composer draft discarded');
        } else if (action === 'save-excerpt' || action === 'copy-excerpt') {
          const code = currentCode(); if (!code) return;
          const snippet = selectedSnippet(code, composerDraft(code));
          if (action === 'save-excerpt') {
            const submitted = {...composerDraft(code)};
            const key = 'composer:' + code.url;
            touchedDraftKeys.add(key);
            await mutate({type: 'SAVE_SNIPPET', snippet}, 'Excerpt saved to your code basket', async () => {
              composerBaselines.set(code.url, submitted);
              return clearRecovery(key, submitted, 'Excerpt saved, but its recovery draft could not be cleared.');
            });
          }
          else await copyMarkdown(snippetMarkdown(snippet), 'Excerpt Markdown');
        } else if (action === 'edit-snippet') {
          editors.add(id); render();
          [...root.querySelectorAll('[data-basket-focus]')].find(element => element.dataset.basketFocus === `snippet:${id}:note`)?.focus();
        } else if (action === 'cancel-edit') {
          const key = 'snippet:' + id, expected = snippetDrafts.get(id) && draftSnapshot(key, snippetDrafts.get(id));
          touchedDraftKeys.add(key); snippetDrafts.delete(id); snippetBaselines.delete(id); editors.delete(id); render();
          await clearRecovery(key, expected);
        }
        else if (action === 'save-snippet') {
          const draft = snippetDrafts.get(id); if (!draft || !findSnippet(id)) return;
          const patch = {title: plain(draft.title).slice(0, MAX_TITLE), note: draft.note};
          const submitted = {...draft};
          const key = 'snippet:' + id;
          touchedDraftKeys.add(key);
          await mutate({type: 'UPDATE_SNIPPET', id, patch}, 'Excerpt note saved', async () => {
            const current = snippetDrafts.get(id);
            if (current?.title === submitted.title && current?.note === submitted.note) { snippetDrafts.delete(id); snippetBaselines.delete(id); editors.delete(id); }
            else snippetBaselines.set(id, submitted);
            return clearRecovery(key, submitted, 'Excerpt note saved, but its recovery draft could not be cleared.');
          });
        } else if (action === 'remove-snippet') {
          const snippet = findSnippet(id); if (!snippet) return;
          await mutate({type: 'REMOVE_SNIPPET', id}, 'Excerpt removed', () => { undoItem = snippet; });
        } else if (action === 'undo-remove' && undoItem) {
          const snippet = undoItem;
          await mutate({type: 'RESTORE_SNIPPET', snippet}, 'Excerpt restored', () => { if (undoItem === snippet) undoItem = null; });
        } else if (action === 'copy-snippet') {
          const snippet = findSnippet(id); if (snippet) await copyMarkdown(snippetMarkdown(snippet), 'Excerpt Markdown');
        } else if (action === 'copy-basket') await copyMarkdown(basketMarkdown(snippets()), 'Code basket');
        else if (action === 'download-basket') downloadMarkdown();
      } catch (error) { notify(error.message || 'This action could not be completed.', true); }
    });
    render();
    const ready = Promise.resolve().then(() => options.loadToolDrafts?.('basket') || []).then(recovered => {
      if (!Array.isArray(recovered)) return;
      for (const entry of recovered.slice(0, 200)) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, value] = entry;
        if (typeof key !== 'string' || touchedDraftKeys.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
        if (typeof value.title !== 'string' || value.title.length > MAX_TITLE || typeof value.note !== 'string' || value.note.length > MAX_NOTE) continue;
        if (key.startsWith('composer:')) {
          const url = key.slice(9), context = G.parseContext(url);
          if (!context || context.type !== 'code' || !new URL(context.url).pathname.includes('/blob/') || !['start', 'end'].every(field => typeof value[field] === 'string' && /^[+-]?\d{0,10}$/.test(value[field]))) continue;
          const snapshot = draftSnapshot(key, value);
          composerDrafts.set(url, snapshot); recoverySnapshots.set(key, {...snapshot});
        } else if (key.startsWith('snippet:') && /^[a-zA-Z0-9_-]{1,100}$/.test(key.slice(8))) {
          const id = key.slice(8), snapshot = draftSnapshot(key, value);
          snippetDrafts.set(id, snapshot); recoverySnapshots.set(key, {...snapshot}); editors.add(id);
        }
      }
      render();
    }).catch(() => notify('Basket draft recovery unavailable. Saved excerpts are still available.', true));
    return {render, hasDrafts, ready, reveal(id){if(!findSnippet(id))return false;query='';search.value='';expanded.add(id);render();const card=[...list.querySelectorAll('[data-basket-snippet]')].find(node=>node.dataset.basketSnippet===id);if(card){card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView?.({block:'nearest'});}return Boolean(card);}};
  }

  Object.assign(G, {mountBasket, snippetMarkdown, basketMarkdown});
})();
