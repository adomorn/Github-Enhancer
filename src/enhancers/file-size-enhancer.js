/**
 * File Size Enhancer for GitHub Enhancer
 * Displays file sizes in repository file listings
 */

const FileSizeEnhancer = (() => {
  const { BaseEnhancer } = window;
  const { Logger, DOMUtils, APIUtils, Storage } = window;
  const { SELECTORS } = window.GITHUB_ENHANCER_CONSTANTS;

  class FileSizeEnhancerClass extends BaseEnhancer {
    constructor(name = 'FileSizeEnhancer') {
      super(name, {
        debounceDelay: 200,
        batchSize: 10
      });
      
      this.sizeCache = new Map();
      this.processingQueue = new Set();
    }

    /**
     * Setup file size enhancer
     */
    async setup() {
      Logger.debug(`Setting up ${this.name}`);
      
      // Add custom CSS for file size indicators
      this.insertFileSizeStyles();
    }

    /**
     * Check if should enhance based on mutations
     */
    shouldEnhance(mutations) {
      // Only enhance on repository and file browser pages
      const path = window.location.pathname;
      if (!path.match(/^\/[^\/]+\/[^\/]+/) || path.includes('/issues') || path.includes('/pull')) {
        return false;
      }

      return mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        
        // Check if file rows were added
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches(SELECTORS.FILE_ROWS)) return true;
            if (node.querySelector && node.querySelector(SELECTORS.FILE_ROWS)) return true;
          }
        }
        return false;
      });
    }

    /**
     * Main enhancement method
     */
    async enhance() {
      try {
        this.startPerformanceTimer('fileSizeEnhancement');
        
        // Find file rows that haven't been enhanced
        const fileRows = DOMUtils.safeQueryAll(SELECTORS.FILE_ROWS)
          .filter(row => !BaseEnhancer.isElementEnhanced(row, this.name));

        if (fileRows.length === 0) {
          Logger.debug('No new file rows found');
          return;
        }

        Logger.debug(`Found ${fileRows.length} file rows to enhance`);

        // Get repository information
        const repoInfo = APIUtils.getRepoInfo();
        if (!repoInfo) {
          Logger.warn('Could not get repository information');
          return;
        }

        // Process file rows in batches
        await this.processBatch(fileRows, (row) => this.enhanceFileRow(row, repoInfo));

        Logger.debug(`Enhanced ${fileRows.length} file rows with size information`);
        
        this.endPerformanceTimer('fileSizeEnhancement');
        
        // Dispatch completion event
        this.dispatchEvent(window.GITHUB_ENHANCER_CONSTANTS.EVENT_TYPES.ENHANCEMENT_COMPLETE, {
          action: 'file_size_enhancement',
          count: fileRows.length
        });

      } catch (error) {
        this.handleError(error, 'File size enhancement');
      }
    }

    /**
     * Enhance a single file row with size information
     */
    async enhanceFileRow(row, repoInfo) {
      try {
        // Skip if already enhanced
        if (BaseEnhancer.isElementEnhanced(row, this.name)) {
          return;
        }

        // Extract file information from the row
        const fileInfo = this.extractFileInfo(row);
        if (!fileInfo) {
          Logger.debug('Could not extract file info from row');
          return;
        }

        // Skip if already processing
        const cacheKey = `${repoInfo.owner}/${repoInfo.repo}/${fileInfo.path}`;
        if (this.processingQueue.has(cacheKey)) {
          return;
        }

        this.processingQueue.add(cacheKey);

        try {
          // Get file size
          const size = await this.getFileSize(repoInfo, fileInfo);
          
          if (size !== null) {
            // Create and insert size indicator
            const sizeIndicator = this.createSizeIndicator(size, fileInfo.isDirectory);
            this.insertSizeIndicator(row, sizeIndicator, fileInfo);
            
            // Mark as enhanced
            BaseEnhancer.markElementEnhanced(row, this.name);
            
            Logger.debug(`Enhanced file row: ${fileInfo.path} (${this.formatFileSize(size)})`);
          }
        } finally {
          this.processingQueue.delete(cacheKey);
        }

      } catch (error) {
        Logger.logError(error, { 
          context: `Enhancing file row`, 
          row: row.outerHTML.substring(0, 200) 
        });
      }
    }

    /**
     * Extract file information from a file row
     */
    extractFileInfo(row) {
      try {
        // Try to find the file name element
        const fileNameElement = row.querySelector('.react-directory-filename-column a, [data-testid="file-name-link"]');
        if (!fileNameElement) {
          return null;
        }

        const fileName = fileNameElement.textContent.trim();
        const href = fileNameElement.getAttribute('href') || '';
        
        // Determine if it's a directory
        const isDirectory = row.querySelector('.icon-directory, [data-testid="directory-icon"]') !== null;
        
        // Extract path from href
        let path = '';
        const pathMatch = href.match(/\/blob\/[^\/]+\/(.+)$/) || href.match(/\/tree\/[^\/]+\/(.+)$/);
        if (pathMatch) {
          path = pathMatch[1];
        } else {
          path = fileName;
        }

        return {
          name: fileName,
          path: path,
          isDirectory: isDirectory,
          href: href
        };

      } catch (error) {
        Logger.logError(error, { context: 'Extracting file info' });
        return null;
      }
    }

    /**
     * Get file size from GitHub API
     */
    async getFileSize(repoInfo, fileInfo) {
      try {
        const cacheKey = `size_${repoInfo.owner}_${repoInfo.repo}_${fileInfo.path}`;
        
        // Try cache first
        const cached = await Storage.cache.get(cacheKey);
        if (cached !== null) {
          return cached;
        }

        let size;
        
        if (fileInfo.isDirectory) {
          // For directories, calculate total size of contents
          size = await this.getDirectorySize(repoInfo, fileInfo.path);
        } else {
          // For files, get individual file size
          size = await this.getIndividualFileSize(repoInfo, fileInfo.path);
        }

        // Cache the result
        if (size !== null) {
          await Storage.cache.set(cacheKey, size, 15 * 60 * 1000); // 15 minutes
        }

        return size;

      } catch (error) {
        Logger.logError(error, { context: `Getting file size for ${fileInfo.path}` });
        return null;
      }
    }

    /**
     * Get individual file size
     */
    async getIndividualFileSize(repoInfo, filePath) {
      try {
        const fileData = await APIUtils.github.getRepoContents(
          repoInfo.owner, 
          repoInfo.repo, 
          filePath, 
          repoInfo.branch || 'main'
        );

        return fileData.size || 0;

      } catch (error) {
        if (error.statusCode === 404) {
          Logger.debug(`File not found: ${filePath}`);
          return 0;
        }
        throw error;
      }
    }

    /**
     * Get directory size (sum of all files)
     */
    async getDirectorySize(repoInfo, dirPath) {
      try {
        const contents = await APIUtils.github.getRepoContents(
          repoInfo.owner, 
          repoInfo.repo, 
          dirPath, 
          repoInfo.branch || 'main'
        );

        if (!Array.isArray(contents)) {
          return 0;
        }

        // Sum up sizes of all files (not directories)
        let totalSize = 0;
        for (const item of contents) {
          if (item.type === 'file' && item.size) {
            totalSize += item.size;
          }
        }

        return totalSize;

      } catch (error) {
        if (error.statusCode === 404) {
          Logger.debug(`Directory not found: ${dirPath}`);
          return 0;
        }
        throw error;
      }
    }

    /**
     * Create size indicator element
     */
    createSizeIndicator(size, isDirectory) {
      const formattedSize = this.formatFileSize(size);
      const sizeClass = this.getSizeClass(size);
      const icon = isDirectory ? '📁' : '📄';

      return DOMUtils.createElement('span', {
        classes: ['github-enhancer-file-size', `size-${sizeClass}`],
        textContent: `${icon} ${formattedSize}`,
        attributes: {
          title: `${isDirectory ? 'Directory' : 'File'} size: ${formattedSize}`
        },
        styles: {
          fontSize: '11px',
          color: '#586069',
          marginLeft: '8px',
          padding: '2px 6px',
          borderRadius: '3px',
          backgroundColor: '#f6f8fa',
          border: '1px solid #e1e4e8'
        }
      });
    }

    /**
     * Insert size indicator into file row
     */
    insertSizeIndicator(row, sizeIndicator, fileInfo) {
      // Find the best place to insert the size indicator
      const fileNameCell = row.querySelector('.react-directory-row-name-cell-small-screen, .react-directory-filename-column');
      
      if (fileNameCell) {
        // Look for existing size indicator and remove it
        const existingIndicator = fileNameCell.querySelector('.github-enhancer-file-size');
        if (existingIndicator) {
          existingIndicator.remove();
        }

        // Append new size indicator
        fileNameCell.appendChild(sizeIndicator);
      }
    }

    /**
     * Format file size in human readable format
     */
    formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log2(bytes) / 10);
      const value = (bytes / Math.pow(1024, i)).toFixed(1);
      
      return `${value} ${units[i]}`;
    }

    /**
     * Get size class for styling
     */
    getSizeClass(bytes) {
      if (bytes < 1024) return 'tiny';
      if (bytes < 10 * 1024) return 'small';
      if (bytes < 100 * 1024) return 'medium';
      if (bytes < 1024 * 1024) return 'large';
      return 'huge';
    }

    /**
     * Insert CSS styles for file size indicators
     */
    insertFileSizeStyles() {
      const css = `
        .github-enhancer-file-size {
          display: inline-block;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .github-enhancer-file-size.size-tiny {
          background-color: #dcfce7;
          border-color: #bbf7d0;
          color: #166534;
        }

        .github-enhancer-file-size.size-small {
          background-color: #dbeafe;
          border-color: #bfdbfe;
          color: #1e40af;
        }

        .github-enhancer-file-size.size-medium {
          background-color: #fef3c7;
          border-color: #fde68a;
          color: #92400e;
        }

        .github-enhancer-file-size.size-large {
          background-color: #fed7aa;
          border-color: #fdba74;
          color: #ea580c;
        }

        .github-enhancer-file-size.size-huge {
          background-color: #fecaca;
          border-color: #fca5a5;
          color: #dc2626;
        }

        .github-enhancer-file-size:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        @media (prefers-color-scheme: dark) {
          .github-enhancer-file-size {
            background-color: #30363d !important;
            border-color: #484f58 !important;
            color: #c9d1d9 !important;
          }
        }

        @keyframes fadeInSize {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }

        .github-enhancer-file-size {
          animation: fadeInSize 0.3s ease-in-out;
        }
      `;

      DOMUtils.insertCSS(css, 'github-enhancer-file-size-styles');
    }

    /**
     * Cleanup enhanced file size indicators
     */
    cleanup() {
      try {
        // Remove size indicators
        const sizeIndicators = DOMUtils.safeQueryAll('.github-enhancer-file-size');
        sizeIndicators.forEach(indicator => indicator.remove());

        // Remove styles
        DOMUtils.removeElements('#github-enhancer-file-size-styles');

        // Clear processing queue
        this.processingQueue.clear();

        Logger.debug('Cleaned up file size enhancements');
      } catch (error) {
        Logger.logError(error, { context: 'File size enhancer cleanup' });
      }

      super.cleanup();
    }
  }

  return FileSizeEnhancerClass;
})();

// Global availability
window.FileSizeEnhancer = FileSizeEnhancer; 