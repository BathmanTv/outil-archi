# Outil Plans 2D + Ambiances IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, install-free, static web app (FR) where an interior architect creates 2D floor plans (drag/resize, snap, m², PDF export) and generates ambiance images from text via Pollinations.ai.

**Architecture:** Single-page static app, all client-side, no backend. Pure ES modules for testable logic (geometry, prompt, storage); UI modules use Konva.js (canvas) and jsPDF (export) loaded via CDN globals. Data persists in localStorage with JSON export/import for portability. Hosted on GitHub Pages; installable as PWA.

**Tech Stack:** Vanilla JS (ES modules), Konva.js (CDN), jsPDF (CDN), Pollinations.ai (no-key image API), Vitest + jsdom (dev-only tests), GitHub Pages (hosting).

---

## File Structure

```
outil-archi/
  index.html              # single page, 3 views, loads Konva+jsPDF via CDN
  css/styles.css          # clean minimal UI, accent var, touch targets
  js/
    geometry.js           # snap, m², m<->px  (pure, tested)
    prompt.js             # FR->EN prompt builder + Pollinations URL (pure, tested)
    storage.js            # project CRUD localStorage + JSON import/export (tested)
    planEditor.js         # Konva canvas: rooms, drag, resize, walls, dims
    ambiance.js           # B1 form -> Pollinations -> gallery
    exportPdf.js          # jsPDF plan/project PDF + PNG
    app.js                # router, accueil/projects, wiring, autosave
    pwa.js                # service worker registration
  manifest.json           # PWA manifest
  sw.js                   # service worker (offline cache for plan)
  README.md               # guide FR + deploy notes
  package.json            # dev: vitest
  vitest.config.js        # jsdom env
  tests/
    geometry.test.js
    prompt.test.js
    storage.test.js
```

