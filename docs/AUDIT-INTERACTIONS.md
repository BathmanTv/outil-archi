# Audit interactions — outil Plans & Ambiances

_05/07/2026 — audit multi-agents (UX éditeurs 2D, review code, métier archi, QA headless) + synthèse priorisée. Objectif : rapprocher l'outil d'un vrai éditeur de plan._

## Résumé

L'outil a une bonne base (dessin de pièces, calques, export, sauvegarde) mais il souffre d'un défaut de construction : à chaque clic, tout le plan est détruit puis redessiné, ce qui casse le geste le plus basique — déplacer une pièce en la faisant glisser. Les tests réels confirment deux blocages : le glisser-déplacer des pièces rectangulaires ne fonctionne pas, et l'outil est inutilisable sur mobile/tablette. Une fois ces réparations faites, une dizaine de petits ajouts (zoom à la molette, annuler avec Ctrl+Z, touche Suppr, cotes affichées pendant le déplacement, surbrillance au survol) suffisent à donner la sensation d'un vrai éditeur type Canva. Ensuite, les ajouts métier (portes avec sens d'ouverture, mobilier aux vraies dimensions, cotations, export à l'échelle 1:50) transforment le zoning actuel en vrai plan d'aménagement présentable à un client. La feuille de route ci-dessous est ordonnée : réparer, puis fluidifier, puis enrichir.

## Top 5

