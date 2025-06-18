/**
 * Theme Enhancer for GitHub
 * Applies modern animations and glassmorphism effects across GitHub
 */

const ThemeEnhancer = (() => {
  const Logger = window.Logger;
  const BaseEnhancer = window.BaseEnhancer;
  const DOMUtils = window.DOMUtils;

  class ThemeEnhancerClass extends BaseEnhancer {
    constructor(name = 'ThemeEnhancer') {
      super(name);
      this.isActive = false;
      this.animationObserver = null;
      this.styleElement = null;
      this.orbContainer = null;
    }

    async setup() {
      Logger.info('Setting up Theme Enhancer...');
      
      try {
        await this.insertGlobalThemeStyles();
        await this.setupScrollAnimations();
        this.setupCursorTrail();
        this.setupStarButtonEnhancements();
        this.setupMicroInteractions();
      this.isActive = true;
        Logger.info('Theme Enhancer setup completed');
      } catch (error) {
        Logger.logError(error, { context: 'Theme Enhancer setup' });
      }
    }

    shouldEnhance(mutations) {
      if (!this.isActive) return false;
      
      // Check for new elements that need theme enhancement
      return mutations.some(mutation => {
        return mutation.addedNodes && 
               Array.from(mutation.addedNodes).some(node => 
                 node.nodeType === Node.ELEMENT_NODE &&
                 (node.matches && (
                   node.matches('.js-navigation-item') ||
                  node.matches('.Box') ||
                  node.matches('.UnderlineNav') ||
                  node.matches('.Header') ||
                   node.matches('.repository-content') ||
                   node.matches('.btn') ||
                   node.matches('.Button')
                 ))
               );
      });
    }

    async enhance() {
      try {
        Logger.debug('Running theme enhancement...');
        
        this.enhanceBoxElements();
        this.enhanceNavigationItems();
        this.enhanceButtons();
        this.enhanceCards();
        this.enhanceHeaders();
        this.addFloatingElements();
        
        Logger.debug('Theme enhancement completed');
      } catch (error) {
        Logger.logError(error, { context: 'Theme enhancement failed' });
      }
    }

    async insertGlobalThemeStyles() {
      try {
        // Remove existing styles if any
        if (this.styleElement) {
          this.styleElement.remove();
        }

      const isDarkTheme = this.detectDarkTheme();
        Logger.debug(`Theme detected: ${isDarkTheme ? 'dark' : 'light'}`);
      
      const css = `
          /* GitHub Enhancer Theme Styles */
        :root {
          --gh-enhancer-primary: ${isDarkTheme ? '#58a6ff' : '#0969da'};
          --gh-enhancer-secondary: ${isDarkTheme ? '#bc8cff' : '#7c3aed'};
          --gh-enhancer-success: ${isDarkTheme ? '#2ea043' : '#1a7f37'};
          --gh-enhancer-glass-bg: ${isDarkTheme ? 'rgba(22, 27, 34, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
          --gh-enhancer-glass-border: ${isDarkTheme ? 'rgba(240, 246, 252, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          --gh-enhancer-shadow: ${isDarkTheme ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(0, 0, 0, 0.12)'};
          --gh-enhancer-glow: ${isDarkTheme ? 'rgba(88, 166, 255, 0.3)' : 'rgba(9, 105, 218, 0.3)'};
        }

          /* 🌌 Dynamic Floating Orbs Background - Dramatic Effect */
          body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
              radial-gradient(circle at 10% 20%, rgba(88, 166, 255, 0.08) 0%, transparent 40%),
              radial-gradient(circle at 90% 80%, rgba(188, 140, 255, 0.06) 0%, transparent 40%),
              radial-gradient(circle at 70% 30%, rgba(46, 160, 67, 0.05) 0%, transparent 35%),
              radial-gradient(circle at 30% 70%, rgba(248, 81, 73, 0.07) 0%, transparent 45%),
              radial-gradient(circle at 50% 10%, rgba(255, 215, 0, 0.04) 0%, transparent 30%);
            animation: orbFloat1 25s ease-in-out infinite;
            pointer-events: none;
            z-index: 0;
          }

          /* Second layer of floating orbs */
          body::after {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
              radial-gradient(circle at 80% 10%, rgba(138, 43, 226, 0.05) 0%, transparent 35%),
              radial-gradient(circle at 20% 90%, rgba(0, 255, 127, 0.04) 0%, transparent 40%),
              radial-gradient(circle at 60% 60%, rgba(255, 20, 147, 0.03) 0%, transparent 30%),
              radial-gradient(circle at 40% 20%, rgba(88, 166, 255, 0.06) 0%, transparent 45%);
            animation: orbFloat2 30s ease-in-out infinite reverse;
            pointer-events: none;
            z-index: 0;
          }

          @keyframes orbFloat1 {
            0%, 100% { 
              transform: translate(0px, 0px) scale(1);
              opacity: 0.7;
            }
            25% { 
              transform: translate(20px, -15px) scale(1.1);
              opacity: 0.9;
            }
            50% { 
              transform: translate(-10px, 10px) scale(0.9);
              opacity: 0.8;
            }
            75% { 
              transform: translate(15px, -5px) scale(1.05);
              opacity: 0.85;
            }
          }

          @keyframes orbFloat2 {
            0%, 100% { 
              transform: translate(0px, 0px) scale(1) rotate(0deg);
              opacity: 0.6;
            }
            33% { 
              transform: translate(-25px, 20px) scale(1.15) rotate(120deg);
              opacity: 0.8;
            }
            66% { 
              transform: translate(10px, -25px) scale(0.85) rotate(240deg);
              opacity: 0.75;
            }
          }

          /* 🌟 Interactive Cursor Trail - Binary Particles */
          .cursor-trail {
            position: fixed;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            font-weight: bold;
            color: rgba(0, 255, 127, 0.3);
            pointer-events: none;
            z-index: 9999;
            text-shadow: 0 0 2px rgba(0, 255, 127, 0.15);
            user-select: none;
            transform-origin: center center;
          }

          /* Binary trail fade animation that preserves rotation */
          .cursor-trail {
            animation: binaryTrailFade 2.5s ease-out forwards;
          }

          .cursor-trail.zero {
            color: rgba(88, 166, 255, 0.3);
            text-shadow: 0 0 2px rgba(88, 166, 255, 0.15);
          }

          .cursor-trail.one {
            color: rgba(0, 255, 127, 0.3);
            text-shadow: 0 0 2px rgba(0, 255, 127, 0.15);
          }

          .cursor-trail.matrix {
            color: rgba(0, 255, 0, 0.25);
            text-shadow: 0 0 2px rgba(0, 255, 0, 0.2);
            font-size: 10px;
          }

          .cursor-trail.cyber {
            color: rgba(255, 20, 147, 0.25);
            text-shadow: 0 0 2px rgba(255, 20, 147, 0.15);
            font-size: 14px;
          }

          @keyframes binaryTrailFade {
            0% { 
              opacity: 1; 
              transform: scale(1);
            }
            25% {
              opacity: 0.8;
              transform: scale(1.1);
            }
            70% {
              opacity: 0.3;
              transform: scale(0.8);
            }
            100% { 
              opacity: 0; 
              transform: scale(0.3);
            }
          }

          /* 🌟 ENHANCED STAR/LIKE BUTTON ANIMATIONS */
          .btn[aria-label*="Star"], 
          .btn[aria-label*="Unstar"],
          .btn[data-action="star"],
          .btn-with-count,
          [data-testid="star-button"],
          .js-social-form button {
            position: relative !important;
            overflow: hidden !important;
            transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
            background: linear-gradient(135deg, 
              rgba(255, 255, 255, 0.05) 0%, 
              rgba(255, 255, 255, 0.02) 100%) !important;
            backdrop-filter: blur(10px) !important;
            border: 2px solid transparent !important;
            transform-style: preserve-3d !important;
          }

          /* Magical glow on hover - Fixed Position */
          .btn[aria-label*="Star"]:hover,
          .btn[aria-label*="Unstar"]:hover,
          .btn[data-action="star"]:hover,
          .btn-with-count:hover,
          [data-testid="star-button"]:hover,
          .js-social-form button:hover {
            background: linear-gradient(135deg, 
              #ffd700 0%, 
              #ffed4e 25%,
              #fff700 50%,
              #ffa500 75%,
              #ff8c00 100%) !important;
            color: #000 !important;
            border: 2px solid #ffd700 !important;
            box-shadow: 
              0 0 30px rgba(255, 215, 0, 0.8),
              0 0 60px rgba(255, 215, 0, 0.5),
              0 0 90px rgba(255, 215, 0, 0.3),
              inset 0 0 20px rgba(255, 255, 255, 0.3) !important;
            animation: starMagicGlow 1.5s ease-in-out infinite !important;
            text-shadow: 0 0 10px rgba(0, 0, 0, 0.5) !important;
          }

          /* Sparkle border animation */
          .btn[aria-label*="Star"]:hover::before,
          .btn[data-action="star"]:hover::before,
          [data-testid="star-button"]:hover::before {
            content: '';
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            background: linear-gradient(45deg, 
              #ffd700, #ffed4e, #fff700, #ffa500, 
              #ff8c00, #ffd700, #ffed4e, #fff700);
            background-size: 400% 400%;
            border-radius: inherit;
            z-index: -1;
            animation: sparkleRotate 2s linear infinite;
          }

          /* Click explosion effect */
          .btn[aria-label*="Star"]:active,
          .btn[aria-label*="Unstar"]:active,
          .btn[data-action="star"]:active {
            animation: starMegaExplosion 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
            transform: scale(1.2) rotateZ(15deg) !important;
          }

          @keyframes starMagicGlow {
            0%, 100% { 
              filter: brightness(1) saturate(1);
              box-shadow: 
                0 0 30px rgba(255, 215, 0, 0.8),
                0 0 60px rgba(255, 215, 0, 0.5),
                0 0 90px rgba(255, 215, 0, 0.3),
                inset 0 0 20px rgba(255, 255, 255, 0.3);
            }
            50% {
              filter: brightness(1.2) saturate(1.3);
              box-shadow: 
                0 0 40px rgba(255, 215, 0, 1),
                0 0 80px rgba(255, 215, 0, 0.7),
                0 0 120px rgba(255, 215, 0, 0.5),
                inset 0 0 30px rgba(255, 255, 255, 0.5);
            }
          }

          @keyframes sparkleRotate {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }

          @keyframes starMegaExplosion {
            0% { 
              transform: scale(1.08) rotateZ(0deg);
              filter: brightness(1);
            }
            25% { 
              transform: scale(1.3) rotateZ(5deg);
              filter: brightness(1.5) saturate(2);
            }
            50% { 
              transform: scale(1.5) rotateZ(10deg);
              filter: brightness(2) saturate(3);
            }
            75% { 
              transform: scale(1.4) rotateZ(8deg);
              filter: brightness(1.3) saturate(1.5);
            }
            100% { 
              transform: scale(1.1) rotateZ(0deg);
              filter: brightness(1);
            }
          }

          /* Subtle floating stars on hover */
          .btn[aria-label*="Star"]:hover::after,
          .btn[data-action="star"]:hover::after,
          [data-testid="star-button"]:hover::after {
            content: '✨';
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 12px;
            opacity: 0;
            animation: subtleFloatingStars 3s ease-in-out infinite;
            pointer-events: none;
            z-index: 10;
          }

          @keyframes subtleFloatingStars {
            0% { 
              opacity: 0; 
              transform: translateX(-50%) translateY(0px) scale(0.3);
            }
            50% { 
              opacity: 0.7; 
              transform: translateX(-50%) translateY(-8px) scale(0.8);
            }
            100% { 
              opacity: 0; 
              transform: translateX(-50%) translateY(-15px) scale(0.3);
            }
          }

          /* 💫 Enhanced 3D Glassmorphism Effects */
        .Box:not(.github-enhancer-contributor-card), 
        .Box-row:not(.github-enhancer-contributor-card), 
        .Box-header:not(.github-enhancer-contributor-card) {
          backdrop-filter: blur(12px) !important;
          background: var(--gh-enhancer-glass-bg) !important;
          border: 1px solid var(--gh-enhancer-glass-border) !important;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
          position: relative !important;
          overflow: hidden !important;
            transform-style: preserve-3d !important;
        }

        .Box:not(.github-enhancer-contributor-card):hover {
            transform: translateY(-8px) rotateX(5deg) rotateY(-2deg) !important;
            box-shadow: 
              var(--gh-enhancer-shadow),
              0 0 30px var(--gh-enhancer-glow) !important;
            border-color: var(--gh-enhancer-primary) !important;
            background: linear-gradient(135deg, 
              var(--gh-enhancer-glass-bg), 
              rgba(88, 166, 255, 0.1)) !important;
          }

          /* 3D Card flip effect for repository cards */
          .Box.pinned-repo-item {
            perspective: 1000px !important;
          }

          .Box.pinned-repo-item:hover {
            transform: rotateY(10deg) rotateX(5deg) translateZ(20px) !important;
          }

          /* ⚡ Enhanced Buttons with 3D Effects */
          .btn, .Button {
            position: relative !important;
            overflow: hidden !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            backdrop-filter: blur(8px) !important;
            transform-style: preserve-3d !important;
          }

          .btn::before, .Button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, 
              transparent, 
              rgba(255, 255, 255, 0.2), 
              transparent);
            transition: left 0.5s ease;
          }

          .btn:hover::before, .Button:hover::before {
            left: 100%;
          }

          .btn:hover, .Button:hover {
            transform: translateY(-3px) translateZ(10px) !important;
            box-shadow: 
              0 10px 25px rgba(0, 0, 0, 0.3),
              0 0 20px var(--gh-enhancer-glow) !important;
          border-color: var(--gh-enhancer-primary) !important;
        }

          /* 🎯 Navigation with Modern Hover */
        .UnderlineNav-item, .js-navigation-item {
          position: relative !important;
          transition: all 0.3s ease !important;
          overflow: hidden !important;
        }

        .UnderlineNav-item::before, .js-navigation-item::before {
          content: '';
          position: absolute;
            bottom: 0;
            left: 50%;
            width: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--gh-enhancer-primary), var(--gh-enhancer-secondary));
            transition: all 0.3s ease;
            transform: translateX(-50%);
        }

        .UnderlineNav-item:hover::before, .js-navigation-item:hover::before {
            width: 100%;
        }

        .UnderlineNav-item:hover, .js-navigation-item:hover {
            transform: translateY(-2px);
          color: var(--gh-enhancer-primary) !important;
            text-shadow: 0 0 10px var(--gh-enhancer-glow);
        }

          /* 📁 File Browser with Slide Animation */
          .react-directory-row, [data-testid="tree-view-item"] {
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
          position: relative !important;
            border-radius: 8px !important;
          }

          .react-directory-row:hover, [data-testid="tree-view-item"]:hover {
            background: linear-gradient(90deg, 
              var(--gh-enhancer-glass-bg), 
              rgba(88, 166, 255, 0.1)) !important;
            transform: translateX(12px) scale(1.02) !important;
            border-left: 4px solid var(--gh-enhancer-primary) !important;
            box-shadow: 0 4px 15px rgba(88, 166, 255, 0.2) !important;
          }

          /* 💬 Comment Expand/Collapse Animations */
          .js-comment-body, .comment-body {
            transition: all 0.4s ease !important;
          }

          .js-comment-body.collapsed {
            max-height: 100px !important;
            overflow: hidden !important;
            opacity: 0.7 !important;
          }

          /* 📝 Code Folding Animations */
          .js-file-content, .highlight {
            transition: all 0.3s ease !important;
          }

          .js-file-content:hover, .highlight:hover {
            background: var(--gh-enhancer-glass-bg) !important;
            transform: translateX(4px) !important;
            border-left: 3px solid var(--gh-enhancer-primary) !important;
          }

          /* 🔥 Repository Header with Gradient */
        .Header, .repository-content .Box-header {
            background: linear-gradient(135deg, 
              var(--gh-enhancer-glass-bg), 
              rgba(88, 166, 255, 0.05)) !important;
          backdrop-filter: blur(20px) !important;
          border-bottom: 1px solid var(--gh-enhancer-glass-border) !important;
          position: relative !important;
        }

          .Header::after, .repository-content .Box-header::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
            background: linear-gradient(90deg, 
              var(--gh-enhancer-primary), 
              var(--gh-enhancer-secondary), 
              var(--gh-enhancer-success),
              var(--gh-enhancer-primary));
            background-size: 200% 100%;
            animation: headerGradient 3s linear infinite;
          }

          @keyframes headerGradient {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }

          /* 🌟 Enhanced Code Blocks */
        .highlight, .blob-code {
          background: var(--gh-enhancer-glass-bg) !important;
          backdrop-filter: blur(8px) !important;
          border-radius: 8px !important;
          transition: all 0.3s ease !important;
            position: relative !important;
        }

        .highlight:hover, .blob-code:hover {
          transform: translateY(-1px) !important;
            box-shadow: 0 4px 12px rgba(88, 166, 255, 0.2) !important;
            border-left: 3px solid var(--gh-enhancer-primary) !important;
          }

          /* ✨ Loading States */
        .github-enhancer-loading {
          position: relative;
          overflow: hidden;
        }

        .github-enhancer-loading::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
            background: linear-gradient(90deg, 
              transparent, 
              var(--gh-enhancer-glow), 
              transparent);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }

          /* 🎨 Staggered Fade-in Animation */
        .github-enhancer-fade-in {
          animation: fadeInUp 0.6s ease forwards;
          opacity: 0;
          transform: translateY(20px);
        }

        .github-enhancer-fade-in:nth-child(1) { animation-delay: 0.1s; }
        .github-enhancer-fade-in:nth-child(2) { animation-delay: 0.2s; }
        .github-enhancer-fade-in:nth-child(3) { animation-delay: 0.3s; }
        .github-enhancer-fade-in:nth-child(4) { animation-delay: 0.4s; }
        .github-enhancer-fade-in:nth-child(5) { animation-delay: 0.5s; }

        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

          /* 💫 Pulse Animation for Interactive Elements */
          .github-enhancer-pulse {
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 var(--gh-enhancer-glow);
            }
            70% {
              box-shadow: 0 0 0 10px transparent;
            }
            100% {
              box-shadow: 0 0 0 0 transparent;
            }
          }

          /* 🎆 Ripple Effect Keyframes */
          @keyframes ripple {
            to {
              transform: scale(2);
              opacity: 0;
            }
          }

          /* ⚡ Enhanced Focus States */
        *:focus {
          outline: 2px solid var(--gh-enhancer-primary) !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 0 4px var(--gh-enhancer-glow) !important;
        }

          /* 🎭 Reduce motion for accessibility */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `;

        this.styleElement = DOMUtils.insertCSS(css, 'github-enhancer-theme-styles');
        Logger.info('Theme styles inserted successfully');
      } catch (error) {
        Logger.logError(error, { context: 'Inserting theme styles' });
        throw error;
      }
    }

    enhanceBoxElements() {
      const boxes = document.querySelectorAll('.Box:not(.github-enhancer-themed):not(.github-enhancer-contributor-card)');
      boxes.forEach((box, index) => {
        box.classList.add('github-enhancer-themed', 'github-enhancer-fade-in');
        box.style.animationDelay = `${index * 0.1}s`;
      });
      if (boxes.length > 0) {
        Logger.debug(`Enhanced ${boxes.length} box elements`);
      }
    }

    enhanceNavigationItems() {
      const navItems = document.querySelectorAll('.js-navigation-item:not(.github-enhancer-themed), .UnderlineNav-item:not(.github-enhancer-themed)');
      navItems.forEach(item => {
        item.classList.add('github-enhancer-themed');
        
        // Add ripple effect on click
        item.addEventListener('click', this.createRippleEffect.bind(this));
      });
      if (navItems.length > 0) {
        Logger.debug(`Enhanced ${navItems.length} navigation items`);
      }
    }

    enhanceButtons() {
      const buttons = document.querySelectorAll('.btn:not(.github-enhancer-themed), .Button:not(.github-enhancer-themed)');
      buttons.forEach(button => {
        button.classList.add('github-enhancer-themed');
        
        // Add pulse effect for primary buttons
        if (button.classList.contains('btn-primary') || button.classList.contains('Button--primary')) {
          button.classList.add('github-enhancer-pulse');
        }

        // Add ripple effect on click
        button.addEventListener('click', this.createRippleEffect.bind(this));
      });
      if (buttons.length > 0) {
        Logger.debug(`Enhanced ${buttons.length} buttons`);
      }
    }

    enhanceCards() {
      const cards = document.querySelectorAll('.Box-row:not(.github-enhancer-themed):not(.github-enhancer-contributor-card)');
      cards.forEach((card, index) => {
        card.classList.add('github-enhancer-themed', 'github-enhancer-fade-in');
        card.style.animationDelay = `${index * 0.05}s`;
      });
      if (cards.length > 0) {
        Logger.debug(`Enhanced ${cards.length} card elements`);
      }
    }

    enhanceHeaders() {
      const headers = document.querySelectorAll('.Header:not(.github-enhancer-themed), .Box-header:not(.github-enhancer-themed)');
      headers.forEach(header => {
        header.classList.add('github-enhancer-themed');
      });
      if (headers.length > 0) {
        Logger.debug(`Enhanced ${headers.length} header elements`);
      }
    }

    addFloatingElements() {
      if (this.orbContainer || document.querySelector('.github-enhancer-floating-orbs')) {
        return;
      }

      try {
        // Create floating orbs container
        this.orbContainer = document.createElement('div');
        this.orbContainer.className = 'github-enhancer-floating-orbs';
        this.orbContainer.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
        `;
      
        const isDarkTheme = this.detectDarkTheme();
        const colors = isDarkTheme 
          ? ['#58a6ff', '#bc8cff', '#2ea043', '#f85149', '#ffd700', '#ff6b6b']
          : ['#0969da', '#7c3aed', '#1a7f37', '#d1242f', '#ff8c00', '#20b2aa'];

        // Create multiple types of floating elements
        for (let i = 0; i < 12; i++) {
          const orb = document.createElement('div');
          orb.className = 'floating-orb';
          
          const size = 15 + Math.random() * 25;
          const color = colors[Math.floor(Math.random() * colors.length)];
          const delay = Math.random() * 20;
          const duration = 15 + Math.random() * 15;
          const startX = Math.random() * 100;
          const startY = Math.random() * 100;
          
          orb.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: radial-gradient(circle, ${color}20, ${color}05, transparent);
            border: 1px solid ${color}30;
            border-radius: 50%;
            left: ${startX}%;
            top: ${startY}%;
            animation: floatOrb ${duration}s ease-in-out infinite;
            animation-delay: ${delay}s;
            box-shadow: 0 0 ${size}px ${color}15, inset 0 0 ${size/2}px ${color}10;
          `;
          
          this.orbContainer.appendChild(orb);
        }

        // Add some geometric particles
        for (let i = 0; i < 8; i++) {
          const particle = document.createElement('div');
          particle.className = 'floating-particle';
          
          const shapes = ['square', 'triangle', 'diamond'];
          const shape = shapes[Math.floor(Math.random() * shapes.length)];
          const color = colors[Math.floor(Math.random() * colors.length)];
          const size = 8 + Math.random() * 12;
          const delay = Math.random() * 25;
          const duration = 20 + Math.random() * 20;
          
          let shapeCSS = '';
          if (shape === 'square') {
            shapeCSS = `
              width: ${size}px;
              height: ${size}px;
              background: ${color}15;
              border: 1px solid ${color}25;
              transform: rotate(45deg);
            `;
          } else if (shape === 'triangle') {
            shapeCSS = `
              width: 0;
              height: 0;
              border-left: ${size/2}px solid transparent;
              border-right: ${size/2}px solid transparent;
              border-bottom: ${size}px solid ${color}20;
            `;
          } else {
            shapeCSS = `
              width: ${size}px;
              height: ${size}px;
              background: ${color}10;
              border: 1px solid ${color}20;
              transform: rotate(45deg);
              clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
            `;
          }
          
          particle.style.cssText = `
            position: absolute;
            ${shapeCSS}
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: floatParticle ${duration}s linear infinite;
            animation-delay: ${delay}s;
          `;
          
          this.orbContainer.appendChild(particle);
        }

        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
          @keyframes floatOrb {
            0%, 100% {
              transform: translate(0px, 0px) scale(1);
              opacity: 0.6;
            }
            25% {
              transform: translate(30px, -20px) scale(1.1);
              opacity: 0.8;
            }
            50% {
              transform: translate(-20px, 15px) scale(0.9);
              opacity: 0.7;
            }
            75% {
              transform: translate(25px, -10px) scale(1.05);
              opacity: 0.75;
            }
          }
          
          @keyframes floatParticle {
            0% {
              transform: translateY(100vh) rotate(0deg);
              opacity: 0;
            }
            10% {
              opacity: 0.6;
            }
            90% {
              opacity: 0.3;
            }
            100% {
              transform: translateY(-100px) rotate(360deg);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);

        document.body.appendChild(this.orbContainer);
        Logger.debug('Enhanced floating elements added');
      } catch (error) {
        Logger.logError(error, { context: 'Adding floating elements' });
      }
    }

    setupCursorTrail() {
      try {
        let lastTrailTime = 0;
        const trailDelay = 100; // Slower for binary particles

        document.addEventListener('mousemove', (e) => {
          const now = Date.now();
          if (now - lastTrailTime < trailDelay) return;
          
          lastTrailTime = now;
          
          const trail = document.createElement('div');
          trail.className = 'cursor-trail';
          
          // Random binary values and styles
          const binaryValue = Math.random() < 0.5 ? '0' : '1';
          const styles = ['zero', 'one', 'matrix', 'cyber'];
          
          // Set the binary content
          trail.textContent = binaryValue;
          
          // Random style based on binary value
          if (binaryValue === '0') {
            trail.classList.add(Math.random() < 0.7 ? 'zero' : 'matrix');
          } else {
            trail.classList.add(Math.random() < 0.7 ? 'one' : 'cyber');
          }
          
          // Subtle offset for more natural feel
          const offsetX = (Math.random() - 0.5) * 20;
          const offsetY = (Math.random() - 0.5) * 20;
          
          // Random rotation between -45 and 45 degrees for better visibility
          const randomRotation = (Math.random() - 0.5) * 90; // -45 to +45 degrees
          
          trail.style.left = (e.clientX + offsetX) + 'px';
          trail.style.top = (e.clientY + offsetY) + 'px';
          trail.style.transform = `rotate(${randomRotation}deg)`;
          trail.style.transformOrigin = 'center center';
          
          document.body.appendChild(trail);
          
          // Remove trail element after animation
          setTimeout(() => {
            if (trail.parentNode) {
              trail.remove();
            }
          }, 2500);
        });
        
        Logger.debug('Binary cursor trail setup completed');
      } catch (error) {
        Logger.logError(error, { context: 'Setting up cursor trail' });
      }
    }

    setupStarButtonEnhancements() {
      try {
        // Enhanced star button click effects
        const starSelectors = [
          '.btn[aria-label*="Star"]',
          '.btn[aria-label*="Unstar"]', 
          '.btn[data-action="star"]',
          '[data-testid="star-button"]',
          '.js-social-form button'
        ];

        starSelectors.forEach(selector => {
          document.addEventListener('click', (e) => {
            if (e.target.closest(selector)) {
              this.createStarExplosion(e);
            }
          });
        });

        Logger.debug('Star button enhancements setup completed');
      } catch (error) {
        Logger.logError(error, { context: 'Setting up star button enhancements' });
      }
    }

    createStarExplosion(event) {
      try {
        const button = event.target.closest('button, .btn');
        if (!button) return;

        // Create multiple star particles
        const colors = ['#ffd700', '#ffed4e', '#fff700', '#ffa500'];
        
        for (let i = 0; i < 8; i++) {
          const star = document.createElement('div');
          star.innerHTML = '⭐';
          star.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 9999;
            font-size: 16px;
            color: ${colors[Math.floor(Math.random() * colors.length)]};
            animation: starExplosion 1s ease-out forwards;
            animation-delay: ${i * 0.1}s;
          `;

          const rect = button.getBoundingClientRect();
          star.style.left = (rect.left + rect.width / 2) + 'px';
          star.style.top = (rect.top + rect.height / 2) + 'px';

          document.body.appendChild(star);

          // Random explosion direction
          const angle = (i / 8) * 2 * Math.PI;
          const distance = 100 + Math.random() * 50;
          const finalX = Math.cos(angle) * distance;
          const finalY = Math.sin(angle) * distance;

          star.style.setProperty('--final-x', finalX + 'px');
          star.style.setProperty('--final-y', finalY + 'px');

          setTimeout(() => star.remove(), 1000);
        }

        // Add explosion keyframes if not already added
        if (!document.querySelector('#star-explosion-keyframes')) {
          const style = document.createElement('style');
          style.id = 'star-explosion-keyframes';
          style.textContent = `
            @keyframes starExplosion {
              0% { 
                transform: translate(0, 0) scale(1) rotate(0deg);
                opacity: 1;
              }
              100% { 
                transform: translate(var(--final-x), var(--final-y)) scale(0) rotate(360deg);
                opacity: 0;
              }
            }
          `;
          document.head.appendChild(style);
        }
      } catch (error) {
        Logger.warn(`Star explosion error: ${error.message}`);
      }
    }

    setupMicroInteractions() {
      try {
        // Code folding hover effects
        this.setupCodeFoldingEffects();
        
        // Comment expand/collapse effects
        this.setupCommentEffects();
        
        // File tree interactions
        this.setupFileTreeEffects();

        Logger.debug('Micro-interactions setup completed');
      } catch (error) {
        Logger.logError(error, { context: 'Setting up micro-interactions' });
      }
    }

    setupCodeFoldingEffects() {
      document.addEventListener('mouseover', (e) => {
        const codeElement = e.target.closest('.highlight, .js-file-content');
        if (codeElement && !codeElement.classList.contains('github-enhancer-code-enhanced')) {
          codeElement.classList.add('github-enhancer-code-enhanced');
          
          // Add line number hover effects
          const lines = codeElement.querySelectorAll('.js-file-line');
          lines.forEach((line, index) => {
            line.addEventListener('mouseenter', () => {
              line.style.background = 'rgba(88, 166, 255, 0.1)';
              line.style.borderLeft = '3px solid var(--gh-enhancer-primary)';
              line.style.transform = 'translateX(4px)';
            });
            
            line.addEventListener('mouseleave', () => {
              line.style.background = '';
              line.style.borderLeft = '';
              line.style.transform = '';
            });
          });
        }
      });
    }

    setupCommentEffects() {
      document.addEventListener('click', (e) => {
        const expandButton = e.target.closest('.js-details-target');
        if (expandButton) {
          const commentBody = expandButton.closest('.js-comment').querySelector('.comment-body');
          if (commentBody) {
            commentBody.style.transition = 'all 0.4s ease';
          }
        }
      });
    }

    setupFileTreeEffects() {
      document.addEventListener('mouseover', (e) => {
        const fileRow = e.target.closest('.react-directory-row, [data-testid="tree-view-item"]');
        if (fileRow && !fileRow.classList.contains('github-enhancer-file-enhanced')) {
          fileRow.classList.add('github-enhancer-file-enhanced');
          
          // Add file type icon glow
          const icon = fileRow.querySelector('.octicon');
          if (icon) {
            fileRow.addEventListener('mouseenter', () => {
              icon.style.filter = 'drop-shadow(0 0 8px var(--gh-enhancer-primary))';
              icon.style.transform = 'scale(1.1)';
            });
            
            fileRow.addEventListener('mouseleave', () => {
              icon.style.filter = '';
              icon.style.transform = '';
            });
          }
        }
      });
    }

    setupScrollAnimations() {
      try {
      // Intersection Observer for scroll animations
      this.animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('github-enhancer-fade-in');
          }
        });
      }, {
        threshold: 0.1,
        rootMargin: '50px'
      });

      // Observe elements for scroll animations
      const observeElements = () => {
        const elements = document.querySelectorAll('.Box-row, .commit-group-title, .file-navigation');
        elements.forEach(el => {
          if (!el.classList.contains('github-enhancer-observed')) {
            el.classList.add('github-enhancer-observed');
            this.animationObserver.observe(el);
          }
        });
      };

      observeElements();
      
        // Re-observe on mutations with debounce
        const debouncedObserve = DOMUtils.debounce(observeElements, 300);
        const mutationObserver = new MutationObserver(debouncedObserve);
      
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

        Logger.debug('Scroll animations set up');
      } catch (error) {
        Logger.logError(error, { context: 'Setting up scroll animations' });
      }
    }

    createRippleEffect(event) {
      try {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      
      const size = Math.max(rect.width, rect.height);
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: radial-gradient(circle, var(--gh-enhancer-glow) 0%, transparent 70%);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
        z-index: 1;
      `;

      button.style.position = 'relative';
      button.appendChild(ripple);

      setTimeout(() => {
          if (ripple.parentNode) {
        ripple.remove();
          }
      }, 600);
      } catch (error) {
        Logger.warn(`Ripple effect error: ${error.message}`);
      }
    }

    detectDarkTheme() {
      return document.documentElement.getAttribute('data-color-mode') === 'dark' || 
             document.documentElement.getAttribute('data-dark-theme') === 'dark' ||
             document.body.classList.contains('dark') ||
             getComputedStyle(document.body).backgroundColor === 'rgb(13, 17, 23)';
    }

    cleanup() {
      try {
      if (this.animationObserver) {
        this.animationObserver.disconnect();
          this.animationObserver = null;
      }
      
      // Remove floating orbs
        if (this.orbContainer) {
          this.orbContainer.remove();
          this.orbContainer = null;
        }

        // Remove styles
        if (this.styleElement) {
          this.styleElement.remove();
          this.styleElement = null;
        }

        // Remove cursor trails
        const trails = document.querySelectorAll('.cursor-trail');
        trails.forEach(trail => trail.remove());

        // Remove star explosion keyframes
        const explosionStyles = document.querySelector('#star-explosion-keyframes');
        if (explosionStyles) {
          explosionStyles.remove();
      }
      
      this.isActive = false;
        Logger.info('Theme Enhancer cleaned up');
      } catch (error) {
        Logger.logError(error, { context: 'Theme Enhancer cleanup' });
      }
    }
  }

  return ThemeEnhancerClass;
})();

window.ThemeEnhancer = ThemeEnhancer; 