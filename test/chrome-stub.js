// Minimal in-page stand-in for the chrome.* APIs Margin uses, so the content script,
// side panel and library can be exercised in an ordinary tab during development.
// Storage persists to localStorage (one shared store per origin) and fires onChanged
// across tabs via the storage event.
(() => {
  const LS_KEY = '__margin_store';
  const read = () => JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  const write = (o) => localStorage.setItem(LS_KEY, JSON.stringify(o));
  const changeListeners = [];
  const msgListeners = [];
  const fire = (changes) => changeListeners.forEach((fn) => fn(changes, 'local'));

  addEventListener('storage', (e) => {
    if (e.key !== LS_KEY) return;
    const before = JSON.parse(e.oldValue || '{}'), after = JSON.parse(e.newValue || '{}');
    const changes = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { oldValue: before[k], newValue: after[k] };
    }
    if (Object.keys(changes).length) fire(changes);
  });

  const local = {
    async get(keys) {
      const all = read();
      if (keys == null) return structuredClone(all);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in all) out[k] = structuredClone(all[k]);
      return out;
    },
    async set(obj) {
      const all = read();
      const changes = {};
      for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: all[k], newValue: structuredClone(v) }; all[k] = v; }
      write(all);
      setTimeout(() => fire(changes));
    },
    async remove(keys) {
      const all = read();
      const changes = {};
      for (const k of [].concat(keys)) if (k in all) { changes[k] = { oldValue: all[k] }; delete all[k]; }
      write(all);
      setTimeout(() => fire(changes));
    },
    async getBytesInUse() { return (localStorage.getItem(LS_KEY) || '').length; },
  };

  // Messages between the panel and the article frame travel over a BroadcastChannel.
  const bus = new BroadcastChannel('margin-test-bus');
  // about:srcdoc frames report origin "null"; borrow the parent's.
  const ORIGIN = location.origin !== 'null' ? location.origin : parent.location.origin;
  const ARTICLE_URL = ORIGIN + '/test/article.html';
  const noop = { addListener() {} };

  window.chrome = {
    storage: { local, onChanged: { addListener: (fn) => changeListeners.push(fn) } },
    runtime: {
      sendMessage: async () => {},
      onMessage: { addListener: (fn) => msgListeners.push(fn) },
      getURL: (p) => ORIGIN + '/' + p.replace(/^\//, ''),
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: {
      create: ({ url }) => open(url, '_blank'),
      query: async () => [{ id: 1, windowId: 1, active: true, url: ARTICLE_URL, title: 'The Quiet Craft of Reading Slowly' }],
      sendMessage: (_tabId, msg) => new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const onReply = (e) => { if (e.data.replyTo === id) { bus.removeEventListener('message', onReply); resolve(e.data.body); } };
        bus.addEventListener('message', onReply);
        bus.postMessage({ id, msg });
        setTimeout(() => reject(new Error('no receiver')), 1000);
      }),
      onActivated: noop,
      onUpdated: noop,
    },
  };

  // Test hook: deliver a message as if it came from the background worker.
  window.__marginSend = (msg) => new Promise((resolve) => {
    for (const fn of msgListeners) fn(msg, {}, resolve);
  });
  if (location.pathname === '/test/article.html') {
    bus.addEventListener('message', async (e) => {
      if (!e.data.msg) return;
      bus.postMessage({ replyTo: e.data.id, body: await window.__marginSend(e.data.msg) });
    });
  }
  window.__marginStore = { read, reset: () => { localStorage.removeItem(LS_KEY); } };
})();
