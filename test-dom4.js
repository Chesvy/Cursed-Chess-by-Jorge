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

  // --- start classic PvP game ---
  click('[data-nav="setup-classic"]'); await wait(40);
  click('#setup-mode [data-mode="pvp"]'); await wait(20);
  click('#setup-start'); await wait(200);

  // --- make a move: white pawn e2 -> e4 ---
  click('#board [data-r="6"][data-c="4"]'); await wait(40);
  click('#board [data-r="4"][data-c="4"]'); await wait(60);

  // --- BUG 3: autosave must have stored the active game ---
  // (access via the module's API, which handles localStorage fallbacks in jsdom)
  const active = window.ChessStorage.getActiveGame();
  assert(!!active, 'autosave stored active game (got ' + (active ? 'present' : 'null') + ')');
  if (active) {
    assert(active.turn === 'black', 'autosaved turn is black after white moved (got ' + active.turn + ')');
    assert(!!active.grid[4][4].piece, 'autosaved pawn is at (4,4)');
  }

  // --- BUG 1 & 2: verify the rules exist in the loaded stylesheet text ---
  // jsdom often can't read styleSheets; instead read the CSS file directly.
  const fs = require('fs');
  const css = fs.readFileSync(path.join(__dirname, 'css/style.css'), 'utf8');
  assert(/.promo \.piece[^}]*pointer-events\s*:\s*auto/.test(css), 'CSS has .promo .piece { pointer-events: auto }');
  // Move/capture hints must be small markers (::after), NOT a full-square fill,
  // so the checkerboard stays continuous and the board doesn't look "separated".
  const hintAfter = css.match(/\.cell\.hint::after\s*\{[^}]*width:\s*\d+%[^}]*\}/);
  const capAfter = css.match(/\.cell\.cap::after\s*\{[^}]*width:\s*\d+%[^}]*\}/);
  assert(!!hintAfter,
    'hint uses a small ::after marker, not a full-square fill (rule: ' + (hintAfter ? hintAfter[0].trim() : 'MISSING') + ')');
  assert(!!capAfter,
    'cap uses a ::after ring marker (rule: ' + (capAfter ? capAfter[0].trim() : 'MISSING') + ')');
  // Ensure the old full-square fill is gone
  assert(css.indexOf('inset 0 0 0 999px') < 0, 'no full-square inset fill remains in CSS');
  // Selection must NOT use a rectangular outline/border around the piece;
  // it must be a soft translucent ::before overlay that keeps the board continuous.
  assert(!/\.cell\.sel \.piece\s*\{[^}]*outline/.test(css), 'selected piece has no outline rectangle');
  assert(/\.cell\.sel::before\s*\{[^}]*background:\s*rgba\(250,204,21/.test(css),
    'selected square uses a soft ::before tint overlay');
  // Last-move must not use box-shadow borders either (they frame individual squares).
  assert(!/\.cell\.last-(from|to)\s*\{[^}]*box-shadow/.test(css), 'last-move uses no box-shadow borders');

  console.log('\n--- runtime errors ---');
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  else console.log('none. ALL OK');
  dom.window.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
