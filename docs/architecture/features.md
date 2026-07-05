# Blueprints des fonctionnalités métier — Outil Plans & Ambiances

> Document d'architecture produit + technique. Chaque feature est spécifiée pour être
> implémentée plus tard **sans re-réfléchir** : modèle de données JSON exact, interactions,
> rendu Konva, cas limites, impact export PDF, effort.
>
> Contraintes dures rappelées : **vanilla JS + Konva, statique GitHub Pages, 0 € récurrent,
> utilisable par une non-technicienne, tout en français.**
>
> Fichiers de référence : `js/planEditor.js` (éditeur), `js/geometry.js` (géométrie pure testée),
> `js/exportPdf.js` (export), `js/storage.js` (localStorage + JSON), `docs/AUDIT-INTERACTIONS.md` (audit).

---

## 0. Socle commun — règles à respecter pour TOUTE nouvelle feature

Ces règles découlent des mécanismes déjà en place dans `planEditor.js`. Elles sont
obligatoires : les oublier casse l'undo, l'autosave ou l'export.

### 0.1 Checklist d'intégration d'une nouvelle collection `project.xxx`

Quand une feature ajoute un tableau au projet (ex. `project.ouvertures`), il faut le brancher à **8 endroits** :

| # | Point de branchement | Fichier | Pourquoi |
|---|---|---|---|
| 1 | `snapshotState()` + `applySnapshot()` | planEditor.js | sinon undo/redo perd/écrase la collection |
| 2 | `deleteSelected()` | planEditor.js | Suppr doit marcher |
| 3 | `duplicateSelected()` | planEditor.js | Ctrl+D doit marcher |
| 4 | `nudgeSelected()` | planEditor.js | flèches clavier |
| 5 | `contentBounds()` | planEditor.js | sinon fitToContent et l'export à l'échelle ignorent les objets |
| 6 | `setLayerVisible()` (map des calques) | planEditor.js | panneau calques |
| 7 | Initialisation défensive `project.xxx = project.xxx \|\| []` | planEditor.js (haut de `createPlanEditor`) + storage.js | vieux projets JSON sans le champ |
| 8 | `render()` appelle `renderXxx()` | planEditor.js | rendu après import/undo |

Plus : bump du cache PWA `outil-archi-vN` dans `sw.js` à chaque déploiement, et test vitest
sur toute fonction ajoutée à `geometry.js` (les 58 tests existants doivent rester verts).

### 0.2 Règles d'or déjà établies (LOT 1)

- **Ne JAMAIS détruire un nœud Konva au `mousedown`** : la sélection se met à jour *en place*
  via `syncSelection()`. Toute nouvelle famille d'objets suit ce modèle (stroke/handles modifiés
  in place, reconstruction complète seulement dans `renderXxx()`).
- **`notify()` est le point de passage unique** : il pousse l'historique undo + déclenche
  l'autosave débouncé. Toute mutation du projet se termine par `notify()`, jamais par un
  écriture directe dans localStorage.
- **Toutes les données métier sont en MÈTRES**, la conversion px se fait uniquement au rendu
  via `metersToPixels()` / `pixelsToMeters()` (`PX_PER_M = 50`).
- **Un seul objet sélectionné à la fois** aujourd'hui (4 variables `selectedXxxId`). Les features
  de la Vague 2 imposent le préalable « sélection unifiée » (§ 0.3).

### 0.3 Préalables techniques (extraits de l'audit, requis par certaines features)

- **P1 — Sélection unifiée** : remplacer les 4 `selectedXxxId` par
  `const selection = new Set(); // éléments { type: 'piece'|'poteau'|'cons'|'ceil'|'ouverture'|'meuble'|'cote'|'zone'|'cloison', id }`
  avec helpers `select(type,id,{additive})`, `isSelected(type,id)`, `clearSelection()`.
  Requis par : multi-sélection, alignement, menu contextuel riche, panneau propriétés.
- **P2 — Unification rect→polygone** : convertir en interne toute pièce rectangulaire en
  polygone 4 points au moment de l'édition avancée (`roomPolygon()` existe déjà et fait la
  moitié du travail). Requis par : tirer un mur, portes/fenêtres sur pièces rect (sinon double code).
- **P3 — Dispatcher clavier unique** : un seul `keydown` global qui route selon le mode
  (dessin / calibration / normal / saisie longueur). Requis par : saisie de longueur au clavier,
  menu contextuel (Échap), rotation (touches R / + / −).
- **P4 — Éditeur singleton + IndexedDB images** : déjà identifiés dans l'audit ; IndexedDB
  devient bloquant pour les niveaux multiples avec fond de plan par étage (base64 × N étages
  dans localStorage = quota explosé).

### 0.4 Barème d'effort utilisé

- **S** : ≤ 1 jour — **M** : 1 à 3 jours — **L** : 3 à 5 jours — **XL** : > 5 jours.
  (Jours = sessions de travail Claude Code + revue humaine, tests inclus.)

---

## 1. VAGUE 1 — « Plan lisible et pro » (aucun préalable lourd, valeur cliente immédiate)

Objectif de la vague : que la cliente puisse remettre à une pharmacie un plan **coté, à
l'échelle, avec les revêtements de sol**, sans toucher au moteur de dessin. Ordre conseillé :
1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 (le PDF à l'échelle est livré en dernier car il capitalise
sur cotes + zones + légende).

---

### 1.1 Panneau propriétés chiffré + saisie de longueur au clavier

**Objectif utilisateur.** Fini le `window.prompt` et le redimensionnement « à l'œil » : quand
un objet est sélectionné, un panneau latéral affiche ses valeurs (nom, largeur, hauteur,
surface, couleur, position) dans des champs éditables. Pendant le dessin d'un segment, taper
`3.2` + Entrée pose le point exactement à 3,20 m dans la direction du curseur (comme AutoCAD).

**Modèle de données.** Aucun nouveau champ projet (le panneau lit/écrit les objets existants).
Seul ajout : la couleur devient éditable après création →

```json
// pièce existante, champ déjà présent, simplement exposé :
{ "id": "p1", "nom": "Officine", "couleur": "#cfe8ff", "w": 6.5, "h": 4.0, "x": 1, "y": 1 }
```

**Interactions.**
- Souris : sélection d'un objet → le panneau (colonne droite, sous le panneau vigilance) se
  remplit. Champs : nom (text), L (number, pas 0.05), l (number), X, Y, couleur (`<input type=color>` +
  6 pastilles de la palette `ROOM_COLORS`). Pour un polygone : surface (lecture seule,
  `polygonAreaM2`), périmètre, bouton « Renommer ».
- Clavier : `Entrée` dans un champ = appliquer (mutation + `notify()`), `Échap` = restaurer la
  valeur. **Saisie de longueur en mode dessin** : pendant `drawMode`, les touches chiffres/`.`/`,`
  alimentent un mini-buffer affiché dans le HUD (`showLive`) ; `Entrée` pose le point à
  `anchor + direction_normalisée(curseur) × valeur` (respecte ORTHO). `Backspace` corrige le buffer
  avant de dépiler un point.
- Tactile : les champs HTML natifs suffisent (clavier virtuel numérique via `inputmode="decimal"`).

**Rendu Konva.** Aucun nouveau nœud : le panneau est du DOM. La mutation d'un champ appelle
les setters existants (mêmes chemins que `transformend` : maj `piece.w/h` puis `renderRooms()` +
`notify()`). La saisie de longueur réutilise `updateDrawPreview()` et le `hudLayer`.

**Cas limites.**
- Valeur < `GRID_M` → clamp à `GRID_M` avec message dans le champ (bordure rouge 1 s).
- Champ vide / non numérique → ignoré (restaure).
- Redimension d'un rect via panneau → repasser par `settlePosition()` pour interdire le chevauchement.
- Polygone : pas de champs L/l (afficher « forme libre — poignées sur le plan »).
- Saisie longueur avec curseur immobile sur l'ancre (direction nulle) → ne rien poser.
- Conflit avec le dispatcher clavier global : en `drawMode`, `onDrawKey` a la priorité — c'est
  ici qu'on implémente P3 (dispatcher) si pas déjà fait.

**Impact export PDF.** Aucun direct. Indirect : plans plus précis.

**Effort : M** (2 j — dont ½ j pour le buffer de saisie AutoCAD et le dispatcher clavier).

---

### 1.2 Menu contextuel clic droit

**Objectif utilisateur.** Clic droit sur n'importe quel objet → menu en français avec les
actions pertinentes (Renommer, Dupliquer, Supprimer, Couleur, Verrouiller, Monter/Descendre…).
Clic droit sur le vide → actions du plan (Coller ici, Ajuster la vue, Ajouter un marqueur…).
C'est aussi la porte de sortie des `window.prompt`.

**Modèle de données.** Un seul champ nouveau, le verrou :

```json
{ "id": "p1", "verrou": true }   // optionnel sur pieces, poteaux, fauxPlafonds, contraintes, mobilier, zonesSol
```

`verrou: true` ⇒ `draggable(false)`, exclu de Suppr/transformer, petit cadenas 🔒 rendu à côté du label.

**Interactions.**
- Souris : `stage.on('contextmenu')` + `contextmenu` sur chaque groupe (`e.evt.preventDefault()`,
  `e.cancelBubble = true`). Le menu est un `<div id="ctxmenu">` DOM positionné à
  `e.evt.clientX/Y` (clamp aux bords fenêtre). Clic ailleurs, `Échap`, molette, ou action → fermeture.
