# Technical audit and proposed foundation

Audit date: 2026-09-28. Scope: the freshly cloned version 2.0.0, its manifest, content runtime, enhancement modules, utilities, popup, and CI. Findings below distinguish source-level evidence from browser-dependent risks. No browser was controlled and no production code was changed for this audit.

## Recommendation

Retain the GitHub Enhancer identity and the practical idea of readable timestamps. Replace the active content runtime rather than adding another feature to its current lifecycle. Build a local workspace for saved repositories and context notes, a keyboard-accessible action palette, safe copy/navigation actions, and reversible reading modes. These features can work with public and private pages the user already has open without requesting a personal access token or scraping extra account data.

The existing code is predominantly decorative and has overlapping implementations. The four concrete module files alone contain about 3,900 lines; the dated badge module is over 1,200 lines. A simpler runtime will make the valuable behaviors easier to verify and maintain.

## Defensible findings

| Severity | Finding and source | Consequence |
| --- | --- | --- |
| High | `base-enhancer.js:70` calls `startObserving()` before `isInitialized` becomes true at line 74, while `shouldObserve()` at line 188 requires it to be true. | Normal enhancer observers never start during initialization. Dynamically loaded file rows and contributor regions are missed. A Node VM harness confirmed `{initialized:true, observations:0, observerCount:0}`. |
| High | `contributor-enhancer.js:846-868` extracts profile strings through `textContent`, but `enhanceCard()` at lines 881-908 interpolates them into `details.innerHTML`. | User-supplied profile text containing markup is reparsed as HTML. This is a real HTML injection sink. Do not assert privileged JavaScript execution without a browser/CSP reproduction; the safe fix is still to insert text nodes and separate `<br>` nodes. |
| High | `main.js:198-210` patches `history.pushState` and `replaceState` from the default isolated content-script world. | This cannot be relied upon to intercept GitHub's page-world history calls. Chrome documents isolated JavaScript environments. This is an architectural risk supported by the execution model, not a live SPA reproduction. |
| High | `date-enhancer.js:36-60` installs anonymous global listeners and an untracked body observer; `cleanup()` at 1212 does not remove them. Its timeouts also remain live. | Navigation and settings changes leave old instances active. A disabled timestamp feature can still call `enhance()` via these callbacks because `enhance()` itself does not gate on enabled state. |
| High | `theme-enhancer.js:873`, 936, 1029, 1054, 1066 add global event listeners; its body observer at 1117 is not retained. `cleanup()` at 1174 does not remove them or call `super.cleanup()`. | Cursor particles, click effects and DOM rescans survive cleanup and multiply across recreated instances. The stale scroll observer callback can later call `this.animationObserver.observe` after cleanup sets it to null. |
| High | `main.js:273-277` handles toggles for dates, contributors and sizes but omits `enableThemeEnhancements`. `BaseEnhancer.disable()` only disconnects observers. | The theme toggle does not apply immediately. Other toggles leave already modified DOM visible. Settings appear saved while the page continues showing the feature. |
| High | `date-enhancer.js:1050` replaces GitHub's original `relative-time` element. Cleanup at 1218 depends on `data-original-date`, which the active creation path never sets. | Original nodes/attributes and custom-element behavior are lost; cleanup cannot restore them. Locale changes also do not rerender the already replaced timestamps. |
| Medium | `file-size-enhancer.js:194` keys cache by owner/repo/path but not branch or commit. Line 169 assumes refs have no slash. `api-utils.js:265-275` falls back to `main` rather than parsing the shown route/ref. | Ref switches can show another ref's size. Branches like `feature/ui` are parsed as if `ui` were part of the file path. |
| Medium | `file-size-enhancer.js:239-242` and 274-277 convert 404 into zero. Directory summation at 264-272 counts direct files only but the UI calls it “Directory size.” | Private/inaccessible/missing resources are misrepresented as empty; nested folders are excluded without disclosure. A Node VM harness confirmed a mocked 404 returns `0`. |
| Medium | Each visible file uses an individual contents request (`file-size-enhancer.js:228`); API calls are serialized with a delay (`api-utils.js:73-94`) and can await a rate-limit reset. Main awaits enhancers sequentially (`main.js:136-157`). | A file listing can create many requests, delays and rate-limit stalls; initialization of subsequent modules waits behind this work. A token-free redesign should not promise inferred API data. |
| Medium | All generic storage and cached API values use `chrome.storage.sync` (`storage.js:55-107`, 273-282). There is no enforced cache entry bound. | Cache churn consumes the same constrained sync quota as preferences and synchronizes data that should be disposable. Sync is approximately 100 KB total and 8 KB/item; local storage is the appropriate basis for a local workspace. |
| Medium | `contributor-enhancer.js:949-950` hides the original list; cleanup at 991 only resets flags/cache/observers. | Disabling/reinitializing the feature does not remove cards or restore the native contributor list. Its hovercard fetches also have no cancellation/timeout and add requests for every selected contributor. |
| Medium | `main.js:283-286` calls `initializeEnhancers()` for all enabled modules when any missing one becomes enabled; existing instances are overwritten in the map without cleanup. `handleNavigation()` has uncancelled 100 ms timers. | Settings and rapid navigation can overlap initialization and orphan existing instances. |
| Medium | Timestamps older than a week get opacity `0.45` (`date-enhancer.js:350-359`), tiny fixed-size uppercase badges (`395-425`), and clickable `div` controls without keyboard semantics. The shown format hardcodes `en-US` (`688` onward). | The feature makes older information harder to read, ignores the chosen locale for its primary display, truncates dates and excludes keyboard users from the detail action. |
| Low | `main.js:96` treats every two-segment path as a repository. `api-utils.js:246` uses any two path segments as owner/repo. | Routes such as `/settings/profile` and `/orgs/example` can acquire invalid repository context; explicit reserved-route handling and visible repository metadata are needed. |
| Low | Event names in `base-enhancer.js:18-20` disagree with `constants.js:88-92`; default settings are copied into several files. | Error/completion wiring is inconsistent and settings drift is easy. Prefer one schema and direct typed/validated messages. |