1. Réparer le glisser-déplacer des pièces (aujourd'hui cassé) et rendre le canvas fluide : c'est la base de tout éditeur
2. Zoom à la molette centré sur le curseur + bouton "Tout voir" : la navigation devient naturelle comme dans Figma/Canva
3. Annuler/Rétablir (Ctrl+Z) + touche Suppr + dupliquer (Ctrl+D) : le filet de sécurité qui autorise un non-technicien à explorer sans peur
4. Retours visuels partout : cotes en mètres affichées pendant qu'on déplace ou redimensionne, surbrillance au survol, guides d'alignement pendant le drag
5. Portes avec battant, fenêtres et bibliothèque de mobilier aux vraies dimensions : ce qui fait passer d'un zoning coloré à un vrai plan d'aménagement

## Bugs & frictions (à corriger d'abord)

- BLOCKER — Déplacer une pièce au glisser ne marche pas : le handler mousedown appelle selectRoom → renderRooms qui DÉTRUIT le nœud sous le curseur avant que Konva n'accroche le drag (planEditor.js l.163/207 + destroy l.260). Prouvé par test CDP (pieces[0] reste x:0,y:0). Fix immédiat : sélectionner sur 'click' seul ou ne pas re-render à la sélection ; fix propre = préalable réconciliation.
- BLOCKER — Canvas jamais redimensionné : stage créé une fois à container.clientWidth, aucun listener resize (canvas 1037 px dans un viewport 393 px, plan à 37%, scroll horizontal). Ajouter resize handler + sur mobile mettre le canvas avant le panneau (aujourd'hui le plan est à 2187 px sous le pli).
- Export PDF/PNG capture le viewport courant (pan/zoom du moment) et étire sans préserver le ratio (exportPdf.js l.25/71/26) : plan tronqué ET déformé. Cadrer sur la bbox du contenu.
- Une pièce ajoutée peut être poussée hors écran en coordonnées négatives par resolveNoOverlap (mesuré : Cuisine à x=-3, invisible). Borner x,y ≥ 0 + recentrer la vue sur la nouvelle pièce.
- Entrée pour fermer un polygone relance le mode dessin en boucle : pas de preventDefault, le bouton "Dessiner" garde le focus et reçoit le Enter (l.510 + app.js:179). Et Backspace supprime un sommet même quand on tape dans un champ texte (listener window sans garde e.target).
- Pendant le calage d'échelle et le dessin, le fond de plan reste déplaçable (bgLayer non gelée, l.466/601) : un clic glissé déplace le fond entre les 2 points de calibration → échelle faussée en silence. Plus : 50 en dur l.621 au lieu de PX_PER_M.
- Un sommet déplacé se recolle à sa propre position d'origine (snapToVertices inclut le point en cours de drag, l.230-233) : ajustement fin impossible, sensation collante.
- Le slider d'opacité déclenche une sauvegarde localStorage complète (tous les projets, fond base64 inclus) à chaque tick — plusieurs Mo sérialisés en synchrone des dizaines de fois/seconde. Débouncer l'autosave (300-500 ms).
- Fuite mémoire : chaque aller-retour Plan↔Ambiance recrée l'éditeur sans stage.destroy() (app.js:149) — stages accumulés + perte du zoom/pan/sélection à chaque changement d'onglet.
- Non-chevauchement faux entre rectangles et polygones : settlePosition ignore les pièces polygonales (l.136), un rect peut recouvrir un poly librement.
- Le drag de polygone re-snappe chaque sommet à la grille (l.213, 444) : toute géométrie hors-grille sera déformée au déplacement — snapper le delta de translation, pas chaque point.
- Accessibilité : aucun anneau de focus clavier (outline:none partout) — ajouter :focus-visible. Deux conventions de nom par défaut ("Pièce" vs type) : proposer le nommage juste après la fermeture du polygone.

## Préalables techniques

- Réconciliation du rendu au lieu de tout détruire/reconstruire : cache de nœuds Konva par id, mise à jour des attributs en place, sélection = changement de style. C'est la cause du blocker n°1 (drag cassé) et le verrou qui empêche hover, transitions, drag fluide, multi-sélection. À payer en premier.
- Point de mutation unique (command pattern) : ~15 endroits mutent project.* directement puis re-render. Introduire execute({do, undo}) + pile — prérequis de l'undo/redo et de toute nouvelle interaction. Chance : notify() est déjà l'unique point de notification, donc une version snapshot-JSON est faisable vite (quick win), la version commandes fines venant ensuite.
- Sélection unifiée : remplacer les 4 variables parallèles (selectedId/ConsId/PoteauId/CeilId, l.64-67) et le bloc de 4 renders copié 5 fois par selection = Set de {type, id} + un seul syncSelection() + événement 'selection:changed'. Prérequis de la multi-sélection, du lasso et du panneau propriétés.
- Éditeur singleton + destruction propre : créer le stage une fois, loadProject(p) pour changer de projet, stage.destroy() sinon, ResizeObserver sur le conteneur, mini event-emitter (change/selection/mode) pour découpler la sidebar. Corrige la fuite de stages et la perte d'état au changement d'onglet.
- Persistance : débouncer l'autosave (300-500 ms), ne sauver que le projet courant, sortir les images base64 du JSON vers IndexedDB (localStorage plafonne à ~5-10 Mo : UN fond photo peut le remplir).
- Dispatcher clavier global unique avec garde e.target (input/textarea) — remplace le listener du mode dessin et accueille Suppr, Échap, flèches, Ctrl+Z/D/C/V, R.
- Helper "taille écran" centralisé : poignées, épaisseurs de traits, polices et seuils de snap compensés par le zoom (aujourd'hui poignées r=7px → 1,75px effectifs à zoom 0,25 ; tolérances en mètres fixes incohérentes selon le zoom). Prérequis du zoom-curseur et du tactile.
- À moyen terme : unifier rectangles et polygones vers un seul modèle polygone (roomPolygon fait déjà la moitié du travail) — sinon chaque nouvelle interaction (rotation, drag d'arête, snap, portes) coûte deux fois.

## Quick wins (< 1/2 journée)

### Zoom à la molette, centré sur le curseur — 2-3 h
Pattern Konva canonique (~15 lignes, stage.on('wheel') + mousePointTo). Corrige aussi la dérive du zoom boutons actuel (planEditor.js l.687 scale autour de 0,0). Ajouter un indicateur de zoom en % cliquable (reset 100%).

### Touches Suppr, Échap et flèches — 2-3 h
Suppr/Backspace = supprimer la sélection (deleteSelected existe déjà l.663), Échap = désélectionner, flèches = déplacer par pas de 0,5 m (Shift = pas fin). Un seul handler clavier global avec garde e.target (pas dans un input).

### Annuler / Rétablir (Ctrl+Z / Ctrl+Y) + boutons visibles — 0,5 j
Tout l'état est du JSON pur et notify() (l.108) est déjà l'unique point de passage : pile de snapshots JSON.stringify à chaque notify + restore + render, ~60 lignes, 30 niveaux. LE manque bloquant pour un non-technicien.

### Dupliquer (Ctrl+D / Ctrl+C-V) — 2 h
Objets = POJO : clone + newId() + décalage 0,5 m. Vital pour poser 12 tables identiques ou répéter une chambre type.

### Bouton "Tout voir" (recadrer sur le plan) — 2 h
Union des getClientRect() des calques → scale + position. Indispensable : aujourd'hui on peut perdre son plan hors écran sans moyen de retour (ex. pièce poussée en x=-3).

### Cotes en direct pendant déplacement et redimensionnement — 3-4 h
Le label "3,50 m" n'existe qu'en mode dessin (l.497-504). Ajouter un Konva.Label mis à jour sur 'dragmove' et 'transform' : largeur × hauteur + position. Critique pour un outil de plan.

### Survol et curseurs : montrer ce qui est cliquable — 3 h
mouseenter/mouseleave par groupe : contour accentué + curseur move sur objet, grab pour le pan, pointer sur les poignées. Aujourd'hui rien n'indique l'interactivité à un non-technicien.

### Mode actif visible + feedback du calage d'échelle — 3-4 h
Bouton "Dessiner une pièce"/"Caler l'échelle" surligné tant que le mode est actif + bandeau "Mode dessin — Échap pour annuler". Pour le calage : croix au 1er clic + ligne élastique vers le curseur (aujourd'hui fait en aveugle, l.605-628).

### Changer la couleur/le type d'une pièce après création — 2-3 h
Aujourd'hui figé à la création (l.654) et les pièces dessinées restent grises "defaut" (l.523) pour toujours. Un sélecteur/pastilles dans le panneau quand une pièce est sélectionnée.

### Texte libre sur le plan — 0,5 j
Outil texte simple (Konva.Text), 2-3 tailles, double-clic pour éditer. Pour annoter "cloison à démolir", "HSP 2,60 m" — la note-emoji actuelle ne convient pas sur un plan remis au client.

### Tooltips, aide raccourcis "?", boutons grisés sans sélection — 2-3 h
title= sur tous les boutons d'outils, panneau d'aide des raccourcis, griser "Supprimer sélection" quand rien n'est sélectionné (aujourd'hui : aucun feedback). Ajouter touch-action:none sur le canvas et un favicon.

### Verrouiller un objet (cadenas) — 2 h
Le fond de plan a déjà fondLock ; étendre aux pièces/poteaux : flag locked → draggable(false) + style. Évite de bouger une pièce validée par erreur.


## Chantiers moyens (0,5–2 j)

### Menu clic droit (Renommer, Dupliquer, Supprimer, Couleur, Verrouiller) — 1 j
Div HTML positionnée sur stage.getPointerPosition(), contextuel au type d'objet. Mécanisme de découvrabilité n°1 pour un non-technicien (pattern Canva). Aujourd'hui le clic droit ne sert qu'à supprimer un sommet.

### Renommage et saisies directement sur le plan (fin des popups) — 1 j
Remplacer les 4-5 window.prompt() (renommer l.253, note l.314, hauteur plafond l.438, calibration l.613, création projet app.js:67) par un champ texte posé sur le canvas (pattern Konva "Editable text") ou un petit formulaire. Les prompts natifs bloquants font "années 90".

### Guides magnétiques visibles pendant le déplacement — 1-1,5 j
Lignes d'alignement bords/centres façon Figma + aimantation EN DIRECT au dragmove (au lieu du saut à la position aimantée après le lâcher, l.166-171, effet téléportation). Demo Konva officielle "Objects snapping" ; snapToNeighbors (geometry.js:150) réutilisable.

### Ajouter un sommet sur un côté de pièce — 1 j
Double-clic sur un segment du polygone = insérer un point (pointSegmentDistance existe déjà, geometry.js:77). Aujourd'hui on peut supprimer un sommet mais jamais en ajouter : pour un recoin il faut tout redessiner. Ajouter aussi le resize des polygones via Transformer (scale des points au transformend).

### Rotation (mobilier, poteaux, texte, pièces polygonales) — 1-1,5 j
Réactiver la rotation du Transformer (rotateEnabled:false l.61) avec accrochage 15°/45°/90° + touche R = +90°. Pour les polygones : rotation des points autour du centre. NE PAS tourner les rectangles (le modèle x,y,w,h ne le supporte pas — convertir en polygone si besoin).

### Tablette : pincer pour zoomer, 2 doigts pour se déplacer, appui long = menu — 1,5-2 j
Demo Konva "Multi-touch scale" (~40 lignes) + long-press 500 ms remplaçant le clic droit (supprimer un sommet est aujourd'hui impossible au doigt) + poignées agrandies si écran tactile. L'architecte montrera le plan sur iPad chez le client.

### Panneau de propriétés en chiffres (L, H, X, Y en mètres) — 1,5 j
Quand une pièce est sélectionnée : champs éditables liés (les inputs L×H actuels ne servent qu'à la création). Saisir "3,42" est le réflexe métier — le resize à la souris n'est pas de la CAO. Bonus : saisie de longueur au clavier pendant le dessin (pattern AutoCAD) + pas de grille commutable 50/10/1 cm (0,5 m est trop grossier pour de l'agencement).

### Export PDF à l'échelle exacte (1:50, 1:100) + barre d'échelle — 1 j
Chantier le plus rentable de la liste : corrige au passage la déformation du ratio (exportPdf.js l.26) et le cadrage viewport. Tout est en mètres (PX_PER_M=50) : cloner le stage, cadrer sur la bbox du contenu, placer à la taille mm exacte dans jsPDF. Un artisan pourra poser son kutch dessus.

### Outil de cotation (clic 2 points → cote en mètres) — 1,5-2 j
Ligne + traits d'attache + texte, accrochée aux sommets (OSNAP déjà codé), chaînes de cotes, calque "Cotations" masquable. Sans cotes, le livrable est un dessin, pas un plan. Réutilise ~90% du mode dessin existant ; couvre aussi l'outil "mesurer".

### Zones de sol (carrelage, parquet, moquette) avec hachures + m² par zone — 1,5 j
Copier-adapter du pattern faux plafonds (déjà exactement ce mécanisme) : polygone + fillPatternImage avec motifs 8-16 px générés en canvas (hachures 45°, chevrons...). Surface auto via polygonAreaM2 déjà écrit. Répond au "ça fait combien de m² de carrelage ?".

### Grille infinie et adaptative — 1 j
La grille actuelle est un carré fixe de 2400 px (l.102) : on pan dans le vide blanc au-delà. Redessiner la grille visible selon le viewport à chaque pan/zoom, avec maille fine/grosse selon le niveau de zoom.

### Légende automatique + flèche nord — 1 j
Cadre légende généré depuis ce qui est réellement posé (marqueurs, zones de sol, calques visibles), inclus dans l'export ; flèche nord rotative posable. Permet au client de lire le plan seul.


## Chantiers lourds (2 j+)

### Multi-sélection + rectangle de sélection (lasso) + alignement — 3-4 j
Shift-clic pour ajouter/retirer, drag sur zone vide = rectangle de sélection, Ctrl+A, puis aligner/répartir. Exige le refactor sélection unifiée (préalable 3) ET de déplacer le pan sur Espace/clic-molette (le drag-vide est aujourd'hui le pan, stage.draggable l.40). C'est le manque n°1 vs Figma : impossible de déplacer une aile entière du plan.

### Portes et fenêtres posées sur les murs, avec sens d'ouverture — 2-3 j
Objets porte (largeurs 63/73/83/93 cm, arc de débattement Konva.Arc, boutons inverser sens/côté) et fenêtre (double trait) qui s'aimantent sur l'arête de pièce la plus proche et glissent le long (pointSegmentDistance existe). Meilleur ratio effort/crédibilité : permet de vérifier les débattements et les sorties ERP autrement que par un emoji.

### Bibliothèque de mobilier aux vraies dimensions — 2-3 j
15-20 blocs paramétriques dessinés en Konva pur (symboles 2D filaires type plan d'archi, pas d'images) : lit 140/160/180, canapé, table+chaises, bureau, comptoir en L, rayonnage, WC, lavabo, douche, cuisine. Dimensions en cm éditables, rotation, calque "Mobilier" dédié. C'est ce qui fait dire oui au client.

### Pousser un mur (tirer un côté de pièce) — 2 j
Attraper le segment entre 2 sommets et le déplacer perpendiculairement, les 2 sommets suivent (zones de clic invisibles par arête, hitStrokeWidth large). LE geste Sweet Home 3D/Rayon pour ajuster une pièce — déplacer 2 sommets un par un est pénible.

### Cloisons avec épaisseur (version simplifiée) — 2-3 j
PAS de topologie de murs à la Sweet Home 3D (trop risqué en vanilla). Élément "cloison" = polyligne avec épaisseur (7/10/20 cm) rendue en bande pleine grisée, dessinée avec le mode ORTHO existant ; les portes s'y aiment comme sur les arêtes. 90% du besoin métier pour 20% de l'effort.

### Niveaux / étages (RDC, R+1, sous-sol) — 2-3 j
project.niveaux[] avec onglets + option niveau inférieur en filigrane (pattern Sweet Home 3D) ; export PDF = une page par niveau. Surtout un refactor du modèle de données (storage/app.js), l'éditeur change peu. Attendre le premier vrai besoin (duplex, boutique avec réserve).

### Vraie version mobile/tablette du layout — 2 j
Canvas en premier (aujourd'hui sous 2100 px de panneau d'outils), panneau en tiroir/accordéon, palette contraintes accessible, cibles tactiles ≥40 px. Va avec les gestes tactiles (voir moyens) pour l'usage iPad en clientèle.

