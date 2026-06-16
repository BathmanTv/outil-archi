// outil-archi/tests/prompt.test.js
import { describe, it, expect } from 'vitest';
import { buildPrompt, pollinationsUrl } from '../js/prompt.js';

describe('buildPrompt', () => {
  it('maps FR room/style to EN and includes palette, materials, extra', () => {
    const p = buildPrompt({
      roomType: 'salon', style: 'scandinave',
      colors: ['beige', 'vert sauge'], materials: ['bois clair'], extra: 'grande fenetre',
    });
    expect(p).toContain('living room');
    expect(p).toContain('Scandinavian style');
    expect(p).toContain('beige, vert sauge');
    expect(p).toContain('bois clair');
    expect(p).toContain('grande fenetre');
    expect(p).toContain('photorealistic');
  });

  it('omits palette/materials clauses when empty', () => {
    const p = buildPrompt({ roomType: 'cuisine', style: 'moderne' });
    expect(p).toContain('kitchen');
    expect(p).toContain('modern style');
    expect(p).not.toContain('color palette');
    expect(p).not.toContain('using ');
  });
});

describe('pollinationsUrl', () => {
  it('builds an encoded URL with size + nologo', () => {
    const url = pollinationsUrl('a kitchen', { width: 800, height: 600 });
    expect(url.startsWith('https://image.pollinations.ai/prompt/a%20kitchen')).toBe(true);
    expect(url).toContain('width=800');
    expect(url).toContain('height=600');
    expect(url).toContain('nologo=true');
  });
  it('includes seed when provided', () => {
    expect(pollinationsUrl('x', { seed: 42 })).toContain('seed=42');
  });
});