**Local run (ES modules need http, not file://):** `npx serve outil-archi` then open the printed URL. (Alt: `python -m http.server` from `outil-archi/`, or VS Code Live Server.)

---

## Task 1: Scaffold project + HTML shell + CSS + dev tooling

**Files:**
- Create: `outil-archi/index.html`
- Create: `outil-archi/css/styles.css`
- Create: `outil-archi/package.json`
- Create: `outil-archi/vitest.config.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "outil-archi",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom' },
});
```

- [ ] **Step 3: Install dev deps**

Run: `cd outil-archi && npm install`
Expected: `node_modules/` created, vitest + jsdom installed, exit 0.

- [ ] **Step 4: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Plans & Ambiances</title>
  <link rel="stylesheet" href="css/styles.css" />
  <link rel="manifest" href="manifest.json" />
  <script src="https://unpkg.com/konva@9/konva.min.js"></script>
  <script src="https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
</head>
<body>
  <header class="topbar">
    <div class="brand"><img id="brandLogo" alt="" /> <span>Plans &amp; Ambiances</span></div>
    <nav>
      <button data-view="accueil" class="navbtn active">Projets</button>
      <button data-view="plan" class="navbtn">Plan 2D</button>
      <button data-view="ambiance" class="navbtn">Ambiance</button>
    </nav>
  </header>

  <!-- VIEW: ACCUEIL -->
  <section id="view-accueil" class="view active">
    <div class="row">
      <button id="btnNew" class="primary">+ Nouveau projet</button>
      <label class="ghost">Importer .json <input id="importJson" type="file" accept="application/json" hidden /></label>
    </div>
    <div id="projectList" class="cards"></div>
  </section>

  <!-- VIEW: PLAN -->
  <section id="view-plan" class="view">
    <div class="editor">
      <aside class="panel">
        <h3 id="planProjectName">—</h3>
        <fieldset>
          <legend>Ajouter une pièce</legend>
          <label>Nom <input id="rNom" type="text" placeholder="Salon" /></label>
          <label>Type
            <select id="rType">
              <option value="salon">Salon</option>
              <option value="cuisine">Cuisine</option>
              <option value="chambre">Chambre</option>
              <option value="salle de bain">Salle de bain</option>
              <option value="bureau">Bureau</option>
              <option value="defaut">Autre</option>
            </select>
          </label>
          <label>Largeur (m) <input id="rW" type="number" min="0.5" step="0.5" value="4" /></label>
          <label>Hauteur (m) <input id="rH" type="number" min="0.5" step="0.5" value="3" /></label>
          <button id="btnAddRoom" class="primary">Ajouter</button>
        </fieldset>
        <div class="toolbar">
          <button id="btnZoomIn">+</button>
          <button id="btnZoomOut">−</button>
          <button id="btnDelRoom" class="danger">Supprimer sélection</button>
        </div>
        <p class="total">Surface totale : <strong id="totalArea">0</strong> m²</p>
        <button id="btnExportPlan" class="primary">Exporter le plan (PDF)</button>
      </aside>
      <div id="planCanvas" class="canvas"></div>
    </div>
  </section>

  <!-- VIEW: AMBIANCE -->
  <section id="view-ambiance" class="view">
    <div class="editor">
      <aside class="panel">
        <h3>Générer une ambiance</h3>
        <label>Pièce
          <select id="aRoom">
            <option>salon</option><option>cuisine</option><option>chambre</option>
            <option>salle de bain</option><option>bureau</option><option>salle a manger</option>
          </select>
        </label>
        <label>Style
          <select id="aStyle">
            <option>scandinave</option><option>moderne</option><option>industriel</option>
            <option>boheme</option><option>contemporain</option><option>minimaliste</option><option>classique</option>
          </select>
        </label>
        <label>Couleurs (séparées par virgule) <input id="aColors" placeholder="beige, vert sauge" /></label>
        <label>Matériaux (séparés par virgule) <input id="aMaterials" placeholder="bois clair, lin" /></label>
        <label>Détails libres <input id="aExtra" placeholder="grande fenêtre" /></label>
        <div class="toolbar">
          <button id="btnGenerate" class="primary">Générer</button>
          <button id="btnRegen">Régénérer</button>
          <button id="btnSaveAmb">Ajouter au projet</button>
        </div>
        <p id="ambStatus" class="status"></p>
      </aside>
      <div class="canvas amb">
        <img id="ambImage" alt="Ambiance générée" />
        <div id="ambGallery" class="gallery"></div>
      </div>
    </div>
  </section>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `css/styles.css`**

```css
:root {
  --accent: #2f6f4f;       /* couleur marque du client, modifiable */
  --bg: #ffffff;
  --panel: #f6f7f8;
  --line: #e4e7eb;
  --text: #1f2328;
  --danger: #c0392b;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--text); background: var(--bg); }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.brand img { height: 28px; max-width: 120px; object-fit: contain; }
nav { display: flex; gap: 6px; }
.navbtn { padding: 10px 14px; border: 0; background: transparent; border-radius: 8px; cursor: pointer; font-size: 15px; }
.navbtn.active { background: var(--accent); color: #fff; }
.view { display: none; padding: 16px; }
.view.active { display: block; }
.row { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
button { font-size: 15px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
button.danger { color: var(--danger); border-color: var(--danger); }
.ghost { padding: 10px 14px; border: 1px dashed var(--line); border-radius: 8px; cursor: pointer; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.card { border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.card h4 { margin: 0 0 6px; }
.card .meta { color: #666; font-size: 13px; }
.card .actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.editor { display: flex; gap: 16px; align-items: flex-start; }
.panel { width: 300px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.panel label { display: block; margin: 8px 0; font-size: 14px; }
.panel input, .panel select { width: 100%; padding: 9px; border: 1px solid var(--line); border-radius: 8px; font-size: 15px; }
fieldset { border: 1px solid var(--line); border-radius: 10px; margin: 0 0 12px; }
.toolbar { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
.total { font-size: 15px; }
.canvas { flex: 1; min-height: 600px; border: 1px solid var(--line); border-radius: 12px; background: #fafbfc; overflow: hidden; }
.canvas.amb { display: flex; flex-direction: column; align-items: center; padding: 12px; }
.canvas.amb img { max-width: 100%; max-height: 540px; border-radius: 10px; }
.gallery { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.gallery img { height: 70px; border-radius: 6px; cursor: pointer; }
.status { color: #555; font-size: 14px; min-height: 20px; }
@media (max-width: 800px) { .editor { flex-direction: column; } .panel { width: 100%; } }
```

- [ ] **Step 6: Commit**

```bash
git add outil-archi/index.html outil-archi/css/styles.css outil-archi/package.json outil-archi/vitest.config.js
git commit -m "feat(archi): scaffold static app shell + UI + dev tooling"
```

---

## Task 2: geometry.js (snap, area, m<->px) — TDD

**Files:**
- Create: `outil-archi/js/geometry.js`
- Test: `outil-archi/tests/geometry.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd outil-archi && npx vitest run tests/geometry.test.js`
Expected: FAIL — cannot resolve `../js/geometry.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// outil-archi/js/geometry.js
export const PX_PER_M = 50;   // 50 px = 1 m at scale 1
export const GRID_M = 0.5;    // snap step in meters

export function snapToGrid(value, grid = GRID_M) {
  return Math.round(value / grid) * grid;
}

export function roomAreaM2(room) {
  return +(room.w * room.h).toFixed(2);
}

export function totalAreaM2(rooms) {
  return +rooms.reduce((sum, r) => sum + r.w * r.h, 0).toFixed(2);
}

export function metersToPixels(m, scale = 1) {
  return m * PX_PER_M * scale;
}

export function pixelsToMeters(px, scale = 1) {
  return px / (PX_PER_M * scale);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd outil-archi && npx vitest run tests/geometry.test.js`
Expected: PASS — 4 test files/blocks green.

- [ ] **Step 5: Commit**

```bash
git add outil-archi/js/geometry.js outil-archi/tests/geometry.test.js
git commit -m "feat(archi): geometry utils (snap, area, m<->px) + tests"
```

---

## Task 3: prompt.js (FR->EN prompt + Pollinations URL) — TDD

**Files:**
- Create: `outil-archi/js/prompt.js`
- Test: `outil-archi/tests/prompt.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd outil-archi && npx vitest run tests/prompt.test.js`
Expected: FAIL — cannot resolve `../js/prompt.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// outil-archi/js/prompt.js
const STYLE_EN = {
  scandinave: 'Scandinavian style', moderne: 'modern style',
  industriel: 'industrial style', boheme: 'bohemian style',
  contemporain: 'contemporary style', minimaliste: 'minimalist style',
  classique: 'classic style',
};
const ROOM_EN = {
  salon: 'living room', cuisine: 'kitchen', chambre: 'bedroom',
  'salle de bain': 'bathroom', bureau: 'home office',
  'salle a manger': 'dining room', entree: 'entrance hall',
};

export function buildPrompt({ roomType = '', style = '', colors = [], materials = [], extra = '' } = {}) {
  const room = ROOM_EN[roomType.toLowerCase()] || roomType;
  const sty = STYLE_EN[style.toLowerCase()] || style;
  const parts = ['interior design photo of a', sty, room];
  if (colors.length) parts.push(`with ${colors.join(', ')} color palette`);
  if (materials.length) parts.push(`using ${materials.join(', ')}`);
  if (extra && extra.trim()) parts.push(extra.trim());
  parts.push('photorealistic, natural light, high detail, wide angle, no text, no watermark');
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function pollinationsUrl(prompt, { width = 1024, height = 768, seed } = {}) {
  const enc = encodeURIComponent(prompt);
  const params = new URLSearchParams({ width: String(width), height: String(height), nologo: 'true' });
  if (seed != null) params.set('seed', String(seed));
  return `https://image.pollinations.ai/prompt/${enc}?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd outil-archi && npx vitest run tests/prompt.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add outil-archi/js/prompt.js outil-archi/tests/prompt.test.js
git commit -m "feat(archi): ambiance prompt builder + Pollinations URL + tests"
```

---

## Task 4: storage.js (project CRUD + JSON import/export) — TDD

**Files:**
- Create: `outil-archi/js/storage.js`
- Test: `outil-archi/tests/storage.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd outil-archi && npx vitest run tests/storage.test.js`
Expected: FAIL — cannot resolve `../js/storage.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// outil-archi/js/storage.js
const KEY = 'outil_archi_projets_v1';

export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
}