Browser/platform claims are grounded in [Chrome's content-script execution model](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [Chrome's storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage). Source findings refer to the original checkout and line numbers can change after implementation.

## What to keep, rewrite, and retire

- **Keep as a product feature:** readable local/UTC timestamps with a precise ISO tooltip and retained relative context. Reimplement as a small reversible enhancement that preserves GitHub's native element and attributes.
- **Keep as implementation ideas:** explicit feature preferences, stable extension-prefixed markers, debouncing, small pure formatting helpers, Manifest V3 packaging, local CSS assets.
- **Replace:** inheritance-based enhancer lifecycle, duplicated settings, popup that only exposes toggles, broad page CSS, mutation/history workarounds, custom timestamp badges.
- **Remove from the active bundle:** cursor trails, full-page decorative orbs, star explosions, hovercard enrichment and per-file API size fetching. Keep upstream history in Git rather than retaining dead production modules.
- **Do not carry forward:** token storage or API host permission for a core product that needs neither. The source references an auth token but provides no coherent token management UI.

## Proposed architecture

Use plain JavaScript modules with a small build/bundle step if it improves isolation and testing, or a few deliberately ordered script files if zero build is a requirement. Framework adoption is unnecessary for this scope. Share pure context, schema and action definitions between the popup and content UI.

