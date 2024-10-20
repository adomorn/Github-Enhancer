// Default settings
const defaultSettings = {
  enhanceContributors: true,
  showCommitInfo: true,
  showTeamInfo: true,
  showOrgInfo: true,
  cardWidth: 250,
  maxCards: 10,
  locale: 'en-US'
};

// Load settings from storage
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaultSettings, (items) => {
      resolve(items);
    });
  });
}

// Save settings to storage
function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve();
    });
  });
}

function createSettingsUI() {
  const settingsContainer = document.createElement('div');
  settingsContainer.id = 'github-extension-settings';

  settingsContainer.innerHTML = `
    <h2>GitHub Extension Settings</h2>
    <label>
      <input type="checkbox" id="enhanceContributors"> Enhance Contributors
    </label><br>
    <label>
      <input type="checkbox" id="showCommitInfo"> Show Commit Info
    </label><br>
    <label>
      <input type="checkbox" id="showTeamInfo"> Show Team Info
    </label><br>
    <label>
      <input type="checkbox" id="showOrgInfo"> Show Organization Info
    </label><br>
    <label>
      Card Width: <input type="number" id="cardWidth" min="200" max="400">px
    </label><br>
    <label>
      Max Cards: <input type="number" id="maxCards" min="5" max="50">
    </label><br>
    <label>
      Locale: <input type="text" id="locale" placeholder="e.g., en-US, tr-TR">
    </label><br>
    <button id="saveSettings">Save Settings</button>
    <button id="closeSettings">Close</button>
  `;

  document.body.appendChild(settingsContainer);

  // Load and set current settings
  loadSettings().then((settings) => {
    Object.keys(settings).forEach((key) => {
      const element = document.getElementById(key);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = settings[key];
        } else if (element.type === 'number' || element.type === 'text') {
          element.value = settings[key];
        }
      }
    });
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', () => {
    const newSettings = {};
    Object.keys(defaultSettings).forEach((key) => {
      const element = document.getElementById(key);
      if (element) {
        if (element.type === 'checkbox') {
          newSettings[key] = element.checked;
        } else if (element.type === 'number') {
          newSettings[key] = parseInt(element.value, 10);
        } else if (element.type === 'text') {
          newSettings[key] = element.value;
        }
      }
    });

    saveSettings(newSettings).then(() => {
      alert('Settings saved! Please refresh the page for changes to take effect.');
      settingsContainer.style.display = 'none';
    });
  });

  // Close settings
  document.getElementById('closeSettings').addEventListener('click', () => {
    settingsContainer.style.display = 'none';
  });
}

function toggleSettings() {
  const settingsContainer = document.getElementById('github-extension-settings');
  if (settingsContainer) {
    settingsContainer.style.display = settingsContainer.style.display === 'none' ? 'block' : 'none';
  } else {
    createSettingsUI();
  }
}

function createSettingsButton() {
  const button = document.createElement('button');
  button.textContent = '⚙️';
  button.classList.add('github-extension-settings-button');
  button.addEventListener('click', toggleSettings);
  document.body.appendChild(button);
}

function initSettings() {
  createSettingsButton();
}

window.GithubExtensionSettings = {
  loadSettings,
  saveSettings,
  initSettings
};