export function loadProjects() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

export function saveProjects(projects) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function createProject(nom = 'Nouveau projet', client = '') {
  return {
    id: newId(), nom, client,
    date: new Date().toISOString().slice(0, 10),
    logo: '', pieces: [], ouvertures: [], ambiances: [],
  };
}

export function upsertProject(project) {
  const projects = loadProjects();
  const i = projects.findIndex(p => p.id === project.id);
  if (i >= 0) projects[i] = project; else projects.push(project);
  saveProjects(projects);
  return project;
}

export function deleteProject(id) {
  saveProjects(loadProjects().filter(p => p.id !== id));
}

export function exportProjectJson(project) {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json) {
  const p = JSON.parse(json);
  if (!p || typeof p !== 'object' || !Array.isArray(p.pieces)) {
    throw new Error('Fichier projet invalide');
  }
  p.id = newId();
  p.ouvertures = p.ouvertures || [];
  p.ambiances = p.ambiances || [];
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd outil-archi && npx vitest run tests/storage.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd outil-archi && npm test`
Expected: PASS — geometry + prompt + storage all green.

- [ ] **Step 6: Commit**

```bash
git add outil-archi/js/storage.js outil-archi/tests/storage.test.js
git commit -m "feat(archi): project storage CRUD + JSON import/export + tests"
```

---

## Task 5: planEditor.js (Konva canvas — rooms, drag, resize, walls, dims)

No unit test (canvas/DOM integration — covered by manual checklist per spec §11). Write complete implementation, then verify manually.

**Files:**
- Create: `outil-archi/js/planEditor.js`

- [ ] **Step 1: Write the implementation**

```js
// outil-archi/js/planEditor.js
import {
  GRID_M, snapToGrid, roomAreaM2, totalAreaM2, metersToPixels, pixelsToMeters,
} from './geometry.js';
import { newId } from './storage.js';

const ROOM_COLORS = {
  salon: '#cfe8ff', cuisine: '#ffe3c2', chambre: '#e7d6ff',
  'salle de bain': '#c2f0e8', bureau: '#ffd9e0', defaut: '#e9ecef',
};

export function createPlanEditor(containerId, project, { onChange } = {}) {
  const Konva = window.Konva;
  const container = document.getElementById(containerId);
  const stage = new Konva.Stage({
    container: containerId,
    width: container.clientWidth || 900,
    height: container.clientHeight || 600,
    draggable: true,
  });
  const gridLayer = new Konva.Layer();
  const roomLayer = new Konva.Layer();
  stage.add(gridLayer);
  stage.add(roomLayer);

  const transformer = new Konva.Transformer({ rotateEnabled: false, keepRatio: false });
  roomLayer.add(transformer);
  let selectedId = null;

  drawGrid();
  // click empty space clears selection
  stage.on('click tap', (e) => {
    if (e.target === stage) { selectedId = null; transformer.nodes([]); roomLayer.draw(); }
  });

  function drawGrid() {
    gridLayer.destroyChildren();
    const step = metersToPixels(GRID_M);
    const max = 2400;
    for (let x = 0; x <= max; x += step) gridLayer.add(new Konva.Line({ points: [x, 0, x, max], stroke: '#eee', strokeWidth: 1 }));
    for (let y = 0; y <= max; y += step) gridLayer.add(new Konva.Line({ points: [0, y, max, y], stroke: '#eee', strokeWidth: 1 }));
    gridLayer.draw();
  }

  function notify() {
    if (onChange) onChange(project, totalAreaM2(project.pieces));
  }

  function buildRoom(piece) {
    const group = new Konva.Group({
      id: piece.id, x: metersToPixels(piece.x), y: metersToPixels(piece.y), draggable: true,
    });
    const rect = new Konva.Rect({
      name: 'roomRect',
      width: metersToPixels(piece.w), height: metersToPixels(piece.h),
      fill: piece.couleur, stroke: '#222', strokeWidth: 4, // walls
    });
    const label = new Konva.Text({
      text: `${piece.nom}\n${roomAreaM2(piece)} m²`,
      fontSize: 14, fill: '#222', align: 'center',
      width: metersToPixels(piece.w), y: metersToPixels(piece.h) / 2 - 16,
    });
    group.add(rect);
    group.add(label);

    group.on('mousedown touchstart click tap', () => {
      selectedId = piece.id;
      transformer.nodes([rect]);
      roomLayer.draw();
    });

    group.on('dragend', () => {
      piece.x = snapToGrid(pixelsToMeters(group.x()));
      piece.y = snapToGrid(pixelsToMeters(group.y()));
      group.position({ x: metersToPixels(piece.x), y: metersToPixels(piece.y) });
      roomLayer.draw();
      notify();
    });

    rect.on('transformend', () => {
      piece.w = Math.max(GRID_M, snapToGrid(pixelsToMeters(rect.width() * rect.scaleX())));
      piece.h = Math.max(GRID_M, snapToGrid(pixelsToMeters(rect.height() * rect.scaleY())));
      rect.scale({ x: 1, y: 1 });
      rect.size({ width: metersToPixels(piece.w), height: metersToPixels(piece.h) });
      label.text(`${piece.nom}\n${roomAreaM2(piece)} m²`);
      label.width(metersToPixels(piece.w));
      label.y(metersToPixels(piece.h) / 2 - 16);
      roomLayer.draw();
      notify();
    });

    return group;
  }

  function render() {
    transformer.nodes([]);
    roomLayer.find('Group').forEach((g) => { if (g.id()) g.destroy(); });
    project.pieces.forEach((piece) => roomLayer.add(buildRoom(piece)));
    transformer.moveToTop();
    roomLayer.draw();
    notify();
  }

  function addRoom({ nom, w, h, type }) {
    const t = (type || 'defaut').toLowerCase();
    const piece = {
      id: newId(),
      nom: nom || 'Pièce',
      type: t,
      x: 0, y: 0,
      w: Math.max(GRID_M, snapToGrid(+w || 3)),
      h: Math.max(GRID_M, snapToGrid(+h || 3)),
      couleur: ROOM_COLORS[t] || ROOM_COLORS.defaut,
    };
    project.pieces.push(piece);
    render();
    return piece;
  }

  function deleteSelected() {
    if (!selectedId) return;
    project.pieces = project.pieces.filter((p) => p.id !== selectedId);
    selectedId = null;
    render();
  }

  function zoom(factor) {
    const s = Math.min(4, Math.max(0.25, stage.scaleX() * factor));
    stage.scale({ x: s, y: s });
    stage.draw();
  }

  render();
  return {
    stage,
    addRoom,
    deleteSelected,
    zoom,
    render,
    getStage: () => stage,
    getTotal: () => totalAreaM2(project.pieces),
  };
}
```

- [ ] **Step 2: Manual verification (after Task 8 wires it)**

Defer interactive verification to Task 8's checklist (the canvas needs app.js wiring to receive button events). For now confirm the file has no syntax errors:
Run: `cd outil-archi && node --check js/planEditor.js`
Expected: exit 0, no output. (Note: `import` of browser globals is fine for syntax check.)

- [ ] **Step 3: Commit**

```bash
git add outil-archi/js/planEditor.js
git commit -m "feat(archi): Konva plan editor — rooms, drag, resize, snap, walls, dims"
```

---

## Task 6: ambiance.js (B1 form -> Pollinations -> gallery)

**Files:**
- Create: `outil-archi/js/ambiance.js`

- [ ] **Step 1: Write the implementation**

```js
// outil-archi/js/ambiance.js
import { buildPrompt, pollinationsUrl } from './prompt.js';
import { newId } from './storage.js';

function splitList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// els: { roomSel, styleSel, colors, materials, extra, image, status }
export function setupAmbiance(els, project, { onSave } = {}) {
  let current = null; // { prompt, params, url }

  function readParams() {
    return {
      roomType: els.roomSel.value,
      style: els.styleSel.value,
      colors: splitList(els.colors.value),
      materials: splitList(els.materials.value),
      extra: els.extra.value,
    };
  }

  function generate(seed) {
    const params = readParams();
    const prompt = buildPrompt(params);
    const url = pollinationsUrl(prompt, { seed });
    current = { prompt, params, url };
    els.status.textContent = 'Génération…';
    els.image.src = url;
    els.image.onload = () => { els.status.textContent = ''; };
    els.image.onerror = () => { els.status.textContent = 'Erreur ou connexion requise. Réessayer.'; };
    return current;
  }

  function regenerate() {
    const seed = Math.floor(Math.random() * 1e6);
    return generate(seed);
  }

  function save() {
    if (!current) { els.status.textContent = 'Génère une image d’abord.'; return null; }
    const amb = { id: newId(), prompt: current.prompt, params: current.params, image: current.url };
    project.ambiances.push(amb);
    if (onSave) onSave(project);
    els.status.textContent = 'Ambiance ajoutée au projet.';
    return amb;
  }

  function renderGallery(galleryEl, onPick) {
    galleryEl.innerHTML = '';
    project.ambiances.forEach((a) => {
      const img = document.createElement('img');
      img.src = a.image;
      img.alt = 'ambiance';
      img.addEventListener('click', () => { els.image.src = a.image; if (onPick) onPick(a); });
      galleryEl.appendChild(img);
    });
  }

  return { generate, regenerate, save, renderGallery, getCurrent: () => current };
}
```

- [ ] **Step 2: Syntax check**

Run: `cd outil-archi && node --check js/ambiance.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add outil-archi/js/ambiance.js
git commit -m "feat(archi): ambiance generator (B1) via Pollinations + gallery"
```

---

## Task 7: exportPdf.js (plan PDF + project PDF + PNG)

**Files:**
- Create: `outil-archi/js/exportPdf.js`

- [ ] **Step 1: Write the implementation**

```js
// outil-archi/js/exportPdf.js
import { totalAreaM2 } from './geometry.js';

function safeName(s) { return (s || 'export').replace(/\s+/g, '_'); }

function titleBlock(doc, project, pageW) {
  doc.setFontSize(14);
  doc.text(project.nom || 'Projet', 10, 12);
  doc.setFontSize(10);
  doc.text(
    `Client: ${project.client || '-'}   Date: ${project.date}   Surface totale: ${totalAreaM2(project.pieces)} m²`,
    10, 18,
  );
  if (project.logo) {
    try { doc.addImage(project.logo, 'PNG', pageW - 42, 6, 32, 14); } catch (_) { /* logo invalide, ignore */ }
  }
}

export function exportPlanPdf(project, stage, { format = 'a4' } = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  titleBlock(doc, project, pageW);
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  doc.addImage(dataUrl, 'PNG', 10, 24, pageW - 20, pageH - 34);
  doc.save(`${safeName(project.nom)}_plan.pdf`);
}

export function exportPlanPng(project, stage) {
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${safeName(project.nom)}_plan.png`;
  a.click();
}

export function exportProjectPdf(project, stage, selectedAmbianceIds = []) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // page 1: plan
  titleBlock(doc, project, pageW);
  if (stage) {
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    doc.addImage(dataUrl, 'PNG', 10, 24, pageW - 20, pageH - 34);
  }

  // following pages: selected ambiances
  const chosen = project.ambiances.filter((a) => selectedAmbianceIds.includes(a.id));
  chosen.forEach((a) => {
    doc.addPage();
    titleBlock(doc, project, pageW);
    try { doc.addImage(a.image, 'PNG', 10, 24, pageW - 20, pageH - 34); } catch (_) { /* image distante, ignore */ }
  });

  doc.save(`${safeName(project.nom)}_projet.pdf`);
}
```

- [ ] **Step 2: Syntax check**

Run: `cd outil-archi && node --check js/exportPdf.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add outil-archi/js/exportPdf.js
git commit -m "feat(archi): PDF/PNG export with branded title block"
```

---

## Task 8: app.js (router + accueil/projects + wiring + autosave + logo + JSON IO)

**Files:**
- Create: `outil-archi/js/app.js`

- [ ] **Step 1: Write the implementation**

```js
// outil-archi/js/app.js
import {
  loadProjects, createProject, upsertProject, deleteProject,
  exportProjectJson, importProjectJson,
} from './storage.js';
import { createPlanEditor } from './planEditor.js';
import { setupAmbiance } from './ambiance.js';
import { exportPlanPdf } from './exportPdf.js';

const $ = (id) => document.getElementById(id);

let currentProject = null;
let editor = null;       // plan editor instance
let amb = null;          // ambiance controller

// ---------- routing ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $(`view-${name}`).classList.add('active');
  if (name === 'accueil') renderProjects();
  if (name === 'plan') mountPlan();
  if (name === 'ambiance') mountAmbiance();
}
document.querySelectorAll('.navbtn').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- accueil ----------
function renderProjects() {
  const list = $('projectList');
  const projects = loadProjects();
  list.innerHTML = '';
  if (!projects.length) { list.innerHTML = '<p>Aucun projet. Créez-en un.</p>'; return; }
  projects.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h4></h4>
      <div class="meta"></div>
      <div class="actions">
        <button class="open primary">Ouvrir</button>
        <button class="dup">Dupliquer</button>
        <button class="exp">Export .json</button>
        <button class="del danger">Suppr.</button>
      </div>`;
    card.querySelector('h4').textContent = p.nom;
    card.querySelector('.meta').textContent =
      `${p.client || 'sans client'} · ${p.date} · ${p.pieces.length} pièce(s)`;
    card.querySelector('.open').addEventListener('click', () => { currentProject = p; showView('plan'); });
    card.querySelector('.dup').addEventListener('click', () => {
      const copy = importProjectJson(exportProjectJson(p));
      copy.nom = p.nom + ' (copie)';
      upsertProject(copy);
      renderProjects();
    });
    card.querySelector('.exp').addEventListener('click', () => downloadJson(p));
    card.querySelector('.del').addEventListener('click', () => {
      if (confirm(`Supprimer "${p.nom}" ?`)) { deleteProject(p.id); renderProjects(); }
    });
    list.appendChild(card);
  });
}

