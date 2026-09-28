# GitHub Enhancer

Private tools for code investigation and PR review on GitHub.

Save repositories, issues, pull requests, discussions, commits, and code pages with a note about why they matter. Find them again from any GitHub page. GitHub Enhancer works without a token, an account, or a backend.

## What's inside

- **Code basket.** Open a code file, choose a line range and collect an excerpt with path, language, source link and a note. Combine excerpts from several files and copy or download Markdown. Full commit permalinks are distinguished from mutable branch/tag links.
- **Private PR review.** On Files changed, filter loaded files and group by folder or type. Navigate with j/k or arrow keys in the file list, jump to a diff, collapse diff bodies, keep file notes and resume the last file. Local marks are separate from GitHub Viewed and submitted reviews. A known revision change requires reconfirmation; unknown revisions are always labeled unverified.
- **Workspaces.** Group saved repositories, PRs, issues, comment links and code excerpts around one investigation. Add workspace notes, export the collection as Markdown (optionally including saved private file notes from linked PRs), and reopen up to ten page links at once.

- **Conversation navigator.** Search the loaded comments of an issue, PR or discussion by text/author, filter by author or saved status, jump to the original, and bookmark important comment permalinks for a workspace. Refresh after loading more comments.
- **Reply drafts and templates.** Prepare a local Markdown draft in Write, reuse your own templates, and copy when ready. Thread drafts recover within the current browser session. Applying a template is explicit; the extension never posts to GitHub.
- **Saved pages with private notes.** Search titles, repositories, and notes. Filter by page type. Remove a page with an Undo action.
- **A workbench on GitHub.** The compact `g+ Enhancer` button opens an overlay. Notes live in an extension-origin frame, isolated from GitHub's page scripts. The toolbar popup opens the same workspace.
- **Contextual actions.** Copy a page URL, Markdown link, or clone command. Jump to a repository's code, issues, pull requests, and releases.
- **Command search.** Press **Alt + Shift + K** on GitHub or choose Commands. Search commands, workspace notes, collected code and private PR notes. Use arrows and Enter; Escape returns focus. GitHub's own shortcuts stay available. Disable the shortcut in Settings if needed.
- **Reading preferences.** Exact local or UTC dates alongside GitHub's native timestamps, wider repository content, and an optional focus mode for the repository overview sidebar. Settings apply live.
- **Portable backups.** Export pages, code excerpts, workspaces, review notes/marks, reply templates and settings as version 2 JSON, or merge a version 1 or 2 backup. More recent local notes take priority. Data stays in this browser unless you export it.
- **Light and dark.** The in-page workbench follows GitHub; extension pages follow your device. You can choose a fixed appearance.

## Install locally

1. Clone this repository, or unzip a release package into a permanent folder.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Reload a GitHub tab. Click **g+ Enhancer** in the bottom-right corner.

No build or dependency installation is needed to use the extension. After changing code, click **Reload** on the extension's card and reload GitHub. Minimum Chrome version: 120. Download packaged versions from [GitHub Releases](https://github.com/adomorn/Github-Enhancer/releases). Chrome Web Store submission is being prepared; this repository does not imply store approval or availability of version 3.

## A useful first minute

Open a code file and choose **Code basket**. Select a line range, add a note, then save the excerpt. Visit another file to collect more evidence. In **Workspaces**, create an investigation and add the current page plus saved excerpts. Copy Markdown when you want to share your findings.

On a PR's Files changed page, **Tools** shows the loaded diff files. Add private notes, jump between files and mark progress locally. **Refresh page data** picks up more content after GitHub loads it. These tools never submit a GitHub review or comment.

Notes save explicitly. Saved-page notes, workspace names/notes, code-excerpt annotations/ranges PR file-note drafts, reply drafts and template edits recover during the same browser session after reopening the popup or panel. Save explicitly to keep them across browser restarts. Code text itself is collected only when saving an excerpt. Settings save immediately. No browsing history is collected automatically.

## Privacy and permissions

Only `storage` and `activeTab` permissions are requested. A declarative content script runs on `https://github.com/*` to display the launcher and optional reading tools. The worker makes no network requests. No PAT, GitHub API token, analytics, remote code, external fonts, or sign-in flow is used. Read [PRIVACY.md](PRIVACY.md).

Backups contain note text and URLs, including any private repository names you explicitly saved. Keep exported files somewhere you trust. Uninstalling the extension removes its local data; export a backup first if you want to retain it.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run package
```

Node 22+ is needed for development checks. Runtime code has no npm dependencies; jsdom is a development-only DOM test dependency. Packaging produces `dist/github-enhancer-3.0.0.zip` from an allowlist of extension assets.

```text
src/shared/       URL/data rules, extension UI and messaging client
src/background/   Serialized local persistence and worker message boundary
src/content/      One page lifecycle and reversible reading enhancements
src/panel/        Isolated extension-origin workbench
src/popup/        Browser toolbar workbench
src/options/      Settings and backups
tests/            Model, persistence, DOM, UI and settings regression tests
```

## Scope and limitations

- GitHub.com only; GitHub Enterprise domains are not currently supported.
- Up to 500 saved pages, 100 excerpts (20,000 characters each), 40 workspaces 50 PR review records and 40 reply templates. Notes allow 10,000 characters.
- Page tools use loaded GitHub content only. The file adapter reads at most 300,000 code characters; the review navigator lists at most 200 loaded files. Conversation snapshots hold at most 200 comments, 10,000 characters per comment and 300,000 characters in total. Hidden, paginated or unloaded content is not represented as a complete result.
- A full commit in the diff URL is a verified revision; aggregate PR pages may not expose one. In that case local marks remain explicitly unverified.
- Code lines from branch/tag URLs can change later. Use GitHub's permalink before collecting when an immutable reference matters.
- Reading utilities depend on GitHub markup. They make narrow, reversible changes; GitHub layout updates may require selector adjustments.
- Workspaces are device-local and do not sync between Chrome profiles or computers.
- The older animated theme, expanded contributor cards, and API-based file sizes were retired. They added background work, fragile page replacements, and API limits; this version focuses on preserving personal context.

See [CHANGELOG.md](CHANGELOG.md), [the research](docs/research/competitors.md), and [the technical audit](docs/research/technical-audit.md).

MIT licensed. Originally built by Arda Terekeci.
