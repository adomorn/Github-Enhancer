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


const observeDomForElement = (callback) => {
    const observer = new MutationObserver((mutations, observerInstance) => {
        callback();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
};