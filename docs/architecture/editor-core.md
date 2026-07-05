# Architecture cible — Cœur de l'éditeur de plan (v2)

> Document de référence pour les futurs lots. Objectif : faire évoluer `js/planEditor.js`
> (961 lignes, tout-en-un) vers un cœur modulaire **sans jamais casser l'existant**.
> Chaque étape du plan de migration (§11) est shippable seule, testable, et déployable
> sur GitHub Pages (bump du cache `sw.js` à chaque deploy).
>
> Contraintes dures inchangées : vanilla JS + Konva, statique, 0 €, simple, français.
> **Règle d'or gravée dans le code : ne JAMAIS détruire un nœud Konva au mousedown**
> (commentaire à `planEditor.js:113-115` — la destruction tuait la cible du drag avant
> que Konva ne l'accroche ; c'est ce qui a motivé `syncSelection`).

---

## 0. État des lieux (ce qu'on garde, ce qu'on remplace)

| Existant | Où | Verdict |
|---|---|---|
| Factory `createPlanEditor(containerId, project, {onChange})` | `planEditor.js:33` | Garder la signature publique, restructurer l'intérieur |
| `syncSelection()` — update in place | `planEditor.js:116-166` | **Modèle à généraliser** (§1) |
| `renderRooms()` — destroy-all + rebuild | `planEditor.js:386-396` | À remplacer par la réconciliation (§1) |
| `render()` qui appelle `notify()` | `planEditor.js:398-405` | Piège : rendre ne doit PAS muter l'historique (§2) |
| Undo/redo par snapshots JSON | `planEditor.js:182-215` | Coexiste puis remplacé par les commandes (§2) |
| 4 variables de sélection (`selectedId`, `selectedConsId`, `selectedPoteauId`, `selectedCeilId`) | `planEditor.js:79-82` | Remplacées par `Set{type,id}` (§3) |
| Recréation complète de l'éditeur à chaque `mountPlan()` | `app.js:158-162` | Remplacée par singleton + `loadProject()` (§4) |
| Dualité rect `{x,y,w,h}` / poly `{points}` | `geometry.js:12-20`, `planEditor.js:257 vs 313` | Unifier côté rendu, PAS côté données (§5) |
| `project.fond.image` en base64 dans localStorage | `planEditor.js:678-681`, `app.js:206-213` | Migrer vers IndexedDB (§6) |
| Tailles écran codées en dur (poignées r=7 `planEditor.js:352`, traits 4px `planEditor.js:264`) | partout | Helper `screenSize()` (§7) |
| 8 layers Konva | `planEditor.js:46-61` | Bien, à optimiser `listening`/hit (§8) |
| Géométrie pure déjà testée (58 tests vitest verts) | `tests/geometry.test.js` etc. | Étendre le même pattern (§10) |

---

## 1. Réconciliation complète du rendu

### Problème
Aujourd'hui deux régimes coexistent :

- **Destroy-all** : `renderRooms()` détruit tous les groupes puis reconstruit
  (`planEditor.js:389-393` : `roomLayer.find('.room').forEach((g) => g.destroy())`).
  Idem `renderConstraints()` (`planEditor.js:457-461`, `destroyChildren()`),
  `renderPoteaux()` (`planEditor.js:501-505`), `renderFauxPlafonds()` (`planEditor.js:556-560`).
- **Update in place** : `syncSelection()` retrouve les nœuds existants et ne change
  que stroke/strokeWidth/labels (`planEditor.js:116-166`).

Le destroy-all a trois coûts : (a) il interdit d'appeler render pendant une interaction
(d'où la règle d'or), (b) il jette le hit graph et les caches Konva à chaque frappe,
(c) il force des rustines comme le `renderRooms()` dans `dragend` du polygone
(`planEditor.js:341`) au lieu d'un simple update.

### Cible : un réconciliateur générique par id

Un seul mécanisme pour les 4 familles (pièces, poteaux, faux plafonds, contraintes) :

```js
// js/editor/reconcile.js
// Réconcilie une liste de modèles vers une layer Konva, par id.
// build(model) -> Konva.Group   (création, une seule fois)
// update(group, model)          (mutation in place, à chaque render)
export function reconcile(layer, models, cache, { build, update, name }) {
  const seen = new Set();
  for (const m of models) {
    seen.add(m.id);
    let node = cache.get(m.id);
    if (!node) {
      node = build(m);
      node.id(m.id);
      node.name(name);          // ex. 'room' — les sélecteurs .room continuent de marcher
      cache.set(m.id, node);
      layer.add(node);
    }
    update(node, m);            // position, points, fill, label… TOUJOURS in place
  }
  // suppression : uniquement les nœuds dont le modèle a disparu
  for (const [id, node] of cache) {
    if (!seen.has(id)) { node.destroy(); cache.delete(id); }
  }
  layer.batchDraw();
}
```

Utilisation pour les pièces — on découpe `buildRectRoom` (`planEditor.js:257-310`)
en `build` (création + handlers, inchangés) et `update` (la partie qui aujourd'hui
n'existe qu'éparpillée dans `transformend` `planEditor.js:292-307`) :

