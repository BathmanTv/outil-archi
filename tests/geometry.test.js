// outil-archi/tests/geometry.test.js
import { describe, it, expect } from 'vitest';
import {
  snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters, PX_PER_M,
  rectsOverlap, resolveNoOverlap, snapToNeighbors,
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
});

describe('totalAreaM2', () => {
  it('sums all rooms', () => {
    expect(totalAreaM2([{ w: 5, h: 4 }, { w: 3, h: 3 }])).toBe(29);
  });
  it('returns 0 for empty array', () => {
    expect(totalAreaM2([])).toBe(0);
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
