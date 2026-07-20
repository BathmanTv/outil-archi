# Template Lukas X — inventaire des éléments dynamiques UX/UI

_Relevé en direct sur https://lukes-template.webflow.io/ (DOM + interactions Webflow inspectés, 2026-07). Base de travail pour reproduire ces comportements en vanilla JS/CSS dans `hauum/lukas/`. 22 éléments portent une interaction Webflow (`data-w-id`)._

## 1. Navigation
| # | Élément | Comportement |
|---|---|---|
| 1 | Menus déroulants (×3) | Ouverture **au survol** (delay 0), fondu/glissement du panneau |
| 2 | Liens de nav | Transition couleur 0,3 s + soulignement au survol |
| 3 | Bouton nav « Prendre contact » | Interaction dédiée au survol (flèche/fond animés) |
| 4 | Menu mobile | Burger → overlay plein écran |

## 2. Hero (chargement de page)
| # | Élément | Comportement |
|---|---|---|
| 5 | Titre géant (310 px) | **Animation d'entrée** : opacité 0 → apparition (fade + montée) au chargement |
| 6 | Cartes stats « Total clients 100+ » / « Total engagement K+ » | **Compteurs à rouleau (odomètre)** : chaque chiffre est une colonne 0-9 qui défile verticalement jusqu'à la valeur finale |
| 7 | Animation Lottie décorative | Déclenchée à l'apparition (pas en boucle) |

## 3. Scroll storytelling
| # | Élément | Comportement |
|---|---|---|
| 8 | Tags de section, titres H2, paragraphes | **Reveal au scroll** généralisé : opacité 0 → visible avec léger décalage (stagger) à l'entrée dans le viewport — constaté sur tous les `section-tag-text`, `section-title-text`, `about-details-text` |
| 9 | **Strip d'images infini** (`infinity-image-wrap` ×5, 6 images dupliquées par rangée) | **Défilement horizontal continu multi-rangées** (marquee infini, sens/vitesses variés) — la duplication des images assure la boucle sans couture |
| 10 | Footer | Reveal **séquencé** élément par élément (titre → formulaire → texte → réseaux → image → copyright) |

## 4. Boutons & survols
| # | Élément | Comportement |
|---|---|---|
| 11 | `primary-button` | Transition `all 0,4 s` : fond + flèche au survol |
| 12 | Cartes expertises « Details » (`service-button-wrapper`) | `all 0,5 s` : fond inversé au survol + **icône/image qui glisse** (`service-button-image` transformée) |
| 13 | Cartes projets (`wrok-image`) | Parent `overflow:hidden` + image transformée → **zoom photo au survol** + pastille « Voir le projet » |
| 14 | Icônes sociales | Fond animé 0,5 s au survol |
| 15 | Liens footer / liens dropdown | Couleur 0,3–0,5 s |

## 5. Slider
| # | Élément | Comportement |
|---|---|---|
| 16 | **Slider témoignages** (3 slides) | Animation « slide », **boucle infinie**, flèches ← → + points de navigation, glissement tactile ; autoplay désactivé (manuel) |

## 6. Formulaires
| # | Élément | Comportement |
|---|---|---|
| 17 | Newsletter footer | Reveal + états focus / succès / erreur stylés |

## Écart actuel de notre version `hauum/lukas/`
Déjà en place : reveals au scroll (IntersectionObserver), zoom photo au survol + pastille projets, transitions boutons/liens, menu mobile overlay, formulaire avec états.
**Manquant (à implémenter en vanilla)** : ① compteurs à rouleau des stats · ② strip d'images infini multi-rangées · ③ animation d'entrée du hero (titre + stagger) · ④ slider témoignages (flèches + dots + swipe + boucle) · ⑤ reveal séquencé du footer · ⑥ hover « riche » des cartes Details (fond inversé + icône qui glisse) · ⑦ dropdown Formations au survol (si sous-pages) · ⑧ Lottie décoratif (optionnel — à remplacer par un équivalent CSS léger).

_Éléments du template ignorés volontairement : bannière promo Webflow + bouton « customize » (marketing du vendeur du template)._

## Annexe — mécanique exacte des boutons (relevé style-guide, implémentée)
Source : https://lukes-template.webflow.io/template-pages/style-guide

| Bouton template | Mécanique relevée | Notre implémentation |
|---|---|---|
| `nav-button` (Contact Now) | `overflow:hidden` + `.text-wrapper` + `.nav-button-line` **en translate3d(-100 %)** (soulignement qui balaye) + **2 icônes flèche dupliquées** (swap diagonal : l'une sort ↗, l'autre entre depuis ↙) | `.nav-cta` : `.line` qui balaye vers la droite au survol + `.arr` avec 2 `→` (sortie 120 %,-120 % / entrée -120 %,120 %), .35 s cubic-bezier |
| `nav-link` | couleur .3 s + ligne | `::after` scaleX(0→1) origin left, .3 s |
| `primary-button` | radius 8 px, pad 13/16, `all .4 s ease`, hover = fond | `.btn` all .4 s ease, radius 8 px, hover fond brun-2 + lift 2 px + ombre |
| `service-button-wrapper` (Details) | `all .5 s` fond inversé + icône qui glisse | `.details` all .5 s ease + flèche translateX(7 px) |
| `pricing-link` | `background-color .4 s` | couvert par `.btn` |
| `footer-link` (Home, About, Works… ×16) | **Text-roll** : `.footer-link-wrapper` `overflow:hidden` hauteur 1 ligne contenant le lien **dupliqué à l'identique**, les 2 copies montent en % au survol | `.froll` généré en JS (libellé dupliqué dans `.stack`), montée d'une ligne en .35 s, 2ᵉ copie en brun — appliqué aux 11 liens footer |
| `footer-text-field` (Stay in touch!) | Fond gris `#E3EBE8`, **sans bordure**, radius 8, pad 8/12 | `.nl input` + champs du formulaire : fond `--card`, sans bordure, radius 8, focus = fond blanc + ring brun |