```js
const roomCache = new Map();   // id -> Konva.Group

function updateRoom(group, piece) {
  if (piece.points) {
    const poly = group.findOne('.roomPoly');
    poly.points(piece.points.flatMap((p) => [metersToPixels(p.x), metersToPixels(p.y)]));
    const c = polygonCentroid(piece.points);
    group.findOne('Text').position({ x: metersToPixels(c.x) - 60, y: metersToPixels(c.y) - 16 });
  } else {
    group.position({ x: metersToPixels(piece.x), y: metersToPixels(piece.y) });
    const rect = group.findOne('.roomRect');
    rect.size({ width: metersToPixels(piece.w), height: metersToPixels(piece.h) });
  }
  const label = group.findOne('Text');
  label.text(roomLabel(piece));          // roomLabel: planEditor.js:253-255
  group.findOne('.roomRect, .roomPoly').fill(piece.couleur);
}

function renderRooms() {
  reconcile(roomLayer, project.pieces, roomCache,
    { build: buildRoom, update: updateRoom, name: 'room' });
  syncSelection();   // la sélection reste une passe séparée, comme aujourd'hui
}
```

**Précaution drag** : ne jamais écraser la position d'un groupe **en cours de drag**
(sinon le nœud saute sous la souris). Dans `update` :

```js
if (!group.isDragging()) group.position({ ... });
```

C'est la généralisation exacte de la règle d'or : la réconciliation ne détruit rien,
et ne touche pas ce que l'utilisateur tient.

### Étape shippable
Migrer UNE famille (poteaux, la plus simple : `planEditor.js:477-505`), vérifier
drag/sélection/suppression, deployer. Puis contraintes, faux plafonds, pièces en dernier
(les plus riches). `syncSelection` ne change pas : elle lit déjà les nœuds via
`layer.find('.room')` — le cache lui donne juste un accès O(1) en bonus
(`roomCache.get(id)` remplace `roomLayer.findOne(...)` de `planEditor.js:130` et `365`).

---

## 2. Command pattern fin (execute/undo)

### Problème
L'historique actuel snapshote TOUT le projet en JSON à chaque `notify()`
(`pushHistory()` `planEditor.js:193-201`, appelé depuis `notify()` `planEditor.js:177-180`).
Ça marche, mais : 40 snapshots max (`planEditor.js:199`), sérialisation complète à
chaque frappe de flèche, undo = re-render complet (`applySnapshot` `planEditor.js:202-213`),
et impossible de fusionner (10 nudges = 10 entrées). Pire piège : `render()` appelle
`notify()` (`planEditor.js:404`) donc **rendre pousse dans l'historique** — le
command pattern doit couper ce lien.

### Cible

```js
// js/editor/commands.js — logique PURE, testable sans Konva ni DOM
export class MoveRoomCommand {
  constructor(id, from, to) { this.id = id; this.from = from; this.to = to; }
  execute(project) { applyPos(project, this.id, this.to); }
  undo(project)    { applyPos(project, this.id, this.from); }
  // fusion des nudges successifs (flèches, planEditor.js:904-911)
  mergeWith(next) {
    if (next instanceof MoveRoomCommand && next.id === this.id)
      return new MoveRoomCommand(this.id, this.from, next.to);
    return null;
  }
}

function applyPos(project, id, pos) {
  const p = project.pieces.find((x) => x.id === id);
  if (!p) return;
  if (p.points) p.points = pos.points.map((pt) => ({ ...pt }));
  else { p.x = pos.x; p.y = pos.y; }
}
```

```js
// js/editor/history.js
export class History {
  constructor(project, onApply) { this.undoStack = []; this.redoStack = [];
    this.project = project; this.onApply = onApply; }
  run(cmd) {
    cmd.execute(this.project);
    const prev = this.undoStack[this.undoStack.length - 1];
    const merged = prev && prev.mergeWith && prev.mergeWith(cmd);
    if (merged) this.undoStack[this.undoStack.length - 1] = merged;
    else this.undoStack.push(cmd);
    this.redoStack.length = 0;
    this.onApply();                 // -> render() + emit('change'), JAMAIS pushHistory
  }
  undo() { const c = this.undoStack.pop(); if (c) { c.undo(this.project); this.redoStack.push(c); this.onApply(); } }
  redo() { const c = this.redoStack.pop(); if (c) { c.execute(this.project); this.undoStack.push(c); this.onApply(); } }
}
```

