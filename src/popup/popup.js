/**
 * Popup script for GitHub Enhancer settings
 */

// DOM elements
const elements = {
  // Checkboxes
  enhanceContributors: null,
  enhanceDateTimes: null,
  enhanceFileSizes: null,
  enableThemeEnhancements: null,
  showCommitInfo: null,
  showTeamInfo: null,
  showOrgInfo: null,
  animationsEnabled: null,
  debugMode: null,
  
  // Range inputs
  cardWidth: null,
  maxCards: null,
  
  // Select inputs
  locale: null,
  theme: null,
  
  // Value displays
  cardWidthValue: null,
  maxCardsValue: null,
  
  // Buttons
  saveButton: null,
  resetButton: null,
  clearCacheButton: null,
  
  // Info elements
  storageUsage: null,
  toast: null,
  toastMessage: null
};

// Settings state
let currentSettings = {};
const defaultSettings = {
  enhanceContributors: true,
  enhanceDateTimes: true,
  enhanceFileSizes: true,
  enableThemeEnhancements: true,
  showCommitInfo: true,
  showTeamInfo: true,
  showOrgInfo: true,
  cardWidth: 250,
  maxCards: 10,
  locale: 'en-US',
  theme: 'auto',
  animationsEnabled: true,
      debugMode: false
};

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', initializePopup);

/**
 * Initialize popup
 */
async function initializePopup() {
  try {
    // Get DOM elements
    getDOMElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load current settings
    await loadSettings();
    
    // Update storage usage display
    await updateStorageUsage();
    
    console.log('Popup initialized successfully');
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showToast('Failed to initialize settings', 'error');
  }
}

/**
 * Get DOM elements
 */
function getDOMElements() {
  // Checkboxes
  elements.enhanceContributors = document.getElementById('enhanceContributors');
  elements.enhanceDateTimes = document.getElementById('enhanceDateTimes');
  elements.enhanceFileSizes = document.getElementById('enhanceFileSizes');
  elements.enableThemeEnhancements = document.getElementById('enableThemeEnhancements');
  elements.showCommitInfo = document.getElementById('showCommitInfo');
  elements.showTeamInfo = document.getElementById('showTeamInfo');
  elements.showOrgInfo = document.getElementById('showOrgInfo');
  elements.animationsEnabled = document.getElementById('animationsEnabled');
  elements.debugMode = document.getElementById('debugMode');
  
  // Range inputs
  elements.cardWidth = document.getElementById('cardWidth');
  elements.maxCards = document.getElementById('maxCards');
  
  // Select inputs
  elements.locale = document.getElementById('locale');
  elements.theme = document.getElementById('theme');
  
  // Value displays
  elements.cardWidthValue = document.getElementById('cardWidthValue');
  elements.maxCardsValue = document.getElementById('maxCardsValue');
  
  // Buttons
  elements.saveButton = document.getElementById('saveButton');
  elements.resetButton = document.getElementById('resetButton');
  elements.clearCacheButton = document.getElementById('clearCacheButton');
  
  // Info elements
  elements.storageUsage = document.getElementById('storageUsage');
  elements.toast = document.getElementById('toast');
  elements.toastMessage = document.getElementById('toastMessage');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Range input updates
  if (elements.cardWidth && elements.cardWidthValue) {
    elements.cardWidth.addEventListener('input', (e) => {
      elements.cardWidthValue.textContent = `${e.target.value}px`;
    });
  }
  
  if (elements.maxCards && elements.maxCardsValue) {
    elements.maxCards.addEventListener('input', (e) => {
      elements.maxCardsValue.textContent = e.target.value;
    });
  }
  
  // Button clicks
  if (elements.saveButton) {
    elements.saveButton.addEventListener('click', saveSettings);
  }
  if (elements.resetButton) {
    elements.resetButton.addEventListener('click', resetSettings);
  }
  if (elements.clearCacheButton) {
    elements.clearCacheButton.addEventListener('click', clearCache);
  }
  
  // Auto-save on change (optional)
  const autoSaveElements = [
    elements.enhanceContributors,
    elements.enhanceDateTimes,
    elements.enhanceFileSizes,
    elements.enableThemeEnhancements,
    elements.locale
  ].filter(Boolean);
  
  autoSaveElements.forEach(element => {
    element.addEventListener('change', debounce(saveSettings, 500));
  });
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    
    if (response.success) {
      currentSettings = { ...defaultSettings, ...response.settings };
      updateUI(currentSettings);
    } else {
      throw new Error(response.error || 'Failed to load settings');
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    currentSettings = { ...defaultSettings };
    updateUI(currentSettings);
    showToast('Using default settings', 'warning');
  }
}

