// outil-archi/js/planEditor.js
import {
  GRID_M, snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters,
} from './geometry.js';
import { newId } from './storage.js';

const ROOM_COLORS = {
  salon: '#cfe8ff', cuisine: '#ffe3c2', chambre: '#e7d6ff',
  'salle de bain': '#c2f0e8', bureau: '#ffd9e0', defaut: '#e9ecef',
};

export function createPlanEditor(containerId, project, { onChange } = {}) {
  const Konva = window.Konva;
  const container = document.getElementById(containerId);
  const stage = new Konva.Stage({
    container: containerId,
    width: container.clientWidth || 900,
    height: container.clientHeight || 600,
    draggable: true,
  });
  const gridLayer = new Konva.Layer();
  const roomLayer = new Konva.Layer();
  stage.add(gridLayer);
  stage.add(roomLayer);

  const transformer = new Konva.Transformer({ rotateEnabled: false, keepRatio: false });
  roomLayer.add(transformer);
  let selectedId = null;

  drawGrid();
  // click empty space clears selection
  stage.on('click tap', (e) => {
    if (e.target === stage) { selectedId = null; transformer.nodes([]); roomLayer.draw(); }
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
      transformer.nodes([rect]);
      roomLayer.draw();
    });

    group.on('dragend', () => {
      piece.x = snapToGrid(pixelsToMeters(group.x()));
      piece.y = snapToGrid(pixelsToMeters(group.y()));
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
      piece.x = snapToGrid(pixelsToMeters(absX));
      piece.y = snapToGrid(pixelsToMeters(absY));
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
    notify();
  }

  function addRoom({ nom, w, h, type }) {
    const t = (type || 'defaut').toLowerCase();
    // Fan new rooms out diagonally so they don't stack invisibly on each other.
    const off = snapToGrid(0.5 * project.pieces.length);
    const piece = {
      id: newId(),
      nom: nom || 'Pièce',
      type: t,
      x: off, y: off,
      w: Math.max(GRID_M, snapToGrid(+w || 3)),
      h: Math.max(GRID_M, snapToGrid(+h || 3)),
      couleur: ROOM_COLORS[t] || ROOM_COLORS.defaut,
    };
    project.pieces.push(piece);
    render();
    return piece;
  }

  function deleteSelected() {
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
    deleteSelected,
    zoom,
    render,
    getStage: () => stage,
    getTotal: () => totalAreaM2(project.pieces),
  };
}
