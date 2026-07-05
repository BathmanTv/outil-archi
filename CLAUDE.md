# interior-design — Projet client architecture (Hauum)

Dossier de travail du projet client architecture / design d'intérieur.
**Ce dossier EST l'outil** « Plans & Ambiances » (déplacé depuis `outil-archi` le 2026-06-17).

- Repo git : remote `github.com/BathmanTv/outil-archi` (le nom du repo public reste `outil-archi`).
- Live : https://bathmantv.github.io/outil-archi/ · hub `/hub/` · previews Hauum `/hauum/`.
- Stack : statique vanilla JS (Konva, jsPDF, Pollinations image), PWA, tests vitest (`npm test`).
- Déploiement : `git push` (GitHub Pages, SW network-first ; bump `CACHE` dans `sw.js` à chaque deploy).

Landing Hauum (vitrine) : dossier de travail séparé `../hauum-site/` (5 directions, en attente du choix de la cliente).

## Agents projet (`.claude/agents/`, versionnés → dispo PC et Mac)

- **plan-editor-dev** — dev de l'éditeur Konva (`js/planEditor.js`, `js/geometry.js`, `js/checks.js`). À utiliser pour toute feature/bug de l'éditeur ou item de `docs/AUDIT-INTERACTIONS.md`.
- **plan-qa** — QA de l'outil : parcours de régression complet en navigateur (10 étapes). À lancer après tout gros changement de l'éditeur, AVANT release-manager.
- **hauum-webmaster** — site vitrine `hauum/` (warm-organic-v1 retenue) : contenu, brand, noindex, sync `hauum-source/`.
- **seo-local-leads** — SEO local Bordeaux/Arcachon/pharmacie, schema.org, GBP, formulaire leads, checklist lancement hauum.fr.
- **release-manager** — SEUL habilité à commit/push : tests → bump SW → commit FR → push → vérif run Pages → vérif live.

## Règles d'or

1. **Ne JAMAIS détruire un nœud Konva au mousedown** — sélection non-destructive via `syncSelection`, mutation en place (sinon le drag casse).
2. **`notify()` = point de passage unique** de toute mutation d'état (undo/redo, autosave, redraw s'y branchent).
3. **Logique pure dans `geometry.js`/`checks.js` uniquement**, toujours avec test vitest ; `planEditor.js` = Konva/DOM seulement.
4. **Aucune dépendance nouvelle** : vanilla JS + Konva + jsPDF (CDN), zéro build, zéro framework, 0 € récurrent.
5. **Avant tout push : `npm test` vert (58 tests) + bump `CACHE` dans `sw.js` (`outil-archi-vN+1`)** — passer par release-manager.
6. **UTF-8 sans mojibake** : écrire les fichiers via Write/Edit, jamais de re-save PowerShell sans `-Encoding utf8` ; vérifier les accents après édition.
7. **Hauum en noindex** tant que c'est en preview GitHub Pages (retrait seulement au lancement sur hauum.fr).
8. **UI et livrables en français**, simples pour une non-technicienne.
9. Repo public : jamais de secret/token/email client dans les commits ; `git pull` avant toute livraison (sync PC ↔ Mac).
