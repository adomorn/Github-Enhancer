function debug(message) {
    console.log(`[GitHub Info Extension] ${message}`);
}

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

function fetchWithRetry(url, retries = 3) {
    return fetch(url).catch(function (err) {
        if (retries === 1) throw err;
        return fetchWithRetry(url, retries - 1);
    });
}


/**
 * Observes DOM mutations and triggers a callback when an element matching the query selector is found.
 * @param {string} querySelector - The CSS selector of the target element to observe.
 * @param {Function} callback - The callback function to execute when the target element is found.
 */
const observeDomForElement = (querySelector, callback) => {
    const observer = new MutationObserver((mutations, observerInstance) => {
        
        const targetElement = document.querySelector(querySelector);
        if (targetElement) {
            console.debug(`Found ${querySelector}`);
            //observerInstance.disconnect();
            callback();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
};