- Entrées par type :
  - Pièce : Renommer · Couleur ▸ (pastilles) · Dupliquer (Ctrl+D) · Verrouiller/Déverrouiller ·
    Ajouter un sommet (si poly, cf. 2.4) · Supprimer (Suppr)
  - Sommet (vhandle) : Supprimer le sommet (remplace l'actuel `contextmenu` caché sur handle)
  - Marqueur : Modifier le texte · Dupliquer · Supprimer
  - Faux plafond : Hauteur… · Dupliquer · Supprimer
  - Vide : Dessiner une pièce · Ajouter un marqueur ▸ · Ajuster la vue (fitToContent) · Tout désélectionner
- Clavier : navigation ↑/↓ + Entrée dans le menu (accessibilité), `Échap` ferme.
- Tactile : **appui long 500 ms** (timer sur `touchstart`, annulé si `touchmove` > 8 px) ouvre le
  même menu — c'est le socle de la feature iPad (3.2).

**Rendu Konva.** Rien sur le canvas (menu 100 % DOM, stylé dans `styles.css`). Le clic droit
sélectionne d'abord l'objet (`selectRoom` etc.) pour que le menu agisse sur la sélection.

**Cas limites.**
- Clic droit pendant `drawMode`/`calibrating` → ignoré (le mode garde la main), ou mieux :
  « Terminer le tracé / Annuler ».
- Menu ouvert + undo clavier → fermer le menu avant d'appliquer.
- Objet verrouillé : le menu reste le SEUL moyen de le déverrouiller (prévoir l'entrée en tête).
- Deux doigts iPad = zoom, ne doit pas déclencher l'appui long (annuler le timer au 2ᵉ toucher).

**Impact export PDF.** Le cadenas 🔒 ne doit PAS apparaître à l'export : le rendre dans
`hudLayer` (non exporté) ou le masquer avant `stage.toDataURL()` (cf. 1.6, capture hors HUD).

**Effort : M** (2 j, incluant le remplacement des `window.prompt` de renommage par un
mini-formulaire inline dans le menu).

---

### 1.3 Outil cotation (2 points, chaînes, calque coté)

**Objectif utilisateur.** Poser des cotes d'architecte : cliquer 2 points (aimantés OSNAP sur
les coins), la cote s'affiche avec traits d'attache, flèches et texte en mètres. Les cotes
successives posées dans la foulée forment une **chaîne** alignée. Un calque « Cotes »
s'active/désactive d'un clic.

**Modèle de données.**

```json
{
  "cotes": [
    {
      "id": "d_a1b2",
      "a": { "x": 1.0, "y": 1.0 },
      "b": { "x": 5.5, "y": 1.0 },
      "offset": 0.45,
      "chaine": "ch_01",
      "texte": null
    }
  ]
}
```

- `a`, `b` : points cotés (mètres). — `offset` : distance signée (m) entre la ligne AB et la
  ligne de cote (positif = à gauche du vecteur AB). — `chaine` : id partagé par les cotes
  posées en série (null si isolée) ; toutes les cotes d'une chaîne partagent le même `offset`.
- `texte` : surcharge manuelle du texte (null = auto `d.toFixed(2) + ' m'`).

**Interactions.**
- Bouton toolbar « Coter » → mode `drawMode = 'cote'` (réutilise `startDraw`/`snappedPointer`,
  donc OSNAP sur `allVertices()` + grille + ORTHO gratuits). Clic 1 = point A, clic 2 = point B,
  **mouvement puis clic 3 = position de la ligne de cote** (fixe `offset` = distance
  perpendiculaire du curseur à AB, via projection — même maths que `pointSegmentDistance`).
- Après le clic 3, le mode reste actif : le point B devient le A de la cote suivante et
  l'`offset` est hérité → **chaîne**. `Entrée`/`Échap` termine.
- Cote existante : clic = sélection (poignées aux 2 extrémités + poignée milieu pour drag de
  l'`offset`), double-clic sur le texte = éditer `texte`, Suppr = supprimer.
- Clavier : pendant la pose, la saisie de longueur (1.1) est inutile ici ; `Tab` pourrait
  basculer offset gauche/droite (option).
- Tactile : identique au dessin de pièce (taps successifs).

**Rendu Konva.** Nouveau `coteLayer` (au-dessus de `consLayer`, sous `drawLayer`). Par cote,
un `Konva.Group` :
- 2 traits d'attache : de `a` et `b` vers leurs projetés sur la ligne de cote (dépassement 0,08 m).
- Ligne de cote : `Konva.Line` entre les projetés.
- Flèches : 2 `Konva.Line` en « / » à 45° (style archi, pas de pointes pleines), 0,10 m.
- Texte : `Konva.Text` centré au milieu, tourné de l'angle de AB (`rotation` en degrés,
  normalisé pour rester lisible : si angle ∈ ]90°, 270°], ajouter 180°), fond blanc
  (`Konva.Tag`-like ou petit `Rect` blanc derrière) pour rester lisible sur les traits.
- Style : trait 1 px `#444`, texte 11 px. Les cotes ne zooment PAS leur épaisseur ni police :
  appliquer `strokeWidth(1 / stage.scaleX())` et `fontSize(11 / stage.scaleX())` dans un
  handler sur le zoom (sinon illisible dézoomé, énorme zoomé).

Fonctions à ajouter à `geometry.js` (testables vitest) :

```js
projectPointOnLine(pt, a, b)      // → {x,y, t}
perpendicularOffset(pt, a, b)     // → distance signée (m)
dimensionGeometry(cote)           // → { attache1:[p,p'], attache2, ligne:[q1,q2], milieu, angleDeg, longueur }
```

**Cas limites.**
- A = B (double clic au même endroit) → cote refusée (longueur < 0,01 m).
- `offset = 0` → autorisé (cote sur la ligne) mais valeur par défaut 0,4 m si clic 3 quasi sur AB.
- Déplacement d'une pièce ne déplace PAS ses cotes (cotes = annotations indépendantes, choix
  assumé v1 ; une v2 « cotes associatives » ancrerait `a`/`b` sur `{pieceId, vertexIndex}`).
  Afficher les cotes orphelines en orange si plus aucun sommet à < 0,05 m (simple boucle sur
  `allVertices()` au rendu).
- Chaîne : supprimer une cote du milieu ne casse pas les autres (elles sont indépendantes,
  `chaine` ne sert qu'à hériter l'offset à la pose).
- Zoom extrême : cf. compensation d'échelle ci-dessus.

**Impact export PDF.** Majeur et voulu : les cotes sont exportées (calque visible). Le PDF à
l'échelle (1.6) rend les textes de cote à taille papier fixe (compensation déjà en place).
Ajouter une option « Exporter avec/sans cotes » (checkbox) qui toggle `coteLayer.visible()`
le temps de la capture.

**Effort : M** (3 j — la géométrie est simple, le polish du texte tourné + chaîne prend du temps).

---

### 1.4 Zones de sol hachurées + m² par zone

**Objectif utilisateur.** Dessiner des zones de revêtement (parquet, carrelage, béton ciré,
moquette…) par-dessus les pièces, chacune avec un motif hachuré distinct, son étiquette et sa
surface en m². Le panneau latéral affiche le récap métré : « Parquet 42,3 m² · Carrelage 18,0 m² » —
directement utilisable pour un chiffrage.

**Modèle de données.**

```json
{
  "zonesSol": [
    {
      "id": "z_9f3c",
      "points": [ { "x": 1, "y": 1 }, { "x": 5, "y": 1 }, { "x": 5, "y": 4 }, { "x": 1, "y": 4 } ],
      "motif": "parquet",
      "couleur": "#8a5a2b",
      "label": "Parquet chêne 190"
    }
  ]
}
```

`motif` ∈ `"parquet" | "carrelage" | "hachure45" | "quadrillage" | "pointille" | "uni"`.
Surface jamais stockée : toujours `polygonAreaM2(z.points)` (source de vérité unique, comme les pièces).

**Interactions.**
- Bouton « Zone de sol » → `startDraw('zonesol')` : même machine à états que pièce/faux plafond
  (polyligne, ORTHO, OSNAP, clic près du 1er point ou Entrée pour fermer). Après fermeture,
  mini-popover DOM : choix du motif (6 vignettes) + label.
- Raccourci malin : **clic sur une pièce en mode zone = reprendre son contour**
  (`roomPolygon(piece)` copié) — 90 % des zones épousent une pièce, ça évite de redessiner.
- Sélection/drag/Suppr/Ctrl+D/flèches : identiques aux faux plafonds (translation entière,
  delta snappé). Poignées de sommets réutilisant `addVertexHandles` (à factoriser en
  `addVertexHandlesFor(obj, layer, onMove)`).
- Double-clic : réouvrir le popover motif/label.

