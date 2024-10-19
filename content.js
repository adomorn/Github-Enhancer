function observeRelativeTimes() {
  const targetElement = document.querySelector('relative-time');
  if (targetElement) {
    console.debug(`Found ${targetElement}`);
    enhanceRelativeTimes();
  }
}

async function observeContributors() {
  const targetElement = Array.from(document.querySelectorAll('.BorderGrid-row'))
    .find(row => row.textContent.includes('Contributors'));
  if (targetElement) {
    console.debug(`Found ${targetElement}`);
    enhanceContributors(await GithubExtensionSettings.loadSettings());
  }
}

function observerAndRegister() {
  GithubExtensionSettings.loadSettings().then(settings => {
    if (settings.enhanceContributors) {
      observeDomForElement(observeContributors);
    }
    observeDomForElement(observeRelativeTimes);
  }).catch(error => {
    debug(`Error loading settings: ${error}`);
  });
}

async function enhanceGitHub() {
  const settings = await GithubExtensionSettings.loadSettings();
  debug("enhanceGitHub fonksiyonu çağrıldı");
  observerAndRegister();
}

function initialize() {
  debug("Initialize fonksiyonu çağrıldı");
  if (typeof GithubExtensionSettings === 'object' && typeof GithubExtensionSettings.initSettings === 'function') {
    GithubExtensionSettings.initSettings();
    enhanceGitHub();
    setupNavigationObserver();
  } else {
    debug("HATA: GithubExtensionSettings objesi veya initSettings fonksiyonu bulunamadı");
  }
}

function setupNavigationObserver() {
  debug("Navigation observer kurulumu başladı");

  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      enhanceGitHub();
    }
  }).observe(document, { subtree: true, childList: true });

  const contentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        const addedNode = mutation.addedNodes[0];
        if (addedNode.nodeType === Node.ELEMENT_NODE &&
          (addedNode.classList.contains('repository-content') ||
            addedNode.querySelector('.repository-content'))) {
          debug("Yeni repository içeriği tespit edildi");
          setTimeout(() => {
            enhanceGitHub();
            if (typeof enhanceRelativeTimes === 'function') {
              enhanceRelativeTimes();
            }
          }, 1000);
        }
      }
    });
  });

  contentObserver.observe(document.body, { childList: true, subtree: true });

  debug("Navigation observer kurulumu tamamlandı");
}

initialize();