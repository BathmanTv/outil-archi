// outil-archi/js/checks.js
// Deterministic layout analysis: given rooms + technical constraints, surface
// "points de vigilance" (no AI — reliable, no hallucination on regulatory items).
import {
  roomAreaM2, totalAreaM2, roomPolygon, pointInPolygon, pointPolyDistance,
} from './geometry.js';

// Distance (meters) from a point {x,y} to a room (rect OR polygon); 0 if inside.
export function pointRoomDistance(pt, room) {
  return pointPolyDistance(pt, roomPolygon(room));
}

// True if an axis-aligned box {x,y,w,h} (meters) overlaps a room of any shape.
function boxIntersectsRoom(box, room) {
  const poly = roomPolygon(room);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  if (poly.some((v) => v.x >= box.x && v.x <= box.x + box.w && v.y >= box.y && v.y <= box.y + box.h)) return true;
  return false;
}

const WATER_TYPES = ['cuisine', 'salle de bain'];
const WATER_MAX_M = 3;        // a wet room should be near a water supply
const WINDOW_NEAR_M = 0.6;    // a window marker counts as "lighting" a room if this close
const OBSTACLE_BOX_M = 0.3;   // a point obstacle (poteau) treated as a small box
const EVAC_MAX_M = 40;        // indicative max travel distance to an exit (2 directions)

// ERP fire-safety exit/UP requirements by occupancy (effectif).
// INDICATIVE ONLY — derived from the Règlement de sécurité ERP (articles CO).
// Returns { sorties, up, largeur } where `largeur` is the cumulative min width (m).
export function erpExitRequirements(effectif) {
  const e = +effectif || 0;
  let sorties; let up;
  if (e <= 19) { sorties = 1; up = 1; }
  else if (e <= 50) { sorties = 2; up = 2; }
  else if (e <= 100) { sorties = 2; up = 2; }
  else if (e <= 200) { sorties = 2; up = 3; }
  else if (e <= 300) { sorties = 2; up = 4; }
  else if (e <= 400) { sorties = 2; up = 5; }
  else if (e <= 500) { sorties = 2; up = 6; }
  else {
    sorties = 2 + Math.ceil((e - 500) / 1000); // +1 sortie per extra 1000 above 500
    up = 6 + Math.ceil((e - 500) / 500);        // +1 UP per extra 500 above 500
  }
  // 1 UP = 0.90 m, 2 UP = 1.40 m, ≥3 UP = up × 0.60 m
  const largeur = up === 1 ? 0.9 : up === 2 ? 1.4 : +(up * 0.6).toFixed(2);
  return { sorties, up, largeur };
}

// Returns an array of issues: { level:'warn'|'info', message, roomId? }
export function analyzeLayout(project, { commercial = true, effectif = 0 } = {}) {
  const rooms = project.pieces || [];
  const cons = project.contraintes || [];
  const issues = [];

  const water = cons.filter((c) => c.kind === 'eau');
  const windows = cons.filter((c) => c.kind === 'fenetre');
  const exits = cons.filter((c) => c.kind === 'secours');
  // Obstacles = legacy poteau/porteur markers + scaled structural columns.
  const obstacles = [
    ...cons.filter((c) => c.kind === 'poteau' || c.kind === 'porteur'),
    ...(project.poteaux || []).map((po) => ({ ...po, kind: 'poteau', taille: po.taille })),
  ];

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
      const s = o.taille || OBSTACLE_BOX_M; // scaled column → real size, else default box
      const box = o.kind === 'porteur' && o.w
        ? { x: o.x, y: o.y, w: o.w, h: o.h }
        : { x: o.x - s / 2, y: o.y - s / 2, w: s, h: s };
      if (boxIntersectsRoom(box, r)) {
        issues.push({ level: 'info', roomId: r.id, message: `${r.nom} : traverse un ${o.kind === 'porteur' ? 'mur porteur' : 'poteau'} (à vérifier).` });
        break;
      }
    }
  }

  if (commercial && rooms.length > 0) {
    // Exit count vs occupancy (effectif).
    if (effectif > 0) {
      const req = erpExitRequirements(effectif);
      if (exits.length < req.sorties) {
        issues.push({ level: 'warn', message: `Effectif ${effectif} pers. : ${req.sorties} sortie(s) exigée(s), ${exits.length} marquée(s). Largeur cumulée ≥ ${req.largeur} m (${req.up} UP).` });
      } else {
        issues.push({ level: 'info', message: `Effectif ${effectif} pers. : ${req.sorties} sortie(s) / ${req.up} UP (≥ ${req.largeur} m) à vérifier sur les largeurs réelles.` });
      }
    } else {
      issues.push({ level: 'info', message: 'Renseignez l’effectif pour vérifier le nombre de sorties et la largeur des dégagements (UP) exigés en ERP.' });
    }

    if (exits.length === 0) {
      issues.push({ level: 'warn', message: 'Aucune sortie de secours marquée — obligatoire en ERP.' });
    } else {
      // Travel-distance to the nearest exit (indicative).
      for (const r of rooms) {
        const d = Math.min(...exits.map((ex) => pointRoomDistance(ex, r)));
        if (d > EVAC_MAX_M) {
          issues.push({ level: 'warn', roomId: r.id, message: `${r.nom} : ~${Math.round(d)} m de la sortie la plus proche (> ${EVAC_MAX_M} m indicatif — distance d’évacuation à vérifier).` });
        }
      }
    }

    issues.push({ level: 'info', message: 'Circulations : principale ≥ 140 cm (PMR), dégagements ≥ 90 cm ; éviter les culs-de-sac > 10 m ; prévoir désenfumage et signalisation.' });
    issues.push({ level: 'info', message: 'Pré-diagnostic indicatif (Règlement de sécurité ERP) — à valider par un BET sécurité / la commission de sécurité, ne vaut pas attestation de conformité.' });
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
  const has = (kind) => cons.some((c) => c.kind === kind)
    || (kind === 'poteau' && (project.poteaux || []).length > 0);
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
