function debug(message) {
    console.log(`[GitHub Extension Debug]: ${message}`);
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
  
