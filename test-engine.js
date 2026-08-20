const P = require('./js/pieces.js');
P.defaultDesigns();
const E = require('./js/engine.js');

function test(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (e) { console.log('FAIL ' + name + ': ' + e.message); }
}

// 1. Classic setup + king capture
test('king capture ends game', () => {
  // build state, manually put kings close
  const st = E.buildState(8);
  st.grid[4][4].piece = { id: 'wk', color: 'white', type: 'k' };
  st.grid[4][5].piece = { id: 'bk', color: 'black', type: 'k' };
  st.grid[3][4].piece = { id: 'wq', color: 'white', type: 'q' };
  st.grid[3][5].piece = null;
  st.grid[4][5].piece = null;
  st.grid[4][5].piece = { id: 'bk', color: 'black', type: 'k' };
  const moves = E.getLegalMoves(st, 'white');
  // white queen at (3,4) can capture king at (4,5)
  const qcap = moves.find(m => m.from[0]===3 && m.from[1]===4 && m.to[0]===4 && m.to[1]===5);
  if (!qcap) throw new Error('queen should capture king');
  const res = E.makeMove(st, qcap);
  if (!res.state.over) throw new Error('game should be over');
  if (res.state.winner !== 'white') throw new Error('white should win');
});

// 2. pawn en passant
test('pawn en passant + promotion flag', () => {
  const st = E.buildState(8);
  st.grid = E.newEmptyBoard(8);
  st.grid[3][4].piece = { id: 'w', color: 'white', type: 'p' };
  st.enPassant = { target: [2, 3], color: 'white' };
  const moves = E.getLegalMoves(st, 'white');
  const ep = moves.find(m => m.flags && m.flags.enpassant);
  if (!ep) throw new Error('en passant not found');
});

// 3. water sink
test('normal piece sinks on water', () => {
  const st = E.buildState(8);
  st.grid[4][4].feature = { kind: E.FEAT_WATER };
  st.grid[4][4].piece = { id: 'rp', color: 'white', type: 'p' };
  st.grid[4][4].piece = null;
  st.grid[3][4].piece = { id: 'w', color: 'white', type: 'p' };
  // move white pawn onto water
  const moves = E.getLegalMoves(st, 'white');
  const mv = moves.find(m => m.to[0]===4 && m.to[1]===4);
  if (!mv) throw new Error('should be allowed to step on water');
  const res = E.makeMove(st, mv);
  if (res.state.grid[4][4].piece !== null) throw new Error('pawn should sink');
});

// 4. marine piece stays on water
test('marine piece stays on water', () => {
  const st = E.buildState(8);
  st.grid[5][4].feature = { kind: E.FEAT_WATER };
  st.grid[4][4].piece = { id: 's', color: 'white', type: 'd_siren' };
  const moves = E.getLegalMoves(st, 'white');
  const mv = moves.find(m => m.to[0]===5 && m.to[1]===4);
  if (!mv) throw new Error('siren should move to water');
  const res = E.makeMove(st, mv);
  if (!res.state.grid[5][4].piece) throw new Error('siren should survive on water');
});

// 5. black hole absorbs
test('black hole absorbs pieces', () => {
  const st = E.buildState(8);
  E.paintRegion(st.grid, 4, 4, E.FEAT_BLACK, 4);
  st.grid[4][4].piece = null;
  const st2 = E.buildState(8);
  E.paintRegion(st2.grid, 4, 4, E.FEAT_BLACK, 4);
  st2.grid[4][4].piece = { id: 'r', color: 'black', type: 'r' };
  // trigger resolution by making a harmless move
  const mv = E.getLegalMoves(st2, 'black').find(m => m.from[0]===1 && m.to[0]===2);
  const r2 = E.makeMove(st2, mv);
  if (r2.state.grid[4][4].piece) throw new Error('rook should be absorbed');
});

// 6. belt pushes piece
test('belt pushes piece level amount', () => {
  const st = E.buildState(8);
  // belt at (4,2) dir s level 2; white pawn at (5,2) moves up onto it
  st.grid[4][2].feature = { kind: E.FEAT_BELT, dir: 's', level: 2 };
  st.grid[5][2].piece = { id: 'p', color: 'white', type: 'p' };
  st.grid[4][2].piece = null;
  st.grid[6][2].piece = null;
  const mv = E.getLegalMoves(st, 'white').find(m => m.from[0]===5 && m.from[1]===2 && m.to[0]===4);
  if (!mv) throw new Error('pawn should be able to step onto belt');
  const r = E.makeMove(st, mv);
  // piece should end at (6,2)
  if (!r.state.grid[6][2].piece) throw new Error('piece should be pushed to 6,2');
});

console.log('done');

// 7. new-format custom piece: ranged attack, attack, jump
test('new-format piece: ranged + attack + jump', () => {
  const d = P.addDesign(P.newDesign()); d.name = 'Test';
  d.moves = [
    { dx: 0, dy: -1, canMove: true, canAttack: true, canJump: false, canRanged: false },
    { dx: 0, dy: -2, canMove: false, canAttack: false, canJump: false, canRanged: true },
    { dx: 1, dy: -2, canMove: true, canAttack: false, canJump: true, canRanged: false },
  ];
  // ranged
  const st = E.buildState(8);
  st.grid[5][3].piece = { id: 'a', color: 'white', type: d.id };
  st.grid[3][3].piece = { id: 'e', color: 'black', type: 'p' };
  let ms = E.getLegalMoves(st, 'white');
  const ranged = ms.find(m => m.flags && m.flags.ranged);
  if (!ranged) throw new Error('no ranged');
  if (ranged.to[0] !== 3) throw new Error('ranged target wrong');
  const res = E.makeMove(st, ranged);
  if (res.state.grid[5][3].piece === null) throw new Error('piece moved on ranged');
  if (res.state.grid[3][3].piece !== null) throw new Error('enemy not captured by ranged');

  // attack (land capture) one step up
  const st2 = E.buildState(8);
  st2.grid[5][3].piece = { id: 'a', color: 'white', type: d.id };
  st2.grid[4][3].piece = { id: 'e', color: 'black', type: 'p' };
  const ms2 = E.getLegalMoves(st2, 'white');
  const atk = ms2.find(m => m.to[0] === 4 && m.flags && m.flags.capture);
  if (!atk) throw new Error('attack not generated');

  // jump over a blocker
  const st3 = E.buildState(8);
  st3.grid[5][3].piece = { id: 'a', color: 'white', type: d.id };
  st3.grid[4][3].piece = { id: 'blk', color: 'black', type: 'p' };
  const ms3 = E.getLegalMoves(st3, 'white');
  const jump = ms3.find(m => m.to[0] === 4 && m.to[1] === 1); // jump target (1,-2) => (4,1)
  if (!jump) throw new Error('jump not generated');
});
