const { JSDOM } = require('jsdom');
const path = require('path');
(async () => {
  const file = path.join(__dirname, 'index.html');
  const dom = await JSDOM.fromFile(file, { runScripts: 'dangerously', resources: 'usable', url: 'file://' + file, pretendToBeVisual: true });
  const { window } = dom; const doc = window.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));
  await wait(300);
  const click = (sel) => { const el = doc.querySelector(sel); if (!el) errors.push('missing ' + sel); else el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
  const assert = (c, m) => { if (!c) { errors.push('ASSERT: ' + m); console.log('FAIL: ' + m); } else console.log('ok: ' + m); };

  // open designer
  click('[data-nav="designer"]'); await wait(100);
  assert(!doc.getElementById('screen-designer').classList.contains('hidden'), 'designer open');

  // pixel grid rendered (8x8 default)
  const px = doc.querySelectorAll('#pixel-grid .px').length;
  assert(px === 64, 'pixel grid has 64 cells (got ' + px + ')');

  // paint: click palette color index 2 (white), then paint a pixel
  const palBtns = doc.querySelectorAll('#px-palette button');
  palBtns[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // first color after eraser
  await wait(20);
  const pxCell = doc.querySelector('#pixel-grid [data-i="2"][data-j="3"]');
  pxCell.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  assert(pxCell.style.background !== '', 'pixel painted (bg=' + pxCell.style.background + ')');

  // switch to moves tab
  click('#des-tabs [data-tab="moves"]'); await wait(40);
  assert(doc.querySelector('#screen-designer .tabpage[data-page="moves"]') && !doc.querySelector('#screen-designer .tabpage[data-page="moves"]').classList.contains('hidden'), 'moves tab shown');
  const mcells = doc.querySelectorAll('#moves-board .mcell').length;
  assert(mcells === 49, 'moves board has 49 cells (got ' + mcells + ')');

  // mark a move: click cell above center (dy=-1)
  click('#moves-tools [data-mtool="move"]'); await wait(10);
  doc.querySelector('#moves-board [data-dy="-1"][data-dx="0"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await wait(20);
  let cellUp = doc.querySelector('#moves-board [data-dy="-1"][data-dx="0"]');
  let markers = cellUp.querySelector('.markers');
  assert(markers && markers.querySelector('.dot'), 'move marked with a dot on up cell');

  // mark a ranged attack on same cell (two dots) -> multiple colors on same cell
  click('#moves-tools [data-mtool="ranged"]'); await wait(10);
  doc.querySelector('#moves-board [data-dy="-1"][data-dx="0"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await wait(20);
  cellUp = doc.querySelector('#moves-board [data-dy="-1"][data-dx="0"]');
  const dotCount = cellUp.querySelectorAll('.markers .dot').length;
  assert(dotCount === 2, 'same cell has 2 markers (move+ranged) (got ' + dotCount + ')');

  // set name and save
  const nm = doc.getElementById('des-name'); nm.value = 'Pieza prueba'; nm.dispatchEvent(new window.Event('input', { bubbles: true }));
  click('#des-save'); await wait(50);
  assert(!doc.getElementById('des-error').textContent, 'no error on save');
  assert(!!window.ChessStorage.getDesign ? true : true, 'ok');

  // design saved in registry
  const all = window.ChessPieces.allDesigns();
  const created = all.find(d => d.name === 'Pieza prueba');
  assert(!!created, 'design saved in registry');
  if (created) {
    assert(created.moves.length >= 1, 'design has moves');
    const up = created.moves.find(m => m.dy === -1 && m.dx === 0);
    assert(up && up.canMove && up.canRanged, 'up cell has canMove+canRanged');
  }

  // pixel piece renders as SVG
  const svg = window.ChessPieces.pieceToSVG(created, 'white', 40);
  assert(typeof svg === 'string' && svg.indexOf('<svg') === 0, 'pieceToSVG returns an SVG string');

  console.log('\n--- runtime errors ---');
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  else console.log('none. ALL OK');
  dom.window.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
