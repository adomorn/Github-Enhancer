/**
 * GitHub Enhancer Service Worker
 * Simplified version for Chrome Extension
 */

console.log('GitHub Enhancer service worker starting...');

// Default settings
const DEFAULT_SETTINGS = {
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
 * Extension installation/update handler
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('GitHub Enhancer installed:', details.reason);
  
  try {
    if (details.reason === 'install') {
      // First time installation
      await chrome.storage.sync.set({
        github_enhancer_settings: DEFAULT_SETTINGS
      });
      console.log('Default settings initialized');
    }
  } catch (error) {
    console.error('Installation error:', error);
  }
});

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Service worker received message:', message.type);

  switch (message.type) {
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true; // Keep message channel open

    case 'SAVE_SETTINGS':
      handleSaveSettings(message.payload, sendResponse);
      return true;

    case 'GET_STORAGE_USAGE':
      handleGetStorageUsage(sendResponse);
      return true;

    case 'CLEAR_CACHE':
      handleClearCache(sendResponse);
      return true;

    case 'LOG_ERROR':
      console.error('Content script error:', message.payload);
      break;

    default:
      console.warn('Unknown message type:', message.type);
  }
});

/**
 * Get settings from storage
 */
async function handleGetSettings(sendResponse) {
  try {
    const result = await chrome.storage.sync.get('github_enhancer_settings');
    const settings = result.github_enhancer_settings || DEFAULT_SETTINGS;
    sendResponse({ success: true, settings });
  } catch (error) {
    console.error('Failed to get settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Save settings to storage
 */
async function handleSaveSettings(settings, sendResponse) {
  try {
    await chrome.storage.sync.set({
      github_enhancer_settings: settings
    });
    
    // Notify content scripts
    try {
      const tabs = await chrome.tabs.query({ url: 'https://github.com/*' });
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            payload: settings
          });
        } catch (e) {
          // Tab might not have content script, ignore
        }
      }
    } catch (e) {
      // Ignore tab messaging errors
    }
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get storage usage
 */
async function handleGetStorageUsage(sendResponse) {
  try {
    const bytesInUse = await chrome.storage.sync.getBytesInUse();
    sendResponse({ success: true, bytesInUse });
  } catch (error) {
    console.error('Failed to get storage usage:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Clear cache
 */
async function handleClearCache(sendResponse) {
  try {
    const allData = await chrome.storage.sync.get();
    const cacheKeys = Object.keys(allData).filter(key => 
      key.startsWith('github_enhancer_cache_')
    );
    
    if (cacheKeys.length > 0) {
      await chrome.storage.sync.remove(cacheKeys);
    }
    
    sendResponse({ success: true, clearedCount: cacheKeys.length });
  } catch (error) {
    console.error('Failed to clear cache:', error);
    sendResponse({ success: false, error: error.message });
  }
}

console.log('GitHub Enhancer service worker loaded successfully'); 