**Rendu Konva.** Nouveau `solLayer` inséré **entre `bgLayer` et `gridLayer`** ? Non — entre
`roomLayer` et `ceilLayer` serait au-dessus des couleurs de pièces. Décision : **juste
au-dessus de `roomLayer`**, avec `opacity` faible, pour que hachures et étiquettes de pièces
cohabitent. Les motifs = `fillPatternImage` Konva à partir de petits canvas générés en JS
(pas d'assets externes, CSP/offline friendly) :

```js
function motifCanvas(motif, couleur) {  // → HTMLCanvasElement 24×24 px
  // 'hachure45': une diagonale ; 'carrelage': 2 traits en croix ;
  // 'parquet': lignes horizontales + joints décalés ; 'pointille': 1 point ; etc.
}
poly.fillPatternImage(motifCanvas(z.motif, z.couleur));
poly.fillPatternRepeat('repeat');
```

Contour pointillé fin `dash:[4,3]`, étiquette au `polygonCentroid` : `«${label}\n${aire} m²»`.
**Important** : `fillPatternScale({ x: 1/stage.scaleX(), y: 1/stage.scaleY() })` pour que la
densité de hachures reste constante au zoom (sinon moiré).

**Cas limites.**
- Zone à cheval sur 2 pièces : autorisé (c'est une annotation de revêtement, pas une pièce).
- Zones qui se chevauchent : autorisé mais le récap métré compte alors du m² en double →
  afficher un ⚠ dans le récap si `sommeZones > totalAreaM2(pieces) × 1.02`.
- Polygone auto-intersecté (nœud papillon) : `polygonAreaM2` (shoelace) donne une aire fausse ;
  détection simple = tester l'intersection de chaque paire d'arêtes non adjacentes à la
  fermeture, refuser avec message « Le contour se croise ». (Fonction `polygonSelfIntersects()`
  à ajouter à geometry.js + tests — elle resservira pour les pièces.)
- < 3 points → rejeté (déjà le pattern de `finishDraw`).

**Impact export PDF.** Les hachures s'exportent naturellement (elles sont dans le stage).
La **légende auto** de l'export 1.6 liste chaque motif utilisé avec sa vignette et le total m²
par motif. Prévoir `getRecapSols()` dans l'API de l'éditeur : `[{ motif, label, couleur, aireM2 }]`.

**Effort : M** (2–3 j, dont ½ j les motifs canvas et ½ j le récap métré).

---

### 1.5 Guides magnétiques live façon Figma

**Objectif utilisateur.** En déplaçant une pièce/un meuble/un poteau, des lignes rouges
apparaissent quand l'objet s'aligne avec les bords ou centres des autres objets, et l'objet
« colle » à l'alignement. Complète le snap existant (`snapToNeighbors` n'agit qu'au `dragend`
et sans feedback visuel).

**Modèle de données.** Aucun (feature 100 % interaction). Un réglage global optionnel :

```json
{ "prefs": { "guides": true } }
```

**Interactions.**
- Souris : sur `dragmove` de tout objet déplaçable, calculer les guides et **repositionner le
  nœud en cours de drag** (`node.position(...)` dans le handler — pattern Konva standard).
  Seuil d'accroche : 8 px écran (`8 / stage.scaleX()` en px monde → converti en mètres).
- Clavier : maintenir `Alt` pendant le drag désactive temporairement guides + snap grille
  (pose libre au pixel).
- Tactile : identique (le doigt déclenche les mêmes `dragmove`).

**Rendu Konva.** Les guides vivent dans `hudLayer` (non listening, non exporté — parfait).

Algo (fonction pure `geometry.js`, testable) :

```js
// candidates = pour chaque autre objet : xs = [left, centerX, right], ys = [top, centerY, bottom]
// moved     = bbox de l'objet déplacé (via polygonBBox(roomPolygon(p)) — uniforme rect/poly)
computeGuides(movedBBox, otherBBoxes, thrM) // → { dx, dy, guides: [{axis:'x'|'y', at: m, from: m, to: m}] }
```

- On teste les 3 xs de `moved` contre les 3 xs de chaque autre : si |Δ| ≤ seuil, guide candidat.
  On garde le meilleur par axe (plus petit Δ), on applique `dx/dy`, on rend les lignes.
- Rendu : `Konva.Line` rouge `#ff4d6d`, 1 px écran (`strokeWidth(1/scale)`), `dash:[4,4]`,
  s'étendant de l'objet source à l'objet aligné (`from`/`to` = min/max des deux bboxes).
- Au `dragend` : détruire les guides du `hudLayer`, puis laisser le pipeline existant
  (`settlePosition` → `snapToNeighbors` → `resolveNoOverlap`) finaliser. Les seuils doivent
  être cohérents : passer `snapToNeighbors` à un seuil ≤ celui des guides pour éviter le
  « saut » au lâcher.

**Cas limites.**
- Beaucoup d'objets (> 50) : précalculer les bboxes UNE fois au `dragstart`, pas à chaque move.
- Guides vs grille : le magnétisme guide GAGNE sur le snap grille pendant le drag (c'est le
  comportement Figma) ; la grille reprend la main au `dragend` seulement s'il n'y a pas eu
  d'accroche guide au moment du lâcher.
- Zoom faible : le seuil en px écran garantit une sensation constante.
- Drag de sommet (vhandle) : v1 = pas de guides sur les sommets (le vertex-snap OSNAP suffit) ;
  v2 possible en alignant sur les xs/ys des sommets voisins.

**Impact export PDF.** Aucun (hudLayer jamais exporté).

**Effort : M** (2 j — l'algo est simple, l'accordage seuils/sensations prend une session de test).

---

### 1.6 Export PDF à l'échelle EXACTE 1:50 / 1:100 + barre d'échelle + légende auto + flèche nord

**Objectif utilisateur.** Sortir un PDF A4/A3 où **1 cm papier = 0,5 m réel (1:50)** ou 1 m
(1:100), mesurable au réglet par un artisan. Avec cartouche, barre d'échelle graphique,
légende automatique (marqueurs + sols + mobilier utilisés) et flèche nord orientable.

**Problème actuel (`exportPdf.js`).** `doc.addImage(dataUrl, 'PNG', 10, 24, pageW-20, pageH-34)`
étire la capture du stage aux dimensions de la page **sans conserver le ratio** → déformation,
et l'échelle dépend du zoom/pan courant de l'écran → jamais mesurable.

**Modèle de données.**

```json
{
  "export": { "echelle": 50, "format": "a4", "orientation": "paysage", "nordAngle": 0, "avecCotes": true }
}
```

`nordAngle` en degrés (0 = nord en haut), réglé une fois par projet.

**Le calcul d'échelle exacte (cœur de la feature).**

```
échelle 1:E  ⇒  1 m réel = 1000/E mm papier      (1:50 → 20 mm/m ; 1:100 → 10 mm/m)
mmParM = 1000 / E
bounds = contentBounds()  (mètres)                 // + marge 0.5 m
largeurPapierNecessaire = (bounds.w) × mmParM  (mm)
```

Pipeline `exportPlanPdfEchelle(project, editor, opts)` :
1. `b = contentBounds()` ; vérifier que le plan tient dans la zone utile de la page
   (A4 paysage utile ≈ 277×160 mm après cartouche). Sinon : proposer automatiquement
   « passer en A3 » ou « passer au 1:100 » (message clair, pas de silence).
2. **Capture indépendante de la vue** : sauvegarder `scale`/`position` du stage, masquer
   `hudLayer` + `gridLayer` (+ `coteLayer` si `avecCotes:false`, + transformer/handles via
   `clearSelection()`), régler `stage.scale({x:1,y:1})`, `stage.position({x:0,y:0})`, puis :

   ```js
   const PR = 4; // pixelRatio → ~200 dpi au 1:50 (50 px/m × 4 = 200 px/m ; 20 mm/m ⇒ 10 px/mm)
   const dataUrl = stage.toDataURL({
     x: metersToPixels(b.minX - marge), y: metersToPixels(b.minY - marge),
     width: metersToPixels(bw), height: metersToPixels(bh), pixelRatio: PR,
   });
   ```
   puis restaurer scale/position/visibilités. (Pas de clonage de stage : `toDataURL` avec
   région explicite suffit et évite les problèmes d'images de fond re-chargées.)
3. Placement jsPDF **sans étirement** :

   ```js
   const wMm = bw * mmParM, hMm = bh * mmParM;      // dimensions papier EXACTES
   doc.addImage(dataUrl, 'PNG', xMm, yMm, wMm, hMm); // ratio préservé par construction
   ```
   Centré dans la zone utile. C'est ça, la correction de la déformation : **la taille papier
   est calculée depuis les mètres, jamais depuis la page.**
4. **Barre d'échelle** : dessinée en vectoriel jsPDF (`doc.rect`/`doc.line`), 5 segments de
   1 m (1:50) ou 2 m (1:100), alternance noir/blanc, libellés « 0 1 2 3 4 5 m », +
   mention texte « Échelle 1:50 (A4) — ne pas mesurer sur une impression "ajuster à la page" ».
5. **Légende auto** : colonne droite ou bandeau bas. Sources :
   - marqueurs : kinds distincts présents dans `project.contraintes` → emoji + label de `CONSTRAINT_DEFS`;
   - sols : `getRecapSols()` (1.4) → carré hachuré (mini canvas → `addImage` 6×6 mm) + label + m² ;
   - mobilier (vague 2) : blocs distincts utilisés ;
   - pièces : tableau nom / surface (existant dans le titre, à déplacer en légende).
6. **Flèche nord** : petit dessin vectoriel jsPDF (triangle + « N ») en haut à droite, tourné
   de `nordAngle` (rotation manuelle des points, jsPDF ne tourne pas les paths : 4 points à
   transformer, trivial). Réglage UI : molette/slider dans la boîte de dialogue d'export.
7. `exportProjectPdf` (plan + ambiances) réutilise la même page 1.

**Interactions.** Boîte de dialogue d'export (DOM) : échelle (1:50 / 1:100 / auto), format
(A4/A3), orientation, cases « cotes », « grille », « fond de plan », angle du nord. Aperçu
texte : « Votre plan de 12,4 × 8,0 m tiendra sur A4 paysage au 1:100 ».

**Cas limites.**
- Plan vide (`contentBounds() === null`) → message, pas de PDF blanc.
- Très grand plan (> A3 au 1:100) → proposer le multi-pages plus tard ; v1 = message
  « réduisez l'échelle » + export non mesurable en secours (comportement actuel, mais SANS étirement :
  fit proportionnel).
- Fond de plan bitmap : au 1:50 pixelRatio 4 il peut baver — c'est attendu (c'est un scan) ;
  case pour l'exclure.
