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

### À chaque mise à jour (important)
L'app est une PWA avec un service worker (`sw.js`) qui met les fichiers en cache.
**À chaque redéploiement, incrémentez la version du cache** en haut de `sw.js`
(`const CACHE = 'outil-archi-vN'` → `vN+1`). Sans ça, les clients qui ont déjà
ouvert l'app risquent de garder l'ancienne version en cache.
(Le service worker est en mode « réseau d'abord » : les utilisateurs en ligne
reçoivent toujours la dernière version ; le cache ne sert que hors-ligne.)
