/* Cursed Chess by Jorge — Application controller / UI. */
(function () {
  'use strict';

  const E = window.ChessEngine;
  const P = window.ChessPieces;
  const AI = window.ChessAI;
  const S = window.ChessStorage;

  const $ = (id) => document.getElementById(id);

  /* ---------- global game state ---------- */
  let GAME = null;        // engine state
  let selected = null;    // {r,c}
  let legalMoves = [];
  let clockTimer = null;
  let aiThinking = false;

  /* ---------- navigation ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.getAttribute('data-nav');
      if (t === 'menu') { stopClock(); show('screen-menu'); }
      else if (t === 'setup-classic') openSetup('classic');
      else if (t === 'setup-custom') openSetup('custom');
      else if (t === 'games') openList('game');
      else if (t === 'boards') openList('board');
      else if (t === 'designer') openDesigner();
      else if (t === 'editor') openEditorBase('empty');
      else if (t === 'settings') openSettings();
    });
  });

  /* ====================================================================
   *  SETUP
   * ==================================================================== */
  let setupMode = 'classic';       // 'classic' | 'custom'
  let setupSelectedBoardId = 'classic';

  function openSetup(mode) {
    setupMode = mode;
    $('setup-title').textContent = mode === 'classic' ? 'Nueva partida (clásica)' : 'Nueva partida (custom)';
    $('setup-error').textContent = '';
    $('setup-board-picker').classList.toggle('hidden', mode !== 'custom');
    if (mode === 'custom') populateBoardPicker();
    show('screen-setup');
  }

  function populateBoardPicker() {
    const sel = $('setup-board-select');
    sel.innerHTML = '';
    const boards = S.listBoards();
    const opt = document.createElement('option');
    opt.value = 'classic'; opt.textContent = '♟️ Clásico (8×8)';
    sel.appendChild(opt);
    boards.forEach((b) => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = (b.name || 'Tablero') + ' (' + b.size + '×' + b.size + ')';
      sel.appendChild(o);
    });
    sel.value = setupSelectedBoardId;
  }

  $('setup-board-refresh').addEventListener('click', populateBoardPicker);
  $('setup-board-select').addEventListener('change', (e) => { setupSelectedBoardId = e.target.value; });

  // segmented controls
  bindSeg('setup-mode', (v) => $('setup-ai-opts').classList.toggle('hidden', v !== 'ai'));
  bindSeg('setup-color');
  bindSeg('setup-diff');
  bindSeg('setup-timer', (v) => $('setup-timer-opts').classList.toggle('hidden', v !== 'on'));

  function bindSeg(id, onchange) {
    const box = $(id);
    if (!box) return;
    box.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        box.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const val = b.getAttribute('data-mode') || b.getAttribute('data-color') ||
                    b.getAttribute('data-diff') || b.getAttribute('data-timer') ||
                    b.getAttribute('data-dir') || b.getAttribute('data-theme');
        if (onchange) onchange(val);
      });
    });
  }

  $('setup-start').addEventListener('click', startGame);

  function getSegVal(id) {
    const a = $(id).querySelector('.active');
    return a.getAttribute('data-mode') || a.getAttribute('data-color') ||
           a.getAttribute('data-diff') || a.getAttribute('data-timer') ||
           a.getAttribute('data-dir') || a.getAttribute('data-theme');
  }

  function startGame() {
    const mode = getSegVal('setup-mode');
    const players = { white: 'human', black: 'human' };
    const aiColor = getSegVal('setup-color');
    if (mode === 'ai') players[aiColor] = 'ai';

    const timerEnabled = getSegVal('setup-timer') === 'on';
    const minutes = Math.max(1, parseInt($('setup-minutes').value, 10) || 10);
    const inc = Math.max(0, parseInt($('setup-inc').value, 10) || 0);
    const timer = { enabled: timerEnabled, white: minutes * 60, black: minutes * 60, inc };
    const aiLevel = parseInt(getSegVal('setup-diff'), 10);
    const name = $('setup-name').value.trim() || (setupMode === 'classic' ? 'Partida clásica' : 'Partida custom');

    // build board
    let board;
    if (setupMode === 'classic') board = classicBoard();
    else board = resolveBoard(setupSelectedBoardId);

    // ensure pieces exist; if none, fill classic
    if (!hasAnyPiece(board.grid)) {
      const tmp = E.buildState(board.size);
      board.grid = tmp.grid;
      board.name = 'Clásico';
    }

    GAME = E.buildState(board.size, {
      name, grid: deepGrid(board.grid), players,
      timer, aiLevel, boardName: board.name, customDesigns: null,
    });
    GAME.__orig = { size: GAME.size, name: GAME.name, players: Object.assign({}, players), timer: Object.assign({}, timer), aiLevel, boardName: board.name, grid: deepGrid(GAME.grid) };
    selected = null; legalMoves = [];
    renderGame();
    show('screen-game');
    startClock();
    autosave();
    if (GAME.players[GAME.turn] === 'ai') aiTurn();
  }

  function classicBoard() {
    const st = E.buildState(8);
    return { id: 'classic', name: 'Clásico', size: 8, grid: st.grid };
  }

  function hasAnyPiece(grid) {
    for (const row of grid) for (const cell of row) if (cell.piece) return true;
    return false;
  }

  function resolveBoard(id) {
    if (id === 'classic') return classicBoard();
    const b = S.getBoard(id);
    if (b) return { id: b.id, name: b.name, size: b.size, grid: b.grid };
    return classicBoard();
  }

  function deepGrid(grid) {
    return grid.map((row) => row.map((cell) => ({
      piece: cell.piece ? Object.assign({}, cell.piece) : null,
      feature: cell.feature ? JSON.parse(JSON.stringify(cell.feature)) : null,
    })));
  }

  /* ====================================================================
   *  RENDERING THE GAME
   * ==================================================================== */
  // Cell size scales with board size so large boards (up to 24×24) fit on screen.
  function cellSizeFor(size, cap, maxWidth) {
    const avail = Math.min(maxWidth, (window.innerWidth || maxWidth) - 20);
    return Math.max(16, Math.min(cap, Math.floor(avail / size)));
  }

  function renderGame() {
    const board = $('board');
    board.innerHTML = '';
    const cellPx = cellSizeFor(GAME.size, 64, 1000);
    const piecePx = Math.max(10, Math.floor(cellPx * 0.62));
    board.style.gridTemplateColumns = 'repeat(' + GAME.size + ',' + cellPx + 'px)';
    const n = GAME.size;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = GAME.grid[r][c];
        const div = document.createElement('div');
        const base = (r + c) % 2 === 0 ? 'light' : 'dark';
        div.className = 'cell ' + base;
        div.style.width = cellPx + 'px';
        div.style.height = cellPx + 'px';
        applyFeatureClass(div, cell.feature, piecePx);

        if (cell.piece) {
          const p = div;
          const sym = pieceSymbol(cell.piece);
          const sp = document.createElement('span');
          sp.className = 'piece ' + (cell.piece.color === 'white' ? 'w' : 'b');
          sp.style.fontSize = piecePx + 'px';
          sp.textContent = sym;
          div.appendChild(sp);
          void p;
        }
        div.dataset.r = r; div.dataset.c = c;

        if (selected && selected.r === r && selected.c === c) div.classList.add('sel');
        if (GAME.lastMove) {
          if (GAME.lastMove.from[0] === r && GAME.lastMove.from[1] === c) div.classList.add('last-from');
          if (GAME.lastMove.to[0] === r && GAME.lastMove.to[1] === c) div.classList.add('last-to');
        }
        // hint for legal moves
        const lm = legalMoves.find((m) => m.to[0] === r && m.to[1] === c);
        if (lm) {
          if (lm.flags && lm.flags.capture) div.classList.add('cap');
          else div.classList.add('hint');
        }

        div.addEventListener('click', () => onCellClick(r, c));
        board.appendChild(div);
      }
    }

    // info
    const info = $('game-info');
    $('game-title').textContent = GAME.name + '  •  ' + GAME.boardName;
    if (GAME.over) {
      if (GAME.winner) info.textContent = '🏆 ¡Han ganado las ' + colorEs(GAME.winner) + '!';
      else info.textContent = 'Empate';
    } else {
      info.innerHTML = 'Turno: <b>' + colorEs(GAME.turn) + '</b>' +
        (GAME.players[GAME.turn] === 'ai' ? ' (IA)' : '') + (aiThinking ? ' — pensando…' : '');
    }
    // captured
    const capBox = $('captured');
    capBox.innerHTML = '';
    if (GAME.captured && GAME.captured.length) {
      const w = GAME.captured.filter((x) => x.piece.color === 'white').map((x) => pieceSymbol(x.piece)).join(' ');
      const b = GAME.captured.filter((x) => x.piece.color === 'black').map((x) => pieceSymbol(x.piece)).join(' ');
      capBox.innerHTML = 'Capturadas — Bl: ' + (w || '·') + '   Negras: ' + (b || '·');
    }

    renderClocks();
  }

  function applyFeatureClass(div, f, piecePx) {
    if (!f) return;
    const fs = piecePx ? Math.max(8, Math.floor(piecePx * 0.4)) + 'px' : '';
    if (f.kind === E.FEAT_VOID) div.classList.add('void');
    else if (f.kind === E.FEAT_BLACK) { div.classList.add('black'); div.innerHTML += featSpan('◉', fs); }
    else if (f.kind === E.FEAT_WHITE) { div.classList.add('white'); div.innerHTML += featSpan('◯', fs); }
    else if (f.kind === E.FEAT_WATER) { div.classList.add('water'); div.innerHTML += featSpan('≈', fs); }
    else if (f.kind === E.FEAT_BELT) {
      div.classList.add('belt');
      div.innerHTML += featSpan(arrow(f.dir) + f.level, fs);
    }
  }
  function featSpan(txt, fs) {
    const s = document.createElement('span');
    s.className = 'feat-label';
    if (fs) s.style.fontSize = fs;
    s.textContent = txt;
    return s.outerHTML;
  }
  function arrow(dir) { return { n: '↑', s: '↓', e: '→', w: '←' }[dir] || '↑'; }

  function pieceSymbol(piece) {
    if (P.isClassic(piece.type)) return P.PIECE_SYMBOLS[piece.type];
    const d = P.getDesign(piece.type);
    return d ? d.symbol : '❓';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function colorEs(c) { return c === 'white' ? 'Blancas' : 'Negras'; }

  function renderClocks() {
    if (!GAME.timer.enabled) {
      $('clock-white').textContent = 'Sin límite';
      $('clock-black').textContent = 'Sin límite';
      $('clock-white').classList.remove('active');
      $('clock-black').classList.remove('active');
      return;
    }
    $('clock-white').textContent = fmt(GAME.timer.white);
    $('clock-black').textContent = fmt(GAME.timer.black);
    $('clock-white').classList.toggle('active', GAME.turn === 'white');
    $('clock-black').classList.toggle('active', GAME.turn === 'black');
    $('clock-white').classList.toggle('low', GAME.timer.white < 60);
    $('clock-black').classList.toggle('low', GAME.timer.black < 60);
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  // Auto-save the active game so a page reload resumes it (not lost).
  function autosave() {
    if (!GAME) return;
    if (GAME.over) S.clearActiveGame();
    else S.saveActiveGame(GAME);
  }

  function startClock() {
    stopClock();
    if (!GAME.timer.enabled) return;
    clockTimer = setInterval(() => {
      if (GAME.over) return stopClock();
      GAME.timer[GAME.turn] = Math.max(0, GAME.timer[GAME.turn] - 1);
      if (GAME.timer[GAME.turn] <= 0) {
        GAME.winner = GAME.turn === 'white' ? 'black' : 'white';
        GAME.over = true;
        stopClock();
      }
      renderClocks();
      if (GAME.over) renderGame();
    }, 1000);
  }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

  /* ---------- interaction ---------- */
  function onCellClick(r, c) {
    if (GAME.over || aiThinking) return;
    const piece = GAME.grid[r][c].piece;
    const myTurn = GAME.turn;

    // clicking a legal move target
    if (selected) {
      const mv = legalMoves.find((m) => m.to[0] === r && m.to[1] === c);
      if (mv) {
        if (mv.flags.promote) {
          showPromotion(mv);
          return;
        }
        doMove(mv);
        return;
      }
      // clicked own piece -> reselect; else deselect
      if (piece && piece.color === myTurn) { selectPiece(r, c); return; }
      selected = null; legalMoves = [];
      renderGame();
      return;
    }
    if (piece && piece.color === myTurn) selectPiece(r, c);
  }

  function selectPiece(r, c) {
    selected = { r, c };
    legalMoves = E.getLegalMoves(GAME, GAME.turn).filter((m) => m.from[0] === r && m.from[1] === c);
    renderGame();
  }

  function doMove(mv, promotion) {
    const res = E.makeMove(GAME, mv, { promotion });
    if (res.error) { return; }
    GAME = res.state;
    addIncrement();
    selected = null; legalMoves = [];
    renderGame();
    autosave();
    if (!GAME.over && GAME.players[GAME.turn] === 'ai') {
      aiThinking = true; renderGame();
      setTimeout(() => { doAiMove(); }, 120);
    }
  }

  function aiTurn() { doAiMove(); }

  // add time increment to the player who just moved
  function addIncrement() {
    if (GAME.timer.enabled && GAME.timer.inc) {
      const mover = GAME.turn === 'white' ? 'black' : 'white';
      GAME.timer[mover] += GAME.timer.inc;
    }
  }

  function doAiMove() {
    if (GAME.over) { aiThinking = false; renderGame(); return; }
    const mv = AI.chooseMove(GAME, GAME.aiLevel);
    aiThinking = false;
    if (!mv) { renderGame(); return; }
    const res = E.makeMove(GAME, mv, {});
    GAME = res.state;
    addIncrement();
    selected = null; legalMoves = [];
    renderGame();
    autosave();
    if (!GAME.over && GAME.players[GAME.turn] === 'ai') {
      aiThinking = true;
      setTimeout(() => doAiMove(), 120);
    }
  }

  /* promotion */
  function showPromotion(mv) {
    const opts = $('promo-opts');
    opts.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach((t) => {
      const s = document.createElement('span');
      s.className = 'piece ' + (GAME.turn === 'white' ? 'w' : 'b');
      s.textContent = P.PIECE_SYMBOLS[t];
      s.onclick = () => { hidePromo(); doMove(mv, t); };
      opts.appendChild(s);
    });
    $('promo').classList.remove('hidden');
  }
  function hidePromo() { $('promo').classList.add('hidden'); }

  /* ---------- game controls ---------- */
  $('game-save').addEventListener('click', () => {
    S.saveGame(GAME);
    flashModal('💾 Partida guardada');
  });
  $('game-restart').addEventListener('click', () => {
    GAME = E.buildState(GAME.size, {
      name: GAME.name, players: GAME.players, timer: Object.assign({}, GAME.timer),
      aiLevel: GAME.aiLevel, boardName: GAME.boardName,
      grid: undefined,
    });
    // re-apply board features & pieces from a fresh copy of the current board's grid BEFORE restart
    // Simpler: rebuild from same board grid. We stored original in __orig.
    if (GAME.__orig) {
      const o = GAME.__orig;
      GAME = E.buildState(o.size, { name: o.name, players: o.players, timer: Object.assign({}, o.timer), aiLevel: o.aiLevel, boardName: o.boardName, grid: deepGrid(o.grid) });
    }
    selected = null; legalMoves = [];
    renderGame(); startClock();
    if (GAME.players[GAME.turn] === 'ai') aiTurn();
  });
  $('game-quit').addEventListener('click', () => { stopClock(); show('screen-menu'); });

  function flashModal(msg) {
    $('modal').innerHTML = '<h3>' + msg + '</h3><button class="btn primary" onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">OK</button>';
    $('modal').classList.remove('hidden');
  }

  /* ====================================================================
   *  LIST (saved games / boards)
   * ==================================================================== */
  function openList(kind) {
    const items = kind === 'game' ? S.listGames() : S.listBoards();
    $('list-title').textContent = kind === 'game' ? 'Mis partidas guardadas' : 'Mis tableros guardados';
    const box = $('list-items');
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = '<p class="muted">No hay nada guardado todavía.</p>'; }
    items.forEach((it) => {
      const div = document.createElement('div');
      div.className = 'item';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = it.name || 'Sin nombre';
      const sub = document.createElement('div'); sub.className = 'sub';
      if (kind === 'game') {
        sub.textContent = (it.boardName || 'Clásico') + ' • ' + it.size + '×' + it.size + ' • turno de las ' + colorEs(it.turn) + (it.over ? ' • FIN' : '') + ' • ' + new Date(it.savedAt).toLocaleString();
      } else {
        sub.textContent = it.size + '×' + it.size + ' • ' + new Date(it.savedAt).toLocaleString();
      }
      meta.appendChild(nm); meta.appendChild(sub);
      const load = document.createElement('button'); load.className = 'btn small'; load.textContent = 'Cargar';
      load.onclick = () => {
        if (kind === 'game') loadGame(it);
        else { loadBoardIntoEditor(it); }
      };
      const del = document.createElement('button'); del.className = 'btn small'; del.textContent = '🗑';
      del.style.marginLeft = '4px';
      del.onclick = () => { (kind === 'game' ? S.deleteGame : S.deleteBoard)(it.id); openList(kind); };
      div.appendChild(meta); div.appendChild(load); div.appendChild(del);
      box.appendChild(div);
    });
    show('screen-list');
  }

  function loadGame(saved) {
    const st = E.buildState(saved.size, {
      id: saved.id, name: saved.name, players: saved.players, timer: saved.timer,
      aiLevel: saved.aiLevel, boardName: saved.boardName, grid: deepGrid(saved.grid),
    });
    st.turn = saved.turn; st.fullMove = saved.fullMove; st.halfMove = saved.halfMove;
    st.enPassant = saved.enPassant; st.castle = JSON.parse(JSON.stringify(saved.castle));
    st.winner = saved.winner; st.over = saved.over; st.captured = saved.captured || [];
    GAME = st; selected = null; legalMoves = [];
    GAME.__orig = { size: st.size, name: st.name, players: Object.assign({}, st.players), timer: Object.assign({}, st.timer), aiLevel: st.aiLevel, boardName: st.boardName, grid: deepGrid(saved.grid) };
    renderGame(); show('screen-game'); startClock();
    autosave();
    if (!GAME.over && GAME.players[GAME.turn] === 'ai') aiTurn();
  }

  /* ====================================================================
   *  EDITOR
   * ==================================================================== */
  let EDIT = null;      // {name, size, grid}
  let eTool = 'erase';
  let eBeltDir = 's';
  let eBeltLevel = 1;
  let ePieceColor = 'white';
  let ePieceType = 'p';

  function openEditorBase(base) {
    const size = parseInt($('editor-size').value, 10) || 8;
    EDIT = { name: 'Tablero custom', size, grid: E.newEmptyBoard(size) };
    if (base === 'classic') {
      const tmp = E.buildState(size);
      EDIT.grid = tmp.grid;
    }
    eTool = 'erase';
    setToolActive('erase');
    renderEditor();
    show('screen-editor');
  }

  function loadBoardIntoEditor(b) {
    EDIT = { name: b.name || 'Tablero', size: b.size, grid: deepGrid(b.grid) };
    $('editor-size').value = b.size;
    renderEditor();
    show('screen-editor');
  }

  function renderEditor() {
    const board = $('editor-board');
    board.innerHTML = '';
    const cellPx = cellSizeFor(EDIT.size, 48, 760);
    const piecePx = Math.max(10, Math.floor(cellPx * 0.62));
    board.style.gridTemplateColumns = 'repeat(' + EDIT.size + ',' + cellPx + 'px)';
    const n = EDIT.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cell = EDIT.grid[r][c];
      const div = document.createElement('div');
      div.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      div.style.width = cellPx + 'px';
      div.style.height = cellPx + 'px';
      applyFeatureClass(div, cell.feature, piecePx);
      if (cell.piece) {
        const sp = document.createElement('span');
        sp.className = 'piece ' + (cell.piece.color === 'white' ? 'w' : 'b');
        sp.style.fontSize = piecePx + 'px';
        sp.textContent = pieceSymbol(cell.piece);
        div.appendChild(sp);
      }
      div.dataset.r = r; div.dataset.c = c;
      div.addEventListener('click', (ev) => paintCell(r, c));
      div.addEventListener('mouseenter', (ev) => { if (ev.buttons) paintCell(r, c); });
      board.appendChild(div);
    }
  }

  function paintCell(r, c) {
    const cell = EDIT.grid[r][c];
    if (eTool === 'erase') { cell.feature = null; cell.piece = null; }
    else if (eTool === 'void') cell.feature = { kind: E.FEAT_VOID };
    else if (eTool === 'black') E.paintRegion(EDIT.grid, r, c, E.FEAT_BLACK, 4);
    else if (eTool === 'white') E.paintRegion(EDIT.grid, r, c, E.FEAT_WHITE, 4);
    else if (eTool === 'belt') cell.feature = { kind: E.FEAT_BELT, dir: eBeltDir, level: eBeltLevel };
    else if (eTool === 'water') cell.feature = { kind: E.FEAT_WATER };
    else if (eTool === 'piece') cell.piece = { id: 'e_' + Math.random().toString(36).slice(2), color: ePieceColor, type: ePieceType };
    renderEditor();
  }

  function setToolActive(tool) {
    eTool = tool;
    document.querySelectorAll('#editor-tools .tool').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-tool') === tool));
    $('tool-opts').classList.toggle('hidden', tool !== 'belt' && tool !== 'piece');
    if (tool === 'belt' || tool === 'piece') $('tool-opts').classList.remove('hidden');
  }
  document.querySelectorAll('#editor-tools .tool').forEach((b) => {
    b.addEventListener('click', () => setToolActive(b.getAttribute('data-tool')));
  });
  bindSeg('belt-dir', (v) => { eBeltDir = v; });
  bindSeg('piece-color', (v) => { ePieceColor = v; });
  $('belt-level').addEventListener('input', () => { eBeltLevel = parseInt($('belt-level').value, 10); $('belt-level-val').textContent = eBeltLevel; });
  $('piece-type').addEventListener('change', () => { ePieceType = $('piece-type').value; });

  function fillPieceTypeSelect() {
    const sel = $('piece-type');
    sel.innerHTML = '';
    P.CLASSIC.forEach((t) => {
      const o = document.createElement('option'); o.value = t; o.textContent = P.PIECE_NAMES[t] + ' ' + P.PIECE_SYMBOLS[t]; sel.appendChild(o);
    });
    const sep = document.createElement('option'); sep.disabled = true; sep.textContent = '— Custom —'; sel.appendChild(sep);
    P.allDesigns().forEach((d) => {
      const o = document.createElement('option'); o.value = d.id; o.textContent = d.name + ' ' + d.symbol; sel.appendChild(o);
    });
  }

  $('editor-resize').addEventListener('click', () => {
    let ns = parseInt($('editor-size').value, 10) || 8;
    if (ns < 2) ns = 2; if (ns > 24) ns = 24;
    $('editor-size').value = ns;
    const ng = E.newEmptyBoard(ns);
    for (let r = 0; r < Math.min(ns, EDIT.size); r++) for (let c = 0; c < Math.min(ns, EDIT.size); c++) ng[r][c] = EDIT.grid[r][c];
    EDIT.size = ns; EDIT.grid = ng; renderEditor();
  });

  $('editor-save').addEventListener('click', () => {
    const name = prompt('Nombre del tablero:', EDIT.name || 'Tablero custom');
    if (name === null) return;
    if (!EDIT.id) EDIT.id = 'b_' + Math.random().toString(36).slice(2);
    EDIT.name = name;
    S.saveBoard({ id: EDIT.id, name: EDIT.name, size: EDIT.size, grid: deepGrid(EDIT.grid) });
    flashModal('🗺️ Tablero guardado');
  });
  $('editor-back').addEventListener('click', () => {
    if (confirm('¿Salir del editor sin guardar?')) { stopClock(); show('screen-menu'); }
  });

  /* ====================================================================
   *  DESIGNER
   * ==================================================================== */
  let DES = null; // current design being edited

  function openDesigner() {
    fillPieceTypeSelect();
    DES = null;
    renderDesignerList();
    newDesign();
    show('screen-designer');
  }

  function newDesign() {
    DES = { name: '', symbol: '🧿', moves: [{ dx: 1, dy: 0, sliding: false, mode: 'both', jump: false }], abilities: [] };
    renderDesignerEdit();
    renderDesignerList();
  }

  function renderDesignerList() {
    const box = $('designer-list');
    box.innerHTML = '<h3 style="margin-top:0">Piezas</h3>';
    const items = P.allDesigns();
    if (!items.length) box.innerHTML += '<p class="muted">Aún no hay piezas custom.</p>';
    items.forEach((d) => {
      const div = document.createElement('div');
      div.className = 'item' + (DES && DES.id === d.id ? ' active' : '');
      div.innerHTML = '<span style="font-size:24px">' + d.symbol + '</span> <b>' + d.name + '</b>';
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '🗑';
      x.onclick = (e) => { e.stopPropagation(); if (confirm('Borrar pieza?')) { P.removeDesign(d.id); S.saveDesigns(); renderDesignerList(); if (DES && DES.id === d.id) newDesign(); } };
      div.appendChild(x);
      div.onclick = () => { DES = JSON.parse(JSON.stringify(d)); renderDesignerEdit(); renderDesignerList(); };
      box.appendChild(div);
    });
    const add = document.createElement('button'); add.className = 'btn small block'; add.textContent = '+ Nueva pieza'; add.onclick = newDesign;
    box.appendChild(add);
  }

  function renderDesignerEdit() {
    $('des-name').value = DES.name;
    $('des-symbol').value = DES.symbol;
    // abilities
    const ab = $('des-abilities');
    ab.innerHTML = '';
    P.ABILITIES.forEach((a) => {
      const lab = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = a.id;
      cb.checked = (DES.abilities || []).includes(a.id);
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + a.name));
      ab.appendChild(lab);
    });
    // moves
    const mv = $('des-moves');
    mv.innerHTML = '';
    DES.moves.forEach((m, i) => {
      const row = document.createElement('div'); row.className = 'mv';
      row.innerHTML = '<span>Δ</span>';
      const di = document.createElement('input'); di.type = 'number'; di.value = m.dy; di.title = 'Filas (dy)';
      di.onchange = () => { m.dy = parseInt(di.value, 10) || 0; };
      const dj = document.createElement('input'); dj.type = 'number'; dj.value = m.dx; dj.title = 'Columnas (dx)';
      dj.onchange = () => { m.dx = parseInt(dj.value, 10) || 0; };
      const slide = mkCheck('Desliza', m.sliding, (v) => { m.sliding = v; });
      const jump = mkCheck('Salta', m.jump, (v) => { m.jump = v; });
      const mode = document.createElement('select');
      mode.innerHTML = '<option value="both">Mover y capturar</option><option value="move">Solo mover</option><option value="capture">Solo capturar</option>';
      mode.value = m.mode; mode.onchange = () => { m.mode = mode.value; };
      const del = document.createElement('button'); del.className = 'btn small'; del.textContent = '✕';
      del.onclick = () => { DES.moves.splice(i, 1); renderDesignerEdit(); };
      row.appendChild(di); row.appendChild(dj); row.appendChild(slide); row.appendChild(jump); row.appendChild(mode); row.appendChild(del);
      mv.appendChild(row);
    });
  }

  function mkCheck(label, val, onchange) {
    const lab = document.createElement('label'); lab.style.cssText = 'display:flex;gap:4px;margin:0';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = val;
    cb.onchange = () => onchange(cb.checked);
    lab.appendChild(cb); lab.appendChild(document.createTextNode(label));
    return lab;
  }

  $('des-addmove').addEventListener('click', () => {
    DES.moves.push({ dx: 1, dy: 0, sliding: false, mode: 'both', jump: false });
    renderDesignerEdit();
  });
  $('des-new').addEventListener('click', newDesign);
  $('des-save').addEventListener('click', () => {
    if (!$('des-name').value.trim()) { $('des-error').textContent = 'Pon un nombre.'; return; }
    if (!DES.moves.some((m) => m.dx !== 0 || m.dy !== 0)) { $('des-error').textContent = 'Añade al menos un movimiento.'; return; }
    DES.name = $('des-name').value.trim();
    DES.symbol = $('des-symbol').value || '🧿';
    DES.abilities = Array.from($('des-abilities').querySelectorAll('input:checked')).map((x) => x.value);
    P.addDesign(DES);
    S.saveDesigns();
    fillPieceTypeSelect();
    $('des-error').textContent = '';
    flashModal('🧬 Pieza guardada');
    renderDesignerList();
  });

  /* ====================================================================
   *  SETTINGS
   * ==================================================================== */
  function openSettings() {
    const s = S.getSettings();
    document.querySelectorAll('#settings-theme button').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-theme') === (s.theme || 'dark')));
    applyTheme(s.theme || 'dark');
    show('screen-settings');
  }
  bindSeg('settings-theme', (v) => {
    const s = S.getSettings(); s.theme = v; S.saveSettings(s); applyTheme(v);
  });
  function applyTheme(t) {
    document.body.classList.toggle('light', t === 'light');
  }
  $('settings-reset').addEventListener('click', () => {
    if (confirm('¿Borrar TODOS los datos guardados (partidas, tableros, piezas)?')) {
      try { localStorage.clear(); } catch (e) {}
      $('settings-msg').textContent = 'Datos borrados. Recarga la página.';
    }
  });

  /* ====================================================================
   *  INIT
   * ==================================================================== */
  function init() {
    // default designs + load saved
    P.defaultDesigns();
    const saved = S.loadDesigns();
    if (saved && saved.length) {
      try { P.importDesigns(saved); } catch (e) {}
    }
    fillPieceTypeSelect();
    applyTheme((S.getSettings().theme) || 'dark');
    // editor base buttons appended to panel
    const baseRow = document.createElement('div');
    baseRow.className = 'row'; baseRow.style.marginTop = '10px';
    const b1 = document.createElement('button'); b1.className = 'btn small'; b1.textContent = 'Base: Vacío'; b1.onclick = () => openEditorBase('empty');
    const b2 = document.createElement('button'); b2.className = 'btn small'; b2.textContent = 'Base: Clásico'; b2.onclick = () => openEditorBase('classic');
    baseRow.appendChild(b1); baseRow.appendChild(b2);
    document.querySelector('.editor-panel').insertBefore(baseRow, document.querySelector('.editor-panel').firstChild);

    show('screen-menu');

    // Resume an auto-saved in-progress game (if any) after a page reload.
    const active = S.getActiveGame();
    if (active && !active.over) {
      if (confirm('¿Reanudar la partida "' + (active.name || 'guardada') + '" que tenías en curso?')) {
        loadGame(active);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