Jeu de commandes minimal (couvre tout ce que fait `notify()` aujourd'hui) :
`AddItem` / `DeleteItem` / `MoveItem` / `ResizeRect` (transformend `planEditor.js:292-307`) /
`SetPoints` (drag de sommet `planEditor.js:355-369`, suppression de sommet `planEditor.js:371-376`) /
`SetProp` (renommage `planEditor.js:381-384`, hauteur faux plafond `planEditor.js:542-545`,
couleur future) / `SetFond` (calage d'échelle `planEditor.js:712-735`).
`AddItem(type, data)` et `DeleteItem(type, id)` sont génériques sur les 4 collections —
inutile de faire 4×4 classes.

### Coexistence pendant la migration (le point clé)
On ne bascule pas tout d'un coup. Stratégie **wrapper** :

```js
// Pendant la migration : toute mutation NON encore convertie passe par ici.
class LegacySnapshotCommand {
  constructor(before, after) { this.before = before; this.after = after; }
  execute(project) { restore(project, this.after); }
  undo(project)    { restore(project, this.before); }
}

// notify() devient :
function notify() {
  if (!restoring) {
    const after = snapshotState();               // planEditor.js:187-192, inchangé
    if (after !== lastSnapshot) {
      history.recordLegacy(new LegacySnapshotCommand(lastSnapshot, after));
      lastSnapshot = after;
    }
  }
  emit('change', project);                        // §3
}
```

`recordLegacy` pousse sans exécuter (la mutation a déjà eu lieu). Une seule pile,
donc **Ctrl+Z traverse indifféremment** commandes fines et snapshots legacy. Chaque lot
convertit un handler (`dragend` pièce, puis transformend, puis delete…) de
« muter + notify() » vers « history.run(new XCommand(...)) », et le snapshot legacy
disparaît naturellement quand plus personne ne l'emprunte.

**Règle** : `render()` ne doit plus JAMAIS appeler `notify()`. Le flux devient
strictement unidirectionnel : `commande → mutation du modèle → onApply → render + emit`.
Casser le cycle `render→notify→pushHistory` de `planEditor.js:398-405` est le
préalable n°1 (c'est déjà source de doubles entrées : `finishDraw` `planEditor.js:622-637`
pousse via le `notify()` de `render()`).

---

## 3. Sélection unifiée + event emitter

### Problème
4 variables mutuellement exclusives (`planEditor.js:79-82`), remises à zéro à la main
dans CHAQUE handler de clic (`planEditor.js:427`, `489`, `539`, `748` — 4 copies du même
reset). `deleteSelected` (`planEditor.js:770-786`), `duplicateSelected`
(`planEditor.js:842-868`) et `nudgeSelected` (`planEditor.js:870-889`) sont chacun un
if/else en 4 branches quasi identiques. Toute future multi-sélection est impossible.
Et la sidebar est couplée par le callback unique `onChange` (`app.js:161`).

### Cible

```js
// js/editor/selection.js
export class Selection {
  constructor(emit) { this.items = new Set(); this.emit = emit; }  // 'room:abc', 'poteau:x'
  key(type, id) { return `${type}:${id}`; }
  set(type, id) { this.items.clear(); this.items.add(this.key(type, id)); this.emit('selection', this.list()); }
  add(type, id) { this.items.add(this.key(type, id)); this.emit('selection', this.list()); }  // futur shift-clic
  clear()       { if (this.items.size) { this.items.clear(); this.emit('selection', []); } }
  has(type, id) { return this.items.has(this.key(type, id)); }
  list() { return [...this.items].map((k) => { const [type, id] = k.split(':'); return { type, id }; }); }
}
```

Les opérations génériques remplacent les if/else 4 branches par une table :

```js
const COLLECTIONS = {
  room:       { list: (p) => p.pieces,       render: renderRooms },
  poteau:     { list: (p) => p.poteaux,      render: renderPoteaux },
  fauxplafond:{ list: (p) => p.fauxPlafonds, render: renderFauxPlafonds },
  contrainte: { list: (p) => p.contraintes,  render: renderConstraints },
};

function deleteSelected() {
  for (const { type, id } of selection.list())
    history.run(new DeleteItem(type, id));       // §2
}
```

### Event emitter (découplage sidebar)

Un micro-emitter maison (20 lignes, pas de lib) :

```js
// js/editor/emitter.js
export function createEmitter() {
  const subs = new Map();
  return {
    on(evt, fn) { (subs.get(evt) || subs.set(evt, new Set()).get(evt)).add(fn); return () => subs.get(evt).delete(fn); },
    emit(evt, data) { (subs.get(evt) || []).forEach((fn) => fn(data)); },
  };
}
```

Événements : `change` (modèle modifié → autosave + checks), `selection` (→ panneau
propriétés futur, bouton Supprimer grisé/actif), `mode` (`draw:room`, `draw:fauxplafond`,
`calibrate`, `idle` → état visible des boutons, curseur — quick win « mode actif visible »
de l'audit). Côté `app.js`, l'actuel
`onChange: (proj, total) => { $('totalArea')...; autosave(); renderChecks(); }` (`app.js:161`)
devient :

```js
editor.on('change', (proj) => { $('totalArea').textContent = editor.getTotal(); autosave(); renderChecks(); });
editor.on('selection', (items) => updateSidebarSelection(items));
editor.on('mode', (m) => document.querySelectorAll('[data-mode]').forEach(
  (b) => b.classList.toggle('active', b.dataset.mode === m)));
```

**Compat** : `onChange` reste supporté pendant la migration — dans la factory,
`if (onChange) emitter.on('change', (p) => onChange(p, totalAreaM2(p.pieces)));`.
Zéro changement forcé côté app.js au lot 1.

---

## 4. Éditeur singleton + `loadProject()` + cycle de vie

### Problème
`mountPlan()` détruit et recrée TOUT l'éditeur à chaque passage sur l'onglet Plan
(`app.js:158-162`), y compris stage, 8 layers, grille, listeners. Le `destroy()`
existant (`planEditor.js:924-929`) évite la fuite mais on paye une reconstruction
complète pour un simple changement d'onglet, on perd zoom/pan, et l'état UI
(toggles ORTHO/OSNAP) doit être réappliqué à la main (`app.js:164-165`).

### Cible

```js
// js/editor/index.js
let instance = null;

export function getEditor(containerId, opts) {
  if (!instance) instance = createPlanEditor(containerId, opts);   // SANS project
  return instance;
}

// Dans l'éditeur :
function loadProject(project) {
  cancelDraw(); endCalibrate();
  selection.clear();
  history.reset(project);
  // vider les caches de réconciliation (les nœuds appartiennent à l'ancien projet)
  for (const cache of [roomCache, poteauCache, ceilCache, consCache]) {
    cache.forEach((n) => n.destroy());
    cache.clear();
  }
  state.project = project;
  renderFond();                       // async, planEditor.js:655-676
  renderAll();
  fitToContent();                     // planEditor.js:826-839
  emit('project', project);
}
```

`mountPlan()` (`app.js:153-175`) devient :

```js
function mountPlan() {
  ensureProject();
  const ed = getEditor('planCanvas', { /* pas de project ici */ });
  if (ed.currentProjectId() !== currentProject.id) ed.loadProject(currentProject);
  ed.resize();     // le ResizeObserver planEditor.js:916-922 couvre déjà le cas courant
}
```

Cycle de vie propre :
- **create** (1 fois) : stage, layers, grille, listeners clavier/wheel/ResizeObserver.
- **loadProject** (à chaque ouverture) : purge caches + history + selection, re-render.
- **destroy** (jamais en pratique, mais gardé pour les tests) : l'actuel
  `planEditor.js:924-929` + purge des caches + `emitter` vidé.

**Piège actuel à corriger au passage** : le project est capturé par closure partout
(`project.pieces` dans 30 fonctions). Passer à `state.project` (un seul point de
mutation) est mécanique : rechercher/remplacer `project.` → `state.project.` dans le
module. C'est la SEULE façon de rendre `loadProject()` sûr — sinon les vieux handlers
mutent l'ancien objet.

---

## 5. Unification rect → polygone

### Problème
Deux formes de pièce : rect `{x,y,w,h}` (`buildRectRoom` `planEditor.js:257-310`,
transformer + snapping voisins `settlePosition` `planEditor.js:240-251`) et polygone
`{points}` (`buildPolyRoom` `planEditor.js:313-345`, poignées de sommets). Le test
`piece.points ? ... : ...` est répandu partout : `planEditor.js:127`, `392`, `847`, `873`,
`geometry.js:13`, `geometry.js:98`. Chaque nouvelle feature (rotation, couleur, portes)
se code deux fois.

### Décision : polygone = représentation canonique, rect = contrainte

**On ne supprime PAS `{x,y,w,h}` des données stockées** (rétro-compat des projets
localStorage + JSON exportés). On ajoute une couche de lecture unique — qui existe
déjà : `roomPolygon(room)` (`geometry.js:12-20`) normalise déjà les deux formes.
La v2 généralise ce principe au rendu :

```js
// Une pièce a un "shapeKind" dérivé, pas stocké :
const isRect = (p) => !p.points;

// Rendu UNIFIÉ : toujours une Konva.Line fermée construite via roomPolygon()
function updateRoom(group, piece) {
  const pts = roomPolygon(piece);   // geometry.js:12 — déjà la source de vérité
  group.findOne('.roomShape').points(pts.flatMap((p) => [metersToPixels(p.x), metersToPixels(p.y)]));
  // ...
}
```

Un seul `buildRoom`, une seule `Konva.Line` nommée `.roomShape` (au lieu de
`.roomRect`/`.roomPoly`). Ce qui reste conditionnel, c'est **l'outillage** :
- pièce rect → Transformer 4 poignées + `settlePosition` (aimantation/anti-chevauchement,
  `geometry.js:150-195`) ;
- pièce poly → poignées de sommets (`addVertexHandles` `planEditor.js:349-379`).

Un redimensionnement de rect met à jour `w/h` ; l'édition d'un sommet sur un rect le
**convertit** en poly (one-way, avec confirmation implicite : c'est le geste qui le dit).

### Migration des données existantes
Aucune migration destructive nécessaire — `roomPolygon` absorbe les deux formats.
Si un jour on veut vraiment stocker `points` partout, ce sera une migration de schéma
versionnée (§6) :

```js
// migration v1 -> v2 (optionnelle, PAS au premier lot)
p.pieces = p.pieces.map((r) => r.points ? r : {
  ...r, points: roomPolygon(r), rect: true,   // rect:true garde l'outillage rectangle
});
```

Le flag `rect: true` préserve le comportement « rectangle contraint » (transformer,
aimantation d'arêtes) même en représentation points.

---

## 6. Persistance : IndexedDB pour les images, schéma versionné

### Problème
Tout le projet — y compris `project.fond.image` en base64 (`planEditor.js:679`) et
`project.logo` (`app.js:352`) et les ambiances — vit dans UNE clé localStorage
`outil_archi_projets_v1` (`storage.js:2`), sérialisée en entier à chaque autosave
(`app.js:117-126`, débounce 400 ms). localStorage plafonne à ~5 Mo : deux fonds de plan
scannés et c'est le `QUOTA` (`storage.js:17-21`, `handleQuota` `app.js:107-111`).
Symptôme secondaire : l'historique undo doit exclure le fond (`planEditor.js:186-192`).

### Cible : localStorage = données légères, IndexedDB = blobs

```js
// js/imageStore.js — wrapper IndexedDB minimal, sans lib
const DB = 'outil-archi', STORE = 'images';
function openDb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
export async function putImage(id, blob) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
export async function getImage(id) { /* symétrique, get(id) -> Blob|undefined */ }
export async function deleteImage(id) { /* delete(id) */ }
```

Le modèle stocke une **référence** :

```js
// avant : project.fond = { image: 'data:image/png;base64,....' (2 Mo), scale, x, y, ... }
// après : project.fond = { imageId: 'img-uuid', scale, x, y, opacity, locked }
```

`setFond` (`planEditor.js:678-681`) devient async : `putImage(newId(), blob)` puis
mutation du modèle. `renderFond` (`planEditor.js:655-676`) fait
`getImage(f.imageId)` → `URL.createObjectURL(blob)` → `img.src` (et
`revokeObjectURL` dans `img.onload`). Stocker le **Blob** d'origine, pas le dataURL :
~33 % plus compact et zéro encodage.

### Schéma versionné + migrations

```js
// storage.js
const SCHEMA_VERSION = 2;

const MIGRATIONS = {
  // v1 -> v2 : fond base64 -> IndexedDB (async, à l'ouverture du projet)
  2: async (p) => {
    if (p.fond && p.fond.image) {
      const id = newId();
      await putImage(id, dataUrlToBlob(p.fond.image));
      p.fond = { ...p.fond, imageId: id };
      delete p.fond.image;
    }
    return p;
  },
};

export async function migrateProject(p) {
  let v = p.schemaVersion || 1;
  while (v < SCHEMA_VERSION) { v++; if (MIGRATIONS[v]) p = await MIGRATIONS[v](p); p.schemaVersion = v; }
  return p;
}
```

Points d'entrée des migrations : ouverture d'un projet (`card.querySelector('.open')`
`app.js:51`) et import JSON (`importProjectJson` `storage.js:49-61` — qui normalise
déjà les collections manquantes, `storage.js:55-59` : même philosophie, formalisée).
La migration est **lazy par projet**, pas globale au boot : pas de gel de l'UI si la
cliente a 15 projets.

**Export/import JSON** (portabilité cross-machine, `HANDOFF.md`) : l'export inline
à nouveau l'image (`getImage` → dataURL dans le JSON) pour rester un fichier unique
autoporteur ; l'import refait le chemin inverse. La clé localStorage reste
`outil_archi_projets_v1` (`storage.js:2`) — c'est `schemaVersion` DANS le projet qui
versionne, pas le nom de la clé.

---

## 7. Helper screen-size (compensation du zoom)

### Problème
Le zoom scale le stage entier (`zoomAt` `planEditor.js:795-802`, clamp 0.25–4). À
zoom 4, une poignée de sommet r=7 (`planEditor.js:352`) fait 28 px — énorme ; à 0.25
elle fait 1,75 px — inattrapable. Idem strokes 4-5 px (`planEditor.js:123`, `264`),
seuils de snap 0.25-0.3 m (`planEditor.js:223`, `361`, tolérance de fermeture
`planEditor.js:581`), et le label live du HUD (`planEditor.js:64-74`).

### Cible

```js
// js/editor/screen.js
// px "écran" -> px "monde" : divise par le zoom courant.
export const screenPx = (stage, px) => px / stage.scaleX();
// mètres "monde" équivalant à px écran (pour les seuils de snap)
export const screenMeters = (stage, px) => pixelsToMeters(px / stage.scaleX());
```

Usages :

```js
// poignée de sommet à taille écran constante (remplace radius: 7, planEditor.js:352)
new Konva.Circle({ radius: screenPx(stage, 7), strokeWidth: screenPx(stage, 2), ... });

// seuil OSNAP : 12 px écran quel que soit le zoom (remplace 0.3 m fixe, planEditor.js:223)
snapToVertices(pt, allVertices(), screenMeters(stage, 12));

// fermeture du polygone (remplace 0.25 m, planEditor.js:581)
Math.hypot(...) < screenMeters(stage, 12)
```

Après chaque changement de zoom (`zoomAt`, `fitToContent`), re-appliquer aux nœuds
« taille écran » — la réconciliation (§1) le rend trivial :

```js
function onZoomChanged() {
  roomLayer.find('.vhandle').forEach((h) => {
    h.radius(screenPx(stage, 7)); h.strokeWidth(screenPx(stage, 2));
  });
  emit('zoom', stage.scaleX());
}
```

Alternative Konva à connaître : `strokeScaleEnabled(false)` sur une shape garde le
trait à épaisseur écran constante sans recalcul — parfait pour les strokes des pièces
(`planEditor.js:264`, `318`) ; insuffisant pour les rayons et les seuils, d'où le helper.
Le HUD (`hudLayer` `planEditor.js:53`) peut au choix rester dans le stage avec
compensation, ou (plus simple) devenir un `<div>` HTML positionné au-dessus du canvas —
il est déjà `listening: false`.

---

## 8. Couches Konva & performance

### Existant (bon socle)
8 layers dans le bon ordre z (`planEditor.js:46-61`) : bg → grid → rooms → ceil →
poteaux → cons → draw → hud. `drawLayer` et `hudLayer` déjà `listening: false`
(`planEditor.js:52-53`). `batchDraw` utilisé dans les chemins chauds
(`syncSelection` `planEditor.js:136`, dragmove sommets `planEditor.js:367`).

### Règles v2

1. **Layers non interactifs = jamais dans le hit graph.**
   `gridLayer` et `bgLayer` doivent être `listening: false` par défaut — la grille de
   4800 lignes (`drawGrid` `planEditor.js:168-175` : 2×~96 `Konva.Line` sur 2400 px)
   participe aujourd'hui au hit-testing pour rien. Le fond ne redevient `listening: true`
   que pendant le drag du fond ou la calibration.

2. **Grille en une seule shape.** Remplacer les ~192 `Konva.Line` par une
   `Konva.Shape` avec un seul `sceneFunc` qui trace toutes les lignes dans un même
   path — 1 nœud au lieu de 192, et un hit graph vide :

   ```js
   const grid = new Konva.Shape({
     listening: false,
     sceneFunc(ctx, shape) {
       const step = metersToPixels(GRID_M), max = 2400;
       ctx.beginPath();
       for (let x = 0; x <= max; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, max); }
       for (let y = 0; y <= max; y += step) { ctx.moveTo(0, y); ctx.lineTo(max, y); }
       ctx.setAttr('strokeStyle', '#eee'); ctx.setAttr('lineWidth', 1); ctx.stroke();
     },
   });
   ```

3. **`batchDraw()` partout, `draw()` nulle part** dans les handlers. Il reste des
   `draw()` synchrones dans des chemins chauds : `renderRooms` (`planEditor.js:394`),
   dragend (`planEditor.js:284`), `highlightConstraints` (`planEditor.js:454`).
   `batchDraw` coalesce sur requestAnimationFrame — c'est toujours le bon choix ici.

4. **Textes non interactifs** : labels de pièces, cotes, labels de poteaux →
   `listening: false` à la création (le clic doit toucher la shape, pas le texte —
   aujourd'hui le texte intercepte des hits pour rien).

5. **Pendant un drag de sommet, ne redessiner que roomLayer** — c'est déjà le cas
   (`planEditor.js:367`) ; la réconciliation ne doit pas régresser là-dessus.

6. **Limite Konva : ≤ 8-10 layers** (chaque layer = un `<canvas>`). On y est (8).
   Toute nouvelle « couche » métier (cotations, mobilier futur) sera un `Konva.Group`
   DANS une layer existante, pas une layer de plus.

7. **Fusion candidate** : `ceilLayer`, `poteauLayer`, `consLayer` peuvent devenir des
   Groups d'une même layer « annotations » (leur z-ordre relatif est préservé par
   l'ordre des groups). Gain : 2 canvas de moins. À faire seulement si un profil
   montre que c'est utile — pas prioritaire.

---

## 9. Structure de fichiers cible

Modules ES sans build (comme aujourd'hui : `import` natifs, `planEditor.js:2-7`).

```
js/
├── app.js                    # bootstrap UI + routing (maigrit, garde les listeners DOM)
├── storage.js                # localStorage + schéma versionné + migrations (§6)
├── imageStore.js             # IndexedDB blobs (§6)
├── geometry.js               # INCHANGÉ — pur, déjà testé
├── checks.js                 # INCHANGÉ
├── editor/
│   ├── index.js              # getEditor() singleton + factory + API publique (§4)
│   ├── state.js              # { project, mode, ortho, vsnap } + accès unique
│   ├── emitter.js            # createEmitter (§3)
│   ├── selection.js          # Selection Set{type,id} (§3)
│   ├── history.js            # History (piles undo/redo) (§2)
│   ├── commands.js           # commandes pures : AddItem, MoveItem, SetPoints… (§2)
│   ├── reconcile.js          # réconciliateur générique par id (§1)
│   ├── screen.js             # screenPx / screenMeters (§7)
│   ├── layers.js             # création stage + layers + grille + zoom/pan/fit
│   ├── shapes/
│   │   ├── room.js           # buildRoom / updateRoom (+ transformer, poignées)
│   │   ├── poteau.js         # buildPoteau / updatePoteau
│   │   ├── fauxPlafond.js    # buildFauxPlafond / updateFauxPlafond
│   │   └── constraint.js     # buildConstraint / updateConstraint + CONSTRAINT_DEFS
│   ├── tools/
│   │   ├── draw.js           # polyline AutoCAD (startDraw/placeDrawPoint/finishDraw,
│   │   │                     #   planEditor.js:563-652)
│   │   ├── calibrate.js      # calage d'échelle 2 points (planEditor.js:699-742)
│   │   └── keyboard.js       # dispatcher clavier unique (fusionne onGlobalKey
│   │                         #   planEditor.js:892-913 et onDrawKey planEditor.js:614-620)
│   └── fond.js               # fond de plan (renderFond/setFond/opacity/lock)
```

Découpage guidé par un principe : **`commands.js`, `selection.js`, `history.js`,
`reconcile.js`, `screen.js` n'importent NI Konva NI le DOM** → testables en vitest pur
(§10). `shapes/` et `tools/` sont la seule zone Konva.

`planEditor.js` reste en place pendant toute la migration et devient un simple
ré-export à la fin (`export { createPlanEditor } from './editor/index.js';`) pour que
`app.js:6` ne change jamais. PWA : chaque nouveau module doit être ajouté au manifest
de cache de `sw.js` (et bump `outil-archi-vN`).

---

## 10. Stratégie de tests

### Ce qui marche déjà
58 tests vitest verts sur les modules purs : `tests/geometry.test.js`,
`tests/checks.test.js`, `tests/storage.test.js`, `tests/prompt.test.js`. Zéro test sur
`planEditor.js` — normal, tout y est couplé à Konva/DOM.

### Principe v2 : la logique sort, Konva reste mince
Chaque module de la zone pure (§9) reçoit son fichier de test :

| Module | Tests types |
|---|---|
| `commands.js` | `execute` puis `undo` = état initial (round-trip) ; `mergeWith` fusionne les nudges ; commandes sur id inexistant = no-op |
| `history.js` | run/undo/redo ; redoStack vidée après run ; coexistence LegacySnapshotCommand |
| `selection.js` | set/add/clear/has ; émission `selection` uniquement sur changement réel |
| `reconcile.js` | avec un **faux layer** (voir ci-dessous) : create/update/delete ; pas de destroy sur les ids conservés ; pas de reposition d'un nœud `isDragging()` |
| `storage.js` migrations | projet v1 avec `fond.image` → v2 avec `imageId` (mocker `putImage`) ; idempotence (migrer 2× = même résultat) |
| `screen.js` | screenPx(stage 2×, 7) = 3.5 ; symétrie screenMeters |

Le réconciliateur se teste sans Konva parce qu'il ne dépend que d'une interface :

```js
// tests/reconcile.test.js
function fakeNode(id) {
  return { _id: id, id: (v) => v === undefined ? id : (id = v), name: () => {},
    destroy: vi.fn(), isDragging: () => false };
}
const fakeLayer = { add: vi.fn(), batchDraw: vi.fn() };

it('détruit uniquement les nœuds orphelins', () => {
  const cache = new Map([['a', fakeNode('a')], ['b', fakeNode('b')]]);
  reconcile(fakeLayer, [{ id: 'a' }], cache, { build: fakeNode, update: () => {}, name: 'x' });
  expect(cache.has('b')).toBe(false);
  expect(cache.get('a').destroy).not.toHaveBeenCalled();
});
```

En plus, extraire de `planEditor.js` la logique aujourd'hui piégée dans les handlers,
vers `geometry.js` ou `commands.js` pures :
- `settlePosition` (`planEditor.js:240-251`) → fonction pure `(piece, pos, others)` testable ;
- la translation-avec-snap du polygone (`planEditor.js:336-340`) ;
- `contentBounds` (`planEditor.js:814-825`) → pure sur le projet ;
- la fermeture de polyline (« clic près du 1er sommet », `planEditor.js:579-582`).

Les tests d'intégration Konva (smoke : monter un éditeur, ajouter une pièce, drag
simulé) restent **hors scope vitest** — c'est le rôle de la checklist QA manuelle avant
deploy, comme aujourd'hui. Ne pas investir dans jsdom+canvas-mock : coût élevé,
confiance faible.

---

## 11. Ordre de migration recommandé

Chaque lot est shippable, testé, déployé (bump `sw.js`) avant le suivant.
L'ordre minimise les risques : on pose l'infrastructure invisible d'abord, on touche
les interactions utilisateur en dernier.

**Lot A — Emitter + sélection unifiée (petit, sans risque visuel)**
`emitter.js`, `selection.js`. Les 4 variables `selectedId/ConsId/PoteauId/CeilId`
deviennent des façades lisant `selection` (getter), les handlers de clic appellent
`selection.set(type, id)`. `syncSelection` inchangée. `onChange` maintenu via le pont §3.
*Test de sortie : sélection/désélection/suppression identiques à avant.*

**Lot B — Éditeur singleton + loadProject + state.project**
`getEditor()`, `loadProject()`, remplacement de la closure `project` par `state.project`.
`mountPlan()` simplifié (`app.js:153-175`). Le zoom/pan survit au changement d'onglet
(amélioration visible gratuite).
*Test de sortie : ouvrir projet A, dessiner, ouvrir projet B, revenir à A — aucun mélange.*

**Lot C — Réconciliation du rendu**
`reconcile.js` + migration famille par famille : poteaux → contraintes → faux plafonds
→ pièces. Un deploy par famille si besoin.
*Test de sortie : drag pendant re-render impossible à casser ; perfs dessin identiques ou meilleures.*

**Lot D — Command pattern (coexistence)**
`history.js` + `LegacySnapshotCommand` + coupure du lien `render()→notify()`
(`planEditor.js:404`). Puis conversion handler par handler : delete → add → move/nudge
(avec merge) → resize → sommets → props. Les snapshots legacy disparaissent d'eux-mêmes.
*Test de sortie : Ctrl+Z/Y traverse un mix d'actions converties et legacy sans trou.*

**Lot E — Screen-size helper**
`screen.js` + application aux poignées, seuils de snap, strokes
(`strokeScaleEnabled(false)`). Dépend de C (la réconciliation propage le re-calcul au zoom).
*Test de sortie : poignées attrapables à zoom 0.25 et 4.*

**Lot F — IndexedDB + schéma versionné**
`imageStore.js`, `schemaVersion`, migration v1→v2 du fond, export JSON autoporteur.
Le plus risqué pour les données → il vient après stabilisation du cœur, et il exige
un test manuel d'import d'un vieux JSON.
*Test de sortie : projet v1 avec fond s'ouvre, se sauve en v2, s'exporte/réimporte ; quota disparu.*

**Lot G — Unification rect→poly (rendu d'abord)**
`buildRoom` unique via `roomPolygon()`. Les données ne bougent pas. La conversion
rect→points stockée (`rect: true`) seulement si un besoin concret l'exige (rotation,
portes sur murs).
*Test de sortie : les 2 types de pièces se comportent exactement comme avant.*

**Lot H — Optimisations layers (§8)**
Grille en sceneFunc, `listening: false` sur grid/bg/labels, audit des `draw()` restants.
Peut se glisser n'importe quand après C ; en dernier car c'est du confort.

Dépendances : A → B → C → D ; E après C ; F indépendant (après B) ; G après C ; H après C.

---

## 12. Pièges connus (à relire avant chaque lot)

1. **Ne JAMAIS détruire un nœud Konva au mousedown** (ni pendant un drag).
   Historique : la destruction/reconstruction au mousedown tuait la cible du drag avant
   que Konva ne la capture — les pièces étaient devenues indraggables. C'est l'origine de
   `syncSelection` (`planEditor.js:113-115`). Corollaires v2 : le réconciliateur ne
   détruit que les orphelins, et `update` ne repositionne pas un nœud `isDragging()`.

2. **`render()` ne doit pas alimenter l'historique.** Aujourd'hui `render()` appelle
   `notify()` (`planEditor.js:404`) qui `pushHistory()`. Le lot D coupe ce lien ; d'ici
   là, tout nouveau code doit appeler `notify()` explicitement après mutation, jamais
   compter sur `render()`.

3. **Le fond de plan est async.** `renderFond` charge l'image dans `img.onload`
   (`planEditor.js:660-674`) : `bgNode` est `null` entre-temps. Toute logique qui touche
   `bgNode` (calibration `planEditor.js:723`, opacité `planEditor.js:686`) doit tolérer
   `null`. Avec IndexedDB (lot F) la fenêtre async s'allonge — garder ce réflexe.

4. **`snapToVertices` retourne l'objet candidat par référence… ou pas.** Elle renvoie
   une COPIE `{x: best.x, y: best.y}` (`geometry.js:131`), mais `snappedPointer` teste
   l'identité `snapped !== pt` (`planEditor.js:224`) pour savoir si un snap a eu lieu —
   fragile. Et `addVertexHandles` filtre les candidats par identité de référence
   (`!piece.points.includes(v)`, `planEditor.js:360`) : ça casse si on clone les points
   (undo, commandes). Le lot D doit remplacer ces tests d'identité par des comparaisons
   par valeur/id.

5. **Les événements de clic bubblent différemment selon la famille.** Les pièces rect
   ne font PAS `cancelBubble` (`planEditor.js:272`) alors que poly/poteaux/contraintes/
   plafonds le font (`planEditor.js:327`, `426`, `488`, `538`). Le clic sur une pièce
   rect atteint donc le stage — ça marche par accident parce que `e.target !== stage`
   (`planEditor.js:103`). Uniformiser au lot A.

6. **Ctrl+Z global vs champs de saisie.** Les deux handlers clavier filtrent
   INPUT/TEXTAREA/SELECT (`planEditor.js:894`, `615`) — le futur dispatcher unique
   (`tools/keyboard.js`) doit conserver ce filtre ET le test « vue plan active »
   (`planEditor.js:895`), sinon Ctrl+Z annule le plan pendant qu'on tape un nom de projet.

7. **`window.prompt` bloque la boucle d'événements Konva.** La calibration ouvre un
   prompt en plein flux de clic (`planEditor.js:720`) ; pendant ce temps aucun
   mouseup n'arrive au stage. Les remplacements des prompts (audit, lot « moyens »)
   devront être des dialogues non bloquants — et donc les commandes associées devront
   être async-safe (la commande ne se crée qu'à la validation du dialogue).

8. **Quota localStorage pendant un drag.** L'autosave débouncé (`app.js:117-126`)
   peut lever `QUOTA` en plein milieu d'une interaction — `saveNow` catch déjà
   (`app.js:118-122`). Ne jamais laisser une exception de persistance remonter dans un
   handler Konva. Le lot F réduit le risque à presque zéro, mais le catch reste.

9. **Deux formats de pièce dans TOUTES les données du monde réel.** Les projets de la
   cliente contiennent déjà des rect ET des poly. Tout code v2 doit passer par
   `roomPolygon()` (`geometry.js:12`) pour lire une géométrie de pièce — jamais
   `p.x/p.w` directement (sauf outillage spécifique rect).

10. **PWA : le cache sert l'ancien code.** Chaque lot déployé DOIT bumper
    `outil-archi-vN` dans `sw.js`, sinon la cliente teste l'ancienne version et les
    modules ES mi-anciens mi-nouveaux peuvent se mélanger (import d'un module caché
    v(N-1) par un module frais vN = bugs impossibles à reproduire en local).

11. **Le Transformer vit dans roomLayer** (`planEditor.js:76-77`) et est remis à zéro
    par `syncSelection`/`renderRooms` (`planEditor.js:118`, `387`). Lors de la
    réconciliation (lot C), veiller à ce que `transformer.nodes([rect])` soit rebranché
    APRÈS chaque update du rect sélectionné — un Transformer pointant sur un nœud
    détruit jette des erreurs silencieuses de hit-testing.

12. **`history` snapshots excluent `project.fond`** (`planEditor.js:186-192`) : un
    undo ne restaure donc jamais le fond. Comportement voulu (mémoire), à préserver dans
    les commandes : `SetFond` est une commande NON undoable ou à undo léger (position/
    scale seulement, jamais l'image).
