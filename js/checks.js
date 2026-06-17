// outil-archi/js/checks.js
// Deterministic layout analysis: given rooms + technical constraints, surface
// "points de vigilance" (no AI — reliable, no hallucination on regulatory items).
import { roomAreaM2, rectsOverlap } from './geometry.js';

// Distance (meters) from a point {x,y} to a room rect {x,y,w,h}; 0 if inside.
export function pointRoomDistance(pt, room) {
  const dx = Math.max(room.x - pt.x, 0, pt.x - (room.x + room.w));
  const dy = Math.max(room.y - pt.y, 0, pt.y - (room.y + room.h));
  return Math.hypot(dx, dy);
}

const WATER_TYPES = ['cuisine', 'salle de bain'];
const WATER_MAX_M = 3;        // a wet room should be near a water supply
const WINDOW_NEAR_M = 0.6;    // a window marker counts as "lighting" a room if this close
const OBSTACLE_BOX_M = 0.3;   // a point obstacle (poteau) treated as a small box

// Returns an array of issues: { level:'warn'|'info', message, roomId? }
export function analyzeLayout(project, { commercial = true } = {}) {
  const rooms = project.pieces || [];
  const cons = project.contraintes || [];
  const issues = [];

  const water = cons.filter((c) => c.kind === 'eau');
  const windows = cons.filter((c) => c.kind === 'fenetre');
  const exits = cons.filter((c) => c.kind === 'secours');
  const obstacles = cons.filter((c) => c.kind === 'poteau' || c.kind === 'porteur');

  for (const r of rooms) {
    const type = (r.type || '').toLowerCase();
    const area = roomAreaM2(r);

    if (WATER_TYPES.includes(type)) {
      const near = water.some((w) => pointRoomDistance(w, r) <= WATER_MAX_M);
      if (!near) {
        issues.push({ level: 'warn', roomId: r.id, message: `${r.nom} : pièce d'eau sans arrivée d'eau à proximité (≤ ${WATER_MAX_M} m).` });
      }
    }

    if (windows.length > 0) {
      const lit = windows.some((w) => pointRoomDistance(w, r) <= WINDOW_NEAR_M);
      if (!lit) {
        issues.push({ level: 'info', roomId: r.id, message: `${r.nom} : aucune fenêtre à proximité (pièce potentiellement aveugle).` });
      }
    }

    if (type === 'chambre' && area < 9) {
      issues.push({ level: 'warn', roomId: r.id, message: `${r.nom} : ${area} m² (< 9 m² recommandé pour une chambre).` });
    } else if (area < 4) {
      issues.push({ level: 'info', roomId: r.id, message: `${r.nom} : ${area} m² (très petit).` });
    }

    for (const o of obstacles) {
      const box = o.kind === 'porteur' && o.w
        ? { x: o.x, y: o.y, w: o.w, h: o.h }
        : { x: o.x - OBSTACLE_BOX_M / 2, y: o.y - OBSTACLE_BOX_M / 2, w: OBSTACLE_BOX_M, h: OBSTACLE_BOX_M };
      if (rectsOverlap(r, box)) {
        issues.push({ level: 'info', roomId: r.id, message: `${r.nom} : traverse un ${o.kind === 'porteur' ? 'mur porteur' : 'poteau'} (à vérifier).` });
        break;
      }
    }
  }

  if (commercial && rooms.length > 0 && exits.length === 0) {
    issues.push({ level: 'info', message: 'Aucune sortie de secours marquée — obligatoire en ERP. Prévoir aussi des circulations PMR ≥ 140 cm.' });
  }

  return issues;
}
