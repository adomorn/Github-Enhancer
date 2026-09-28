# Privacy

GitHub Enhancer 3 runs on your device. It has no backend and does not collect analytics.

## Stored data

When you choose Save page or Save note, the extension stores the GitHub URL, page title, repository name, page type, your note, and creation/update timestamps in `chrome.storage.local`. Code excerpts you explicitly collect include their text, line range, path, language and source URL. Workspaces store links to saved records and notes. PR review records contain private per-file notes, local marks, revision references when verified and the last visited file. Reply templates store the title and Markdown body you choose to save. Preferences are also stored locally. Unsaved page notes, workspace names/notes, excerpt ranges/annotations PR file notes, reply drafts and template edits are held in extension session storage for recovery after closing a popup or tab; session drafts clear when the browser session ends. It does not record browsing history or automatically save visited pages.

The toolbar popup uses `activeTab` to identify the page you choose to save. A content script on github.com reads the current URL/title, timestamps and loaded code/diff/comment content to provide the workbench and reading tools. Notes are displayed in an extension-origin frame or extension page, so they are not inserted into GitHub's readable page DOM. GitHub can see that an extension frame exists, but same-origin browser protections prevent its page scripts from reading the frame's notes.

## Network and authentication

The extension does not call the GitHub API or any other server. It never asks for a personal access token, password, or sign-in. Following a link in the extension opens GitHub normally, using your existing browser session. GitHub's own privacy policy then applies.

## Backups and deletion

Export creates a local JSON file containing saved URLs, titles, excerpts, workspace collections, review notes/marks, reply templates, timestamps, and preferences. Markdown exports include the selected excerpts, source links and saved notes. Workspace export can explicitly include saved private file notes from linked PRs when you select that option. Private repository names and any sensitive information you put in notes are included. Export only to a location you trust. Import is local, validates the file, and merges entries by URL while retaining more recent local edits.

Use Remove to delete a saved item; Undo restores the most recently removed item during that UI session. Uninstalling removes extension-local data. Chrome profile backups and exported files are outside the extension's control. Notes are protected by your browser profile, not encrypted with a separate extension password.

## Updates from older versions

Version 3 reads only the legacy date and locale preferences from Chrome sync storage once. It does not use legacy authentication tokens, API caches, or decorative settings. Legacy data is left untouched to avoid silently deleting user information.

## Limited Use

GitHub Enhancer's use of user data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. Data is used only to provide the user-facing features described here. The extension does not sell data, use it for advertising, or transfer it to third parties. Copying or exporting data is initiated by you; you control where that output goes.
