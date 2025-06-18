/**
 * DOM utility functions for GitHub Enhancer
 * Provides safe DOM manipulation and element waiting functionality
 */

const DOMUtils = (() => {
  const { Logger } = window;
  const { ERROR_TYPES } = window.GITHUB_ENHANCER_CONSTANTS;

  /**
   * Custom error for DOM operations
   */
  class DOMError extends Error {
    constructor(message, type = ERROR_TYPES.DOM, originalError = null) {
      super(message);
      this.name = 'DOMError';
      this.type = type;
      this.originalError = originalError;
    }
  }

  /**
   * Safely create DOM elements with attributes and children
   */
  const createElement = (tag, options = {}) => {
    try {
      const element = document.createElement(tag);
      
      const {
        attributes = {},
        styles = {},
        classes = [],
        children = [],
        textContent = '',
        innerHTML = '',
        events = {}
      } = options;

      // Set attributes
      Object.entries(attributes).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          element.setAttribute(key, value);
        }
      });

      // Set styles
      Object.entries(styles).forEach(([property, value]) => {
        if (value !== null && value !== undefined) {
          element.style[property] = value;
        }
      });

      // Add classes
      if (classes.length > 0) {
        element.classList.add(...classes);
      }

      // Set content
      if (textContent) {
        element.textContent = textContent;
      } else if (innerHTML) {
        element.innerHTML = innerHTML;
      }

      // Append children
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
          element.appendChild(child);
        }
      });

      // Add event listeners
      Object.entries(events).forEach(([event, handler]) => {
        element.addEventListener(event, handler);
      });

      return element;
    } catch (error) {
      Logger.logError(error, { context: `Creating element: ${tag}` });
      throw new DOMError(`Failed to create element: ${tag}`, ERROR_TYPES.DOM, error);
    }
  };

  /**
   * Wait for an element to appear in the DOM
   */
  const waitForElement = (selector, options = {}) => {
    const {
      timeout = 5000,
      rootElement = document.body,
      checkInterval = 100
    } = options;

    return new Promise((resolve, reject) => {
      // Check if element already exists
      const existingElement = rootElement.querySelector(selector);
      if (existingElement) {
        resolve(existingElement);
        return;
      }

      let timeoutId;
      let intervalId;
      let observer;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (intervalId) clearInterval(intervalId);
        if (observer) observer.disconnect();
      };

      // Set up timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new DOMError(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);

      // Try MutationObserver first (more efficient)
      if (window.MutationObserver) {
        observer = new MutationObserver(() => {
          const element = rootElement.querySelector(selector);
          if (element) {
            cleanup();
            resolve(element);
          }
        });

        observer.observe(rootElement, {
          childList: true,
          subtree: true
        });
      } else {
        // Fallback to interval checking
        intervalId = setInterval(() => {
          const element = rootElement.querySelector(selector);
          if (element) {
            cleanup();
            resolve(element);
          }
        }, checkInterval);
      }
    });
  };

  /**
   * Wait for multiple elements
   */
  const waitForElements = (selectors, options = {}) => {
    const promises = selectors.map(selector => waitForElement(selector, options));
    return Promise.all(promises);
  };

  /**
   * Safely query elements with error handling
   */
  const safeQuery = (selector, rootElement = document) => {
    try {
      return rootElement.querySelector(selector);
    } catch (error) {
      Logger.logError(error, { context: `Querying selector: ${selector}` });
      return null;
    }
  };

  const safeQueryAll = (selector, rootElement = document) => {
    try {
      return Array.from(rootElement.querySelectorAll(selector));
    } catch (error) {
      Logger.logError(error, { context: `Querying all selector: ${selector}` });
      return [];
    }
  };

  /**
   * Check if element is visible
   */
  const isVisible = (element) => {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           element.offsetParent !== null;
  };

  /**
   * Get element position relative to viewport
   */
  const getElementPosition = (element) => {
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      inViewport: rect.top >= 0 && rect.left >= 0 && 
                  rect.bottom <= window.innerHeight && 
                  rect.right <= window.innerWidth
    };
  };

  /**
   * Debounced scroll handler
   */
  const createScrollHandler = (callback, delay = 100) => {
    let timeoutId;
    
    return () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(callback, delay);
    };
  };

  /**
   * Throttled function execution
   */
  const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  /**
   * Debounced function execution
   */
  const debounce = (func, wait, immediate = false) => {
    let timeout;
    return function(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func.apply(this, args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(this, args);
    };
  };

  /**
   * Insert CSS dynamically
   */
  const insertCSS = (css, id = null) => {
    try {
      const style = createElement('style', {
        attributes: id ? { id } : {},
        textContent: css
      });
      
      document.head.appendChild(style);
      return style;
    } catch (error) {
      Logger.logError(error, { context: 'Inserting CSS' });
      throw new DOMError('Failed to insert CSS', ERROR_TYPES.DOM, error);
    }
  };

  /**
   * Remove elements matching selector
   */
  const removeElements = (selector) => {
    const elements = safeQueryAll(selector);
    elements.forEach(element => {
      try {
        element.remove();
      } catch (error) {
        Logger.warn(`Failed to remove element: ${error.message}`);
      }
    });
    return elements.length;
  };

  /**
   * Animation utilities
   */
  const animate = {
    fadeIn(element, duration = 300) {
      return new Promise(resolve => {
        element.style.opacity = '0';
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        
        // Force reflow
        element.offsetHeight;
        
        element.style.opacity = '1';
        
        setTimeout(() => {
          element.style.transition = '';
          resolve();
        }, duration);
      });
    },

    fadeOut(element, duration = 300) {
      return new Promise(resolve => {
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
        
        setTimeout(() => {
          element.style.transition = '';
          resolve();
        }, duration);
      });
    },

    slideDown(element, duration = 300) {
      return new Promise(resolve => {
        const initialHeight = element.style.height;
        element.style.height = '0px';
        element.style.overflow = 'hidden';
        element.style.transition = `height ${duration}ms ease-in-out`;
        
        // Force reflow
        element.offsetHeight;
        
        element.style.height = element.scrollHeight + 'px';
        
        setTimeout(() => {
          element.style.height = initialHeight;
          element.style.overflow = '';
          element.style.transition = '';
          resolve();
        }, duration);
      });
    }
  };

  // Public API
  return {
    createElement,
    waitForElement,
    waitForElements,
    safeQuery,
    safeQueryAll,
    isVisible,
    getElementPosition,
    createScrollHandler,
    throttle,
    debounce,
    insertCSS,
    removeElements,
    animate,
    DOMError
  };
})();

// Global availability
window.DOMUtils = DOMUtils; 