$('btnNew').addEventListener('click', () => {
  const nom = prompt('Nom du projet ?', 'Nouveau projet');
  if (nom === null) return;
  const client = prompt('Nom du client ?', '') || '';
  currentProject = upsertProject(createProject(nom || 'Nouveau projet', client));
  showView('plan');
});

$('importJson').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const p = importProjectJson(text);
    upsertProject(p);
    renderProjects();
    alert('Projet importé.');
  } catch (err) {
    alert('Import impossible : ' + err.message);
  }
  e.target.value = '';
});

function downloadJson(project) {
  const blob = new Blob([exportProjectJson(project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(project.nom || 'projet').replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- plan view ----------
function ensureProject() {
  if (!currentProject) {
    currentProject = upsertProject(createProject());
  }
}

function autosave() {
  if (currentProject) upsertProject(currentProject);
}

function mountPlan() {
  ensureProject();
  $('planProjectName').textContent = currentProject.nom;
  // (re)create editor bound to current project
  $('planCanvas').innerHTML = '';
  editor = createPlanEditor('planCanvas', currentProject, {
    onChange: (proj, total) => { $('totalArea').textContent = total; autosave(); },
  });
  $('totalArea').textContent = editor.getTotal();
}

$('btnAddRoom').addEventListener('click', () => {
  if (!editor) return;
  editor.addRoom({
    nom: $('rNom').value, type: $('rType').value,
    w: $('rW').value, h: $('rH').value,
  });
  $('rNom').value = '';
});
$('btnDelRoom').addEventListener('click', () => editor && editor.deleteSelected());
$('btnZoomIn').addEventListener('click', () => editor && editor.zoom(1.2));
$('btnZoomOut').addEventListener('click', () => editor && editor.zoom(1 / 1.2));
$('btnExportPlan').addEventListener('click', () => {
  if (editor && currentProject) exportPlanPdf(currentProject, editor.getStage());
});

// ---------- ambiance view ----------
function mountAmbiance() {
  ensureProject();
  amb = setupAmbiance({
    roomSel: $('aRoom'), styleSel: $('aStyle'),
    colors: $('aColors'), materials: $('aMaterials'), extra: $('aExtra'),
    image: $('ambImage'), status: $('ambStatus'),
  }, currentProject, { onSave: () => { autosave(); amb.renderGallery($('ambGallery')); } });
  amb.renderGallery($('ambGallery'));
}

$('btnGenerate').addEventListener('click', () => amb && amb.generate());
$('btnRegen').addEventListener('click', () => amb && amb.regenerate());
$('btnSaveAmb').addEventListener('click', () => amb && amb.save());

// ---------- logo branding (stored on project) ----------
// Optional quick logo set: double-click brand logo to upload
document.querySelector('.brand').addEventListener('dblclick', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      $('brandLogo').src = reader.result;
      if (currentProject) { currentProject.logo = reader.result; autosave(); }
      localStorage.setItem('outil_archi_logo', reader.result);
    };
    reader.readAsDataURL(f);
  };
  input.click();
});

// restore global logo
const savedLogo = localStorage.getItem('outil_archi_logo');
if (savedLogo) $('brandLogo').src = savedLogo;

// ---------- boot ----------
showView('accueil');
```

- [ ] **Step 2: Syntax check all JS**

Run: `cd outil-archi && node --check js/app.js`
Expected: exit 0.

- [ ] **Step 3: Manual end-to-end verification**

Start a static server: `cd outil-archi && npx serve` → open the printed URL in a browser.

Checklist (spec §13 success criteria):
- [ ] Accueil: "+ Nouveau projet" → enter name/client → lands on Plan view.
- [ ] Plan: add a room (Salon 4×3) → rectangle appears with walls, name, "12 m²". Total = 12.
- [ ] Drag the room → it snaps to 0.5 m grid on release; total unchanged.
- [ ] Click room → transformer handles appear → resize → m² + total update.
- [ ] "Supprimer sélection" removes the selected room; total updates.
- [ ] "Exporter le plan (PDF)" downloads a landscape PDF with title block + plan image.
- [ ] Double-click the top-left brand area → pick a logo image → logo shows in header and on next PDF.
- [ ] Ambiance: fill room=salon, style=scandinave, colors="beige, vert sauge" → "Générer" → image loads (needs internet); status clears.
- [ ] "Régénérer" produces a different image; "Ajouter au projet" adds a thumbnail to the gallery.
- [ ] Reload the page → Accueil still lists the project with correct piece count (localStorage persisted).
- [ ] Accueil: "Export .json" downloads the project; delete it; "Importer .json" restores it.

Fix any failures by editing the relevant module, then re-run the checklist.

- [ ] **Step 4: Commit**

```bash
git add outil-archi/js/app.js
git commit -m "feat(archi): app router, projects home, wiring, autosave, logo, JSON IO"
```

---

## Task 9: PWA (installable + offline plan)

**Files:**
- Create: `outil-archi/manifest.json`
- Create: `outil-archi/sw.js`
- Create: `outil-archi/js/pwa.js`
- Modify: `outil-archi/index.html` (add pwa.js module)

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "name": "Plans & Ambiances",
  "short_name": "Plans",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2f6f4f",
  "icons": [
    { "src": "https://dummyimage.com/192x192/2f6f4f/ffffff.png&text=P", "sizes": "192x192", "type": "image/png" },
    { "src": "https://dummyimage.com/512x512/2f6f4f/ffffff.png&text=P", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create `sw.js`**

```js
// outil-archi/sw.js
const CACHE = 'outil-archi-v1';
const ASSETS = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/geometry.js', './js/prompt.js', './js/storage.js',
  './js/planEditor.js', './js/ambiance.js', './js/exportPdf.js', './js/pwa.js',
  'https://unpkg.com/konva@9/konva.min.js',
  'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // never cache Pollinations images (always fresh / needs network)
  if (e.request.url.includes('image.pollinations.ai')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached)),
  );
});
```

- [ ] **Step 3: Create `js/pwa.js`**

```js
// outil-archi/js/pwa.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline non disponible */ });
  });
}
```

- [ ] **Step 4: Register pwa.js in `index.html`**

In `outil-archi/index.html`, immediately after the existing
`<script type="module" src="js/app.js"></script>` line, add:

```html
  <script type="module" src="js/pwa.js"></script>
