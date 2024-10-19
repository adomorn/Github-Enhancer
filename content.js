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
    isEnhancing = false;
    enhancementComplete = false;
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
  } else {
    debug("HATA: GithubExtensionSettings objesi veya initSettings fonksiyonu bulunamadı");
  }
}



initialize();