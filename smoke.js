const P = require('./js/pieces.js');
P.defaultDesigns();
const E = require('./js/engine.js');
const AI = require('./js/ai.js');
const S = require('./js/storage.js');

// build a game vs AI
const st = E.buildState(8, {
  name: 'smoke', players: { white: 'human', black: 'ai' }, timer: { enabled: false },
  aiLevel: 1, boardName: 'Clásico',
});
let s = st;
let moves = 0;
while (!s.over && moves < 400) {
  const m = AI.chooseMove(s, 1);
  if (!m) { console.log('no moves, stalemate'); break; }
  const res = E.makeMove(s, m, {});
  s = res.state;
  moves++;
}
console.log('Game finished after', moves, 'moves. over=', s.over, 'winner=', s.winner);

// save/load roundtrip
S.saveGame(s);
const list = S.listGames();
console.log('saved games:', list.length, 'name:', list[0].name);
const loaded = S.getGame(list[0].id);
console.log('loaded grid size:', loaded.size, 'turn:', loaded.turn, 'over:', loaded.over);
S.deleteGame(list[0].id);
console.log('after delete:', S.listGames().length);

// board save/load with features
const board = { id: 'b_test', name: 'Test', size: 8, grid: E.newEmptyBoard(8) };
E.paintRegion(board.grid, 0, 0, E.FEAT_BLACK, 4);
E.paintRegion(board.grid, 4, 4, E.FEAT_WHITE, 4);
board.grid[2][2].feature = { kind: E.FEAT_BELT, dir: 'e', level: 3 };
board.grid[3][3].feature = { kind: E.FEAT_WATER };
board.grid[1][1].feature = { kind: E.FEAT_VOID };
S.saveBoard(board);
const bl = S.getBoard('b_test');
console.log('board features black:', !!bl.grid[0][0].feature, 'belt:', bl.grid[2][2].feature.level, 'water:', !!bl.grid[3][3].feature, 'void:', !!bl.grid[1][1].feature);
S.deleteBoard('b_test');

// designs persistence
S.saveDesigns();
const loadedDesigns = S.loadDesigns();
console.log('designs persisted:', loadedDesigns.length, 'names:', loadedDesigns.map(d=>d.name).join(', '));
