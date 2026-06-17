import { describe, it, expect } from 'vitest';
import { analyzeLayout, pointRoomDistance } from '../js/checks.js';

const room = (over = {}) => ({ id: 'r1', nom: 'Pièce', type: 'defaut', x: 0, y: 0, w: 4, h: 3, ...over });
const con = (kind, x, y, over = {}) => ({ id: `c-${kind}-${x}-${y}`, kind, x, y, ...over });

describe('pointRoomDistance', () => {
  it('is 0 inside the room', () => {
    expect(pointRoomDistance({ x: 1, y: 1 }, room())).toBe(0);
  });
  it('measures distance to nearest edge outside', () => {
    expect(pointRoomDistance({ x: 6, y: 0 }, room())).toBe(2); // room right edge at x=4
  });
});

describe('analyzeLayout — water', () => {
  it('flags a wet room with no nearby water supply', () => {
    const p = { pieces: [room({ type: 'cuisine' })], contraintes: [] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => i.level === 'warn' && /arrivée d'eau/.test(i.message))).toBe(true);
  });
  it('does not flag when water is within 3 m', () => {
    const p = { pieces: [room({ type: 'cuisine' })], contraintes: [con('eau', 5, 1)] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => /arrivée d'eau/.test(i.message))).toBe(false);
  });
});

describe('analyzeLayout — windows / blind room', () => {
  it('flags a room far from any window when windows exist', () => {
    const p = { pieces: [room({ x: 20, y: 20 })], contraintes: [con('fenetre', 0, 0)] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => /aveugle/.test(i.message))).toBe(true);
  });
  it('no blind-room check when there are no windows at all', () => {
    const p = { pieces: [room()], contraintes: [] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => /aveugle/.test(i.message))).toBe(false);
  });
});

describe('analyzeLayout — min surface', () => {
  it('warns a bedroom under 9 m²', () => {
    const p = { pieces: [room({ type: 'chambre', w: 2, h: 2 })], contraintes: [] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => i.level === 'warn' && /9 m²/.test(i.message))).toBe(true);
  });
});

describe('analyzeLayout — obstacles', () => {
  it('flags a room overlapping a poteau', () => {
    const p = { pieces: [room()], contraintes: [con('poteau', 2, 1)] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => /poteau/.test(i.message))).toBe(true);
  });
});

describe('analyzeLayout — ERP exits', () => {
  it('reminds about emergency exit in commercial mode when none marked', () => {
    const p = { pieces: [room()], contraintes: [] };
    const issues = analyzeLayout(p, { commercial: true });
    expect(issues.some((i) => /sortie de secours/.test(i.message))).toBe(true);
  });
  it('no exit reminder in residential mode', () => {
    const p = { pieces: [room()], contraintes: [] };
    const issues = analyzeLayout(p, { commercial: false });
    expect(issues.some((i) => /sortie de secours/.test(i.message))).toBe(false);
  });
});
