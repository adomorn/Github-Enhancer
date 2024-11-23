// GitHub Extension Core Module
const GitHubEnhancer = (function() {
  // Private state
  const state = {
    initialized: false,
    observers: new Set(),
    settings: null,
    performanceMetrics: new Map()
  };

  // Performance monitoring
  const metrics = {
    startMeasure(label) {
      state.performanceMetrics.set(label, performance.now());
    },
    
    endMeasure(label) {
      const start = state.performanceMetrics.get(label);
      if (start) {
        const duration = performance.now() - start;
        debug(`${label} took ${duration.toFixed(2)}ms`);
        state.performanceMetrics.delete(label);
        return duration;
      }
    }
  };

  // DOM Observation handlers
  const handlers = {
    contributorsSection() {
      const targetElement = Array.from(document.querySelectorAll('.BorderGrid-row'))
        .find(row => row.textContent.includes('Contributors'));
      
      if (targetElement && !state.enhancementInProgress) {
        debug('Found contributors section');
        return targetElement;
      }
      return null;
    },

    relativeTimes() {
      const targetElement = document.querySelector('relative-time');
      if (targetElement) {
        debug('Found relative time element');
        return targetElement;
      }
      return null;
    }
  };

  // Feature enhancement handlers
  const enhancers = {
    async contributors() {
      if (state.settings?.enhanceContributors) {
        const section = handlers.contributorsSection();
        if (section && !state.enhancementInProgress) {
          state.enhancementInProgress = true;
          try {
            metrics.startMeasure('contributorsEnhancement');
            await window.enhanceContributors(state.settings);
            metrics.endMeasure('contributorsEnhancement');
          } catch (error) {
            debug(`Error enhancing contributors: ${error.message}`);
          } finally {
            state.enhancementInProgress = false;
          }
        }
      }
    },

    async relativeTimes() {
      const element = handlers.relativeTimes();
      if (element) {
        try {
          metrics.startMeasure('relativeTimesEnhancement');
          await window.enhanceRelativeTimes();
          metrics.endMeasure('relativeTimesEnhancement');
        } catch (error) {
          debug(`Error enhancing relative times: ${error.message}`);
        }
      }
    }
  };

  // Mutation observer setup
  function setupObservers() {
    const observer = new MutationObserver(() => {
      enhancers.contributors();
      enhancers.relativeTimes();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    state.observers.add(observer);
    debug('DOM observers initialized');
  }

  // Settings initialization
  async function initializeSettings() {
    try {
      if (!window.GithubExtensionSettings) {
        throw new Error('GithubExtensionSettings not loaded');
      }

      // Initialize settings
      state.settings = await window.GithubExtensionSettings.loadSettings();
      debug('Settings initialized successfully');
    } catch (error) {
      debug('Error initializing settings:', error.message);
      // Use default settings as fallback
      state.settings = {
        enhanceContributors: true,
        showCommitInfo: true,
        showTeamInfo: true,
        showOrgInfo: true,
        cardWidth: 250,
        maxCards: 10,
        locale: 'en-US'
      };
    }
  }

  // Dependency checker
  function checkDependencies() {
    const required = ['GithubExtensionSettings', 'enhanceContributors', 'enhanceRelativeTimes'];
    const missing = required.filter(dep => !window[dep]);
    
    if (missing.length > 0) {
      throw new Error(`Missing dependencies: ${missing.join(', ')}`);
    }
  }

  // Public API
  return {
    async initialize() {
      if (state.initialized) {
        debug('Already initialized');
        return;
      }

      try {
        await initializeSettings();
        setupObservers();
        
        // Initial enhancement check
        await enhancers.contributors();
        await enhancers.relativeTimes();
        
        state.initialized = true;
        debug('GitHub Enhancer initialized successfully');
      } catch (error) {
        debug(`Initialization error: ${error.message}`);
        // Continue with limited functionality
        state.initialized = true;
      }
    },

    cleanup() {
      state.observers.forEach(observer => observer.disconnect());
      state.observers.clear();
      state.initialized = false;
      state.settings = null;
      state.performanceMetrics.clear();
      debug('GitHub Enhancer cleaned up');
    },

    // For debugging and testing
    getState() {
      return {
        initialized: state.initialized,
        observerCount: state.observers.size,
        hasSettings: !!state.settings,
        enhancementInProgress: !!state.enhancementInProgress
      };
    }
  };
})();

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => GitHubEnhancer.initialize());
} else {
  GitHubEnhancer.initialize();
}