```

- [ ] **Step 5: Manual verification**

Serve via `npx serve` and open in Chrome:
- [ ] DevTools → Application → Service Workers shows `sw.js` activated.
- [ ] DevTools → Application → Manifest shows name "Plans & Ambiances" + install icon in the address bar.
- [ ] Reload, then go offline (DevTools → Network → Offline) → Plan view still loads and works (Ambiance shows "connexion requise").

- [ ] **Step 6: Commit**

```bash
git add outil-archi/manifest.json outil-archi/sw.js outil-archi/js/pwa.js outil-archi/index.html
git commit -m "feat(archi): PWA — installable + offline plan editing"
```

---

## Task 10: README (guide FR) + GitHub Pages deploy

**Files:**
- Create: `outil-archi/README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Plans & Ambiances — outil archi d'intérieur

Outil web gratuit, sans installation. Crée des plans 2D et génère des
ambiances par IA (texte → image). Tout reste dans votre navigateur.

## Utiliser
1. Ouvrez le lien de l'outil (PC ou tablette).
2. **Projets** → « + Nouveau projet ».
3. **Plan 2D** : ajoutez les pièces (nom + dimensions), déplacez/redimensionnez,
   exportez en PDF.
4. **Ambiance** : choisissez pièce + style + couleurs → « Générer » → « Ajouter au projet ».
5. **Logo** : double-cliquez sur le logo en haut à gauche pour charger le vôtre
   (apparaît sur les PDF).
