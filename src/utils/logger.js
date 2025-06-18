/**
 * Ultra-simple Logger for GitHub Enhancer Chrome Extension
 */

const Logger = (() => {
  const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  };

  const PREFIX = '[GitHub Enhancer]';
  let currentLogLevel = LOG_LEVELS.INFO;

  const shouldLog = (level) => currentLogLevel >= level;

  const formatMessage = (level, message) => {
    const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const levelName = levelNames[level] || 'LOG';
    return `${PREFIX} [${levelName}] ${message}`;
  };

  const safeLog = (level, message) => {
    if (!shouldLog(level)) return;

    const formattedMessage = formatMessage(level, message);
    
    try {
      switch (level) {
        case LOG_LEVELS.ERROR:
          console.error(formattedMessage);
          break;
        case LOG_LEVELS.WARN:
          console.warn(formattedMessage);
          break;
        case LOG_LEVELS.INFO:
          console.info(formattedMessage);
          break;
        case LOG_LEVELS.DEBUG:
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    } catch (e) {
      // Ultimate fallback
      try {
        console.log(formattedMessage);
      } catch (e2) {
        // If even console.log fails, do nothing
      }
    }
  };

  const logError = (error, context = {}) => {
    const errorMessage = error?.message || String(error) || 'Unknown error';
    const contextStr = context?.context || 'Unknown context';
    
    safeLog(LOG_LEVELS.ERROR, `${contextStr}: ${errorMessage}`);
    
    // Send to background script
    try {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'LOG_ERROR',
          payload: {
            message: errorMessage,
            context: contextStr,
            timestamp: Date.now()
          }
        }).catch(() => {
          // Ignore if background script is not available
        });
      }
    } catch (e) {
      // Ignore chrome runtime errors
    }
  };

  // Public API - simplified to only accept strings
  return {
    error: (message) => safeLog(LOG_LEVELS.ERROR, String(message)),
    warn: (message) => safeLog(LOG_LEVELS.WARN, String(message)),
    info: (message) => safeLog(LOG_LEVELS.INFO, String(message)),
    debug: (message) => safeLog(LOG_LEVELS.DEBUG, String(message)),
    
    logError,
    
    setLogLevel(level) {
      if (Object.values(LOG_LEVELS).includes(level)) {
        currentLogLevel = level;
        this.info(`Log level set to: ${level}`);
      }
    },
    
    getLogLevel() {
      return currentLogLevel;
    },
    
    LOG_LEVELS,
    
    // Simplified stubs
    performance: {
      start: () => {},
      end: () => {},
      measure: (label, fn) => fn()
    },
    
    group: (label, fn) => fn()
  };
})();

// Make available globally
window.Logger = Logger; 