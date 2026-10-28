// Shared helpers used by the content script, background worker, side panel and library.
// Loaded as a classic script so it works in every extension context (exposes globalThis.Margin).
(() => {
  if (globalThis.Margin) return;

  const COLORS = [
    { id: 'yellow', label: 'Key idea', hex: '#F5C518' },
    { id: 'green', label: 'Evidence', hex: '#3CB371' },
    { id: 'blue', label: 'Definition', hex: '#4A90E2' },
    { id: 'pink', label: 'Question', hex: '#E5579A' },
    { id: 'purple', label: 'Quote', hex: '#8E6CEF' },
  ];
  const COLOR_IDS = COLORS.map((c) => c.id);

  const DEFAULT_SETTINGS = {
    labels: Object.fromEntries(COLORS.map((c) => [c.id, c.label])),
    defaultColor: 'yellow',
    disabledSites: [],
    showToolbar: true,
  };

  // Query params that only exist for tracking; dropped so the same article maps to one record.
  const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|dclid$|msclkid$|mc_cid$|mc_eid$|igshid$|ref_src$|_hsenc$|_hsmi$|mkt_tok$|yclid$|si$)/i;

  function normalizeUrl(href) {
    try {
      const url = new URL(href);
      if (!/^(https?|file):$/.test(url.protocol)) return null;
      url.hash = '';
      for (const k of [...url.searchParams.keys()]) {
        if (TRACKING_PARAM.test(k)) url.searchParams.delete(k);
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  // Bump when the page record shape changes, and add a step to migratePage().
  const SCHEMA_VERSION = 1;

  // Bring a stored page record up to the current shape (records written before versioning have no `v`).
  function migratePage(p) {
    if (!p || p.v === SCHEMA_VERSION) return p;
    p.highlights ||= [];
    p.note ||= '';
    p.v = SCHEMA_VERSION;
    return p;
  }

  // Mark a record as written now, in the current schema.
  function touch(p) {
    p.v = SCHEMA_VERSION;
    p.updated = Date.now();
    return p;
  }

  const PAGE_PREFIX = 'p:';
  const pageKey = (url) => PAGE_PREFIX + url;
  const isPageKey = (k) => k.startsWith(PAGE_PREFIX);

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      labels: { ...DEFAULT_SETTINGS.labels, ...settings?.labels },
    };
  }

  async function saveSettings(patch) {
    const cur = await getSettings();
    const next = { ...cur, ...patch };
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  async function getAllPages() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => isPageKey(k))
      .map(([, v]) => migratePage(v))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  function hostOf(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'file:' ? 'Local file' : u.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  function siteDisabled(settings, url) {
    const host = hostOf(url);
    return settings.disabledSites.some((s) => host === s || host.endsWith('.' + s));
  }

  // Scroll-to-text link (https://wicg.github.io/scroll-to-text-fragment/) so a highlight
  // can be reopened in any Chromium browser, even without the extension.
  function textFragmentUrl(url, exact) {
    const enc = (s) => encodeURIComponent(s).replace(/-/g, '%2D').replace(/,/g, '%2C');
    const words = exact.trim().split(/\s+/);
    const directive = words.length <= 10
      ? enc(words.join(' '))
      : enc(words.slice(0, 5).join(' ')) + ',' + enc(words.slice(-5).join(' '));
    return `${url}#:~:text=${directive}`;
  }

  function sortHighlights(page) {
    return [...(page.highlights || [])].sort((a, b) => a.start - b.start);
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function pageToMarkdown(page, settings) {
    const lines = [`## ${page.title || page.url}`, '', `Source: <${page.url}>  `, `Saved: ${formatDate(page.created)}`, ''];
    if (page.note) lines.push(`**Page note:** ${page.note}`, '');
    for (const h of sortHighlights(page)) {
      lines.push(`> ${h.exact}`, '');
      const label = settings.labels[h.color] || h.color;
      lines.push(`— _${label}_ · [open](${textFragmentUrl(page.url, h.exact)})`, '');
      if (h.note) lines.push(`**Note:** ${h.note}`, '');
    }
    return lines.join('\n');
  }

  function pagesToMarkdown(pages, settings) {
    const head = `# RememberRemember highlights\n\nExported ${formatDate(Date.now())} · ${pages.length} pages\n\n`;
    return head + pages.map((p) => pageToMarkdown(p, settings)).join('\n---\n\n');
  }

  function download(filename, text, type = 'text/markdown') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function faviconUrl(pageUrl, size = 32) {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', String(size));
    return u.toString();
  }

  const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || '');
  // Shortcut labels in the platform's own notation: ⌥⇧H on macOS, Alt+Shift+H elsewhere.
  const keys = {
    highlight: IS_MAC ? '⌥⇧H' : 'Alt+Shift+H',
    panel: IS_MAC ? '⌥⇧M' : 'Alt+Shift+M',
    submit: IS_MAC ? '⌘↵' : 'Ctrl+Enter',
  };

  function slug(s) {
    return (s || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
  }

  globalThis.Margin = {
    COLORS, COLOR_IDS, DEFAULT_SETTINGS, SCHEMA_VERSION, migratePage, touch,
    normalizeUrl, pageKey, isPageKey, uid, getSettings, saveSettings, getAllPages,
    hostOf, siteDisabled, textFragmentUrl, sortHighlights, formatDate,
    pageToMarkdown, pagesToMarkdown, download, faviconUrl, slug, IS_MAC, keys,
  };
})();