6. **Sauvegarde** : automatique dans le navigateur. Exportez en `.json` pour
   sauvegarder ou passer d'un appareil à l'autre.

⚠️ Les données vivent dans CE navigateur. Videz le cache = perte. Exportez
régulièrement vos projets en `.json`.

## Développement
- Tests : `npm install` puis `npm test`.
- Lancer en local : `npx serve` puis ouvrez l'URL affichée.

## Déploiement (GitHub Pages, gratuit)
1. Créez un repo GitHub, poussez le contenu de `outil-archi/` à la racine.
2. Repo → Settings → Pages → Source: `main` / `/ (root)` → Save.
3. L'URL publique apparaît (ex: `https://user.github.io/repo/`). Donnez-la au client.
````

- [ ] **Step 2: Commit**

```bash
git add outil-archi/README.md
git commit -m "docs(archi): guide FR + GitHub Pages deploy instructions"
```

- [ ] **Step 3: Deploy (when ready)**

Push the branch and enable GitHub Pages per README. Verify the public URL loads
the app and that Plan + Ambiance work end-to-end on it.

---

## Self-Review

**Spec coverage:**
- §3 Module A plan 2D hybride → Task 5 (editor) + Task 8 (saisie form wiring). ✓
- §3 Module B1 ambiance → Task 6 + Task 8. ✓
- §3 Export PDF/PNG + branding → Task 7 + logo in Task 8. ✓
- §3 Sauvegarde locale + import/export json → Task 4 + Task 8. ✓
- §3 PWA + offline → Task 9. ✓
- §5 trois écrans/navigation → Task 1 (HTML) + Task 8 (router). ✓
- §6 cotes, m², surface totale, aimantation, murs, cartouche → Task 5 + Task 7. ✓
- §9 modèle données (pieces/ouvertures/ambiances) → Task 4 createProject. ✓
- §10 erreurs (Pollinations, storage, offline) → Task 6 (img onerror), Task 9 (offline), import try/catch Task 8. ✓
- §11 tests unitaires + checklist manuelle → Tasks 2-4 (unit) + Task 8/9 (manual). ✓
- §12 hébergement GitHub Pages + guide → Task 10. ✓

Gap note: §6 "ouvertures (porte/fenêtre)" markers are in the data model and toolbar mention but NOT implemented in V1 editor code. Decision: deferred to a post-V1 iteration (consistent with "ajustements avec le client après test V1"). The `ouvertures[]` field exists so adding them later needs no migration. The HTML toolbar does not expose a door/window button, so no dead control is shown.

**Placeholder scan:** No TBD/TODO. UI tasks that can't be unit-tested have complete code + explicit manual checklists with exact commands. ✓

**Type consistency:** Project fields `{id,nom,client,date,logo,pieces,ouvertures,ambiances}` consistent across storage.js, planEditor.js, ambiance.js, exportPdf.js, app.js. Piece fields `{id,nom,type,x,y,w,h,couleur}` consistent. Functions referenced across files exist: `newId` (storage→planEditor/ambiance), `totalAreaM2` (geometry→planEditor/exportPdf), `buildPrompt`/`pollinationsUrl` (prompt→ambiance), editor API `{addRoom,deleteSelected,zoom,getStage,getTotal}` matches app.js calls, ambiance API `{generate,regenerate,save,renderGallery}` matches app.js calls. ✓
