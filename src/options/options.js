(() => {
  'use strict';
  const GHE = globalThis.GHE;

  GHE.createOptions = function createOptions(document) {
    const form = document.querySelector('#settings-form');
    const controls = [...form.querySelectorAll('[name]')];
    const saveStatus = document.querySelector('#save-status');
    const backupStatus = document.querySelector('#backup-status');
    const retry = document.querySelector('#retry-load');
    const exportButton = document.querySelector('#export-button');
    const importButton = document.querySelector('#import-button');
    const fileInput = document.querySelector('#import-file');
    let state;
    let busy = false;

    function status(target, message, error = false) {
      target.textContent = message;
      target.dataset.error = String(error);
    }

    function setBusy(value) {
      busy = value;
      for (const control of controls) control.disabled = value || !state;
      exportButton.disabled = value || !state;
      importButton.disabled = value || !state;
    }

    function render(next) {
      state = next;
      for (const control of controls) {
        if (control.type === 'checkbox') control.checked = state.settings[control.name];
        else control.value = state.settings[control.name];
      }
      document.documentElement.dataset.theme = state.settings.theme;
      const sample = GHE.formatDate(Date.now() - 2 * 86400000, state.settings);
      document.querySelector('#date-preview').textContent = state.settings.exactDates ? `(${sample})` : '';
      const count = state.items.length;
      document.querySelector('#workspace-count').textContent = `${count} saved ${count === 1 ? 'page' : 'pages'} · ${(state.snippets || []).length} snippets · ${(state.workspaces || []).length} workspaces · ${(state.reviews || []).length} reviews · ${(state.templates || []).length} templates`;
    }

    async function load() {
      if (busy) return;
      setBusy(true);
      retry.hidden = true;
      status(saveStatus, 'Loading your settings…');
      try {
        render(await GHE.request({ type: 'GET_STATE' }));
        status(saveStatus, 'Changes save automatically.');
      } catch (error) {
        status(saveStatus, error.message || 'Could not load settings. Try again.', true);
        retry.hidden = false;
      } finally {
        setBusy(false);
      }
    }

    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('change', async event => {
      const control = event.target;
      if (!controls.includes(control) || !state || busy) return;
      const value = control.type === 'checkbox' ? control.checked : control.value;
      setBusy(true);
      status(saveStatus, 'Saving…');
      try {
        render(await GHE.request({ type: 'SET_SETTINGS', patch: { [control.name]: value } }));
        status(saveStatus, 'Settings saved.');
      } catch (error) {
        render(state);
        status(saveStatus, error.message || 'Could not save. Your previous setting has been restored.', true);
      } finally {
        setBusy(false);
      }
    });

    retry.addEventListener('click', load);
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file || busy) return;
      setBusy(true);
      status(backupStatus, 'Importing backup…');
      try {
        if (file.size > GHE.LIMITS.importBytes) throw new Error(`Choose a JSON backup no larger than ${GHE.LIMITS.importBytes / (1024 * 1024)} MB.`);
        const text = await new Promise((resolve, reject) => {
          const reader = new document.defaultView.FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read this file. Choose it again.'));
          reader.readAsText(file);
        });
        render(await GHE.request({ type: 'IMPORT_ITEMS', text }));
        status(backupStatus, 'Backup imported. Saved items were merged and newer local edits kept.');
      } catch (error) {
        status(backupStatus, error.message || 'Could not import this backup. Your workspace is unchanged.', true);
      } finally {
        fileInput.value = '';
        setBusy(false);
      }
    });

    exportButton.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true);
      status(backupStatus, 'Preparing backup…');
      try {
        const latest = await GHE.request({ type: 'GET_STATE' });
        const payload = GHE.exportBackup(latest);
        const view = document.defaultView;
        const url = view.URL.createObjectURL(new view.Blob([payload], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `github-enhancer-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
        render(latest);
        status(backupStatus, 'Backup download started. The file includes your private notes.');
      } catch (error) {
        status(backupStatus, error.message || 'Could not export your backup. Try again.', true);
      } finally {
        setBusy(false);
      }
    });

    return { ready: load() };
  };

  if (globalThis.chrome?.runtime && document.querySelector('#settings-form')) GHE.createOptions(document);
})();
