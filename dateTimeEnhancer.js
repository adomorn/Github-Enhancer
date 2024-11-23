// GitHub Date Time Enhancer Module
const GitHubDateEnhancer = (function() {
  // Private state
  const state = {
    enhanced: new WeakSet(), // Track enhanced elements
    config: {
      defaultLocale: 'en-US',
      dateFormatOptions: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      },
      maxRetries: 3,
      retryDelay: 1000,
      batchSize: 10,
      enhancedDateClass: 'enhanced-date',
      debug: false
    }
  };

  // Utility functions
  const utils = {
    /**
     * Process elements in batches to avoid blocking the main thread
     * @param {Array} items - Array of items to process
     * @param {Function} processor - Processing function
     * @param {number} batchSize - Size of each batch
     */
    async processBatch(items, processor, batchSize) {
      const batches = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(batch.map(processor));
        // Small delay between batches to allow other tasks
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    },

    /**
     * Create enhanced date element
     * @param {string} formattedDate - Formatted date string
     * @returns {HTMLElement} Enhanced date element
     */
    createEnhancedDateElement(formattedDate) {
      return GitHubUtils.createElement('div', {
        className: state.config.enhancedDateClass,
        style: {
          fontSize: '0.85em',
          marginTop: '2px'
        }
      }, [formattedDate]);
    },

    /**
     * Check if element should be enhanced
     * @param {Element} element - Element to check
     * @returns {boolean} Whether element should be enhanced
     */
    shouldEnhanceElement(element) {
      return (
        element &&
        element.hasAttribute('datetime') &&
        !state.enhanced.has(element) &&
        !element.nextElementSibling?.classList.contains(state.config.enhancedDateClass)
      );
    }
  };

  // Error handling
  class DateEnhancerError extends GitHubUtils.ExtensionError {
    constructor(message, type = 'DATE_ENHANCER_ERROR', originalError = null) {
      super(message, type, originalError);
      this.name = 'DateEnhancerError';
    }
  }

  /**
   * Enhance a single relative time element
   * @param {Element} element - The relative-time element to enhance
   * @returns {Promise<void>}
   */
  async function enhanceElement(element) {
    try {
      if (!utils.shouldEnhanceElement(element)) {
        return;
      }

      const dateTimeAttr = element.getAttribute('datetime');
      if (!dateTimeAttr) {
        throw new DateEnhancerError('Missing datetime attribute', 'INVALID_ELEMENT');
      }

      const settings = await GithubExtensionSettings.loadSettings();
      const locale = settings.locale || state.config.defaultLocale;

      const formattedDate = GitHubUtils.formatDateTime(
        dateTimeAttr,
        locale,
        state.config.dateFormatOptions
      );

      const enhancedDate = utils.createEnhancedDateElement(formattedDate);
      element.parentNode.insertBefore(enhancedDate, element.nextSibling);
      
      // Mark as enhanced
      state.enhanced.add(element);

      GitHubUtils.log.debug(`Enhanced date for ${dateTimeAttr}`);
    } catch (error) {
      if (error instanceof DateEnhancerError) {
        GitHubUtils.log.warn(`Failed to enhance date element: ${error.message}`);
      } else {
        GitHubUtils.log.error('Unexpected error enhancing date element:', error);
      }
    }
  }

  /**
   * Main enhancement function
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<void>}
   */
  async function enhanceRelativeTimes(retryCount = 0) {
    try {
      GitHubUtils.log.debug('Enhancing relative times...');
      
      const relativeTimes = Array.from(document.querySelectorAll('relative-time'));
      
      if (relativeTimes.length === 0) {
        if (retryCount < state.config.maxRetries) {
          GitHubUtils.log.debug(`No elements found, retrying... (${retryCount + 1}/${state.config.maxRetries})`);
          setTimeout(() => {
            enhanceRelativeTimes(retryCount + 1);
          }, state.config.retryDelay);
        }
        return;
      }

      await utils.processBatch(
        relativeTimes,
        enhanceElement,
        state.config.batchSize
      );

      GitHubUtils.log.info(`Enhanced ${relativeTimes.length} date elements`);
    } catch (error) {
      throw new DateEnhancerError(
        'Failed to enhance relative times',
        'ENHANCEMENT_FAILED',
        error
      );
    }
  }

  /**
   * Initialize the date enhancer with custom configuration
   * @param {Object} customConfig - Custom configuration options
   */
  function initialize(customConfig = {}) {
    // Merge custom configuration with defaults
    Object.assign(state.config, customConfig);
    
    GitHubUtils.log.debug('Date Enhancer initialized with config:', state.config);
  }

  // Public API
  return {
    enhance: enhanceRelativeTimes,
    initialize,
    
    // Configuration getters/setters
    setLocale(locale) {
      state.config.defaultLocale = locale;
    },
    
    setDateFormat(options) {
      Object.assign(state.config.dateFormatOptions, options);
    },
    
    setBatchSize(size) {
      state.config.batchSize = size;
    },
    
    // For debugging and testing
    getConfig() {
      return { ...state.config };
    },
    
    getEnhancedCount() {
      return document.querySelectorAll(`.${state.config.enhancedDateClass}`).length;
    },

    // Reset state (useful for testing)
    reset() {
      state.enhanced = new WeakSet();
      // Reset config to defaults
      state.config = {
        defaultLocale: 'en-US',
        dateFormatOptions: {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        },
        maxRetries: 3,
        retryDelay: 1000,
        batchSize: 10,
        enhancedDateClass: 'enhanced-date',
        debug: false
      };
    }
  };
})();

// For backwards compatibility
window.enhanceRelativeTimes = GitHubDateEnhancer.enhance;