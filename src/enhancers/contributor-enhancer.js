/**
 * Contributor Enhancer for GitHub Enhancer
 * Uses GitHub's internal hovercard API for better performance and no rate limiting
 */

const ContributorEnhancer = (() => {
  const { BaseEnhancer } = window;
  const Logger = window.Logger || console;
  const DOMUtils = window.DOMUtils;
  const Storage = window.Storage;

  class ContributorEnhancerClass extends BaseEnhancer {
    constructor(name = 'ContributorEnhancer') {
      super(name, {
        debounceDelay: 500,
        batchSize: 5
      });
      
      this.enhancementInProgress = false;
      this.cache = new Map();
      this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    async setup() {
      Logger.debug(`Setting up ${this.name}`);
      this.insertContributorStyles();
    }

    shouldEnhance(mutations) {
      if (!window.location.pathname.match(/^\/[^\/]+\/[^\/]+\/?$/)) {
        return false;
      }

      return mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.querySelector && node.textContent.includes('Contributors')) {
              return true;
            }
          }
        }
        return false;
      });
    }

    async enhance() {
      if (this.enhancementInProgress) {
        Logger.debug('Enhancement already in progress, skipping');
        return;
      }

      try {
        this.enhancementInProgress = true;
        
        const contributorsSection = this.findContributorsSection();
        if (!contributorsSection) {
          Logger.debug('Contributors section not found');
          return;
        }

        // Check if already enhanced
        if (contributorsSection.querySelector('.github-enhancer-contributors')) {
          Logger.debug('Contributors section already enhanced');
          return;
        }

        const contributorItems = Array.from(contributorsSection.querySelectorAll('li'));
        if (contributorItems.length === 0) {
          Logger.debug('No contributor items found');
          return;
        }

        Logger.info(`Found ${contributorItems.length} contributors to enhance`);

        // Create enhanced container
        const enhancedContainer = this.createEnhancedContainer();
        
        // Process contributors in batches
        const maxCards = this.settings.maxCards || 10;
        const itemsToProcess = contributorItems.slice(0, maxCards);
        
        for (let i = 0; i < itemsToProcess.length; i += 3) {
          const batch = itemsToProcess.slice(i, i + 3);
          await Promise.all(batch.map(item => this.processContributor(item, enhancedContainer)));
        }

        // Insert enhanced section
        if (enhancedContainer.children.length === 0) {
          Logger.debug('No contributor cards created, skipping insertion');
          return;
        }

        // Try multiple insertion strategies
        let inserted = false;
        
        // Strategy 1: Look for original list (ul)
        const originalList = contributorsSection.querySelector('ul');
        if (originalList) {
          Logger.debug('Found original ul list, inserting after it');
          originalList.parentNode.insertBefore(enhancedContainer, originalList.nextSibling);
          this.addToggleFunctionality(originalList, enhancedContainer);
          inserted = true;
        }
        
        // Strategy 2: Look for other common container patterns
        if (!inserted) {
          const containerSelectors = [
            '.BorderGrid-cell',
            '.Box-body',
            '.repository-content',
            '[data-testid="contributors"]'
          ];
          
          for (const selector of containerSelectors) {
            const container = contributorsSection.querySelector(selector);
            if (container) {
              Logger.debug(`Found container with selector ${selector}, appending enhanced section`);
              container.appendChild(enhancedContainer);
              inserted = true;
              break;
            }
          }
        }
        
        // Strategy 3: Direct append to contributors section
        if (!inserted) {
          Logger.debug('Using fallback: appending directly to contributors section');
          contributorsSection.appendChild(enhancedContainer);
          inserted = true;
        }
        
        if (inserted) {
          Logger.info(`Successfully enhanced ${enhancedContainer.children.length} contributors`);
        } else {
          Logger.warn('Failed to insert enhanced section after all strategies');
        }

      } catch (error) {
        this.handleError(error, 'Contributor enhancement');
      } finally {
        this.enhancementInProgress = false;
      }
    }

    findContributorsSection() {
      // Try multiple strategies to find contributors section
      
      // Strategy 1: Look for BorderGrid-row with Contributors text
      const borderGridRows = document.querySelectorAll('.BorderGrid-row');
      for (const row of borderGridRows) {
        const text = row.textContent || '';
        if (text.includes('Contributors') || text.includes('contributors')) {
          return row;
        }
      }
      
      // Strategy 2: Look for specific contributor selectors
      const contributorSelectors = [
        '[data-testid="contributors"]',
        '.js-contributors-graph',
        '#contributors',
        '.contributor-grid',
        '.contributors-section'
      ];
      
      for (const selector of contributorSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      }
      
      // Strategy 3: Look for headings containing "Contributors"
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const heading of headings) {
        const text = heading.textContent || '';
        if (text.includes('Contributors') || text.includes('contributors')) {
          // Return the parent section
          return heading.closest('.BorderGrid-row') || 
                 heading.closest('.Box') || 
                 heading.parentElement;
        }
      }
      
      // Strategy 4: Look for any element with contributor-related text
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        if (element.children.length > 0) continue; // Skip parent elements
        const text = element.textContent || '';
        if (text.trim().toLowerCase() === 'contributors') {
          return element.closest('.BorderGrid-row') || 
                 element.closest('.Box') || 
                 element.parentElement;
        }
      }
      
      Logger.debug('Contributors section not found with any strategy');
      return null;
    }

    createEnhancedContainer() {
      const container = document.createElement('div');
      container.className = 'github-enhancer-contributors';
      container.style.cssText = `
        margin-top: 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        justify-content: flex-start;
        align-items: flex-start;
      `;
      
      return container;
    }

    async processContributor(item, container) {
      try {
        // Try multiple selectors to find the link
        let link = item.querySelector('a');
        
        // If no direct link, maybe the item itself is a link
        if (!link && item.tagName === 'A') {
          link = item;
        }
        
        // Try to find link in parent or child elements
        if (!link) {
          link = item.closest('a') || item.parentElement?.querySelector('a');
        }
        
        if (!link) {
          Logger.debug('No link found in contributor item, skipping');
          return;
        }

        const href = link.getAttribute('href');
        if (!href) {
          Logger.debug('No href found in contributor link, skipping');
          return;
        }

        // Extract username from href
        const username = href.split('/').filter(part => part).pop();
        if (!username) {
          Logger.debug('Could not extract username from href:', href);
          return;
        }

        const avatar = item.querySelector('img') || link.querySelector('img');
        
        Logger.debug(`Processing contributor: ${username}`);
        
        // Create card immediately with basic info
        const card = this.createContributorCard(username, avatar?.src);
        
        if (!card) {
          Logger.warn('Failed to create card for', username);
          return;
        }
        
        Logger.debug(`Created card for ${username}, appending to container`);
        container.appendChild(card);
        
        Logger.debug(`Container now has ${container.children.length} children`);

        // Fetch additional data using hovercard API
        try {
          const hovercardData = await this.fetchHovercardData(username);
          this.enhanceCard(card, hovercardData);
        } catch (hovercardError) {
          Logger.debug(`Failed to fetch hovercard data for ${username}:`, hovercardError);
          // Card is still displayed with basic info
        }

      } catch (error) {
        Logger.warn(`Failed to process contributor: ${error.message}`, error);
      }
    }

    createContributorCard(username, avatarSrc) {
      // Detect dark theme
      const isDarkTheme = document.documentElement.getAttribute('data-color-mode') === 'dark' || 
                         document.documentElement.getAttribute('data-dark-theme') === 'dark' ||
                         document.body.classList.contains('dark') ||
                         getComputedStyle(document.body).backgroundColor === 'rgb(13, 17, 23)';

      const card = document.createElement('div');
      card.className = 'github-enhancer-contributor-card';
      
      const cardStyles = isDarkTheme ? {
        background: 'linear-gradient(145deg, #161b22 0%, #0d1117 100%)',
        border: '1px solid #30363d',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        hoverShadow: '0 8px 25px rgba(88, 166, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.6)',
        textColor: '#f0f6fc',
        secondaryColor: '#8b949e',
        accentColor: '#58a6ff'
      } : {
        background: 'linear-gradient(145deg, #ffffff 0%, #f6f8fa 100%)',
        border: '1px solid #d0d7de',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        hoverShadow: '0 8px 25px rgba(9, 105, 218, 0.12), 0 4px 12px rgba(0, 0, 0, 0.1)',
        textColor: '#24292f',
        secondaryColor: '#656d76',
        accentColor: '#0969da'
      };

      card.style.cssText = `
        width: 300px;
        min-width: 300px;
        background: ${cardStyles.background};
        border: ${cardStyles.border};
        border-radius: 12px;
        padding: 20px;
        box-shadow: ${cardStyles.boxShadow};
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        display: block;
        visibility: visible;
        overflow: hidden;
      `;
      
      // Store theme info for hover effects
      card._isDarkTheme = isDarkTheme;
      card._cardStyles = cardStyles;

      // Add background elements first
      this.addBackgroundEffects(card, isDarkTheme);

      // Header with avatar and glassmorphism effect
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        margin-bottom: 16px;
        position: relative;
        z-index: 10;
      `;

      // Avatar with modern styling
      if (avatarSrc) {
        const avatarContainer = document.createElement('div');
        avatarContainer.style.cssText = `
          position: relative;
          margin-right: 12px;
        `;

        const avatar = document.createElement('img');
        avatar.src = avatarSrc;
        avatar.alt = `${username} avatar`;
        avatar.style.cssText = `
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 3px solid ${isDarkTheme ? 'rgba(88, 166, 255, 0.3)' : 'rgba(9, 105, 218, 0.3)'};
          box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDarkTheme ? '0.3' : '0.1'});
          transition: all 0.3s ease;
          background: ${isDarkTheme ? '#21262d' : '#ffffff'};
          padding: 2px;
        `;

        // Glowing ring effect
        const ring = document.createElement('div');
        ring.style.cssText = `
          position: absolute;
          top: -3px;
          left: -3px;
          right: -3px;
          bottom: -3px;
          border-radius: 50%;
          background: ${isDarkTheme ? 
            'linear-gradient(45deg, #58a6ff, #bc8cff, #58a6ff)' : 
            'linear-gradient(45deg, #0969da, #7c3aed, #0969da)'};
          opacity: 0;
          transition: all 0.3s ease;
          z-index: -1;
          filter: blur(2px);
        `;

        avatarContainer.appendChild(ring);
        avatarContainer.appendChild(avatar);
        header.appendChild(avatarContainer);

        card._avatar = avatar;
        card._ring = ring;
      }

      // User info section
      const userInfo = document.createElement('div');
      userInfo.style.cssText = `
        flex: 1;
        min-width: 0;
      `;

      // Username with style
      const usernameEl = document.createElement('div');
      usernameEl.textContent = `@${username}`;
      usernameEl.style.cssText = `
        font-size: 16px;
        font-weight: 700;
        color: ${cardStyles.textColor};
        margin-bottom: 4px;
        transition: all 0.3s ease;
        background: ${isDarkTheme ? 
          'linear-gradient(90deg, #f0f6fc, #58a6ff)' : 
          'linear-gradient(90deg, #24292f, #0969da)'};
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      `;

      // Modern badge
      const badge = document.createElement('span');
      badge.textContent = 'Contributor';
      badge.style.cssText = `
        display: inline-block;
        background: ${isDarkTheme ? 
          'linear-gradient(135deg, #238636, #2ea043)' : 
          'linear-gradient(135deg, #0969da, #0550ae)'};
        color: white;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        position: relative;
        overflow: hidden;
      `;

      // Badge shine effect
      const shine = document.createElement('div');
      shine.style.cssText = `
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
        transition: left 0.5s ease;
      `;
      badge.appendChild(shine);

      userInfo.appendChild(usernameEl);
      userInfo.appendChild(badge);
      header.appendChild(userInfo);
      card.appendChild(header);

      card._badge = badge;
      card._shine = shine;


      // Details container with glassmorphism
      const details = document.createElement('div');
      details.className = 'contributor-details';
      details.style.cssText = `
        background: ${isDarkTheme ? 
          'rgba(48, 54, 61, 0.3)' : 
          'rgba(255, 255, 255, 0.7)'};
        backdrop-filter: blur(10px);
        border: 1px solid ${isDarkTheme ? 
          'rgba(240, 246, 252, 0.1)' : 
          'rgba(0, 0, 0, 0.1)'};
        border-radius: 8px;
        padding: 12px;
        font-size: 12px;
        color: ${cardStyles.secondaryColor};
        line-height: 1.5;
        margin-top: 8px;
        transition: all 0.3s ease;
        position: relative;
        z-index: 10;
      `;
      card.appendChild(details);

      // Click to visit profile
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(`https://github.com/${username}`, '_blank');
      });

      // Modern hover efektleri
      const handleMouseEnter = () => {
        try {
          // Ana kart efektleri
          card.style.transform = 'translateY(-8px) scale(1.02)';
          card.style.boxShadow = card._cardStyles.hoverShadow;
          card.style.borderColor = cardStyles.accentColor;
          
          // Avatar efektleri
          if (card._avatar) {
            card._avatar.style.transform = 'scale(1.1)';
            card._avatar.style.borderColor = cardStyles.accentColor;
          }

          // Ring glow efekti
          if (card._ring) {
            card._ring.style.opacity = '1';
          }

          // Badge shine efekti
          if (card._shine) {
            card._shine.style.left = '100%';
          }

          // Details glassmorphism güçlendirme
          const details = card.querySelector('.contributor-details');
          if (details) {
            details.style.background = isDarkTheme ? 
              'rgba(88, 166, 255, 0.1)' : 
              'rgba(9, 105, 218, 0.05)';
            details.style.borderColor = cardStyles.accentColor;
          }

          // Background pattern efektleri
          if (card._bgPattern) {
            card._bgPattern.style.opacity = '1';
            card._bgPattern.style.transform = 'scale(1.08)';
          }

          if (card._meshOverlay) {
            card._meshOverlay.style.opacity = '1';
            card._meshOverlay.style.filter = 'brightness(1.2) contrast(1.1)';
          }

        } catch (error) {
          Logger.warn('Hover enter error:', error);
        }
      };

      const handleMouseLeave = () => {
        try {
          // Ana kart normal hale
          card.style.transform = 'translateY(0) scale(1)';
          card.style.boxShadow = card._cardStyles.boxShadow;
          card.style.borderColor = cardStyles.border.split(' ')[2];
          
          // Avatar normal hale
          if (card._avatar) {
            card._avatar.style.transform = 'scale(1)';
            card._avatar.style.borderColor = isDarkTheme ? 'rgba(88, 166, 255, 0.3)' : 'rgba(9, 105, 218, 0.3)';
          }

          // Ring gizle
          if (card._ring) {
            card._ring.style.opacity = '0';
          }

          // Shine reset
          if (card._shine) {
            setTimeout(() => {
              card._shine.style.left = '-100%';
            }, 200);
          }

          // Details normal hale
          const details = card.querySelector('.contributor-details');
          if (details) {
            details.style.background = isDarkTheme ? 
              'rgba(48, 54, 61, 0.3)' : 
              'rgba(255, 255, 255, 0.7)';
            details.style.borderColor = isDarkTheme ? 
              'rgba(240, 246, 252, 0.1)' : 
              'rgba(0, 0, 0, 0.1)';
          }

          // Background pattern normal hale
          if (card._bgPattern) {
            card._bgPattern.style.opacity = '0.8';
            card._bgPattern.style.transform = 'scale(1)';
          }

          if (card._meshOverlay) {
            card._meshOverlay.style.opacity = '1';
            card._meshOverlay.style.filter = 'brightness(1) contrast(1)';
          }

        } catch (error) {
          Logger.warn('Hover leave error:', error);
        }
      };

      card.addEventListener('mouseenter', handleMouseEnter);
      card.addEventListener('mouseleave', handleMouseLeave);

      return card;
    }

    addBackgroundEffects(card, isDarkTheme) {
      // Animated background patterns
      const bgPattern = document.createElement('div');
      bgPattern.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0.9;
        pointer-events: none;
        z-index: 1;
        overflow: hidden;
        border-radius: 12px;
        transition: all 0.3s ease;
        animation: patternPulse 8s ease-in-out infinite;
      `;

      // Floating orbs - daha fazla ve daha dinamik
      for (let i = 0; i < 5; i++) {
        const orb = document.createElement('div');
        const size = 15 + Math.random() * 35;
        const delay = Math.random() * 6;
        const duration = 5 + Math.random() * 8;
        
        orb.style.cssText = `
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${isDarkTheme ? 
            `radial-gradient(circle, rgba(88, 166, 255, ${0.7 + Math.random() * 0.3}), rgba(188, 140, 255, ${0.3 + Math.random() * 0.3}))` :
            `radial-gradient(circle, rgba(9, 105, 218, ${0.5 + Math.random() * 0.3}), rgba(124, 58, 237, ${0.2 + Math.random() * 0.2}))`};
          top: ${Math.random() * 100}%;
          left: ${Math.random() * 100}%;
          animation: float-${i % 3} ${duration}s ease-in-out infinite, orbGlow ${3 + Math.random() * 4}s ease-in-out infinite;
          animation-delay: ${delay}s, ${delay + 1}s;
          filter: blur(${0.5 + Math.random()}px);
          box-shadow: 0 0 ${size/2}px ${isDarkTheme ? 'rgba(88, 166, 255, 0.4)' : 'rgba(9, 105, 218, 0.3)'};
        `;
        
        bgPattern.appendChild(orb);
      }

      // Geometric shapes
      const triangle = document.createElement('div');
      triangle.style.cssText = `
        position: absolute;
        top: 10%;
        right: 15%;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 14px solid ${isDarkTheme ? 
          'rgba(88, 166, 255, 0.4)' : 
          'rgba(9, 105, 218, 0.35)'};
        animation: rotate 8s linear infinite;
        transform-origin: center;
      `;

      const circle = document.createElement('div');
      circle.style.cssText = `
        position: absolute;
        bottom: 20%;
        left: 10%;
        width: 12px;
        height: 12px;
        border: 2px solid ${isDarkTheme ? 
          'rgba(188, 140, 255, 0.5)' : 
          'rgba(124, 58, 237, 0.45)'};
        border-radius: 50%;
        animation: pulse 3s ease-in-out infinite;
      `;

      bgPattern.appendChild(triangle);
      bgPattern.appendChild(circle);

      // Gradient mesh overlay
      const meshOverlay = document.createElement('div');
      meshOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: ${isDarkTheme ? `
          radial-gradient(circle at 20% 30%, rgba(88, 166, 255, 0.04) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(188, 140, 255, 0.04) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(46, 160, 67, 0.03) 0%, transparent 50%)
        ` : `
          radial-gradient(circle at 20% 30%, rgba(9, 105, 218, 0.03) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(124, 58, 237, 0.03) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(40, 167, 69, 0.02) 0%, transparent 50%)
        `};
        pointer-events: none;
        z-index: 0;
        border-radius: 12px;
        animation: meshMove 12s ease-in-out infinite, meshGlow 6s ease-in-out infinite;
        transition: opacity 0.3s ease;
        opacity: 1;
      `;

      // Add background elements to card
      card.appendChild(meshOverlay);
      card.appendChild(bgPattern);

      // CSS animations
      const style = document.createElement('style');
      style.textContent = `
        @keyframes float-0 {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          33% { transform: translate(15px, -12px) rotate(120deg) scale(1.1); }
          66% { transform: translate(-8px, 8px) rotate(240deg) scale(0.9); }
        }
        @keyframes float-1 {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          25% { transform: translate(-12px, -8px) rotate(90deg) scale(1.2); }
          50% { transform: translate(-15px, -20px) rotate(180deg) scale(0.8); }
          75% { transform: translate(5px, -10px) rotate(270deg) scale(1.1); }
        }
        @keyframes float-2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          20% { transform: translate(18px, 12px) rotate(72deg) scale(1.3); }
          40% { transform: translate(-10px, 20px) rotate(144deg) scale(0.7); }
          60% { transform: translate(8px, -15px) rotate(216deg) scale(1.1); }
          80% { transform: translate(-12px, -8px) rotate(288deg) scale(0.9); }
        }
        @keyframes rotate {
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.1); }
          to { transform: rotate(360deg) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          25% { transform: scale(1.3); opacity: 0.9; }
          50% { transform: scale(1.5); opacity: 1; }
          75% { transform: scale(1.2); opacity: 0.8; }
        }
        @keyframes meshMove {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(3px, -3px) rotate(1deg); }
          50% { transform: translate(-2px, 4px) rotate(-1deg); }
          75% { transform: translate(2px, -2px) rotate(0.5deg); }
        }
        @keyframes patternPulse {
          0%, 100% { opacity: 0.9; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes meshGlow {
          0%, 100% { filter: brightness(1) contrast(1); }
          33% { filter: brightness(1.1) contrast(1.05); }
          66% { filter: brightness(0.95) contrast(0.98); }
        }
        @keyframes orbGlow {
          0%, 100% { 
            opacity: 1; 
            filter: blur(0.5px) brightness(1.1);
            transform: scale(1);
          }
          25% { 
            opacity: 1; 
            filter: blur(1px) brightness(1.3);
            transform: scale(1.1);
          }
          50% { 
            opacity: 1; 
            filter: blur(1.5px) brightness(1.5);
            transform: scale(1.2);
          }
          75% { 
            opacity: 1; 
            filter: blur(1px) brightness(1.2);
            transform: scale(1.05);
          }
        }
      `;
      
      if (!document.head.querySelector('#contributor-card-animations')) {
        style.id = 'contributor-card-animations';
        document.head.appendChild(style);
      }

      card._bgPattern = bgPattern;
      card._meshOverlay = meshOverlay;
    }

    async fetchHovercardData(username) {
      const cacheKey = `hovercard_${username}`;
      
      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }

      try {
        // Get repository ID from meta tag
        const repositoryId = this.getRepositoryId();
        if (!repositoryId) {
          throw new Error('Repository ID not found');
        }

        const hovercardUrl = `https://github.com/users/${username}/hovercard`;
        const params = new URLSearchParams({
          subject: `repository:${repositoryId}`,
          current_path: window.location.pathname
        });

        const response = await fetch(`${hovercardUrl}?${params}`, {
          headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const data = this.parseHovercardResponse(html);
        
        // Cache the result
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        return data;

      } catch (error) {
        Logger.warn(`Failed to fetch hovercard for ${username}: ${error.message}`);
        return null;
      }
    }

    getRepositoryId() {
      const metaTag = document.querySelector('meta[name="hovercard-subject-tag"]');
      if (!metaTag) return null;

      const content = metaTag.getAttribute('content');
      const match = content.match(/repository:(\d+)/);
      return match ? match[1] : null;
    }

    parseHovercardResponse(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      return {
        name: this.extractName(doc),
        commitInfo: this.extractInfo(doc, 'git-commit'),
        teamInfo: this.extractInfo(doc, 'people'),
        orgInfo: this.extractInfo(doc, 'organization'),
        company: this.extractCompany(doc),
        location: this.extractLocation(doc)
      };
    }

    extractName(doc) {
      const nameElement = doc.querySelector('.Truncate-text--expandable a.Link--secondary');
      return nameElement?.textContent.trim() || '';
    }

    extractInfo(doc, iconName) {
      return doc.querySelector(`.octicon-${iconName}`)
        ?.closest('.d-flex')
        ?.textContent.trim() || '';
    }

    extractCompany(doc) {
      const companyEl = doc.querySelector('[data-test-selector="profile-hovercard-company"]');
      return companyEl?.textContent.trim() || '';
    }

    extractLocation(doc) {
      const locationEl = doc.querySelector('[data-test-selector="profile-hovercard-location"]');
      return locationEl?.textContent.trim() || '';
    }

    enhanceCard(card, hovercardData) {
      if (!hovercardData) return;

      const details = card.querySelector('.contributor-details');
      if (!details) return;

      const cardStyles = card._cardStyles;
      const infoItems = [];

      // Add real name
      if (hovercardData.name) {
        infoItems.push(`👤 ${hovercardData.name}`);
      }

      // Add company
      if (hovercardData.company && this.settings.showOrgInfo) {
        infoItems.push(`🏢 ${hovercardData.company}`);
      }

      // Add location
      if (hovercardData.location) {
        infoItems.push(`📍 ${hovercardData.location}`);
      }

      // Add commit info
      if (hovercardData.commitInfo && this.settings.showCommitInfo) {
        infoItems.push(`💻 ${hovercardData.commitInfo}`);
      }

      // Display all info items
      if (infoItems.length > 0) {
        details.innerHTML = infoItems.join('<br>');
      }
    }



    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
        '9, 105, 218';
    }

    addToggleFunctionality(originalList, enhancedContainer) {
      // Find or create toggle button
      const contributorsSection = originalList.closest('.BorderGrid-row');
      if (!contributorsSection) return;

      let toggleButton = contributorsSection.querySelector('.github-enhancer-toggle');
      
      if (!toggleButton) {
        toggleButton = document.createElement('button');
        toggleButton.className = 'github-enhancer-toggle';
        toggleButton.textContent = 'Show Enhanced';
        toggleButton.style.cssText = `
          background: #0969da;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
          cursor: pointer;
          margin-left: 8px;
        `;

        const header = contributorsSection.querySelector('h2, .f5');
        if (header) {
          header.appendChild(toggleButton);
        }
      }

      let showingEnhanced = true;
      originalList.style.display = 'none';

      toggleButton.addEventListener('click', () => {
        if (showingEnhanced) {
          enhancedContainer.style.display = 'none';
          originalList.style.display = '';
          toggleButton.textContent = 'Show Enhanced';
        } else {
          enhancedContainer.style.display = '';
          originalList.style.display = 'none';
          toggleButton.textContent = 'Show Original';
        }
        showingEnhanced = !showingEnhanced;
      });
    }

    insertContributorStyles() {
      if (document.getElementById('github-enhancer-contributor-styles')) return;

      const style = document.createElement('style');
      style.id = 'github-enhancer-contributor-styles';
      style.textContent = `
        .github-enhancer-contributor-card:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        
        .github-enhancer-toggle:hover {
          background: #0860ca !important;
        }
        
        @media (prefers-color-scheme: dark) {
          .github-enhancer-contributor-card {
            background: #21262d !important;
            border-color: #30363d !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    cleanup() {
      this.enhancementInProgress = false;
      this.cache.clear();
      this.stopObserving();
    }
  }

  return ContributorEnhancerClass;
})();

window.ContributorEnhancer = ContributorEnhancer; 