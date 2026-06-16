# Outil web — Plans 2D + Ambiances IA (architecte d'intérieur)

**Date:** 2026-06-16
**Statut:** Design validé (V1), ajustements prévus avec le client après test V1.

## 1. Contexte & objectif

Patron d'une société d'architecture d'intérieur qui se lance. Besoin d'un outil
**simple, gratuit, sans installation** que le client utilise lui-même pour:

- **A — Plans d'étage 2D**: créer/agencer des pièces, cotes, surfaces, export PDF.
- **B1 — Ambiances IA (texte → image)**: générer des visuels d'ambiance à partir
  d'une description (type pièce, style, couleurs, matériaux).

Contraintes dures: **0 €**, **aucune installation**, **aucun serveur**, **simple
pour un non-technicien**, propre et soigné, bonne ergonomie (utilisable tablette).

## 2. Utilisateurs

- **Le patron / archi d'intérieur** (non-technicien): crée plans + ambiances,
  exporte des PDF pour présenter aux clients finaux.
- Pas de comptes, pas de multi-utilisateur en V1.

## 3. Périmètre V1

- Module A — éditeur de plan 2D **hybride (A3)**: saisie rapide puis ajustement
  glisser-déposer.
- Module B1 — génération d'ambiance **texte → image** via Pollinations.ai.
- Export PDF/PNG avec cartouche/branding.
- Sauvegarde locale (navigateur) + export/import projet `.json`.
- Installable PWA (ajouter à l'écran d'accueil), plan utilisable hors-ligne.

### Hors périmètre V1 (YAGNI)
- Comptes / cloud / multi-utilisateur.
- CAD coté-normé (l'outil reste **niveau concept**, pas plan technique réglementaire).
- B2 (photo de la pièce réelle → relookée) — phase ultérieure.
- Catalogue meubles (blocs simples envisageables en V2).

## 4. Architecture & stack

App web **statique, une page**, tout côté client. Aucun back-end.

| Brique | Choix gratuit |
|---|---|
| Canvas plan 2D (drag/resize) | Konva.js |
| Export PDF | jsPDF |
| Export PNG | canvas natif |
| Images ambiance (B1) | Pollinations.ai (URL, sans clé) |
| Sauvegarde locale | localStorage |
| Portabilité projet | export/import fichier `.json` |
| Hébergement | GitHub Pages (lien unique) |
| App-like / offline | PWA (manifest + service worker) |

UI **FR**, épurée, une couleur d'accent = marque du client, gros boutons tactiles.

## 5. Structure / écrans

Trois zones, navigation simple:

1. **Accueil / Mes projets** — liste de cartes (nom, client, date, miniature).
   Actions: Nouveau, Ouvrir, Dupliquer, Supprimer, Importer/Exporter `.json`.
2. **Éditeur Plan 2D**.
3. **Générateur Ambiance**.

## 6. Module A — Éditeur Plan 2D

- **Panneau gauche (saisie rapide)**: nom pièce + largeur(m) + hauteur(m) + type
  → ajoute un rectangle sur le canvas.
- **Canvas (Konva.js)**: déplacer (souris/doigt), poignées de redimension,
  **aimantation grille 0,5 m**, murs dessinés automatiquement autour de chaque pièce.
- **Affichage temps réel**: cotes sur chaque côté, m² par pièce, **surface totale**.
- **Barre d'outils**: ajouter pièce, porte/fenêtre (marqueurs simples),
  annuler/refaire, zoom, supprimer.
- **Cartouche**: nom projet, client, date, échelle, logo société.

## 7. Module B1 — Générateur d'ambiance

- **Formulaire**: type de pièce (salon/cuisine/chambre/…), style
  (scandinave/moderne/industriel/bohème/…), couleurs dominantes (puces),
  matériaux (bois/marbre/…), champ texte libre.
- **Sous le capot**: construit un prompt optimisé (traduit en EN pour meilleur
  rendu) → appelle l'URL Pollinations → affiche l'image.
- **Actions**: Générer, Régénérer (variation par seed), Télécharger,
  Ajouter au projet.
- **Galerie**: ambiances enregistrées dans le projet.

## 8. Export & branding

- **Plan → PDF** (A4/A3) avec cartouche complet (logo, société, projet, client,
  date, échelle, m² total). Option PNG.
- **Ambiance → PNG**, ou **PDF projet combiné** (plan + ambiances sélectionnées).
- Logo société chargé **une fois**, stocké en localStorage.

## 9. Modèle de données

```
Projet  { id, nom, client, date, logo, pièces[], ouvertures[], ambiances[] }
Pièce   { id, nom, x, y, w, h, type, couleur }
Ouverture { id, type:"porte"|"fenêtre", x, y, rotation }
Ambiance { id, prompt, params, image }
```

Persistance: tableau `Projet[]` en localStorage; export/import `.json` pour
sauvegarde et transfert entre appareils (pas de serveur).

## 10. Gestion des erreurs

- Pollinations lent/indisponible → spinner + bouton réessayer + message timeout.
- localStorage plein → alerte + proposition d'export `.json`.
- Hors-ligne → Plan fonctionne; Ambiance affiche "connexion requise".

## 11. Tests

- **Unitaires**: calcul m², aimantation grille, constructeur de prompt.
- **Checklist manuelle** cross-navigateur: Chrome, Safari, mobile, tablette.

## 12. Livraison & hébergement

- 1 repo GitHub → **GitHub Pages** (lien unique gratuit), déployé une fois.
- **Mini-guide FR** "comment utiliser" pour le client.

## 13. Critères de succès V1

- Le client crée un plan 2D coté + l'exporte en PDF brandé **sans aide**.
- Le client génère ≥ 1 ambiance B1 exploitable depuis une description.
- 0 € de coût récurrent, aucune installation, fonctionne sur son navigateur/tablette.
- Base prête pour itérations avec le client (B2, meubles, ajustements ergonomie).
