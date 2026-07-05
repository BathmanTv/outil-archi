# HANDOFF — Projet interior-design (Hauum) — reprise sur une autre machine

But : pouvoir continuer le projet sur un autre poste (ex. Mac) avec tout le contexte.

## Ce qui compose le projet
- **`interior-design/`** (CE repo) = l'outil web **« Plans & Ambiances »** pour archi d'intérieur.
  - Repo GitHub : `https://github.com/BathmanTv/outil-archi` (le nom public reste `outil-archi`).
  - En ligne : https://bathmantv.github.io/outil-archi/ · hub `/hub/` · previews Hauum `/hauum/`.
- **Landing Hauum** = vitrine, 5 directions design (warm-organic, dark-luxe, editorial-mag, kinetic, brutalist-chic). Présente DEUX fois dans ce repo :
  - `hauum/` = previews déployées (noindex) → en ligne sur `/hauum/`.
  - `hauum-source/` = originaux/source de la landing (mirror, noindex).
  - (Le dossier de travail d'origine `E:\Projets\hauum-site` reste en local sur le PC ; tout son contenu est ici dans `hauum-source/`.)

## Reprendre sur Mac (méthode simple)
1. Installer Claude Code : `npm i -g @anthropic-ai/claude-code` (ou l'app desktop). Lancer `claude` une fois pour se connecter.
2. Récupérer le code :
   - `git clone https://github.com/BathmanTv/outil-archi.git interior-design`
   - Pour `hauum-site` (non poussé) : soit le pousser sur GitHub avant de quitter le PC, soit copier le dossier `E:\Projets\hauum-site` sur le Mac.
3. Ouvrir le dossier dans Claude Code (`cd interior-design && claude`). Il lit `CLAUDE.md` + ce `HANDOFF.md` → contexte chargé.
4. (Optionnel) Mémoire : copier le contenu de `C:\Users\darkb\.claude\projects\E--Clause\memory\` vers `~/.claude/projects/<dossier-projet>/memory/` sur le Mac. La reprise du **chat brut** d'une machine à l'autre n'est pas garantie (liée au chemin) — ce HANDOFF + la mémoire suffisent à continuer.

## État actuel (fait)
Outil Plans & Ambiances (statique vanilla JS, Konva/jsPDF, PWA, 39 tests vitest) :
- Plan 2D : pièces aimantées non-chevauchantes, renommage double-clic (pièces + notes), nom = type par défaut, zone de travail plein écran, lien « ↩ Accueil » vers le hub.
- Phase 1 Contraintes techniques : palette (eau, élec, gaine/VMC, sortie secours, poteau, mur porteur, fenêtre, note) → marqueurs déplaçables + panneau « Points de vigilance » (`analyzeLayout`), toggle ERP. Rename = notes uniquement.
- Phase 2 Assistant agencement : onglet dédié, `suggestAgencement` déterministe (règles, pas d'IA) + tuto intégré.
- Ambiances IA image = Pollinations (sans clé). ⚠️ **Pollinations TEXTE bloqué (Turnstile)** → l'assistant est volontairement déterministe. IA texte plus tard = BYO-key / Puter.js / proxy Cloudflare.
- Hub `/hub/` = lanceur listant les projets.

## Workflow dev
- Tests : `npm install` puis `npm test`.
- Lancer en local : `npx serve` (ou `python -m http.server`).
- Déployer : `git push` (GitHub Pages). **Bumper `CACHE` dans `sw.js` à chaque déploiement** (sinon cache navigateur).

## Skill design — UI/UX Pro Max
Installée **globalement** (`~/.claude/skills/ui-ux-pro-max`, via `uipro-cli`) pour TOUS les projets site web — génère des design systems (palettes, typographies, styles, anti-patterns, 161 règles métier). S'auto-active sur les demandes de design web ; à utiliser pour finaliser la landing Hauum + futurs sites.
- Source : https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **Sur le Mac** : `npm i -g uipro-cli` puis `uipro init --ai claude` (depuis le home `~` pour une install globale, ou dans un projet précis). **Restart Claude Code** pour l'activer.


## Documentation de référence (docs/)
- `docs/CAPACITES.md` — récap complet de ce que l'outil sait faire (à jour lot 1 interactions).
- `docs/AUDIT-INTERACTIONS.md` — audit multi-agents : bugs, quick wins, chantiers, préalables.
- `docs/architecture/editor-core.md` — architecture cible v2 de l'éditeur + ordre de migration.
- `docs/architecture/features.md` — blueprints prêts-à-coder (portes/fenêtres, mobilier, cotations, échelle 1:50, DXF, niveaux…), en 3 vagues.
- `docs/architecture/plateforme.md` — vision écosystème (site leads, IA, sync, monétisation) + roadmap 3 horizons.
- `.claude/agents/` — 5 agents projet (plan-editor-dev, plan-qa, hauum-webmaster, seo-local-leads, release-manager) ; règles d'or dans `CLAUDE.md`.

## En attente / prochaine étape
- **Choisir UNE direction pour la landing Hauum** (reco : Warm Organic ou Dark Luxe) → finaliser : vraies photos, retrait du `noindex`, repo + domaine `hauum.fr` pour le SEO réel.
- Les 5 previews Hauum sont en `noindex` (preview interne, pas indexées).
