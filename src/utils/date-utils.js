/**
 * Date utility functions for GitHub Enhancer
 * Provides date formatting and relative time calculations
 */

const DateUtils = (() => {
  const { Logger } = window;
  const { ERROR_TYPES } = window.GITHUB_ENHANCER_CONSTANTS;

  /**
   * Custom error for date operations
   */
  class DateError extends Error {
    constructor(message, type = ERROR_TYPES.PARSING, originalError = null) {
      super(message);
      this.name = 'DateError';
      this.type = type;
      this.originalError = originalError;
    }
  }

  /**
   * Format date/time with locale support
   */
  const formatDateTime = (dateInput, locale = 'en-US', options = null) => {
    try {
      let date;
      
      if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
        date = new Date(dateInput);
      } else {
        throw new DateError('Invalid date input type');
      }

      if (isNaN(date.getTime())) {
        throw new DateError('Invalid date value');
      }

      const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };

      const formatOptions = options || defaultOptions;
      return date.toLocaleString(locale, formatOptions);
    } catch (error) {
      Logger.logError(error, { 
        context: 'Formatting date', 
        input: dateInput, 
        locale, 
        options 
      });
      return dateInput ? dateInput.toString() : 'Invalid Date';
    }
  };

  /**
   * Get relative time string using Intl.RelativeTimeFormat
   */
  const getRelativeTimeString = (dateInput, locale = 'en-US', options = {}) => {
    try {
      const date = new Date(dateInput);
      const now = new Date();
      
      if (isNaN(date.getTime())) {
        throw new DateError('Invalid date for relative time calculation');
      }

      const diffInSeconds = Math.floor((now - date) / 1000);
      const rtfOptions = { numeric: 'auto', ...options };
      const rtf = new Intl.RelativeTimeFormat(locale, rtfOptions);

      // Time intervals in seconds
      const intervals = [
        { unit: 'year', seconds: 31536000 },
        { unit: 'month', seconds: 2592000 },
        { unit: 'week', seconds: 604800 },
        { unit: 'day', seconds: 86400 },
        { unit: 'hour', seconds: 3600 },
        { unit: 'minute', seconds: 60 },
        { unit: 'second', seconds: 1 }
      ];

      for (const interval of intervals) {
        const count = Math.floor(diffInSeconds / interval.seconds);
        if (count >= 1 || interval.unit === 'second') {
          return rtf.format(-count, interval.unit);
        }
      }

      return rtf.format(0, 'second');
    } catch (error) {
      Logger.logError(error, { 
        context: 'Getting relative time string', 
        input: dateInput, 
        locale 
      });
      return 'some time ago';
    }
  };

  /**
   * Parse GitHub's datetime format
   */
  const parseGitHubDateTime = (dateTimeString) => {
    try {
      // GitHub typically uses ISO 8601 format
      const date = new Date(dateTimeString);
      
      if (isNaN(date.getTime())) {
        // Try alternative parsing methods
        const cleanedString = dateTimeString.replace(/[^\d\-T:\.Z]/g, '');
        const alternativeDate = new Date(cleanedString);
        
        if (isNaN(alternativeDate.getTime())) {
          throw new DateError(`Unable to parse GitHub datetime: ${dateTimeString}`);
        }
        
        return alternativeDate;
      }
      
      return date;
    } catch (error) {
      Logger.logError(error, { 
        context: 'Parsing GitHub datetime', 
        input: dateTimeString 
      });
      throw new DateError(`Failed to parse GitHub datetime: ${dateTimeString}`, ERROR_TYPES.PARSING, error);
    }
  };

  /**
   * Get time ago in human readable format (fallback for older browsers)
   */
  const getTimeAgo = (dateInput, options = {}) => {
    try {
      const date = new Date(dateInput);
      const now = new Date();
      
      if (isNaN(date.getTime())) {
        throw new DateError('Invalid date for time ago calculation');
      }

      const diffInSeconds = Math.floor((now - date) / 1000);
      const { short = false } = options;

      const intervals = [
        { name: 'year', seconds: 31536000, shortName: 'y' },
        { name: 'month', seconds: 2592000, shortName: 'mo' },
        { name: 'week', seconds: 604800, shortName: 'w' },
        { name: 'day', seconds: 86400, shortName: 'd' },
        { name: 'hour', seconds: 3600, shortName: 'h' },
        { name: 'minute', seconds: 60, shortName: 'm' },
        { name: 'second', seconds: 1, shortName: 's' }
      ];

      for (const interval of intervals) {
        const count = Math.floor(diffInSeconds / interval.seconds);
        if (count >= 1) {
          const unit = short ? interval.shortName : 
                       count === 1 ? interval.name : `${interval.name}s`;
          return short ? `${count}${unit}` : `${count} ${unit} ago`;
        }
      }

      return short ? '0s' : 'just now';
    } catch (error) {
      Logger.logError(error, { 
        context: 'Getting time ago', 
        input: dateInput 
      });
      return 'some time ago';
    }
  };

  /**
   * Check if date is today
   */
  const isToday = (dateInput) => {
    try {
      const date = new Date(dateInput);
      const today = new Date();
      
      return date.getDate() === today.getDate() &&
             date.getMonth() === today.getMonth() &&
             date.getFullYear() === today.getFullYear();
    } catch (error) {
      Logger.logError(error, { context: 'Checking if date is today', input: dateInput });
      return false;
    }
  };

  /**
   * Check if date is this week
   */
  const isThisWeek = (dateInput) => {
    try {
      const date = new Date(dateInput);
      const today = new Date();
      const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
      const weekEnd = new Date(today.setDate(weekStart.getDate() + 6));
      
      return date >= weekStart && date <= weekEnd;
    } catch (error) {
      Logger.logError(error, { context: 'Checking if date is this week', input: dateInput });
      return false;
    }
  };

  /**
   * Format date for different contexts
   */
  const contextualFormat = (dateInput, context = 'default', locale = 'en-US') => {
    try {
      const date = new Date(dateInput);
      
      if (isNaN(date.getTime())) {
        throw new DateError('Invalid date for contextual formatting');
      }

      const formats = {
        short: {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        },
        long: {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        },
        time: {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        },
        compact: {
          month: '2-digit',
          day: '2-digit',
          year: '2-digit'
        },
        iso: null // Special case for ISO string
      };

      if (context === 'iso') {
        return date.toISOString();
      }

      const options = formats[context] || formats.short;
      return date.toLocaleString(locale, options);
    } catch (error) {
      Logger.logError(error, { 
        context: 'Contextual date formatting', 
        input: dateInput, 
        formatContext: context 
      });
      return dateInput ? dateInput.toString() : 'Invalid Date';
    }
  };

  /**
   * Create enhanced datetime element
   */
  const createEnhancedDateElement = (originalDate, formattedDate, options = {}) => {
    try {
      const {
        showRelative = true,
        showTooltip = true,
        className = 'github-enhancer-date',
        updateInterval = null
      } = options;

      const container = window.DOMUtils.createElement('span', {
        classes: [className],
        attributes: {
          'data-original-date': originalDate,
          'data-enhanced': 'true'
        }
      });

      const mainDate = window.DOMUtils.createElement('span', {
        classes: ['enhanced-date-main'],
        textContent: formattedDate
      });

      container.appendChild(mainDate);

      if (showRelative) {
        const relativeDate = window.DOMUtils.createElement('span', {
          classes: ['enhanced-date-relative'],
          textContent: ` (${getRelativeTimeString(originalDate)})`
        });
        container.appendChild(relativeDate);

        // Auto-update relative time if interval is specified
        if (updateInterval && updateInterval > 0) {
          setInterval(() => {
            relativeDate.textContent = ` (${getRelativeTimeString(originalDate)})`;
          }, updateInterval);
        }
      }

      if (showTooltip) {
        container.title = contextualFormat(originalDate, 'long');
      }

      return container;
    } catch (error) {
      Logger.logError(error, { 
        context: 'Creating enhanced date element', 
        originalDate, 
        formattedDate 
      });
      return window.DOMUtils.createElement('span', { textContent: formattedDate });
    }
  };

  // Public API
  return {
    formatDateTime,
    getRelativeTimeString,
    parseGitHubDateTime,
    getTimeAgo,
    isToday,
    isThisWeek,
    contextualFormat,
    createEnhancedDateElement,
    DateError
  };
})();

// Global availability
window.DateUtils = DateUtils; 