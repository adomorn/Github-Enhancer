// GitHub File Size Enhancer Module
const GitHubFileSizeEnhancer = (function() {
    // Private state
    const state = {
      initialized: false,
      config: {
        warnSize: 1024 * 1024, // 1MB default
        errorSize: 5 * 1024 * 1024, // 5MB default
        updateInterval: 1000,
        enabled: true,
        apiRequestDelay: 50,
        batchSize: 10,
        maxAge: 5 * 60 * 1000, // 5 minutes
        maxRetries: 3,
        retryDelay: 1000
      },
      cache: new Map(),
      pendingUpdates: new Set(),
      observer: null,
      metrics: {
        apiCalls: 0,
        cacheHits: 0,
        errors: 0,
        startTime: Date.now()
      }
    };
  
    // Size formatting with binary prefixes
    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
      const i = Math.floor(Math.log2(bytes) / 10);
      const value = (bytes / Math.pow(1024, i)).toFixed(1);
      return `${value} ${units[i]}`;
    }
  
    // Size classification
    function getSizeClass(bytes) {
      if (bytes >= state.config.errorSize) return 'size-error';
      if (bytes >= state.config.warnSize) return 'size-warning';
      return 'size-normal';
    }
  
    // Cache management
    const cacheManager = {
      get(key) {
        const entry = state.cache.get(key);
        if (!entry) return null;
  
        if (Date.now() - entry.timestamp > state.config.maxAge) {
          state.cache.delete(key);
          state.metrics.cacheMisses++;
          return null;
        }
  
        state.metrics.cacheHits++;
        return entry.size;
      },
  
      set(key, size) {
        state.cache.set(key, {
          size,
          timestamp: Date.now()
        });
      },
  
      clear() {
        state.cache.clear();
        state.metrics.cacheHits = 0;
        state.metrics.cacheMisses = 0;
      }
    };
  
    // Repository information utilities
    const repoUtils = {
      getInfo() {
        try {
          const [, owner, repo] = window.location.pathname.split('/');
          return owner && repo ? { owner, repo } : null;
        } catch (error) {
          GitHubUtils.log.error('Failed to parse repository info:', error);
          return null;
        }
      },
  
      getCurrentBranch() {
        try {
          const branchElement = document.querySelector('[data-hotkey="w"] span');
          return branchElement?.textContent?.trim() || 'main';
        } catch (error) {
          GitHubUtils.log.error('Failed to get current branch:', error);
          return 'main';
        }
      },
  
      isValidPath(path) {
        return path && !path.includes('..') && !path.includes('//');
      }
    };
  
    // API request handling
    const apiHandler = {
      async fetchFileSize(path) {
        const repoInfo = repoUtils.getInfo();
        if (!repoInfo || !repoUtils.isValidPath(path)) return null;
  
        const cached = cacheManager.get(path);
        if (cached !== null) return cached;
  
        try {
          state.metrics.apiCalls++;
          
          const response = await GitHubUtils.withRetry(async () => {
            const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${path}?ref=${repoUtils.getCurrentBranch()}`;
            const result = await fetch(url, {
              headers: {
                'Accept': 'application/vnd.github.v3+json'
              }
            });
  
            if (!result.ok) {
              throw new Error(`HTTP error! status: ${result.status}`);
            }
  
            return result;
          }, {
            retries: state.config.maxRetries,
            delay: state.config.retryDelay
          });
  
          const data = await response.json();
          const size = data.size || 0;
          cacheManager.set(path, size);
          return size;
        } catch (error) {
          state.metrics.errors++;
          GitHubUtils.log.error(`Failed to fetch size for ${path}:`, error);
          return null;
        }
      },
  
      async fetchDirectorySize(path) {
        const repoInfo = repoUtils.getInfo();
        if (!repoInfo || !repoUtils.isValidPath(path)) return null;
  
        const cached = cacheManager.get(`dir:${path}`);
        if (cached !== null) return cached;
  
        try {
          state.metrics.apiCalls++;
          
          const response = await GitHubUtils.withRetry(async () => {
            const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${path}?ref=${repoUtils.getCurrentBranch()}`;
            const result = await fetch(url, {
              headers: {
                'Accept': 'application/vnd.github.v3+json'
              }
            });
  
            if (!result.ok) {
              throw new Error(`HTTP error! status: ${result.status}`);
            }
  
            return result;
          }, {
            retries: state.config.maxRetries,
            delay: state.config.retryDelay
          });
  
          const contents = await response.json();
          const totalSize = contents.reduce((sum, item) => 
            sum + (item.type === 'file' ? (item.size || 0) : 0), 0
          );
  
          cacheManager.set(`dir:${path}`, totalSize);
          return totalSize;
        } catch (error) {
          state.metrics.errors++;
          GitHubUtils.log.error(`Failed to fetch directory size for ${path}:`, error);
          return null;
        }
      }
    };
  
    // UI enhancement
    const uiHandler = {
      createSizeIndicator(size, additionalClasses = '') {
        const sizeClass = getSizeClass(size);
        const indicator = GitHubUtils.createElement('span', {
          className: `file-size-indicator ${sizeClass} ${additionalClasses}`,
          title: this.getTooltipText(size)
        }, [formatSize(size)]);
  
        return indicator;
      },
  
      getTooltipText(size) {
        return [
          `Size: ${formatSize(size)}`,
          `Warning threshold: ${formatSize(state.config.warnSize)}`,
          `Error threshold: ${formatSize(state.config.errorSize)}`
        ].join('\n');
      },
  
      async enhanceFileRow(row) {
        if (!row || row.dataset.sizeEnhanced === 'true') return;
  
        const fileNameCell = row.querySelector('.react-directory-row-name-cell-small-screen');
        const fileNameColumn = fileNameCell?.querySelector('.react-directory-filename-column');
        if (!fileNameColumn) return;
  
        try {
          const rowId = row.id || '';
          const path = rowId.replace('folder-row-', '');
          const isDirectory = row.querySelector('.icon-directory') !== null;
  
          const size = isDirectory 
            ? await apiHandler.fetchDirectorySize(path)
            : await apiHandler.fetchFileSize(path);
  
          if (size !== null) {
            const indicator = this.createSizeIndicator(
              size,
              isDirectory ? 'directory-size' : ''
            );
            
            const existingIndicator = fileNameColumn.querySelector('.file-size-indicator');
            if (existingIndicator) {
              existingIndicator.replaceWith(indicator);
            } else {
              fileNameColumn.insertBefore(indicator, fileNameColumn.firstChild);
            }
          }
  
          row.dataset.sizeEnhanced = 'true';
        } catch (error) {
          GitHubUtils.log.error(`Failed to enhance row:`, error);
        }
      }
    };
  
    // Queue for processing enhancements
    const queue = {
      items: [],
      processing: false,
  
      add(row) {
        this.items.push(row);
        this.process();
      },
  
      async process() {
        if (this.processing || this.items.length === 0) return;
  
        this.processing = true;
        try {
          while (this.items.length > 0) {
            const batch = this.items.splice(0, state.config.batchSize);
            await Promise.all(batch.map(row => uiHandler.enhanceFileRow(row)));
            await new Promise(resolve => setTimeout(resolve, state.config.apiRequestDelay));
          }
        } finally {
          this.processing = false;
        }
      }
    };
  
    // Main enhancement function
    async function enhance() {
      if (!state.config.enabled || !state.initialized) return;
  
      const fileRows = document.querySelectorAll('tr.react-directory-row:not([data-size-enhanced="true"])');
      if (fileRows.length === 0) return;
  
      Array.from(fileRows).forEach(row => {
        if (!state.pendingUpdates.has(row)) {
          state.pendingUpdates.add(row);
          queue.add(row);
        }
      });
    }
  
    // Mutation observer setup
    function setupObserver() {
      if (state.observer) {
        state.observer.disconnect();
      }
  
      const debouncedEnhance = GitHubUtils.debounce(enhance, 250);
  
      state.observer = new MutationObserver((mutations) => {
        const shouldEnhance = mutations.some(mutation => 
          Array.from(mutation.addedNodes).some(node => 
            node.nodeType === 1 && (
              node.matches?.('.react-directory-row') || 
              node.querySelector?.('.react-directory-row')
            )
          )
        );
  
        if (shouldEnhance) {
          debouncedEnhance();
        }
      });
  
      state.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  
    // Settings handling
    function handleSettingsChanged(settings) {
      if (settings.fileSizeConfig) {
        Object.assign(state.config, {
          enabled: settings.fileSizeConfig.enabled,
          warnSize: settings.fileSizeConfig.warnSize,
          errorSize: settings.fileSizeConfig.errorSize
        });
  
        if (state.config.enabled) {
          cacheManager.clear();
          enhance();
        }
      }
    }
  
    // Initialize
    async function initialize() {
      if (state.initialized) return;
  
      try {
        // Load settings
        if (window.GithubExtensionSettings) {
          const settings = await window.GithubExtensionSettings.loadSettings();
          handleSettingsChanged(settings);
          window.GithubExtensionSettings.onSettingsChanged(handleSettingsChanged);
        }
  
        // Setup observer
        setupObserver();
  
        // Initial enhancement
        await enhance();
  
        state.initialized = true;
        GitHubUtils.log.info('File Size Enhancer initialized with config:', state.config);
      } catch (error) {
        GitHubUtils.log.error('Failed to initialize File Size Enhancer:', error);
      }
    }
  
    // Cleanup
    function cleanup() {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      cacheManager.clear();
      state.pendingUpdates.clear();
      queue.items = [];
      state.initialized = false;
    }
  
    // Public API
    const api = {
      initialize,
      cleanup,
      enhance,
      
      clearCache() {
        cacheManager.clear();
      },
  
      getMetrics() {
        return {
          ...state.metrics,
          runningTime: Date.now() - state.metrics.startTime,
          cacheSize: state.cache.size,
          queueLength: queue.items.length,
          pendingUpdates: state.pendingUpdates.size
        };
      },
  
      getState() {
        return {
          initialized: state.initialized,
          config: { ...state.config },
          metrics: this.getMetrics()
        };
      }
    };
  
    // Export to window
    window.GitHubFileSizeEnhancer = api;
  
    return api;
  })();
  
  // Initialize when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GitHubFileSizeEnhancer.initialize());
  } else {
    GitHubFileSizeEnhancer.initialize();
  }
  
  // Cleanup on unload
  window.addEventListener('unload', () => GitHubFileSizeEnhancer.cleanup());