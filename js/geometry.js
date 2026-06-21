// outil-archi/js/geometry.js
export const PX_PER_M = 50;   // 50 px = 1 m at scale 1
export const GRID_M = 0.5;    // snap step in meters

export function snapToGrid(value, grid = GRID_M) {
  return Math.round(value / grid) * grid;
}

// A room is either a rectangle ({x,y,w,h}) or a polygon ({points:[{x,y}...]}).
// roomPolygon returns the room outline as a list of vertices (meters) for EITHER
// shape, so the rest of the geometry can treat every room uniformly.
export function roomPolygon(room) {
  if (room.points && room.points.length >= 3) return room.points;
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ];
}

// Signed-area / shoelace formula → absolute area in m².
export function polygonAreaM2(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

// Area-weighted centroid (used to place the room label). Falls back to the
// bounding-box centre for degenerate (zero-area) polygons.
export function polygonCentroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const b = polygonBBox(points);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

// Axis-aligned bounding box {x,y,w,h} of a polygon.
export function polygonBBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Ray-casting point-in-polygon test (point + polygon in meters).
export function pointInPolygon(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const intersect = (pi.y > pt.y) !== (pj.y > pt.y)
      && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Shortest distance from a point to a segment [a,b] (all in meters).
export function pointSegmentDistance(pt, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

// Distance from a point to a polygon outline; 0 if the point is inside.
export function pointPolyDistance(pt, points) {
  if (pointInPolygon(pt, points)) return 0;
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = pointSegmentDistance(pt, points[i], points[(i + 1) % points.length]);
    if (d < min) min = d;
  }
  return min;
}

export function roomAreaM2(room) {
  if (room.points && room.points.length >= 3) return +polygonAreaM2(room.points).toFixed(2);
  return +(room.w * room.h).toFixed(2);
}

export function totalAreaM2(rooms) {
  return +rooms.reduce((sum, r) => sum + roomAreaM2(r), 0).toFixed(2);
}

// --- AutoCAD-style drawing helpers -----------------------------------------

// Snap a free point {x,y} (meters) to the grid.
export function snapPointToGrid(pt, grid = GRID_M) {
  return { x: snapToGrid(pt.x, grid), y: snapToGrid(pt.y, grid) };
}

// ORTHO: constrain `pt` to lie exactly horizontal OR vertical from `anchor`
// (whichever axis the cursor moved most along), like AutoCAD's ortho mode.
export function applyOrtho(anchor, pt) {
  if (!anchor) return pt;
  return Math.abs(pt.x - anchor.x) >= Math.abs(pt.y - anchor.y)
    ? { x: pt.x, y: anchor.y }
    : { x: anchor.x, y: pt.y };
}

// OSNAP-style vertex snap: if `pt` is within `thr` meters of any candidate
// vertex, return that vertex (so new geometry latches onto existing corners).
export function snapToVertices(pt, vertices, thr = 0.3) {
  let best = null;
  let bestD = thr;
  for (const v of vertices) {
    const d = Math.hypot(pt.x - v.x, pt.y - v.y);
    if (d <= bestD) { bestD = d; best = v; }
  }
  return best ? { x: best.x, y: best.y } : pt;
}

export function metersToPixels(m, scale = 1) {
  return m * PX_PER_M * scale;
}

export function pixelsToMeters(px, scale = 1) {
  return px / (PX_PER_M * scale);
}

// Axis-aligned bounding-box overlap test for two rects {x,y,w,h} (meters).
// Touching edges (flush) does NOT count as overlap.
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Magnetism: when `moved` lands within `thr` meters of aligning flush with a
// neighbour's edge, snap it to that edge so rooms sit cleanly side by side.
export function snapToNeighbors(moved, others, thr = 0.4) {
  let { x, y } = moved;
  const { w, h } = moved;
  for (const o of others) {
    const xCandidates = [o.x, o.x + o.w - w, o.x - w, o.x + o.w]; // align-left, align-right, left-of, right-of
    for (const cx of xCandidates) { if (Math.abs(x - cx) <= thr) { x = cx; break; } }
    const yCandidates = [o.y, o.y + o.h - h, o.y - h, o.y + o.h]; // align-top, align-bottom, above, below
    for (const cy of yCandidates) { if (Math.abs(y - cy) <= thr) { y = cy; break; } }
  }
  return { x, y };
}

// Push `moved` out of any overlap so it ends up flush against the nearest edge
// of whatever it overlaps. Exits the WHOLE group of overlapping rooms at once
// (so a room squeezed between two flush neighbours escapes instead of getting
// stuck oscillating). Returns resolved {x,y}; rooms can never end up overlapping.
export function resolveNoOverlap(moved, others, maxIter = 12) {
  let p = { x: moved.x, y: moved.y, w: moved.w, h: moved.h };
  const seen = new Set();
  for (let i = 0; i < maxIter; i++) {
    const hits = others.filter((r) => rectsOverlap(p, r));
    if (!hits.length) break;
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) break; // no progress — bail to best effort
    seen.add(key);

    const minX = Math.min(...hits.map((o) => o.x));
    const maxX = Math.max(...hits.map((o) => o.x + o.w));
    const minY = Math.min(...hits.map((o) => o.y));
    const maxY = Math.max(...hits.map((o) => o.y + o.h));
    const candidates = [
      { x: minX - p.w, y: p.y }, // exit left of the group
      { x: maxX, y: p.y },       // exit right
      { x: p.x, y: minY - p.h }, // exit above
      { x: p.x, y: maxY },       // exit below
    ];
    // Nearest edge first = smallest displacement from current position.
    candidates.sort((a, b) =>
      (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)));
    // Prefer a move that clears every room; otherwise take the nearest and loop.
    const clear = candidates.find((c) => !others.some((r) => rectsOverlap({ x: c.x, y: c.y, w: p.w, h: p.h }, r)));
    const next = clear || candidates[0];
    p = { x: next.x, y: next.y, w: p.w, h: p.h };
  }
  return { x: p.x, y: p.y };
}
