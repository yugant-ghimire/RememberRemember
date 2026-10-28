# RememberRemember — Privacy Policy

_Last updated: October 28, 2026_

RememberRemember is a browser extension for highlighting and annotating web pages.
It is built so that your reading never leaves your computer.

## What the extension stores

When you highlight text or write a note, the extension saves, **only on your device**
(in Chrome's `chrome.storage.local` for your browser profile):

- the address (URL) and title of the page,
- the highlighted text and a short piece of surrounding text used to find it again,
- the color you chose and any notes you wrote,
- your settings (color names, sites where the extension is paused, toolbar on/off).

## What the extension does not do

- It does **not** send any data to the developer or to any third party.
- It has **no** servers, accounts, analytics, advertising, telemetry or crash reporting.
- It does **not** load remote code. The extension's own pages are locked to `connect-src 'none'`.
- It does **not** sell, share or transfer user data, and does not use it for any purpose
  other than showing your highlights back to you.

The extension reads the text of the pages you visit only so it can display your highlights
on them. That text is processed inside your browser and is never transmitted.

## Your control over the data

- **View and edit:** everything is visible in the extension's library page.
- **Export:** Settings → *Backup (.json)* or *Markdown (.md)* writes a file to your computer.
- **Delete:** delete single highlights or pages, use Settings → *Delete all highlights*,
  or remove the extension (Chrome deletes its stored data on uninstall).
- **Pause:** turn the extension off for any site from the side panel.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| Read and change data on all websites | To show your saved highlights on the pages where you made them and to let you highlight any page |
| `storage`, `unlimitedStorage` | To save highlights locally without a size cap |
| `sidePanel` | To show the highlights panel |
| `contextMenus` | For the right-click “Highlight with RememberRemember” item |
| `scripting` | To activate highlighting in tabs that were already open when the extension was installed |
| `favicon` | To show site icons in the library from Chrome's local cache (no network request) |

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

Questions: open an issue on the project's GitHub repository.
