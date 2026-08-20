/* Cursed Chess by Jorge — Core game engine.
 * Win condition: CAPTURE THE KING. No check/checkmate.
 * Supports classic pieces + custom designs + board features.
 */
(function (root) {
  'use strict';

  const P = (root.ChessPieces);

  /* ---------------- Board / cell model ----------------
   * cell = { piece: {id, color, type} | null, feature: feat | null }
   * feat = {
   *   kind: 'void' | 'blackHole' | 'whiteHole' | 'belt' | 'water' | 'normal',
   *   region: {top,left,bottom,right}   // for holes (4x4)
   *   dir: 'n'|'s'|'e'|'w', level: 1..5 // for belt
   * }
   */
  const FEAT_NORMAL = 'normal';
  const FEAT_VOID = 'void';
  const FEAT_BLACK = 'blackHole';
  const FEAT_WHITE = 'whiteHole';
  const FEAT_BELT = 'belt';
  const FEAT_WATER = 'water';

  const DIRS = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };

  function newCell() {
    return { piece: null, feature: null };
  }

  function featureAt(grid, r, c) {
    if (!grid[r] || !grid[r][c]) return null;
    return grid[r][c].feature;
  }

  function cellIsVoid(grid, r, c) {
    const f = featureAt(grid, r, c);
    return !!f && f.kind === FEAT_VOID;
  }

  function cellInRegion(cell, region) {
    // region has top,left,bottom,right (inclusive)
    if (!region) return false;
    // we find the region that contains the cell via feature stored on cell
    return true;
  }

  /* A feature covering a region is stored on each cell of the region.
   * Each cell in a region has feature = {kind, top,left,bottom,right, ...}
   */
  function inRegion(r, c, region) {
    return r >= region.top && r <= region.bottom && c >= region.left && c <= region.right;
  }

  /* ---------------- State ----------------
   * state = {
   *   id, name, size,
   *   grid: size x size of cells,
   *   turn: 'white'|'black',
   *   halfMove, fullMove,
   *   enPassant: {target:[r,c], color} | null,
   *   castle: { w: {k:bool, rs:bool, rl:bool}, b:{...} },
   *   captureKing: true,
   *   winner: null|'white'|'black'|'draw',
   *   over: false,
   *   players: {white:'human'|'ai', black:'human'|'ai'},
   *   timer: {enabled, white, black, inc},
   *   aiLevel: 1..3,
   *   lastMove: {from:[r,c],to:[r,c]}|null,
   *   promoted: {}, // ids that got promoted
   * }
   */

  function buildState(size, opts) {
    opts = opts || {};
    const grid = [];
    for (let r = 0; r < size; r++) {
      grid.push([]);
      for (let c = 0; c < size; c++) grid[r].push(newCell());
    }
    const st = {
      id: opts.id || 'g_' + Date.now().toString(36),
      name: opts.name || 'Partida sin título',
      size,
      grid,
      turn: 'white',
      halfMove: 0,
      fullMove: 1,
      enPassant: null,
      castle: { w: { k: true, rs: true, rl: true }, b: { k: true, rs: true, rl: true } },
      captureKing: true,
      winner: null,
      over: false,
      players: opts.players || { white: 'human', black: 'human' },
      timer: opts.timer || { enabled: false, white: 0, black: 0, inc: 0 },
      aiLevel: opts.aiLevel || 1,
      lastMove: null,
      promoted: {},
      customDesigns: opts.customDesigns || null, // list of designs used
      boardName: opts.boardName || 'Clásico',
    };
    if (opts.startPos) {
      setupFromFen(st, opts.startPos);
    } else if (opts.grid) {
      st.grid = opts.grid;
    } else {
      setupClassic(st, size);
    }
    return st;
  }

  function setupClassic(st, size) {
    const g = st.grid;
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < size; c++) {
      g[0][c].piece = { id: uid(), color: 'black', type: back[c % 8] };
      g[1][c].piece = { id: uid(), color: 'black', type: 'p' };
      g[size - 1][c].piece = { id: uid(), color: 'white', type: back[c % 8] };
      g[size - 2][c].piece = { id: uid(), color: 'white', type: 'p' };
    }
  }

  let uidc = 0;
  function uid() {
    uidc++;
    return 'p_' + Date.now().toString(36) + '_' + uidc;
  }

  /* Setup classic positions by FEN-like layout (8 ranks, '2' = two empty) */
  function setupFromFen(st, fen) {
    const g = st.grid;
    const ranks = fen.split('/');
    const size = st.size;
    for (let r = 0; r < size; r++) {
      let c = 0;
      const rank = ranks[r] || '';
      for (let i = 0; i < rank.length; i++) {
        const ch = rank[i];
        if (/\d/.test(ch)) {
          c += parseInt(ch, 10);
        } else {
          if (c < size) {
            const color = ch === ch.toUpperCase() ? 'white' : 'black';
            g[r][c].piece = { id: uid(), color, type: ch.toLowerCase() };
            c++;
          }
        }
      }
    }
  }

  /* ---------------- Movement ---------------- */
  function pieceDef(st, piece) {
    if (!piece) return null;
    if (P.isClassic(piece.type)) return null;
    if (st.customDesigns) {
      const d = st.customDesigns.find((x) => x.id === piece.type);
      if (d) return d;
    }
    return P.getDesign(piece.type);
  }

  function inBounds(st, r, c) {
    return r >= 0 && r < st.size && c >= 0 && c < st.size;
  }

  function pieceAt(st, r, c) {
    if (!inBounds(st, r, c)) return null;
    return st.grid[r][c].piece;
  }

  /* Squares attacked by color `by` (for castling + general). */
  function attacked(st, r, c, by) {
    // any enemy piece of color `by` that attacks (r,c) ?
    const g = st.grid;
    const n = st.size;
    for (let rr = 0; rr < n; rr++) {
      for (let cc = 0; cc < n; cc++) {
        const p = g[rr][cc].piece;
        if (p && p.color === by) {
          if (attacksSquare(st, rr, cc, r, c, p)) return true;
        }
      }
    }
    return false;
  }

  function attacksSquare(st, fr, fc, tr, tc, piece) {
    const def = pieceDef(st, piece);
    const type = piece.type;
    const dr = tr - fr, dc = tc - fc;

    // Custom pieces: check their move patterns (as capture)
    if (def) {
      return customCanReach(st, fr, fc, tr, tc, piece, def, true);
    }

    if (type === 'p') {
      const fwd = piece.color === 'white' ? -1 : 1;
      return dr === fwd && Math.abs(dc) === 1; // pawn attacks diagonals only
    }
    if (type === 'n') {
      return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
    }
    if (type === 'k') {
      return Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
    }
    // sliding: rook/bishop/queen
    let rdx = 0, rdy = 0, diag = false, orth = false;
    if (type === 'r') orth = true;
    else if (type === 'b') diag = true;
    else if (type === 'q') { orth = true; diag = true; }
    if (dr === 0 || dc === 0) {
      if (!orth) return false;
      rdx = Math.sign(dc); rdy = 0;
    } else if (Math.abs(dr) === Math.abs(dc)) {
      if (!diag) return false;
      rdy = Math.sign(dr); rdx = Math.sign(dc);
    } else return false;
    let r = fr + rdy, c = fc + rdx;
    while (inBounds(st, r, c)) {
      if (r === tr && c === tc) return true;
      const p = pieceAt(st, r, c);
      if (p) return false;
      r += rdy; c += rdx;
    }
    return false;
  }

  /* Custom piece reachability. If captureOnly mode, only for captures.
   * Returns true if (tr,tc) reachable. */
  function customCanReach(st, fr, fc, tr, tc, piece, def, forAttack) {
    const dr = tr - fr, dc = tc - fc;
    const moves = def.moves || [];
    for (const m of moves) {
      const dx = m.dx, dy = m.dy;
      if (m.canMove !== undefined || m.canRanged !== undefined) {
        // NEW format
        if (dy !== dr || dx !== dc) continue;
        if (!m.canJump && pathBlocked(st, fr, fc, dy, dx)) continue;
        if (forAttack) { if (m.canAttack || m.canRanged) return true; }
        else if (m.canMove) return true;
        continue;
      }
      // direction must match (legacy format)
      if (m.sliding) {
        // must be aligned
        if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) continue;
        const sdy = Math.sign(dy), sdx = Math.sign(dx);
        const steps = Math.max(Math.abs(dy), Math.abs(dx));
        let r = fr + sdy, c = fc + sdx;
        let dist = 1;
        while (inBounds(st, r, c)) {
          if (r === tr && c === tc) {
            if (m.mode === 'move' && !forAttack) return true;
            if (m.mode === 'both') return true;
            if (m.mode === 'capture' && forAttack) return true;
            // when computing attacks we allow capture
            if (forAttack && m.mode === 'capture') return true;
            return false;
          }
          const p = pieceAt(st, r, c);
          if (p) return false; // blocked
          r += sdy; c += sdx;
          dist++;
          if (dist > 1000) break;
        }
      } else {
        if (dy === dr && dx === dc) {
          if (m.mode === 'move' && !forAttack) return true;
          if (m.mode === 'both') return true;
          if (m.mode === 'capture' && forAttack) return true;
          if (forAttack && m.mode === 'capture') return true;
          return false;
        }
      }
    }
    return false;
  }

  /* Returns array of legal moves {from:[r,c], to:[r,c], flags:{promote,capture,castle,enpassant}, ...} */
  function getLegalMoves(st, color) {
    color = color || st.turn;
    const g = st.grid;
    const n = st.size;
    const moves = [];

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const p = g[r][c].piece;
        if (!p || p.color !== color) continue;
        const pieceMoves = pseudoMoves(st, r, c, p);
        for (const mv of pieceMoves) {
          moves.push(mv);
        }
      }
    }
    return moves;
  }

  function isAligned(dy, dx) {
    return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  }
  // True if the straight line from (r,c) in direction (dy,dx) is blocked before target.
  function pathBlocked(st, r, c, dy, dx) {
    if (!isAligned(dy, dx)) return false; // leap, nothing in between
    const sdy = Math.sign(dy), sdx = Math.sign(dx);
    const steps = Math.max(Math.abs(dy), Math.abs(dx));
    for (let k = 1; k < steps; k++) {
      const rr = r + sdy * k, cc = c + sdx * k;
      if (!inBounds(st, rr, cc)) return true;
      if (st.grid[rr][cc].piece || cellIsVoid(st, rr, cc)) return true;
    }
    return false;
  }

  function canLandOn(st, r, c, p, attacking) {
    if (!inBounds(st, r, c)) return false;
    const cell = st.grid[r][c];
    if (cellIsVoid(st, r, c)) return false;
    const occ = cell.piece;
    if (occ && occ.color === p.color) return false;
    // water rule: only marine pieces can occupy water; others sink (allowed to land, then sinks)
    return true;
  }

  function pseudoMoves(st, r, c, p) {
    const def = pieceDef(st, p);
    const n = st.size;
    const out = [];
    const push = (tr, tc, flags) => out.push({ from: [r, c], to: [tr, tc], flags: flags || {} });

    if (def) {
      // custom piece
      const moves = def.moves || [];
      for (const m of moves) {
        if (m.canMove !== undefined || m.canRanged !== undefined) {
          // NEW designer format: per-cell flags
          const dy = m.dy || 0, dx = m.dx || 0;
          if (dy === 0 && dx === 0) continue;
          const tr = r + dy, tc = c + dx;
          if (!inBounds(st, tr, tc)) continue;
          const blocked = m.canJump ? false : pathBlocked(st, r, c, dy, dx);
          if (blocked) continue;
          const occ = st.grid[tr][tc].piece;
          const landOK = !cellIsVoid(st, tr, tc);
          if (m.canMove && !occ && landOK) push(tr, tc, {});
          if (m.canAttack && occ && occ.color !== p.color && landOK) push(tr, tc, { capture: true });
          if (m.canRanged && occ && occ.color !== p.color && landOK) push(tr, tc, { ranged: true });
        } else if (m.sliding) {
          const sdy = Math.sign(m.dy || 0), sdx = Math.sign(m.dx || 0);
          if (m.dy === 0 && m.dx === 0) continue;
          let rr = r + (m.dy ? sdy : 0), cc = c + (m.dx ? sdx : 0);
          while (inBounds(st, rr, cc)) {
            const occ = st.grid[rr][cc].piece;
            if (occ) {
              if (occ.color !== p.color && m.mode !== 'move') {
                push(rr, cc, { capture: true });
              }
              break;
            } else {
              if (m.mode !== 'capture' && !cellIsVoid(st, rr, cc)) {
                // water/void handled in move application; but block if void
                push(rr, cc, {});
              } else if (!cellIsVoid(st, rr, cc)) {
                push(rr, cc, {});
              }
              rr += (m.dy ? sdy : 0); cc += (m.dx ? sdx : 0);
            }
          }
        } else {
          const tr = r + (m.dy || 0), tc = c + (m.dx || 0);
          if (!inBounds(st, tr, tc)) continue;
          const occ = st.grid[tr][tc].piece;
          if (occ) {
            if (occ.color !== p.color && m.mode !== 'move') push(tr, tc, { capture: true });
          } else {
            if (m.mode !== 'capture') push(tr, tc, {});
          }
        }
      }
      return out;
    }

    const type = p.type;
    if (type === 'p') { pawnMoves(st, r, c, p, push); return out; }
    if (type === 'n') {
      const deltas = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
      for (const [dy, dx] of deltas) {
        const tr = r + dy, tc = c + dx;
        if (inBounds(st, tr, tc)) {
          const occ = st.grid[tr][tc].piece;
          if (!occ || occ.color !== p.color) push(tr, tc, { capture: !!occ });
        }
      }
      return out;
    }
    if (type === 'k') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        const tr = r + dy, tc = c + dx;
        if (inBounds(st, tr, tc)) {
          const occ = st.grid[tr][tc].piece;
          if (!occ || occ.color !== p.color) push(tr, tc, { capture: !!occ });
        }
      }
      // castling
      const cst = st.castle[ck(p.color)];
      if (cst) {
        const backRow = p.color === 'white' ? n - 1 : 0;
        if (r === backRow) {
          // kingside (right)
          if (cst.k && st.grid[backRow][c].piece) {
            const empty = st.grid[backRow][c + 1].piece == null && st.grid[backRow][c + 2].piece == null;
            if (empty && inBounds(st, backRow, c + 3)) {
              const rk = st.grid[backRow][c + 3].piece;
              const notAttacked = !attacked(st, backRow, c, opp(p.color)) && !attacked(st, backRow, c + 1, opp(p.color)) && !attacked(st, backRow, c + 2, opp(p.color));
              if (rk && rk.type === 'r' && rk.color === p.color && notAttacked) {
                push(backRow, c + 2, { castle: 'k' });
              }
            }
          }
          if (cst.rl && st.grid[backRow][c - 4] && st.grid[backRow][c - 4].piece) {
            const empty = st.grid[backRow][c - 1].piece == null && st.grid[backRow][c - 2].piece == null && st.grid[backRow][c - 3].piece == null;
            const rk = st.grid[backRow][c - 4].piece;
            const notAttacked = !attacked(st, backRow, c, opp(p.color)) && !attacked(st, backRow, c - 1, opp(p.color)) && !attacked(st, backRow, c - 2, opp(p.color));
            if (empty && rk && rk.type === 'r' && rk.color === p.color && notAttacked) {
              push(backRow, c - 2, { castle: 'q' });
            }
          }
        }
      }
      return out;
    }
    if (type === 'b' || type === 'r' || type === 'q') {
      const dirs = [];
      if (type === 'r') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      else if (type === 'b') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      else dirs.push([-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]);
      for (const [dy, dx] of dirs) {
        let tr = r + dy, tc = c + dx;
        while (inBounds(st, tr, tc)) {
          if (cellIsVoid(st, tr, tc)) break;
          const occ = st.grid[tr][tc].piece;
          if (occ) {
            if (occ.color !== p.color) push(tr, tc, { capture: true });
            break;
          }
          push(tr, tc, {});
          tr += dy; tc += dx;
        }
      }
      return out;
    }
    return out;
  }

  function pawnMoves(st, r, c, p, push) {
    const n = st.size;
    const fwd = p.color === 'white' ? -1 : 1;
    const startRow = p.color === 'white' ? n - 2 : 1;
    // forward
    const fr = r + fwd;
    if (inBounds(st, fr, c) && !st.grid[fr][c].piece && !cellIsVoid(st, fr, c)) {
      const promote = (fr === 0 || fr === n - 1);
      push(fr, c, { promote });
      const fr2 = r + 2 * fwd;
      if (r === startRow && !st.grid[fr2][c].piece && !cellIsVoid(st, fr2, c)) {
        push(fr2, c, { double: true });
      }
    }
    // captures diagonal
    for (const dc of [-1, 1]) {
      const tr = r + fwd, tc = c + dc;
      if (!inBounds(st, tr, tc)) continue;
      const occ = st.grid[tr][tc].piece;
      const promote = (tr === 0 || tr === n - 1);
      if (occ && occ.color !== p.color) push(tr, tc, { capture: true, promote });
      // en passant
      if (st.enPassant && st.enPassant.color === p.color) {
        const [er, ec] = st.enPassant.target;
        if (tr === er && tc === ec) push(tr, tc, { enpassant: true, promote });
      }
    }
  }

  function opp(color) {
    return color === 'white' ? 'black' : 'white';
  }
  function ck(color) {
    return color === 'white' ? 'w' : 'b';
  }

  /* ---------------- Making a move ---------------- */
  /* Returns the resulting state (mutates a clone). Also triggers feature resolution. */
  function cloneState(st) {
    const grid = st.grid.map((row) => row.map((cell) => ({
      piece: cell.piece ? Object.assign({}, cell.piece) : null,
      feature: cell.feature ? Object.assign({}, cell.feature) : null,
    })));
    return Object.assign({}, st, {
      grid,
      castle: { w: Object.assign({}, st.castle.w), b: Object.assign({}, st.castle.b) },
      enPassant: st.enPassant ? Object.assign({}, st.enPassant) : null,
      timer: Object.assign({}, st.timer),
      players: Object.assign({}, st.players),
      promoted: Object.assign({}, st.promoted),
    });
  }

  function makeMove(stIn, move, opts) {
    opts = opts || {};
    const st = cloneState(stIn);
    const [fr, fc] = move.from, [tr, tc] = move.to;
    const piece = st.grid[fr][fc].piece;
    if (!piece) return { state: st, error: 'Sin pieza' };
    const captured = st.grid[tr][tc].piece || null;
    const flags = move.flags || {};

    st.enPassant = null;

    if (flags.double) {
      st.enPassant = { target: [(fr + tr) / 2, fc], color: opp(st.turn) };
    }

    if (flags.enpassant) {
      const capturedPawnRow = tr + (piece.color === 'white' ? 1 : -1);
      st.grid[capturedPawnRow][tc].piece = null;
      st.captured = st.captured || [];
      st.captured.push({ piece: { id: 'ep', color: opp(piece.color), type: 'p' }, at: 'enpassant' });
    }

    if (flags.ranged) {
      // Ranged attack: capture the target WITHOUT moving there (the piece shoots
      // from its current square and stays put).
      if (captured) st.grid[tr][tc].piece = null;
      st.lastMove = { from: [fr, fc], to: [tr, tc], ranged: true };
    } else {
      // move piece
      st.grid[tr][tc].piece = piece;
      st.grid[fr][fc].piece = null;

      // castling rook move
      if (flags.castle) {
        const backRow = tr;
        if (flags.castle === 'k') {
          st.grid[backRow][fc + 1].piece = st.grid[backRow][fc + 3].piece;
          st.grid[backRow][fc + 3].piece = null;
        } else if (flags.castle === 'q') {
          st.grid[backRow][fc - 1].piece = st.grid[backRow][fc - 4].piece;
          st.grid[backRow][fc - 4].piece = null;
        }
      }
    }

    // promotion
    if (flags.promote) {
      const toType = opts.promotion || 'q';
      piece.type = toType;
      st.promoted[piece.id] = toType;
    }

    // update castle rights
    if (piece.type === 'k') {
      st.castle[ck(piece.color)].k = false;
      st.castle[ck(piece.color)].rl = false;
    }
    if (piece.type === 'r') {
      const backRow = piece.color === 'white' ? st.size - 1 : 0;
      if (fr === backRow && fc === st.size - 1) st.castle[ck(piece.color)].k = false;
      if (fr === backRow && fc === 0) st.castle[ck(piece.color)].rl = false;
    }

    if (captured) {
      st.captured = st.captured || [];
      st.captured.push({ piece: captured, at: 'capture' });
    }

    st.lastMove = { from: [fr, fc], to: [tr, tc] };

    // check king capture → game over
    if (captured && captured.type === 'k') {
      st.winner = piece.color;
      st.over = true;
    }

    // resolve board features
    resolveFeatures(st);

    // turn / counters
    if (piece.color === 'black') st.fullMove++;
    if (captured || piece.type === 'p') st.halfMove = 0; else st.halfMove++;
    st.turn = opp(piece.color);

    // timer update (only when the caller provides elapsed time; otherwise UI handles it)
    if (st.timer.enabled && typeof opts.elapsed === 'number') {
      const col = piece.color;
      st.timer[col] = Math.max(0, (st.timer[col] || 0) - opts.elapsed);
      if (st.timer.inc) st.timer[col] += st.timer.inc;
      if (st.timer[col] <= 0 && st.timer.inc === 0) {
        st.winner = opp(col);
        st.over = true;
        st.flag = opp(col);
      }
    }

    return { state: st, captured, error: null };
  }

  /* ---------------- Feature resolution ---------------- */
  function resolveFeatures(st) {
    const n = st.size;
    const g = st.grid;
    let changed = true;
    let iter = 0;
    const maxIter = n * n + 50;

    while (changed && iter < maxIter) {
      changed = false;
      iter++;

      // 1. Water: non-marine pieces sink
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const cell = g[r][c];
        if (!cell.piece) continue;
        const f = cell.feature;
        if (f && f.kind === FEAT_WATER) {
          const def = pieceDef(st, cell.piece);
          const marine = def && P.hasAbility(def, 'marine');
          if (!marine) {
            sinkPiece(st, r, c);
            changed = true;
          }
        }
      }

      // 2. Black holes: absorb pieces in region
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const cell = g[r][c];
        if (!cell.piece) continue;
        const f = cell.feature;
        if (f && f.kind === FEAT_BLACK) {
          sinkPiece(st, r, c, 'blackHole');
          changed = true;
        }
      }

      // 3. White holes: push pieces outward
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const cell = g[r][c];
        if (!cell.piece) continue;
        const f = cell.feature;
        if (f && f.kind === FEAT_WHITE) {
          const def = pieceDef(st, cell.piece);
          if (def && P.hasAbility(def, 'heavy')) continue;
          if (pushFromWhiteHole(st, r, c, f)) changed = true;
        }
      }

      // 4. Conveyor belts: push pieces
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const cell = g[r][c];
        if (!cell.piece) continue;
        const f = cell.feature;
        if (f && f.kind === FEAT_BELT) {
          const def = pieceDef(st, cell.piece);
          if (def && P.hasAbility(def, 'heavy')) continue;
          if (pushBelt(st, r, c, f)) changed = true;
        }
      }
    }
  }

  function sinkPiece(st, r, c, reason) {
    const g = st.grid;
    const p = g[r][c].piece;
    if (!p) return;
    if (p.type === 'k') {
      st.winner = opp(p.color);
      st.over = true;
    }
    g[r][c].piece = null;
    st.captured = st.captured || [];
    st.captured.push({ piece: p, at: reason || 'sink' });
  }

  function pushFromWhiteHole(st, r, c, feat) {
    const g = st.grid;
    const p = g[r][c].piece;
    if (!p) return false;
    // push away from center of region
    const cx = (feat.left + feat.right) / 2;
    const cy = (feat.top + feat.bottom) / 2;
    let dy = 0, dx = 0;
    if (Math.abs(r - cy) >= Math.abs(c - cx)) dy = r - cy >= 0 ? 1 : -1;
    else dx = c - cx >= 0 ? 1 : -1;
    // if at center exactly, pick direction down
    if (dy === 0 && dx === 0) dy = 1;
    return tryPush(st, r, c, dy, dx, 1);
  }

  function pushBelt(st, r, c, feat) {
    const d = DIRS[feat.dir] || DIRS.n;
    return tryPush(st, r, c, d[0], d[1], feat.level || 1);
  }

  function tryPush(st, r, c, dy, dx, steps) {
    const g = st.grid;
    const p = g[r][c].piece;
    if (!p) return false;
    let cr = r, cc = c;
    let moved = false;
    for (let i = 0; i < steps; i++) {
      const nr = cr + dy, nc = cc + dx;
      if (!inBounds(st, nr, nc)) break;
      const target = g[nr][nc];
      if (cellIsVoid(st, nr, nc)) break;
      if (target.piece) {
        // try to chain push the piece ahead if same direction? Keep simple: stop.
        break;
      }
      // water ahead & piece not marine → will sink after move (allowed to move there)
      cr = nr; cc = nc; moved = true;
    }
    if (moved) {
      g[cr][cc].piece = p;
      g[r][c].piece = null;
      if (p.type === 'k') {
        // kings pushed normally
      }
      return true;
    }
    return false;
  }

  /* ---------------- Custom board / editor helpers ---------------- */
  function newEmptyBoard(size) {
    const grid = [];
    for (let r = 0; r < size; r++) {
      grid.push([]);
      for (let c = 0; c < size; c++) grid[r].push(newCell());
    }
    return grid;
  }

  function setFeature(grid, r, c, feature) {
    grid[r][c].feature = feature;
  }

  /* Place a region feature (hole 4x4) on grid at (top,left). */
  function paintRegion(grid, top, left, kind, size) {
    const n = grid.length;
    const bottom = Math.min(top + size - 1, n - 1);
    const right = Math.min(left + size - 1, n - 1);
    const region = { top, left, bottom, right };
    for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) {
      if (r >= 0 && r < n && c >= 0 && c < n) {
        grid[r][c].feature = { kind, region };
      }
    }
    return region;
  }

  /* ---------------- Serialization (board only) ---------------- */
  function serializeBoard(st) {
    return {
      size: st.size,
      grid: st.grid.map((row) => row.map((cell) => ({
        piece: cell.piece ? { id: cell.piece.id, color: cell.piece.color, type: cell.piece.type } : null,
        feature: cell.feature ? JSON.parse(JSON.stringify(cell.feature)) : null,
      }))),
      name: st.boardName,
    };
  }

  function deserializeBoard(data) {
    const size = data.size;
    const grid = newEmptyBoard(size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const src = data.grid[r][c];
      grid[r][c] = {
        piece: src.piece ? Object.assign({}, src.piece) : null,
        feature: src.feature ? JSON.parse(JSON.stringify(src.feature)) : null,
      };
    }
    return grid;
  }

  root.ChessEngine = {
    FEAT_NORMAL, FEAT_VOID, FEAT_BLACK, FEAT_WHITE, FEAT_BELT, FEAT_WATER, DIRS,
    buildState, newEmptyBoard, cloneState, makeMove, getLegalMoves,
    pieceAt, inBounds, attacked, cellIsVoid, featureAt, opp,
    setupClassic, setupFromFen, paintRegion, setFeature,
    serializeBoard, deserializeBoard, newCell,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessEngine;
})(typeof window !== 'undefined' ? window : globalThis);
