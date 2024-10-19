// Global variables
let isEnhancing = false;
let enhancementComplete = false;

function enhanceContributors(settings) {
  debug("enhanceContributors function started");
  if (isEnhancing || enhancementComplete) {
    debug("Enhancement already in progress or completed");
    return;
  }
  isEnhancing = true;

  const contributorsSection = Array.from(document.querySelectorAll('.BorderGrid-row'))
    .find(row => row.textContent.includes('Contributors'));

  if (!contributorsSection) {
    debug("Contributors section not found");
    isEnhancing = false;
    return;
  }

  debug("Contributors section found");

  // Add link to the CSS file
  if (!document.querySelector('link[href$="github-extension-styles.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('github-extension-styles.css');
    document.head.appendChild(link);
    debug("CSS file link added");
  }

  const contributorItems = contributorsSection.querySelectorAll('li');
  debug(`${contributorItems.length} contributors found`);
  let enhancedCount = 0;

  // Create a container for the cards
  const cardsContainer = document.createElement('div');
  cardsContainer.classList.add('contributor-cards-container');

  contributorItems.forEach((item, index) => {
    if (index >= settings.maxCards) {
      debug(`Maximum card count (${settings.maxCards}) reached`);
      return;
    }

    const link = item.querySelector('a');
    if (!link) {
      debug(`Link not found for contributor ${index}`);
      return;
    }

    const card = createContributorCard(link);
    cardsContainer.appendChild(card);

    const username = link.getAttribute('href').split('/').pop();
    debug(`Creating card for ${username}`);

    fetchHovercardData(username).then(hovercardData => {
      updateCardWithHovercardData(card, username, hovercardData, settings);
      enhancedCount++;
      debug(`Card updated for ${username}. Total: ${enhancedCount}`);
      checkCompletion(enhancedCount, Math.min(contributorItems.length, settings.maxCards));
    }).catch(error => {
      debug(`Error fetching data for ${username}: ${error}`);
      updateCardWithHovercardData(card, username, null, settings);
      enhancedCount++;
      checkCompletion(enhancedCount, Math.min(contributorItems.length, settings.maxCards));
    });
  });

  // Replace the original list with our new container
  const contributorsList = contributorsSection.querySelector('ul');
  if (contributorsList) {
    debug("Replacing original contributor list with new cards");
    contributorsList.parentNode.replaceChild(cardsContainer, contributorsList);
  } else {
    debug("ERROR: Original contributor list not found");
  }
}

function createContributorCard(link) {
  const card = document.createElement('div');
  card.classList.add('contributor-card');

  const avatar = link.querySelector('img');
  if (avatar) {
    const avatarClone = avatar.cloneNode(true);
    avatarClone.classList.add('contributor-avatar');
    card.appendChild(avatarClone);
  }

  const detailsDiv = document.createElement('div');
  detailsDiv.classList.add('contributor-details');
  card.appendChild(detailsDiv);

  return card;
}

function updateCardWithHovercardData(card, username, hovercardData, settings) {
    const detailsDiv = card.querySelector('.contributor-details');
    if (hovercardData) {
      let cardContent = `
        <div class="contributor-main-info">
          <div class="contributor-username">@${username}</div>
          ${hovercardData.name ? `<div class="contributor-name">${hovercardData.name}</div>` : ''}
        </div>
        <div class="contributor-extra-info">
      `;
      
      if (settings.showCommitInfo && hovercardData.commitInfo) {
        cardContent += `<div class="contributor-info">${hovercardData.commitInfo}</div>`;
      }
      
      if (settings.showTeamInfo && hovercardData.teamInfo) {
        cardContent += `<div class="contributor-info">${hovercardData.teamInfo}</div>`;
      }
      
      if (settings.showOrgInfo && hovercardData.orgInfo) {
        cardContent += `<div class="contributor-info">${hovercardData.orgInfo}</div>`;
      }
      
      cardContent += '</div>';
      
      detailsDiv.innerHTML = cardContent;
    } else {
      detailsDiv.innerHTML = `
        <div class="contributor-main-info">
          <div class="contributor-username">@${username}</div>
        </div>
        <div class="contributor-extra-info">
          <div class="contributor-info">Error fetching details</div>
        </div>
      `;
    }
  }
  
  // Diğer fonksiyonlar aynı kalabilir

function checkCompletion(enhancedCount, totalCount) {
  if (enhancedCount === totalCount) {
    finishEnhancement();
  }
}

function finishEnhancement() {
  debug("Enhancement complete");
  isEnhancing = false;
  enhancementComplete = true;
}

function getRepositoryInfo() {
  const metaTag = document.querySelector('meta[name="hovercard-subject-tag"]');
  if (metaTag) {
    const content = metaTag.getAttribute('content');
    const match = content.match(/repository:(\d+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function fetchHovercardData(username) {
  const repositoryId = getRepositoryInfo();
  if (!repositoryId) {
    debug('Repository ID not found');
    return null;
  }

  const hovercardUrl = `https://github.com/users/${username}/hovercard`;
  const params = new URLSearchParams({
    subject: `repository:${repositoryId}`,
    current_path: window.location.pathname
  });

  try {
    const response = await fetch(`${hovercardUrl}?${params}`, {
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const nameElement = doc.querySelector('.Truncate-text--expandable a.Link--secondary');
    const name = nameElement ? nameElement.textContent.trim() : '';

    const commitInfo = doc.querySelector('.octicon-git-commit')?.closest('.d-flex')?.textContent.trim();
    const teamInfo = doc.querySelector('.octicon-people')?.closest('.d-flex')?.textContent.trim();
    const orgInfo = doc.querySelector('.octicon-organization')?.closest('.d-flex')?.textContent.trim();

    return {
      name,
      commitInfo,
      teamInfo,
      orgInfo
    };
  } catch (error) {
    debug(`Error fetching hovercard data for ${username}: ${error}`);
    return null;
  }
}

// Note: debug function is assumed to be available globally
// It should be defined in utils.js