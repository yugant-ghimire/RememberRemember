// Store-screenshot scenes. Open a test page with #scene-<name> and this script seeds sample
// data, adds a caption bar, and puts the UI into the state to capture. Used by scripts/screenshots.sh.
(() => {
  const scene = (location.hash.match(/^#scene-([\w-]+)/) || [])[1];
  if (!scene) return;

  const CAPTIONS = {
    toolbar: 'Highlight anything in one click, or press 1–5',
    note: 'Add notes right where you read',
    panel: 'Every highlight on the page, in the side panel',
    library: 'Search everything you have ever highlighted',
    dark: 'Private by design: nothing ever leaves your browser',
  };

  // --- seed storage before the extension scripts boot ----------------------
  const origin = location.origin;
  const now = Date.now();
  const day = 86400000;
  const h = (id, color, exact, prefix, suffix, note = '', ago = 0) => ({ id, color, exact, prefix, suffix, start: 0, note, created: now - ago });
  const article = {
    url: `${origin}/test/article.html`, title: 'The Quiet Craft of Reading Slowly', site: 'localhost', v: 1,
    created: now - 2 * 3600e3, updated: now - 600e3, note: 'Essay on deliberate reading. Revisit the retrieval section before the book club.',
    highlights: [
      h('a1', 'yellow', 'the shape of an argument becomes visible', 'When you slow down, ', ', and the small hinges', 'Slowing down is what makes structure visible.', 3600e3),
      h('a2', 'pink', 'The remedy is not more reading but better retrieval', 'forgotten within a week. ', ': coming back to a passage', 'Try restating each section from memory.', 3000e3),
      h('a3', 'green', 'a note says why it matters to you', 'this matters”; ', '. The second is where', '', 2400e3),
      h('a4', 'purple', 'A library you own outlives every app that promised to hold it for you.', 'somewhere you control. ', '', '', 1800e3),
      h('a5', 'blue', 'say what it argued in a single sentence', 'look away, and ', '. If you cannot', 'The one-sentence test.', 1200e3),
    ],
  };
  const extra = (slug, title, site, ago, hls, note = '') => ({
    url: `https://${site}/${slug}`, title, site, v: 1, created: now - ago, updated: now - ago, note, highlights: hls,
  });
  const pages = [
    article,
    extra('deep-work-notes', 'Notes on Deep Work and Attention', 'reading-notes.example.org', 1 * day, [
      h('b1', 'yellow', 'Attention is a budget, not a mood.', '', '', 'Plan the day around it.', day),
      h('b2', 'blue', 'Deep work: focus without distraction on a cognitively demanding task.', '', '', '', day),
      h('b3', 'green', 'Shallow tasks expand to fill whatever time you leave unguarded.', '', '', '', day),
    ]),
    extra('spaced-practice', 'Why Spaced Practice Beats Cramming', 'learning-lab.example.com', 3 * day, [
      h('c1', 'yellow', 'Forgetting is not the enemy of learning; it is the signal to review.', '', '', 'Schedule reviews just before you forget.', 3 * day),
      h('c2', 'pink', 'Does the interval depend on how hard the material is?', '', '', '', 3 * day),
    ], 'Good primer on spacing. Pair with the retrieval essay.'),
    extra('writing-to-think', 'Writing Is Thinking, Slowed Down', 'essays.example.net', 6 * day, [
      h('d1', 'purple', 'If you cannot write it plainly, you have not finished thinking it.', '', '', '', 6 * day),
      h('d2', 'green', 'Drafts are where you discover what you actually believe.', '', '', '', 6 * day),
    ]),
  ];
  const store = Object.fromEntries(pages.map((p) => ['p:' + p.url, p]));
  localStorage.setItem('__margin_store', JSON.stringify(store));

  // --- caption bar ----------------------------------------------------------
  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:64px;z-index:2147483646;display:flex;align-items:center;gap:14px;padding:0 28px;'
      + 'background:#5b5bd6;color:#fff;font:600 21px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;letter-spacing:-.01em;';
    bar.innerHTML = '<img src="/icons/icon48.png" width="32" height="32" style="border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.35)"><span></span>';
    bar.lastChild.textContent = CAPTIONS[scene] || '';
    document.documentElement.append(bar);
    document.body.style.paddingTop = '64px';
    const frame = document.querySelector('#frame');
    if (frame) frame.style.height = 'calc(100vh - 64px)';
    if (scene === 'dark') {
      document.body.style.background = '#17181c';
      document.body.style.color = '#d9d9de';
      document.querySelectorAll('aside').forEach((a) => { a.style.color = '#9a9aa2'; a.style.borderColor = '#333'; });
    }
  });

  // --- put the UI into the scene's state -----------------------------------
  const clickHighlight = (color) => {
    const r = [...CSS.highlights.get('mg-' + color)][0]?.getClientRects()[0];
    if (r) document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 12, clientY: r.top + r.height / 2, button: 0 }));
  };
  addEventListener('load', () => setTimeout(() => {
    if (scene === 'toolbar') {
      selectText(document.getElementById('p3'), 'The second is where understanding lives.');
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    }
    if (scene === 'note') clickHighlight('pink');
    if (scene === 'dark') clickHighlight('yellow');
  }, 900));
})();
