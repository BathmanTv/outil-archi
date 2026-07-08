# Plateforme "Design Intérieur" — Vision d'architecture et stratégie produit

Document de référence. Dernière mise à jour : 2026-07-05.
Auteur : architecture plateforme (Claude Code).
Public : nous (dev) + la cliente Hauum (les sections marquées 👩‍💼 lui sont lisibles telles quelles).

---

## 0. L'idée en une phrase

Toutes les briques existantes (outil de plans, ambiances IA, assistant d'agencement, site vitrine, formations) deviennent **une seule machine à trois sorties** :

- **Leads** : le site Hauum attire des pharmacies et commerces, le formulaire qualifie, le Google Business Profile capte le local.
- **Production** : l'outil Plans & Ambiances fait gagner du temps sur chaque mission (relevé → plan → contraintes → ambiances → PDF client).
- **Image** : chaque livrable (PDF brandé, ambiance IA, plan partageable) porte la marque Hauum et redevient un argument commercial (portfolio, études de cas).

La boucle vertueuse visée : **site → lead → mission produite avec l'outil → livrable brandé → étude de cas sur le site → meilleur SEO → plus de leads.**

Contraintes non négociables : statique, GitHub Pages, 0 € récurrent, vanilla JS + Konva, utilisable par une non-technicienne, tout en français.

---

## 1. Cartographie de l'existant et des flux

### 1.1 Les briques

| Brique | Où | Qui l'utilise | Quand |
|---|---|---|---|
| Outil Plans & Ambiances | `index.html` + `js/` (PWA, localStorage) | La cliente (seule utilisatrice aujourd'hui) | Pendant une mission : relevé, esquisse, vérification ERP, ambiances, export PDF |
| Éditeur de plan (Konva) | `js/planEditor.js` + `geometry.js` | La cliente | Phase esquisse / avant-projet |
| Points de vigilance (checks ERP) | `js/checks.js` | La cliente | Auto, à chaque modification du plan |
| Assistant d'agencement | `suggestAgencement` | La cliente | Début de projet, pour dégrossir |
| Ambiances IA (images Pollinations) | `js/ambiance.js` | La cliente | Phase concept / présentation client |
| Export PDF/PNG | `js/exportPdf.js` (jsPDF) | La cliente → remis au client final | Fin d'esquisse, rendez-vous client |
| Site vitrine Hauum | `hauum/` (warm-organic-v1, noindex) | Prospects (pharmaciens, commerçants, CHR) | Découverte, prise de contact |
| Formations Qualiopi | Contenu dans le site Hauum | Prospects formation | Découverte |
| Hub | `hub/` | Nous + la cliente | Point d'entrée vers tout |

### 1.2 Les trois flux métier

**Flux A — Acquisition (aujourd'hui incomplet)**
Prospect → Google / bouche-à-oreille → site Hauum → **mailto** (point faible : aucun lead qualifié, aucune trace) → échange → mission.
Cible phase 2 : prospect → recherche locale ("architecte intérieur pharmacie Bordeaux") → page secteur×ville → formulaire qualifiant → email structuré chez la cliente → réponse sous 24 h.

**Flux B — Production (le plus mature)**
Mission signée → nouveau projet dans l'outil → fond de plan photo + calage échelle → pièces + contraintes techniques → panneau vigilance ERP → variantes d'agencement → ambiances IA → export PDF → présentation client. Tout tient dans le navigateur, zéro coût, zéro compte.

**Flux C — Preuve (aujourd'hui inexistant, c'est le chaînon manquant)**
Livrable produit → (rien). Cible : livrable → étude de cas anonymisée ou autorisée sur le site → portfolio d'ambiances → crédibilité → Flux A renforcé. La section 3 détaille ce pont.

### 1.3 Ce qui manque pour que ce soit "une plateforme" et pas trois outils

- Aucun pont outil → site (les productions ne nourrissent pas la vitrine).
- Aucun pont site → outil (un lead n'ouvre pas automatiquement un projet).
- Les données vivent dans le localStorage d'UN navigateur d'UNE machine (risque de perte, pas de multi-appareils) — voir section 5.
- Pas de mesure : on ne sait ni combien de visiteurs, ni d'où ils viennent — voir section 2.5.

---

## 2. Site Hauum — Phase 2 (machine à leads)

Référence : `hauum/Analyse-evolution-Hauum.docx` (formulaire qualifiant > mailto, preuve chiffrée, multi-pages secteur×ville, GBP, retrait noindex au lancement).

### 2.1 Architecture multi-pages SEO

Arborescence cible sur `hauum.fr` (tout statique, HTML plat, un fichier par page — pas de générateur imposé ; si le volume dépasse ~20 pages, un mini-script Node local de templating est acceptable car il tourne sur notre machine, pas en build CI) :

```
/                                  Accueil (warm-organic-v1 actuel)
/agencement-pharmacie/             Page pilier secteur n°1 (la plus travaillée)
/agencement-pharmacie/bordeaux/    Secteur × ville
/agencement-pharmacie/arcachon/
/agencement-pharmacie/la-teste-de-buch/
/agencement-commerce/              Page pilier secteur n°2
/agencement-commerce/bordeaux/
/agencement-restaurant-chr/        Page pilier secteur n°3
/realisations/                     Index des études de cas
/realisations/<slug-projet>/       1 page par étude de cas
/formations/                       Index Qualiopi
/formations/<slug-formation>/      1 page par formation (programme, durée, public, prix, financement)
/blog/                             Index articles
/blog/<slug-article>/
/faq/                              FAQ globale (+ balisage FAQPage)
/contact/                          Formulaire principal
/mentions-legales/  /confidentialite/
```

Règles de contenu (à appliquer, pas à discuter) :

- **Secteur×ville** : chaque page doit avoir ≥ 40 % de contenu réellement unique (contraintes locales, exemples, chiffres du secteur dans la ville), sinon Google la traite en quasi-doublon. Démarrer avec 3 villes × 1 secteur (pharmacie) et n'étendre que si les premières indexent et rankent. Ne JAMAIS générer 50 pages d'un coup.
- **Études de cas** : structure fixe — contexte / contrainte / solution / résultat chiffré (CA, panier moyen, flux, délai) / 2-3 visuels (dont ambiances générées par l'outil). Le chiffre est obligatoire, même approximatif ("+15 % de panier moyen estimé").
- **Blog** : 1 article/mois suffit. Sujets = questions réelles des prospects ("Quelles normes ERP pour une pharmacie ?", "Combien coûte un réagencement d'officine ?"). Chaque article pointe vers la page secteur correspondante.
- **Formations** : une page par formation avec le balisage `Course` schema.org + mention Qualiopi + modalités de financement (OPCO) — c'est un différenciateur fort, il mérite mieux qu'une section.
- **FAQ** : balisage JSON-LD `FAQPage` sur `/faq/` ET des mini-FAQ de 3 questions en bas des pages secteur (balisées aussi).
- Maillage interne systématique : accueil → piliers → villes → études de cas → contact. Fil d'Ariane avec `BreadcrumbList`.
- JSON-LD `LocalBusiness` (ou `ProfessionalService`) sur toutes les pages : nom, zone (Bordeaux + Bassin d'Arcachon), téléphone, `areaServed`.

### 2.2 Formulaire de leads sans backend

Comparatif des options gratuites compatibles statique :

| Option | Gratuit | Limites free | RGPD/EU | Verdict |
|---|---|---|---|---|
| **Web3Forms** | Oui | 250 envois/mois, clé publique côté client | Serveurs US mais pas de stockage des soumissions (relai email pur) | **Recommandé** : pas de compte pour la cliente, la clé est liée à son email, rien n'est stocké chez eux |
| Formspree | Oui | 50 envois/mois seulement | US, stocke les soumissions | Limite trop basse |
| FormSubmit.co | Oui | Illimité annoncé | Opaque, spam fréquent | Non |
| Netlify Forms | Non applicable | Exige hébergement Netlify | — | Non (on est sur GitHub Pages) |

**Décision : Web3Forms.** 250/mois est très au-dessus du besoin (objectif réaliste : 5-20 leads/mois).

Implémentation :
- `fetch POST` vers l'API Web3Forms en JS vanilla, avec fallback `<form action>` natif si JS désactivé.
- Champ **honeypot** (`botcheck`) fourni nativement par Web3Forms — pas de captcha visible (friction inutile pour ce volume).
- Champs qualifiants (c'est le cœur, cf. Analyse-evolution) : type de projet (pharmacie / commerce / restaurant / autre), ville, surface approximative, échéance (< 3 mois / 3-6 / plus tard), budget indicatif (fourchettes), message libre, téléphone optionnel, email requis, **case de consentement RGPD obligatoire non pré-cochée**.
- Sujet d'email généré : `[Lead Hauum] Pharmacie — Bordeaux — < 3 mois` pour un tri à vue dans la boîte de la cliente.
- Page `/merci/` après envoi (sert aussi d'objectif de conversion pour l'analytics).

### 2.3 Google Business Profile (gratuit, ROI le plus élevé de toute la phase 2)

À faire PAR la cliente (on prépare, elle valide, car vérification par courrier/vidéo à son nom) :
- Créer la fiche "Hauum — Architecte d'intérieur" ; catégorie principale **Architecte d'intérieur**, secondaires : Designer d'espace, Organisme de formation.
- Zone desservie : Bordeaux + Bassin d'Arcachon (fiche "service area" sans adresse publique si elle travaille de chez elle).
- 10+ photos réelles de réalisations (pas d'images IA sur GBP — risque de signalement), lien vers hauum.fr, lien direct vers `/contact/`.
- Rythme d'entretien simple pour une non-technicienne : 1 post GBP/mois (une photo + 3 lignes) et demander un avis Google à CHAQUE client livré (préparer un SMS type avec le lien direct d'avis).
- Cohérence NAP (nom, zone, téléphone) strictement identique entre GBP, site et annuaires (Pages Jaunes, Houzz).

### 2.4 Analytics respectueux et gratuit

| Option | Coût | RGPD sans bannière | Verdict |
|---|---|---|---|
| **GoatCounter** | Gratuit (donationware) | Oui (pas de cookies, pas de données perso) | **Recommandé** : compte gratuit hébergé, un `<script>` d'une ligne, dashboard lisible par la cliente |
| Plausible | 9 €/mois (cloud) ; self-host impossible en statique | Oui | Non : viole la règle 0 € |
| Umami cloud | Free tier limité, pérennité incertaine | Oui | Plan B |
| GA4 | Gratuit | NON (bannière consentement obligatoire, CNIL) | Non : complexité + bannière moche |

**Décision : GoatCounter.** Suivre uniquement : visites par page, référents, et les vues de `/merci/` (= conversions). C'est tout ce dont la cliente a besoin pour décider.

### 2.5 Checklist de lancement hauum.fr (dans l'ordre, cocher au fur et à mesure)

1. [ ] Acheter `hauum.fr` (au nom de LA CLIENTE, pas le nôtre — ~7 €/an chez OVH/Gandi, seule dépense de toute la plateforme).
2. [ ] Décision d'architecture repo : **sortir `hauum/` dans son propre repo** `hauum-site` avec GitHub Pages + domaine custom. Raison : un domaine custom GitHub Pages s'applique à tout le repo ; garder le site dans `outil-archi` lierait le domaine de la cliente à notre repo outil. (Conforme aussi à la règle "projets clients = repos standalone".)
3. [ ] Configurer le domaine : fichier `CNAME` dans le repo, enregistrements DNS `A` (185.199.108-111.153) + `CNAME www`, forcer HTTPS dans les settings Pages.
4. [ ] **Retirer TOUTES les balises `noindex`** (grep systématique : `grep -r "noindex" hauum/` doit rendre zéro résultat hors archive/).
5. [ ] Vérifier que `archive/` (les 4 directions écartées) et `warm-organic-v2` ne partent PAS en prod (les exclure du repo hauum-site, ou `noindex` + exclusion sitemap).
6. [ ] Générer `sitemap.xml` (à la main ou petit script — < 30 URLs) + `robots.txt` pointant vers le sitemap.
7. [ ] Canonicals absolus `https://hauum.fr/...` sur chaque page.
8. [ ] Google Search Console : vérifier le domaine (DNS TXT), soumettre le sitemap. Idem Bing Webmaster (2 min, gratuit).
9. [ ] Redirections depuis l'ancienne URL preview `bathmantv.github.io/outil-archi/hauum/` : GitHub Pages ne fait pas de 301 → mettre une page avec `<meta http-equiv="refresh">` + `canonical` vers hauum.fr + lien cliquable.
10. [ ] Brancher Web3Forms (tester un envoi réel de bout en bout, vérifier le dossier spam de la cliente).
11. [ ] Brancher GoatCounter.
12. [ ] Pages légales : mentions légales + politique de confidentialité (obligatoires dès qu'il y a un formulaire — voir 6.3).
13. [ ] Test mobile réel (iPhone + Android), Lighthouse ≥ 90 partout, images en WebP avec `loading="lazy"`.
14. [ ] Lancer le GBP en parallèle (2.3) — il met 1-3 semaines à être vérifié, commencer tôt.
15. [ ] J+7 et J+30 : vérifier l'indexation dans Search Console (`site:hauum.fr`).

---

## 3. Intégrations outil ↔ site (le chaînon "preuve")

Principe directeur : **rien de temps réel, tout par fichiers**. En statique sans backend, l'intégration = "l'outil exporte des fichiers propres, le site les affiche". C'est simple, robuste et ça suffit.

### 3.1 Portfolio d'ambiances généré depuis l'outil

- Dans l'outil, ajouter un bouton **"Ajouter au portfolio"** sur chaque ambiance générée : télécharge l'image (déjà possible) + un petit `meta.json` (titre, secteur, ville, date, description auto).
- Côté site, un dossier `realisations/assets/` + un script local (Node, lancé par nous à chaque mise à jour, jamais en CI) qui régénère la grille HTML du portfolio à partir des `meta.json`.
- Workflow cliente, version zéro-technique : elle nous envoie l'image + 3 lignes ; on publie. Version 2 (si elle devient autonome) : elle glisse les fichiers dans le repo via l'interface web GitHub ("Add file → Upload files") — c'est faisable pour une non-technicienne avec une fiche pas-à-pas d'une page.
- Règle éditoriale : les ambiances IA sont toujours étiquetées "visuel d'intention généré par IA" sur le site — honnêteté = confiance, et ça évite toute déception client.

### 3.2 Plan en lecture seule partageable au client final

Objectif : la cliente envoie un lien, le pharmacien voit son plan dans le navigateur, sans compte, sans pouvoir rien casser.

Architecture retenue (2 étages, du plus simple au plus riche) :

- **Étage 1 — lien auto-portant (recommandé d'abord)** : "Partager → copier le lien" sérialise le projet JSON → compression `CompressionStream('gzip')` (natif navigateur) → base64url → fragment d'URL `viewer.html#p=<data>`. Le fragment (`#`) n'est jamais envoyé au serveur ni loggé par GitHub Pages : le plan du client ne transite par aucun tiers. `viewer.html` = page dédiée du repo outil qui charge Konva en mode lecture seule (pas de handlers d'édition, juste zoom/pan + calques + cotes). Limite : ~20-50 Ko de JSON compressé passent confortablement dans une URL (les navigateurs modernes tiennent > 64 Ko ; attention seulement si le lien passe par des outils qui tronquent). Les projets AVEC fond de plan image dépassent → l'étage 1 partage le plan sans l'image de fond, avec un message clair.
- **Étage 2 — fichier .hauum.json + viewer** : "Partager → télécharger le fichier de partage" produit un JSON lecture-seule (flag `readonly:true`, image de fond incluse) ; le client ouvre `viewer.html` et glisse le fichier dessus. Moins fluide qu'un lien mais sans limite de taille et toujours zéro serveur.
- Non retenu : tout ce qui exige un stockage tiers (pastebin, gist, Firebase) — dépendance, RGPD, et contraire au 0 €.

### 3.3 Exports brandés

- L'export PDF (`exportPdf.js`) prend l'identité Hauum : logo (déjà dans `hauum/assets/logos/`), palette #53362E/#FAF6EB, pied de page "Hauum — Architecte d'intérieur — hauum.fr — SIRET", numéro/date de version du plan.
- Gabarit de page : cartouche type "plan d'architecte" (projet, client, échelle, date, indice de révision) — crédibilise énormément face à un pharmacien habitué aux plans de labos d'agencement.
- Le PDF devient ainsi un support publicitaire : chaque client final qui le fait suivre diffuse la marque.
- Dépend du chantier "export PDF échelle exacte 1:50/1:100" déjà identifié dans `docs/AUDIT-INTERACTIONS.md` (chantier moyen) — les deux se font ensemble.

### 3.4 Site → outil

- Léger et suffisant : sur la page `/merci/` et dans l'email de lead, un lien "préparez votre rendez-vous : listez vos contraintes" vers une page simple (pas l'outil complet — trop intimidant pour un prospect).
- Ne PAS exposer l'outil complet aux prospects : c'est un outil de production interne, son ouverture au public est le sujet de la section 7, pas un canal d'acquisition.

---

## 4. IA — après la mort de l'API texte Pollinations

État : les **images** Pollinations marchent toujours (sans clé) → les ambiances ne sont pas cassées. Le **texte** (descriptions, assistant rédactionnel) n'a plus de fournisseur gratuit sans clé fiable.

### 4.1 Les trois architectures possibles

**Option A — BYO-key (la cliente colle sa propre clé API, stockée en localStorage)**
```
Navigateur (clé en localStorage) ──HTTPS──> api.anthropic.com (ou api.openai.com)
```
- Anthropic supporte les appels navigateur via l'en-tête `anthropic-dangerous-direct-browser-access: true` ; OpenAI ne le permet pas (CORS) → si option A, c'est **Claude**.
- Coût : à l'usage, à la charge de la cliente. Haiku ≈ centimes/mois pour son volume (quelques descriptifs par semaine). Reste "0 € récurrent" pour NOUS.
- Sécurité : la clé ne quitte pas son navigateur, MAIS elle est en clair dans localStorage. Acceptable car : machine personnelle, clé restreinte avec plafond de dépense configuré à 5-10 $/mois dans la console Anthropic.
- UX : le point dur. Créer un compte Anthropic + générer une clé, c'est la partie la plus technique jamais demandée à la cliente. Réponse : fiche pas-à-pas illustrée d'une page + on le fait avec elle en visio une fois. Écran de réglages dans l'outil : un champ "clé", un bouton "tester", un message vert/rouge. Rien d'autre.

**Option B — Proxy Cloudflare Worker (free tier)**
```
Navigateur ──> Worker (notre clé en secret, CORS restreint à hauum.fr/outil, rate-limit) ──> API Anthropic
```
- Free tier : 100 000 requêtes/jour — infiniment suffisant.
- Avantage : zéro friction pour la cliente (ça marche, point).
- Inconvénients : c'est NOUS qui payons les tokens (viole l'esprit 0 €, même si c'est des centimes) ; on devient un point de défaillance et un engagement de maintenance à vie ; la clé est protégeable mais le endpoint est spammable (mitigé par CORS + rate-limit KV + petit token d'app, jamais parfait sur un site statique).
- Pertinent seulement si l'outil devient multi-utilisateurs (section 7).

**Option C — Puter.js ("user pays")**
- SDK qui fait payer les appels IA sur le compte Puter de l'utilisateur final, gratuit pour le développeur.
- Rejeté comme fondation : dépendance à une startup au modèle économique jeune (risque Pollinations-bis exactement), compte tiers imposé à la cliente, opacité des modèles réellement servis. Peut servir de solution de secours jetable, pas de socle.

### 4.2 Recommandation

**Option A (BYO-key Claude) maintenant, Option B seulement si un jour plusieurs utilisateurs.**
Justification : A est la seule architecture sans NOUS dans la boucle des coûts et de la disponibilité ; la friction de configuration est payée une seule fois ; et elle nous immunise contre une deuxième "mort de Pollinations" (la cliente possède sa relation au fournisseur). Implémentation : module `js/ia.js` unique avec une interface `generateText(prompt)` qui lit la config (fournisseur + clé) — si un jour on passe à l'option B, seul ce module change.

Garde-fous dans l'outil : afficher un compteur approximatif d'usage ("~X appels ce mois"), bouton "supprimer ma clé", et dégradation propre : si pas de clé, les fonctions IA texte sont grisées avec un lien "activer l'IA (2 min)" — l'outil reste 100 % fonctionnel sans.

### 4.3 Usages IA à forte valeur (par ROI décroissant)

- **Descriptif de projet auto** (texte, option A) : à partir du JSON du plan (pièces, surfaces, contraintes, effectif ERP calculé par checks.js), générer la note descriptive d'avant-projet en français pro. C'est 1-2 h de rédaction économisées PAR PROJET — le meilleur ROI de toute la section IA. Le prompt embarque les données structurées du plan, pas une image.
- **Variantes d'agencement commentées** : `suggestAgencement` (règles) propose déjà ; l'IA texte ajoute la justification vendeuse ("le comptoir en fond de parcours augmente l'exposition aux ventes complémentaires…"). L'IA COMMENTE les variantes issues des règles, elle ne les génère pas (fiabilité géométrique = règles, discours = IA).
- **Moodboard semi-auto** : 4-6 images Pollinations (toujours gratuit) à partir d'un prompt construit depuis le style choisi + le secteur, composées en une planche via canvas → intégrée à l'export PDF. Améliore `js/prompt.js` existant.
- **Aide à la rédaction des études de cas du site** : depuis le descriptif de projet, générer le brouillon de la page `/realisations/`. Boucle Flux C bouclée.
- Non prioritaire : chat généraliste dans l'outil (gadget), génération de plan par IA (illusoire en fiabilité, les règles font mieux).

---

## 5. Données — sauvegarde, sync, versioning sans serveur

Le risque n°1 de toute la plateforme aujourd'hui : **les projets de la cliente vivent dans le localStorage d'un seul navigateur**. Un "vider les données de navigation" = tout perdu. C'est le chantier robustesse prioritaire.

### 5.1 Sauvegarde locale renforcée (à faire en premier)

- **IndexedDB au lieu de localStorage** pour les projets ET les images de fond (déjà identifié comme préalable dans AUDIT-INTERACTIONS.md ; localStorage plafonne à ~5 Mo, une seule photo de plan peut le saturer). Migration transparente au premier lancement.
- `navigator.storage.persist()` au démarrage : demande au navigateur de ne jamais purger le stockage du site. Une ligne, gain énorme.
- **Export auto .json** : à chaque fermeture de session de travail (ou toutes les N modifications), proposer/déclencher le téléchargement d'un `hauum-backup-AAAA-MM-JJ.json` complet. La cliente a pour consigne simple : "ce fichier va dans ton dossier Hauum synchronisé" (voir 5.2).

### 5.2 Multi-appareils (PC ↔ Mac ↔ iPad de la cliente)

Options examinées :

- **File System Access API** (`showSaveFilePicker` + handle persistant) : l'outil lit/écrit directement un fichier projet dans un dossier choisi. Chrome/Edge OK, **Safari et Firefox non** (API absente ou partielle). La cliente est potentiellement sur Mac/Safari → utilisable en amélioration progressive, pas comme socle.
- **API Dropbox/Drive** : OAuth, tokens à rafraîchir, review d'app Google, quotas… complexité disproportionnée pour une utilisatrice. Rejeté en v1.
- **Décision : "le dossier synchronisé fait la sync".** L'outil exporte/importe des .json ; la cliente les range dans un dossier Dropbox/Drive/iCloud qu'elle a déjà. La synchronisation est déléguée à un outil qu'elle maîtrise. Zéro code d'auth, zéro serveur, fonctionne partout. L'outil facilite : bouton "Exporter tout", import par glisser-déposer du fichier sur la fenêtre, détection "ce fichier est plus récent que ta version locale, remplacer ?" (comparaison de timestamps embarqués dans le JSON).

### 5.3 Versioning de projets

- Chaque sauvegarde embarque `{schemaVersion, projectId, savedAt, appVersion}`.
- **Snapshots nommés** : bouton "figer une version" ("Avant-projet v1 présenté le 12/07") → copie immuable dans IndexedDB, listée dans un panneau "Versions", restaurable en un clic. C'est l'undo/redo par snapshots JSON existant, promu en persistant — le mécanisme est déjà là via `notify()`.
- Rétention simple : garder toutes les versions nommées + les 10 dernières autos ; au-delà, proposer l'export avant purge.
- **Migrations de schéma** : fonction `migrate(json)` centralisée à l'import, avec tests vitest par version de schéma (le harnais de tests existe déjà, 58 verts).

### 5.4 Templates de projets réutilisables

- "Enregistrer comme modèle" : le projet, débarrassé des données client (nom, fond de plan), devient un template : "Pharmacie 80-120 m²", "Boutique centre-ville", "Restaurant 50 couverts" — avec les marqueurs de contraintes types déjà posés (eau, élec, secours) et les checks ERP du secteur pré-paramétrés.
- Nouveau projet → choix "vierge ou depuis un modèle". Gain de temps massif sur la cible pharmacie (missions structurellement similaires) et rampe vers la standardisation nécessaire à la section 7.
- 3-4 templates de départ construits AVEC la cliente à partir de ses vraies missions.

---

## 6. Sécurité, robustesse, RGPD

### 6.1 Quotas et limites à surveiller

| Ressource | Limite | Mitigation |
|---|---|---|
| localStorage | ~5 Mo | Migration IndexedDB (5.1) |
| IndexedDB | Généreux mais purgeable | `storage.persist()` + export auto |
| Web3Forms free | 250 emails/mois | Alerte au-delà improbable ; honeypot anti-spam |
| Pollinations images | Gratuit, sans SLA, peut mourir comme le texte | Interface `generateImage()` isolée dans `ambiance.js` pour pouvoir changer de fournisseur en un fichier ; les images déjà générées sont sauvegardées localement |
| Clé Claude (option A) | Budget de la cliente | Plafond de dépense côté console Anthropic + compteur dans l'outil |
| GitHub Pages | 100 Go bande passante/mois, soft | Non-problème à cette échelle |
| Cache PWA | Version 'outil-archi-vN' | **Bumper à CHAQUE deploy** (règle existante, à ne jamais oublier — c'est la cause n°1 de "ça ne se met pas à jour") |

### 6.2 Backups (règle 3-2-1 adaptée au gratuit)

Trois copies des projets : IndexedDB (travail) + fichier .json dans le dossier synchronisé (5.2) + l'historique du dossier Dropbox/Drive (versioning gratuit 30 jours inclus). Le code, lui, est dans git — rien à faire de plus.

### 6.3 RGPD basique pour le formulaire (obligatoire au lancement, pas optionnel)

- Base légale : mesures précontractuelles à la demande du prospect (art. 6.1.b) — pas besoin de consentement pour TRAITER la demande, mais la case de consentement reste requise pour toute réutilisation (newsletter, relance commerciale au-delà de la demande).
- Page `/confidentialite/` en français simple : qui collecte (la cliente, nom + SIRET), quoi (les champs du formulaire), pourquoi (répondre à la demande), où ça transite (Web3Forms, relai email, pas de stockage), durée (emails gardés 3 ans max puis supprimés), droits (accès/rectification/suppression : écrire à l'email de contact).
- Pas de bannière cookies nécessaire : GoatCounter est sans cookies, le site n'en pose aucun. C'est un argument de propreté à garder (donc : jamais de GA4, de pixel Meta, de fonts Google en hotlink — auto-héberger les fontes, attention au piège des subsets vietnamiens déjà rencontré sur d'autres projets : ici vérifier simplement que les fontes auto-hébergées couvrent le français complet, ligatures et accents).
- Consigne cliente (une ligne) : les emails de leads restent dans sa boîte, pas de copie dans un Excel partagé n'importe où.
- L'outil de plans, lui, ne traite aucune donnée personnelle de tiers tant que les projets restent locaux — rien à faire de spécial, le mentionner dans la politique si le viewer partagé (3.2) est utilisé (le lien contient le plan : dire à la cliente de ne pas y mettre de données sensibles, un plan de pharmacie n'en contient pas).

### 6.4 Robustesse applicative

- Garder la règle d'or existante (ne jamais détruire un nœud au mousedown) et le point de passage unique `notify()` — toute nouvelle fonctionnalité passe par eux.
- Les préalables listés dans AUDIT-INTERACTIONS.md (réconciliation totale du rendu, sélection unifiée, éditeur singleton, dispatcher clavier) sont les fondations des chantiers des sections 3 et 5 : le viewer lecture seule (3.2) réutilise la réconciliation du rendu ; IndexedDB (5.1) est déjà listé comme préalable. **Faire les préalables avant d'empiler.**
- Tests : tout nouveau module de données (migrations, partage, templates) arrive avec ses tests vitest. Le seuil "58 verts" ne descend jamais.

---

## 7. Monétisation éventuelle — revendre l'outil à d'autres archis

À n'ouvrir QUE si la cliente le demande. Analyse honnête :

### 7.1 Ce qui est réaliste en restant statique/0 €

- **White-label par configuration** : un fichier `brand.json` (logo, palette, nom, pied de page PDF) + un déploiement GitHub Pages par client (fork ou branche). Coût marginal quasi nul, notre modèle = forfait de setup (ex. 300-500 € une fois) + éventuel forfait annuel de mise à jour. C'est de la prestation, pas du SaaS — et c'est très bien à cette échelle.
- La cliente peut le proposer à son réseau (archis non concurrents, autres régions) — l'outil devient pour elle une source de revenus annexe et un objet de notoriété ("l'architecte qui a son propre logiciel").

### 7.2 Ce qui casserait le modèle (limites à énoncer clairement à la cliente)

- Comptes utilisateurs, paiement récurrent, collaboration temps réel, support garanti = serveur + coûts + obligations (RGPD sous-traitant, SLA, support). Ce n'est plus 0 €, plus statique, et plus un projet du soir.
- Le marché des outils de plan est occupé par des acteurs lourds (SketchUp, HomeByMe, kozikaza…). La niche défendable n'est PAS "outil de plan généraliste" mais **"outil de conception d'agencement ERP commerce/pharmacie, en français, avec checks réglementaires intégrés"** — les checks ERP de `checks.js` et les templates sectoriels (5.4) sont le vrai différenciateur. Toute stratégie de revente doit vendre ÇA.
- Prérequis techniques avant toute revente : préalables d'AUDIT-INTERACTIONS.md faits, IndexedDB, migrations de schéma testées, doc utilisateur d'une dizaine de pages. Sinon on vend de la dette.

### 7.3 Critère de décision

On n'investit dans le white-label QUE si : (a) la cliente a un premier acheteur concret identifié, et (b) l'outil a tourné 3 mois en production sur ses propres missions sans perte de données. Pas de produit avant la preuve d'usage interne.

---

## 8. Roadmap à trois horizons

### Horizon 1 — MAINTENANT (juillet-août 2026) : sécuriser et lancer

Objectif : hauum.fr en ligne et les données de la cliente à l'abri.

- Données : `storage.persist()` + migration IndexedDB + export auto .json (section 5.1). **Avant tout le reste** : c'est le seul risque de perte irréversible.
- Site : checklist de lancement complète (2.5) — domaine, repo dédié, noindex retiré, Web3Forms, GoatCounter, pages légales, sitemap, Search Console.
- GBP créé et en cours de vérification (2.3).
- Quick wins outil déjà listés dans l'audit (hover/curseurs, cadenas, mode actif visible) au fil de l'eau.
- Export PDF brandé Hauum (3.3, version simple sans échelle exacte).

**Critères de passage à l'horizon 2** : hauum.fr indexé (site: renvoie les pages), ≥ 1 lead reçu par le formulaire, zéro perte de données sur 4 semaines d'usage réel, GBP vérifié.

### Horizon 2 — 3 MOIS (sept-nov 2026) : la boucle de preuve

Objectif : le Flux C existe et les leads deviennent mesurables.

- Site : 3 pages secteur×ville pharmacie + 2 études de cas chiffrées + 2 articles de blog + pages formations détaillées avec balisage Course + FAQ balisée (2.1).
- Outil→site : bouton "ajouter au portfolio" + grille réalisations régénérée (3.1).
- Partage client : viewer lecture seule étage 1 (lien auto-portant) (3.2).
- IA : option A branchée (module `ia.js`, réglage clé, descriptif de projet auto) (4.2, 4.3).
- Templates de projets : 3 modèles construits avec la cliente (5.4).
- Multi-appareils : workflow dossier synchronisé documenté pour la cliente + import glisser-déposer (5.2).
- Export PDF échelle exacte 1:50/1:100 + cartouche (chantier moyen de l'audit, couplé à 3.3).

**Critères de passage à l'horizon 3** : ≥ 5 leads formulaire cumulés, ≥ 1 mission produite de bout en bout dans l'outil (plan → ambiance → PDF → étude de cas publiée), la cliente utilise les templates sans assistance, GoatCounter montre du trafic organique entrant sur les pages secteur.

### Horizon 3 — 1 AN (mi-2027) : approfondir ou étendre (choix selon les chiffres)

Trois pistes, à arbitrer avec les données des horizons 1-2, pas toutes en même temps :

- **Piste production** (si les missions affluent) : chantiers lourds de l'audit dans l'ordre des préalables — réconciliation du rendu, multi-sélection, portes/fenêtres avec battant, bibliothèque mobilier aux vraies dimensions, cloisons à épaisseur. L'outil devient un vrai mini-CAD métier.
- **Piste acquisition** (si le SEO prend) : extension secteur×ville (commerce, CHR × 5-6 villes), 1 article/mois tenu, campagne d'avis GBP, éventuellement multi-pages formations avec inscription par formulaire.
- **Piste produit** (si un acheteur white-label concret existe, cf. 7.3) : `brand.json`, doc utilisateur, durcissement migrations/tests, premier déploiement payant.

**Signaux d'alerte transverses** à re-vérifier chaque trimestre : Pollinations images encore vivant ? (sinon basculer `generateImage()` — l'abstraction est prête) ; quotas Web3Forms/GoatCounter toujours gratuits ? ; cache PWA bumpé à chaque deploy ? ; backup .json de moins de 30 jours existant ?

---

## 9. Pascal — la brique 3D (évaluée 2026-07, gardée en réserve)

**Quoi** : [Pascal](https://editor.pascal.app) ([pascalorg/editor](https://github.com/pascalorg/editor), MIT, ~17k ⭐) — éditeur 3D de bâtiments open source dans le navigateur : murs/mobilier/matériaux, croquis→géométrie par IA, **visite en première personne**, packages npm (`@pascal-app/core|viewer`), import IFC, serveur MCP (pilotage par agent IA).

**Verdict d'intégration** : stack React 19 + Next 16 + Three.js WebGPU + bun → **incompatible avec nos règles d'or** (vanilla, zéro build, simplicité). On ne l'embarque PAS dans l'outil et on ne réécrit RIEN dessus. Notre 2D métier (cotes, ERP, vigilance, exports) reste notre force — Pascal ne la couvre pas.

**Usage retenu — complément « présenter »** :
- Court terme (0 effort) : l'app hébergée editor.pascal.app est gratuite → la cliente peut y remonter un projet phare à la main pour offrir une **visite 3D immersive** au client final. Effet waouh en réunion, sans rien changer chez nous.
- Moyen terme (pont à étudier, ~2-3 j) : **export de notre plan → scène Pascal** : nos pièces/polygones + hauteurs (fauxPlafonds) suffisent à générer les murs. Le schéma de scène est en Zod dans `@pascal-app/core` — écrire un `exportPascal(project)` qui produit leur JSON. Notre outil = saisie 2D rapide ; Pascal = présentation 3D. Chaîne complète : plan 2D coté → PDF échelle → visite 3D.
- À surveiller : leur **serveur MCP** (piloter la scène 3D par agent) — s'alignerait avec nos agents projet le jour où le pont existe.

**Décision** : pas de dépendance ; pont d'export = candidat vague 3 de `features.md`, à déclencher si la cliente demande de la 3D.

---

## Annexe — décisions prises dans ce document (à contester ici, pas ailleurs)

- Formulaire : **Web3Forms** (pas Formspree — 50/mois trop bas).
- Analytics : **GoatCounter** (pas Plausible — payant ; pas GA4 — bannière).
- IA texte : **BYO-key Claude en localStorage** (pas de proxy Worker tant qu'un seul utilisateur ; Puter.js rejeté comme socle).
- Sync : **dossier synchronisé de la cliente + export/import .json** (pas d'OAuth Dropbox/Drive ; File System Access API en bonus Chrome seulement).
- Site Hauum : **repo dédié** au lancement du domaine (domaine custom Pages = tout le repo + règle projets clients standalone).
- Partage de plan : **lien auto-portant dans le fragment d'URL** puis fichier .hauum.json, jamais de stockage tiers.
- Monétisation : **prestation white-label par configuration**, jamais de SaaS ; déclenchée uniquement sur acheteur concret + 3 mois de preuve d'usage interne.
