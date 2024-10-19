// Debug fonksiyonu
function debug(message) {
    console.log(`[GitHub Info Extension] ${message}`);
  }
  
  // Tarih formatlama fonksiyonu
  function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Relative-time elementlerini güncelleme
  function enhanceRelativeTimes() {
    const relativeTimes = document.querySelectorAll('relative-time');
    debug(`Found ${relativeTimes.length} relative-time elements`);
  
    relativeTimes.forEach(element => {
      if (element.nextElementSibling && element.nextElementSibling.classList.contains('enhanced-date')) return;
  
      const dateTimeAttr = element.getAttribute('datetime');
      if (dateTimeAttr) {
        const formattedDate = formatDateTime(dateTimeAttr);
  
        const enhancedDate = document.createElement('div');
        enhancedDate.textContent = formattedDate;
        enhancedDate.classList.add('enhanced-date');
        enhancedDate.style.fontSize = '0.85em';
        enhancedDate.style.color = '#6a737d';
        enhancedDate.style.marginTop = '2px';
  
        element.parentNode.insertBefore(enhancedDate, element.nextSibling);
        debug(`Enhanced date added for ${dateTimeAttr}`);
      }
    });
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
      console.error('Repository ID not found');
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
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
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
      console.error(`Error fetching hovercard data for ${username}:`, error);
      return null;
    }
  }
  let isEnhancing = false;
  let enhancementComplete = false;
  function enhanceContributors() {
    if (isEnhancing || enhancementComplete) return;
    isEnhancing = true;
  
    const contributorsSection = Array.from(document.querySelectorAll('.BorderGrid-row'))
      .find(row => row.textContent.includes('Contributors'));
  
    if (!contributorsSection) {
      console.log("Contributors section not found");
      isEnhancing = false;
      return;
    }
  
    const contributorItems = contributorsSection.querySelectorAll('li');
    let enhancedCount = 0;
  
    // Create a container for the cards
    const cardsContainer = document.createElement('div');
    cardsContainer.style.display = 'flex';
    cardsContainer.style.overflowX = 'auto';
    cardsContainer.style.padding = '10px';
    cardsContainer.style.backgroundColor = '#0d1117';
    cardsContainer.style.borderRadius = '6px';
    cardsContainer.style.scrollbarWidth = 'thin';
    cardsContainer.style.scrollbarColor = '#30363d #0d1117';
  
    // Add custom scrollbar styles for webkit browsers
    const style = document.createElement('style');
    style.textContent = `
      .contributor-cards-container::-webkit-scrollbar {
        height: 8px;
      }
      .contributor-cards-container::-webkit-scrollbar-track {
        background: #0d1117;
      }
      .contributor-cards-container::-webkit-scrollbar-thumb {
        background-color: #30363d;
        border-radius: 20px;
        border: 3px solid #0d1117;
      }
    `;
    document.head.appendChild(style);
  
    contributorItems.forEach((item) => {
      const link = item.querySelector('a');
      if (!link) return;
  
      const card = document.createElement('div');
      card.style.flex = '0 0 auto';
      card.style.width = '200px';
      card.style.marginRight = '10px';
      card.style.backgroundColor = '#161b22';
      card.style.borderRadius = '6px';
      card.style.padding = '10px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'center';
      card.style.transition = 'transform 0.2s ease-in-out';
  
      const avatar = item.querySelector('img');
      if (avatar) {
        avatar.style.width = '64px';
        avatar.style.height = '64px';
        avatar.style.borderRadius = '50%';
        avatar.style.border = '2px solid #30363d';
        card.appendChild(avatar.cloneNode(true));
      }
  
      const username = link.getAttribute('href').split('/').pop();
  
      const detailsDiv = document.createElement('div');
      detailsDiv.classList.add('contributor-details');
      detailsDiv.style.fontSize = '0.75em';
      detailsDiv.style.color = '#8b949e';
      detailsDiv.style.marginTop = '10px';
      detailsDiv.style.textAlign = 'center';
      detailsDiv.innerHTML = '<div class="contributor-loading">Loading...</div>';
      card.appendChild(detailsDiv);
  
      fetchHovercardData(username).then(hovercardData => {
        if (hovercardData) {
          const nameDisplay = hovercardData.name ? `<div class="contributor-name" style="font-weight: bold; color: #c9d1d9;">${hovercardData.name}</div>` : '';
          detailsDiv.innerHTML = `
            <div class="contributor-username" style="font-weight: bold; color: #58a6ff;">@${username}</div>
            ${nameDisplay}
            ${hovercardData.commitInfo ? `<div class="contributor-commit-info" style="margin-top: 5px; font-size: 0.9em;">${hovercardData.commitInfo}</div>` : ''}
            ${hovercardData.teamInfo ? `<div class="contributor-team-info" style="margin-top: 3px; font-size: 0.9em;">${hovercardData.teamInfo}</div>` : ''}
            ${hovercardData.orgInfo ? `<div class="contributor-org-info" style="margin-top: 3px; font-size: 0.9em;">${hovercardData.orgInfo}</div>` : ''}
          `;
        } else {
          detailsDiv.innerHTML = `
            <div class="contributor-username" style="font-weight: bold; color: #58a6ff;">@${username}</div>
            <div class="contributor-error">Error fetching details</div>
          `;
        }
  
        enhancedCount++;
        checkCompletion();
      });
  
      // Hover effect
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-5px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
      });
  
      cardsContainer.appendChild(card);
    });
  
    // Replace the original list with our new cards container
    const contributorsList = contributorsSection.querySelector('ul');
    if (contributorsList) {
      contributorsList.parentNode.replaceChild(cardsContainer, contributorsList);
    }
  
    function checkCompletion() {
      if (enhancedCount === contributorItems.length) {
        finishEnhancement();
      }
    }
  }
  
  // ... (diğer fonksiyonlar aynı kalır)
  
  function finishEnhancement() {
    console.log("Enhancement complete");
    isEnhancing = false;
    enhancementComplete = true;
    observer.disconnect();
  }
  
  function fetchWithRetry(url, retries = 3) {
    return fetch(url).catch(function (err) {
      if (retries === 1) throw err;
      return fetchWithRetry(url, retries - 1);
    });
  }
  
  function enhanceGitHub() {
    console.log("Enhancing GitHub page");
    enhanceRelativeTimes();
    enhanceContributors();
  }
  
  // Sayfa yüklendiğinde çalıştır
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceGitHub);
  } else {
    enhanceGitHub();
  }
  
  // Gözlemciyi başlat
  const observer = new MutationObserver(() => {
    if (!isEnhancing && !enhancementComplete) {
      enhanceGitHub();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  console.log("Observer set up");