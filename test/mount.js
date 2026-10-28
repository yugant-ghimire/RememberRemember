// Load an extension page into an iframe with the chrome.* stub injected ahead of its own scripts.
// Every script/stylesheet URL gets a cache-busting query so edits show up on reload.
window.mountExtensionPage = async function mountExtensionPage(frame, page) {
  const v = Date.now();
  const html = await (await fetch('/' + page, { cache: 'no-store' })).text();
  frame.srcdoc = html
    .replace('<head>', '<head><base href="/">')
    .replace('<script src="shared.js">', '<script src="test/chrome-stub.js"></script><script src="shared.js">')
    .replace(/(src|href)="([^"]+\.(?:js|css))"/g, `$1="$2?v=${v}"`);
};
