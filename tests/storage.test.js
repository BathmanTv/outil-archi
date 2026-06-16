// outil-archi/tests/storage.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProjects, createProject, upsertProject, deleteProject,
  exportProjectJson, importProjectJson,
} from '../js/storage.js';

beforeEach(() => localStorage.clear());

describe('projects CRUD', () => {
  it('starts empty', () => {
    expect(loadProjects()).toEqual([]);
  });
  it('creates and upserts', () => {
    upsertProject(createProject('Maison Dupont', 'Dupont'));
    const all = loadProjects();
    expect(all.length).toBe(1);
    expect(all[0].nom).toBe('Maison Dupont');
    expect(Array.isArray(all[0].pieces)).toBe(true);
  });
  it('updates existing on upsert (no duplicate)', () => {
    const p = createProject('A');
    upsertProject(p);
    p.nom = 'B';
    upsertProject(p);
    const all = loadProjects();
    expect(all.length).toBe(1);
    expect(all[0].nom).toBe('B');
  });
  it('deletes by id', () => {
    const p = createProject('A');
    upsertProject(p);
    deleteProject(p.id);
    expect(loadProjects()).toEqual([]);
  });
});

describe('JSON import/export', () => {
  it('round-trips with a fresh id', () => {
    const p = createProject('A', 'Client');
    p.pieces.push({ id: 'r1', nom: 'Salon', x: 0, y: 0, w: 5, h: 4, type: 'salon', couleur: '#eee' });
    const imported = importProjectJson(exportProjectJson(p));
    expect(imported.nom).toBe('A');
    expect(imported.pieces.length).toBe(1);
    expect(imported.id).not.toBe(p.id);
  });
  it('throws on invalid structure', () => {
    expect(() => importProjectJson('{"foo":1}')).toThrow();
  });
});
