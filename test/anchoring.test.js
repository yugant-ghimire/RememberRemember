// Anchoring tests: drive the real content script and check what it stores and paints.
// Open test/anchoring.test.html in a browser, or run test/run-tests.sh for headless Chrome.
(async () => {
  const results = [];
  const check = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const status = () => window.__marginSend({ type: 'status' });
  const painted = (color) => [...CSS.highlights.get('mg-' + color)].map((r) => norm(r.toString()));
  const rangeFor = (color, text) => [...CSS.highlights.get('mg-' + color)].find((r) => norm(r.toString()) === text);
  const stored = () => Object.values(__marginStore.read()).flatMap((p) => p.highlights || []);
  const highlight = async (el, text, color, nth = 0) => {
    selectText(el, text, nth);
    const res = await window.__marginSend({ type: 'highlightSelection', color });
    await wait(150);
    return res;
  };
  const $ = (id) => document.getElementById(id);

  try {
    await wait(900); // content script boot + first re-anchor pass

    let st = await status();
    check('seeded highlight with stale offset is found by context', st.anchored.includes('h-seed') && painted('yellow').includes('the small hinges that hold it together'));
    check('seeded highlight whose text is gone is reported orphaned', st.orphaned.includes('h-gone') && !painted('purple').length);
    check('stale record is migrated to the current schema version on write', true);

    await highlight($('p1'), 'the shape of an argument becomes visible', 'blue');
    const blue = stored().find((h) => h.color === 'blue');
    check('selection across <em> boundary stores exact text', blue?.exact === 'the shape of an argument becomes visible', blue?.exact);
    check('selection across <em> boundary is painted', painted('blue').includes('the shape of an argument becomes visible'));

    await highlight(document.body, 'Most of what we read is forgotten within a week', 'green', 1);
    check('second of two identical phrases is the one highlighted', $('aside').contains(rangeFor('green', 'Most of what we read is forgotten within a week')?.startContainer));

    const intro = document.createElement('p');
    intro.textContent = 'Editor note: a new paragraph inserted above shifts every stored offset.';
    $('article').prepend(intro);
    $('p1').innerHTML = $('p1').innerHTML.replace('<em>shape of an argument</em>', '<span>shape of an <b>argument</b></span>');
    await wait(700);
    st = await status();
    check('all highlights survive inserted content + rewrapped markup', ['h-seed', blue.id].every((id) => st.anchored.includes(id)) && painted('blue').includes('the shape of an argument becomes visible'));
    check('duplicate phrase stays on the second occurrence after edits', $('aside').contains(rangeFor('green', 'Most of what we read is forgotten within a week')?.startContainer));

    await highlight($('p3'), 'Good notes are conversations with the text.', 'pink');
    $('p3').innerHTML = '\n   Good   notes are\n conversations   with the\ttext. A highlight says “this matters”; a note says why.';
    await wait(700);
    check('whitespace and line-break changes do not break a highlight', painted('pink').includes('Good notes are conversations with the text.'));

    await highlight($('p4'), 'A library you own outlives every app', 'yellow');
    $('p4').textContent = 'A LIBRARY YOU OWN OUTLIVES EVERY APP that promised to hold it for you.';
    await wait(700);
    check('letter-case change falls back to case-insensitive match', painted('yellow').includes('A LIBRARY YOU OWN OUTLIVES EVERY APP'));

    const p3 = $('p3');
    const pinkId = stored().find((h) => h.color === 'pink').id;
    const holder = document.createElement('div');
    p3.replaceWith(holder);
    await wait(700);
    st = await status();
    check('highlight whose paragraph is removed becomes orphaned', st.orphaned.includes(pinkId));
    holder.replaceWith(p3);
    await wait(700);
    st = await status();
    check('orphaned highlight re-anchors when its text comes back', st.anchored.includes(pinkId));

    const page = Object.values(__marginStore.read())[0];
    results[2].pass = page.v === Margin.SCHEMA_VERSION;
    results[2].detail = `v=${page.v}`;
  } catch (err) {
    check('test run completed without exceptions', false, String(err && err.stack || err));
  }

  const passed = results.filter((r) => r.pass).length;
  const summary = `${passed === results.length ? 'PASS' : 'FAIL'} ${passed}/${results.length}`;
  const lines = results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.detail && !r.pass ? `  [${r.detail}]` : ''}`);
  document.getElementById('results').textContent = `${summary}\n\n${lines.join('\n')}`;
  document.title = summary;
  console.log(summary + '\n' + lines.join('\n'));
  window.__testResults = { summary, results };
})();
