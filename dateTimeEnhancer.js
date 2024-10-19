/**
 * Formats a given date-time string into a localized string representation.
 *
 * @param {string} dateTimeString - The date-time string to format.
 * @returns {string} The formatted date-time string in 'tr-TR' locale with 'numeric' year, '2-digit' month, '2-digit' day, '2-digit' hour, and '2-digit' minute.
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
 * Enhances all <relative-time> elements on the page by adding a formatted date below each element.
 * 
 * This function searches for all <relative-time> elements in the document, formats their datetime attribute,
 * and inserts a new <div> element containing the formatted date below each <relative-time> element.
 * 
 * The new <div> element has the class 'enhanced-date' and is styled with a smaller font size and a top margin.
 * 
 * @async
 * @function enhanceRelativeTimes
 * @returns {Promise<void>} A promise that resolves when the enhancement is complete.
 */
  async function enhanceRelativeTimes() {
    debug("enhanceRelativeTimes function called");
  
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
        enhancedDate.style.marginTop = '2px';
        element.parentNode.insertBefore(enhancedDate, element.nextSibling);
        debug(`Enhanced date added for ${dateTimeAttr}`);
      }
    });
  }