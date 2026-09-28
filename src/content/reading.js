(function () {
  'use strict';

  const GHE = globalThis.GHE = globalThis.GHE || {};
  const DATE_SELECTOR = 'relative-time[datetime], time-ago[datetime]';
  // Modern GitHub caps both the outer layout and its main content column.
  // Match the observed component boundary, never the adjacent pane or README.
  const CONTENT_SELECTOR = [
    '.repository-content',
    '.repository-content .container-xl',
    '[data-testid="repos-split-pane-content"]',
    '.repository-content [data-component="SplitPageLayout.Content"]',
    '.repository-content [data-component="SplitPageLayout.Content"] > [class*="prc-PageLayout-Content-"]'
  ].join(', ');

  GHE.createReadingEnhancer = function createReadingEnhancer(document) {
    const dates = new Map();
    const wideNodes = new Set();
    const focusNodes = new Set();
    const focusLayouts = new Set();
    let style;

    function clearDates() {
      for (const span of dates.values()) span.remove();
      dates.clear();
    }

    function reconcileClass(owned, desired, className) {
      for (const node of owned) {
        if (!desired.has(node)) {
          node.classList.remove(className);
          owned.delete(node);
        }
      }
      for (const node of desired) {
        if (!node.classList.contains(className)) {
          node.classList.add(className);
          owned.add(node);
        }
      }
    }

    function destroy() {
      clearDates();
      reconcileClass(wideNodes, new Set(), 'ghe-wide');
      reconcileClass(focusNodes, new Set(), 'ghe-focus-sidebar');
      reconcileClass(focusLayouts, new Set(), 'ghe-focus-layout');
      if (style) style.remove();
      style = undefined;
    }

    function apply(settings, context) {
      if (!settings || !settings.enabled) {
        destroy();
        return;
      }

      if (!style || !style.isConnected) {
        style = document.createElement('style');
        style.setAttribute('data-ghe-reading', '');
        style.textContent = `
          [data-ghe-date] {
            margin-inline-start: .35em;
            color: inherit;
            font-size: .875em;
            font-weight: normal;
            white-space: normal;
          }
          [data-ghe-date][data-ghe-compact] {
            display: block;
            margin-inline-start: 0;
            margin-top: 2px;
            font-size: 11px;
            line-height: 16px;
            white-space: nowrap;
          }
          td:has([data-ghe-date][data-ghe-compact]) {
            min-width: 100px;
          }
          .repository-content.ghe-wide,
          .repository-content .container-xl.ghe-wide,
          [data-testid="repos-split-pane-content"].ghe-wide,
          .repository-content [data-component="SplitPageLayout.Content"].ghe-wide,
          .repository-content [data-component="SplitPageLayout.Content"] > [class*="prc-PageLayout-Content-"].ghe-wide {
            max-width: none !important;
            width: 100% !important;
          }
          .repository-content .Layout-sidebar.ghe-focus-sidebar,
          .repository-content [class*="prc-PageLayout-PaneWrapper-"].ghe-focus-sidebar {
            display: none !important;
          }
          .repository-content .ghe-focus-layout {
            display: block !important;
          }
          .repository-content .ghe-focus-layout > [data-component="SplitPageLayout.Content"] {
            width: 100% !important;
            max-width: none !important;
          }
        `;
        (document.head || document.documentElement).append(style);
      }

      const outsideExtension = node => !node.closest('[data-ghe-host]');
      reconcileClass(wideNodes, new Set(settings.wide
        ? [...document.querySelectorAll(CONTENT_SELECTOR)].filter(outsideExtension) : []), 'ghe-wide');
      // The shared context also labels repository subpages (issues lists, settings)
      // as repositories. Only the two-segment overview URL owns the About sidebar.
      let isOverview = false;
      try {
        const url = new URL(context?.url || document.location.href);
        isOverview = context?.type === 'repository' && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname);
      } catch { /* Unknown locations must not hide page content. */ }
      const sidebars = new Set();
      const layouts = new Set();
      if (settings.focus && isOverview) {
        for (const sidebar of document.querySelectorAll('.repository-content .Layout-sidebar')) {
          if (outsideExtension(sidebar)) sidebars.add(sidebar);
        }
        for (const pane of document.querySelectorAll('.repository-content [class*="prc-PageLayout-PaneWrapper-"][data-position="end"]')) {
          if (!outsideExtension(pane) || !pane.querySelector('[data-component="SplitPageLayout.Pane"] [class*="SidebarAbout-module__aboutHeading__"]')) continue;
          sidebars.add(pane);
          const layout = pane.parentElement;
          if (layout?.matches('[class*="prc-PageLayout-PageLayoutContent-"]') && layout.querySelector(':scope > [data-component="SplitPageLayout.Content"]')) layouts.add(layout);
        }
      }
      reconcileClass(focusNodes, sidebars, 'ghe-focus-sidebar');
      reconcileClass(focusLayouts, layouts, 'ghe-focus-layout');

      if (!settings.exactDates) {
        clearDates();
        return;
      }

      const current = new Set();
      for (const time of document.querySelectorAll(DATE_SELECTOR)) {
        if (!outsideExtension(time)) continue;
        const value = time.getAttribute('datetime');
        if (!value || !Number.isFinite(new Date(value).getTime())) continue;
        const formatted = GHE.formatDate(value, { locale: settings.locale, timeZone: settings.timeZone });
        if (!formatted) continue;
        current.add(time);
        let span = dates.get(time);
        if (!span) {
          span = document.createElement('span');
          span.setAttribute('data-ghe-date', '');
          dates.set(time, span);
        }
        const cell = time.closest('td');
        const compact = Boolean(cell && cell.closest('table'));
        const text = compact
          ? new Intl.DateTimeFormat(settings.locale === 'auto' ? undefined : settings.locale, {
            year: 'numeric', month: 'short', day: 'numeric',
            ...(settings.timeZone === 'UTC' ? { timeZone: 'UTC' } : {})
          }).format(new Date(value))
          : `(${formatted})`;
        const zone = settings.timeZone === 'UTC' ? 'UTC' : 'local time';
        const title = `Exact date (${zone}): ${formatted}. Original timestamp: ${value}`;
        // Avoid writing unchanged values: the content runtime observes page mutations.
        if (span.hasAttribute('data-ghe-compact') !== compact) span.toggleAttribute('data-ghe-compact', compact);
        if (span.textContent !== text) span.textContent = text;
        if (span.title !== title) span.title = title;
        if (time.nextSibling !== span) time.after(span);
      }

      for (const [time, span] of dates) {
        if (!current.has(time)) {
          span.remove();
          dates.delete(time);
        }
      }
    }

    return { apply, destroy };
  };
})();
