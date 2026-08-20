/* Cursed Chess by Jorge — AI opponent.
 * Since win = capture the king, the AI values the king extremely high
 * and uses minimax. Difficulty selects search depth + randomness.
 */
(function (root) {
  'use strict';

  const E = root.ChessEngine;

  const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 100000 };

  function pieceValue(piece, def) {
    if (!piece) return 0;
    if (E.ChessPieces && def && def.id) return 700 + (def.moves ? def.moves.length : 0) * 15;
    return VALUES[piece.type] || 100;
  }

  function evaluate(st, color) {
    // from perspective of `color`
    let score = 0;
    const n = st.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const p = st.grid[r][c].piece;
      if (!p) continue;
      const def = (root.ChessPieces && root.ChessPieces.isCustom(p.type)) ? pieceDef(st, p) : null;
      const v = pieceValue(p, def);
      score += (p.color === color) ? v : -v;
    }
    if (st.winner === color) score += 1000000;
    if (st.winner && st.winner !== color) score -= 1000000;
    return score;
  }

  function pieceDef(st, p) {
    if (st.customDesigns) {
      const d = st.customDesigns.find((x) => x.id === p.type);
      if (d) return d;
    }
    return root.ChessPieces.getDesign(p.type);
  }

  function chooseMove(st, level) {
    level = level || st.aiLevel || 1;
    const color = st.turn;
    const moves = E.getLegalMoves(st, color);
    if (!moves.length) return null;

    // depth by level
    let depth = level === 1 ? 1 : (level === 2 ? 2 : 3);
    const useRandom = level === 1;

    if (useRandom) {
      // slight preference: capture opponent king if available
      const kingCap = moves.filter((m) => {
        const target = st.grid[m.to[0]][m.to[1]].piece;
        return target && target.type === 'k';
      });
      const pool = kingCap.length ? kingCap : moves;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // minimax with alpha-beta
    let best = null;
    let bestScore = -Infinity;
    const alpha0 = -Infinity, beta0 = Infinity;
    // sort moves: captures first (better pruning + play)
    const scored = moves.map((m) => {
      const target = st.grid[m.to[0]][m.to[1]].piece;
      return { m, s: target ? (target.type === 'k' ? 100000 : pieceValue(target, null)) : 0 };
    }).sort((a, b) => b.s - a.s);

    for (const { m } of scored) {
      const res = E.makeMove(st, m);
      const s = minimax(res.state, depth - 1, alpha0, beta0, false, color);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  function minimax(st, depth, alpha, beta, maximizing, aiColor) {
    if (st.over) {
      if (st.winner === aiColor) return 1000000;
      if (st.winner) return -1000000;
      return 0;
    }
    if (depth <= 0) return evaluate(st, aiColor);
    const color = st.turn;
    const moves = E.getLegalMoves(st, color);
    if (!moves.length) return evaluate(st, aiColor);

    if (maximizing) {
      let best = -Infinity;
      for (const m of moves) {
        const res = E.makeMove(st, m);
        best = Math.max(best, minimax(res.state, depth - 1, alpha, beta, false, aiColor));
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        const res = E.makeMove(st, m);
        best = Math.min(best, minimax(res.state, depth - 1, alpha, beta, true, aiColor));
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  root.ChessAI = { chooseMove, evaluate };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessAI;
})(typeof window !== 'undefined' ? window : globalThis);
