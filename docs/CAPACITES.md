# Plans & Ambiances — ce que l'outil sait faire

_Récapitulatif au 05/07/2026 (après le lot 1 « interactions »). App web gratuite, sans installation, qui marche hors-ligne (PWA), utilisable PC / tablette : https://bathmantv.github.io/outil-archi/_

## 🗂 Projets
- Créer / ouvrir / dupliquer / supprimer des projets (nom + client + date).
- Sauvegarde **automatique** dans le navigateur (débouncée), + **export / import `.json`** pour archiver ou passer d'un appareil à l'autre.
- Logo de l'agence chargeable (double-clic sur la marque) → repris sur les exports PDF.

## 📐 Plan 2D — dessin
- **Pièces rectangulaires** : saisie nom + type + L×H en mètres → posées sans chevauchement, **aimantées au bord le plus proche** (magnétisme), grille 0,5 m.
- **Pièces polygonales façon AutoCAD** : dessin point par point (clic), **ORTHO** (verrouillage horizontal/vertical), **accrochage aux sommets** existants (OSNAP), fermeture par Entrée ou clic sur le 1ᵉʳ point, cote du segment affichée pendant le dessin. Recoins / formes en L : déplacer les sommets d'une pièce sélectionnée (clic droit sur un sommet = le supprimer).
- **Faux plafonds** polygonaux (avec hauteur), **poteaux** carrés/ronds à l'échelle (taille en cm).
- **Fond de plan** : importer un plan scanné (image), **caler l'échelle en 2 clics** (distance réelle connue), opacité réglable, verrouillable → on redessine par-dessus.
- **Calques** : afficher/masquer pièces, poteaux, faux plafonds.
- Nom de pièce = type par défaut ; **double-clic = renommer** ; surfaces m² par pièce + **surface totale** en direct.

## 🖱 Interactions (lot 1 — nouveau)
- **Glisser-déplacer fluide** de tout (pièces, poteaux, marqueurs, plafonds).
- **Zoom molette centré sur le curseur**, boutons +/−, **« ⤢ Tout voir »** (recadre sur le plan).
- **Annuler / Rétablir** : Ctrl+Z / Ctrl+Y (40 niveaux) + boutons ↶ ↷.
- **Clavier** : Suppr = supprimer · Échap = désélectionner · **flèches** = déplacer 0,5 m (Shift = 10 cm) · **Ctrl+D** = dupliquer.
- **Cotes en direct** : position (x·y en m) pendant le déplacement, **L × H** pendant le redimensionnement.
- S'adapte à la taille d'écran ; sur mobile le plan passe avant le panneau.

## ⚠️ Contraintes techniques & vigilance
- Marqueurs à poser sur le plan : 💧 eau, ⚡ élec, 🌀 gaine/VMC, 🚪 sortie de secours, ⬛ poteau, 🧱 mur porteur, 🪟 fenêtre, 📝 note (renommable).
- **Points de vigilance automatiques** : pièce d'eau loin d'une arrivée, pièce aveugle, surface mini (chambre < 9 m²), pièce sur poteau/porteur, rappel sortie de secours + **mode ERP/commercial avec effectif**. Clic sur une alerte → surligne la pièce.

## 🧠 Assistant d'agencement
- Choisir un projet (ou uploader un plan de référence) + décrire le programme (« boutique 60 m² : vitrine, caisse, 2 cabines… »).
- Recommandations **par règles métier** (fiable, hors-ligne, sans IA) : réseaux/eau, lumière, structure, circulation PMR/ERP ≥ 140 cm, flux client (entrée→vente→caisse), CHR/extraction, zonage jour-nuit, surfaces — + points de vigilance. Tutoriel intégré.

## 🎨 Ambiances (images IA)
- Formulaire pièce + style + couleurs + matériaux → **image d'ambiance générée** (IA image gratuite, sans clé), régénération en variantes, galerie par projet.

## 📄 Exports
- **Plan en PDF** (A4 paysage, cartouche : logo, projet, client, date, m² total) et **PNG**.
- **PDF projet complet** : plan + toutes les ambiances enregistrées.

## 🔧 Sous le capot
- 100 % statique (HTML/JS vanilla + Konva), zéro serveur, zéro coût, données **chez la cliente** (navigateur). 58 tests automatiques. Déploiement = git push (GitHub Pages).

## 🔜 Prochaines étapes connues (voir docs/AUDIT-INTERACTIONS.md + docs/architecture/)
Quick wins restants (survol/curseurs, couleur modifiable, texte libre, cadenas…), puis menu clic droit, guides magnétiques, rotation, **export PDF à l'échelle exacte 1:50/1:100**, cotations, portes/fenêtres avec battant, bibliothèque de mobilier, multi-sélection, niveaux.
