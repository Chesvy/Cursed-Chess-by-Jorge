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

  await wait(300); // let DOMContentLoaded fire

  function click(sel) {
    const el = doc.querySelector(sel);
    if (!el) { errors.push('missing ' + sel); return null; }
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return el;
  }
  function cellAt(r, c) {
    return doc.querySelector('#board [data-r="' + r + '"][data-c="' + c + '"]');
  }

  const assert = (cond, msg) => {
    if (!cond) { errors.push('ASSERT FAIL: ' + msg); console.log('FAIL: ' + msg); }
    else console.log('ok: ' + msg);
  };

  // menu visible
  assert(!doc.getElementById('screen-menu').classList.contains('hidden'), 'menu visible');

  // go to classic setup and start
  click('[data-nav="setup-classic"]');
  await wait(50);
  assert(!doc.getElementById('screen-setup').classList.contains('hidden'), 'setup screen shown');
  click('#setup-start');
  await wait(200);
  assert(!doc.getElementById('screen-game').classList.contains('hidden'), 'game screen shown');
  const cells = doc.querySelectorAll('#board .cell').length;
  assert(cells === 64, 'board rendered 64 cells (got ' + cells + ')');
  assert(!!cellAt(6, 4).querySelector('.piece'), 'white pawn at (6,4)');

  // human move: select pawn at (6,0) then move to (5,0)
  click('#board [data-r="6"][data-c="0"]');
  await wait(50);
  assert(!!doc.querySelector('#board [data-r="5"][data-c="0"]').classList.contains('hint'), 'pawn (6,0) has hint at (5,0)');
  click('#board [data-r="5"][data-c="0"]');
  await wait(50);
  assert(!!cellAt(5, 0).querySelector('.piece'), 'pawn moved to (5,0)');
  const info = doc.getElementById('game-info').textContent;
  assert(info.indexOf('Negras') >= 0, 'turn switched to black');

  // save game
  click('#game-save');
  await wait(50);
  assert(!doc.getElementById('modal').classList.contains('hidden'), 'save modal shown');

  console.log('\n--- runtime errors ---');
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  else console.log('none. ALL OK');
  dom.window.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
