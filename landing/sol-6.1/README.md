# COSMOS — Sandbox

Landing page immersive, en français. Vite, JavaScript, Three.js et CSS.

```sh
npm install
npm run dev
```

`npm run build` crée le site statique dans `dist`, ainsi que `dist/cosmos.html`, une version autonome à ouvrir directement dans un navigateur, sans serveur. `npm run preview` permet de vérifier le build servi en HTTP.

Le flacon conceptuel est un véritable volume 3D : coque en verre fumé avec épaules sculptées, chanfreins, liquide, ménisque, tube et bouchon métallique. Sa géométrie est définie dans `src/bottle-geometry.js` et son rendu Three.js dans `src/scene.js`. Les reflets de studio, les anneaux et les étiquettes avant et arrière sont produits localement. Le visuel CSS du flacon s’affiche dès le HTML et reste disponible si WebGL échoue. Inter est embarquée ; Cormorant Garamond est chargée via Google Fonts, avec une pile serif de secours.

Glissez horizontalement sur le flacon à la souris ou au doigt pour en faire le tour. Le défilement vertical tactile reste natif. Après avoir sélectionné le flacon avec Tab, les flèches gauche/droite tournent de 15°, Entrée de 45°, Début ou Échap rétablissent la vue initiale. Ces manipulations explicites restent possibles en mode animations réduites. `src/bottle-controls.js` gère ces commandes.

`npm test` vérifie le volume du modèle, ses normales et le placement de la zone interactive sur ordinateur et mobile, ainsi que les gestes et commandes au clavier. Le rendu GPU lui-même doit être contrôlé dans un navigateur compatible WebGL.

Les six compositions du défilement, les particules, la navigation et les préférences d’animation sont orchestrées dans `src/main.js`. Le mode réduit respecte `prefers-reduced-motion` et peut aussi être activé depuis le bouton en haut de page. Le mode mobile réduit le nombre de particules, la résolution et la fréquence de rendu. Le défilement reste natif.

Aucune note officielle ni URL d’achat n’a été fournie : les tableaux restent visuels et le final propose de revivre l’expérience. Aucun service de suivi, compte, formulaire ou service backend.
