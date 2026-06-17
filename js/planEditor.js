// outil-archi/js/planEditor.js
import {
  GRID_M, snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters,
  snapToNeighbors, resolveNoOverlap,
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
  const gridLayer = new Konva.Layer();
  const roomLayer = new Konva.Layer();
  const consLayer = new Konva.Layer(); // technical constraints, drawn above rooms
  stage.add(gridLayer);
  stage.add(roomLayer);
  stage.add(consLayer);

  const transformer = new Konva.Transformer({ rotateEnabled: false, keepRatio: false });
  roomLayer.add(transformer);
  let selectedId = null;       // selected room id
  let selectedConsId = null;   // selected constraint id

  drawGrid();
  // click empty space clears selection
  stage.on('click tap', (e) => {
    if (e.target === stage) { selectedId = null; selectedConsId = null; transformer.nodes([]); roomLayer.draw(); renderConstraints(); }
  });

  function drawGrid() {
    gridLayer.destroyChildren();
    const step = metersToPixels(GRID_M);
    const max = 2400;
    for (let x = 0; x <= max; x += step) gridLayer.add(new Konva.Line({ points: [x, 0, x, max], stroke: '#eee', strokeWidth: 1 }));
    for (let y = 0; y <= max; y += step) gridLayer.add(new Konva.Line({ points: [0, y, max, y], stroke: '#eee', strokeWidth: 1 }));
    gridLayer.draw();
  }

  function notify() {
    if (onChange) onChange(project, totalAreaM2(project.pieces));
  }

  // Grid-snap a proposed position (meters), magnetize to neighbour edges, then
  // guarantee it does not overlap any other room. Returns resolved {x,y}.
  function settlePosition(piece, xMeters, yMeters) {
    const others = project.pieces.filter((p) => p.id !== piece.id);
    const box = { w: piece.w, h: piece.h };
    let pos = { x: snapToGrid(xMeters), y: snapToGrid(yMeters) };
    pos = snapToNeighbors({ ...pos, ...box }, others);
    pos = resolveNoOverlap({ ...pos, ...box }, others);
    return pos;
  }

  function buildRoom(piece) {
    const group = new Konva.Group({
      id: piece.id, x: metersToPixels(piece.x), y: metersToPixels(piece.y), draggable: true,
    });
    const rect = new Konva.Rect({
      name: 'roomRect',
      width: metersToPixels(piece.w), height: metersToPixels(piece.h),
      fill: piece.couleur, stroke: '#222', strokeWidth: 4, // walls
    });
    const label = new Konva.Text({
      text: `${piece.nom}\n${roomAreaM2(piece)} m²`,
      fontSize: 14, fill: '#222', align: 'center',
      width: metersToPixels(piece.w), y: metersToPixels(piece.h) / 2 - 16,
    });
    group.add(rect);
    group.add(label);

    group.on('mousedown touchstart click tap', () => {
      selectedId = piece.id;
      selectedConsId = null;
      transformer.nodes([rect]);
      roomLayer.draw();
      renderConstraints();
    });

    // Double-click / double-tap a room to rename it on the plan.
    group.on('dblclick dbltap', () => {
      const v = window.prompt('Nom de la pièce :', piece.nom);
      if (v != null && v.trim()) {
        piece.nom = v.trim();
        label.text(`${piece.nom}\n${roomAreaM2(piece)} m²`);
        roomLayer.draw();
        notify();
      }
    });

    group.on('dragend', () => {
      const pos = settlePosition(piece, pixelsToMeters(group.x()), pixelsToMeters(group.y()));
      piece.x = pos.x;
      piece.y = pos.y;
      group.position({ x: metersToPixels(piece.x), y: metersToPixels(piece.y) });
      roomLayer.draw();
      notify();
    });

    rect.on('transformend', () => {
      // Resizing from a top/left handle also shifts the rect's local offset;
      // fold that back into the room's absolute position so it never drifts.
      const absX = group.x() + rect.x();
      const absY = group.y() + rect.y();
      piece.w = Math.max(GRID_M, snapToGrid(pixelsToMeters(rect.width() * rect.scaleX())));
      piece.h = Math.max(GRID_M, snapToGrid(pixelsToMeters(rect.height() * rect.scaleY())));
      // A resize can push into a neighbour — re-settle so it stays non-overlapping.
      const pos = settlePosition(piece, pixelsToMeters(absX), pixelsToMeters(absY));
      piece.x = pos.x;
      piece.y = pos.y;
      rect.scale({ x: 1, y: 1 });
      rect.position({ x: 0, y: 0 });
      rect.size({ width: metersToPixels(piece.w), height: metersToPixels(piece.h) });
      group.position({ x: metersToPixels(piece.x), y: metersToPixels(piece.y) });
      label.text(`${piece.nom}\n${roomAreaM2(piece)} m²`);
      label.width(metersToPixels(piece.w));
      label.y(metersToPixels(piece.h) / 2 - 16);
      roomLayer.draw();
      notify();
    });

    return group;
  }

  function render() {
    transformer.nodes([]);
    if (selectedId && !project.pieces.some((p) => p.id === selectedId)) selectedId = null;
    roomLayer.find('Group').forEach((g) => { if (g.id()) g.destroy(); });
    project.pieces.forEach((piece) => roomLayer.add(buildRoom(piece)));
    transformer.moveToTop();
    roomLayer.draw();
    renderConstraints();
    notify();
  }

  // ---- technical constraints (markers) ----
  function buildConstraint(c) {
    const def = CONSTRAINT_DEFS[c.kind] || CONSTRAINT_DEFS.note;
    const text = `${def.emoji} ${c.label || def.label}`;
    const selected = c.id === selectedConsId;
    const group = new Konva.Group({
      id: c.id, name: 'consGroup',
      x: metersToPixels(c.x), y: metersToPixels(c.y), draggable: true,
    });
    const txt = new Konva.Text({ text, fontSize: 13, fill: '#222', x: 10, y: 6 });
    const chip = new Konva.Rect({
      width: txt.width() + 20, height: 26, cornerRadius: 13,
      fill: '#fff', stroke: selected ? def.color : '#9aa0a6', strokeWidth: selected ? 3 : 1.5,
      shadowColor: '#000', shadowOpacity: 0.15, shadowBlur: 4, shadowOffset: { x: 0, y: 1 },
    });
    group.add(chip);
    group.add(txt);

    // Select on click/tap only — NOT mousedown: re-rendering on mousedown would
    // destroy this group right as a drag begins, blocking the drag.
    group.on('click tap', (e) => {
      e.cancelBubble = true;
      selectedConsId = c.id;
      selectedId = null;
      transformer.nodes([]);
      roomLayer.draw();
      renderConstraints();
    });
    // Only "note" markers are renamable (others are labelled by their type).
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
      consLayer.draw();
      notify();
    });
    return group;
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
    renderConstraints();
    notify();
    return c;
  }

  // Highlight a room from outside (e.g. clicking an issue in the checks panel).
  function selectRoom(id) {
    const piece = project.pieces.find((p) => p.id === id);
    if (!piece) return;
    selectedId = id;
    selectedConsId = null;
    const g = roomLayer.findOne((n) => n.getClassName() === 'Group' && n.id() === id);
    if (g) {
      const rect = g.findOne('.roomRect');
      if (rect) transformer.nodes([rect]);
    }
    roomLayer.draw();
    renderConstraints();
  }

  function addRoom({ nom, w, h, type }) {
    const t = (type || 'defaut').toLowerCase();
    // Fan new rooms out diagonally so they don't stack invisibly on each other.
    const off = snapToGrid(0.5 * project.pieces.length);
    const piece = {
      id: newId(),
      nom: (nom && nom.trim()) || TYPE_LABELS[t] || 'Pièce',
      type: t,
      x: off, y: off,
      w: Math.max(GRID_M, snapToGrid(+w || 3)),
      h: Math.max(GRID_M, snapToGrid(+h || 3)),
      couleur: ROOM_COLORS[t] || ROOM_COLORS.defaut,
    };
    // Spawn without overlapping existing rooms.
    const pos = settlePosition(piece, off, off);
    piece.x = pos.x;
    piece.y = pos.y;
    project.pieces.push(piece);
    render();
    return piece;
  }

  function deleteSelected() {
    if (selectedConsId) {
      project.contraintes = (project.contraintes || []).filter((c) => c.id !== selectedConsId);
      selectedConsId = null;
      renderConstraints();
      notify();
      return;
    }
    if (!selectedId) return;
    project.pieces = project.pieces.filter((p) => p.id !== selectedId);
    selectedId = null;
    render();
  }

  function zoom(factor) {
    const s = Math.min(4, Math.max(0.25, stage.scaleX() * factor));
    stage.scale({ x: s, y: s });
    stage.draw();
  }

  render();
  return {
    stage,
    addRoom,
    addConstraint,
    selectRoom,
    deleteSelected,
    zoom,
    render,
    getStage: () => stage,
    getTotal: () => totalAreaM2(project.pieces),
  };
}