- `stage.toDataURL` sur un canvas énorme (plan 40 m × PR 4 = 8000 px) : plafonner PR pour que
  le canvas reste < 8192 px de côté (limite Safari/iPad) : `PR = Math.min(4, 8192 / widthPx)`.
- Émojis des marqueurs dans le canvas : rendus par le navigateur, OK ; dans la légende jsPDF
  vectorielle, les émojis ne passent pas (police Helvetica) → dessiner la légende marqueurs
  via mini-captures canvas des chips OU pastilles de couleur + texte (choix v1 : pastille couleur).
- Impression : rappeler dans le PDF « imprimer à 100 % / taille réelle ».

**Impact export PDF.** C'est la feature. `exportPlanPng` profite du même pipeline de capture
propre (région + HUD masqué).

**Effort : L** (3–4 j — la maths est courte, la boîte de dialogue, la légende et les
garde-fous font le gros du travail). **Dépend de** : 1.3 et 1.4 pour la légende complète
(peut sortir avant, légende réduite aux marqueurs + pièces).

---

## 2. VAGUE 2 — « Dessin d'architecte » (préalables P1/P2, cœur métier)

Objectif de la vague : le plan devient un vrai document d'agencement — ouvertures, mobilier
aux vraies dimensions, murs manipulables. **Commencer par les préalables P1 (sélection
unifiée) et P2 (unification rect→polygone)**, puis 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6.

---

### 2.1 Rotation (préalable interne de la vague)

**Objectif utilisateur.** Tourner un objet (meuble surtout, pièce polygonale, poteau rect)
par poignée ou par touche, avec pas de 15° et accrochage à 0/90/180/270°.

**Modèle de données.**

```json
{ "id": "m_x", "angle": 90 }   // degrés, sens horaire, défaut 0 — sur mobilier, poteaux ; PAS sur les pièces rect
```

Décision : les **pièces rectangulaires ne tournent pas** (tout le moteur de snap
`snapToNeighbors`/`resolveNoOverlap` est axis-aligned ; une pièce tournée = la convertir en
polygone via P2 puis tourner ses points). Pour les **polygones** (pièces, zones, faux
plafonds), la rotation est **appliquée aux points** (baked), pas stockée :

```js
rotatePoints(points, centre, angleDeg)  // → nouveaux points (geometry.js + tests)
```

Pour le **mobilier** (2.2), l'angle est stocké (le bloc reste paramétrique w×h + angle).

**Interactions.**
- Poignée : pour le mobilier, activer `rotateEnabled: true` sur un `Konva.Transformer` dédié
  au `meubleLayer` avec `rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315]` (natif Konva)
  et `rotationSnapTolerance: 7`.
- Clavier : objet sélectionné + touche `R` = +15° (`Shift+R` = −15°) — via le dispatcher P3.
- Menu contextuel : « Pivoter 90° » (cas le plus fréquent, un clic).
- Tactile : rotation 2 doigts sur l'objet sélectionné (angle entre les 2 touches, cf. 3.2).

**Rendu Konva.** Mobilier : `group.rotation(m.angle)` autour du centre (`offsetX/Y = taille/2`
pour tourner autour du centre, pas du coin). Au `transformend` : lire `node.rotation()`,
normaliser [0,360), stocker, re-render. Polygones : action « Pivoter 90° » recalcule les
points autour du `polygonCentroid` puis `renderRooms()`.

**Cas limites.**
- HUD pendant rotation : `showLive('${angle}°', …)`.
- bbox d'un objet tourné pour `contentBounds`/guides : utiliser la bbox de la forme tournée
  (`polygonBBox(rotatePoints(corners, c, angle))`).
- Snap voisinage sur meubles tournés à angle non droit : désactivé (les guides 1.5 restent
  sur les bboxes, acceptable).
- Undo : l'angle est dans le snapshot JSON → gratuit.

**Impact export PDF.** Aucun spécifique (le stage capture les rotations). La légende mobilier
ignore l'angle.

**Effort : S–M** (1–2 j).

---### 2.2 Bibliothèque de mobilier 2D paramétrique (15–20 blocs filaires archi)

**Objectif utilisateur.** Glisser sur le plan des meubles **aux vraies dimensions**, dessinés
en filaire d'architecte (trait fin, pas d'icônes cartoon), redimensionnables par leurs cotes
réelles. Ciblée pharmacie/commerce ET habitat.

**Catalogue v1 (18 blocs).** Chaque bloc = id, label FR, dimensions par défaut (m),
fonction de dessin filaire.

| Catégorie | Blocs (dimensions par défaut L×P m) |
|---|---|
| Commerce / pharmacie | comptoir (2.0×0.9), banque d'accueil L (2.4×1.6), gondole simple (1.33×0.5), gondole double (1.33×1.0), vitrine (1.2×0.6), rayonnage mural (1.0×0.4), caisse (1.2×0.8) |
| Séjour / bureau | canapé 3 pl (2.2×0.95), fauteuil (0.9×0.85), table rect (1.6×0.9), table ronde (Ø1.2), chaise (0.45×0.45), bureau (1.4×0.7) |
| Chambre | lit 90 (0.9×2.0), lit 160 (1.6×2.0), armoire (1.2×0.6) |
| Sanitaire / technique | WC (0.4×0.65), lavabo (0.6×0.45), douche (0.9×0.9), évier + plan (1.2×0.6) |

**Modèle de données.**

```json
{
  "mobilier": [
    {
      "id": "m_7c2e",
      "bloc": "gondole-double",
      "x": 4.2, "y": 3.0,
      "w": 1.33, "h": 1.0,
      "angle": 90,
      "label": "Gondole parapharmacie",
      "verrou": false
    }
  ]
}
```

`x,y` = **centre** du meuble (mètres) — plus simple pour la rotation. `w,h` = dimensions
réelles éditables (panneau 1.1). `label` optionnel (défaut = label du catalogue).

Catalogue dans un nouveau fichier `js/mobilier.js` :

```js
export const BLOCS = {
  'lit-160': { label: 'Lit 160', w: 1.6, h: 2.0, cat: 'chambre', draw: drawLit },
  // ...
};
// draw(group, wPx, hPx) ajoute les Konva.Line/Rect/Arc filaires DANS le groupe,
// repère local : origine au centre, style commun { stroke:'#333', strokeWidth:1.5, fill:'#fff' ou null }
```

Exemples de dessins filaires : lit = rect + rect oreiller + diagonale de rabat ; table ronde =
cercle ; chaise = rect + trait dossier ; WC = ellipse + rect réservoir ; gondole = rect +
trait médian ; comptoir = rect + hachure du plan de travail côté client.

