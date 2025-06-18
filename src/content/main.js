/**
 * Main Content Script for GitHub Enhancer
 * Coordinates all enhancement modules and handles initialization
 */

const GitHubEnhancerMain = (() => {
  const { Logger, Storage, DOMUtils } = window;
  const { EVENT_TYPES, SELECTORS } = window.GITHUB_ENHANCER_CONSTANTS;

  // State management
  const state = {
    initialized: false,
    enhancers: new Map(),
    settings: null,
    pageType: null,
    lastURL: null
  };

  /**
   * Initialize the main extension
   */
  async function initialize() {
    if (state.initialized) {
      Logger.debug('GitHub Enhancer already initialized');
      return;
    }

    try {
      Logger.info('Initializing GitHub Enhancer');
      
      // Load settings
      await loadSettings();
      
      // Set up logging level based on settings
      if (state.settings.debugMode) {
        Logger.setLogLevel(Logger.LOG_LEVELS.DEBUG);
      }
      
      // Detect page type
      detectPageType();
      
      // Initialize enhancers based on settings
      await initializeEnhancers();
      
      // Set up global event listeners
      setupEventListeners();
      
      // Set up URL change detection for SPA navigation
      setupNavigationHandling();
      
      state.initialized = true;
      Logger.info('GitHub Enhancer initialized successfully');
      
      // Dispatch initialization event
      dispatchEvent(EVENT_TYPES.ENHANCEMENT_COMPLETE, {
        action: 'initialized',
        pageType: state.pageType
      });
      
    } catch (error) {
      Logger.logError(error, { context: 'Main initialization' });
    }
  }

  /**
   * Load settings from storage
   */
  async function loadSettings() {
    try {
      state.settings = await Storage.settings.load();
      Logger.debug('Settings loaded:', state.settings);
    } catch (error) {
      Logger.logError(error, { context: 'Loading settings' });
      state.settings = window.GITHUB_ENHANCER_CONSTANTS.DEFAULT_SETTINGS;
    }
  }

  /**
   * Detect the current GitHub page type
   */
  function detectPageType() {
    const path = window.location.pathname;
    
    if (path === '/' || path === '') {
      state.pageType = 'home';
    } else if (path.includes('/settings')) {
      state.pageType = 'settings';
    } else if (path.includes('/pull/')) {
      state.pageType = 'pull_request';
    } else if (path.includes('/issues/')) {
      state.pageType = 'issue';
    } else if (path.includes('/commit/')) {
      state.pageType = 'commit';
    } else if (path.includes('/tree/') || path.includes('/blob/')) {
      state.pageType = 'file_browser';
    } else if (path.match(/^\/[^\/]+\/[^\/]+\/?$/)) {
      state.pageType = 'repository';
    } else {
      state.pageType = 'other';
    }
    
    Logger.debug(`Detected page type: ${state.pageType}`);
  }

  /**
   * Initialize enhancer modules
   */
  async function initializeEnhancers() {
    const enhancerConfigs = [
      {
        name: 'DateEnhancer',
        enabled: state.settings.enhanceDateTimes,
        module: window.DateEnhancer,
        supportedPages: ['repository', 'file_browser', 'commit', 'pull_request', 'issue']
      },
      {
        name: 'ContributorEnhancer', 
        enabled: state.settings.enhanceContributors,
        module: window.ContributorEnhancer,
        supportedPages: ['repository']
      },
      {
        name: 'FileSizeEnhancer',
        enabled: state.settings.enhanceFileSizes,
        module: window.FileSizeEnhancer,
        supportedPages: ['repository', 'file_browser']
      },
      {
        name: 'ThemeEnhancer',
        enabled: state.settings.enableThemeEnhancements,
        module: window.ThemeEnhancer,
        supportedPages: ['repository', 'file_browser', 'commit', 'pull_request', 'issue', 'home', 'other']
      }
    ];

    for (const config of enhancerConfigs) {
      try {
        if (!config.enabled) {
          Logger.debug(`${config.name} disabled by settings`);
          continue;
        }

        if (!config.supportedPages.includes(state.pageType)) {
          Logger.debug(`${config.name} not supported on ${state.pageType} pages`);
          continue;
        }

        if (!config.module) {
          Logger.warn(`${config.name} module not loaded`);
          continue;
        }

        // Create and initialize enhancer instance
        const enhancer = new config.module(config.name);
        await enhancer.initialize();
        
        state.enhancers.set(config.name, enhancer);
        Logger.info(`${config.name} initialized successfully`);
        
      } catch (error) {
        Logger.logError(error, { context: `Initializing ${config.name}` });
      }
    }
  }

  /**
   * Set up global event listeners
   */
  function setupEventListeners() {
    // Listen for settings changes from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SETTINGS_UPDATED') {
        handleSettingsUpdate(message.payload);
      } else if (message.type === 'PING') {
        sendResponse({ status: 'active' });
      }
    });

    // Listen for custom events from enhancers
    document.addEventListener(EVENT_TYPES.ERROR_OCCURRED, handleEnhancerError);
    document.addEventListener(EVENT_TYPES.ENHANCEMENT_COMPLETE, handleEnhancementComplete);

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        Logger.debug('Page became visible, refreshing enhancers');
        refreshEnhancers();
      }
    });

    Logger.debug('Global event listeners set up');
  }

  /**
   * Set up navigation handling for SPA
   */
  function setupNavigationHandling() {
    // Override pushState and replaceState to detect navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleNavigation();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleNavigation();
    };

    // Handle popstate events
    window.addEventListener('popstate', handleNavigation);

    Logger.debug('Navigation handling set up');
  }

  /**
   * Handle navigation changes
   */
  function handleNavigation() {
    const currentURL = window.location.href;
    
    if (currentURL !== state.lastURL) {
      Logger.debug(`Navigation detected: ${state.lastURL} -> ${currentURL}`);
      state.lastURL = currentURL;
      
      // Small delay to let DOM update
      setTimeout(() => {
        detectPageType();
        reinitializeForNewPage();
      }, 100);
    }
  }

  /**
   * Reinitialize enhancers for new page
   */
  async function reinitializeForNewPage() {
    try {
      Logger.debug(`Reinitializing for page type: ${state.pageType}`);
      
      // Clean up existing enhancers
      for (const [name, enhancer] of state.enhancers) {
        enhancer.cleanup();
      }
      state.enhancers.clear();
      
      // Reinitialize enhancers for new page
      await initializeEnhancers();
      
    } catch (error) {
      Logger.logError(error, { context: 'Page reinitialization' });
    }
  }

  /**
   * Handle settings updates from popup
   */
  async function handleSettingsUpdate(newSettings) {
    try {
      Logger.info('Received settings update:', newSettings);
      
      const oldSettings = state.settings;
      state.settings = newSettings;
      
      // Update logging level
      if (newSettings.debugMode !== oldSettings.debugMode) {
        Logger.setLogLevel(newSettings.debugMode ? Logger.LOG_LEVELS.DEBUG : Logger.LOG_LEVELS.INFO);
      }
      
      // Check which enhancers need to be enabled/disabled
      const enhancerStateChanges = [
        { name: 'DateEnhancer', old: oldSettings.enhanceDateTimes, new: newSettings.enhanceDateTimes },
        { name: 'ContributorEnhancer', old: oldSettings.enhanceContributors, new: newSettings.enhanceContributors },
        { name: 'FileSizeEnhancer', old: oldSettings.enhanceFileSizes, new: newSettings.enhanceFileSizes }
      ];
      
      for (const change of enhancerStateChanges) {
        if (change.old !== change.new) {
          const enhancer = state.enhancers.get(change.name);
          
          if (change.new && !enhancer) {
            // Need to initialize this enhancer
            await initializeEnhancers();
            break; // Re-initialize all to be safe
          } else if (!change.new && enhancer) {
            // Need to disable this enhancer
            enhancer.disable();
          } else if (change.new && enhancer) {
            // Enable existing enhancer
            enhancer.enable();
          }
        }
      }
      
      // Update settings for all active enhancers
      for (const [name, enhancer] of state.enhancers) {
        if (enhancer.loadSettings) {
          await enhancer.loadSettings();
        }
      }
      
      Logger.info('Settings update handled successfully');
      
    } catch (error) {
      Logger.logError(error, { context: 'Handling settings update' });
    }
  }

  /**
   * Handle enhancer errors
   */
  function handleEnhancerError(event) {
    const { enhancer, error, context } = event.detail;
    Logger.warn(`Enhancer error from ${enhancer}: ${error} (${context})`);
    
    // Could implement error recovery logic here
  }

  /**
   * Handle enhancement completion
   */
  function handleEnhancementComplete(event) {
    const { enhancer, action } = event.detail;
    Logger.debug(`Enhancement complete: ${enhancer} - ${action}`);
    
    // Could implement analytics or performance tracking here
  }

  /**
   * Refresh all enhancers
   */
  async function refreshEnhancers() {
    try {
      for (const [name, enhancer] of state.enhancers) {
        if (enhancer.isEnabled && enhancer.enhance) {
          await enhancer.enhance();
        }
      }
    } catch (error) {
      Logger.logError(error, { context: 'Refreshing enhancers' });
    }
  }

  /**
   * Dispatch custom events
   */
  function dispatchEvent(type, detail = {}) {
    const event = new CustomEvent(type, {
      detail: {
        timestamp: Date.now(),
        ...detail
      }
    });
    
    document.dispatchEvent(event);
  }

  /**
   * Cleanup function
   */
  function cleanup() {
    try {
      // Clean up all enhancers
      for (const [name, enhancer] of state.enhancers) {
        enhancer.cleanup();
      }
      state.enhancers.clear();
      
      // Remove event listeners
      document.removeEventListener(EVENT_TYPES.ERROR_OCCURRED, handleEnhancerError);
      document.removeEventListener(EVENT_TYPES.ENHANCEMENT_COMPLETE, handleEnhancementComplete);
      
      state.initialized = false;
      Logger.info('GitHub Enhancer cleaned up');
      
    } catch (error) {
      Logger.logError(error, { context: 'Cleanup' });
    }
  }

  /**
   * Public API
   */
  return {
    initialize,
    cleanup,
    getStatus: () => ({
      initialized: state.initialized,
      pageType: state.pageType,
      enhancerCount: state.enhancers.size,
      settings: state.settings
    }),
    getEnhancers: () => Array.from(state.enhancers.keys()),
    refreshEnhancers
  };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', GitHubEnhancerMain.initialize);
} else {
  GitHubEnhancerMain.initialize();
}

// Clean up on page unload
window.addEventListener('beforeunload', GitHubEnhancerMain.cleanup);

// Global access for debugging
window.GitHubEnhancerMain = GitHubEnhancerMain; 