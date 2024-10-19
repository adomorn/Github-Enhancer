/**
 * Logs a debug message to the console with a specific prefix.
 *
 * @param {string} message - The message to be logged.
 */
function debug(message) {
    console.log(`[GitHub Info Extension] ${message}`);
}

/**
 * Formats a given date-time string into a localized string representation.
 *
 * @param {string} dateTimeString - The date-time string to format.
 * @returns {string} The formatted date-time string in 'tr-TR' locale.
 */
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


/**
 * Observes the DOM for any changes in the child elements of the body and triggers the provided callback function.
 *
 * @param {Function} callback - The function to be called when a mutation is observed.
 */
const observeDomForElement = (callback) => {
    const observer = new MutationObserver((mutations, observerInstance) => {
        callback();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
};