**Interactions.**
- Palette DOM (panneau gauche repliable) : vignettes SVG inline par bloc, groupées par
  catégorie, champ recherche. **Clic sur une vignette = le meuble apparaît au centre de la
  vue, sélectionné, en « mode pose »** (suit le curseur jusqu'au clic de dépose) — plus fiable
  qu'un vrai drag HTML→canvas (et ça marche au doigt).
- Drag : libre + guides magnétiques 1.5 + snap grille au `dragend` (`snapToGrid` du centre).
  **Pas de resolveNoOverlap** : les meubles ont le droit de se toucher/chevaucher (v1) ;
  seul un ⚠ visuel (contour orange) si le meuble déborde de toute pièce
  (`pointPolyDistance(centre, roomPolygon(p)) > 0` pour toutes les pièces — fonction existante).
- Resize : par le panneau propriétés (champs L/P) et par Transformer `keepRatio:false`
  avec `boundBoxFunc` imposant min 0,2 m. Rotation : cf. 2.1.
- Double-clic : renommer le label. Suppr/Ctrl+D/flèches : via le dispatch commun (checklist 0.1).

**Rendu Konva.** Nouveau `meubleLayer` entre `roomLayer` (ou `solLayer`) et `poteauLayer`.
Par meuble : `Konva.Group { x, y, rotation, offsetX:0, offsetY:0 }` (dessin centré) →
`BLOCS[m.bloc].draw(group, metersToPixels(m.w), metersToPixels(m.h))` + étiquette optionnelle
sous le meuble (visible si case « étiquettes mobilier » cochée). Re-render complet du groupe
au resize (les draw functions sont paramétriques, pas de scale des strokes → traits toujours fins).

**Cas limites.**
- Bloc inconnu à l'import JSON (vieux catalogue) → fallback rect filaire + label, jamais de crash.
- Meuble redimensionné à des proportions absurdes (lit 0,2×5 m) : autorisé, l'outil ne juge pas —
  mais le panneau affiche les dimensions en clair.
- `contentBounds` : bbox tournée (cf. 2.1).
- Performance : 100 meubles × ~6 shapes = OK pour Konva ; si palette > 30 blocs un jour,
  vignettes en lazy.
- Calque : entrée « Mobilier » dans `setLayerVisible` (plans « gros œuvre » sans meubles).

**Impact export PDF.** Les meubles s'exportent (filaire propre au 1:50). Légende auto (1.6) :
liste des blocs distincts + count (« Gondole double ×6 »). Option d'export « sans mobilier »
= toggle du calque.

**Effort : L** (4–5 j, dont ~2 j pour dessiner proprement les 18 blocs filaires).
**Dépend de** : 2.1 (rotation), 1.1 (panneau propriétés) recommandé.

---

### 2.3 Portes & fenêtres posées sur arêtes, avec battant et sens d'ouverture

**Objectif utilisateur.** Poser une porte ou une fenêtre **sur un mur** (arête de pièce) : elle
se colle à l'arête, glisse le long, montre l'arc de battant et son sens (poussant droit/gauche,
ouverture intérieure/extérieure). Remplace le marqueur emoji `fenetre` actuel par un vrai
symbole archi.

**Modèle de données.**

```json
{
  "ouvertures": [
    {
      "id": "o_3d1a",
      "type": "porte",
      "hote": { "kind": "piece", "id": "p_officine", "edge": 2 },
      "t": 0.35,
      "largeur": 0.90,
      "battant": "droite",
      "sens": "interieur"
    },
    {
      "id": "o_77b0",
      "type": "fenetre",
      "hote": { "kind": "piece", "id": "p_officine", "edge": 0 },
      "t": 0.5,
      "largeur": 1.20,
      "battant": null,
      "sens": null
    }
  ]
}
```

- `type` ∈ `"porte" | "porte-double" | "fenetre" | "baie"`.
- `hote.edge` : index de l'arête dans `roomPolygon(piece)` (arête i = sommets i → i+1 mod n).
  Grâce à `roomPolygon`, **le même modèle marche pour rect et polygone** (P2 non bloquant ici).
- `t` ∈ [0,1] : position du **centre** de l'ouverture le long de l'arête (paramètre du segment).
- `battant` : côté des gonds vu depuis l'extérieur de la pièce (`"gauche"|"droite"`), null si fenêtre.
- `sens` : `"interieur" | "exterieur"` (côté de l'arc). Pour `porte-double` : deux arcs symétriques.

Position dérivée, jamais stockée en x/y :

```js
// geometry.js (+ tests)
edgeOfRoom(piece, edgeIndex)              // → { a, b, len, dir:{x,y}, normal:{x,y} }
openingGeometry(piece, ouverture)         // → { p1, p2, centre, angleDeg, hinge, arc:{cx,cy,r,rotDeg} }
nearestEdge(pt, piece)                    // → { edgeIndex, t, dist }  — boucle pointSegmentDistance (existant)
```

**Interactions.**
- Pose : bouton « Porte » / « Fenêtre » → mode `placing`. Au survol, `nearestEdge` sur toutes
  les pièces (seuil 0,4 m) : l'arête candidate se surligne en vert, un fantôme de l'ouverture
  suit le curseur, clampé le long de l'arête. Clic = pose. `Échap` = annule. Aucune pose
  possible hors arête (le fantôme devient gris).
- Glisser : drag de l'ouverture = ne bouge QUE `t` (projection du pointeur sur l'arête,
  `dragBoundFunc` qui contraint la position au segment — clamp pour que l'ouverture reste
  entièrement sur l'arête : `t ∈ [largeur/2/len, 1 − largeur/2/len]`). Tirer franchement vers
  une AUTRE arête (dist < 0,4 m d'une autre, > 0,6 m de l'actuelle) = re-hosting sur cette arête.
- Clic = sélection (poignées aux extrémités p1/p2 pour ajuster `largeur`, snap 0,05 m,
  min 0,4 m). Menu contextuel : « Inverser le battant » (gauche↔droite), « Inverser le sens »
  (int↔ext), « Largeur… », type. Raccourci : `F` inverse le battant, `S` le sens (sélection active).
- HUD : pendant drag/resize, `showLive('porte 0,90 m · à 1,25 m du coin', …)` — la distance
  au coin le plus proche est LA cote que l'artisan demande.
- Tactile : pose au tap, drag au doigt, menu par appui long (1.2).

**Rendu Konva.** Nouveau `ouvLayer` au-dessus de `roomLayer` (sous mobilier). Par ouverture,
`Konva.Group` positionné au centre, `rotation = angleDeg` de l'arête, dessin en repère local :
- **Porte** : « trou » dans le mur = trait blanc épais (`strokeWidth` = épaisseur du trait de
  la pièce + 2, couleur du fond `#fff` ou couleur de la pièce) recouvrant le segment p1→p2 ;
  vantail = `Konva.Line` du gond vers l'ouverture ; arc = `Konva.Arc { innerRadius: r, outerRadius: r, angle: 90 }`
  (r = largeur), orienté selon `battant` + `sens`.
- **Porte double** : 2 demi-vantaux + 2 arcs de 90°, r = largeur/2.
- **Fenêtre** : trait blanc de coupure + double trait fin parallèle (2 `Konva.Line` espacées
  de 3 px) sur la longueur — symbole archi standard. **Baie** : triple trait.
- Sélection : stroke vert `#2f6f4f` (cohérent avec le reste) via `syncSelection`.

**Cas limites.**
- Pièce redimensionnée/déformée : l'ouverture suit (position dérivée de l'arête) — MAIS si
  l'arête devient plus courte que `largeur` → ouverture rendue en rouge + ⚠ dans le panneau
  vigilance (`checks.js` : nouvelle règle « ouverture plus large que son mur »).
- Sommet supprimé / points modifiés → `edge` peut pointer ailleurs : à chaque mutation des
  points d'une pièce, re-clamper `edge = min(edge, n-1)` et marquer l'ouverture « à vérifier »
  (contour orange) si la longueur d'arête a changé de > 30 %.
- Pièce supprimée → supprimer ses ouvertures en cascade (dans `deleteSelected` de la pièce).
- Duplication de pièce (Ctrl+D) → dupliquer aussi ses ouvertures avec le nouvel id hôte.
- Deux ouvertures qui se chevauchent sur la même arête : autorisé v1, ⚠ visuel si overlap des
  intervalles `[t−l/2, t+l/2]`.
- Mur partagé entre 2 pièces (arêtes superposées) : l'ouverture appartient à UNE pièce (celle
  cliquée) ; le rendu du trou couvre visuellement les deux traits si les arêtes coïncident —
  suffisant en v1, le vrai mur mitoyen relève de 2.6 (cloisons).
- Migration : proposer de convertir les marqueurs `kind:'fenetre'` existants ? Non — on garde
  le marqueur (utile sur fond de plan sans pièces dessinées) et on ajoute l'objet ouverture ;
  renommer le marqueur en « Fenêtre (repère) » dans l'UI.

