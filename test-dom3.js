const { JSDOM } = require('jsdom');
const path = require('path');

(async () => {
  const file = path.join(__dirname, 'index.html');
  const dom = await JSDOM.fromFile(file, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file://' + file,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const doc = window.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));
  await wait(300);
  const click = (sel) => { const el = doc.querySelector(sel); if (!el) errors.push('missing ' + sel); else el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
  const assert = (c, m) => { if (!c) { errors.push('ASSERT: ' + m); console.log('FAIL: ' + m); } else console.log('ok: ' + m); };

  click('[data-nav="editor"]'); await wait(50);

  // ---- 2x2 ----
  let size = doc.getElementById('editor-size');
  size.value = 2;
  click('#editor-resize'); await wait(60);
  let cells = doc.querySelectorAll('#editor-board .cell').length;
  assert(cells === 4, '2x2 board renders 4 cells (got ' + cells + ')');
  let w = doc.getElementById('editor-board').style.gridTemplateColumns;
  assert(w.indexOf('repeat(2,') === 0, '2x2 grid columns set: ' + w);

  // ---- 24x24 ----
  size.value = 24;
  click('#editor-resize'); await wait(120);
  cells = doc.querySelectorAll('#editor-board .cell').length;
  assert(cells === 576, '24x24 board renders 576 cells (got ' + cells + ')');
  w = doc.getElementById('editor-board').style.gridTemplateColumns;
  assert(w.indexOf('repeat(24,') === 0, '24x24 grid columns set: ' + w);
  const cellEl = doc.querySelector('#editor-board .cell');
  const cellW = parseInt(cellEl.style.width, 10);
  assert(cellW > 0 && cellW * 24 <= 800, 'cell width scaled to fit: ' + cellW + 'px');
  console.log('DEBUG 24x24 cell width =', cellW, 'total =', cellW * 24);

  // ---- black hole on 2x2 clamps (region 4x4 -> whole 2x2) ----
  click('[data-nav="editor"]'); await wait(40);
  size = doc.getElementById('editor-size'); size.value = 2;
  click('#editor-resize'); await wait(60);
  click('#editor-tools [data-tool="black"]'); await wait(30);
  click('#editor-board [data-r="0"][data-c="0"]'); await wait(40);
  assert(doc.querySelectorAll('#editor-board .cell.black').length === 4, 'black hole on 2x2 covers all 4 cells');

  console.log('\n--- runtime errors ---');
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  else console.log('none. ALL OK');
  dom.window.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
