// outil-archi/js/checks.js
// Deterministic layout analysis: given rooms + technical constraints, surface
// "points de vigilance" (no AI — reliable, no hallucination on regulatory items).
import { roomAreaM2, totalAreaM2, rectsOverlap } from './geometry.js';

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

// Deterministic, rule-based agencement assistant. Reads the plan + constraints
// (+ optional free-text programme) and returns space-planning recommendations.
// No AI: reliable, no hallucination. Returns { summary, recommendations[], issues[] }.
export function suggestAgencement(project, { commercial = true, program = '' } = {}) {
  const rooms = project.pieces || [];
  const cons = project.contraintes || [];
  const total = totalAreaM2(rooms);
  const has = (kind) => cons.some((c) => c.kind === kind);
  const prog = (program || '').toLowerCase();
  const recs = [];

  const summary = `${rooms.length} pièce(s) · ${total} m² · ${cons.length} contrainte(s) marquée(s) · `
    + (commercial ? 'mode ERP / commercial' : 'mode résidentiel');

  const wet = rooms.filter((r) => ['cuisine', 'salle de bain'].includes((r.type || '').toLowerCase()));
  if (wet.length >= 2) {
    recs.push({ theme: 'Réseaux', text: 'Regroupez les pièces d’eau (cuisine, salle de bain) côte à côte et près des arrivées/évacuations : colonnes mutualisées, moins de plomberie, coûts réduits.' });
  }
  if (wet.length >= 1 && !has('eau')) {
    recs.push({ theme: 'Réseaux', text: 'Marquez les arrivées/évacuations d’eau, puis calez les pièces d’eau dessus — c’est la contrainte la plus coûteuse à déplacer.' });
  }

  if (has('fenetre')) {
    recs.push({ theme: 'Lumière', text: 'Placez les espaces de vie (séjour, bureau, zone de vente) le long des fenêtres ; reléguez les espaces servants (réserve, sanitaires, circulation) dans le cœur sans lumière.' });
  } else {
    recs.push({ theme: 'Lumière', text: 'Marquez les fenêtres / baies pour orienter les espaces de vie vers la lumière naturelle.' });
  }

  if (has('porteur') || has('poteau')) {
    recs.push({ theme: 'Structure', text: 'Composez AVEC les murs porteurs / poteaux (ne pas les déplacer) : alignez cloisons et passages dessus, intégrez les poteaux dans les séparations ou le mobilier.' });
  }

  recs.push({
    theme: 'Circulation',
    text: commercial
      ? 'Tracez une circulation principale fluide ≥ 140 cm (PMR / ERP) reliant entrée → zones → sortie de secours, sans cul-de-sac.'
      : 'Prévoyez des dégagements ≥ 90 cm et un accès direct à chaque pièce ; évitez de traverser une pièce pour en atteindre une autre.',
  });

  if (commercial) {
    recs.push({ theme: 'Flux client', text: 'Séquence type : entrée + vitrine attractive → parcours de vente (produits forts en fond pour faire circuler) → cabines / essayage → caisse près de la sortie → réserve / stock à l’arrière (proche livraison).' });
    if (!has('secours')) {
      recs.push({ theme: 'Sécurité ERP', text: 'Indiquez au moins une sortie de secours dégagée et signalée, et vérifiez les distances d’évacuation.' });
    }
    if (/restaurant|resto|cuisine pro|chr|bar|caf|h[oô]tel|brasserie/.test(prog)) {
      recs.push({ theme: 'CHR', text: 'Cuisine / laboratoire : prévoir l’extraction (gaine VMC), la séparation des flux propre / sale, et un accès livraison distinct du flux client.' });
    }
  } else {
    recs.push({ theme: 'Zonage jour / nuit', text: 'Séparez la zone jour (entrée, séjour, cuisine) de la zone nuit (chambres, salle de bain) ; placez les chambres au calme, loin de l’entrée.' });
  }

  const tiny = rooms.filter((r) => roomAreaM2(r) < 4);
  if (tiny.length) {
    recs.push({ theme: 'Surfaces', text: `${tiny.length} pièce(s) très petite(s) — vérifiez l’usage réel ou fusionnez pour gagner en confort.` });
  }

  if (!rooms.length) {
    recs.length = 0;
    recs.push({ theme: 'Démarrage', text: 'Ajoutez d’abord des pièces et marquez les contraintes techniques sur le plan, puis relancez l’assistant.' });
  }

  return { summary, recommendations: recs, issues: analyzeLayout(project, { commercial }) };
}