**Impact export PDF.** Symboles vectoriels dans le stage → exportés tels quels, très pro au
1:50. `checks.js`/panneau vigilance : les règles ERP (largeur PMR ≥ 0,90 m, sens d'ouverture
des issues de secours vers l'extérieur) peuvent maintenant s'appuyer sur des données réelles —
grosse synergie avec le positionnement pharmacie.

**Effort : L** (4–5 j). **Dépend de** : 1.2 (menu contextuel, fortement recommandé pour
battant/sens), P1 utile mais non bloquant.

---

### 2.4 Tirer un mur (drag d'arête) + ajout de sommet sur arête

**Objectif utilisateur.** Attraper une arête d'une pièce et la **pousser/tirer
perpendiculairement** : la pièce s'agrandit/rétrécit mur par mur (geste n°1 de tout logiciel
d'archi). Double-clic sur une arête = insérer un sommet à cet endroit (pour créer un recoin).

**Modèle de données.** Aucun nouveau champ. **Préalable P2 appliqué ici** : quand on tire le
mur d'une pièce rectangulaire, deux options —
- si le drag reste perpendiculaire (toujours vrai pour un rect), muter simplement `x/y/w/h` ;
- l'ajout de sommet sur un rect le **convertit définitivement en polygone**
  (`piece.points = roomPolygon(piece)`, suppression de `x,y,w,h`) — conversion à sens unique, annulable par undo.

**Interactions.**
- Souris : quand une pièce est sélectionnée, survol d'une arête (hit à < 6 px écran, via
  `pointSegmentDistance` sur chaque arête de `roomPolygon`) → curseur `ns-resize`/`ew-resize`
  (ou `move` si oblique) + surlignage de l'arête. Mousedown sur l'arête (et pas sur un vhandle)
  → drag : les DEUX sommets de l'arête se translatent selon la **normale** de l'arête
  (projection du delta souris sur la normale — l'arête reste parallèle à elle-même).
  Snap : chaque nouvelle position de sommet passe par `snapPointToGrid` ; HUD affiche la
  nouvelle longueur des 2 arêtes adjacentes.
- Double-clic sur une arête → `insertVertexOnEdge(piece, edgeIndex, t)` : nouveau sommet au
  point projeté, sélectionné, prêt à être tiré. (Entrée « Ajouter un sommet » du menu 1.2.)
- Clavier : pendant le drag d'arête, la saisie de longueur (1.1) fixe le déplacement exact.
- Tactile : idem au doigt (zone de hit élargie à 12 px).

**Rendu Konva.** Pas de nouveau calque : une `Konva.Line` invisible « edge-hit » par arête de
la pièce SÉLECTIONNÉE uniquement (`hitStrokeWidth: 12`, `stroke: 'transparent'`), reconstruite
par `syncSelection` à côté des vhandles. Pendant le drag, mise à jour directe des `points` du
`roomPoly` (même mécanique que le drag de vhandle existant) puis `renderRooms()+notify()` au
`dragend`.

Fonctions geometry.js (+ tests) :

```js
edgeAtPoint(points, pt, thrM)                    // → { edgeIndex, t } | null
translateEdge(points, edgeIndex, deltaAlongNormal) // → nouveaux points
insertVertexOnEdge(points, edgeIndex, t)          // → nouveaux points
```

**Cas limites.**
- Tirer un mur jusqu'à croiser le mur opposé → aire qui s'inverse : refuser le drag au-delà
  (si `polygonAreaM2` < 0,25 m² ou si `polygonSelfIntersects()` (créée en 1.4) devient vrai,
  bloquer à la dernière position valide).
- Rect : ne jamais laisser `w/h < GRID_M` (clamp existant).
- Ouvertures (2.3) sur l'arête tirée : elles suivent (position en `t`) — c'est LE bénéfice du
  modèle paramétrique ; re-vérifier `largeur ≤ len` après drag.
- Conflit de hit avec le drag de la pièce entière : l'edge-hit n'existe que sur la pièce
  sélectionnée et gagne sur le group-drag (il est au-dessus) ; cliquer au centre = déplacer,
  cliquer sur un bord = tirer. À tester au doigt (12 px suffisent).
- `resolveNoOverlap` : le tirage de mur d'un polygone n'est PAS soumis au no-overlap
  (comportement actuel des polys) ; pour les rects, repasser par `settlePosition` au dragend.

**Impact export PDF.** Aucun direct.

**Effort : M** (2–3 j). **Dépend de** : P2 (fait partie du lot), 1.1 pour la saisie exacte.

---

### 2.5 Multi-sélection, lasso, alignement

**Objectif utilisateur.** Shift+clic pour sélectionner plusieurs objets, rectangle de
sélection (lasso) sur le vide, puis : déplacer/supprimer/dupliquer le groupe, et boutons
d'alignement (gauche/centre/droite/haut/milieu/bas + répartir horizontalement/verticalement).
Indispensable dès qu'il y a du mobilier (aligner 6 gondoles).

**Modèle de données.** Aucun champ projet. **Préalable P1 obligatoire** : la sélection devient

```js
// état interne éditeur
selection = [ { type: 'meuble', id: 'm_1' }, { type: 'piece', id: 'p_2' }, ... ]
```

Toutes les fonctions `deleteSelected/duplicateSelected/nudgeSelected` itèrent sur ce tableau
(la version mono-objet devient un cas particulier). `syncSelection()` surligne tout.

**Interactions.**
- Shift+clic sur un objet : toggle dans la sélection.
- Lasso : mousedown sur le vide (stage) SANS drawMode + drag → `Konva.Rect` semi-transparent
  bleu dans `hudLayer` ; au mouseup, tout objet dont la **bbox intersecte** le rect entre en
  sélection (`rectsOverlap` existant, sur bboxes en mètres). Attention : le stage est
  `draggable:true` (pan) — le lasso prend la main quand **Shift est enfoncé au mousedown**
  (Shift+drag sur le vide = lasso ; drag simple = pan ; c'est le compromis le plus simple sans
  casser le pan, et cohérent avec Shift+clic).
- Drag groupé : le drag d'un objet sélectionné applique le même delta à tous au `dragend`
  (translation des points/x-y de chacun, puis UN SEUL `notify()`).
- Alignement : barre d'outils contextuelle (DOM, apparaît si sélection ≥ 2) : 6 boutons
  d'alignement + 2 de répartition. Référence = bbox englobante de la sélection.
  `alignSelection('left'|'centerX'|...)` calcule pour chaque objet le delta de sa bbox
  (`polygonBBox(roomPolygon(...))` / bbox meuble tournée) vers la cible.
- Clavier : Ctrl+A = tout sélectionner (objets visibles), Échap = vider, flèches = nudge groupé.

**Rendu Konva.** Surlignage multi : même stroke vert sur chaque objet (déjà le pattern
`syncSelection`) ; PAS de Transformer multi-nœuds en v1 (resize groupé hors scope). Lasso
dans `hudLayer` (`listening:false`, non exporté). Cadre englobant pointillé autour de la
sélection multiple (un `Konva.Rect` dans hudLayer, mis à jour au drag).

**Cas limites.**
- Sélection hétérogène (pièce + marqueur + meuble) : déplacer/supprimer/dupliquer OK ;
  aligner OK (bbox) ; panneau propriétés (1.1) affiche « 3 objets » + actions communes seulement.
- `resolveNoOverlap` sur drag groupé de rects : appliquer le settle **en traitant les membres
  de la sélection comme un bloc** (exclure les membres de `others`), sinon ils se repoussent
  entre eux au lâcher.
- Répartition avec 2 objets = no-op (min 3).
- Objets verrouillés (1.2) : sélectionnables au lasso mais ignorés par move/delete (feedback :
  cadenas clignote).
- Undo : un geste groupé = UN snapshot (déjà garanti si un seul `notify()` par geste).

**Impact export PDF.** Aucun (hud non exporté ; penser à `clearSelection()` avant capture — déjà dans 1.6).

**Effort : L** (3–4 j dont 1–2 j pour la refonte P1 propre + reprise des tests).

---

### 2.6 Cloisons à épaisseur simplifiées

**Objectif utilisateur.** Tracer des cloisons intérieures (segments à épaisseur réelle :
placo 7 cm, porteur 20 cm…) qui se dessinent comme un double trait rempli — pour découper
un plateau commercial sans créer des « pièces » partout. Reste volontairement simple :
pas de résolution de jonctions en T/L parfaites (v1 = chevauchement franc, visuellement correct).

**Modèle de données.**

```json
{
  "cloisons": [
    {
      "id": "w_51aa",
      "a": { "x": 2.0, "y": 1.0 },
      "b": { "x": 2.0, "y": 5.5 },
      "epaisseur": 0.07,
      "type": "cloison"
    }
  ]
}
```

`type` ∈ `"cloison" (0.07) | "porteur" (0.20) | "verriere" (0.05)` — présets d'épaisseur,
`epaisseur` éditable au panneau (1.1). Polyligne ? Non : **une cloison = UN segment** ; une
polyligne de dessin (mode ci-dessous) émet N segments — plus simple à éditer/supprimer un par un.

**Interactions.**
- Mode « Cloison » : réutilise la machine `startDraw` (`drawMode='cloison'`) : clics successifs,
  ORTHO/OSNAP/grille actifs, chaque paire de points consécutifs crée un segment au
  `finishDraw` (pas besoin de fermer, Entrée/Échap termine ; 2 points suffisent).
- Sélection : clic (hit sur le rect épais) → poignées aux 2 extrémités (drag = déplacer
  l'extrémité, OSNAP sur sommets + extrémités des autres cloisons — ajouter les extrémités de
  cloisons à `allVertices()` pour l'accrochage en chaîne). Drag du corps = translation.
- Menu contextuel : type (présets), épaisseur…, Supprimer.
- Portes dans les cloisons : les ouvertures 2.3 acceptent `hote: { kind:'cloison', id, edge:0 }`
  (une cloison n'a qu'une arête, `edge` toujours 0) — le modèle `hote.kind` est prévu pour ça.

**Rendu Konva.** Nouveau `cloisonLayer` entre `solLayer` et `ouvLayer`. Rendu d'un segment
épais : `Konva.Line` avec `strokeWidth = metersToPixels(epaisseur)`, `stroke:'#3a3f45'`,
`lineCap:'butt'` + un second trait blanc fin par-dessus ? Non — plus propre : **`Konva.Rect`
tourné** (longueur × épaisseur, rotation = angle du segment, offset au centre), `fill:'#e8e4de'`,
`stroke:'#222'`, `strokeWidth:1.5` → vrai double-trait rempli, style archi. Porteur :
`fill:'#8a5a2b'` hachuré (motifCanvas de 1.4 réutilisé).

Geometry (+ tests) : `segmentToRect(a, b, epaisseur)` → `{cx, cy, len, angleDeg}`.

**Cas limites.**
- Segment quasi nul (< 0,1 m) → rejeté à la pose.
- Jonctions T/L : les rects se chevauchent, le contour interne se voit légèrement — assumé v1
  (mention dans l'UI ? non, personne ne le remarque à l'échelle 1:50). v2 possible : joindre
  les polygones (clipping) — hors scope.
- `checks.js` : une cloison `type:'porteur'` déclenche le même point de vigilance que le
  marqueur mur porteur (démolition interdite).
- Les cloisons ne comptent PAS dans `totalAreaM2` ni ne découpent les pièces (annotations
  structurelles, pas de topologie).

**Impact export PDF.** Rendu dans le stage → exporté. Légende : trait « cloison » vs
« porteur » si présents.

**Effort : M** (2–3 j). **Dépend de** : 2.3 si on veut des portes en cloison (sinon autonome).

---

## 3. VAGUE 3 — « Multi-niveaux, mobilité, interop » (ouverture de l'écosystème)

Objectif de la vague : sortir du cadre « un plan, un écran » — étages, iPad sur site,
échange avec les pros (DXF) et les clients (lien lecture seule). Ordre : 3.1 → 3.2 → 3.4 → 3.3
(le DXF en dernier, c'est le plus « bonus »).

---

### 3.1 Niveaux / étages

**Objectif utilisateur.** Un projet = plusieurs niveaux (RDC, R+1, sous-sol…). On bascule d'un
étage à l'autre par onglets, chaque étage a son propre plan complet, avec option « voir
l'étage inférieur en filigrane » pour aligner les murs.

**Modèle de données.** Restructuration (LA migration de ce document) :

```json
{
  "nom": "Pharmacie du Port",
  "client": "…",
  "date": "2026-07-05",
  "niveaux": [
    {
      "id": "n_rdc",
      "nom": "RDC",
      "ordre": 0,
      "pieces": [], "contraintes": [], "poteaux": [], "fauxPlafonds": [],
      "ouvertures": [], "mobilier": [], "cotes": [], "zonesSol": [], "cloisons": [],
      "fond": null
    },
    { "id": "n_r1", "nom": "R+1", "ordre": 1, "pieces": [], "…": "…" }
  ],
  "niveauActif": "n_rdc",
  "ambiances": [], "export": {}
}
```

**Migration** (dans `storage.js`, au chargement) : si `project.pieces` existe à la racine →
envelopper toutes les collections dans `niveaux[0] = { id:'n_rdc', nom:'RDC', ordre:0, ...collections }`
puis supprimer les champs racine. Écrire un test vitest de migration. L'export JSON reste
rétro-lisible (l'import détecte les deux formats).

**Implémentation clé — le proxy de niveau.** Pour NE PAS réécrire tout `planEditor.js`
(qui lit `project.pieces` partout) : l'éditeur reçoit **le niveau actif comme « project »** :

```js
// app.js
const niveau = project.niveaux.find(n => n.id === project.niveauActif);
editor = createPlanEditor('plan', niveau, { onChange: (_niv, total) => saveProject(project) });
```

Changement d'étage = `editor.destroy()` + re-`createPlanEditor` avec l'autre niveau (le
pattern destroy/remount du LOT 1 existe déjà et est testé). L'historique undo est par niveau
(acceptable et même souhaitable). `totalAreaM2` global = somme des niveaux (affichage app.js).

**Interactions.**
- Barre d'onglets au-dessus du canvas : `RDC | R+1 | +`. Clic = bascule (avec autosave flush
  avant destroy). `+` = nouveau niveau (nom demandé via mini-form, pas prompt). Clic droit
  sur un onglet (1.2) : Renommer, Dupliquer le niveau (base de travail R+1 = copie RDC),
  Monter/Descendre, Supprimer (confirmation).
- « Filigrane niveau inférieur » : toggle 👻 — rend les pièces du niveau `ordre-1` en gris 15 %
  non listening dans `bgLayer` (simple : dessiner les `roomPolygon` en `Konva.Line` fantômes).
- Clavier : `PgUp/PgDn` change d'étage.

**Rendu Konva.** Rien de neuf hors filigrane (ci-dessus).

**Cas limites.**
- **Quota localStorage** : N fonds de plan base64 × N niveaux → dépassement quasi certain.
  **P4 (IndexedDB pour `fond.image`) devient bloquant ici** : stocker les images dans
  IndexedDB (clé = `${projectId}/${niveauId}/fond`), ne garder dans le JSON qu'une référence.
  Budget ~1 j inclus dans l'effort.
- Suppression du dernier niveau : interdite (min 1).
- `niveauActif` orphelin à l'import → fallback `niveaux[0].id`.
- Ambiances : restent au niveau projet (pas par étage).
- Partage/exports : cf. impacts croisés (3.3, 3.4).

**Impact export PDF.** Une page de plan PAR niveau dans `exportProjectPdf` (titre = nom du
niveau). La boîte de dialogue 1.6 gagne des cases « niveaux à inclure ».

**Effort : L** (4 j dont migration + IndexedDB + reprise des exports).

---

### 3.2 Tactile iPad (pinch-zoom, appui long, poignées adaptées)

**Objectif utilisateur.** La cliente utilise l'outil sur iPad en rendez-vous : zoom à deux
doigts, pan à un doigt sur le vide, appui long = menu contextuel, poignées assez grosses pour
le doigt. (PWA déjà en place → plein écran via « Ajouter à l'écran d'accueil ».)

**Modèle de données.** Aucun.

**Interactions.**
- **Pinch zoom** : sur `touchmove` avec 2 touches — distance entre les touches vs distance
  initiale → `zoomAt(milieuDesTouches, ratio)` (la fonction `zoomAt` existe et prend déjà un
  centre : il ne manque QUE la détection pinch). Désactiver `stage.draggable` pendant le pinch
  (sinon pan parasite), le réactiver au `touchend`. `Konva.hitOnDragEnabled = true` requis.
- **Appui long 500 ms** = menu contextuel (déjà spécifié en 1.2 — l'implémenter là-bas, le
  vérifier ici sur device réel).
- **Rotation 2 doigts** (2.1) : si les 2 touches commencent SUR un meuble sélectionné, le
  delta d'angle entre les doigts pilote `rotation` (seuil 5° pour ne pas confondre avec pinch ;
  si distance varie > 15 % → pinch, sinon rotation).
- **Poignées** : helper taille-écran (audit) — `HANDLE_R = isCoarsePointer() ? 12 : 7` où
  `isCoarsePointer = matchMedia('(pointer: coarse)')` ; appliqué aux vhandles, poignées de
  cotes, extrémités de cloisons, `hitStrokeWidth` des arêtes (2.4).
- **Empêcher les gestes navigateur** : `touch-action: none` sur le container du stage (CSS),
  et `e.evt.preventDefault()` dans les handlers touch — sinon Safari scrolle/zoome la page.
- Barre d'outils : boutons min 44×44 px (audit tap-target), déjà à vérifier dans styles.css.

**Rendu Konva.** Aucun nouveau nœud. Uniquement les rayons/hit adaptés ci-dessus.

**Cas limites.**
- Double-tap : Konva émet `dbltap` (déjà branché partout : rename, hauteur FP…) — vérifier
  qu'il ne déclenche pas le zoom Safari (`touch-action:none` le règle).
- Pinch pendant `drawMode` : les 2 doigts NE posent PAS de point (ignorer `placeDrawPoint` si
  `touches.length > 1` au `touchend`).
- Apple Pencil : traité comme touch fin — rien à faire.
- `window.prompt` sur iPad = très laid : la vague 1 (menu + panneau) doit être livrée avant
  pour que l'expérience iPad soit digne.
- Test réel obligatoire sur Safari iPad (pas seulement le mode responsive desktop).

**Impact export PDF.** Vérifier le plafond canvas 8192 px de Safari (déjà prévu en 1.6).

**Effort : M** (2–3 j dont ½ j de tests sur device). **Dépend de** : 1.2 (appui long), idéalement toute la vague 1.

---

### 3.3 Partage lecture seule d'un plan (lien ou fichier)

**Objectif utilisateur.** Envoyer au client/artisan un **lien** qui ouvre le plan en lecture
seule (zoom/pan/étages, pas d'édition), sans compte, sans serveur. Plan B : un fichier HTML
autonome à envoyer par mail.

**Architecture (0 serveur).** Les données voyagent **dans l'URL** (fragment `#`, jamais envoyé
au serveur — bonus confidentialité) :

```
https://bathmantv.github.io/outil-archi/voir.html#v1.gzip.BASE64URL
```

- Compression **native, sans lib** : `CompressionStream('gzip')` (supporté Chrome/Edge/Firefox/Safari 16.4+,
  donc OK 2026) :

  ```js
  async function encodePlan(project) {
    const lite = stripForShare(project);           // sans fond.image ni ambiances (trop lourds)
    const bytes = new TextEncoder().encode(JSON.stringify(lite));
    const gz = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return 'v1.gzip.' + base64url(gz);
  }
  // décodage symétrique avec DecompressionStream('gzip')
  ```
- Capacité : un plan chargé (30 pièces, 60 meubles, cotes…) ≈ 15–40 Ko JSON → 3–8 Ko gzip →
  4–11 Ko base64. **Limite pratique d'URL ≈ 30–60 Ko** (navigateurs OK, mais WhatsApp/Outlook
  tronquent parfois) → si l'URL dépasse **8 000 caractères**, basculer automatiquement sur le
  Plan B fichier et le dire à l'utilisatrice.
- **Plan B fichier** : bouton « Télécharger la version consultable » → génère un `.html`
  autonome (template `voir.html` inliné + `<script id="plandata" type="application/json">…`)
  via Blob download. S'ouvre par double-clic partout, aucune limite de taille, fond de plan inclus.

**Modèle de données.** Rien de nouveau dans le projet. `stripForShare()` retire :
`fond.image` (remplacé par `fondOmis: true` → bandeau « fond de plan non inclus »), `ambiances`,
`export`, `prefs`.

**La visionneuse `voir.html`.** Nouvelle page statique du repo :
- réutilise Konva + `planEditor.js` en mode `readonly: true` (nouvelle option de
  `createPlanEditor` : `draggable(false)` partout, pas de transformer/handles, pas de clavier
  d'édition, pas de menu, pas d'autosave/undo — ~20 points de garde `if (readonly) return;`) ;
- UI minimale : nom du projet, onglets niveaux, zoom +/−/fit, bouton « Imprimer / PDF » (réutilise 1.6) ;
- bandeau « Plan en lecture seule — réalisé avec Plans & Ambiances » (discret marketing Hauum).

**Interactions.** Côté éditrice : bouton « Partager » → dialogue avec le lien généré + bouton
« Copier », QR code optionnel (dessiné en canvas vanilla, algo QR embarqué ~300 lignes ou lib
locale committée — pas de CDN requis au runtime), et le bouton fichier autonome.
Côté destinataire : zoom/pan/pinch (3.2), aucun droit d'édition.

**Cas limites.**
- URL tronquée par un messagerie → `decodePlan` échoue → page d'erreur claire : « Lien
  incomplet — demandez le fichier consultable ».
- Versionnage : préfixe `v1.` dans le fragment ; toute évolution du schéma projet doit garder
  `decodePlan` rétro-compatible (même exigence que storage.js).
- `CompressionStream` absent (vieux Safari) : côté LECTURE c'est le destinataire qui compte →
  fallback : si `!window.DecompressionStream`, afficher « navigateur trop ancien » + lien
  fichier. Côté écriture, l'éditrice a un navigateur moderne (prérequis assumé).
- Données perso dans l'URL : mentionner dans le dialogue que « toute personne ayant le lien
  voit le plan » (pas de révocation possible — c'est un lien-capacité).
- `sw.js` : ajouter `voir.html` au cache PWA + bump version.

**Impact export PDF.** La visionneuse embarque le même export 1.6 → le destinataire imprime
à l'échelle lui-même. Gros argument.

**Effort : L** (3–4 j dont visionneuse readonly 1,5 j). **Dépend de** : 1.6 (export dans la
visionneuse), 3.1 si niveaux (le viewer doit les gérer — prévoir dès le départ).

---

### 3.4 Export DXF minimal

**Objectif utilisateur.** « Envoyez-moi le DXF » — la phrase des cuisinistes, agenceurs et
bureaux d'études. Exporter un DXF ouvrable dans AutoCAD/LibreCAD/SketchUp avec les pièces,
cloisons, ouvertures, mobilier (en contours), cotes et textes, aux **coordonnées réelles en mètres**.

**Faisabilité vanilla : OUI, sans lib.** Le DXF R12 ASCII est un format texte trivial
(paires code/valeur). Un writer maison de ~200 lignes couvre tout notre besoin — c'est LE
choix aligné avec « 0 dépendance, 0 build ». (Alternative rejetée : lib `dxf-writer` en CDN —
contraire aux contraintes ; SVG→DXF via convertisseur externe — dépendance en ligne, rejetée.)

**Nouveau fichier `js/exportDxf.js`** :

```js
// Writer R12 minimal
class Dxf {
  constructor() { this.lines = []; this.layers = new Set(); }
  layer(name, colorIndex) { … }                      // TABLES/LAYER
  polyline(points, { layer, closed }) { … }          // POLYLINE/VERTEX/SEQEND (R12, pas LWPOLYLINE)
  line(a, b, { layer }) { … }
  circle(c, r, { layer }) { … }
  arc(c, r, deg1, deg2, { layer }) { … }
  text(pt, h, str, { layer, rotDeg }) { … }          // TEXT (attention : encoder en ASCII, é→\U+00E9 ou translittérer)
  toString() { … }                                    // HEADER($INSUNITS=6 mètres) + TABLES + ENTITIES + EOF
}
```

Mapping des collections → calques DXF (convention archi) :

| Collection | Calque DXF | Entités |
|---|---|---|
| pieces (`roomPolygon`) | `MURS` | POLYLINE fermée |
| cloisons | `CLOISONS` | POLYLINE fermée (le rect épais, 4 points via `segmentToRect`) |
| ouvertures | `MENUISERIES` | LINE (vantail) + ARC (battant) + LINE×2 (fenêtre) |
| mobilier | `MOBILIER` | POLYLINE du contour tourné (pas le détail filaire — v1 contour + TEXT label) |
| cotes | `COTES` | LINE×3 + TEXT (pas d'entité DIMENSION — trop complexe, inutile) |
| zonesSol | `SOLS` | POLYLINE fermée + TEXT label (pas de HATCH en v1 — R12 hatch = enfer) |
| poteaux | `STRUCTURE` | CIRCLE ou POLYLINE |
| contraintes | `ANNOTATIONS` | TEXT (label sans emoji) |
| noms de pièces | `TEXTES` | TEXT au centroïde + surface |

Y inversé : le canvas a Y vers le bas, le DXF Y vers le haut → `yDxf = -yM` (ou `maxY - y`).
Unités : coordonnées en mètres + `$INSUNITS = 6`.

**Interactions.** Bouton « Exporter DXF » dans le menu export. Si niveaux (3.1) : un fichier
par niveau (`projet_RDC.dxf`) ou choix. Téléchargement Blob classique.

**Cas limites.**
- Accents dans TEXT : R12 = codepage. Solution robuste : séquences `\U+XXXX` (AutoCAD les lit)
  avec fallback translittération (é→e) pour LibreCAD — écrire les deux ? Non : `\U+XXXX`
  seul, testé dans LibreCAD (il les gère depuis 2.1).
- Emojis des marqueurs : jamais dans le DXF (label texte seul).
- Fond de plan bitmap : non exporté (mention dans le dialogue).
- Validation : ouvrir les fichiers de test dans **LibreCAD (gratuit)** + un viewer en ligne ;
  ajouter un test vitest « le DXF généré contient N POLYLINE et se termine par EOF » +
  golden file comparé.
- Arcs de porte : sens trigonométrique DXF vs notre sens horaire écran + Y inversé → bien
  tester les 4 combinaisons battant×sens.

**Impact export PDF.** Aucun. C'est le troisième format d'export (PDF, PNG, DXF, + JSON).

**Effort : M–L** (3 j dont 1 j de tests dans de vrais logiciels CAD).
**Dépend de** : les features dont il exporte les données (au minimum pièces = autonome ;
la valeur monte avec 2.3/2.6/1.3).

---

## 4. Récapitulatif — dépendances et ordre de livraison

```
VAGUE 1 (aucun préalable)          VAGUE 2 (P1, P2, P3)              VAGUE 3
─────────────────────────          ──────────────────────            ────────────────────
1.1 Panneau propriétés ──┐         P1 Sélection unifiée ─► 2.5 Multi-sélection/lasso/align
1.2 Menu contextuel ─────┼──┐      P2 Rect→polygone ────► 2.4 Tirer un mur
1.3 Cotation ────────────┤  ├────► 2.1 Rotation ────────► 2.2 Mobilier ─────► 3.4 DXF (valeur ↑)
1.4 Zones de sol ────────┤  └────► 2.3 Portes/fenêtres ─► 2.6 Cloisons ─────► 3.4
1.5 Guides magnétiques   │                                            ┌─────► 3.1 Niveaux (P4 IndexedDB)
1.6 PDF échelle exacte ◄─┘ (légende enrichie par 1.3, 1.4, 2.2)       ├─────► 3.2 iPad (après vague 1)
                                                                      └─────► 3.3 Partage (après 1.6, 3.1)
```

| # | Feature | Effort | Dépendances dures |
|---|---|---|---|
| 1.1 | Panneau propriétés + saisie longueur | M | P3 (inclus) |
| 1.2 | Menu contextuel clic droit | M | — |
| 1.3 | Cotation | M | — |
| 1.4 | Zones de sol + m² | M | — |
| 1.5 | Guides magnétiques | M | — |
| 1.6 | PDF échelle exacte + légende + nord | L | légende complète : 1.3, 1.4 |
| 2.1 | Rotation | S–M | — |
| 2.2 | Bibliothèque mobilier | L | 2.1 |
| 2.3 | Portes & fenêtres | L | 1.2 recommandé |
| 2.4 | Tirer un mur | M | P2 |
| 2.5 | Multi-sélection / lasso / alignement | L | P1 |
| 2.6 | Cloisons à épaisseur | M | 2.3 pour portes en cloison |
| 3.1 | Niveaux / étages | L | P4 (IndexedDB) |
| 3.2 | Tactile iPad | M | 1.2 ; vague 1 livrée |
| 3.3 | Partage lecture seule | L | 1.6 ; 3.1 si niveaux |
| 3.4 | Export DXF | M–L | riche après 2.3/2.6/1.3 |

**Totaux indicatifs** : Vague 1 ≈ 13–15 j · Vague 2 ≈ 15–19 j (préalables inclus) ·
Vague 3 ≈ 12–14 j.

**Logique produit des vagues** : la Vague 1 rend le plan **présentable et mesurable** (ce que
la cliente vend en rendez-vous pharmacie), la Vague 2 le rend **juste et complet** (agencement
réel, mobilier commerce), la Vague 3 le rend **partageable et multi-supports** (iPad sur site,
lien client, DXF artisan).
