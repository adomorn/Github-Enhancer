// GitHub Extension Settings Module
const GitHubExtensionSettings = (function() {
  // Private state
  const state = {
    initialized: false,
    settings: null
  };

  // Default settings configuration
  const defaultSettings = {
    enhanceContributors: true,
    showCommitInfo: true,
    showTeamInfo: true,
    showOrgInfo: true,
    cardWidth: 250,
    maxCards: 10,
    locale: 'en-US'
  };

  // Storage operations
  const storage = {
    async load() {
      return new Promise((resolve) => {
        chrome.storage.sync.get(defaultSettings, (items) => {
          if (chrome.runtime.lastError) {
            console.error('Storage load error:', chrome.runtime.lastError);
            resolve(defaultSettings);
          } else {
            resolve(items);
          }
        });
      });
    },

    async save(settings) {
      return new Promise((resolve) => {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage save error:', chrome.runtime.lastError);
            resolve(settings);
          } else {
            resolve(settings);
          }
        });
      });
    }
  };

  // UI creation utilities
  const createSettingsUI = () => {
    const container = document.createElement('div');
    container.id = 'github-extension-settings';
    container.style.display = 'none';

    container.innerHTML = `
      <h2>GitHub Extension Settings</h2>
      <div class="settings-controls">
        <label>
          <input type="checkbox" id="enhanceContributors"> Enhance Contributors
        </label>
        <label>
          <input type="checkbox" id="showCommitInfo"> Show Commit Info
        </label>
        <label>
          <input type="checkbox" id="showTeamInfo"> Show Team Info
        </label>
        <label>
          <input type="checkbox" id="showOrgInfo"> Show Organization Info
        </label>
        <label>
          Card Width: <input type="number" id="cardWidth" min="200" max="400">px
        </label>
        <label>
          Max Cards: <input type="number" id="maxCards" min="5" max="50">
        </label>
        <label>
          Locale: <input type="text" id="locale" placeholder="e.g., en-US, tr-TR">
        </label>
      </div>
      <div class="settings-buttons">
        <button id="saveSettings" class="btn btn-primary">Save Settings</button>
        <button id="closeSettings" class="btn">Close</button>
      </div>
    `;

    document.body.appendChild(container);
    return container;
  };

  const createSettingsButton = () => {
    const button = document.createElement('button');
    button.textContent = '⚙️';
    button.className = 'github-extension-settings-button';
    button.title = 'GitHub Extension Settings';
    document.body.appendChild(button);
    return button;
  };

  // Settings UI event handlers
  const setupEventListeners = (container, button) => {
    // Save settings
    container.querySelector('#saveSettings').addEventListener('click', async () => {
      const newSettings = {
        enhanceContributors: document.getElementById('enhanceContributors').checked,
        showCommitInfo: document.getElementById('showCommitInfo').checked,
        showTeamInfo: document.getElementById('showTeamInfo').checked,
        showOrgInfo: document.getElementById('showOrgInfo').checked,
        cardWidth: parseInt(document.getElementById('cardWidth').value, 10),
        maxCards: parseInt(document.getElementById('maxCards').value, 10),
        locale: document.getElementById('locale').value
      };

      try {
        state.settings = await storage.save(newSettings);
        container.style.display = 'none';
        alert('Settings saved! Please refresh the page for changes to take effect.');
      } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings. Please try again.');
      }
    });

    // Close settings
    container.querySelector('#closeSettings').addEventListener('click', () => {
      container.style.display = 'none';
    });

    // Toggle settings
    button.addEventListener('click', () => {
      container.style.display = container.style.display === 'none' ? 'block' : 'none';
    });
  };

  // Update UI with current settings
  const updateUI = (settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      const element = document.getElementById(key);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = value;
        } else {
          element.value = value;
        }
      }
    });
  };

  // Initialize the settings UI
  const initializeUI = async () => {
    const container = createSettingsUI();
    const button = createSettingsButton();
    setupEventListeners(container, button);
    updateUI(state.settings);
  };

  // Primary initialization function
  const initialize = async () => {
    if (state.initialized) {
      return state.settings;
    }

    try {
      // Load settings from storage
      state.settings = await storage.load();
      
      // Initialize UI
      await initializeUI();
      
      state.initialized = true;
      return state.settings;
    } catch (error) {
      console.error('Settings initialization failed:', error);
      // Fall back to defaults
      state.settings = { ...defaultSettings };
      return state.settings;
    }
  };

  // Public API
  return {
    async initSettings() {
      return initialize();
    },

    async loadSettings() {
      if (!state.initialized) {
        return initialize();
      }
      return state.settings;
    },

    async saveSettings(settings) {
      const savedSettings = await storage.save(settings);
      state.settings = savedSettings;
      return savedSettings;
    },

    getDefaultSettings() {
      return { ...defaultSettings };
    }
  };
})();

// Expose the settings module globally
window.GithubExtensionSettings = GitHubExtensionSettings;