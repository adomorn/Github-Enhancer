const GitHubContributorEnhancer = (function() {
  // Private state
  const state = {
    isEnhancing: false,
    enhancementComplete: false,
    cache: new Map(), // Cache for API responses
    config: {
      maxCards: 10,
      cardWidth: 250,
      batchSize: 5,
      cacheExpiry: 1000 * 60 * 5, // 5 minutes
      retryAttempts: 3,
      retryDelay: 1000,
      animations: {
        enabled: true,
        duration: 300
      }
    }
  };

  // Custom error handling
  class ContributorError extends GitHubUtils.ExtensionError {
    constructor(message, type = 'CONTRIBUTOR_ERROR', originalError = null) {
      super(message, type, originalError);
      this.name = 'ContributorError';
    }
  }

  // Card creation utilities
  const cardBuilder = {
    createCard(link) {
      return GitHubUtils.createElement('div', {
        className: 'contributor-card',
        style: {
          width: `${state.config.cardWidth}px`
        }
      });
    },

    createAvatar(link) {
      const avatar = link.querySelector('img');
      if (!avatar) return null;

      const avatarClone = avatar.cloneNode(true);
      avatarClone.className = 'contributor-avatar';
      return avatarClone;
    },

    createDetailsSection() {
      return GitHubUtils.createElement('div', {
        className: 'contributor-details'
      });
    },

    buildCardContent(username, hovercardData, settings) {
      const mainInfo = GitHubUtils.createElement('div', {
        className: 'contributor-main-info'
      }, [
        GitHubUtils.createElement('div', {
          className: 'contributor-username'
        }, [`@${GitHubUtils.sanitizeHTML(username)}`])
      ]);

      if (hovercardData?.name) {
        mainInfo.appendChild(
          GitHubUtils.createElement('div', {
            className: 'contributor-name'
          }, [GitHubUtils.sanitizeHTML(hovercardData.name)])
        );
      }

      const extraInfo = GitHubUtils.createElement('div', {
        className: 'contributor-extra-info'
      });

      // Add additional info based on settings
      const infoItems = [];
      if (settings.showCommitInfo && hovercardData?.commitInfo) {
        infoItems.push(['commit', hovercardData.commitInfo]);
      }
      if (settings.showTeamInfo && hovercardData?.teamInfo) {
        infoItems.push(['team', hovercardData.teamInfo]);
      }
      if (settings.showOrgInfo && hovercardData?.orgInfo) {
        infoItems.push(['org', hovercardData.orgInfo]);
      }

      infoItems.forEach(([type, info], index) => {
        extraInfo.appendChild(
          GitHubUtils.createElement('div', {
            className: 'contributor-info',
            style: {
              transitionDelay: `${index * 0.1}s`
            }
          }, [GitHubUtils.sanitizeHTML(info)])
        );
      });

      return [mainInfo, extraInfo];
    }
  };

  // API handling
  const apiHandler = {
    getRepositoryInfo() {
      const metaTag = document.querySelector('meta[name="hovercard-subject-tag"]');
      if (!metaTag) {
        throw new ContributorError('Repository meta tag not found', 'META_TAG_NOT_FOUND');
      }

      const content = metaTag.getAttribute('content');
      const match = content.match(/repository:(\d+)/);
      if (!match) {
        throw new ContributorError('Invalid repository ID format', 'INVALID_REPO_ID');
      }

      return match[1];
    },

    async fetchHovercardData(username, retryCount = 0) {
      const cacheKey = `hovercard_${username}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      try {
        const repositoryId = this.getRepositoryInfo();
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
          throw new ContributorError(`HTTP error ${response.status}`, 'API_ERROR');
        }

        const data = await this.parseHovercardResponse(response);
        this.cacheData(cacheKey, data);
        return data;

      } catch (error) {
        if (retryCount < state.config.retryAttempts) {
          GitHubUtils.log.warn(`Retrying hovercard fetch for ${username} (${retryCount + 1}/${state.config.retryAttempts})`);
          await new Promise(resolve => setTimeout(resolve, state.config.retryDelay));
          return this.fetchHovercardData(username, retryCount + 1);
        }
        throw error;
      }
    },

    async parseHovercardResponse(response) {
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      return {
        name: this.extractName(doc),
        commitInfo: this.extractInfo(doc, 'git-commit'),
        teamInfo: this.extractInfo(doc, 'people'),
        orgInfo: this.extractInfo(doc, 'organization')
      };
    },

    extractName(doc) {
      const nameElement = doc.querySelector('.Truncate-text--expandable a.Link--secondary');
      return nameElement?.textContent.trim() || '';
    },

    extractInfo(doc, iconName) {
      return doc.querySelector(`.octicon-${iconName}`)
        ?.closest('.d-flex')
        ?.textContent.trim() || '';
    },

    getCachedData(key) {
      const cached = state.cache.get(key);
      if (cached && Date.now() - cached.timestamp < state.config.cacheExpiry) {
        return cached.data;
      }
      state.cache.delete(key);
      return null;
    },

    cacheData(key, data) {
      state.cache.set(key, {
        data,
        timestamp: Date.now()
      });
    }
  };

  // Main enhancement logic
  async function enhanceContributors(settings) {
    if (state.isEnhancing || state.enhancementComplete) {
      GitHubUtils.log.debug('Enhancement already in progress or completed');
      return;
    }

    try {
      state.isEnhancing = true;
      GitHubUtils.log.debug('Starting contributor enhancement');

      const contributorsSection = await findContributorsSection();
      const contributorItems = Array.from(contributorsSection.querySelectorAll('li'))
        .slice(0, settings.maxCards);

      const cardsContainer = GitHubUtils.createElement('div', {
        className: 'contributor-cards-container'
      });

      // Process contributors in batches
      for (let i = 0; i < contributorItems.length; i += state.config.batchSize) {
        const batch = contributorItems.slice(i, i + state.config.batchSize);
        await Promise.all(batch.map(item => processContributor(item, cardsContainer, settings)));
      }

      // Replace original list with enhanced cards
      const contributorsList = contributorsSection.querySelector('ul');
      if (contributorsList) {
        contributorsList.parentNode.replaceChild(cardsContainer, contributorsList);
      }

      state.enhancementComplete = true;
      GitHubUtils.log.info('Contributor enhancement completed successfully');

    } catch (error) {
      GitHubUtils.log.error('Enhancement failed:', error);
      throw new ContributorError('Enhancement failed', 'ENHANCEMENT_FAILED', error);
    } finally {
      state.isEnhancing = false;
    }
  }

  async function findContributorsSection() {
    const section = Array.from(document.querySelectorAll('.BorderGrid-row'))
      .find(row => row.textContent.includes('Contributors'));

    if (!section) {
      throw new ContributorError('Contributors section not found', 'SECTION_NOT_FOUND');
    }

    return section;
  }

  async function processContributor(item, container, settings) {
    const link = item.querySelector('a');
    if (!link) {
      throw new ContributorError('Contributor link not found', 'LINK_NOT_FOUND');
    }

    const username = link.getAttribute('href').split('/').pop();
    const card = cardBuilder.createCard(link);
    
    const avatar = cardBuilder.createAvatar(link);
    if (avatar) card.appendChild(avatar);

    const detailsDiv = cardBuilder.createDetailsSection();
    card.appendChild(detailsDiv);
    container.appendChild(card);

    try {
      const hovercardData = await apiHandler.fetchHovercardData(username);
      const content = cardBuilder.buildCardContent(username, hovercardData, settings);
      detailsDiv.append(...content);
    } catch (error) {
      GitHubUtils.log.warn(`Failed to fetch data for ${username}:`, error);
      const content = cardBuilder.buildCardContent(username, null, settings);
      detailsDiv.append(...content);
    }
  }

  // Public API
  return {
    enhance: enhanceContributors,
    
    configure(customConfig) {
      Object.assign(state.config, customConfig);
    },

    clearCache() {
      state.cache.clear();
    },

    reset() {
      state.isEnhancing = false;
      state.enhancementComplete = false;
      this.clearCache();
    },

    getState() {
      return {
        isEnhancing: state.isEnhancing,
        enhancementComplete: state.enhancementComplete,
        cacheSize: state.cache.size,
        config: { ...state.config }
      };
    }
  };
})();

// For backwards compatibility
window.enhanceContributors = GitHubContributorEnhancer.enhance;