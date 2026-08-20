/* Cursed Chess by Jorge — Persistence via localStorage.
 * Stores: saved games, saved boards, custom piece designs, settings.
 * Data survives closing the app (localStorage).
 */
(function (root) {
  'use strict';

  const KEYS = {
    games: 'cc_games',
    boards: 'cc_boards',
    designs: 'cc_designs',
    settings: 'cc_settings',
  };

  const mem = {}; // fallback when localStorage unavailable

  function ls() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* blocked */ }
    return null;
  }

  function read(key, fallback) {
    const store = ls();
    try {
      const raw = store ? store.getItem(key) : (key in mem ? mem[key] : null);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, val) {
    const store = ls();
    const raw = JSON.stringify(val);
    if (store) {
      try { store.setItem(key, raw); } catch (e) { mem[key] = raw; }
    } else {
      mem[key] = raw;
    }
  }

  /* ---- Saved games ---- */
  function saveGame(st) {
    const games = read(KEYS.games, []);
    const idx = games.findIndex((g) => g.id === st.id);
    const entry = serializeGame(st);
    if (idx >= 0) games[idx] = entry; else games.unshift(entry);
    // keep max 40
    if (games.length > 40) games.length = 40;
    write(KEYS.games, games);
    return entry;
  }
  function listGames() {
    return read(KEYS.games, []);
  }
  function getGame(id) {
    return listGames().find((g) => g.id === id) || null;
  }
  function deleteGame(id) {
    write(KEYS.games, listGames().filter((g) => g.id !== id));
  }
  function serializeGame(st) {
    return {
      id: st.id,
      name: st.name,
      savedAt: Date.now(),
      size: st.size,
      grid: st.grid.map((row) => row.map((cell) => ({
        piece: cell.piece ? Object.assign({}, cell.piece) : null,
        feature: cell.feature ? JSON.parse(JSON.stringify(cell.feature)) : null,
      }))),
      turn: st.turn,
      fullMove: st.fullMove,
      halfMove: st.halfMove,
      enPassant: st.enPassant,
      castle: JSON.parse(JSON.stringify(st.castle)),
      winner: st.winner,
      over: st.over,
      players: st.players,
      timer: st.timer,
      aiLevel: st.aiLevel,
      customDesigns: st.customDesigns || null,
      boardName: st.boardName,
      captured: st.captured || [],
    };
  }

  /* ---- Saved boards (layouts with features, pieces, etc.) ---- */
  function saveBoard(board) {
    const boards = read(KEYS.boards, []);
    const idx = boards.findIndex((b) => b.id === board.id);
    const entry = JSON.parse(JSON.stringify(board));
    entry.savedAt = Date.now();
    if (idx >= 0) boards[idx] = entry; else boards.unshift(entry);
    if (boards.length > 40) boards.length = 40;
    write(KEYS.boards, boards);
    return entry;
  }
  function listBoards() {
    return read(KEYS.boards, []);
  }
  function getBoard(id) {
    return listBoards().find((b) => b.id === id) || null;
  }
  function deleteBoard(id) {
    write(KEYS.boards, listBoards().filter((b) => b.id !== id));
  }

  /* ---- Custom designs ---- */
  function saveDesigns() {
    write(KEYS.designs, root.ChessPieces.allDesigns());
  }
  function loadDesigns() {
    const list = read(KEYS.designs, null);
    if (list === null) return false;
    // reset and import
    return list;
  }

  /* ---- Settings ---- */
  function getSettings() {
    return read(KEYS.settings, { theme: 'dark' });
  }
  function saveSettings(s) {
    write(KEYS.settings, s);
  }

  root.ChessStorage = {
    saveGame, listGames, getGame, deleteGame, serializeGame,
    saveBoard, listBoards, getBoard, deleteBoard,
    saveDesigns, loadDesigns, getSettings, saveSettings,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessStorage;
})(typeof window !== 'undefined' ? window : globalThis);
