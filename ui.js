// UI helpers shared by the side panel and the library page.
(() => {
  const M = globalThis.Margin;

  const ICONS = {
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    jump: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Escape text and wrap search terms in <mark>.
  function markTerms(text, terms) {
    const safe = esc(text);
    if (!terms?.length) return safe;
    const re = new RegExp(`(${terms.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return safe.replace(re, '<mark class="hit">$1</mark>');
  }

  function relTime(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return M.formatDate(ts);
  }

  let toastEl, toastTimer;
  function toast(msg, actionLabel, onAction) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.innerHTML = '<span></span><button hidden></button>';
      document.body.append(toastEl);
    }
    toastEl.firstChild.textContent = msg;
    const b = toastEl.lastChild;
    b.hidden = !actionLabel;
    b.textContent = actionLabel || '';
    b.onclick = () => { onAction?.(); toastEl.classList.remove('in'); };
    toastEl.classList.add('in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('in'), actionLabel ? 5000 : 1600);
  }

  async function copy(text, msg = 'Copied') {
    try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Could not copy'); }
  }

  /**
   * Render one highlight card.
   * opts: { settings, terms, orphaned, onJump, onOpen, onUpdate(patch), onDelete, showTime }
   */
  function highlightCard(h, opts) {
    const el = document.createElement('article');
    el.className = `hl c-${h.color}`;
    el.dataset.id = h.id;
    const label = opts.settings.labels[h.color] || h.color;
    el.innerHTML = `
      <div class="text clamp">${markTerms(h.exact, opts.terms)}</div>
      ${h.note ? `<div class="note" title="Click to edit">${markTerms(h.note, opts.terms)}</div>` : ''}
      <div class="meta">
        <span class="dot c-${h.color}"></span><span>${esc(label)}</span>
        ${opts.showTime !== false ? `<span class="faint">· ${relTime(h.created)}</span>` : ''}
        ${opts.orphaned ? '<span class="badge warn" title="The page text changed and this passage could not be found">Not found on page</span>' : ''}
      </div>
        <span class="actions">
          <span class="color-menu" role="group" aria-label="Color">
            ${M.COLORS.map((c) => `<button class="c-${c.id}" data-color="${c.id}" aria-pressed="${c.id === h.color}" title="${esc(opts.settings.labels[c.id])}"></button>`).join('')}
          </span>
          ${opts.onJump ? `<button class="icon-btn" data-act="jump" title="Show on page">${icon('jump')}</button>` : ''}
          ${opts.onOpen ? `<button class="icon-btn" data-act="open" title="Open at this highlight">${icon('external')}</button>` : ''}
          <button class="icon-btn" data-act="note" title="${h.note ? 'Edit note' : 'Add note'}">${icon('note')}</button>
          <button class="icon-btn" data-act="copy" title="Copy">${icon('copy')}</button>
          <button class="icon-btn danger" data-act="delete" title="Delete">${icon('trash')}</button>
        </span>`;

    const editNote = () => {
      if (el.querySelector('textarea')) return;
      const ta = document.createElement('textarea');
      ta.className = 'note-edit';
      ta.placeholder = `Write a note…  (${M.keys.submit} to save, Esc to cancel)`;
      ta.value = h.note || '';
      const existing = el.querySelector('.note');
      existing ? existing.replaceWith(ta) : el.querySelector('.meta').before(ta);
      ta.focus();
      let done = false;
      const commit = (save) => {
        if (done) return;
        done = true;
        const v = ta.value.trim();
        if (save && v !== (h.note || '')) opts.onUpdate({ note: v });
        else opts.rerender?.();
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(true); }
        if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      });
      ta.addEventListener('blur', () => commit(true));
    };

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.color) return opts.onUpdate({ color: b.dataset.color });
      switch (b?.dataset.act) {
        case 'jump': return opts.onJump(h);
        case 'open': return opts.onOpen(h);
        case 'note': return editNote();
        case 'copy': return copy(h.note ? `${h.exact}\n\nNote: ${h.note}` : h.exact);
        case 'delete': return opts.onDelete(h);
      }
      if (e.target.closest('.note')) return editNote();
      const t = e.target.closest('.text');
      if (t) {
        if (t.classList.contains('clamp') && t.scrollHeight > t.clientHeight + 2) t.classList.remove('clamp');
        else if (opts.onJump) opts.onJump(h);
      }
    });
    return el;
  }

  globalThis.MarginUI = { icon, esc, markTerms, relTime, toast, copy, highlightCard };
})();
