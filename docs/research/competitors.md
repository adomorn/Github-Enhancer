# GitHub Enhancer v2: competitor research

Research date: 2026-09-28. Sources are project maintainers' repositories, publisher-owned store listings, and GitHub documentation. Features below are documented claims, not hands-on validation. No adoption estimates are used. Product opportunities are hypotheses inferred from this comparison, not evidence of unmet market demand.

## Recommendation

Build a small personal workspace for daily GitHub users: save work, retain private context, and return to the right page quickly. The central promise should be **“Keep your GitHub work and the reason you saved it together, on this device.”** Make the core useful without a token, account, background polling, or external service.

This is a more coherent direction than competing on the number of interface tweaks or ornamental effects. Existing GitHub Enhancer foregrounds cursor particles, star animations, backgrounds, and hover effects; its useful supporting features are full timestamps and repository information. [Existing README](https://github.com/adomorn/Github-Enhancer)

## Competitive comparison

| Product | Documented strength | Access/model | Implication for v2 |
| --- | --- | --- | --- |
| Refined GitHub | Broad interface improvements spanning comments, files, PRs, notifications, and shortcuts. Most JavaScript features can be disabled. | Open-source, opinionated collection. Most functionality uses page DOM; some features require an API token. | Do not recreate a large miscellaneous tweak collection. Choose a few reliable utilities that support the main workflow. [README](https://github.com/refined-github/refined-github), [security documentation](https://github.com/refined-github/refined-github/wiki/Security) |
| Octotree | Repository tree and search; bookmarks for repositories, issues, PRs, and files. Pro adds review navigation, unlimited bookmarks, and other customization. | Proprietary free/Pro product. Publisher says tokens are needed for private repositories or API rate limits. Its public repository contains an older limited version. | A file tree or plain bookmark list is an established category. Context attached to saved work and a token-free core offer a clearer angle. [Store listing](https://chromewebstore.google.com/detail/octotree-github-code-tree/bkhaagjahfmjljalopjnoealnfndnagc), [repository notice](https://github.com/ovity/octotree) |
| Gitako | Free repository/PR tree, instant file search, keyboard navigation, snippet copying, submodules, code folding, and support for other Git hosts. | Open-source. Publisher says private repository access and API limits can require a token. | Avoid rebuilding tree navigation. Respect coexistence with another extension's sidebar and shortcuts. [README](https://github.com/EnixCoda/Gitako), [store listing](https://chromewebstore.google.com/detail/gitako-github-file-tree/giljefjcheohhamkjphiebfjnlphnokk) |
| Enhanced GitHub | Repository/file sizes, file download actions, clipboard utilities. | Open-source. Documentation requires a token for private repositories and describes API quota consumption. | File size enrichment is occupied territory and brings API dependence. Include simple copy actions only where they reduce a concrete repeated task. [README](https://github.com/softvar/enhanced-github) |
| PullMate | PR sidebar, viewed-file progress, filters, bot hiding, pending-review reminder, and checklists. Pro includes private inline notes and Markdown export. | Free/Pro extension; listing advertises in-app purchases. No token conclusion drawn from the listing. | Private notes and review progress are not novel by themselves. Keep v2's scope across repository, issue, and PR pages rather than becoming a second PR review UI. [Publisher listing](https://chromewebstore.google.com/detail/pullmate/omkmhaoladfdhnmdghjlakmlbfjgpjfg) |

Exact Octotree pricing is omitted: its pricing URL returned only a loading shell on direct retrieval, although search indexing showed plan information. Pricing is not necessary to the scope decision.

## Native GitHub overlap

GitHub documents its own command palette for navigation, search, and contextual actions, including copying the current PR branch. It is a feature preview with configurable keyboard shortcuts and uses Ctrl/Cmd+K by default. A v2 launcher should focus on extension-owned saved work and actions, use a distinct configurable shortcut, and avoid a “GitHub finally has a command palette” claim. [GitHub command palette](https://docs.github.com/en/get-started/accessibility/github-command-palette)

GitHub's issues dashboard supports up to 25 saved views and can include PRs using `is:pr`. Generic saved searches should therefore be a convenience link to native functionality, not the main differentiator. [GitHub saved views](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/viewing-all-of-your-issues-and-pull-requests)

## Workflows worth testing

These are candidate opportunities suggested by the reviewed scope, not claims that no competing product supports them:

1. **Resume interrupted work:** save a PR with “check retry behavior after tests finish,” then find it from the popup tomorrow. A plain bookmark preserves location; the note preserves intent.
2. **Keep private repository context without API setup:** attach a local note to a page the user can already view. Store only the title, canonical URL, and user-entered text needed for the feature.
3. **Move between investigation and communication:** copy an issue reference, Markdown link, repository clone command, or file permalink without manually reformatting it. Derive actions from visible page data or validated URLs.
4. **Read comfortably while retaining GitHub familiarity:** opt into exact timestamps or wider content, with immediate reversible toggles. This should support the workspace, not introduce a separate theme system.

## Coherent launch scope

| Priority | Feature | Useful completion criteria |
| --- | --- | --- |
| P0 | Save repositories, issues, and PRs | One action adds/removes the current page; popup searches by repository, title, and note; duplicate saves collapse to one item. |
| P0 | Private context notes | Autosave with a visible saved/error state; notes survive reload/navigation; editing never submits a GitHub comment. |
| P0 | Useful sharing/copy actions | Copy URL, Markdown link, and contextual repository/issue reference; report copy success or failure honestly. |
| P0 | Local data controls | Explicit local-device wording, JSON export/import with validation, per-item removal, and clear-all confirmation. No claim of encrypted or synchronized storage. |
| P1 | Extension workspace launcher | Search saved items and extension commands by keyboard; do not shadow GitHub's default palette shortcut. |
| P1 | Reading utilities | Exact timestamps and optional content width; preserve GitHub themes, keyboard access, reduced-motion preferences, and easy disable controls. |

Defer full repository trees, API-based contributor enrichment/file sizes, AI summaries, notifications polling, diff annotation systems, time tracking, and decorative particles. Each would introduce a competing product direction or infrastructure cost before the central habit is proven.

## Product and validation guardrails

- A saved URL is a destination, not a live status feed. Do not show stale PR state as current without refreshing it from a reliable source.
- Canonical identity must preserve host, owner, repository, item type, and number; branch/file links must not be corrupted by naive path parsing.
- Local notes can contain confidential work context. Keep them in extension-local storage by default; export is a deliberate user action, and local means this browser profile rather than automatic cross-device sync.
- Prefer inline entry points that blend with GitHub. A popup is sufficient for the first workspace; another permanent sidebar is unnecessary for launch.
- Validate with a handful of daily GitHub users performing a real interruption-and-resume task. Measure whether they can retrieve saved intent and whether they voluntarily return over several days; avoid assuming feature count implies retention.
- Test GitHub's client-side navigation, two open tabs, storage failures, keyboard-only flows, narrow layouts, and coexistence with Refined GitHub/Gitako before claiming reliability.
