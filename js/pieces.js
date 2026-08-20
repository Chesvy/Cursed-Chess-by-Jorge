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
  // U+FE0E (VARIATION SELECTOR-15) forces TEXT presentation so pieces render as
  // single-color glyphs instead of colored emoji boxes (which break the board on
  // phones by overflowing each square).
  const PIECE_SYMBOLS = {
    p: '♟\uFE0E', n: '♞\uFE0E', b: '♝\uFE0E', r: '♜\uFE0E', q: '♛\uFE0E', k: '♚\uFE0E',
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

  /* =====================================================================
   *  PIXEL-ART piece model (new designer)
   *  design = {
   *    id, name,
   *    px: 8,                     // square grid of px x px pixels
   *    pixels: [ [idx,...], ...], // px rows; 0 = transparent, else index into PIXEL_COLORS
   *    variants: [ { name:'Blanca', colors:[null, hex...] },
   *                { name:'Negra',  colors:[null, hex...] } ],
   *    moves: [ {dx,dy, canMove, canAttack, canJump, canRanged} ],
   *    abilities: []
   *  }
   *  ===================================================================== */
  const PIXEL_COLORS = [
    null,                       // 0 = transparent
    { n: 'Negro', hex: '#1c1c1c' },
    { n: 'Blanco', hex: '#ffffff' },
    { n: 'Rojo', hex: '#e11d48' },
    { n: 'Verde', hex: '#16a34a' },
    { n: 'Azul', hex: '#2563eb' },
    { n: 'Amarillo', hex: '#facc15' },
    { n: 'Marrón', hex: '#92400e' },
    { n: 'Gris', hex: '#6b7280' },
    { n: 'Naranja', hex: '#ea580c' },
    { n: 'Púrpura', hex: '#7c3aed' },
  ];
  // usable swatch indices (1..9)
  const PIXEL_INDICES = [1,2,3,4,5,6,7,8,9,10];
  const PIXEL_COLORS_HEX = PIXEL_COLORS.map((c) => (c ? c.hex : null));

  function newDesign() {
    const px = 8;
    const pixels = Array.from({ length: px }, () => Array(px).fill(0));
    const variants = [
      { name: 'Blanca', colors: [null].concat(PIXEL_COLORS.slice(1).map((c) => c.hex)) },
      { name: 'Negra', colors: [null].concat(PIXEL_COLORS.slice(1).map((c) => c.hex)) },
    ];
    return { id: newId(), name: '', px, pixels, variants, moves: [], abilities: [] };
  }

  // Get the color array to render for a piece of a given team color.
  function designVariant(design, pieceColor) {
    if (!design || !design.variants) return null;
    const want = pieceColor === 'white' ? 'Blanca' : 'Negra';
    const v = design.variants.find((x) => x.name === want) || design.variants[0];
    return v ? v.colors : null;
  }

  // Build an SVG string for a pixel design at `size` px.
  function pieceToSVG(design, pieceColor, size) {
    const px = design.px || 8;
    const g = design.pixels || [];
    const colors = designVariant(design, pieceColor);
    // bounding box of painted pixels
    let minR = px, maxR = -1, minC = px, maxC = -1;
    for (let i = 0; i < px; i++) for (let j = 0; j < px; j++) {
      if (g[i] && g[i][j]) { if (i < minR) minR = i; if (i > maxR) maxR = i; if (j < minC) minC = j; if (j > maxC) maxC = j; }
    }
    if (maxR < 0) return ''; // empty
    const pr = maxR - minR + 1, pc = maxC - minC + 1;
    const pad = 1;
    const cw = 100 / (pc + pad * 2), ch = 100 / (pr + pad * 2);
    let rects = '';
    for (let i = minR; i <= maxR; i++) for (let j = minC; j <= maxC; j++) {
      const idx = g[i][j];
      if (!idx) continue;
      const col = (colors && colors[idx]) || PIXEL_COLORS_HEX[idx] || '#333';
      const x = (j - minC + pad) * cw, y = (i - minR + pad) * ch;
      rects += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + cw.toFixed(2) + '" height="' + ch.toFixed(2) + '" fill="' + col + '"/>';
    }
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" shape-rendering="crispEdges">' + rects + '</svg>';
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
    PIXEL_COLORS, PIXEL_INDICES, PIXEL_COLORS_HEX, newDesign, designVariant, pieceToSVG,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessPieces;
})(typeof window !== 'undefined' ? window : globalThis);
