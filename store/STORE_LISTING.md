# Chrome Web Store submission — RememberRemember

Copy each block into the matching field of the Chrome Web Store Developer Dashboard.

## Store listing tab

**Name** (from manifest): RememberRemember — Private Highlighter

**Summary** (from manifest, max 132 chars):
Highlight and annotate the web. Everything stays in your browser — no account, no servers, no tracking.

**Category:** Productivity → Tools
**Language:** English

**Description:**

```
Highlight anything you read on the web, add notes, and find it all again — without giving your reading history to anyone.

RememberRemember keeps every highlight and note in your own browser. There is no account, no cloud, no analytics and no tracking. The extension makes no network requests at all.

FAST HIGHLIGHTING
• Select text and a small toolbar appears — pick one of five colors
• Keyboard first: press 1–5 to highlight, N to add a note, C to copy
• Alt+Shift+H highlights without the toolbar; right-click works too

NOTES WHERE YOU READ
• Click any highlight to recolor it, add a note, copy it or delete it
• Notes save as you type; every delete can be undone
• Name your colors for how you think: Key idea, Evidence, Question…

SIDE PANEL FOR EACH PAGE
• See every highlight on the page, filter by color, search
• Jump to any passage on the page
• Add a note about the whole page
• Copy or export the page as Markdown

YOUR LIBRARY
• Search across all your highlights and notes
• Filter by color, site, or highlights with notes
• Reopen any highlight at the exact passage
• Export everything to Markdown (Obsidian, Notion, Logseq) or back up to JSON

BUILT TO LAST
• Highlights are saved as text, so they reappear even after a site changes its layout
• Works on modern web apps without breaking them — the page itself is never modified
• Light and dark themes that match the page you are reading
• Pause it on any site with one switch

PRIVATE BY DESIGN
• Data is stored only in chrome.storage.local on your device
• No servers, accounts, analytics or remote code
• Open source (MIT): read every line on GitHub
```

**Screenshots** (1280×800): `store/screenshot-1-highlight.png` … `store/screenshot-4-dark.png`
**Small promo tile** (440×280): `store/promo-small-440x280.png`
**Icon** (128×128): `icons/icon128.png`

## Privacy tab

**Single purpose:**
Let users highlight and annotate text on web pages and review those highlights later, with all data stored locally in the browser.

**Permission justifications:**

| Field | Text |
| --- | --- |
| storage | Saves the user's highlights, notes and settings locally in chrome.storage.local. |
| unlimitedStorage | Users can accumulate thousands of highlights; this avoids hitting the default local storage quota. No data leaves the device. |
| sidePanel | Shows the list of highlights for the current page in Chrome's side panel. |
| contextMenus | Adds "Highlight with RememberRemember" to the right-click menu for selected text, and "Open library" to the toolbar icon menu. |
| scripting | On install or update, activates highlighting in tabs that were already open, so users don't have to reload them. |
| favicon | Shows site icons next to saved pages in the library, read from Chrome's local favicon cache. |
| Host permission (<all_urls>) | The core feature is highlighting text on any web page the user chooses and showing saved highlights when they revisit it. The content script must run on every site to read the selected text and redraw highlights. Page text is processed locally and never transmitted. |

**Are you using remote code?** No, I am not using remote code.

**Data usage — what user data do you collect?** Tick nothing. (The extension stores
website content and URLs only locally on the user's device and never transmits them,
so under the Chrome Web Store definition nothing is "collected".)

**Certify** all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/yugant-ghimire/RememberRemember/blob/main/PRIVACY.md

## Distribution tab

Visibility: Public · Regions: All regions · Pricing: Free
