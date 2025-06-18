/**
 * Date Enhancer for GitHub Enhancer
 * Enhances relative time elements with full date/time display
 */

const DateEnhancer = (() => {
  const { BaseEnhancer } = window;
  const { Logger, DOMUtils, DateUtils } = window;
  const { SELECTORS } = window.GITHUB_ENHANCER_CONSTANTS;

  class DateEnhancerClass extends BaseEnhancer {
    constructor(name = 'DateEnhancer') {
      super(name, {
        debounceDelay: 100,
        batchSize: 20
      });
    }

    /**
     * Setup date enhancer
     */
    async setup() {
      Logger.debug(`Setting up ${this.name}`);
      this.insertDateEnhancerStyles();
      
      // İlk enhancement
      await this.enhance();
      
      // GitHub'ın SPA navigation'ı için ekstra listener'lar
      this.setupNavigationListeners();
    }

    /**
     * Setup listeners for GitHub's SPA navigation
     */
    setupNavigationListeners() {
      // GitHub'ın turbo navigation'ı için
      document.addEventListener('turbo:load', () => {
        setTimeout(() => this.enhance(), 500);
      });
      
      // Popstate events için
      window.addEventListener('popstate', () => {
        setTimeout(() => this.enhance(), 500);
      });
      
      // URL değişikliklerini dinle
      let currentUrl = window.location.href;
      const urlObserver = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
          currentUrl = window.location.href;
          setTimeout(() => this.enhance(), 1000);
        }
      });
      
      urlObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    /**
     * Insert CSS styles for date enhancer
     */
    insertDateEnhancerStyles() {
      const existingStyle = document.getElementById('github-enhancer-date-styles');
      if (existingStyle) return;

      const style = document.createElement('style');
      style.id = 'github-enhancer-date-styles';
      style.textContent = `
        /* Date Enhancer Animations */
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(88, 166, 255, 0.3);
          }
          50% {
            box-shadow: 0 0 20px rgba(88, 166, 255, 0.6);
          }
        }

        @keyframes ripple {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
        }

        /* Enhanced Date Elements */
        .github-enhancer-date-enhanced {
          position: relative !important;
          z-index: 1 !important;
        }

        .github-enhancer-date-enhanced:hover .github-enhancer-modern-tooltip {
          opacity: 1 !important;
          visibility: visible !important;
        }

        /* Ultra modern date badges - perfect alignment */
        .modern-date-badge {
          animation: float 6s ease-in-out infinite;
          will-change: transform;
          display: inline-flex !important;
          vertical-align: baseline !important;
        }

        .modern-date-badge:hover {
          animation-play-state: paused;
        }

        .ultra-modern-icon {
          animation: iconPulse 2s ease-in-out infinite;
        }

        @keyframes iconPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
        }

        /* Performance optimizations */
        .modern-date-badge * {
          will-change: transform, opacity;
        }

        /* Detail popup styling */
        .github-enhancer-date-detail {
          animation: slideIn 0.2s ease !important;
        }

        /* Responsive design for mobile */
        @media (max-width: 768px) {
          .github-enhancer-date-enhanced {
            font-size: 0.8rem !important;
            padding: 3px 6px !important;
          }
          
          .github-enhancer-date-tooltip {
            font-size: 11px !important;
            padding: 6px 8px !important;
          }
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .github-enhancer-date-enhanced {
            border-width: 2px !important;
            font-weight: 600 !important;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .github-enhancer-date-enhanced,
          .github-enhancer-date-enhanced *,
          .github-enhancer-date-detail {
            animation: none !important;
            transition: none !important;
          }
        }
      `;

      document.head.appendChild(style);
      Logger.debug('Date enhancer styles inserted');
    }

    /**
     * Check if should enhance based on mutations
     */
    shouldEnhance(mutations) {
      return mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        
        // Check if any added nodes contain relative-time elements
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches('relative-time')) return true;
            if (node.querySelector && node.querySelector('relative-time')) return true;
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
        this.startPerformanceTimer('dateEnhancement');
        
        // GitHub'ın AJAX navigation'ı için ekstra bekleme
        await this.waitForPageLoad();
        
        // Find all relative-time elements that haven't been enhanced
        const relativeTimeElements = DOMUtils.safeQueryAll(SELECTORS.RELATIVE_TIME)
          .filter(element => !BaseEnhancer.isElementEnhanced(element, this.name));

        if (relativeTimeElements.length === 0) {
          Logger.debug('No new relative-time elements found');
          // Retry mechanism with backoff
          if (!this.retryCount) this.retryCount = 0;
          if (this.retryCount < 3) {
            this.retryCount++;
            setTimeout(() => this.enhance(), 1000 * this.retryCount);
          } else {
            this.retryCount = 0; // Reset for next page
          }
          return;
        }

        Logger.debug(`Found ${relativeTimeElements.length} relative-time elements to enhance`);

        // Process elements in batches
        await this.processBatch(relativeTimeElements, this.enhanceElement.bind(this));

        Logger.debug(`Enhanced ${relativeTimeElements.length} relative-time elements`);
        
        // Reset retry count on success
        this.retryCount = 0;
        
        this.endPerformanceTimer('dateEnhancement');
        
        // Dispatch completion event
        this.dispatchEvent(window.GITHUB_ENHANCER_CONSTANTS.EVENT_TYPES.ENHANCEMENT_COMPLETE, {
          action: 'date_enhancement',
          count: relativeTimeElements.length
        });

      } catch (error) {
        this.handleError(error, 'Date enhancement');
      }
    }

    /**
     * Wait for page to be fully loaded
     */
    async waitForPageLoad() {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
        }
      });
    }

    /**
     * Enhance a single relative-time element
     */
    async enhanceElement(element) {
      try {
        // Skip if already enhanced
        if (BaseEnhancer.isElementEnhanced(element, this.name)) {
          return;
        }

        // Get the datetime attribute
        const dateTimeAttr = element.getAttribute('datetime');
        if (!dateTimeAttr) {
          Logger.warn('relative-time element missing datetime attribute', element);
          return;
        }

        // Parse the date
        const date = DateUtils.parseGitHubDateTime(dateTimeAttr);
        const now = new Date();
        
        // Calculate time difference
        const timeDiff = now - date;
        const isRecent = timeDiff < 24 * 60 * 60 * 1000; // Less than 24 hours
        const isVeryRecent = timeDiff < 60 * 60 * 1000; // Less than 1 hour
        
        // Format the date according to user locale
        const locale = this.settings.locale || 'en-US';
        const formattedDate = DateUtils.formatDateTime(date, locale);
        const relativeTime = this.getRelativeTimeString(date);

        // Detect theme
        const isDarkTheme = this.detectDarkTheme();

        // Create enhanced date element - sadece text olarak
        const enhancedElement = this.createSimpleEnhancedDate(
          element, 
          date, 
          formattedDate, 
          isRecent, 
          isVeryRecent,
          isDarkTheme
        );

        // Replace the original element with smooth transition
        this.replaceWithAnimation(element, enhancedElement);

        // Mark as enhanced
        BaseEnhancer.markElementEnhanced(enhancedElement, this.name);

        Logger.debug(`Enhanced date element: ${dateTimeAttr} -> ${formattedDate}`);

      } catch (error) {
        Logger.logError(error, { 
          context: `Enhancing date element`, 
          element: element.outerHTML 
        });
      }
    }

    /**
     * Calculate age-based opacity for fading effect
     */
    getAgeOpacity(date) {
      const now = new Date();
      const diffInMinutes = Math.floor((now - date) / (1000 * 60));
      
      // Test için dakika bazında hesapla (daha kolay test edilebilir)
      if (diffInMinutes < 30) return 1.0;      // %100 - Son 30 dakika
      if (diffInMinutes < 120) return 0.9;     // %90 - Son 2 saat  
      if (diffInMinutes < 1440) return 0.75;   // %75 - Son 24 saat
      if (diffInMinutes < 10080) return 0.6;   // %60 - Son hafta
      return 0.45;                              // %45 - Daha eski
    }

    /**
     * Create modern enhanced date element with beautiful design
     */
    createSimpleEnhancedDate(originalElement, date, formattedDate, isRecent, isVeryRecent, isDarkTheme) {
      const container = document.createElement('div');
      container.className = 'github-enhancer-date-enhanced modern-date-badge';
      
      // Tarih ve saati göster
      const dateText = this.formatSimpleDate(date);
      
      // İkon ekle
      const icon = this.createModernIcon(date, isRecent, isVeryRecent, isDarkTheme);
      const textSpan = document.createElement('span');
      textSpan.textContent = dateText;
      textSpan.className = 'date-text';
      textSpan.style.cssText = `
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
      `;
      
      if (icon) container.appendChild(icon);
      container.appendChild(textSpan);
      
      // Ultra modern design - sabit boyutlar
      const colors = this.getUltraModernColors(isDarkTheme, isRecent, isVeryRecent, date);
      const ageOpacity = this.getAgeOpacity(date);
      
      // Debug: opacity değerini console'a yazdır
      console.log(`Date: ${date.toISOString()}, Age Opacity: ${ageOpacity}`);
      
      container.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        padding: 4px 8px;
        height: 24px;
        max-width: 120px;
        min-width: 80px;
        border-radius: 12px;
        background: ${colors.background};
        border: none;
        box-shadow: ${colors.shadow};
        cursor: pointer;
        font-weight: 600;
        font-size: 0.65rem;
        line-height: 1;
        color: ${colors.text};
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        position: relative;
        overflow: hidden;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.2px;
        vertical-align: baseline;
        margin: 0 1px;
        top: 0;
        transform: translateY(0);
        box-sizing: border-box;
        text-overflow: ellipsis;
      `;
      
      // Başlangıç opacity'sini ayarla - CSS'ten sonra
      container.style.setProperty('opacity', ageOpacity, 'important');
      
      // Ekstra güvenlik için attribute olarak da ekle
      container.setAttribute('data-age-opacity', ageOpacity);
      
      // Animated shine effect
      const gradientOverlay = document.createElement('div');
      gradientOverlay.className = 'shine-overlay';
      gradientOverlay.style.cssText = `
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%);
        opacity: 0;
        transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        transform: translateX(-100%) rotate(45deg);
        z-index: 1;
        pointer-events: none;
      `;
      container.appendChild(gradientOverlay);
      
      // Opacity değerlerini saklayalım
      const baseOpacity = ageOpacity;
      const hoverOpacity = Math.min(ageOpacity + 0.2, 1.0);
      
      // Minimal hover effects - container içinde kalır
      container.addEventListener('mouseenter', () => {
        container.style.transform = 'translateY(-1px) scale(1.02)';
        container.style.boxShadow = colors.hoverShadow;
        container.style.background = colors.hoverGradient;
        container.style.setProperty('opacity', hoverOpacity, 'important'); // Hover'da biraz daha parlak
        gradientOverlay.style.opacity = '0.15';
        gradientOverlay.style.transform = 'translateX(0) rotate(45deg)';
        tooltip.style.opacity = '1';
        tooltip.style.visibility = 'visible';
        tooltip.style.transform = 'translateX(-50%) translateY(-3px)';
      });
      
      container.addEventListener('mouseleave', () => {
        container.style.transform = 'translateY(0) scale(1)';
        container.style.boxShadow = colors.shadow;
        container.style.background = colors.background;
        container.style.setProperty('opacity', baseOpacity, 'important'); // Normal opacity'ye geri dön
        gradientOverlay.style.opacity = '0';
        gradientOverlay.style.transform = 'translateX(-100%) rotate(45deg)';
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
        tooltip.style.transform = 'translateX(-50%) translateY(0)';
      });
      
      // Opacity'yi zorla ayarla - başka CSS kuralları override etmesin diye
      setTimeout(() => {
        container.style.setProperty('opacity', ageOpacity, 'important');
      }, 50);
      
      // Modern tooltip
      const tooltip = this.createModernTooltip(date, formattedDate, isDarkTheme);
      container.appendChild(tooltip);
      
      // Click handler with ripple effect
      container.addEventListener('click', (e) => {
        e.preventDefault();
        this.createRippleEffect(e, container);
        setTimeout(() => {
          this.showDateDetails(date, formattedDate, container);
        }, 150);
      });
      
      return container;
    }

    /**
     * Get ultra modern color scheme - maviden griye yumuşak geçiş
     */
    getUltraModernColors(isDarkTheme, isRecent, isVeryRecent, date) {
      // Yaş bazlı renk geçişi hesapla
      const ageColors = this.calculateAgeBasedColors(date, isDarkTheme);
      
      if (isDarkTheme) {
        if (isVeryRecent) {
          // Çok yeni - Parlak yeşil
          return {
            background: 'linear-gradient(145deg, #00ff88, #00cc6a)',
            text: '#000000',
            shadow: '0 8px 32px rgba(0, 255, 136, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            hoverShadow: '0 12px 48px rgba(0, 255, 136, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
            hoverGradient: 'linear-gradient(145deg, #00ff88, #00e673)'
          };
        } else {
          // Yaş bazlı mavi-gri geçiş
          return {
            background: `linear-gradient(145deg, ${ageColors.primary}, ${ageColors.secondary})`,
            text: ageColors.text,
            shadow: `0 8px 32px ${ageColors.shadowColor}, inset 0 1px 0 ${ageColors.insetColor}`,
            hoverShadow: `0 12px 48px ${ageColors.hoverShadowColor}, inset 0 1px 0 ${ageColors.hoverInsetColor}`,
            hoverGradient: `linear-gradient(145deg, ${ageColors.hoverPrimary}, ${ageColors.hoverSecondary})`
          };
        }
      } else {
        if (isVeryRecent) {
          // Çok yeni - Parlak yeşil
          return {
            background: 'linear-gradient(145deg, #00ff88, #00cc6a)',
            text: '#000000',
            shadow: '0 8px 32px rgba(0, 255, 136, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
            hoverShadow: '0 12px 48px rgba(0, 255, 136, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            hoverGradient: 'linear-gradient(145deg, #00ff88, #00e673)'
          };
        } else {
          // Yaş bazlı mavi-gri geçiş
          return {
            background: `linear-gradient(145deg, ${ageColors.primary}, ${ageColors.secondary})`,
            text: ageColors.text,
            shadow: `0 8px 32px ${ageColors.shadowColor}, inset 0 1px 0 ${ageColors.insetColor}`,
            hoverShadow: `0 12px 48px ${ageColors.hoverShadowColor}, inset 0 1px 0 ${ageColors.hoverInsetColor}`,
            hoverGradient: `linear-gradient(145deg, ${ageColors.hoverPrimary}, ${ageColors.hoverSecondary})`
          };
        }
      }
    }

    /**
     * Yaş bazlı renk geçişi hesapla - maviden griye
     */
    calculateAgeBasedColors(date, isDarkTheme) {
      const now = new Date();
      const diffInMinutes = Math.floor((now - date) / (1000 * 60));
      
      // Renk geçiş noktaları
      let blueToGrayRatio;
      if (diffInMinutes < 30) blueToGrayRatio = 0.0;      // %100 mavi
      else if (diffInMinutes < 120) blueToGrayRatio = 0.2; // %80 mavi, %20 gri
      else if (diffInMinutes < 1440) blueToGrayRatio = 0.5; // %50 mavi, %50 gri
      else if (diffInMinutes < 10080) blueToGrayRatio = 0.8; // %20 mavi, %80 gri
      else blueToGrayRatio = 1.0; // %100 gri
      
      if (isDarkTheme) {
        // Dark theme renk geçişi
        const blueColor = { r: 0, g: 153, b: 255 };     // #0099ff
        const grayColor = { r: 64, g: 64, b: 64 };      // #404040
        
        const blueColorSecondary = { r: 0, g: 119, b: 204 }; // #0077cc
        const grayColorSecondary = { r: 42, g: 42, b: 42 };  // #2a2a2a
        
        // Renk interpolasyonu
        const primary = this.interpolateColor(blueColor, grayColor, blueToGrayRatio);
        const secondary = this.interpolateColor(blueColorSecondary, grayColorSecondary, blueToGrayRatio);
        
        return {
          primary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
          secondary: `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`,
          text: blueToGrayRatio > 0.5 ? '#cccccc' : '#ffffff',
          shadowColor: `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${0.5 * (1 - blueToGrayRatio * 0.5)})`,
          insetColor: `rgba(255, 255, 255, ${0.25 * (1 - blueToGrayRatio * 0.5)})`,
          hoverShadowColor: `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${0.7 * (1 - blueToGrayRatio * 0.5)})`,
          hoverInsetColor: `rgba(255, 255, 255, ${0.35 * (1 - blueToGrayRatio * 0.5)})`,
          hoverPrimary: `rgb(${Math.min(255, primary.r + 10)}, ${Math.min(255, primary.g + 10)}, ${Math.min(255, primary.b + 10)})`,
          hoverSecondary: `rgb(${Math.min(255, secondary.r + 15)}, ${Math.min(255, secondary.g + 15)}, ${Math.min(255, secondary.b + 15)})`
        };
      } else {
        // Light theme renk geçişi
        const blueColor = { r: 0, g: 153, b: 255 };     // #0099ff
        const grayColor = { r: 245, g: 245, b: 245 };   // #f5f5f5
        
        const blueColorSecondary = { r: 0, g: 119, b: 204 }; // #0077cc
        const grayColorSecondary = { r: 224, g: 224, b: 224 }; // #e0e0e0
        
        // Renk interpolasyonu
        const primary = this.interpolateColor(blueColor, grayColor, blueToGrayRatio);
        const secondary = this.interpolateColor(blueColorSecondary, grayColorSecondary, blueToGrayRatio);
        
        return {
          primary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
          secondary: `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`,
          text: blueToGrayRatio > 0.5 ? '#888888' : '#ffffff',
          shadowColor: `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${0.35 * (1 - blueToGrayRatio * 0.5)})`,
          insetColor: `rgba(255, 255, 255, ${0.5 + blueToGrayRatio * 0.4})`,
          hoverShadowColor: `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${0.5 * (1 - blueToGrayRatio * 0.5)})`,
          hoverInsetColor: `rgba(255, 255, 255, ${0.7 + blueToGrayRatio * 0.3})`,
          hoverPrimary: `rgb(${Math.max(0, primary.r - 10)}, ${Math.max(0, primary.g - 10)}, ${Math.max(0, primary.b - 10)})`,
          hoverSecondary: `rgb(${Math.max(0, secondary.r - 15)}, ${Math.max(0, secondary.g - 15)}, ${Math.max(0, secondary.b - 15)})`
        };
      }
    }

    /**
     * İki renk arasında interpolasyon
     */
    interpolateColor(color1, color2, ratio) {
      return {
        r: Math.round(color1.r + (color2.r - color1.r) * ratio),
        g: Math.round(color1.g + (color2.g - color1.g) * ratio),
        b: Math.round(color1.b + (color2.b - color1.b) * ratio)
      };
    }

    /**
     * Create ultra modern icon - geometrik şekiller
     */
    createModernIcon(date, isRecent, isVeryRecent, isDarkTheme) {
      const now = new Date();
      const timeDiff = now - date;
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      
      const icon = document.createElement('div');
      icon.className = 'ultra-modern-icon';
      
      let shape = '';
      let bgColor = 'rgba(255, 255, 255, 0.2)';
      
      if (hours < 1) {
        // Çok yeni - parlayan diamond
        shape = '◆';
        bgColor = 'rgba(255, 255, 255, 0.4)';
      } else if (hours < 24) {
        // Yeni - triangle
        shape = '▲';
        bgColor = 'rgba(255, 255, 255, 0.3)';
      } else if (days < 7) {
        // Bu hafta - circle
        shape = '●';
        bgColor = 'rgba(255, 255, 255, 0.2)';
      } else if (days < 30) {
        // Bu ay - square
        shape = '■';
        bgColor = 'rgba(255, 255, 255, 0.15)';
      } else {
        // Eski - small circle
        shape = '○';
        bgColor = 'rgba(255, 255, 255, 0.1)';
      }
      
      icon.style.cssText = `
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 7px;
        border-radius: 50%;
        background: ${bgColor};
        color: currentColor;
        flex-shrink: 0;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-weight: bold;
        line-height: 1;
      `;
      
      icon.textContent = shape;
      return icon;
    }

    /**
     * Format date as simple readable format
     */
    formatSimpleDate(date) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const diffInDays = Math.floor((today - dateOnly) / (1000 * 60 * 60 * 24));
      
      if (diffInDays === 0) {
        // Bugün - sadece saat göster
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      } else if (diffInDays === 1) {
        // Dün - kısa format
        return `Ytd ${date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        })}`;
      } else if (diffInDays < 7) {
        // Bu hafta - gün ismi + saat
        return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        })}`;
      } else if (diffInDays < 30) {
        // Bu ay - kısa format
        return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        })}`;
      } else {
        // Daha eski - sadece tarih
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: diffInDays > 365 ? '2-digit' : undefined
        });
      }
    }

    /**
     * Create modern tooltip with glassmorphism
     */
    createModernTooltip(date, formattedDate, isDarkTheme) {
      const tooltip = document.createElement('div');
      tooltip.className = 'github-enhancer-modern-tooltip';
      
      const colors = isDarkTheme ? {
        background: 'rgba(22, 27, 34, 0.95)',
        border: 'rgba(88, 166, 255, 0.3)',
        text: '#f0f6fc',
        accent: '#58a6ff'
      } : {
        background: 'rgba(255, 255, 255, 0.95)',
        border: 'rgba(9, 105, 218, 0.3)',
        text: '#24292f',
        accent: '#0969da'
      };
      
      tooltip.style.cssText = `
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: ${colors.background};
        color: ${colors.text};
        padding: 12px 16px;
        border-radius: 12px;
        border: 1px solid ${colors.border};
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 99999;
        box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDarkTheme ? '0.4' : '0.15'}), 
                    0 0 0 1px rgba(255, 255, 255, ${isDarkTheme ? '0.05' : '0.1'});
        backdrop-filter: blur(12px);
        pointer-events: none;
        min-width: 200px;
        max-width: 300px;
        text-align: center;
      `;
      
      // Tooltip content with icon
      const content = document.createElement('div');
      content.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 14px;">📅</span>
          <span style="color: ${colors.accent}; font-weight: 600;">Full Date & Time</span>
        </div>
        <div style="font-size: 12px; opacity: 0.9;">${formattedDate}</div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">${this.getTimeZoneInfo(date)}</div>
      `;
      tooltip.appendChild(content);
      
      // Arrow
      const arrow = document.createElement('div');
      arrow.style.cssText = `
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 8px solid ${colors.background};
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
      `;
      tooltip.appendChild(arrow);
      
      return tooltip;
    }

    /**
     * Create ripple effect on click
     */
    createRippleEffect(event, container) {
      const ripple = document.createElement('div');
      const rect = container.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
        z-index: 1;
      `;
      
      container.appendChild(ripple);
      
      // Remove ripple after animation
      setTimeout(() => {
        ripple.remove();
      }, 600);
    }

    /**
     * OLD METHOD - artık kullanılmıyor
     */
    createEnhancedDateElement(originalElement, date, formattedDate, relativeTime, isRecent, isVeryRecent, isDarkTheme) {
      const container = document.createElement('span');
      container.className = 'github-enhancer-date-enhanced';
      
      // Theme-based colors
      const colors = isDarkTheme ? {
        primary: '#f0f6fc',
        secondary: '#8b949e',
        accent: '#58a6ff',
        recentGlow: 'rgba(88, 166, 255, 0.3)',
        veryRecentGlow: 'rgba(46, 160, 67, 0.4)',
        background: 'rgba(22, 27, 34, 0.8)',
        border: 'rgba(240, 246, 252, 0.1)'
      } : {
        primary: '#24292f',
        secondary: '#656d76',
        accent: '#0969da',
        recentGlow: 'rgba(9, 105, 218, 0.2)',
        veryRecentGlow: 'rgba(26, 127, 55, 0.3)',
        background: 'rgba(255, 255, 255, 0.9)',
        border: 'rgba(0, 0, 0, 0.1)'
      };

      // Create the main display element
      const mainDisplay = document.createElement('span');
      mainDisplay.className = 'github-enhancer-date-main';
      mainDisplay.textContent = relativeTime;
      
      // Base styling - daha minimal ve tutarlı
      container.style.cssText = `
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 4px;
        background: ${isDarkTheme ? 'rgba(22, 27, 34, 0.6)' : 'rgba(255, 255, 255, 0.8)'};
        border: 1px solid ${isDarkTheme ? 'rgba(88, 166, 255, 0.2)' : 'rgba(9, 105, 218, 0.2)'};
        transition: all 0.2s ease;
        cursor: pointer;
        font-weight: 500;
        font-size: inherit;
        color: ${colors.primary};
        box-shadow: none;
        z-index: 1;
        min-width: fit-content;
        white-space: nowrap;
      `;

      // Add subtle indicators for recent dates
      if (isVeryRecent) {
        container.style.borderColor = isDarkTheme ? '#2ea043' : '#1a7f37';
        container.style.backgroundColor = isDarkTheme ? 'rgba(46, 160, 67, 0.1)' : 'rgba(26, 127, 55, 0.05)';
      } else if (isRecent) {
        container.style.borderColor = isDarkTheme ? '#58a6ff' : '#0969da';
        container.style.backgroundColor = isDarkTheme ? 'rgba(88, 166, 255, 0.1)' : 'rgba(9, 105, 218, 0.05)';
      }

      // Add icon based on time period
      const icon = this.createTimeIcon(date, isDarkTheme);
      if (icon) {
        container.appendChild(icon);
      }

      container.appendChild(mainDisplay);

      // Add subtle hover effects
      container.addEventListener('mouseenter', () => {
        container.style.opacity = '0.8';
        container.style.transform = 'translateY(-1px)';
      });

      container.addEventListener('mouseleave', () => {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
      });

      // Create tooltip
      const tooltip = this.createTooltip(date, formattedDate, isDarkTheme);
      container.appendChild(tooltip);

      // Add click handler for additional info
      container.addEventListener('click', (e) => {
        e.preventDefault();
        this.showDateDetails(date, formattedDate, container);
      });

      return container;
    }

    /**
     * Create time-based icon - sadece çok yeni olanlar için
     */
    createTimeIcon(date, isDarkTheme) {
      const now = new Date();
      const timeDiff = now - date;
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      
      // Sadece çok yeni aktiviteler için ikon göster
      if (hours >= 1) return null;
      
      const icon = document.createElement('span');
      icon.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${isDarkTheme ? '#2ea043' : '#1a7f37'};
        display: inline-block;
        opacity: 0.8;
        flex-shrink: 0;
      `;
      icon.title = 'Very recent activity';

      return icon;
    }

    /**
     * Create tooltip element
     */
    createTooltip(date, formattedDate, isDarkTheme) {
      const tooltip = document.createElement('div');
      tooltip.className = 'github-enhancer-date-tooltip';
      
      const colors = isDarkTheme ? {
        background: '#161b22',
        text: '#f0f6fc',
        border: '#30363d'
      } : {
        background: '#ffffff',
        text: '#24292f',
        border: '#d0d7de'
      };

      tooltip.style.cssText = `
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors.background};
        color: ${colors.text};
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid ${colors.border};
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s ease;
        z-index: 999;
        box-shadow: 0 2px 8px rgba(0, 0, 0, ${isDarkTheme ? '0.3' : '0.1'});
        pointer-events: none;
      `;

      // Add arrow
      const arrow = document.createElement('div');
      arrow.style.cssText = `
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid ${colors.background};
      `;
      tooltip.appendChild(arrow);

      // Tooltip content
      const content = document.createElement('div');
      content.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${formattedDate}</div>
        <div style="opacity: 0.8; font-size: 11px;">${this.getTimeZoneInfo(date)}</div>
      `;
      tooltip.appendChild(content);

      return tooltip;
    }

    /**
     * Show/hide tooltip on hover
     */
    setupTooltipEvents(container) {
      const tooltip = container.querySelector('.github-enhancer-date-tooltip');
      if (!tooltip) return;

      container.addEventListener('mouseenter', () => {
        tooltip.style.opacity = '1';
        tooltip.style.visibility = 'visible';
      });

      container.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
      });
    }

    /**
     * Replace element with smooth animation
     */
    replaceWithAnimation(oldElement, newElement) {
      // Set initial state for animation
      newElement.style.opacity = '0';
      newElement.style.transform = 'translateY(10px)';
      
      // Replace element
      oldElement.parentNode.replaceChild(newElement, oldElement);
      
      // Animate in
      requestAnimationFrame(() => {
        newElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        newElement.style.opacity = '1';
        newElement.style.transform = 'translateY(0)';
      });

      // Setup tooltip events
      this.setupTooltipEvents(newElement);
    }

    /**
     * Get relative time string
     */
    getRelativeTimeString(date) {
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      if (diffInSeconds < 60) return 'just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
      if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
      return `${Math.floor(diffInSeconds / 31536000)}y ago`;
    }

    /**
     * Get timezone info
     */
    getTimeZoneInfo(date) {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return `${timeZone} • ${date.toLocaleString('en-US', { weekday: 'long' })}`;
    }

    /**
     * Detect dark theme
     */
    detectDarkTheme() {
      return document.documentElement.getAttribute('data-color-mode') === 'dark' || 
             document.documentElement.getAttribute('data-dark-theme') === 'dark' ||
             document.body.classList.contains('dark') ||
             getComputedStyle(document.body).backgroundColor === 'rgb(13, 17, 23)';
    }

    /**
     * Show detailed date information
     */
    showDateDetails(date, formattedDate, container) {
      // Create a temporary detailed view
      const existingDetail = document.querySelector('.github-enhancer-date-detail');
      if (existingDetail) {
        existingDetail.remove();
        return;
      }

      const detail = document.createElement('div');
      detail.className = 'github-enhancer-date-detail';
      
      // Container'ın pozisyonunu al
      const rect = container.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      // Popup boyutları (tahmini)
      const popupWidth = 300;
      const popupHeight = 200;
      
      // Ekran boyutları
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Akıllı pozisyonlama
      let top = rect.bottom + scrollTop + 8;
      let left = rect.left + scrollLeft;
      
      // Sağ tarafta yer yoksa sola kaydır
      if (left + popupWidth > viewportWidth) {
        left = Math.max(10, viewportWidth - popupWidth - 10);
      }
      
      // Alt tarafta yer yoksa üste konumlandır
      if (rect.bottom + popupHeight > viewportHeight) {
        top = rect.top + scrollTop - popupHeight - 8;
      }
      
      // Minimum margin'ler
      left = Math.max(10, left);
      top = Math.max(10, top);
      
      detail.style.cssText = `
        position: absolute;
        top: ${top}px;
        left: ${left}px;
        background: ${this.detectDarkTheme() ? '#161b22' : '#ffffff'};
        border: 1px solid ${this.detectDarkTheme() ? '#30363d' : '#d0d7de'};
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, ${this.detectDarkTheme() ? '0.4' : '0.15'}), 
                    0 0 0 1px rgba(255, 255, 255, ${this.detectDarkTheme() ? '0.05' : '0.1'});
        backdrop-filter: blur(12px);
        z-index: 99999;
        min-width: 280px;
        max-width: 320px;
        font-size: 13px;
        animation: slideIn 0.2s ease;
        color: ${this.detectDarkTheme() ? '#f0f6fc' : '#24292f'};
      `;

      const now = new Date();
      const diffInMs = now - date;
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      detail.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: ${this.detectDarkTheme() ? '#58a6ff' : '#0969da'};">
          📅 Date Details
        </div>
        <div style="margin-bottom: 4px;"><strong>Full Date:</strong> ${formattedDate}</div>
        <div style="margin-bottom: 4px;"><strong>Days Ago:</strong> ${diffInDays}</div>
        <div style="margin-bottom: 4px;"><strong>ISO:</strong> ${date.toISOString()}</div>
        <div style="margin-bottom: 4px;"><strong>Unix:</strong> ${Math.floor(date.getTime() / 1000)}</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${this.detectDarkTheme() ? '#30363d' : '#d0d7de'}; opacity: 0.7;">
          Click anywhere to close
        </div>
      `;

      document.body.appendChild(detail);

      // Close on click outside
      setTimeout(() => {
        document.addEventListener('click', function closeDetail(e) {
          if (!detail.contains(e.target)) {
            detail.remove();
            document.removeEventListener('click', closeDetail);
          }
        });
      }, 100);
    }

    /**
     * Check if enhancement is applicable to current page
     */
    shouldObserve() {
      // Date enhancement is useful on most GitHub pages
      const supportedPages = [
        'repository', 
        'file_browser', 
        'commit', 
        'pull_request', 
        'issue',
        'home'
      ];
      
      // This would need to be passed from the main script
      // For now, assume it's always applicable
      return super.shouldObserve();
    }

    /**
     * Clean up enhanced elements
     */
    cleanup() {
      try {
        // Find and revert enhanced elements
        const enhancedElements = DOMUtils.safeQueryAll(`[data-${this.name}-enhanced="true"]`);
        
        enhancedElements.forEach(element => {
          const originalDateTime = element.getAttribute('data-original-date');
          if (originalDateTime) {
            // Create a new relative-time element
            const relativeTimeElement = DOMUtils.createElement('relative-time', {
              attributes: {
                datetime: originalDateTime
              },
              textContent: DateUtils.getRelativeTimeString(originalDateTime)
            });

            // Replace enhanced element with original
            element.parentNode.replaceChild(relativeTimeElement, element);
          }
        });

        Logger.debug(`Cleaned up ${enhancedElements.length} enhanced date elements`);
      } catch (error) {
        Logger.logError(error, { context: 'Date enhancer cleanup' });
      }

      super.cleanup();
    }
  }

  return DateEnhancerClass;
})();

// Global availability
window.DateEnhancer = DateEnhancer; 