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

  // ---- AI mode ----
  click('[data-nav="setup-classic"]'); await wait(40);
  // switch mode to AI
  click('#setup-mode [data-mode="ai"]'); await wait(40);
  assert(doc.getElementById('setup-ai-opts') && !doc.getElementById('setup-ai-opts').classList.contains('hidden'), 'AI options shown');
  click('#setup-diff [data-diff="1"]'); // easy
  click('#setup-start'); await wait(900);
  assert(!doc.getElementById('screen-game').classList.contains('hidden'), 'AI game started');
  // AI is white (default), so after its move it's the human's (black) turn
  const info = doc.getElementById('game-info').textContent;
  assert(info.indexOf('Negras') >= 0, 'AI (blancas) moved, human (negras) to move: ' + info);

  // ---- Editor: custom board with features ----
  click('[data-nav="editor"]'); await wait(60);
  assert(!doc.getElementById('screen-editor').classList.contains('hidden'), 'editor open');
  click('#editor-tools [data-tool="black"]'); await wait(30);
  // click cell 0,0 to paint black hole 4x4
  click('#editor-board [data-r="0"][data-c="0"]'); await wait(40);
  assert(doc.querySelector('#editor-board [data-r="0"][data-c="3"]').classList.contains('black'), 'black hole painted 4x4 (0,3 is black)');
  // water
  click('#editor-tools [data-tool="water"]'); await wait(30);
  click('#editor-board [data-r="5"][data-c="5"]'); await wait(40);
  assert(doc.querySelector('#editor-board [data-r="5"][data-c="5"]').classList.contains('water'), 'water painted');
  // belt with direction east level 2
  click('#editor-tools [data-tool="belt"]'); await wait(30);
  click('#belt-dir [data-dir="e"]'); await wait(30);
  const lvl = doc.getElementById('belt-level'); lvl.value = 2; lvl.dispatchEvent(new window.Event('input', { bubbles: true }));
  click('#editor-board [data-r="3"][data-c="3"]'); await wait(40);
  assert(doc.querySelector('#editor-board [data-r="3"][data-c="3"]').classList.contains('belt'), 'belt painted');
  // place a marine (siren) custom piece on water
  click('#editor-tools [data-tool="piece"]'); await wait(30);
  const pt = doc.getElementById('piece-type');
  pt.value = 'd_siren'; pt.dispatchEvent(new window.Event('change', { bubbles: true }));
  click('#editor-board [data-r="5"][data-c="5"]'); await wait(40);
  assert(!!doc.querySelector('#editor-board [data-r="5"][data-c="5"] .piece'), 'siren placed on water');
  // save board (prompt won't work in jsdom; stub prompt)
  window.prompt = () => 'Tablero de prueba';
  click('#editor-save'); await wait(50);

  // ---- Play custom board ----
  click('[data-nav="setup-custom"]'); await wait(40);
  // make sure we're in 2-player mode (AI was left on from earlier)
  click('#setup-mode [data-mode="pvp"]'); await wait(30);
  const sel = doc.getElementById('setup-board-select');
  const opt = Array.from(sel.options).find((o) => o.textContent.indexOf('Tablero de prueba') >= 0);
  assert(!!opt, 'custom board appears in picker');
  if (opt) { sel.value = opt.value; sel.dispatchEvent(new window.Event('change', { bubbles: true })); }
  click('#setup-start'); await wait(200);
  assert(!doc.getElementById('screen-game').classList.contains('hidden'), 'custom game started');
  assert(!!doc.querySelector('#board [data-r="0"][data-c="0"]').classList.contains('black'), 'black hole shows in game');
  const sirenCell = doc.querySelector('#board [data-r="5"][data-c="5"]');
  const totalPieces = doc.querySelectorAll('#board .piece').length;
  console.log('DEBUG sirenCell classes=', sirenCell ? sirenCell.className : 'NULL', 'html=', sirenCell ? sirenCell.innerHTML : '');
  console.log('DEBUG total pieces on custom board=', totalPieces);
  assert(!!(sirenCell && sirenCell.querySelector('.piece')), 'siren on water rendered');

  console.log('\n--- runtime errors ---');
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  else console.log('none. ALL OK');
  dom.window.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
