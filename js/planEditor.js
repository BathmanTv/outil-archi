// outil-archi/js/planEditor.js
import {
  GRID_M, snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters,
  snapToNeighbors, resolveNoOverlap,
  roomPolygon, polygonCentroid, snapPointToGrid, applyOrtho, snapToVertices,
} from './geometry.js';
import { newId } from './storage.js';

const ROOM_COLORS = {
  salon: '#cfe8ff', cuisine: '#ffe3c2', chambre: '#e7d6ff',
  'salle de bain': '#c2f0e8', bureau: '#ffd9e0', defaut: '#e9ecef',
};

// Display label used when no name is typed: the chosen type becomes the name.
const TYPE_LABELS = {
  salon: 'Salon', cuisine: 'Cuisine', chambre: 'Chambre',
  'salle de bain': 'Salle de bain', bureau: 'Bureau', defaut: 'Pièce',
};

// Technical-constraint markers placeable on the plan (Phase 1).
const CONSTRAINT_DEFS = {
  eau:     { emoji: '💧', label: 'Eau',            color: '#2f81f7' },
  elec:    { emoji: '⚡', label: 'Élec',           color: '#d4a017' },
  gaine:   { emoji: '🌀', label: 'Gaine/VMC',      color: '#6b7280' },
  secours: { emoji: '🚪', label: 'Sortie secours', color: '#2e9e5b' },
  poteau:  { emoji: '⬛', label: 'Poteau',          color: '#111827' },
  porteur: { emoji: '🧱', label: 'Mur porteur',    color: '#8a5a2b' },
  fenetre: { emoji: '🪟', label: 'Fenêtre',        color: '#3aa0a0' },
  note:    { emoji: '📝', label: 'Note',            color: '#6b6157' },
};
export const CONSTRAINT_KINDS = Object.keys(CONSTRAINT_DEFS);

