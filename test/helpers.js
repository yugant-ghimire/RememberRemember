// article.html#panel docks the side panel on the right, like Chrome's side panel.
// (A hash, because Margin ignores it when matching pages.)
if (location.hash === '#panel' || location.hash === '#scene-panel') {
  const top = location.hash === '#scene-panel' ? 64 : 0;
  addEventListener('DOMContentLoaded', async () => {
    const s = document.createElement('script');
    s.src = 'mount.js';
    s.onload = () => {
      const f = document.createElement('iframe');
      f.style.cssText = `position:fixed;top:${top}px;right:0;width:360px;height:calc(100vh - ${top}px);border:0;border-left:1px solid #ddd;`;
      document.documentElement.append(f);
      document.body.style.marginRight = '380px';
      mountExtensionPage(f, 'sidepanel.html');
    };
    document.head.append(s);
  });
}

// Test helper: select the nth occurrence of `needle` inside `el`, ignoring whitespace differences.
window.selectText = function selectText(el, needle, nth = 0) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const ns = [];
  let t = '';
  for (let n = w.nextNode(); n; n = w.nextNode()) { ns.push([n, t.length]); t += n.nodeValue; }
  const re = new RegExp(needle.split(' ').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
  let m;
  for (let k = 0; k <= nth; k++) m = re.exec(t);
  if (!m) throw new Error(`not found: ${needle}`);
  const i = m.index, j = i + m[0].length;
  const at = (off, end) => {
    for (let k = ns.length - 1; k >= 0; k--) if (end ? ns[k][1] < off : ns[k][1] <= off) return [ns[k][0], off - ns[k][1]];
  };
  const r = document.createRange();
  r.setStart(...at(i));
  r.setEnd(...at(j, true));
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
};
