// outil-archi/tests/geometry.test.js
import { describe, it, expect } from 'vitest';
import {
  snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters, PX_PER_M,
  rectsOverlap, resolveNoOverlap, snapToNeighbors,
  roomPolygon, polygonAreaM2, polygonCentroid, pointInPolygon, pointPolyDistance,
  snapPointToGrid, applyOrtho, snapToVertices,
} from '../js/geometry.js';

describe('snapToGrid', () => {
  it('snaps to nearest 0.5 m by default', () => {
    expect(snapToGrid(1.2)).toBe(1.0);
    expect(snapToGrid(1.3)).toBe(1.5);
    expect(snapToGrid(2.74)).toBe(2.5);
  });
});

describe('roomAreaM2', () => {
  it('returns width * height rounded to 2 decimals', () => {
    expect(roomAreaM2({ w: 5, h: 4 })).toBe(20);
    expect(roomAreaM2({ w: 3.5, h: 3 })).toBe(10.5);
  });
  it('uses the shoelace area for polygon rooms', () => {
    // L-shape: 4x4 square with a 2x2 corner removed -> 12 m²
    const L = { points: [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 },
      { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
    ] };
    expect(roomAreaM2(L)).toBe(12);
  });
});

describe('totalAreaM2', () => {
  it('sums all rooms', () => {
    expect(totalAreaM2([{ w: 5, h: 4 }, { w: 3, h: 3 }])).toBe(29);
  });
  it('mixes rect and polygon rooms', () => {
    const tri = { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] }; // 6 m²
    expect(totalAreaM2([{ w: 5, h: 4 }, tri])).toBe(26);
  });
  it('returns 0 for empty array', () => {
    expect(totalAreaM2([])).toBe(0);
  });
});

describe('roomPolygon', () => {
  it('expands a rect room to 4 corners', () => {
    expect(roomPolygon({ x: 1, y: 2, w: 3, h: 4 })).toEqual([
      { x: 1, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 6 }, { x: 1, y: 6 },
    ]);
  });
  it('returns a polygon room unchanged', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }];
    expect(roomPolygon({ points: pts })).toBe(pts);
  });
});

describe('polygonAreaM2', () => {
  it('computes a square area regardless of winding', () => {
    const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    expect(polygonAreaM2(sq)).toBe(4);
    expect(polygonAreaM2(sq.slice().reverse())).toBe(4);
  });
});

describe('polygonCentroid', () => {
  it('finds the centre of a square', () => {
    const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    const c = polygonCentroid(sq);
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(2);
  });
});

describe('pointInPolygon', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  it('detects inside / outside', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, sq)).toBe(false);
  });
});

describe('pointPolyDistance', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  it('is 0 inside', () => {
    expect(pointPolyDistance({ x: 2, y: 2 }, sq)).toBe(0);
  });
  it('measures distance to the nearest edge outside', () => {
    expect(pointPolyDistance({ x: 6, y: 2 }, sq)).toBe(2);
  });
});

describe('snapPointToGrid', () => {
  it('snaps both axes to the 0.5 m grid', () => {
    expect(snapPointToGrid({ x: 1.2, y: 2.74 })).toEqual({ x: 1.0, y: 2.5 });
  });
});

describe('applyOrtho', () => {
  const anchor = { x: 1, y: 1 };
  it('locks to horizontal when x moves most', () => {
    expect(applyOrtho(anchor, { x: 5, y: 1.3 })).toEqual({ x: 5, y: 1 });
  });
  it('locks to vertical when y moves most', () => {
    expect(applyOrtho(anchor, { x: 1.3, y: 5 })).toEqual({ x: 1, y: 5 });
  });
});

describe('snapToVertices', () => {
  const verts = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
  it('latches onto a nearby vertex', () => {
    expect(snapToVertices({ x: 5.1, y: 4.9 }, verts, 0.3)).toEqual({ x: 5, y: 5 });
  });
  it('leaves a far point untouched', () => {
    expect(snapToVertices({ x: 2, y: 2 }, verts, 0.3)).toEqual({ x: 2, y: 2 });
  });
});

describe('meters <-> pixels', () => {
  it('round-trips', () => {
    expect(metersToPixels(2)).toBe(2 * PX_PER_M);
    expect(pixelsToMeters(PX_PER_M)).toBe(1);
  });
});

describe('rectsOverlap', () => {
  const a = { x: 0, y: 0, w: 4, h: 3 };
  it('detects overlapping rects', () => {
    expect(rectsOverlap(a, { x: 2, y: 1, w: 4, h: 3 })).toBe(true);
  });
  it('flush (touching) edges do not count as overlap', () => {
    expect(rectsOverlap(a, { x: 4, y: 0, w: 2, h: 3 })).toBe(false);
  });
  it('separated rects do not overlap', () => {
    expect(rectsOverlap(a, { x: 10, y: 10, w: 2, h: 2 })).toBe(false);
  });
});

describe('resolveNoOverlap', () => {
  it('pushes a room flush against the nearest edge (least penetration)', () => {
    // moved overlaps `o` slightly from the right -> should snap flush to o's right edge
    const o = { x: 0, y: 0, w: 4, h: 3 };
    const moved = { x: 3.5, y: 0, w: 4, h: 3 };
    const r = resolveNoOverlap(moved, [o]);
    expect(rectsOverlap({ ...moved, ...r }, o)).toBe(false);
    expect(r.x).toBe(4); // flush on o's right
    expect(r.y).toBe(0);
  });
  it('leaves a non-overlapping room untouched', () => {
    const r = resolveNoOverlap({ x: 10, y: 10, w: 2, h: 2 }, [{ x: 0, y: 0, w: 4, h: 3 }]);
    expect(r).toEqual({ x: 10, y: 10 });
  });
  it('resolves overlap against multiple rooms', () => {
    const others = [{ x: 0, y: 0, w: 4, h: 3 }, { x: 4, y: 0, w: 4, h: 3 }];
    const moved = { x: 3, y: 0, w: 2, h: 3 };
    const r = resolveNoOverlap(moved, others);
    others.forEach((o) => expect(rectsOverlap({ ...moved, ...r }, o)).toBe(false));
  });
});

describe('snapToNeighbors', () => {
  it('snaps flush to a neighbour edge when within threshold', () => {
    const o = { x: 0, y: 0, w: 4, h: 3 };
    // moved is 0.2 m short of sitting flush to o's right edge -> snap to x=4
    const r = snapToNeighbors({ x: 3.8, y: 0, w: 3, h: 3 }, [o], 0.4);
    expect(r.x).toBe(4);
    expect(r.y).toBe(0);
  });
  it('does not snap when beyond threshold', () => {
    const o = { x: 0, y: 0, w: 4, h: 3 };
    const r = snapToNeighbors({ x: 6, y: 5, w: 3, h: 3 }, [o], 0.4);
    expect(r).toEqual({ x: 6, y: 5 });
  });
});
