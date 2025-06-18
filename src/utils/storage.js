/**
 * Storage utility for GitHub Enhancer
 * Handles Chrome extension storage operations with proper error handling
 */

const Storage = (() => {
  // Define constants locally to avoid dependency issues
  const STORAGE_KEYS = {
    SETTINGS: 'github_enhancer_settings',
    CACHE_PREFIX: 'github_enhancer_cache_'
  };

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

  const ERROR_TYPES = {
    STORAGE: 'STORAGE_ERROR'
  };

  const Logger = window.Logger || {
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    logError: console.error.bind(console)
  };

  /**
   * Custom error for storage operations
   */
  class StorageError extends Error {
    constructor(message, type = ERROR_TYPES.STORAGE, originalError = null) {
      super(message);
      this.name = 'StorageError';
      this.type = type;
      this.originalError = originalError;
    }
  }

  /**
   * Promisify Chrome storage operations with safety checks
   */
  const chromeStorageGet = (keys = null) => {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.sync) {
          reject(new StorageError('Chrome storage API not available', ERROR_TYPES.STORAGE));
          return;
        }

        chrome.storage.sync.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new StorageError(
              `Failed to get storage: ${chrome.runtime.lastError.message}`,
              ERROR_TYPES.STORAGE,
              chrome.runtime.lastError
            ));
          } else {
            resolve(result || {});
          }
        });
      } catch (error) {
        reject(new StorageError('Extension context invalidated', ERROR_TYPES.STORAGE, error));
      }
    });
  };

  const chromeStorageSet = (items) => {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.sync) {
          reject(new StorageError('Chrome storage API not available', ERROR_TYPES.STORAGE));
          return;
        }

        chrome.storage.sync.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new StorageError(
              `Failed to set storage: ${chrome.runtime.lastError.message}`,
              ERROR_TYPES.STORAGE,
              chrome.runtime.lastError
            ));
          } else {
            resolve(items);
          }
        });
      } catch (error) {
        reject(new StorageError('Extension context invalidated', ERROR_TYPES.STORAGE, error));
      }
    });
  };

  const chromeStorageRemove = (keys) => {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new StorageError(
            `Failed to remove storage: ${chrome.runtime.lastError.message}`,
            ERROR_TYPES.STORAGE,
            chrome.runtime.lastError
          ));
        } else {
          resolve();
        }
      });
    });
  };

  const chromeStorageClear = () => {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new StorageError(
            `Failed to clear storage: ${chrome.runtime.lastError.message}`,
            ERROR_TYPES.STORAGE,
            chrome.runtime.lastError
          ));
        } else {
          resolve();
        }
      });
    });
  };

  /**
   * Settings management
   */
  const settings = {
    async load() {
      try {
        const result = await chromeStorageGet(STORAGE_KEYS.SETTINGS);
        const savedSettings = result[STORAGE_KEYS.SETTINGS];
        
        if (!savedSettings) {
          Logger.info('No saved settings found, using defaults');
          return { ...DEFAULT_SETTINGS };
        }

        // Merge with defaults to ensure all keys exist
        const mergedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };
        Logger.debug('Settings loaded successfully:', mergedSettings);
        return mergedSettings;
      } catch (error) {
        Logger.logError(error, { context: 'Loading settings' });
        return { ...DEFAULT_SETTINGS };
      }
    },

    async save(newSettings) {
      try {
        // Validate settings structure
        const validatedSettings = this.validate(newSettings);
        
        await chromeStorageSet({
          [STORAGE_KEYS.SETTINGS]: validatedSettings
        });

        Logger.info('Settings saved successfully');
        
        // Notify other parts of the extension about settings change
        if (chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'SETTINGS_CHANGED',
            payload: validatedSettings
          }).catch(() => {
            // Ignore if background script is not available
          });
        }

        return validatedSettings;
      } catch (error) {
        Logger.logError(error, { context: 'Saving settings' });
        throw error;
      }
    },

    validate(settings) {
      const validated = { ...DEFAULT_SETTINGS };
      
      // Validate each setting
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (settings.hasOwnProperty(key)) {
          const value = settings[key];
          const defaultValue = DEFAULT_SETTINGS[key];
          
          // Type validation
          if (typeof value === typeof defaultValue) {
            validated[key] = value;
          } else {
            Logger.warn(`Invalid type for setting ${key}, using default`);
            validated[key] = defaultValue;
          }
        }
      });

      return validated;
    },

    async reset() {
      try {
        await chromeStorageRemove(STORAGE_KEYS.SETTINGS);
        Logger.info('Settings reset to defaults');
        return { ...DEFAULT_SETTINGS };
      } catch (error) {
        Logger.logError(error, { context: 'Resetting settings' });
        throw error;
      }
    }
  };

  /**
   * Generic storage operations
   */
  const generic = {
    async get(key, defaultValue = null) {
      try {
        const result = await chromeStorageGet(key);
        return result[key] !== undefined ? result[key] : defaultValue;
      } catch (error) {
        Logger.logError(error, { context: `Getting key: ${key}` });
        return defaultValue;
      }
    },

    async set(key, value) {
      try {
        await chromeStorageSet({ [key]: value });
        Logger.debug(`Storage set: ${key}`);
        return value;
      } catch (error) {
        Logger.logError(error, { context: `Setting key: ${key}` });
        throw error;
      }
    },

    async remove(key) {
      try {
        await chromeStorageRemove(key);
        Logger.debug(`Storage removed: ${key}`);
      } catch (error) {
        Logger.logError(error, { context: `Removing key: ${key}` });
        throw error;
      }
    },

    async clear() {
      try {
        await chromeStorageClear();
        Logger.info('Storage cleared');
      } catch (error) {
        Logger.logError(error, { context: 'Clearing storage' });
        throw error;
      }
    }
  };

  /**
   * Cache management with TTL support
   */
  const cache = {
    async set(key, value, ttl = 3600000) { // 1 hour default TTL
      const cacheKey = `${STORAGE_KEYS.CACHE_PREFIX}${key}`;
      const cacheData = {
        value,
        timestamp: Date.now(),
        ttl
      };

      try {
        await generic.set(cacheKey, cacheData);
        Logger.debug(`Cache set: ${key} (TTL: ${ttl}ms)`);
      } catch (error) {
        Logger.logError(error, { context: `Setting cache: ${key}` });
      }
    },

    async get(key) {
      const cacheKey = `${STORAGE_KEYS.CACHE_PREFIX}${key}`;
      
      try {
        const cacheData = await generic.get(cacheKey);
        
        if (!cacheData) {
          return null;
        }

        const { value, timestamp, ttl } = cacheData;
        const now = Date.now();

        if (now - timestamp > ttl) {
          // Cache expired, remove it (but don't await to avoid blocking)
          this.remove(key).catch(() => {
            // Ignore removal errors
          });
          Logger.debug(`Cache expired: ${key}`);
          return null;
        }

        Logger.debug(`Cache hit: ${key}`);
        return value;
      } catch (error) {
        // If extension context is invalidated, just return null
        if (error.message && error.message.includes('Extension context invalidated')) {
          Logger.debug(`Extension context invalidated, returning null for cache: ${key}`);
          return null;
        }
        Logger.logError(error, { context: `Getting cache: ${key}` });
        return null;
      }
    },

    async remove(key) {
      const cacheKey = `${STORAGE_KEYS.CACHE_PREFIX}${key}`;
      try {
        await generic.remove(cacheKey);
        Logger.debug(`Cache removed: ${key}`);
      } catch (error) {
        Logger.logError(error, { context: `Removing cache: ${key}` });
      }
    },

    async cleanup() {
      try {
        const allData = await chromeStorageGet();
        const cacheKeys = Object.keys(allData).filter(key => 
          key.startsWith(STORAGE_KEYS.CACHE_PREFIX)
        );

        const now = Date.now();
        const expiredKeys = [];

        for (const cacheKey of cacheKeys) {
          const cacheData = allData[cacheKey];
          if (cacheData && cacheData.timestamp && cacheData.ttl) {
            if (now - cacheData.timestamp > cacheData.ttl) {
              expiredKeys.push(cacheKey);
            }
          }
        }

        if (expiredKeys.length > 0) {
          await chromeStorageRemove(expiredKeys);
          Logger.info(`Cleaned up ${expiredKeys.length} expired cache entries`);
        }
      } catch (error) {
        Logger.logError(error, { context: 'Cache cleanup' });
      }
    }
  };

  // Public API
  return {
    settings,
    cache,
    ...generic,
    StorageError,
    
    // Utility methods
    async getStorageUsage() {
      try {
        return new Promise((resolve) => {
          chrome.storage.sync.getBytesInUse(null, (bytesInUse) => {
            resolve(bytesInUse);
          });
        });
      } catch (error) {
        Logger.logError(error, { context: 'Getting storage usage' });
        return 0;
      }
    }
  };
})();

// Global availability
window.Storage = Storage; 