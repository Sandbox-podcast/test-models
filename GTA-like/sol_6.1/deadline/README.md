# DEADLINE — Signal mort

Jeu solo d’action et d’infiltration pour navigateur desktop, inspiré de la géographie d’Angoulême. Three.js, TypeScript, Rapier 3D et Vite. Les modèles, les sons et les cartes sont générés localement ; aucun service externe n’est nécessaire pendant une partie.

## Lancer

Node.js 22.12 ou supérieur.

```sh
npm install
npm run dev
```

Ouvrir l’adresse affichée par Vite. `npm run build` compile le site statique dans `dist/` ; `npm run preview` sert cette version. Utiliser un serveur HTTP pour charger les modules et WebAssembly.

## Jouer

- ZQSD, WASD ou flèches : déplacement et conduite. Maj : courir. Espace : frein à main.
- Souris : viser ; clic gauche : tirer ; R : recharger.
- E : parler, prendre un objet, utiliser un terminal, entrer ou sortir de voiture à faible vitesse.
- 1 et 2 : implants choisis au garage. Intrusion ouvre la grille du dépôt ou désactive une caméra ; Leurre détourne les vigiles ; Surcharge immobilise le drone.
- J : journal et contrats ; M : carte ; Échap : pause ; molette : zoom.

Commencer auprès de Mina au garage. Le dépôt a une entrée au nord et une porte sur sa cour à l’est. La fuite automobile emprunte l’avenue, le pont à +6 m puis la rampe. La fuite piétonne descend à 0 m par l’escalier et le passage sous les voies. La remise exige cinq secondes sans identification directe.

## Contenu

Cinq quartiers reliés par six jonctions : Les Forges, La Dalle, Le Nœud, Les Quais et Les Belvédères. La carte reprend les courbes des plans de la bible, avec des surfaces physiques distinctes pour les voies, le pont et les passages inférieurs.

La campagne comprend M01–M06 : Puce fantôme, Date d’effet, La première porte, Le registre des effacés, Dernière montée et Droit d’accès. La filière Nadia ou Sorel détermine un accès ; elle reste indépendante des deux fins : publication expurgée avec droits provisoires aux relais, ou annulation des révocations.

U01–U05 ajoutent l’éclairage du raccourci, une escorte résidentielle, les dossiers de la permanence de nuit, la carte annotée de la papeterie et le portillon de l’équipe de nuit. Les quatre familles communes possèdent huit variantes fixes et des identifiants de récompense par occurrence. Une seule séquence reste active à la fois.

Les habitants circulent entre ateliers, arrêts, commerces, halls, bureaux, marché et terrasses. Les horaires changent leurs destinations. Le trafic ralentit pour les piétons et les autres véhicules. Les témoins cherchent un refuge lors d’un incident. Les impacts laissent des marques localisées, des bosses et des feux cassés ; le mobilier fragile peut céder. Les tirs et collisions graves produisent blessures, chutes et traces de sang.

Au garage : soins, réparation, choix des implants et attente du matin, de la journée ou de la soirée. Les paramètres proposent qualité légère, son, sang, compteur de performances et lecture en niveaux de gris. La perte de focus met la simulation en pause.

## Sauvegarde

Sauvegarde versionnée dans `deadline.signal-mort.v2`, propre au navigateur et à l’adresse du site. Import de la progression v1 sans double paiement. Une mission interrompue reprend à son briefing ; les conséquences terminées restent acquises. Le menu permet reprise, abandon et nouvelle campagne avec confirmation.

La sauvegarde est locale : la partie jouée sur localhost n’est pas partagée avec le site hébergé. Aucun compte en ligne de progression n’est requis par le jeu.

## Architecture et contrôles

- `src/story.ts` : missions, filières, fins, migration et écritures atomiques.
- `src/game.ts` : simulation à 60 Hz, interactions, surveillance, combat, interface et interpolation.
- `src/world/data.ts`, `geometry.ts`, `terrain.ts` : plans SVG, implantations et surfaces communes au rendu et à la physique.
- `src/world/physics.ts` : balayages Rapier, niveaux, sorties, contacts et gravité des impacts.
- `src/world/navigation.ts`, `population.ts` : graphes séparés, destinations, horaires et trafic.
- `src/world/furniture.ts`, `render.ts` : placements audités, bâtiments visitables, toits et tabliers masqués visuellement.
- `src/audio.ts`, `ui.ts`, `style.css` : ambiance, effets, menus et HUD.

`npm test` vérifie la progression, les récompenses, les deux filières et les deux fins, chaque route automobile dans les deux sens, les passages piétons, les parcours de toutes les quêtes, les impacts, les populations et les réserves de placement. Voir [VALIDATION.md](VALIDATION.md) et [IMPLEMENTATION_BIBLE.md](IMPLEMENTATION_BIBLE.md).

## Limites connues

Les séquences sont plus courtes que les durées indicatives de 10–20 minutes par mission et 5–10 minutes par quête annexe ; ces cibles de rythme restent à équilibrer. Les armes ou dangers de gel, brûlure et démembrement restent hors du kit actuel, conformément à leur report dans le plan web. Les mesures de fluidité décrivent la machine de test ; aucun portable de référence n’a été fourni. La progression est locale, sans synchronisation entre appareils.
