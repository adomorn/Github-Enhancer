/**
 * Constants and configuration for GitHub Enhancer
 */

// Extension configuration
const EXTENSION_CONFIG = {
  NAME: 'GitHub Enhancer',
  VERSION: '2.0.0',
  DEBUG_PREFIX: '[GitHub Enhancer]',
  PERFORMANCE_METRICS_ENABLED: true
};

// API Configuration
const API_CONFIG = {
  GITHUB_API_BASE: 'https://api.github.com',
  RATE_LIMIT_THRESHOLD: 10,
  REQUEST_TIMEOUT: 5000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};

// UI Configuration
const UI_CONFIG = {
  CARD_MIN_WIDTH: 200,
  CARD_MAX_WIDTH: 400,
  CARD_DEFAULT_WIDTH: 250,
  MAX_CARDS_MIN: 5,
  MAX_CARDS_MAX: 50,
  MAX_CARDS_DEFAULT: 10,
  ANIMATION_DURATION: 300,
  DEBOUNCE_DELAY: 250
};

// Storage Keys
const STORAGE_KEYS = {
  SETTINGS: 'github_enhancer_settings',
  AUTH_TOKEN: 'github_auth_token',
  CACHE_PREFIX: 'github_enhancer_cache_',
  USER_PREFERENCES: 'github_enhancer_preferences'
};

// Log Levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Default Settings
const DEFAULT_SETTINGS = {
  enhanceContributors: true,
  enhanceDateTimes: true,
  enhanceFileSizes: true,
  enableThemeEnhancements: true,
  showCommitInfo: true,
  showTeamInfo: true,
  showOrgInfo: true,
  cardWidth: UI_CONFIG.CARD_DEFAULT_WIDTH,
  maxCards: UI_CONFIG.MAX_CARDS_DEFAULT,
  locale: 'en-US',
  theme: 'auto', // 'light', 'dark', 'auto'
  animationsEnabled: true,
  debugMode: false
};

// DOM Selectors
const SELECTORS = {
  CONTRIBUTORS_SECTION: '.BorderGrid-row',
  RELATIVE_TIME: 'relative-time',
  FILE_ROWS: 'tr.react-directory-row',
  REPOSITORY_CONTENT: '.repository-content',
  COMMIT_INFO: '.commit-info',
  BRANCH_SELECTOR: '[data-hotkey="w"] span'
};

// Error Types
const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  AUTHENTICATION: 'AUTH_ERROR',
  PARSING: 'PARSING_ERROR',
  DOM: 'DOM_ERROR',
  STORAGE: 'STORAGE_ERROR',
  GENERAL: 'GENERAL_ERROR'
};

// Event Types
const EVENT_TYPES = {
  SETTINGS_CHANGED: 'github_enhancer_settings_changed',
  ENHANCEMENT_COMPLETE: 'github_enhancer_enhancement_complete',
  ERROR_OCCURRED: 'github_enhancer_error_occurred'
};

// Cache Settings
const CACHE_CONFIG = {
  DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
  MAX_ENTRIES: 100,
  CLEANUP_INTERVAL: 10 * 60 * 1000 // 10 minutes
};

// Export all constants
window.GITHUB_ENHANCER_CONSTANTS = {
  EXTENSION_CONFIG,
  API_CONFIG,
  UI_CONFIG,
  STORAGE_KEYS,
  LOG_LEVELS,
  DEFAULT_SETTINGS,
  SELECTORS,
  ERROR_TYPES,
  EVENT_TYPES,
  CACHE_CONFIG
}; 