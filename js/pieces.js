/* Cursed Chess by Jorge — Registry of piece designs.
 * Classic pieces use built-in movement logic (engine).
 * Custom pieces are stored as designs (definitions) that are independent of color,
 * and can be used by both players. Each design has movement deltas + abilities.
 */
(function (root) {
  'use strict';

  const CUSTOM = 'custom';

  const PIECE_NAMES = {
    p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey',
  };
  const PIECE_SYMBOLS = {
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  };
  const CLASSIC = ['p', 'n', 'b', 'r', 'q', 'k'];

  function isClassic(type) {
    return CLASSIC.indexOf(type) >= 0;
  }
  function isCustom(type) {
    return !isClassic(type);
  }

  /* ---- Storage of custom piece designs ----
   * design = {
   *   id: 'd_xxxxxxxx', name, symbol,
   *   moves: [ {dx, dy, sliding, mode:'both'|'move'|'capture', jump} ],
   *   abilities: [ 'marine', 'teleport', ... ]
   * }
   */
  let designs = {};
  let designIdCounter = 1;

  function newId() {
    return 'd_' + (Date.now().toString(36)) + '_' + (designIdCounter++).toString(36);
  }

  function addDesign(design) {
    if (!design.id) design.id = newId();
    designs[design.id] = design;
    return design;
  }
  function getDesign(id) {
    return designs[id] || null;
  }
  function allDesigns() {
    return Object.keys(designs).map((k) => designs[k]);
  }
  function removeDesign(id) {
    delete designs[id];
  }
  function importDesigns(list) {
    list.forEach((d) => { designs[d.id] = d; });
  }
  function defaultDesigns() {
    const defaults = [];
    // Sirena (Marine): se mueve sobre agua, se mueve en diagonal.
    defaults.push(addDesign({
      id: 'd_siren', name: 'Sirena', symbol: '🧜‍♀️',
      moves: [
        { dx: 1, dy: 1, sliding: false, mode: 'both' },
        { dx: 1, dy: -1, sliding: false, mode: 'both' },
        { dx: -1, dy: 1, sliding: false, mode: 'both' },
        { dx: -1, dy: -1, sliding: false, mode: 'both' },
        { dx: 0, dy: 1, sliding: false, mode: 'both' },
      ],
      abilities: ['marine'],
    }));
    // Dragón (salto, caballo largo).
    defaults.push(addDesign({
      id: 'd_dragon', name: 'Dragón', symbol: '🐉',
      moves: [
        { dx: 2, dy: 1, sliding: false, mode: 'both', jump: true },
        { dx: 2, dy: -1, sliding: false, mode: 'both', jump: true },
        { dx: -2, dy: 1, sliding: false, mode: 'both', jump: true },
        { dx: -2, dy: -1, sliding: false, mode: 'both', jump: true },
        { dx: 1, dy: 2, sliding: false, mode: 'both', jump: true },
        { dx: 1, dy: -2, sliding: false, mode: 'both', jump: true },
        { dx: -1, dy: 2, sliding: false, mode: 'both', jump: true },
        { dx: -1, dy: -2, sliding: false, mode: 'both', jump: true },
      ],
      abilities: [],
    }));
    return defaults;
  }

  function designSummary(d) {
    return { id: d.id, name: d.name, symbol: d.symbol, abilities: d.abilities || [] };
  }

  /* Ability helpers */
  const ABILITIES = [
    { id: 'marine', name: 'Marina (se mueve sobre agua)' },
    { id: 'ghost', name: 'Fantasma (ignora bloqueos y casillas vacías)' },
    { id: 'heavy', name: 'Pesada (no la empujan cintas ni agujeros blancos)' },
  ];

  function hasAbility(d, a) {
    return !!d && (d.abilities || []).indexOf(a) >= 0;
  }

  root.ChessPieces = {
    PIECE_NAMES, PIECE_SYMBOLS, CLASSIC, CUSTOM,
    isClassic, isCustom,
    addDesign, getDesign, allDesigns, removeDesign, importDesigns, defaultDesigns,
    hasAbility, ABILITIES, designSummary, newId,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessPieces;
})(typeof window !== 'undefined' ? window : globalThis);
