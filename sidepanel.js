// Side panel: the highlights of the active tab, with notes, filters and export.
(() => {
  const M = globalThis.Margin;
  const { icon, esc, toast, copy, highlightCard } = globalThis.MarginUI;
  const $ = (id) => document.getElementById(id);

  let windowId = null;
  let tab = null;
  let url = null;
  let key = null;
  let page = null;
  let settings = M.DEFAULT_SETTINGS;
  let status = null;
  let query = '';
  const colorFilter = new Set();

  $('lockIcon').innerHTML = icon('lock');
  $('openLibrary').innerHTML = icon('library');
  $('openLibrary').onclick = () => chrome.tabs.create({ url: 'library.html' });
  $('copyMd').innerHTML = `${icon('copy')} Copy Markdown`;
  $('downloadMd').innerHTML = `${icon('download')} Export .md`;
  $('copyMd').onclick = () => page && copy(M.pageToMarkdown(page, settings), 'Markdown copied');
  $('downloadMd').onclick = () => page && M.download(`${M.slug(page.title)}.md`, M.pageToMarkdown(page, settings));

  $('siteEnabled').onchange = async (e) => {
    const host = M.hostOf(url);
    const list = settings.disabledSites.filter((s) => s !== host);
    if (!e.target.checked) list.push(host);
    settings = await M.saveSettings({ disabledSites: list });
    toast(e.target.checked ? `Highlighting on for ${host}` : `Paused on ${host}`);
  };

  // --- storage --------------------------------------------------------------
  let writeChain = Promise.resolve();
  function savePage(mutate) {
    const k = key, u = url, title = tab?.title;
    writeChain = writeChain.then(async () => {
      const cur = (await chrome.storage.local.get(k))[k] || {
        url: u, title: title || u, site: M.hostOf(u), created: Date.now(), note: '', highlights: [],
      };
      mutate(cur);
      M.touch(cur);
      if (!cur.highlights.length && !cur.note) await chrome.storage.local.remove(k);
      else await chrome.storage.local.set({ [k]: cur });
    });
    return writeChain;
  }

  // --- tab tracking ---------------------------------------------------------
  async function refreshTab() {
    const [t] = await chrome.tabs.query({ active: true, windowId });
    tab = t || null;
    const nextUrl = tab?.url ? M.normalizeUrl(tab.url) : null;
    const changed = nextUrl !== url;
    url = nextUrl;
    key = url && M.pageKey(url);
    page = key ? M.migratePage((await chrome.storage.local.get(key))[key]) || null : null;
    if (changed) { query = ''; colorFilter.clear(); }
    await refreshStatus();
    render(changed);
  }

  async function refreshStatus() {
    status = null;
    if (!tab?.id || !url) return;
    try {
      status = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    } catch {
      status = null; // content script not present (e.g. Chrome Web Store, PDF viewer)
    }
  }

  // --- rendering ------------------------------------------------------------
  const autoGrow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 160)}px`; };
  $('fav').onerror = () => { $('fav').src = 'icons/icon32.png'; };
  let noteEl = null;
  let listEl = null;

  function render(full) {
    const main = $('main');
    $('pageInfo').hidden = !tab;
    if (tab) {
      $('pageTitle').textContent = page?.title || tab.title || tab.url || 'Untitled';
      $('pageHost').textContent = url ? M.hostOf(url) : '';
      $('fav').src = url ? M.faviconUrl(url) : 'icons/icon32.png';
    }

    const runnable = !!url && status !== null;
    $('siteToggle').hidden = !url;
    if (url) {
      $('siteName').textContent = M.hostOf(url);
      $('siteEnabled').checked = !M.siteDisabled(settings, url);
    }

    if (!url || (!status && !page)) {
      noteEl = listEl = null;
      $('footer').hidden = true;
      main.innerHTML = `<div class="empty"><span class="art">${icon('lock')}</span>
        <h3>RememberRemember can't run on this page</h3>
        <p>Browser pages, the Chrome Web Store and built-in PDF viewer don't allow extensions to read text.${url ? ' Try reloading the tab if it was open before RememberRemember was installed.' : ''}</p></div>`;
      return;
    }

    const hls = page?.highlights || [];
    $('footer').hidden = !hls.length;

    if (full || !listEl) {
      main.innerHTML = `
        <div class="tools" id="tools"></div>
        <textarea class="page-note" id="pageNote" placeholder="Add a note about this page…" rows="1"></textarea>
        <div id="listWrap"></div>`;
      noteEl = $('pageNote');
      listEl = $('listWrap');
      let t = 0;
      noteEl.addEventListener('input', () => {
        autoGrow(noteEl);
        clearTimeout(t);
        t = setTimeout(() => savePage((p) => { p.note = noteEl.value.trim(); }), 450);
      });
    }
    if (document.activeElement !== noteEl) noteEl.value = page?.note || '';
    autoGrow(noteEl);
    if (full && !runnable && hls.length) toast('Reload the tab to show highlights on the page');
    renderTools(hls);
    renderList(hls);
  }

  function renderTools(hls) {
    const tools = $('tools');
    if (!hls.length) { tools.innerHTML = ''; return; }
    const counts = Object.fromEntries(M.COLOR_IDS.map((c) => [c, 0]));
    for (const h of hls) counts[h.color] = (counts[h.color] || 0) + 1;
    const searchFocused = document.activeElement?.id === 'q';
    if (!searchFocused) {
      tools.innerHTML = `
        ${hls.length > 4 ? `<label class="search">${icon('search')}<input id="q" placeholder="Search this page's highlights" value="${esc(query)}"></label>` : ''}
        <div class="chips">${M.COLORS.filter((c) => counts[c.id]).map((c) => `
          <button class="chip" data-color="${c.id}" aria-pressed="${colorFilter.has(c.id)}">
            <span class="dot c-${c.id}"></span>${esc(settings.labels[c.id])}<span class="n">${counts[c.id]}</span>
          </button>`).join('')}</div>`;
      tools.querySelector('#q')?.addEventListener('input', (e) => { query = e.target.value; renderList(page?.highlights || []); });
      tools.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
        const c = b.dataset.color;
        colorFilter.has(c) ? colorFilter.delete(c) : colorFilter.add(c);
        renderTools(page?.highlights || []);
        renderList(page?.highlights || []);
      }));
    }
  }

  function renderList(hls) {
    if (!listEl) return;
    if (!hls.length) {
      listEl.innerHTML = `<div class="empty"><span class="art">${icon('highlighter')}</span>
        <h3>No highlights yet</h3>
        <p>Select any text on the page and pick a color.</p>
        <div class="shortcuts">
          <div class="kbd-row"><span>Highlight in a color</span><span><kbd class="k">1</kbd>–<kbd class="k">5</kbd></span></div>
          <div class="kbd-row"><span>Highlight + note</span><kbd class="k">N</kbd></div>
          <div class="kbd-row"><span>Highlight selection</span><kbd class="k">${M.keys.highlight}</kbd></div>
          <div class="kbd-row"><span>Open this panel</span><kbd class="k">${M.keys.panel}</kbd></div>
          <div class="kbd-row"><span>Delete open highlight</span><kbd class="k">⌫</kbd></div>
        </div></div>`;
      return;
    }
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const orphaned = new Set(status?.orphaned || []);
    const shown = M.sortHighlights({ highlights: hls }).filter((h) =>
      (!colorFilter.size || colorFilter.has(h.color)) &&
      terms.every((t) => h.exact.toLowerCase().includes(t) || (h.note || '').toLowerCase().includes(t)));

    listEl.innerHTML = `<div class="section-label">${shown.length === hls.length ? `${hls.length} highlight${hls.length === 1 ? '' : 's'}` : `${shown.length} of ${hls.length}`}</div><div class="list"></div>`;
    const list = listEl.querySelector('.list');
    if (!shown.length) list.innerHTML = '<div class="empty">No highlights match.</div>';
    for (const h of shown) {
      list.append(highlightCard(h, {
        settings,
        terms,
        orphaned: orphaned.has(h.id),
        onJump: (x) => chrome.tabs.sendMessage(tab.id, { type: 'scrollTo', id: x.id }).catch(() => toast('Reload the tab first')),
        onUpdate: (patch) => savePage((p) => {
          const t = p.highlights.find((y) => y.id === h.id);
          if (t) Object.assign(t, patch, { updated: Date.now() });
        }),
        onDelete: (x) => {
          savePage((p) => { p.highlights = p.highlights.filter((y) => y.id !== x.id); });
          toast('Highlight removed', 'Undo', () => savePage((p) => { if (!p.highlights.some((y) => y.id === x.id)) p.highlights.push(x); }));
        },
        rerender: () => renderList(page?.highlights || []),
      }));
    }
  }

  // --- wiring ---------------------------------------------------------------
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) settings = await M.getSettings();
    if (key && changes[key]) {
      page = changes[key].newValue || null;
      setTimeout(async () => { await refreshStatus(); render(false); }, 120);
    } else if (changes.settings) {
      render(false);
    }
  });

  chrome.tabs.onActivated.addListener((info) => { if (info.windowId === windowId) refreshTab(); });
  chrome.tabs.onUpdated.addListener((id, info, t) => {
    if (t.windowId !== windowId || !t.active) return;
    if (info.url || info.status === 'complete' || info.title) refreshTab();
  });

  (async () => {
    settings = await M.getSettings();
    windowId = (await chrome.windows.getCurrent()).id;
    await refreshTab();
  })();
})();
