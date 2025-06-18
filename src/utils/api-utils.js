/**
 * API utility functions for GitHub Enhancer
 * Handles GitHub API requests with rate limiting and error handling
 */

const APIUtils = (() => {
  const Logger = window.Logger || console;
  const Storage = window.Storage;
  
  // Define constants locally
  const API_CONFIG = {
    GITHUB_API_BASE: 'https://api.github.com',
    REQUEST_TIMEOUT: 10000,
    RETRY_ATTEMPTS: 2,
    RETRY_DELAY: 1000,
    RATE_LIMIT_THRESHOLD: 5
  };
  
  const ERROR_TYPES = {
    NETWORK: 'NETWORK_ERROR',
    RATE_LIMIT: 'RATE_LIMIT_ERROR',
    AUTHENTICATION: 'AUTH_ERROR'
  };
  
  const STORAGE_KEYS = {
    AUTH_TOKEN: 'github_enhancer_auth_token'
  };

  /**
   * Custom error for API operations
   */
  class APIError extends Error {
    constructor(message, type = ERROR_TYPES.NETWORK, statusCode = null, originalError = null) {
      super(message);
      this.name = 'APIError';
      this.type = type;
      this.statusCode = statusCode;
      this.originalError = originalError;
    }
  }

  /**
   * Rate limiting state
   */
  const rateLimitState = {
    remaining: 60,
    reset: 0,
    limit: 60,
    isLimited: false
  };

  /**
   * Request queue for rate limiting
   */
  const requestQueue = {
    items: [],
    processing: false,

    add(requestFn) {
      return new Promise((resolve, reject) => {
        this.items.push({ requestFn, resolve, reject });
        this.process();
      });
    },

    async process() {
      if (this.processing || this.items.length === 0) {
        return;
      }

      this.processing = true;

      while (this.items.length > 0) {
        if (rateLimitState.isLimited) {
          const waitTime = rateLimitState.reset - Date.now();
          if (waitTime > 0) {
            Logger.warn(`Rate limited, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          rateLimitState.isLimited = false;
        }

        const { requestFn, resolve, reject } = this.items.shift();
        
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.processing = false;
    }
  };

  /**
   * Update rate limit state from response headers
   */
  const updateRateLimit = (response) => {
    try {
      const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '60');
      const reset = parseInt(response.headers.get('X-RateLimit-Reset') || '0') * 1000;
      const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '60');

      rateLimitState.remaining = remaining;
      rateLimitState.reset = reset;
      rateLimitState.limit = limit;
      rateLimitState.isLimited = remaining <= API_CONFIG.RATE_LIMIT_THRESHOLD;

      Logger.debug(`Rate limit updated: ${remaining}/${limit}, resets at ${new Date(reset)}`);
    } catch (error) {
      Logger.warn('Failed to parse rate limit headers:', error);
    }
  };

  /**
   * Get authentication headers
   */
  const getAuthHeaders = async () => {
    try {
      const token = await Storage.get(STORAGE_KEYS.AUTH_TOKEN);
      if (token) {
        return { 'Authorization': `token ${token}` };
      }
    } catch (error) {
      Logger.warn('Failed to get auth token:', error);
    }
    return {};
  };

  /**
   * Make HTTP request with retry logic
   */
  const makeRequest = async (url, options = {}) => {
    const {
      method = 'GET',
      headers = {},
      body = null,
      timeout = API_CONFIG.REQUEST_TIMEOUT,
      retries = API_CONFIG.RETRY_ATTEMPTS
    } = options;

    const authHeaders = await getAuthHeaders();
    const requestHeaders = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitHub-Enhancer-Extension',
      ...authHeaders,
      ...headers
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        updateRateLimit(response);

        if (!response.ok) {
          if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
            rateLimitState.isLimited = true;
            throw new APIError(
              'Rate limit exceeded',
              ERROR_TYPES.RATE_LIMIT,
              response.status
            );
          }

          if (response.status === 401) {
            throw new APIError(
              'Authentication required',
              ERROR_TYPES.AUTHENTICATION,
              response.status
            );
          }

          throw new APIError(
            `HTTP ${response.status}: ${response.statusText}`,
            ERROR_TYPES.NETWORK,
            response.status
          );
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          throw new APIError('Request timeout', ERROR_TYPES.NETWORK, null, error);
        }

        if (error instanceof APIError) {
          throw error;
        }

        if (attempt < retries) {
          const delay = API_CONFIG.RETRY_DELAY * Math.pow(2, attempt);
          Logger.debug(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    clearTimeout(timeoutId);
    throw new APIError(
      `Request failed after ${retries + 1} attempts`,
      ERROR_TYPES.NETWORK,
      null,
      lastError
    );
  };

  /**
   * GitHub API request wrapper
   */
  const githubRequest = async (endpoint, options = {}) => {
    const url = endpoint.startsWith('http') ? endpoint : `${API_CONFIG.GITHUB_API_BASE}${endpoint}`;
    
    return requestQueue.add(async () => {
      Logger.debug(`Making GitHub API request: ${url}`);
      const response = await makeRequest(url, options);
      return response.json();
    });
  };

  /**
   * Get repository information from current URL
   */
  const getRepoInfo = () => {
    try {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      
      if (pathParts.length >= 2) {
        return {
          owner: pathParts[0],
          repo: pathParts[1],
          path: pathParts.slice(2).join('/'),
          branch: getBranchFromURL()
        };
      }
      
      throw new Error('Unable to parse repository information from URL');
    } catch (error) {
      Logger.logError(error, { context: 'Getting repo info', url: window.location.href });
      return null;
    }
  };

  /**
   * Get current branch from DOM or URL
   */
  const getBranchFromURL = () => {
    try {
      // Try to get from branch selector
      const branchElement = document.querySelector('[data-hotkey="w"] span');
      if (branchElement) {
        return branchElement.textContent.trim();
      }

      // Fallback to URL parsing
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('ref') || 'main';
    } catch (error) {
      Logger.warn('Failed to get branch, using default:', error);
      return 'main';
    }
  };

  /**
   * Cached API requests
   */
  const cachedRequest = async (cacheKey, requestFn, ttl = null) => {
    try {
      // Try to get from cache
      const cached = await Storage.cache.get(cacheKey);
      if (cached) {
        Logger.debug(`Cache hit for: ${cacheKey}`);
        return cached;
      }

      // Make request and cache result
      Logger.debug(`Cache miss for: ${cacheKey}, making request`);
      const result = await requestFn();
      
      await Storage.cache.set(cacheKey, result, ttl);
      return result;
    } catch (error) {
      Logger.logError(error, { context: 'Cached request', cacheKey });
      throw error;
    }
  };

  /**
   * Specific GitHub API methods
   */
  const github = {
    async getUser(username) {
      return githubRequest(`/users/${username}`);
    },

    async getUserRepos(username, page = 1, perPage = 30) {
      return githubRequest(`/users/${username}/repos?page=${page}&per_page=${perPage}&sort=updated`);
    },

    async getRepo(owner, repo) {
      return githubRequest(`/repos/${owner}/${repo}`);
    },

    async getRepoContributors(owner, repo, page = 1, perPage = 30) {
      return githubRequest(`/repos/${owner}/${repo}/contributors?page=${page}&per_page=${perPage}`);
    },

    async getRepoContents(owner, repo, path = '', ref = 'main') {
      const endpoint = `/repos/${owner}/${repo}/contents/${path}`;
      const params = ref !== 'main' ? `?ref=${ref}` : '';
      return githubRequest(`${endpoint}${params}`);
    },

    async getCommit(owner, repo, sha) {
      return githubRequest(`/repos/${owner}/${repo}/commits/${sha}`);
    },

    async getUserOrgs(username) {
      return githubRequest(`/users/${username}/orgs`);
    },

    async getRepoStats(owner, repo) {
      return githubRequest(`/repos/${owner}/${repo}/stats/contributors`);
    }
  };

  // Public API
  return {
    makeRequest,
    githubRequest,
    cachedRequest,
    getRepoInfo,
    getBranchFromURL,
    github,
    getRateLimit: () => ({ ...rateLimitState }),
    APIError,

    // Utility methods
    async clearCache() {
      // Clear all API-related cache entries
      Logger.info('Clearing API cache');
      // This would need to be implemented based on your cache structure
    },

    async testConnection() {
      try {
        await githubRequest('/rate_limit');
        return true;
      } catch (error) {
        Logger.logError(error, { context: 'Testing API connection' });
        return false;
      }
    }
  };
})();

// Global availability
window.APIUtils = APIUtils; 