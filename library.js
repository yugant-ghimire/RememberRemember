// Library: every highlight across every page, with search, filters, settings and backup.
(() => {
  const M = globalThis.Margin;
  const { icon, esc, markTerms, relTime, toast, copy, highlightCard } = globalThis.MarginUI;
  const $ = (id) => document.getElementById(id);

  let pages = [];
  let settings = M.DEFAULT_SETTINGS;
  const state = { q: '', colors: new Set(), site: null, notesOnly: false, sort: 'updated', expanded: new Set() };
  const PER_PAGE_PREVIEW = 6;

  // --- static chrome ---------------------------------------------------------
  $('searchIcon').innerHTML = icon('search');
  $('settingsBtn').innerHTML = icon('settings');
  $('exportBtn').innerHTML = `${icon('download')} Export`;
  $('noteIcon').innerHTML = icon('note');
  $('closeSettings').innerHTML = icon('x');
  $('welcomeClose').innerHTML = icon('x');
  $('welcomeLock').innerHTML = icon('lock');
  $('exportJson').innerHTML = `${icon('download')} Backup (.json)`;
  $('exportMd').innerHTML = `${icon('download')} Markdown (.md)`;
  $('importBtn').innerHTML = `${icon('upload')} Restore from backup`;

  $('panelKey').textContent = M.keys.panel;
  // A site icon that fails to load falls back to our own icon instead of a broken image.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = 'icons/icon16.png'; }
  }, true);
  if (new URLSearchParams(location.search).has('welcome')) $('welcome').hidden = false;
  $('welcomeClose').onclick = () => { $('welcome').hidden = true; history.replaceState(null, '', 'library.html'); };

  // --- data -----------------------------------------------------------------
  async function load() {
    [pages, settings] = await Promise.all([M.getAllPages(), M.getSettings()]);
    render();
  }

  async function mutatePage(pageUrl, mutate) {
    const k = M.pageKey(pageUrl);
    const cur = (await chrome.storage.local.get(k))[k];
    if (!cur) return;
    mutate(cur);
    M.touch(cur);
    if (!cur.highlights.length && !cur.note) await chrome.storage.local.remove(k);
    else await chrome.storage.local.set({ [k]: cur });
  }

  let reloadTimer = 0;
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area !== 'local') return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 60);
  });

  // --- filtering ------------------------------------------------------------
  function terms() {
    return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function filtered() {
    const ts = terms();
    const out = [];
    for (const p of pages) {
      if (state.site && p.site !== state.site) continue;
      // A title/URL match keeps all of a page's highlights; a page-note match shows just the page note.
      const titleText = `${p.title} ${p.url}`.toLowerCase();
      const pageText = `${titleText} ${p.note || ''}`.toLowerCase();
      const hls = M.sortHighlights(p).filter((h) => {
        if (state.colors.size && !state.colors.has(h.color)) return false;
        if (state.notesOnly && !h.note) return false;
        const hay = `${h.exact} ${h.note || ''}`.toLowerCase();
        return ts.every((t) => hay.includes(t) || titleText.includes(t));
      });
      const pageOnlyMatch = !hls.length && !state.colors.size && !state.notesOnly && p.note && ts.every((t) => pageText.includes(t));
      if (hls.length || pageOnlyMatch) out.push({ page: p, hls });
    }
    const by = {
      updated: (a, b) => (b.page.updated || 0) - (a.page.updated || 0),
      created: (a, b) => (b.page.created || 0) - (a.page.created || 0),
      title: (a, b) => (a.page.title || '').localeCompare(b.page.title || ''),
      count: (a, b) => b.hls.length - a.hls.length,
    }[state.sort];
    return out.sort(by);
  }

  // --- rendering ------------------------------------------------------------
  function render() {
    renderRail();
    renderPages();
  }

  function renderRail() {
    const all = pages.flatMap((p) => p.highlights || []);
    const notes = all.filter((h) => h.note).length + pages.filter((p) => p.note).length;
    $('stats').innerHTML = `
      <div class="stat"><b>${all.length}</b><span>highlights</span></div>
      <div class="stat"><b>${pages.length}</b><span>pages</span></div>
      <div class="stat"><b>${notes}</b><span>notes</span></div>`;

    const counts = {};
    for (const h of all) counts[h.color] = (counts[h.color] || 0) + 1;
    $('colorFilters').innerHTML = M.COLORS.map((c) => `
      <button class="rail-item" data-color="${c.id}" aria-pressed="${state.colors.has(c.id)}">
        <span class="dot c-${c.id}"></span><span class="name">${esc(settings.labels[c.id])}</span><span class="n">${counts[c.id] || 0}</span>
      </button>`).join('');

    const sites = {};
    for (const p of pages) sites[p.site] = (sites[p.site] || 0) + (p.highlights?.length || 0);
    const top = Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 25);
    $('siteFilters').innerHTML = top.length ? top.map(([s, n]) => {
      const sample = pages.find((p) => p.site === s);
      return `<button class="rail-item" data-site="${esc(s)}" aria-pressed="${state.site === s}">
        <img src="${M.faviconUrl(sample.url, 16)}" alt=""><span class="name">${esc(s)}</span><span class="n">${n}</span></button>`;
    }).join('') : '<div class="faint rail-empty">None yet</div>';

    $('notesOnly').setAttribute('aria-pressed', state.notesOnly);
  }

  function renderPages() {
    const ts = terms();
    const res = filtered();
    const nH = res.reduce((s, r) => s + r.hls.length, 0);
    const filtering = ts.length || state.colors.size || state.site || state.notesOnly;
    $('resultCount').textContent = filtering
      ? `${nH} highlight${nH === 1 ? '' : 's'} on ${res.length} page${res.length === 1 ? '' : 's'}`
      : `${res.length} page${res.length === 1 ? '' : 's'}`;

    const root = $('pages');
    root.innerHTML = '';
    if (!pages.length) {
      root.innerHTML = `<div class="empty"><span class="art">${icon('highlighter')}</span>
        <h3>Your library is empty</h3><p>Highlight something on any web page — it shows up here instantly.</p></div>`;
      return;
    }
    if (!res.length) {
      root.innerHTML = `<div class="empty"><h3>Nothing matches</h3><p>Try a different search or clear the filters.</p>
        <button class="btn" id="clearFilters">Clear filters</button></div>`;
      $('clearFilters').onclick = () => {
        state.q = ''; $('q').value = ''; state.colors.clear(); state.site = null; state.notesOnly = false; render();
      };
      return;
    }

    const frag = document.createDocumentFragment();
    for (const { page: p, hls } of res) {
      const card = document.createElement('section');
      card.className = 'pcard';
      const total = p.highlights?.length || 0;
      card.innerHTML = `
        <div class="phead">
          <img src="${M.faviconUrl(p.url)}" alt="">
          <div class="t">
            <a class="title" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${markTerms(p.title || p.url, ts)}</a>
            <div class="sub">${esc(p.site)} · ${total} highlight${total === 1 ? '' : 's'} · updated ${relTime(p.updated || p.created)}</div>
          </div>
          <div class="acts">
            <button class="icon-btn" data-act="md" title="Copy as Markdown">${icon('copy')}</button>
            <button class="icon-btn" data-act="dl" title="Export page as Markdown">${icon('download')}</button>
            <button class="icon-btn danger" data-act="del" title="Delete page and its highlights">${icon('trash')}</button>
          </div>
        </div>
        ${p.note ? `<div class="pnote"><b>Page note</b>${markTerms(p.note, ts)}</div>` : ''}
        <div class="hls"></div>`;
      const list = card.querySelector('.hls');
      const showAll = state.expanded.has(p.url) || filtering;
      const visible = showAll ? hls : hls.slice(0, PER_PAGE_PREVIEW);
      for (const h of visible) {
        list.append(highlightCard(h, {
          settings,
          terms: ts,
          onOpen: (x) => chrome.tabs.create({ url: M.textFragmentUrl(p.url, x.exact) }),
          onUpdate: (patch) => mutatePage(p.url, (cur) => {
            const t = cur.highlights.find((y) => y.id === h.id);
            if (t) Object.assign(t, patch, { updated: Date.now() });
          }),
          onDelete: (x) => {
            mutatePage(p.url, (cur) => { cur.highlights = cur.highlights.filter((y) => y.id !== x.id); });
            toast('Highlight removed', 'Undo', () => restorePage({ ...p, highlights: [x] }));
          },
          rerender: renderPages,
        }));
      }
      if (visible.length < hls.length) {
        const more = document.createElement('button');
        more.className = 'btn more';
        more.textContent = `Show ${hls.length - visible.length} more`;
        more.onclick = () => { state.expanded.add(p.url); renderPages(); };
        list.append(more);
      }
      card.querySelector('.acts').addEventListener('click', async (e) => {
        const act = e.target.closest('button')?.dataset.act;
        if (act === 'md') copy(M.pageToMarkdown(p, settings), 'Markdown copied');
        if (act === 'dl') M.download(`${M.slug(p.title)}.md`, M.pageToMarkdown(p, settings));
        if (act === 'del') {
          await chrome.storage.local.remove(M.pageKey(p.url));
          toast(`Deleted “${(p.title || p.url).slice(0, 40)}”`, 'Undo', () => restorePage(p));
        }
      });
      frag.append(card);
    }
    root.append(frag);
  }

  // Merge a page record back in (used by undo and import); highlights are merged by id.
  async function restorePage(p) {
    const k = M.pageKey(p.url);
    const cur = (await chrome.storage.local.get(k))[k];
    if (!cur) { await chrome.storage.local.set({ [k]: M.touch({ ...p }) }); return; }
    const ids = new Set(cur.highlights.map((h) => h.id));
    cur.highlights.push(...(p.highlights || []).filter((h) => !ids.has(h.id)));
    if (!cur.note && p.note) cur.note = p.note;
    M.touch(cur);
    await chrome.storage.local.set({ [k]: cur });
  }

  // --- interactions ---------------------------------------------------------
  let qTimer = 0;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value; renderPages(); }, 80);
  });
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; state.q = ''; renderPages(); e.target.blur(); } });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); $('q').focus(); $('q').select(); }
  });
  $('sort').onchange = (e) => { state.sort = e.target.value; renderPages(); };
  $('colorFilters').addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]')?.dataset.color;
    if (!c) return;
    state.colors.has(c) ? state.colors.delete(c) : state.colors.add(c);
    render();
  });
  $('siteFilters').addEventListener('click', (e) => {
    const s = e.target.closest('[data-site]')?.dataset.site;
    if (!s) return;
    state.site = state.site === s ? null : s;
    render();
  });
  $('notesOnly').onclick = () => { state.notesOnly = !state.notesOnly; render(); };

  // --- export / import ------------------------------------------------------
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportJson() {
    const data = { app: 'margin', version: 1, exported: new Date().toISOString(), settings, pages };
    M.download(`rememberremember-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
  function exportMd() {
    const res = filtered().map(({ page: p, hls }) => ({ ...p, highlights: hls }));
    M.download(`rememberremember-highlights-${stamp()}.md`, M.pagesToMarkdown(res, settings));
  }
  $('exportBtn').onclick = exportMd;
  $('exportBtn').title = 'Export the highlights currently shown as Markdown';
  $('exportJson').onclick = exportJson;
  $('exportMd').onclick = exportMd;
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'margin' || !Array.isArray(data.pages)) throw new Error('Not a RememberRemember backup');
      let n = 0;
      for (const p of data.pages) {
        if (!p?.url || !Array.isArray(p.highlights) || !M.normalizeUrl(p.url)) continue;
        const clean = {
          url: p.url, title: String(p.title || p.url), site: M.hostOf(p.url), created: +p.created || Date.now(),
          updated: +p.updated || Date.now(), note: String(p.note || ''),
          highlights: p.highlights.filter((h) => h?.id && typeof h.exact === 'string').map((h) => ({
            id: String(h.id), color: M.COLOR_IDS.includes(h.color) ? h.color : 'yellow', exact: h.exact,
            prefix: String(h.prefix || ''), suffix: String(h.suffix || ''), start: +h.start || 0,
            note: String(h.note || ''), created: +h.created || Date.now(), ...(h.updated ? { updated: +h.updated } : {}),
          })),
        };
        n += clean.highlights.length;
        await restorePage(clean);
      }
      if (data.settings?.labels) await M.saveSettings({ labels: { ...settings.labels, ...data.settings.labels } });
      toast(`Imported ${n} highlights`);
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };
  $('eraseAll').onclick = async () => {
    const n = pages.reduce((s, p) => s + (p.highlights?.length || 0), 0);
    if (!confirm(`Permanently delete all ${n} highlights on ${pages.length} pages from this browser?\n\nTip: make a backup first.`)) return;
    await chrome.storage.local.remove(pages.map((p) => M.pageKey(p.url)));
    toast('All highlights deleted');
  };

  // --- settings dialog ------------------------------------------------------
  function renderSettings() {
    $('labelInputs').innerHTML = M.COLORS.map((c) => `
      <label><span class="dot c-${c.id}"></span><input data-color="${c.id}" value="${esc(settings.labels[c.id])}" maxlength="24" placeholder="${esc(c.label)}"></label>`).join('');
    $('showToolbar').checked = settings.showToolbar;
    $('pausedSites').innerHTML = settings.disabledSites.length
      ? settings.disabledSites.map((s) => `<span class="chip">${esc(s)}<button type="button" data-site="${esc(s)}" title="Resume">${icon('x')}</button></span>`).join('')
      : '<span class="faint">RememberRemember is active on every site.</span>';
    navigator.storage?.estimate && chrome.storage.local.getBytesInUse(null).then((b) => {
      $('usage').textContent = `Using ${(b / 1024).toFixed(b > 102400 ? 0 : 1)} KB.`;
    });
  }
  $('settingsBtn').onclick = () => { renderSettings(); $('settings').showModal(); };
  $('labelInputs').addEventListener('change', async (e) => {
    const c = e.target.dataset.color;
    if (!c) return;
    const label = e.target.value.trim() || M.COLORS.find((x) => x.id === c).label;
    settings = await M.saveSettings({ labels: { ...settings.labels, [c]: label } });
    toast('Saved');
  });
  $('showToolbar').onchange = async (e) => { settings = await M.saveSettings({ showToolbar: e.target.checked }); };
  $('pausedSites').addEventListener('click', async (e) => {
    const s = e.target.closest('[data-site]')?.dataset.site;
    if (!s) return;
    settings = await M.saveSettings({ disabledSites: settings.disabledSites.filter((x) => x !== s) });
    renderSettings();
  });
  const addSite = async () => {
    const raw = $('newSite').value.trim();
    if (!raw) return;
    const host = M.hostOf(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!settings.disabledSites.includes(host)) settings = await M.saveSettings({ disabledSites: [...settings.disabledSites, host] });
    $('newSite').value = '';
    renderSettings();
  };
  $('addSite').onclick = addSite;
  $('newSite').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSite(); } });

  load();
})();
