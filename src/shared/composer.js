/* Private Markdown preparation. No page filling or GitHub submission. */
(() => {
  'use strict';
  const G = globalThis.GHE = globalThis.GHE || {};
  const MAX_BODY = 10000, MAX_TITLE = 100, MAX_TEMPLATES = 40;
  const starters = [
    {id: 'review-feedback', title: 'Review feedback', body: '## Observation\n\nWhat did you notice?\n\n## Why it matters\n\nDescribe the behavior or risk.\n\n## Suggested change\n\nExplain a concrete next step.\n\n## Verification\n\nHow could we check the result?'},
    {id: 'bug-reproduction', title: 'Bug reproduction', body: '## What happened\n\nDescribe the unexpected behavior.\n\n## Steps to reproduce\n\n1. \n2. \n3. \n\n## Expected behavior\n\nWhat should happen instead?\n\n## Environment\n\nInclude the relevant version and setup.'}
  ];

  function composerContextKey(context) {
    const parsed = G.parseContext(context?.url);
    if (!parsed || !['issue', 'pull', 'discussion', 'commit'].includes(parsed.type)) return 'global';
    const url = new URL(parsed.url);
    url.hash = '';
    if (parsed.type === 'pull') url.pathname = url.pathname.split('/').slice(0, 5).join('/');
    return url.href;
  }

  function mountComposer(root, options) {
    const document = root.ownerDocument;
    const drafts = new Map(), touched = new Set(), recoveredSnapshots = new Map();
    const templateEdits = new Map(), templateBaselines = new Map();
    let selected = '', editing = null, newTitle = '', busy = false, undo = null, previewOpen = false;
    root.classList.add('write-composer');
    const templates = () => options.getState()?.templates || [];
    const currentKey = () => composerContextKey(options.getContext?.());
    const bodyFor = key => drafts.get(key) || '';
    const savedTemplate = id => templates().find(template => template.id === id);
    const selectedTemplate = () => selected.startsWith('builtin:') ? starters.find(template => template.id === selected.slice(8)) : selected.startsWith('saved:') ? savedTemplate(selected.slice(6)) : null;
    const notify = (message, error = false) => options.notify?.(message, error);

    function element(tag, cls, text) {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(label, action, primary = false) {
      const node = element('button', `button compact${primary ? ' primary' : ''}`, label);
      node.type = 'button'; node.dataset.composerAction = action; node.disabled = busy;
      return node;
    }
    function field(label, input, focus) {
      const node = element('label', 'composer-field');
      input.setAttribute('aria-label', label); input.dataset.composerFocus = focus;
      node.append(element('span', 'composer-label', label), input);
      return node;
    }
    function focusState() {
      const active = document.activeElement;
      return root.contains(active) && active.dataset.composerFocus ? {key: active.dataset.composerFocus, start: active.selectionStart, end: active.selectionEnd} : null;
    }
    function restoreFocus(focus) {
      if (!focus) return;
      const node = [...root.querySelectorAll('[data-composer-focus]')].find(input => input.dataset.composerFocus === focus.key);
      if (!node) return;
      node.focus({preventScroll: true});
      if (typeof focus.start === 'number' && node.setSelectionRange) node.setSelectionRange(focus.start, focus.end);
    }
    async function clearRecovery(key, snapshot) {
      if (!snapshot) return true;
      try {
        await options.deleteToolDraft?.('composer', key, snapshot);
        if (JSON.stringify(recoveredSnapshots.get(key)) === JSON.stringify(snapshot)) recoveredSnapshots.delete(key);
        return true;
      } catch { notify('The draft was cleared here, but its recovery copy could not be removed. Try again before closing.', true); return false; }
    }
    function persistMetadata(key, snapshot) {
      touched.add(key); recoveredSnapshots.set(key, {...snapshot});
      const failed = () => notify('Draft recovery unavailable. Save your template changes before closing.', true);
      try { Promise.resolve(options.saveToolDraft?.('composer', key, snapshot)).catch(failed); }
      catch { failed(); }
    }
    function editBody(key, body) {
      touched.add(key); drafts.set(key, body);
      if (!body) {
        const previous = recoveredSnapshots.get(key);
        if (previous) void clearRecovery(key, previous);
        return;
      }
      const snapshot = {body}; recoveredSnapshots.set(key, snapshot);
      const failed = () => notify('Draft recovery unavailable. Copy your draft before closing.', true);
      try { Promise.resolve(options.saveToolDraft?.('composer', key, snapshot)).catch(failed); }
      catch { failed(); }
    }
    function hasDrafts() {
      if (newTitle.trim() || [...drafts.values()].some(body => body.length > 0)) return true;
      for (const [id, draft] of templateEdits) {
        const original = templateBaselines.get(id);
        if (savedTemplate(id) && (draft.title !== original?.title || draft.body !== original?.body)) return true;
      }
      return false;
    }
    async function mutate(message, success, after) {
      if (busy) return;
      busy = true; render();
      try { const next = await options.request(message); options.onState(next); if (await after?.(next) !== false) notify(success); }
      catch (error) { notify(error.message || 'Could not save your template. Try again.', true); }
      finally { busy = false; render(); }
    }

    function render() {
      const focus = focusState(), key = currentKey(), context = options.getContext?.();
      const body = bodyFor(key), choice = selectedTemplate();
      root.replaceChildren(); root.setAttribute('aria-busy', String(busy));
      const heading = element('header', 'composer-header');
      heading.append(element('h2', 'composer-title', 'Write'), element('p', 'composer-description', 'Prepare a clear comment in Markdown. Copy it when you are ready.'));
      root.append(heading);

      const contextPanel = element('section', 'composer-context');
      contextPanel.append(element('span', 'composer-label', key === 'global' ? 'General draft' : 'Draft for this thread'));
      if (key === 'global') contextPanel.append(element('p', 'composer-description', 'Open an issue, pull request, discussion, or commit for a separate thread draft.'));
      else {
        const link = element('a', 'composer-context-link', context?.title || context?.repo || 'Current thread');
        link.href = key; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dataset.composerContextLink = '';
        contextPanel.append(link, element('p', 'composer-meta', context?.repo || new URL(key).pathname.split('/').slice(1, 3).join('/')));
      }
      root.append(contextPanel);

      const editorSection = element('section', 'composer-editor');
      const bodyInput = element('textarea', 'composer-body'); bodyInput.rows = 10; bodyInput.maxLength = MAX_BODY; bodyInput.value = body; bodyInput.placeholder = 'Write your comment, review feedback, or investigation notes…';
      editorSection.append(field('Markdown draft', bodyInput, 'draft:' + key));
      const counter = element('p', 'composer-meta'); counter.setAttribute('aria-live', 'off');
      const actions = element('div', 'composer-actions');
      const copy = button('Copy Markdown', 'copy', true), discard = button('Discard draft', 'discard'); actions.append(copy, discard);
      editorSection.append(counter, actions, element('p', 'composer-private', 'Private in this browser. Nothing is posted or inserted into GitHub.'));
      const preview = element('details', 'composer-preview'); preview.open = previewOpen;
      preview.append(element('summary', '', 'Preview Markdown source'));
      const previewText = element('pre', 'composer-source'); previewText.dataset.composerPreview = ''; previewText.tabIndex = 0; previewText.setAttribute('aria-label', 'Markdown source preview'); preview.append(previewText);
      preview.addEventListener('toggle', () => { if (preview.isConnected) previewOpen = preview.open; });
      editorSection.append(preview); root.append(editorSection);

      const library = element('section', 'composer-library');
      const libraryHeading = element('div', 'composer-section-heading');
      libraryHeading.append(element('h3', '', 'Reusable templates'), element('span', 'composer-meta', `${templates().length} / ${MAX_TEMPLATES} saved`));
      library.append(libraryHeading, element('p', 'composer-description', 'Choose a starting point, preview it, then use it explicitly.'));
      const picker = element('select', 'composer-input'); picker.setAttribute('aria-label', 'Choose a template'); picker.dataset.composerFocus = 'template-picker';
      const empty = element('option', '', 'Choose a template…'); empty.value = ''; picker.append(empty);
      const builtins = element('optgroup'); builtins.label = 'Starter templates';
      for (const template of starters) { const option = element('option', '', template.title); option.value = 'builtin:' + template.id; builtins.append(option); }
      picker.append(builtins);
      if (templates().length) {
        const own = element('optgroup'); own.label = 'Your templates';
        for (const template of templates()) { const option = element('option', '', template.title); option.value = 'saved:' + template.id; own.append(option); }
        picker.append(own);
      }
      picker.value = choice ? selected : '';
      picker.addEventListener('change', () => { selected = picker.value; const id = selected.startsWith('saved:') ? selected.slice(6) : null; editing = id && templateEdits.has(id) ? id : null; render(); });
      library.append(picker);
      let useTemplate;
      if (choice) {
        const templatePreview = element('pre', 'composer-source composer-template-preview', choice.body); templatePreview.tabIndex = 0; templatePreview.setAttribute('aria-label', 'Selected template preview');
        library.append(templatePreview);
        const templateActions = element('div', 'composer-actions'); useTemplate = button('', 'use-template'); templateActions.append(useTemplate);
        if (selected.startsWith('saved:')) templateActions.append(button('Edit template', 'edit-template'), button('Remove', 'remove-template'));
        library.append(templateActions);
      }
      if (editing && savedTemplate(editing)) {
        const original = savedTemplate(editing);
        if (!templateEdits.has(editing)) templateEdits.set(editing, {title: original.title, body: original.body});
        if (!templateBaselines.has(editing)) templateBaselines.set(editing, {title: original.title, body: original.body});
        const draft = templateEdits.get(editing), editBox = element('section', 'composer-template-editor');
        editBox.append(element('h4', '', 'Edit saved template'));
        const title = element('input', 'composer-input'); title.type = 'text'; title.maxLength = MAX_TITLE; title.value = draft.title;
        const text = element('textarea', 'composer-template-body'); text.rows = 6; text.maxLength = MAX_BODY; text.value = draft.body;
        title.addEventListener('input', () => { draft.title = title.value; persistMetadata('templateedit:' + original.id, draft); }); text.addEventListener('input', () => { draft.body = text.value; persistMetadata('templateedit:' + original.id, draft); });
        const editActions = element('div', 'composer-actions'); editActions.append(button('Save template', 'save-template', true), button('Cancel editing', 'cancel-template'));
        editBox.append(field('Template name', title, 'template-title:' + editing), field('Template body', text, 'template-body:' + editing), editActions); library.append(editBox);
      }
      const creation = element('section', 'composer-create'); creation.append(element('h4', '', 'Save this draft as a template'));
      const name = element('input', 'composer-input'); name.type = 'text'; name.maxLength = MAX_TITLE; name.value = newTitle; name.placeholder = 'e.g. Reproduction request';
      const create = button('Save new template', 'create-template');
      name.addEventListener('input', () => { newTitle = name.value; persistMetadata('newtemplate', {title: newTitle}); updateDraftControls(); });
      creation.append(field('New template name', name, 'new-template-name'), create);
      if (templates().length >= MAX_TEMPLATES) creation.append(element('p', 'composer-meta', 'Your template library is full. Remove an unused template to add another.'));
      library.append(creation);
      if (undo) {
        const undoRow = element('div', 'composer-undo'); undoRow.setAttribute('role', 'status');
        undoRow.append(element('span', '', 'Template removed.'), button('Undo', 'undo-template')); library.append(undoRow);
      }
      root.append(library);

      function updateDraftControls() {
        const value = bodyFor(key);
        counter.textContent = `${value.length.toLocaleString()} / 10,000 characters · draft recovery lasts for this browser session`;
        previewText.textContent = value || 'Your Markdown source will appear here.';
        copy.disabled = busy || !value.trim(); discard.disabled = busy || !value.length;
        if (useTemplate) useTemplate.textContent = value.length ? 'Replace draft with template' : 'Use template';
        create.disabled = busy || !value.trim() || !newTitle.trim() || templates().length >= MAX_TEMPLATES;
      }
      bodyInput.addEventListener('input', () => { editBody(key, bodyInput.value); updateDraftControls(); });
      updateDraftControls(); restoreFocus(focus);
    }

    root.addEventListener('click', async event => {
      const control = event.target.closest('[data-composer-action]');
      if (!control || !root.contains(control) || control.disabled) return;
      const action = control.dataset.composerAction, key = currentKey();
      if (action === 'copy') {
        const body = bodyFor(key); if (!body.trim()) return;
        try { await options.copy(body); notify('Markdown copied. Paste it into GitHub when you are ready.'); }
        catch { notify('Clipboard unavailable. Select your draft and copy it manually.', true); }
      } else if (action === 'discard') {
        const snapshot = {body: bodyFor(key)}; touched.add(key); drafts.set(key, ''); render();
        if (await clearRecovery(key, snapshot)) notify('Draft discarded');
      } else if (action === 'use-template') {
        const template = selectedTemplate(); if (!template) return;
        editBody(key, template.body); render();
        const input = root.querySelector('[aria-label="Markdown draft"]'); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
      } else if (action === 'create-template') {
        const submittedTitle = newTitle, title = newTitle.trim(), body = bodyFor(key); touched.add('newtemplate');
        if (!title || !body.trim()) { notify('Add a name and draft text before saving a template.', true); return; }
        const previous = new Set(templates().map(template => template.id));
        await mutate({type: 'CREATE_TEMPLATE', title, body}, 'Template saved', async next => {
          if (newTitle === submittedTitle) newTitle = '';
          const created = next.templates.find(template => !previous.has(template.id));
          if (created) selected = 'saved:' + created.id;
          return clearRecovery('newtemplate', {title: submittedTitle});
        });
      } else if (action === 'edit-template') {
        const template = selectedTemplate(); if (!template || !selected.startsWith('saved:')) return;
        editing = template.id; render(); root.querySelector('[aria-label="Template body"]')?.focus();
      } else if (action === 'cancel-template') {
        const id = editing, snapshot = templateEdits.get(id); touched.add('templateedit:' + id);
        templateEdits.delete(id); templateBaselines.delete(id); editing = null; render();
        await clearRecovery('templateedit:' + id, snapshot);
      } else if (action === 'save-template' && editing) {
        const id = editing, submitted = {...templateEdits.get(id)}, patch = {title: submitted.title.trim(), body: submitted.body}; touched.add('templateedit:' + id);
        if (!patch.title || !patch.body.trim()) { notify('A template needs both a name and body.', true); return; }
        await mutate({type: 'UPDATE_TEMPLATE', id, patch}, 'Template updated', async () => {
          const current = templateEdits.get(id);
          if (current?.title === submitted.title && current?.body === submitted.body) { templateEdits.delete(id); templateBaselines.delete(id); if (editing === id) editing = null; }
          else templateBaselines.set(id, submitted);
          return clearRecovery('templateedit:' + id, submitted);
        });
      } else if (action === 'remove-template') {
        const template = selectedTemplate(); if (!template || !selected.startsWith('saved:')) return;
        await mutate({type: 'REMOVE_TEMPLATE', id: template.id}, 'Template removed', () => { undo = template; if (selected === 'saved:' + template.id) selected = ''; if (editing === template.id) editing = null; });
      } else if (action === 'undo-template' && undo) {
        const template = undo;
        await mutate({type: 'RESTORE_TEMPLATE', template}, 'Template restored', () => { if (undo === template) undo = null; selected = 'saved:' + template.id; if (templateEdits.has(template.id)) editing = template.id; });
      }
    });
    render();
    const ready = Promise.resolve().then(() => options.loadToolDrafts?.('composer') || []).then(entries => {
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, value] = entry;
        if (typeof key !== 'string' || touched.has(key) || !value || typeof value !== 'object') continue;
        if (key === 'newtemplate') {
          if (typeof value.title === 'string' && value.title.length <= MAX_TITLE) { newTitle = value.title; recoveredSnapshots.set(key, {title: value.title}); }
          continue;
        }
        if (key.startsWith('templateedit:')) {
          const id = key.slice(13), original = savedTemplate(id);
          if (/^[a-zA-Z0-9_-]{1,80}$/.test(id) && typeof value.title === 'string' && value.title.length <= MAX_TITLE && typeof value.body === 'string' && value.body.length <= MAX_BODY) {
            const snapshot = {title: value.title, body: value.body}; templateEdits.set(id, snapshot); if (original) templateBaselines.set(id, {title: original.title, body: original.body}); recoveredSnapshots.set(key, {...snapshot});
          }
          continue;
        }
        if ((key !== 'global' && composerContextKey({url: key}) !== key) || !value || typeof value !== 'object' || typeof value.body !== 'string' || value.body.length > MAX_BODY) continue;
        drafts.set(key, value.body); recoveredSnapshots.set(key, {body: value.body});
      }
      render();
    }).catch(() => notify('Composer draft recovery unavailable. Copy your draft before closing.', true));
    return {render, ready, hasDrafts};
  }
  Object.assign(G, {mountComposer, composerContextKey});
})();
