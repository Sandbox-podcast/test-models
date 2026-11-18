# DEADLINE — Signal mort

Jeu solo d’action et d’infiltration cyberpunk pour navigateur desktop. Three.js, TypeScript, Rapier 3D et Vite. Tous les modèles, textures d’interface et sons sont produits localement ; aucune ressource distante n’est requise pendant une partie.

## Lancer

Node.js 22.12 ou supérieur.

```sh
npm install
npm run dev
```

Ouvrir l’adresse locale affichée par Vite. `npm run build` produit le site autonome dans `dist/`. `npm run preview` sert cette version. Un double-clic sur `index.html` ne peut pas charger les modules et WebAssembly : utiliser le serveur.

## Jouer

- ZQSD, WASD ou flèches : déplacement / conduite. Maj : courir. Espace : frein à main.
- Souris : viser ; clic gauche : tirer ; R : recharger.
- E : contact, objet, terminal, entrer / sortir de voiture à faible vitesse.
- 1 et 2 : implants équipés au garage. Intrusion vise une grille ou une caméra. Leurre attire les vigiles au point visé. Surcharge se débloque après le premier contrat.
- J : journal, contrats et conséquences ; M : carte complète ; Échap : pause ; molette : zoom.

Parler à Mina, accepter « Puce fantôme », traverser le quartier et prendre la puce dans la cour du dépôt. Le sud de la cour est accessible sans implant ; la grille est une autre approche. Rejoindre Mina sous les voies après cinq secondes sans identification directe. Le pont de l’avenue convient à la voiture ; le passage inférieur convient à la fuite à pied.

La livraison ouvre la grille de service, débloque Surcharge et le contrat secondaire « Les dossiers de la nuit ». Rejoindre le collectif de La Dalle pour le chapitre II. Le registre peut être confié au collectif (galerie) ou à Sorel (badge). Préparer ensuite l’opération avec Sorel, atteindre le serveur du Nœud et choisir l’une des trois fins. La ville reste jouable après la fin.

## Sauvegarde et reprise

Sauvegarde locale versionnée `deadline.signal-mort.v1` dans le navigateur. Chaque validation de contrat applique dans un même enregistrement sa récompense et ses conséquences. Les récompenses sont idempotentes. Une partie interrompue pendant un contrat repart du briefing. Mort, pause et abandon proposent la reprise ; la progression terminée est conservée. « Nouvelle campagne » demande une confirmation explicite dans les paramètres. Le stockage peut être limité par le mode privé ou les préférences du navigateur ; un message l’indique en cas d’échec.

## Architecture

- `src/level.ts` : placements stables, trois quartiers, relief, patrouilles et points de mission.
- `src/scene.ts` : ville procédurale, véhicules, silhouettes et collisions statiques ; géométrie décorative fusionnée par matériau.
- `src/main.ts` : boucle à 60 Hz, interpolation, conduite avec balayage de collision Rapier, IA, surveillance, combat, missions et interface.
- `src/navigation.ts` : graphe de circulation et recherche autour des obstacles.
- `src/campaign.ts` : transitions persistantes, décisions et récompenses.
- `src/audio.ts` : ambiance et effets Web Audio après interaction utilisateur.
- `src/ui.ts`, `src/style.css` : menus, carte, journal, HUD, commandes et réglages.

`npm test` vérifie les transitions et les garanties de sauvegarde. Le mode graphique léger désactive les ombres et les halos. Le compteur de performances est disponible dans les paramètres. Le jeu se met en pause quand la fenêtre perd le focus. Un diagnostic en lecture seule est exposé dans `window.deadline.state`.

## Périmètre

Campagne condensée jouable dans les trois quartiers, construite à partir des spécifications v0.3 et du plan web fournis. Les durées de 10–20 minutes par mission restent une cible de contenu ; ce prototype propose des séquences plus courtes. Les choix de campagne changent réellement des grilles et la surveillance après la fin. Les tirs et collisions produisent des blessures, chutes et traces de sang ; gel, brûlure et démembrement attendent les armes et dangers correspondants, comme prévu dans le plan. Les civils sont présents à pied ; la circulation automobile autonome n’est pas simulée.

Documentation technique : [Three.js](https://threejs.org/docs/), [contrôleur de personnage Rapier](https://rapier.rs/docs/user_guides/javascript/character_controller/).
