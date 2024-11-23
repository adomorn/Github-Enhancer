// GitHub Authentication Handler Module
const GitHubAuthHandler = (function() {
    // Private state
    const state = {
      token: null,
      initialized: false,
      rateLimits: {
        remaining: null,
        reset: null,
        limit: null
      },
      tokenValidationInterval: 1000 * 60 * 30, // 30 minutes
      validationTimer: null,
      apiBaseUrl: 'https://api.github.com'
    };
  
    // Token encryption/decryption utilities
    const tokenCrypto = {
      async encrypt(token) {
        try {
          // Simple obfuscation - in real world, use more secure methods
          return btoa(token.split('').reverse().join(''));
        } catch (error) {
          throw new GitHubUtils.ExtensionError('Token encryption failed', 'ENCRYPTION_ERROR', error);
        }
      },
  
      async decrypt(encryptedToken) {
        try {
          return atob(encryptedToken).split('').reverse().join('');
        } catch (error) {
          throw new GitHubUtils.ExtensionError('Token decryption failed', 'DECRYPTION_ERROR', error);
        }
      }
    };
  
    // Token validation and storage
    const tokenManager = {
      async validateToken(token) {
        try {
          const response = await fetch(`${state.apiBaseUrl}/user`, {
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
  
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
  
          const rateLimit = {
            remaining: response.headers.get('x-ratelimit-remaining'),
            reset: response.headers.get('x-ratelimit-reset'),
            limit: response.headers.get('x-ratelimit-limit')
          };
  
          updateRateLimits(rateLimit);
  
          const data = await response.json();
          return {
            valid: true,
            username: data.login,
            scopes: response.headers.get('x-oauth-scopes')?.split(', ') || []
          };
        } catch (error) {
          return { valid: false, error: error.message };
        }
      },
  
      async save(token) {
        try {
          const encryptedToken = await tokenCrypto.encrypt(token);
          await chrome.storage.sync.set({ githubToken: encryptedToken });
          state.token = token;
          startTokenValidationTimer();
          GitHubUtils.log.info('Token saved successfully');
          return true;
        } catch (error) {
          GitHubUtils.log.error('Failed to save token:', error);
          throw new GitHubUtils.ExtensionError('Failed to save token', 'STORAGE_ERROR', error);
        }
      },
  
      async load() {
        try {
          const result = await chrome.storage.sync.get(['githubToken']);
          if (result.githubToken) {
            const token = await tokenCrypto.decrypt(result.githubToken);
            const validation = await this.validateToken(token);
            
            if (validation.valid) {
              state.token = token;
              startTokenValidationTimer();
              GitHubUtils.log.info('Token loaded and validated successfully');
              return token;
            } else {
              await this.clear();
              throw new Error('Invalid token');
            }
          }
          return null;
        } catch (error) {
          GitHubUtils.log.error('Failed to load token:', error);
          throw new GitHubUtils.ExtensionError('Failed to load token', 'LOAD_ERROR', error);
        }
      },
  
      async clear() {
        try {
          await chrome.storage.sync.remove('githubToken');
          state.token = null;
          stopTokenValidationTimer();
          GitHubUtils.log.info('Token cleared successfully');
        } catch (error) {
          GitHubUtils.log.error('Failed to clear token:', error);
          throw new GitHubUtils.ExtensionError('Failed to clear token', 'CLEAR_ERROR', error);
        }
      }
    };
  
    // Rate limit handling
    function updateRateLimits(limits) {
      state.rateLimits = {
        remaining: parseInt(limits.remaining),
        reset: parseInt(limits.reset) * 1000, // Convert to milliseconds
        limit: parseInt(limits.limit)
      };
    }
  
    function checkRateLimit() {
      if (state.rateLimits.remaining === 0) {
        const resetTime = new Date(state.rateLimits.reset);
        const waitTime = state.rateLimits.reset - Date.now();
        
        if (waitTime > 0) {
          throw new GitHubUtils.ExtensionError(
            `Rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`,
            'RATE_LIMIT_ERROR'
          );
        }
      }
    }
  
    // Token validation timer
    function startTokenValidationTimer() {
      stopTokenValidationTimer();
      state.validationTimer = setInterval(async () => {
        if (state.token) {
          const validation = await tokenManager.validateToken(state.token);
          if (!validation.valid) {
            await tokenManager.clear();
            GitHubUtils.log.warn('Token validation failed during periodic check');
          }
        }
      }, state.tokenValidationInterval);
    }
  
    function stopTokenValidationTimer() {
      if (state.validationTimer) {
        clearInterval(state.validationTimer);
        state.validationTimer = null;
      }
    }
  
    // API request helper with retries and rate limit handling
    async function fetchWithAuth(url, options = {}) {
      if (!state.token) {
        throw new GitHubUtils.ExtensionError('No GitHub token found', 'NO_TOKEN_ERROR');
      }
  
      checkRateLimit();
  
      const fetchOptions = {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `token ${state.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Extension'
        }
      };
  
      return await GitHubUtils.withRetry(async () => {
        const response = await fetch(url, fetchOptions);
        
        // Update rate limits on each request
        updateRateLimits({
          remaining: response.headers.get('x-ratelimit-remaining'),
          reset: response.headers.get('x-ratelimit-reset'),
          limit: response.headers.get('x-ratelimit-limit')
        });
  
        if (response.status === 401) {
          await tokenManager.clear();
          throw new GitHubUtils.ExtensionError('Invalid GitHub token', 'INVALID_TOKEN_ERROR');
        }
  
        if (!response.ok) {
          throw new GitHubUtils.ExtensionError(
            `GitHub API error: ${response.status}`,
            'API_ERROR'
          );
        }
  
        return response;
      }, {
        retries: 3,
        onRetry: (error, attempt) => {
          GitHubUtils.log.warn(`Retry attempt ${attempt + 1} due to:`, error);
        }
      });
    }
  
    // Initialization
    async function initialize() {
      if (state.initialized) return;
  
      try {
        await tokenManager.load();
        state.initialized = true;
        GitHubUtils.log.info('Auth handler initialized successfully');
      } catch (error) {
        GitHubUtils.log.error('Failed to initialize auth handler:', error);
        throw new GitHubUtils.ExtensionError('Auth initialization failed', 'INIT_ERROR', error);
      }
    }
  
    // Cleanup
    function cleanup() {
      stopTokenValidationTimer();
      state.initialized = false;
      state.token = null;
      GitHubUtils.log.info('Auth handler cleaned up');
    }
  
    // Public API
    return {
      initialize,
      cleanup,
      fetchWithAuth,
      
      async setToken(token) {
        const validation = await tokenManager.validateToken(token);
        if (!validation.valid) {
          throw new GitHubUtils.ExtensionError('Invalid token provided', 'INVALID_TOKEN_ERROR');
        }
        return tokenManager.save(token);
      },
  
      async clearToken() {
        return tokenManager.clear();
      },
  
      isAuthenticated() {
        return !!state.token;
      },
  
      async validateToken() {
        if (!state.token) return false;
        const validation = await tokenManager.validateToken(state.token);
        return validation.valid;
      },
  
      getRateLimitInfo() {
        return { ...state.rateLimits };
      },
  
      getState() {
        return {
          initialized: state.initialized,
          hasToken: !!state.token,
          rateLimits: { ...state.rateLimits }
        };
      }
    };
  })();
  
  // Initialize when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GitHubAuthHandler.initialize());
  } else {
    GitHubAuthHandler.initialize();
  }
  
  // Cleanup on unload
  window.addEventListener('unload', () => GitHubAuthHandler.cleanup());