1. **Core/context** derives `{kind, owner, repo, repositoryUrl, pageUrl, title}` from a validated `URL` and GitHub metadata. Reserve non-repository route prefixes. Treat path/ref parsing as ambiguous unless page metadata supplies an exact ref; do not guess branch segments. Repository keys should be normalized for matching while display spelling is retained.
2. **Core/store** owns a versioned `chrome.storage.local` schema for settings, saved items and plain-text notes. Store one record per repo/item or serialize mutations through the service worker to avoid stale whole-store writes from different tabs. Merge defaults on read, validate imports strictly, cap field lengths, show save failures, and expose explicit export/import/delete. Listen to `chrome.storage.onChanged` for cross-context updates. “Saved” should mean persistence succeeded.
3. **Background** handles only installation/migration, registered keyboard commands if needed, and serialized storage mutations if selected. No polling, network enrichment, analytics or permanent in-memory state assumptions.
4. **Content/controller** is the sole lifecycle owner. It creates one stable extension host, derives page context, and schedules idempotent reconciliation. Listen to available GitHub navigation events, `popstate` and a bounded/coalesced mutation observer fallback. Compare URL/context before expensive work. Avoid overwriting page methods. Maintain one `AbortController` for listeners and cancellable scheduled work; all features have a real dispose/restore path.
5. **Content/surface** uses a Shadow DOM host for palette and workspace UI so GitHub CSS cannot break it and extension CSS cannot restyle unrelated native controls. Shadow DOM is style isolation, not a promise of secrecy from the page; do not inject unrelated saved notes into GitHub DOM. The popup is an extension page and can safely display the whole local workspace.
6. **Feature adapters** are small: timestamps; focus mode; wide mode; contextual action buttons. They receive context/settings and return cleanup. Maintain original attributes/styles in a WeakMap or use extension-owned marker classes/siblings. Never remove or clone native controls merely to restyle them.
7. **Action registry** declares id, label, keywords, availability, icon and handler. Both palette and popup call the same actions: save current repo, open notes, copy HTTPS/SSH clone URL, copy `gh repo clone owner/repo`, copy clean repo URL, open issues/PRs/releases, toggle readable dates/focus/wide. All copied values derive from validated GitHub context. Browser navigation is a normal link; clipboard runs directly on user activation and has a visible fallback on failure.

## UX contract

The visible promise should be “your GitHub workspace stays with you,” supported by local notes and saved work. A generic command palette is a useful entry point, not a defensible uniqueness claim. The market research agent reports that GitHub already has a native Ctrl/Cmd+K palette; use a distinct, configurable shortcut and expose it in the UI. Never capture ordinary typing or overwrite native shortcuts.

Show only a small entry point on GitHub until requested. The palette must have dialog semantics, Escape dismissal, arrow-key selection, focus trapping, focus return, a selected-item announcement, and an empty state. Saved repository filtering should work offline in the popup. Notes need a clear local-only label, explicit persisted status, predictable save timing, and a way to export the workspace. Avoid silently persisting page content or browsing history.

Focus/wide modes should be opt-in, immediately reversible and constrained to understood page types. Hide only known supplemental regions; never issue/PR controls, discussion text, security warnings or navigation needed to exit. If a GitHub selector is missing, leave native UI alone.

## Verification priorities for implementation

- Unit-test URL context against repo root, blob/tree URLs, slash-containing refs, issues/PRs, encoded names, reserved GitHub routes and non-GitHub URLs.
- Unit-test schema migration, import rejection, action URL/command construction, local/UTC date formatting and preservation of line anchors in copied page links.
- Integration-test cross-tab saved-state updates, concurrent notes/settings edits, failed storage writes, corrupted records and undo/delete behavior.
- DOM-test repeated initialization, toggle on/off/on, cleanup after navigation, late-arriving timestamps, changed datetime attributes, duplicate-host prevention and restoration of the actual original nodes.
- Browser-test signed-out public pages plus any available authenticated context, repo-to-repo SPA navigation, browser back/forward, extension reload, light/dark GitHub themes, reduced motion, keyboard-only use, narrow viewport, and empty local workspace.
- Verify the active bundle makes zero feature-driven network requests and permission declarations match actual use. Inspect live console output rather than treating syntax checks or lint as runtime evidence.

Original automated verification is sparse: there is no checked-in test suite/package manifest. CI dynamically installs a linter but does not exercise extension behavior. The current release job also depends on a version-check job that only runs for a special pull-request branch, making release execution worth revisiting separately with GitHub Actions semantics.
