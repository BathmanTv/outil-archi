// outil-archi/tests/geometry.test.js
import { describe, it, expect } from 'vitest';
import {
  snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters, PX_PER_M,
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