export function createPlanEditor(containerId, project, { onChange } = {}) {
  const Konva = window.Konva;
  const container = document.getElementById(containerId);
  const stage = new Konva.Stage({
    container: containerId,
    width: container.clientWidth || 900,
    height: container.clientHeight || 600,
    draggable: true,
  });
  project.contraintes = project.contraintes || [];
  project.poteaux = project.poteaux || [];
  project.fauxPlafonds = project.fauxPlafonds || [];

  const bgLayer = new Konva.Layer();      // imported floor-plan background, bottom
  const gridLayer = new Konva.Layer();
  const roomLayer = new Konva.Layer();
  const ceilLayer = new Konva.Layer();   // faux plafonds, above rooms
  const poteauLayer = new Konva.Layer();  // structural columns
  const consLayer = new Konva.Layer();    // technical-constraint chips, top
  const drawLayer = new Konva.Layer({ listening: false }); // rubber band while drawing
  const hudLayer = new Konva.Layer({ listening: false });  // live dims label (survives draw redraws)
  stage.add(bgLayer);
  stage.add(gridLayer);
  stage.add(roomLayer);
  stage.add(ceilLayer);
  stage.add(poteauLayer);
  stage.add(consLayer);
  stage.add(drawLayer);
  stage.add(hudLayer);

  // Floating label showing live dimensions/position during drag & resize.
  const liveLabel = new Konva.Label({ visible: false, listening: false });
  liveLabel.add(new Konva.Tag({ fill: '#1f2328', cornerRadius: 4, opacity: 0.9 }));
  liveLabel.add(new Konva.Text({ text: '', fontSize: 12, fill: '#fff', padding: 5 }));
  hudLayer.add(liveLabel);
  function showLive(text, xPx, yPx) {
    liveLabel.getText().text(text);
    liveLabel.position({ x: xPx, y: yPx - 32 });
    liveLabel.visible(true);
    hudLayer.batchDraw();
  }
  function hideLive() { liveLabel.visible(false); hudLayer.batchDraw(); }

  const transformer = new Konva.Transformer({ rotateEnabled: false, keepRatio: false });
  roomLayer.add(transformer);

  let selectedId = null;        // selected room id
  let selectedConsId = null;    // selected constraint id
  let selectedPoteauId = null;  // selected column id
  let selectedCeilId = null;    // selected faux-plafond id

  // AutoCAD-style drawing state
  let drawMode = null;          // null | 'room' | 'fauxplafond'
  let drawPoints = [];          // committed vertices (meters)
  let ortho = false;            // ORTHO: lock segments to H/V
  let vsnap = true;             // OSNAP: snap to existing vertices

  // Imported background plan + 2-point scale calibration
  let bgNode = null;            // Konva.Image of the imported plan
  let calibrating = false;
  let calPts = [];              // the two clicked calibration points (meters)
  let onCalibrated = null;      // callback once 2nd point + distance entered

  drawGrid();
  renderFond();

  // click empty space: place a vertex while drawing / calibrating, else clear selection
  stage.on('click tap', (e) => {
    if (calibrating) { placeCalibrationPoint(); return; }
    if (drawMode) { placeDrawPoint(); return; }
    if (e.target === stage) clearSelection();
  });
  stage.on('mousemove touchmove', () => { if (drawMode) updateDrawPreview(); });

  function clearSelection() {
    selectedId = null; selectedConsId = null;
    selectedPoteauId = null; selectedCeilId = null;
    syncSelection();
  }

  // Update selection visuals IN PLACE — never destroys the nodes being
  // interacted with. Destroying on mousedown was killing the drag target
  // before Konva could latch onto it (rooms were undraggable).
  function syncSelection() {
    // rooms: stroke highlight + transformer (rect) / vertex handles (poly)
    transformer.nodes([]);
    roomLayer.find('.vhandle').forEach((h) => h.destroy());
    roomLayer.find('.room').forEach((g) => {
      const sel = g.id() === selectedId;
      const shape = g.findOne('.roomRect') || g.findOne('.roomPoly');
      if (shape) { shape.stroke(sel ? '#2f6f4f' : '#222'); shape.strokeWidth(sel ? 5 : 4); }
    });
    const selPiece = project.pieces.find((p) => p.id === selectedId);
    if (selPiece) {
      if (selPiece.points) {
        addVertexHandles(selPiece);
      } else {
        const g = roomLayer.findOne((n) => n.getClassName() === 'Group' && n.id() === selectedId);
        const rect = g && g.findOne('.roomRect');
        if (rect) transformer.nodes([rect]);
      }
    }
    transformer.moveToTop();
    roomLayer.batchDraw();

    // poteaux: stroke + size label, updated in place
    poteauLayer.find('.poteau').forEach((g) => {
      const po = (project.poteaux || []).find((p) => p.id === g.id());
      if (!po) return;
      const sel = g.id() === selectedPoteauId;
      const shape = g.findOne('.poteauShape');
      if (shape) { shape.stroke(sel ? '#2f6f4f' : '#111827'); shape.strokeWidth(sel ? 3 : 2); }
      const t = g.findOne('Text');
      if (sel && !t) {
        const size = metersToPixels(po.taille);
        const cm = Math.round(po.taille * 100);
        g.add(new Konva.Text({
          text: `${cm}×${cm} cm`, fontSize: 12, fill: '#111827',
          x: -40, y: size / 2 + 4, width: 80, align: 'center',
        }));
      } else if (!sel && t) t.destroy();
    });
    poteauLayer.batchDraw();

    // faux plafonds: stroke in place
    ceilLayer.find('.ceil').forEach((g) => {
      const sel = g.id() === selectedCeilId;
      const poly = g.findOne('Line');
      if (poly) { poly.stroke(sel ? '#6a3fb0' : '#8a6fc0'); poly.strokeWidth(sel ? 3 : 2); }
    });
    ceilLayer.batchDraw();

    highlightConstraints();
  }

  function drawGrid() {
    gridLayer.destroyChildren();
    const step = metersToPixels(GRID_M);
    const max = 2400;
    for (let x = 0; x <= max; x += step) gridLayer.add(new Konva.Line({ points: [x, 0, x, max], stroke: '#eee', strokeWidth: 1 }));
    for (let y = 0; y <= max; y += step) gridLayer.add(new Konva.Line({ points: [0, y, max, y], stroke: '#eee', strokeWidth: 1 }));
    gridLayer.draw();
  }

  function notify() {
    pushHistory();
    if (onChange) onChange(project, totalAreaM2(project.pieces));
  }

  // ---- undo / redo (JSON snapshot history) ------------------------------
  // Snapshots exclude project.fond (its base64 image would blow up memory).
  const history = [];
  let hIndex = -1;
  let restoring = false;
  function snapshotState() {
    return JSON.stringify({
      pieces: project.pieces, contraintes: project.contraintes,
      poteaux: project.poteaux, fauxPlafonds: project.fauxPlafonds,
    });
  }
  function pushHistory() {
    if (restoring) return;
    const s = snapshotState();
    if (history[hIndex] === s) return;
    history.splice(hIndex + 1);
    history.push(s);
    if (history.length > 40) history.shift();
    hIndex = history.length - 1;
  }
  function applySnapshot(s) {
    restoring = true;
    const d = JSON.parse(s);
    project.pieces = d.pieces || [];
    project.contraintes = d.contraintes || [];
    project.poteaux = d.poteaux || [];
    project.fauxPlafonds = d.fauxPlafonds || [];
    selectedId = null; selectedConsId = null; selectedPoteauId = null; selectedCeilId = null;
    render();
    restoring = false;
    notify(); // persist the restored state (dedup skips the identical snapshot)
  }
  function undo() { if (hIndex > 0) { hIndex--; applySnapshot(history[hIndex]); } }
  function redo() { if (hIndex < history.length - 1) { hIndex++; applySnapshot(history[hIndex]); } }

  // ---- snapping for free-drawn points ----------------------------------
  // Returns the current pointer in meters with OSNAP + ORTHO + grid applied.
  function snappedPointer() {
    const p = stage.getRelativePointerPosition();
    let pt = { x: pixelsToMeters(p.x), y: pixelsToMeters(p.y) };
    if (vsnap) {
      const snapped = snapToVertices(pt, allVertices(), 0.3);
      if (snapped !== pt) return snapped; // exact latch onto an existing corner
    }
    const anchor = drawPoints[drawPoints.length - 1];
    if (ortho && anchor) pt = applyOrtho(anchor, pt);
    return snapPointToGrid(pt);
  }

  // Every existing room/faux-plafond corner — candidates for OSNAP.
  function allVertices() {
    const v = [];
    (project.pieces || []).forEach((r) => roomPolygon(r).forEach((p) => v.push(p)));
    (project.fauxPlafonds || []).forEach((f) => (f.points || []).forEach((p) => v.push(p)));
    return v;
  }

  // ---- rectangle rooms (legacy + "Ajouter une pièce") ------------------
  function settlePosition(piece, xMeters, yMeters) {
    const others = project.pieces.filter((p) => p.id !== piece.id && !p.points);
    const box = { w: piece.w, h: piece.h };
    let pos = { x: snapToGrid(xMeters), y: snapToGrid(yMeters) };
    pos = snapToNeighbors({ ...pos, ...box }, others);
    pos = resolveNoOverlap({ ...pos, ...box }, others);
    if (pos.x < 0 || pos.y < 0) {
      // Don't let the overlap resolver push a room off-canvas into negatives.
      pos = resolveNoOverlap({ x: Math.max(0, pos.x), y: Math.max(0, pos.y), ...box }, others);
    }
    return pos;
  }

  function roomLabel(piece) {
    return `${piece.nom}\n${roomAreaM2(piece)} m²`;
  }

  function buildRectRoom(piece) {
    const group = new Konva.Group({
      id: piece.id, name: 'room', x: metersToPixels(piece.x), y: metersToPixels(piece.y), draggable: true,
    });
    const rect = new Konva.Rect({
      name: 'roomRect',
      width: metersToPixels(piece.w), height: metersToPixels(piece.h),
      fill: piece.couleur, stroke: '#222', strokeWidth: 4,
    });
    const label = new Konva.Text({
      text: roomLabel(piece), fontSize: 14, fill: '#222', align: 'center',
      width: metersToPixels(piece.w), y: metersToPixels(piece.h) / 2 - 16,
    });
    group.add(rect); group.add(label);

    group.on('mousedown touchstart click tap', () => selectRoom(piece.id));
    group.on('dblclick dbltap', () => renameRoom(piece));

    group.on('dragmove', () => {
      showLive(`x ${pixelsToMeters(group.x()).toFixed(2)} · y ${pixelsToMeters(group.y()).toFixed(2)} m`,
        group.x(), group.y());
    });
    group.on('dragend', () => {
      hideLive();
      const pos = settlePosition(piece, pixelsToMeters(group.x()), pixelsToMeters(group.y()));
      piece.x = pos.x; piece.y = pos.y;
      group.position({ x: metersToPixels(piece.x), y: metersToPixels(piece.y) });
      roomLayer.draw(); notify();
    });

    rect.on('transform', () => {
      const w = pixelsToMeters(rect.width() * rect.scaleX());
      const h = pixelsToMeters(rect.height() * rect.scaleY());
      showLive(`${w.toFixed(2)} × ${h.toFixed(2)} m`, group.x() + rect.x(), group.y() + rect.y());
    });
    rect.on('transformend', () => {
      hideLive();
      const absX = group.x() + rect.x();
      const absY = group.y() + rect.y();
      piece.w = Math.max(GRID_M, snapToGrid(pixelsToMeters(rect.width() * rect.scaleX())));
      piece.h = Math.max(GRID_M, snapToGrid(pixelsToMeters(rect.height() * rect.scaleY())));
      const pos = settlePosition(piece, pixelsToMeters(absX), pixelsToMeters(absY));
      piece.x = pos.x; piece.y = pos.y;
      rect.scale({ x: 1, y: 1 }); rect.position({ x: 0, y: 0 });
      rect.size({ width: metersToPixels(piece.w), height: metersToPixels(piece.h) });
      group.position({ x: metersToPixels(piece.x), y: metersToPixels(piece.y) });
      label.text(roomLabel(piece));
      label.width(metersToPixels(piece.w));
      label.y(metersToPixels(piece.h) / 2 - 16);
      roomLayer.draw(); notify();
    });

    return group;
  }

  // ---- polygon rooms (AutoCAD-style, non-rectangular) ------------------
  function buildPolyRoom(piece) {
    const group = new Konva.Group({ id: piece.id, name: 'room', draggable: true });
    const flat = piece.points.flatMap((p) => [metersToPixels(p.x), metersToPixels(p.y)]);
    const poly = new Konva.Line({
      name: 'roomPoly', points: flat, closed: true,
      fill: piece.couleur, stroke: '#222', strokeWidth: 4, lineJoin: 'round',
    });
    const c = polygonCentroid(piece.points);
    const label = new Konva.Text({
      text: roomLabel(piece), fontSize: 14, fill: '#222', align: 'center',
      x: metersToPixels(c.x) - 60, y: metersToPixels(c.y) - 16, width: 120,
    });
    group.add(poly); group.add(label);

    group.on('mousedown touchstart click tap', (e) => { e.cancelBubble = true; selectRoom(piece.id); });
    group.on('dblclick dbltap', () => renameRoom(piece));

    group.on('dragmove', () => {
      showLive(`Δ ${pixelsToMeters(group.x()).toFixed(2)} ; ${pixelsToMeters(group.y()).toFixed(2)} m`,
        metersToPixels(c.x) + group.x(), metersToPixels(c.y) + group.y());
    });
    group.on('dragend', () => {
      hideLive();
      // Snap the TRANSLATION delta, not each vertex — keeps off-grid geometry intact.
      const dx = snapToGrid(pixelsToMeters(group.x()));
      const dy = snapToGrid(pixelsToMeters(group.y()));
      piece.points = piece.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      group.position({ x: 0, y: 0 });
      renderRooms(); notify();
    });

    return group;
  }

  // Vertex handles for the selected polygon room — drag a corner to reshape
  // (this is how "recoins" / L-shapes are produced).
  function addVertexHandles(piece) {
    piece.points.forEach((pt, i) => {
      const h = new Konva.Circle({
        x: metersToPixels(pt.x), y: metersToPixels(pt.y), radius: 7,
        fill: '#fff', stroke: '#2f6f4f', strokeWidth: 2, draggable: true, name: 'vhandle',
      });
      h.on('dragmove', () => {
        let m = { x: pixelsToMeters(h.x()), y: pixelsToMeters(h.y()) };
        // Exclude the dragged vertex itself from snap candidates (it used to
        // latch back onto its own previous position — sticky feel).
        const own = piece.points.filter((_, j) => j !== i);
        const foreign = allVertices().filter((v) => !piece.points.includes(v));
        m = snapToVertices(m, [...own, ...foreign], 0.25);
        m = snapPointToGrid(m);
        h.position({ x: metersToPixels(m.x), y: metersToPixels(m.y) });
        piece.points[i] = m;
        const node = roomLayer.findOne((n) => n.name() === 'roomPoly' && n.getParent().id() === piece.id);
        if (node) node.points(piece.points.flatMap((p) => [metersToPixels(p.x), metersToPixels(p.y)]));
        roomLayer.batchDraw();
      });
      h.on('dragend', () => { renderRooms(); notify(); });
      // Right-click / long-press a handle to delete the vertex (min 3 kept).
      h.on('contextmenu', (e) => {
        e.evt.preventDefault();
        if (piece.points.length <= 3) return;
        piece.points.splice(i, 1);
        renderRooms(); notify();
      });
      roomLayer.add(h);
    });
  }

  function renameRoom(piece) {
    const v = window.prompt('Nom de la pièce :', piece.nom);
    if (v != null && v.trim()) { piece.nom = v.trim(); renderRooms(); notify(); }
  }

  function renderRooms() {
    transformer.nodes([]);
    if (selectedId && !project.pieces.some((p) => p.id === selectedId)) selectedId = null;
    roomLayer.find('.room').forEach((g) => g.destroy());
    roomLayer.find('.vhandle').forEach((h) => h.destroy());
    project.pieces.forEach((piece) => {
      roomLayer.add(piece.points ? buildPolyRoom(piece) : buildRectRoom(piece));
    });
    roomLayer.draw();
    syncSelection();
  }

  function render() {
    renderRooms();
    renderFauxPlafonds();
    renderPoteaux();
    renderConstraints();
    syncSelection();
    notify();
  }

  // ---- technical constraints (markers) ---------------------------------
  function buildConstraint(c) {
    const def = CONSTRAINT_DEFS[c.kind] || CONSTRAINT_DEFS.note;
    const text = `${def.emoji} ${c.label || def.label}`;
    const selected = c.id === selectedConsId;
    const group = new Konva.Group({
      id: c.id, name: 'consGroup', kind: c.kind,
      x: metersToPixels(c.x), y: metersToPixels(c.y), draggable: true,
    });
    const txt = new Konva.Text({ text, fontSize: 13, fill: '#222', x: 10, y: 6 });
    const chip = new Konva.Rect({
      name: 'consChip',
      width: txt.width() + 20, height: 26, cornerRadius: 13,
      fill: '#fff', stroke: selected ? def.color : '#9aa0a6', strokeWidth: selected ? 3 : 1.5,
      shadowColor: '#000', shadowOpacity: 0.15, shadowBlur: 4, shadowOffset: { x: 0, y: 1 },
    });
    group.add(chip); group.add(txt);

    group.on('click tap', (e) => {
      e.cancelBubble = true;
      selectedConsId = c.id; selectedId = null; selectedPoteauId = null; selectedCeilId = null;
      syncSelection();
    });
    if (c.kind === 'note') {
      group.on('dblclick dbltap', () => {
        const v = window.prompt('Texte de la note :', c.label || def.label);
        if (v != null && v.trim()) { c.label = v.trim(); renderConstraints(); notify(); }
      });
    }
    group.on('dragend', () => {
      c.x = snapToGrid(pixelsToMeters(group.x()));
      c.y = snapToGrid(pixelsToMeters(group.y()));
      group.position({ x: metersToPixels(c.x), y: metersToPixels(c.y) });
      consLayer.draw(); notify();
    });
    return group;
  }

  function highlightConstraints() {
    consLayer.find('.consGroup').forEach((g) => {
      const rect = g.findOne('.consChip');
      if (!rect) return;
      const def = CONSTRAINT_DEFS[g.getAttr('kind')] || CONSTRAINT_DEFS.note;
      const sel = g.id() === selectedConsId;
      rect.stroke(sel ? def.color : '#9aa0a6');
      rect.strokeWidth(sel ? 3 : 1.5);
    });
    consLayer.draw();
  }

  function renderConstraints() {
    consLayer.destroyChildren();
    (project.contraintes || []).forEach((c) => consLayer.add(buildConstraint(c)));
    consLayer.draw();
  }

  function addConstraint(kind) {
    const def = CONSTRAINT_DEFS[kind] || CONSTRAINT_DEFS.note;
    project.contraintes = project.contraintes || [];
    const n = project.contraintes.length;
    const c = {
      id: newId(), kind, label: def.label,
      x: snapToGrid(0.5 + 0.5 * n), y: snapToGrid(0.5 + 0.5 * n),
    };
    project.contraintes.push(c);
    renderConstraints(); notify();
    return c;
  }

  // ---- structural columns (poteaux à l'échelle) ------------------------
  function buildPoteau(po) {
    const size = metersToPixels(po.taille);
    const group = new Konva.Group({
      id: po.id, name: 'poteau', x: metersToPixels(po.x), y: metersToPixels(po.y), draggable: true,
    });
    const common = { name: 'poteauShape', fill: '#444b54', stroke: '#111827', strokeWidth: 2 };
    const shape = po.forme === 'rond'
      ? new Konva.Circle({ radius: size / 2, ...common })
      : new Konva.Rect({ x: -size / 2, y: -size / 2, width: size, height: size, ...common });
    group.add(shape);
    group.on('click tap', (e) => {
      e.cancelBubble = true;
      selectedPoteauId = po.id; selectedId = null; selectedConsId = null; selectedCeilId = null;
      syncSelection();
    });
    group.on('dragend', () => {
      po.x = snapToGrid(pixelsToMeters(group.x()));
      po.y = snapToGrid(pixelsToMeters(group.y()));
      group.position({ x: metersToPixels(po.x), y: metersToPixels(po.y) });
      poteauLayer.draw(); notify();
    });
    return group;
  }

  function renderPoteaux() {
    poteauLayer.destroyChildren();
    (project.poteaux || []).forEach((po) => poteauLayer.add(buildPoteau(po)));
    poteauLayer.draw();
  }

  function addPoteau({ forme = 'carre', taille = 0.2 } = {}) {
    project.poteaux = project.poteaux || [];
    const n = project.poteaux.length;
    const po = {
      id: newId(), forme, taille: Math.max(GRID_M / 5, +taille || 0.2),
      x: snapToGrid(1 + 0.5 * n), y: snapToGrid(1 + 0.5 * n),
    };
    project.poteaux.push(po);
    selectedPoteauId = po.id;
    renderPoteaux(); syncSelection(); notify();
    return po;
  }

  // ---- faux plafonds (dropped-ceiling zones) ---------------------------
  function buildFauxPlafond(f) {
    const group = new Konva.Group({ id: f.id, name: 'ceil', draggable: true });
    const flat = f.points.flatMap((p) => [metersToPixels(p.x), metersToPixels(p.y)]);
    const poly = new Konva.Line({
      points: flat, closed: true,
      fill: 'rgba(120,90,200,0.10)', stroke: '#8a6fc0',
      strokeWidth: 2, dash: [10, 6],
    });
    const c = polygonCentroid(f.points);
    const label = new Konva.Text({
      text: `Faux plafond${f.hauteur ? `\n${f.hauteur} m` : ''}`,
      fontSize: 12, fill: '#5a3f9a', align: 'center',
      x: metersToPixels(c.x) - 55, y: metersToPixels(c.y) - 14, width: 110,
    });
    group.add(poly); group.add(label);

    group.on('click tap', (e) => {
      e.cancelBubble = true;
      selectedCeilId = f.id; selectedId = null; selectedConsId = null; selectedPoteauId = null;
      syncSelection();
    });
    group.on('dblclick dbltap', () => {
      const v = window.prompt('Hauteur sous faux plafond (m) :', f.hauteur || '2.40');
      if (v != null) { f.hauteur = v.trim(); renderFauxPlafonds(); notify(); }
    });
    group.on('dragend', () => {
      const dx = snapToGrid(pixelsToMeters(group.x()));
      const dy = snapToGrid(pixelsToMeters(group.y()));
      f.points = f.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      group.position({ x: 0, y: 0 });
      renderFauxPlafonds(); syncSelection(); notify();
    });
    return group;
  }

  function renderFauxPlafonds() {
    ceilLayer.destroyChildren();
    (project.fauxPlafonds || []).forEach((f) => ceilLayer.add(buildFauxPlafond(f)));
    ceilLayer.draw();
  }

  // ---- AutoCAD-style polyline drawing ----------------------------------
  function startDraw(mode) {
    cancelDraw();
    drawMode = mode;
    drawPoints = [];
    clearSelection();
    stage.draggable(false);
    container.style.cursor = 'crosshair';
    // Route every click to the stage (not to room/marker groups) while drawing.
    [roomLayer, ceilLayer, poteauLayer, consLayer].forEach((l) => l.listening(false));
    window.addEventListener('keydown', onDrawKey);
    updateDrawPreview();
  }

  function placeDrawPoint() {
    const pt = snappedPointer();
    // Click near the first vertex (≥3 points) closes the shape.
    if (drawPoints.length >= 3) {
      const f = drawPoints[0];
      if (Math.hypot(pt.x - f.x, pt.y - f.y) < 0.25) { finishDraw(); return; }
    }
    drawPoints.push(pt);
    updateDrawPreview();
  }

  function updateDrawPreview() {
    drawLayer.destroyChildren();
    if (!drawMode) { drawLayer.draw(); return; }
    const cur = drawPoints.length ? snappedPointer() : null;
    const all = cur ? [...drawPoints, cur] : [...drawPoints];
    if (all.length >= 1) {
      const flat = all.flatMap((p) => [metersToPixels(p.x), metersToPixels(p.y)]);
      drawLayer.add(new Konva.Line({
        points: flat, stroke: '#2f6f4f', strokeWidth: 2, dash: [6, 4],
        closed: false, lineJoin: 'round',
      }));
      all.forEach((p) => drawLayer.add(new Konva.Circle({
        x: metersToPixels(p.x), y: metersToPixels(p.y), radius: 4, fill: '#2f6f4f',
      })));
      // Live dimension of the segment being drawn.
      if (cur && drawPoints.length) {
        const last = drawPoints[drawPoints.length - 1];
        const len = Math.hypot(cur.x - last.x, cur.y - last.y);
        drawLayer.add(new Konva.Text({
          text: `${len.toFixed(2)} m`, fontSize: 13, fill: '#2f6f4f',
          x: metersToPixels((last.x + cur.x) / 2) + 6, y: metersToPixels((last.y + cur.y) / 2) - 16,
        }));
      }
    }
    drawLayer.draw();
  }

  function onDrawKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === 'Enter') { e.preventDefault(); finishDraw(); }
    else if (e.key === 'Escape') { cancelDraw(); }
    else if (e.key === 'Backspace') { e.preventDefault(); drawPoints.pop(); updateDrawPreview(); }
  }

  function finishDraw() {
    const mode = drawMode;
    const pts = drawPoints.slice();
    endDrawState();
    if (pts.length < 3) { render(); return; }
    if (mode === 'room') {
      project.pieces.push({
        id: newId(), nom: 'Pièce', type: 'defaut',
        couleur: ROOM_COLORS.defaut, points: pts,
      });
    } else if (mode === 'fauxplafond') {
      project.fauxPlafonds = project.fauxPlafonds || [];
      project.fauxPlafonds.push({ id: newId(), points: pts, hauteur: '2.40' });
    }
    render();
  }

  function cancelDraw() {
    if (!drawMode && !drawPoints.length) return;
    endDrawState();
    drawLayer.destroyChildren(); drawLayer.draw();
  }

  function endDrawState() {
    drawMode = null; drawPoints = [];
    stage.draggable(true);
    container.style.cursor = '';
    [roomLayer, ceilLayer, poteauLayer, consLayer].forEach((l) => l.listening(true));
    window.removeEventListener('keydown', onDrawKey);
    drawLayer.destroyChildren(); drawLayer.draw();
  }

  // ---- imported background plan + scale calibration --------------------
  function renderFond() {
    bgLayer.destroyChildren();
    bgNode = null;
    const f = project.fond;
    if (!f || !f.image) { bgLayer.draw(); return; }
    const img = new window.Image();
    img.onload = () => {
      bgNode = new Konva.Image({
        image: img, x: f.x || 0, y: f.y || 0,
        scaleX: f.scale || 1, scaleY: f.scale || 1,
        opacity: f.opacity != null ? f.opacity : 0.6,
        draggable: !f.locked,
      });
      bgNode.on('dragend', () => {
        f.x = bgNode.x(); f.y = bgNode.y();
        bgLayer.draw(); notify();
      });
      bgLayer.add(bgNode);
      bgLayer.draw();
    };
    img.src = f.image;
  }

  function setFond(dataUrl) {
    project.fond = { image: dataUrl, scale: 1, x: 0, y: 0, opacity: 0.6, locked: false };
    renderFond(); notify();
  }
  function removeFond() { delete project.fond; renderFond(); notify(); }
  function setFondOpacity(v) {
    if (!project.fond) return;
    project.fond.opacity = Math.max(0, Math.min(1, +v));
    if (bgNode) { bgNode.opacity(project.fond.opacity); bgLayer.draw(); }
    notify();
  }
  function setFondLocked(locked) {
    if (!project.fond) return;
    project.fond.locked = !!locked;
    if (bgNode) bgNode.draggable(!locked);
    notify();
  }

  // Click two points on the plan whose real distance is known, then scale the
  // background so that distance matches the app's metric grid (like AutoCAD's
  // "align/scale by reference"). Returns via callback for UI status updates.
  function startCalibrate(onDone) {
    if (!project.fond) return false;
    cancelDraw();
    clearSelection();
    calibrating = true;
    calPts = [];
    onCalibrated = onDone || null;
    stage.draggable(false);
    container.style.cursor = 'crosshair';
    [roomLayer, ceilLayer, poteauLayer, consLayer].forEach((l) => l.listening(false));
    return true;
  }

  function placeCalibrationPoint() {
    const p = stage.getRelativePointerPosition();
    calPts.push({ x: pixelsToMeters(p.x), y: pixelsToMeters(p.y) });
    if (calPts.length < 2) return;
    const dPx = Math.hypot(
      metersToPixels(calPts[1].x - calPts[0].x),
      metersToPixels(calPts[1].y - calPts[0].y),
    );
    const ans = window.prompt('Distance réelle entre les deux points (en mètres) :', '');
    const meters = parseFloat((ans || '').replace(',', '.'));
    endCalibrate();
    if (!meters || meters <= 0 || dPx < 1 || !project.fond || !bgNode) {
      if (onCalibrated) onCalibrated(false);
      return;
    }
    const f = project.fond;
    const factor = (meters * 50) / dPx; // 50 px = 1 m (PX_PER_M)
    const anchor = { x: metersToPixels(calPts[0].x), y: metersToPixels(calPts[0].y) };
    f.x = anchor.x - (anchor.x - (f.x || 0)) * factor;
    f.y = anchor.y - (anchor.y - (f.y || 0)) * factor;
    f.scale = (f.scale || 1) * factor;
    renderFond(); notify();
    if (onCalibrated) onCalibrated(true);
  }

  function endCalibrate() {
    calibrating = false; calPts = [];
    stage.draggable(true);
    container.style.cursor = '';
    [roomLayer, ceilLayer, poteauLayer, consLayer].forEach((l) => l.listening(true));
  }

  // ---- selection / external API ----------------------------------------
  function selectRoom(id) {
    const piece = project.pieces.find((p) => p.id === id);
    if (!piece) return;
    selectedId = id; selectedConsId = null; selectedPoteauId = null; selectedCeilId = null;
    syncSelection();
  }

  function addRoom({ nom, w, h, type }) {
    const t = (type || 'defaut').toLowerCase();
    const off = snapToGrid(0.5 * project.pieces.length);
    const piece = {
      id: newId(),
      nom: (nom && nom.trim()) || TYPE_LABELS[t] || 'Pièce',
      type: t, x: off, y: off,
      w: Math.max(GRID_M, snapToGrid(+w || 3)),
      h: Math.max(GRID_M, snapToGrid(+h || 3)),
      couleur: ROOM_COLORS[t] || ROOM_COLORS.defaut,
    };
    const pos = settlePosition(piece, off, off);
    piece.x = pos.x; piece.y = pos.y;
    project.pieces.push(piece);
    renderRooms(); notify();
    return piece;
  }

  function deleteSelected() {
    if (selectedConsId) {
      project.contraintes = (project.contraintes || []).filter((c) => c.id !== selectedConsId);
      selectedConsId = null; renderConstraints(); notify(); return;
    }
    if (selectedPoteauId) {
      project.poteaux = (project.poteaux || []).filter((p) => p.id !== selectedPoteauId);
      selectedPoteauId = null; renderPoteaux(); notify(); return;
    }
    if (selectedCeilId) {
      project.fauxPlafonds = (project.fauxPlafonds || []).filter((f) => f.id !== selectedCeilId);
      selectedCeilId = null; renderFauxPlafonds(); notify(); return;
    }
    if (!selectedId) return;
    project.pieces = project.pieces.filter((p) => p.id !== selectedId);
    selectedId = null; renderRooms(); notify();
  }

  function setLayerVisible(name, visible) {
    const map = { rooms: roomLayer, poteaux: poteauLayer, fauxplafond: ceilLayer, contraintes: consLayer };
    const l = map[name];
    if (l) { l.visible(visible); l.draw(); }
  }

  // ---- zoom / navigation ------------------------------------------------
  function zoomAt(center, factor) {
    const old = stage.scaleX();
    const s = Math.min(4, Math.max(0.25, old * factor));
    const to = { x: (center.x - stage.x()) / old, y: (center.y - stage.y()) / old };
    stage.scale({ x: s, y: s });
    stage.position({ x: center.x - to.x * s, y: center.y - to.y * s });
    stage.batchDraw();
  }
  function zoom(factor) {
    zoomAt({ x: stage.width() / 2, y: stage.height() / 2 }, factor);
  }
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    zoomAt(pointer, e.evt.deltaY > 0 ? 1 / 1.08 : 1.08);
  });

  // Bounding box of everything on the plan, in meters.
  function contentBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (x, y) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };
    (project.pieces || []).forEach((p) => roomPolygon(p).forEach((pt) => eat(pt.x, pt.y)));
    (project.fauxPlafonds || []).forEach((f) => (f.points || []).forEach((pt) => eat(pt.x, pt.y)));
    (project.poteaux || []).forEach((p) => { eat(p.x - p.taille, p.y - p.taille); eat(p.x + p.taille, p.y + p.taille); });
    (project.contraintes || []).forEach((c) => { eat(c.x, c.y); eat(c.x + 2, c.y + 0.6); });
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }
  function fitToContent() {
    const b = contentBounds();
    if (!b) { stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 }); stage.batchDraw(); return; }
    const pad = 0.8; // meters of breathing room
    const wPx = metersToPixels(b.maxX - b.minX + pad * 2);
    const hPx = metersToPixels(b.maxY - b.minY + pad * 2);
    const s = Math.min(4, Math.max(0.25, Math.min(stage.width() / wPx, stage.height() / hPx)));
    stage.scale({ x: s, y: s });
    stage.position({
      x: (stage.width() - wPx * s) / 2 - metersToPixels(b.minX - pad) * s,
      y: (stage.height() - hPx * s) / 2 - metersToPixels(b.minY - pad) * s,
    });
    stage.batchDraw();
  }

  // ---- duplicate / nudge -------------------------------------------------
  function duplicateSelected() {
    const dup = (o) => JSON.parse(JSON.stringify(o));
    if (selectedId) {
      const p = project.pieces.find((x) => x.id === selectedId); if (!p) return;
      const c = dup(p); c.id = newId();
      if (c.points) c.points = c.points.map((pt) => ({ x: pt.x + GRID_M, y: pt.y + GRID_M }));
      else { c.x += GRID_M; c.y += GRID_M; }
      project.pieces.push(c); selectedId = c.id;
      renderRooms(); notify();
    } else if (selectedPoteauId) {
      const p = (project.poteaux || []).find((x) => x.id === selectedPoteauId); if (!p) return;
      const c = dup(p); c.id = newId(); c.x += GRID_M; c.y += GRID_M;
      project.poteaux.push(c); selectedPoteauId = c.id;
      renderPoteaux(); syncSelection(); notify();
    } else if (selectedCeilId) {
      const f = (project.fauxPlafonds || []).find((x) => x.id === selectedCeilId); if (!f) return;
      const c = dup(f); c.id = newId();
      c.points = c.points.map((pt) => ({ x: pt.x + GRID_M, y: pt.y + GRID_M }));
      project.fauxPlafonds.push(c); selectedCeilId = c.id;
      renderFauxPlafonds(); syncSelection(); notify();
    } else if (selectedConsId) {
      const k = (project.contraintes || []).find((x) => x.id === selectedConsId); if (!k) return;
      const c = dup(k); c.id = newId(); c.x += GRID_M; c.y += GRID_M;
      project.contraintes.push(c); selectedConsId = c.id;
      renderConstraints(); syncSelection(); notify();
    }
  }

  function nudgeSelected(dxM, dyM) {
    if (selectedId) {
      const p = project.pieces.find((x) => x.id === selectedId); if (!p) return;
      if (p.points) p.points = p.points.map((pt) => ({ x: pt.x + dxM, y: pt.y + dyM }));
      else { p.x = Math.max(0, +(p.x + dxM).toFixed(3)); p.y = Math.max(0, +(p.y + dyM).toFixed(3)); }
      renderRooms(); notify();
    } else if (selectedPoteauId) {
      const p = (project.poteaux || []).find((x) => x.id === selectedPoteauId); if (!p) return;
      p.x = +(p.x + dxM).toFixed(3); p.y = +(p.y + dyM).toFixed(3);
      renderPoteaux(); syncSelection(); notify();
    } else if (selectedCeilId) {
      const f = (project.fauxPlafonds || []).find((x) => x.id === selectedCeilId); if (!f) return;
      f.points = f.points.map((pt) => ({ x: pt.x + dxM, y: pt.y + dyM }));
      renderFauxPlafonds(); syncSelection(); notify();
    } else if (selectedConsId) {
      const c = (project.contraintes || []).find((x) => x.id === selectedConsId); if (!c) return;
      c.x = +(c.x + dxM).toFixed(3); c.y = +(c.y + dyM).toFixed(3);
      renderConstraints(); syncSelection(); notify();
    }
  }

  // ---- global keyboard (Suppr, Échap, flèches, Ctrl+Z/Y/D) ----------------
  function onGlobalKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!document.getElementById('view-plan') || !document.getElementById('view-plan').classList.contains('active')) return;
    if (drawMode || calibrating) return; // draw mode has its own key handler
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (mod && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (k === 'Escape') { clearSelection(); }
    else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : GRID_M;
      nudgeSelected(
        k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0,
        k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0,
      );
    }
  }
  window.addEventListener('keydown', onGlobalKey);

  // ---- container resize + teardown ---------------------------------------
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w && h && (w !== stage.width() || h !== stage.height())) {
      stage.width(w); stage.height(h); stage.batchDraw();
    }
  });
  ro.observe(container);

  function destroy() {
    window.removeEventListener('keydown', onGlobalKey);
    window.removeEventListener('keydown', onDrawKey);
    ro.disconnect();
    stage.destroy();
  }

  render();
  return {
    stage,
    addRoom,
    addConstraint,
    addPoteau,
    startDrawRoom: () => startDraw('room'),
    startDrawFauxPlafond: () => startDraw('fauxplafond'),
    cancelDraw,
    setOrtho: (v) => { ortho = !!v; },
    setSnap: (v) => { vsnap = !!v; },
    setFond,
    removeFond,
    setFondOpacity,
    setFondLocked,
    startCalibrate,
    hasFond: () => !!(project.fond && project.fond.image),
    setLayerVisible,
    selectRoom,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
    zoom,
    fitToContent,
    destroy,
    render,
    getStage: () => stage,
    getTotal: () => totalAreaM2(project.pieces),
  };
}
