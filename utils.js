// GitHub Extension Utilities Module
const GitHubUtils = (function() {
  // Debug levels configuration
  const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  };

  // Private state
  const state = {
    logLevel: LogLevel.INFO,
    debugPrefix: '[GitHub Info Extension]'
  };

  // Logging utilities
  const logger = {
    error: (message, ...args) => {
      if (state.logLevel >= LogLevel.ERROR) {
        console.error(`${state.debugPrefix} ❌ ${message}`, ...args);
      }
    },

    warn: (message, ...args) => {
      if (state.logLevel >= LogLevel.WARN) {
        console.warn(`${state.debugPrefix} ⚠️ ${message}`, ...args);
      }
    },

    info: (message, ...args) => {
      if (state.logLevel >= LogLevel.INFO) {
        console.info(`${state.debugPrefix} ℹ️ ${message}`, ...args);
      }
    },

    debug: (message, ...args) => {
      if (state.logLevel >= LogLevel.DEBUG) {
        console.debug(`${state.debugPrefix} 🔍 ${message}`, ...args);
      }
    }
  };

  // Date formatting utilities
  const dateUtils = {
    formatDateTime(dateTimeString, locale = 'en-US', options = null) {
      try {
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date string provided');
        }

        const defaultOptions = {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        };

        return date.toLocaleString(locale, options || defaultOptions);
      } catch (error) {
        logger.error('Error formatting date:', error);
        return dateTimeString; // Return original string if formatting fails
      }
    },

    getRelativeTimeString(dateTimeString, locale = 'en-US') {
      try {
        const date = new Date(dateTimeString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

        if (diffInSeconds < 60) {
          return rtf.format(-diffInSeconds, 'second');
        } else if (diffInSeconds < 3600) {
          return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
        } else if (diffInSeconds < 86400) {
          return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
        } else {
          return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
        }
      } catch (error) {
        logger.error('Error calculating relative time:', error);
        return dateTimeString;
      }
    }
  };

  // DOM utilities
  const domUtils = {
    createElement(tag, attributes = {}, children = []) {
      try {
        const element = document.createElement(tag);
        
        // Set attributes
        Object.entries(attributes).forEach(([key, value]) => {
          if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
          } else if (key === 'className') {
            element.className = value;
          } else {
            element.setAttribute(key, value);
          }
        });

        // Append children
        children.forEach(child => {
          if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
          } else {
            element.appendChild(child);
          }
        });

        return element;
      } catch (error) {
        logger.error('Error creating element:', error);
        return null;
      }
    },

    // Safely query DOM elements with timeout
    waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        const observer = new MutationObserver((mutations, obs) => {
          const element = document.querySelector(selector);
          if (element) {
            obs.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
      });
    }
  };

  // String utilities
  const stringUtils = {
    sanitizeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    truncate(str, length = 50, suffix = '...') {
      if (str.length <= length) return str;
      return str.substring(0, length - suffix.length) + suffix;
    }
  };

  // Error handling utilities
  class ExtensionError extends Error {
    constructor(message, type = 'GENERAL_ERROR', originalError = null) {
      super(message);
      this.name = 'ExtensionError';
      this.type = type;
      this.originalError = originalError;
      this.timestamp = new Date().toISOString();
    }

    toString() {
      return `${this.name}[${this.type}]: ${this.message}`;
    }
  }

  // Public API
  return {
    // Expose logging utilities
    log: logger,

    // Expose date formatting utilities
    formatDateTime: dateUtils.formatDateTime,
    getRelativeTimeString: dateUtils.getRelativeTimeString,

    // Expose DOM utilities
    createElement: domUtils.createElement,
    waitForElement: domUtils.waitForElement,

    // Expose string utilities
    sanitizeHTML: stringUtils.sanitizeHTML,
    truncate: stringUtils.truncate,

    // Expose error class
    ExtensionError,

    // Configuration
    setLogLevel(level) {
      if (Object.values(LogLevel).includes(level)) {
        state.logLevel = level;
        logger.info(`Log level set to: ${level}`);
      } else {
        logger.error('Invalid log level provided');
      }
    },

    setDebugPrefix(prefix) {
      state.debugPrefix = prefix;
      logger.info(`Debug prefix set to: ${prefix}`);
    },

    // Constants
    LogLevel
  };
})();

// Backwards compatibility for existing debug function
window.debug = GitHubUtils.log.debug;