/**
 * Update UI with settings
 */
function updateUI(settings) {
  // Checkboxes
  if (elements.enhanceContributors) elements.enhanceContributors.checked = settings.enhanceContributors;
  if (elements.enhanceDateTimes) elements.enhanceDateTimes.checked = settings.enhanceDateTimes;
  if (elements.enhanceFileSizes) elements.enhanceFileSizes.checked = settings.enhanceFileSizes;
  if (elements.enableThemeEnhancements) elements.enableThemeEnhancements.checked = settings.enableThemeEnhancements;
  
  // Range inputs
  if (elements.cardWidth) {
    elements.cardWidth.value = settings.cardWidth;
    elements.cardWidthValue.textContent = `${settings.cardWidth}px`;
  }
  
  if (elements.maxCards) {
    elements.maxCards.value = settings.maxCards;
    elements.maxCardsValue.textContent = settings.maxCards;
  }
  
  // Select inputs
  if (elements.locale) elements.locale.value = settings.locale;
}

/**
 * Collect settings from UI
 */
function collectSettings() {
  return {
    enhanceContributors: elements.enhanceContributors?.checked ?? defaultSettings.enhanceContributors,
    enhanceDateTimes: elements.enhanceDateTimes?.checked ?? defaultSettings.enhanceDateTimes,
    enhanceFileSizes: elements.enhanceFileSizes?.checked ?? defaultSettings.enhanceFileSizes,
    enableThemeEnhancements: elements.enableThemeEnhancements?.checked ?? defaultSettings.enableThemeEnhancements,
    showCommitInfo: currentSettings.showCommitInfo,
    showTeamInfo: currentSettings.showTeamInfo,
    showOrgInfo: currentSettings.showOrgInfo,
    cardWidth: parseInt(elements.cardWidth?.value ?? defaultSettings.cardWidth),
    maxCards: parseInt(elements.maxCards?.value ?? defaultSettings.maxCards),
    locale: elements.locale?.value ?? defaultSettings.locale,
    theme: currentSettings.theme,
    animationsEnabled: currentSettings.animationsEnabled,
    debugMode: currentSettings.debugMode
  };
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = 'Saving...';
    
    const newSettings = collectSettings();
    
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: newSettings
    });
    
    if (response.success) {
      currentSettings = newSettings;
      showToast('Settings saved successfully!', 'success');
    } else {
      throw new Error(response.error || 'Failed to save settings');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Failed to save settings', 'error');
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = 'Save Settings';
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }
  
  try {
    elements.resetButton.disabled = true;
    elements.resetButton.textContent = 'Resetting...';
    
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: defaultSettings
    });
    
    if (response.success) {
      currentSettings = { ...defaultSettings };
      updateUI(currentSettings);
      showToast('Settings reset to defaults', 'success');
    } else {
      throw new Error(response.error || 'Failed to reset settings');
    }
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showToast('Failed to reset settings', 'error');
  } finally {
    elements.resetButton.disabled = false;
    elements.resetButton.textContent = 'Reset';
  }
}

/**
 * Clear cache
 */
async function clearCache() {
  if (!confirm('Are you sure you want to clear the cache?')) {
    return;
  }
  
  try {
    elements.clearCacheButton.disabled = true;
    elements.clearCacheButton.textContent = 'Clearing...';
    
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    
    if (response.success) {
      showToast('Cache cleared successfully!', 'success');
      await updateStorageUsage();
    } else {
      throw new Error(response.error || 'Failed to clear cache');
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
    showToast('Failed to clear cache', 'error');
  } finally {
    elements.clearCacheButton.disabled = false;
    elements.clearCacheButton.textContent = 'Clear Cache';
  }
}

/**
 * Update storage usage display
 */
async function updateStorageUsage() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STORAGE_USAGE' });
    
    if (response.success && elements.storageUsage) {
      const kb = Math.round(response.bytesInUse / 1024);
      elements.storageUsage.textContent = `Storage: ${kb} KB`;
    }
  } catch (error) {
    console.error('Failed to get storage usage:', error);
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('toast-show'), 100);
  
  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Debounce utility
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Handle keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 's') {
      e.preventDefault();
      saveSettings();
    } else if (e.key === 'r') {
      e.preventDefault();
      resetSettings();
    }
  }
  
  if (e.key === 'Escape') {
    window.close();
  }
});

// Additional initialization check (backup)
if (document.readyState === 'loading') {
  // Already handled by the DOMContentLoaded listener above
} else {
  // If DOM is already loaded, initialize immediately
  if (typeof initializePopup === 'function') {
    initializePopup();
  }
} 