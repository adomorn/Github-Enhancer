/**
 * Base Enhancer class for GitHub Enhancer
 * Provides common functionality for all enhancement modules
 */

const BaseEnhancer = (() => {
  const Logger = window.Logger || console;
  const Storage = window.Storage;
  const DOMUtils = window.DOMUtils;
  
  // Define constants locally
  const ERROR_TYPES = {
    ENHANCEMENT: 'ENHANCEMENT_ERROR',
    NETWORK: 'NETWORK_ERROR',
    STORAGE: 'STORAGE_ERROR'
  };
  
  const EVENT_TYPES = {
    ERROR_OCCURRED: 'github-enhancer:error',
    ENHANCEMENT_COMPLETE: 'github-enhancer:complete'
  };

  /**
   * Base class for all enhancers
   */
  class EnhancerBase {
    constructor(name, options = {}) {
      this.name = name;
      this.isInitialized = false;
      this.isEnabled = true;
      this.observers = new Set();
      this.settings = null;
      this.performanceMetrics = new Map();
      
      // Configuration
      this.config = {
        debounceDelay: 250,
        retryAttempts: 3,
        retryDelay: 1000,
        batchSize: 10,
        ...options
      };

      // Bind methods to maintain context
      this.enhance = this.enhance.bind(this);
      this.handleMutation = this.handleMutation.bind(this);
      this.handleError = this.handleError.bind(this);
    }

    /**
     * Initialize the enhancer
     */
    async initialize() {
      if (this.isInitialized) {
        Logger.debug(`${this.name} already initialized`);
        return;
      }

      try {
        Logger.info(`Initializing ${this.name} enhancer`);
        
        // Load settings
        await this.loadSettings();
        
        // Run initial setup
        await this.setup();
        
        // Start observing if enabled
        if (this.isEnabled) {
          this.startObserving();
          await this.runInitialEnhancement();
        }
        
        this.isInitialized = true;
        Logger.info(`${this.name} enhancer initialized successfully`);
      } catch (error) {
        Logger.logError(error, { context: `${this.name} initialization` });
        throw error;
      }
    }

    /**
     * Setup method to be overridden by child classes
     */
    async setup() {
      // Override in child classes
    }

    /**
     * Load settings from storage
     */
    async loadSettings() {
      try {
        this.settings = await Storage.settings.load();
        Logger.debug(`Settings loaded for ${this.name}:`, this.settings);
      } catch (error) {
        Logger.logError(error, { context: `${this.name} settings loading` });
        this.settings = {
          enhanceContributors: true,
          enhanceDateTimes: true,
          enhanceFileSizes: true,
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
      }
    }

    /**
     * Start observing DOM changes
     */
    startObserving() {
      if (!this.shouldObserve()) {
        return;
      }

      const debouncedHandler = DOMUtils.debounce(
        this.handleMutation, 
        this.config.debounceDelay
      );

      const observer = new MutationObserver(debouncedHandler);
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        attributeOldValue: false
      });

      this.observers.add(observer);
      Logger.debug(`${this.name} DOM observer started`);
    }

    /**
     * Stop observing DOM changes
     */
    stopObserving() {
      this.observers.forEach(observer => observer.disconnect());
      this.observers.clear();
      Logger.debug(`${this.name} DOM observers stopped`);
    }

    /**
     * Handle DOM mutations
     */
    async handleMutation(mutations) {
      if (!this.isEnabled || !this.shouldEnhance(mutations)) {
        return;
      }

      try {
        await this.enhance();
      } catch (error) {
        this.handleError(error, 'DOM mutation handling');
      }
    }

    /**
     * Main enhancement method to be overridden
     */
    async enhance() {
      throw new Error(`${this.name} must implement enhance() method`);
    }

    /**
     * Run initial enhancement
     */
    async runInitialEnhancement() {
      try {
        Logger.debug(`Running initial enhancement for ${this.name}`);
        await this.enhance();
      } catch (error) {
        this.handleError(error, 'Initial enhancement');
      }
    }

    /**
     * Check if should observe DOM changes
     */
    shouldObserve() {
      return this.isEnabled && this.isInitialized;
    }

    /**
     * Check if should enhance based on mutations
     */
    shouldEnhance(mutations) {
      return mutations.some(mutation => 
        mutation.type === 'childList' && 
        mutation.addedNodes.length > 0
      );
    }

    /**
     * Error handling
     */
    handleError(error, context = 'Unknown') {
      Logger.logError(error, { 
        context: `${this.name} - ${context}`,
        enhancer: this.name 
      });

      // Dispatch error event
      this.dispatchEvent(EVENT_TYPES.ERROR_OCCURRED, {
        enhancer: this.name,
        error: error.message,
        context
      });
    }

    /**
     * Performance monitoring
     */
    startPerformanceTimer(label) {
      this.performanceMetrics.set(label, performance.now());
    }

    endPerformanceTimer(label) {
      const startTime = this.performanceMetrics.get(label);
      if (startTime) {
        const duration = performance.now() - startTime;
        this.performanceMetrics.delete(label);
        Logger.debug(`${this.name} - ${label}: ${duration.toFixed(2)}ms`);
        return duration;
      }
      return null;
    }

    /**
     * Batch processing utility
     */
    async processBatch(items, processor, batchSize = this.config.batchSize) {
      const batches = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(batch.map(processor));
        
        // Small delay between batches to prevent blocking
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    /**
     * Retry wrapper for operations
     */
    async withRetry(operation, attempts = this.config.retryAttempts) {
      let lastError;
      
      for (let i = 0; i < attempts; i++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          
          if (i < attempts - 1) {
            const delay = this.config.retryDelay * Math.pow(2, i);
            Logger.debug(`${this.name} retry ${i + 1}/${attempts} in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError;
    }

    /**
     * Dispatch custom events
     */
    dispatchEvent(type, detail = {}) {
      const event = new CustomEvent(type, {
        detail: {
          enhancer: this.name,
          timestamp: Date.now(),
          ...detail
        }
      });
      
      document.dispatchEvent(event);
    }

    /**
     * Enable the enhancer
     */
    enable() {
      this.isEnabled = true;
      Logger.info(`${this.name} enhancer enabled`);
      
      if (this.isInitialized) {
        this.startObserving();
        this.runInitialEnhancement();
      }
    }

    /**
     * Disable the enhancer
     */
    disable() {
      this.isEnabled = false;
      this.stopObserving();
      Logger.info(`${this.name} enhancer disabled`);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
      this.stopObserving();
      this.performanceMetrics.clear();
      this.isInitialized = false;
      Logger.debug(`${this.name} enhancer cleaned up`);
    }

    /**
     * Get enhancer status
     */
    getStatus() {
      return {
        name: this.name,
        isInitialized: this.isInitialized,
        isEnabled: this.isEnabled,
        observerCount: this.observers.size,
        hasSettings: !!this.settings
      };
    }
  }

  // Static utilities
  EnhancerBase.createError = (message, type = ERROR_TYPES.GENERAL) => {
    const error = new Error(message);
    error.type = type;
    return error;
  };

  EnhancerBase.isElementEnhanced = (element, enhancerName) => {
    return element.hasAttribute(`data-${enhancerName}-enhanced`);
  };

  EnhancerBase.markElementEnhanced = (element, enhancerName) => {
    element.setAttribute(`data-${enhancerName}-enhanced`, 'true');
  };

  EnhancerBase.unmarkElementEnhanced = (element, enhancerName) => {
    element.removeAttribute(`data-${enhancerName}-enhanced`);
  };

  return EnhancerBase;
})();

// Global availability
window.BaseEnhancer = BaseEnhancer; 