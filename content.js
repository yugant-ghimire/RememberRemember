// RememberRemember content script: selection toolbar, highlight rendering/anchoring, and the in-page note popover.
(() => {
  if (window.__marginLoaded || window.top !== window) return;
  window.__marginLoaded = true;

  const M = globalThis.Margin;
  const supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let settings = { ...M.DEFAULT_SETTINGS };
  let url = M.normalizeUrl(location.href);
  let key = url && M.pageKey(url);
  let page = null; // the stored record for this page
  const live = new Map(); // highlight id -> { hl, range | null }
  let index = null; // cached text index, invalidated on DOM mutation

  const registries = {};
  let noteReg, flashReg, hoverReg;
  if (supported) {
    for (const c of M.COLOR_IDS) {
      registries[c] = new Highlight();
      CSS.highlights.set('mg-' + c, registries[c]);
    }
    noteReg = new Highlight();
    hoverReg = new Highlight();
    flashReg = new Highlight();
    hoverReg.priority = 5;
    flashReg.priority = 10;
    CSS.highlights.set('mg-note', noteReg);
    CSS.highlights.set('mg-hover', hoverReg);
    CSS.highlights.set('mg-flash', flashReg);
  }

  const enabled = () => supported && !!key && !M.siteDisabled(settings, location.href);

  // ---------------------------------------------------------------------------
  // Text index: flattens the page's text nodes into one string so highlights can be
  // stored as text (exact + prefix/suffix + position) instead of brittle DOM paths.
  // Whitespace is collapsed so reflowed or re-rendered pages still match.
  // ---------------------------------------------------------------------------
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE', 'OPTION', 'SELECT']);
  const WS = /\s/;

  function buildIndex() {
    const nodes = [];
    const parts = [];
    let rawLen = 0;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName) || !n.nodeValue) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      nodes.push({ node: n, start: rawLen, end: rawLen + v.length });
      parts.push(v);
      rawLen += v.length;
    }
    const raw = parts.join('');
    const r2n = new Uint32Array(raw.length + 1); // norm chars emitted before raw[i]
    const n2r = new Uint32Array(raw.length + 1); // raw index of norm[j]
    const out = [];
    let prevSpace = true;
    for (let i = 0; i < raw.length; i++) {
      r2n[i] = out.length;
      const ch = raw[i];
      if (WS.test(ch)) {
        if (!prevSpace) { n2r[out.length] = i; out.push(' '); prevSpace = true; }
      } else {
        n2r[out.length] = i; out.push(ch); prevSpace = false;
      }
    }
    r2n[raw.length] = out.length;
    const nodeIdx = new Map(nodes.map((e, i) => [e.node, i]));
    return { nodes, nodeIdx, raw, norm: out.join(''), r2n, n2r, lower: null };
  }

  function getIndex() {
    if (!index) index = buildIndex();
    return index;
  }

  // Convert a DOM boundary point to a raw text offset.
  function pointToRaw(idx, container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      const i = idx.nodeIdx.get(container);
      if (i != null) return idx.nodes[i].start + Math.min(offset, container.nodeValue.length);
    }
    // Element boundary (or an unindexed text node): first indexed text node at/after the point.
    const pt = document.createRange();
    try { pt.setStart(container, offset); } catch { return 0; }
    let lo = 0, hi = idx.nodes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pt.comparePoint(idx.nodes[mid].node, 0) < 0) lo = mid + 1; else hi = mid;
    }
    return lo < idx.nodes.length ? idx.nodes[lo].start : idx.raw.length;
  }

  function rawToPoint(idx, off, isEnd) {
    const ns = idx.nodes;
    let lo = 0, hi = ns.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const e = ns[mid];
      if (isEnd ? e.end < off : e.end <= off) lo = mid + 1; else hi = mid;
    }
    const e = ns[lo];
    return { node: e.node, offset: Math.max(0, Math.min(off - e.start, e.node.nodeValue.length)) };
  }

  function normToRange(idx, s, e) {
    if (e <= s || !idx.nodes.length) return null;
    const rs = idx.n2r[s];
    const re = idx.n2r[e - 1] + 1;
    const a = rawToPoint(idx, rs, false);
    const b = rawToPoint(idx, re, true);
    const r = document.createRange();
    try {
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
    } catch {
      return null;
    }
    return r;
  }

  const commonSuffix = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
  const commonPrefix = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };

  // Find the best place for a stored highlight in the current text.
  function locate(idx, hl) {
    const { norm } = idx;
    const ex = hl.exact;
    const L = ex.length;
    const score = (i) =>
      commonSuffix(norm.slice(Math.max(0, i - hl.prefix.length), i), hl.prefix) +
      commonPrefix(norm.slice(i + L, i + L + hl.suffix.length), hl.suffix) -
      Math.abs(i - hl.start) / 1e6;

    const scan = (hay, needle) => {
      let best = -1, bestScore = -Infinity, n = 0;
      for (let i = hay.indexOf(needle); i !== -1 && n < 2000; i = hay.indexOf(needle, i + 1), n++) {
        const sc = score(i);
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      return best;
    };

    // 1) exact text at the remembered position with matching context
    if (norm.substr(hl.start, L) === ex && score(hl.start) >= Math.min(8, hl.prefix.length + hl.suffix.length) - 1) {
      return [hl.start, hl.start + L];
    }
    // 2) best exact occurrence by surrounding context
    let i = scan(norm, ex);
    if (i !== -1) return [i, i + L];
    // 3) case-insensitive fallback (sites that restyle with text-transform in markup)
    idx.lower ||= norm.toLowerCase();
    i = scan(idx.lower, ex.toLowerCase());
    if (i !== -1) return [i, i + L];
    return null;
  }

  const normText = (s) => s.replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function paint() {
    if (!supported) return;
    for (const r of Object.values(registries)) r.clear();
    noteReg.clear();
    for (const { hl, range } of live.values()) {
      if (!range || range.collapsed) continue;
      (registries[hl.color] || registries.yellow).add(range);
      if (hl.note) noteReg.add(range);
    }
  }

  function anchor(hl) {
    const idx = getIndex();
    const pos = locate(idx, hl);
    return pos ? normToRange(idx, pos[0], pos[1]) : null;
  }

  // Reconcile live highlights with the stored page record.
  function render() {
    const wanted = new Map((enabled() && page?.highlights ? page.highlights : []).map((h) => [h.id, h]));
    for (const id of [...live.keys()]) {
      if (!wanted.has(id)) {
        live.delete(id);
        if (popover.id === id) closePopover();
      }
    }
    for (const [id, hl] of wanted) {
      const cur = live.get(id);
      // Keep a local edit that is newer than this (possibly stale) storage event.
      if (cur) { if (!((cur.hl.updated || 0) > (hl.updated || 0))) cur.hl = hl; }
      else live.set(id, { hl, range: anchor(hl) });
    }
    paint();
    reportCount();
    if (popover.id) syncPopover();
  }

  function reanchorBroken() {
    let changed = false;
    for (const entry of live.values()) {
      const r = entry.range;
      if (r && !r.collapsed && normText(r.toString()) === entry.hl.exact) continue;
      const next = anchor(entry.hl);
      if (next || r) { entry.range = next; changed = true; }
    }
    if (changed) paint();
  }

  let mutationTimer = 0;
  const observer = new MutationObserver(() => {
    index = null;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(reanchorBroken, 350);
  });

  function reportCount() {
    const n = live.size;
    chrome.runtime.sendMessage({ type: 'count', n }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Storage (single source of truth; the side panel and library write here too)
  // ---------------------------------------------------------------------------
  let writeChain = Promise.resolve();
  function savePage(mutate) {
    const k = key;
    writeChain = writeChain.then(async () => {
      const got = (await chrome.storage.local.get(k))[k];
      const cur = got || {
        url, title: document.title || url, site: M.hostOf(url), created: Date.now(), note: '', highlights: [],
      };
      mutate(cur);
      if (document.title) cur.title = document.title;
      M.touch(cur);
      if (!cur.highlights.length && !cur.note) await chrome.storage.local.remove(k);
      else await chrome.storage.local.set({ [k]: cur });
      page = cur.highlights.length || cur.note ? cur : null;
    }).catch((err) => console.warn('[RememberRemember] save failed', err));
    return writeChain;
  }

  async function loadPage() {
    url = M.normalizeUrl(location.href);
    key = url && M.pageKey(url);
    page = key ? M.migratePage((await chrome.storage.local.get(key))[key]) || null : null;
    live.clear();
    index = null;
    render();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = { ...M.DEFAULT_SETTINGS, ...changes.settings.newValue, labels: { ...M.DEFAULT_SETTINGS.labels, ...changes.settings.newValue?.labels } };
      ui.setLabels();
      if (!enabled()) hideToolbar();
      render();
    }
    if (key && changes[key]) {
      page = changes[key].newValue || null;
      render();
    }
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function selectionInfo() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (isEditable(range.commonAncestorContainer)) return null;
    if (!normText(sel.toString())) return null;
    return { sel, range };
  }

  function isEditable(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
  }

  function createFromSelection(color) {
    if (!enabled()) return null;
    const info = selectionInfo();
    if (!info) return null;
    index = null;
    const idx = getIndex();
    const rs = pointToRaw(idx, info.range.startContainer, info.range.startOffset);
    const re = pointToRaw(idx, info.range.endContainer, info.range.endOffset);
    let s = idx.r2n[rs], e = idx.r2n[re];
    while (s < e && idx.norm[s] === ' ') s++;
    while (e > s && idx.norm[e - 1] === ' ') e--;
    if (e <= s) return null;
    const hl = {
      id: M.uid(),
      color: color || settings.defaultColor,
      exact: idx.norm.slice(s, e),
      prefix: idx.norm.slice(Math.max(0, s - 48), s),
      suffix: idx.norm.slice(e, e + 48),
      start: s,
      note: '',
      created: Date.now(),
    };
    live.set(hl.id, { hl, range: normToRange(idx, s, e) });
    paint();
    info.sel.removeAllRanges();
    hideToolbar();
    savePage((p) => p.highlights.push(hl));
    return hl;
  }

  function updateHighlight(id, patch) {
    const entry = live.get(id);
    if (entry) { entry.hl = { ...entry.hl, ...patch, updated: Date.now() }; paint(); }
    return savePage((p) => {
      const h = p.highlights.find((x) => x.id === id);
      if (h) Object.assign(h, patch, { updated: Date.now() });
    });
  }

  function deleteHighlight(id) {
    const entry = live.get(id);
    if (!entry) return;
    const removed = entry.hl;
    live.delete(id);
    paint();
    closePopover();
    savePage((p) => { p.highlights = p.highlights.filter((x) => x.id !== id); });
    ui.toast('Highlight removed', 'Undo', () => {
      live.set(removed.id, { hl: removed, range: anchor(removed) });
      paint();
      savePage((p) => { if (!p.highlights.some((x) => x.id === removed.id)) p.highlights.push(removed); });
    });
  }

  async function copyText(text, msg = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      ui.toast(msg);
    } catch {
      ui.toast('Copy blocked by this page');
    }
  }

  function scrollToHighlight(id) {
    const entry = live.get(id);
    if (!entry?.range) return false;
    const el = entry.range.startContainer.parentElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash(entry.range);
    return true;
  }

  function flash(range) {
    let n = 0;
    const tick = () => {
      if (n % 2 === 0) flashReg.add(range); else flashReg.delete(range);
      if (++n < 6) setTimeout(tick, 260); else flashReg.delete(range);
    };
    setTimeout(tick, 250);
  }

  function hitTest(x, y) {
    let best = null, bestLen = Infinity;
    for (const [id, { hl, range }] of live) {
      if (!range || range.collapsed) continue;
      for (const r of range.getClientRects()) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          if (hl.exact.length < bestLen) { best = id; bestLen = hl.exact.length; }
          break;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // UI (isolated in a closed shadow root attached to <html>, outside the page's <body>)
  // ---------------------------------------------------------------------------
  const ICONS = {
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // Pick light/dark UI from the effective background colour behind a node.
  function isDarkBehind(node) {
    let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    for (; el; el = el.parentElement) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && (m[3] === undefined || +m[3] > 0.5)) {
        const [r, g, b] = m.map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
      }
    }
    return matchMedia('(prefers-color-scheme: dark)').matches && getComputedStyle(document.documentElement).colorScheme.includes('dark');
  }
  const applyTheme = (node) => shadow.querySelector('.root').classList.toggle('dark', isDarkBehind(node));

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      --bg: #ffffff; --fg: #1d1d1f; --muted: #6e6e73; --line: rgba(0,0,0,.09); --hover: rgba(0,0,0,.06);
      --shadow: 0 10px 30px rgba(0,0,0,.16), 0 2px 6px rgba(0,0,0,.08); --accent: #5b5bd6;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; color: var(--fg);
      -webkit-font-smoothing: antialiased;
    }
    /* Theme follows the page under the selection, not the OS, so a light article gets a light popover. */
    .root.dark { --bg: #232326; --fg: #f2f2f4; --muted: #a1a1a8; --line: rgba(255,255,255,.1); --hover: rgba(255,255,255,.08);
                 --shadow: 0 10px 30px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.35); --accent: #9d9dff; }
    .bar, .pop, .toast {
      position: fixed; z-index: 2147483647; background: var(--bg); border: 1px solid var(--line);
      box-shadow: var(--shadow); border-radius: 12px;
    }
    .bar { display: none; align-items: center; gap: 2px; padding: 5px; opacity: 0; transform: translateY(4px);
           transition: opacity .12s ease, transform .12s ease; }
    .bar.show { display: flex; }
    .bar.in { opacity: 1; transform: none; }
    button { all: unset; cursor: pointer; display: inline-grid; place-items: center; border-radius: 8px; color: var(--fg); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .sw { width: 26px; height: 26px; }
    .sw:hover { background: var(--hover); }
    .dot { width: 16px; height: 16px; border-radius: 50%; background: currentColor; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); transition: transform .1s; }
    ${M.COLORS.map((c) => `.c-${c.id} { color: ${c.hex}; }`).join('\n    ')}
    .sw:hover .dot { transform: scale(1.15); }
    .sw.on .dot { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px currentColor; }
    .ic { width: 28px; height: 28px; color: var(--muted); }
    .ic:hover { background: var(--hover); color: var(--fg); }
    .ic.danger:hover { color: #e5484d; }
    .sep { width: 1px; height: 18px; background: var(--line); margin: 0 4px; }
    .tip { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap;
           background: var(--fg); color: var(--bg); font-size: 11px; padding: 3px 7px; border-radius: 6px;
           pointer-events: none; opacity: 0; transition: opacity .1s; }
    .sw, .ic { position: relative; }
    .sw:hover .tip, .ic:hover .tip { opacity: 1; transition-delay: .35s; }
    kbd { font: inherit; opacity: .6; margin-left: 4px; }
    .pop { display: none; width: 300px; padding: 8px; }
    .pop.show { display: block; }
    .pop .row { display: flex; align-items: center; gap: 2px; }
    .pop .grow { flex: 1; }
    .pop .label { font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--muted); padding: 8px 4px 4px; }
    /* all: unset resets box-sizing to content-box, so restore it or padding overflows the popover. */
    .pop textarea { all: unset; box-sizing: border-box; display: block; width: 100%; min-height: 64px; max-height: 220px;
      overflow-y: auto; resize: none; padding: 8px 10px; border-radius: 8px; background: var(--hover); color: var(--fg);
      white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.45;
      box-shadow: inset 0 0 0 1px transparent; transition: box-shadow .12s, background .12s; }
    .pop textarea:focus { background: var(--bg); box-shadow: inset 0 0 0 1.5px var(--accent); }
    .pop textarea::placeholder { color: var(--muted); }
    .pop .hint { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); padding: 6px 4px 0; }
    .toast { display: flex; align-items: center; gap: 12px; right: 20px; bottom: 20px; padding: 10px 14px;
             opacity: 0; transform: translateY(8px); transition: opacity .15s, transform .15s; pointer-events: none; }
    .toast.in { opacity: 1; transform: none; pointer-events: auto; }
    .toast button { color: var(--accent); font-weight: 600; padding: 2px 4px; }
  `;

  const host = document.createElement('margin-ui');
  const shadow = host.attachShadow({ mode: 'closed' });
  // A constructed stylesheet (not a <style> tag) so strict page CSPs can't block our UI styles.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STYLE);
  shadow.adoptedStyleSheets = [sheet];
  shadow.innerHTML = `<div class="root">
    <div class="bar" role="toolbar" aria-label="Highlight">
      ${M.COLORS.map((c, i) => `<button class="sw c-${c.id}" data-color="${c.id}" aria-label="${c.label}"><span class="dot"></span><span class="tip"><span class="lbl">${c.label}</span><kbd>${i + 1}</kbd></span></button>`).join('')}
      <span class="sep"></span>
      <button class="ic" data-act="note" aria-label="Highlight with note">${icon('note')}<span class="tip">Add note<kbd>N</kbd></span></button>
      <button class="ic" data-act="copy" aria-label="Copy">${icon('copy')}<span class="tip">Copy<kbd>C</kbd></span></button>
    </div>
    <div class="pop" role="dialog" aria-label="Highlight">
      <div class="row">
        ${M.COLORS.map((c) => `<button class="sw c-${c.id}" data-color="${c.id}" aria-label="${c.label}"><span class="dot"></span><span class="tip lbl">${c.label}</span></button>`).join('')}
        <span class="grow"></span>
        <button class="ic" data-act="copy" aria-label="Copy text">${icon('copy')}<span class="tip">Copy text</span></button>
        <button class="ic" data-act="link" aria-label="Copy link to highlight">${icon('link')}<span class="tip">Copy link</span></button>
        <button class="ic danger" data-act="delete" aria-label="Delete highlight">${icon('trash')}<span class="tip">Delete<kbd>⌫</kbd></span></button>
      </div>
      <div class="label"></div>
      <textarea placeholder="Add a note…" rows="3"></textarea>
      <div class="hint"><span class="saved"></span><span>${IS_MAC ? '⌘' : 'Ctrl+'}↵ done · Esc close</span></div>
    </div>
    <div class="toast" role="status"><span class="msg"></span><button hidden></button></div>
  </div>`;

  const $ = (s) => shadow.querySelector(s);
  const bar = $('.bar');
  const pop = $('.pop');
  const noteBox = $('.pop textarea');
  const popLabel = $('.pop .label');
  const savedEl = $('.pop .saved');
  const toastEl = $('.toast');

  let barRange = null;
  const popover = { id: null };

  const ui = {
    setLabels() {
      shadow.querySelectorAll('[data-color]').forEach((b) => {
        const label = settings.labels[b.dataset.color];
        b.setAttribute('aria-label', label);
        const l = b.querySelector('.lbl');
        if (l) l.textContent = label;
      });
    },
    toastTimer: 0,
    toast(msg, actionLabel, onAction) {
      toastEl.querySelector('.msg').textContent = msg;
      const btn = toastEl.querySelector('button');
      btn.hidden = !actionLabel;
      btn.textContent = actionLabel || '';
      btn.onclick = () => { onAction?.(); toastEl.classList.remove('in'); };
      toastEl.classList.add('in');
      clearTimeout(ui.toastTimer);
      ui.toastTimer = setTimeout(() => toastEl.classList.remove('in'), actionLabel ? 5000 : 1600);
    },
  };

  function place(el, rect, { preferAbove }) {
    const w = el.offsetWidth, h = el.offsetHeight, m = 8;
    let x = rect.left + rect.width / 2 - w / 2;
    x = Math.max(m, Math.min(x, innerWidth - w - m));
    let y = preferAbove ? rect.top - h - 10 : rect.bottom + 10;
    if (preferAbove && y < m) y = rect.bottom + 10;
    if (!preferAbove && y + h > innerHeight - m) y = rect.top - h - 10;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(Math.max(m, y))}px`;
  }

  function anchorRect(range, atEnd) {
    const rects = [...range.getClientRects()].filter((r) => r.width || r.height);
    if (!rects.length) return range.getBoundingClientRect();
    return atEnd ? rects[rects.length - 1] : rects[0];
  }

  function showToolbar(range) {
    if (!settings.showToolbar || !enabled()) return;
    closePopover();
    barRange = range.cloneRange();
    applyTheme(range.startContainer);
    bar.classList.add('show');
    place(bar, anchorRect(barRange, false), { preferAbove: true });
    requestAnimationFrame(() => bar.classList.add('in'));
  }

  function hideToolbar() {
    barRange = null;
    bar.classList.remove('in', 'show');
  }

  function openPopover(id, focusNote) {
    const entry = live.get(id);
    if (!entry?.range) return;
    hideToolbar();
    popover.id = id;
    noteBox.value = entry.hl.note || '';
    savedEl.textContent = '';
    applyTheme(entry.range.startContainer);
    syncPopover();
    pop.classList.add('show');
    growNote();
    place(pop, anchorRect(entry.range, true), { preferAbove: false });
    hoverReg.clear();
    hoverReg.add(entry.range);
    if (focusNote) noteBox.focus({ preventScroll: true });
  }

  function syncPopover() {
    const entry = live.get(popover.id);
    if (!entry) return closePopover();
    pop.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.color === entry.hl.color));
    popLabel.textContent = settings.labels[entry.hl.color] || entry.hl.color;
    if (shadow.activeElement !== noteBox && noteBox.value !== (entry.hl.note || '')) noteBox.value = entry.hl.note || '';
  }

  function closePopover() {
    if (popover.id) flushNote();
    popover.id = null;
    pop.classList.remove('show');
    hoverReg?.clear();
  }

  let noteTimer = 0;
  function flushNote() {
    clearTimeout(noteTimer);
    const entry = live.get(popover.id);
    if (!entry) return;
    const v = noteBox.value.trim();
    if (v !== (entry.hl.note || '')) {
      updateHighlight(popover.id, { note: v });
      savedEl.textContent = 'Saved';
    }
  }

  function growNote() {
    noteBox.style.height = 'auto';
    noteBox.style.height = `${Math.min(noteBox.scrollHeight, 220)}px`;
  }

  noteBox.addEventListener('input', () => {
    growNote();
    savedEl.textContent = '';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 500);
  });
  noteBox.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); closePopover(); }
    if (e.key === 'Escape') { e.preventDefault(); closePopover(); }
  });
  // Keep the page from reacting to keystrokes typed into the note.
  for (const t of ['keyup', 'keypress', 'input']) noteBox.addEventListener(t, (e) => e.stopPropagation());

  // Buttons must not steal the page selection.
  shadow.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.color) createFromSelection(b.dataset.color);
    else if (b.dataset.act === 'note') {
      const hl = createFromSelection(settings.defaultColor);
      if (hl) openPopover(hl.id, true);
    } else if (b.dataset.act === 'copy') {
      const info = selectionInfo();
      if (info) copyText(info.sel.toString());
      hideToolbar();
    }
  });

  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const id = popover.id;
    const entry = live.get(id);
    if (!b || !entry) return;
    if (b.dataset.color) {
      updateHighlight(id, { color: b.dataset.color });
      settings.defaultColor = b.dataset.color;
      syncPopover();
    } else if (b.dataset.act === 'copy') copyText(entry.hl.exact);
    else if (b.dataset.act === 'link') copyText(M.textFragmentUrl(url, entry.hl.exact), 'Link copied');
    else if (b.dataset.act === 'delete') deleteHighlight(id);
  });

  // ---------------------------------------------------------------------------
  // Page events
  // ---------------------------------------------------------------------------
  const fromUi = (e) => e.composedPath().includes(host);

  function maybeShowToolbar() {
    const info = selectionInfo();
    if (info && enabled()) showToolbar(info.range);
    else hideToolbar();
  }

  // Show the toolbar once a selection settles: on mouse release, or after keyboard /
  // double-click selection changes while no button is held.
  let pointerDown = false;
  let settleTimer = 0;
  document.addEventListener('pointerdown', (e) => { if (!fromUi(e)) pointerDown = true; }, true);
  document.addEventListener('pointerup', (e) => {
    pointerDown = false;
    if (fromUi(e) || e.button !== 0) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(maybeShowToolbar, 10);
  }, true);

  document.addEventListener('selectionchange', () => {
    if (bar.classList.contains('show') && !selectionInfo()) { hideToolbar(); return; }
    if (pointerDown) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(maybeShowToolbar, 250);
  });

  document.addEventListener('mousedown', (e) => {
    if (fromUi(e)) return;
    if (popover.id) closePopover();
  }, true);

  document.addEventListener('click', (e) => {
    if (fromUi(e) || !enabled() || e.button !== 0) return;
    if (!getSelection().isCollapsed) return;
    if (e.target.closest?.('a, button, input, textarea, select, label, [role=button]') && !e.altKey) return;
    const id = hitTest(e.clientX, e.clientY);
    if (id) openPopover(id, false);
  }, true);

  let hoverFrame = 0;
  document.addEventListener('mousemove', (e) => {
    if (hoverFrame || !live.size) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const over = !popover.id && !e.target.closest?.('a') && hitTest(e.clientX, e.clientY);
      document.documentElement.classList.toggle('mg-pointer', !!over);
    });
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (fromUi(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (popover.id) { closePopover(); return; }
      if (bar.classList.contains('show')) { hideToolbar(); return; }
    }
    if (popover.id && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      deleteHighlight(popover.id);
      return;
    }
    if (!bar.classList.contains('show') || isEditable(e.target)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= M.COLORS.length) {
      e.preventDefault();
      createFromSelection(M.COLORS[n - 1].id);
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const hl = createFromSelection(settings.defaultColor);
      if (hl) openPopover(hl.id, true);
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      const info = selectionInfo();
      if (info) copyText(info.sel.toString());
      hideToolbar();
    }
  }, true);

  const reposition = () => {
    if (barRange && bar.classList.contains('show')) place(bar, anchorRect(barRange, false), { preferAbove: true });
    const entry = popover.id && live.get(popover.id);
    if (entry?.range) place(pop, anchorRect(entry.range, true), { preferAbove: false });
  };
  addEventListener('scroll', () => requestAnimationFrame(reposition), { passive: true, capture: true });
  addEventListener('resize', () => requestAnimationFrame(reposition), { passive: true });

  // ---------------------------------------------------------------------------
  // Messages from the background worker and side panel
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    switch (msg?.type) {
      case 'highlightSelection': {
        const hl = createFromSelection(msg.color);
        if (!hl && enabled()) ui.toast('Select some text first');
        reply({ ok: !!hl });
        break;
      }
      case 'status': {
        const anchored = [], orphaned = [];
        for (const [id, { range }] of live) (range && !range.collapsed ? anchored : orphaned).push(id);
        reply({ url, supported, enabled: enabled(), anchored, orphaned });
        break;
      }
      case 'scrollTo':
        reply({ ok: scrollToHighlight(msg.id) });
        break;
      default:
        return false;
    }
    return false;
  });

  // SPA navigation (pushState/replaceState) changes the URL without a reload.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href === lastHref) return;
    const before = M.normalizeUrl(lastHref);
    lastHref = location.href;
    if (M.normalizeUrl(location.href) !== before) { closePopover(); hideToolbar(); loadPage(); }
  }, 800);

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  (async () => {
    settings = await M.getSettings();
    document.documentElement.appendChild(host);
    ui.setLabels();
    if (!supported) return;
    await loadPage();
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
    // Late-loading content (lazy images, hydrated SPAs): try again for anything not yet found.
    setTimeout(reanchorBroken, 1500);
    setTimeout(reanchorBroken, 5000);
  })();
})();
