// RememberRemember service worker: context menu, keyboard command, toolbar badge, side panel wiring.
// It never makes a network request; all data lives in chrome.storage.local.
importScripts('shared.js');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'mg-highlight', title: 'Highlight with RememberRemember', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'mg-library', title: 'Open RememberRemember library', contexts: ['action'] });
  });

  // Make the extension work in tabs that were already open before install/update.
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] }).catch(() => {});
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared.js', 'content.js'] }).catch(() => {});
  }

  if (reason === 'install') chrome.tabs.create({ url: 'library.html?welcome=1' });
});

function highlightIn(tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'highlightSelection' }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'mg-highlight' && tab?.id) highlightIn(tab.id);
  if (info.menuItemId === 'mg-library') chrome.tabs.create({ url: 'library.html' });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'highlight-selection' && tab?.id) highlightIn(tab.id);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'count' && sender.tab?.id != null) {
    const text = msg.n ? String(msg.n) : '';
    chrome.action.setBadgeText({ tabId: sender.tab.id, text }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#5b5bd6' }).catch(() => {});
    chrome.action.setBadgeTextColor?.({ tabId: sender.tab.id, color: '#ffffff' })?.catch?.(() => {});
  }
});
