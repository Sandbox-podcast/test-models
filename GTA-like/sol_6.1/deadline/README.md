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
- Souris : viser ; clic gauche : tirer ; R : recharger. 3–6 : choisir une arme possédée ; I : arsenal et propriétés.
- E : parler, prendre un objet, utiliser un terminal, entrer ou sortir de voiture à faible vitesse.
- 1 et 2 : implants choisis au garage. Intrusion ouvre la grille du dépôt ou désactive une caméra ; Leurre détourne les vigiles ; Surcharge immobilise le drone.
- J : journal et contrats ; M : carte ; Échap : pause ; molette : zoom.
- H ou « Se dégager du décor » dans Pause : retrouver une position sûre sans perdre ses affaires.
- F à pied : héler une voiture en circulation ; E près de la portière : l’immobiliser et prendre le volant.

Commencer auprès de Mina au garage. Le dépôt a une entrée au nord et une porte sur sa cour à l’est. La fuite automobile emprunte l’avenue, le pont à +6 m puis la rampe. La fuite piétonne descend à 0 m par l’escalier et le passage sous les voies. La remise exige cinq secondes sans identification directe.

## Contenu

Cinq quartiers reliés par six jonctions : Les Forges, La Dalle, Le Nœud, Les Quais et Les Belvédères. La carte reprend les courbes des plans de la bible, avec des surfaces physiques distinctes pour les voies, le pont et les passages inférieurs.

La campagne comprend M01–M06 : Puce fantôme, Date d’effet, La première porte, Le registre des effacés, Dernière montée et Droit d’accès. La filière Nadia ou Sorel détermine un accès ; elle reste indépendante des deux fins : publication expurgée avec droits provisoires aux relais, ou annulation des révocations.

U01–U05 ajoutent l’éclairage du raccourci, une escorte résidentielle, les dossiers de la permanence de nuit, la carte annotée de la papeterie et le portillon de l’équipe de nuit. Les quatre familles communes possèdent huit variantes fixes et des identifiants de récompense par occurrence. Une seule séquence reste active à la fois.

Les habitants circulent entre ateliers, arrêts, commerces, halls, bureaux, marché et terrasses. Les horaires changent leurs destinations. Le trafic ralentit pour les piétons et les autres véhicules. Les témoins cherchent un refuge lors d’un incident. Les impacts laissent des marques localisées, des bosses et des feux cassés ; le mobilier fragile peut céder. Les tirs et collisions graves produisent blessures, chutes et traces de sang.

Au garage : soins, réparation, choix des implants et attente du matin, de la journée ou de la soirée. Les paramètres proposent qualité légère, son, sang, compteur de performances et lecture en niveaux de gris. La perte de focus met la simulation en pause.

## Armes, véhicules et logements

L’armurerie **Traverse**, à l’est du garage, vend le PM Traverse, le fusil à pompe Rive et la carabine Plateau, en plus du pistolet initial. Chaque arme possède son chargeur ; les réserves sont partagées par calibre (9 mm, calibre 12, 5,56 mm). Un rechargement transfère les cartouches disponibles et peut être interrompu en changeant d’arme. Soins, repos et reprise ne donnent pas de munitions gratuites.

**Moteurs**, près de l’avenue des Forges, vend cinq modèles : Courier, Citadine, Vesper GT, Fourgon et Atlas. Accélération, vitesse, freinage, braquage et gabarit diffèrent. Les véhicules de partage et le trafic arrêté peuvent aussi être empruntés avec E. Les modèles achetés peuvent être rappelés et réparés depuis Mina ou un logement, sur une place libre repérée sur la carte. La propriété est sauvegardée ; les positions, dégâts et emprunts restent propres à la session.

Trois logements s’achètent devant leur porte : **Studio des Ateliers**, **Appartement des Paliers**, **Maison des Remparts**. L’achat ouvre la porte et choisit un point de retour hors mission. À l’intérieur, le lit soigne et enregistre cet abri. Les commerces, le café du plateau et la buvette des Quais ont également des ouvertures et du mobilier physiques. L’arsenal permet de repérer les vendeurs et les logements.

Les paiements utilisent uniquement les crédits fictifs de la partie. Une confirmation précède chaque achat ; fonds insuffisants et doubles achats sont refusés. Biens, crédits, chargeurs et réserves sont enregistrés ensemble.

Les routes utilisent une union de leurs chaussées aux jonctions. L’audit contrôle leurs triangles, leurs niveaux et leurs éventuelles intersections avec elles-mêmes. Les phares, flashes de tir, éclairages locaux, sol humide, eau animée et étalonnage peuvent être désactivés dans « Lumières et shaders ». Les sorties de véhicule cherchent un point dégagé autour du gabarit entier ; H fournit un recours si un passage reste bloqué.

## Trafic et poursuites

Les voitures circulent sur le réseau des cinq quartiers. F demande à un conducteur proche de ralentir et de se ranger quand le passage est libre ; approche ensuite sa portière et appuie sur E. Prendre une voiture occupée déclenche un signalement. Les véhicules de partage restent disponibles sans cette alerte.

Quatre niveaux d’alerte apparaissent dans le HUD : Signalement, Poursuite, Renforts et Chasse renforcée. Vols, tirs signalés, attaques et observation prolongée augmentent l’alerte. Jusqu’à quatre véhicules de vigiles sont envoyés progressivement sur des places de chaussée libres. Ils utilisent les routes, rampes et jonctions, peuvent faire demi-tour et continuent entre quartiers. Une grille fermée entraîne un autre itinéraire lorsqu’il existe.

Coupe leurs lignes de vue derrière les bâtiments et les voitures du trafic. Les vigiles partagent une position confirmée ; hors de vue, ils fouillent la dernière position connue. Rester caché pendant 10, 15, 22 ou 28 secondes selon le niveau permet de les semer. Une nouvelle observation relance ce délai. Le trafic peut masquer le joueur et arrêter un poursuivant ; la radio ne permet pas de tirer à travers une voiture.

Les conducteurs se rangent devant un joueur approchant en voiture. Aux raccords routiers, ils attendent une sortie libre et la priorité de passage ; un véhicule déjà engagé finit de dégager le croisement avant de céder le passage. Les destinations et les points d’apparition évitent les carrefours. Ces règles ne rendent pas les véhicules traversables : une voiture abandonnée par le joueur peut toujours gêner une voie.

Les poursuites, emprunts et positions du trafic appartiennent à la session. Pause suspend aussi les délais d’alerte. Une reprise au briefing réinitialise la poursuite, tout en conservant la progression et les biens sauvegardés.

## Sauvegarde

Sauvegarde versionnée dans `deadline.signal-mort.v2`, propre au navigateur et à l’adresse du site. Import de la progression v1 sans double paiement. Une mission interrompue reprend à son briefing ; les conséquences terminées restent acquises. Le menu permet reprise, abandon et nouvelle campagne avec confirmation.

Les anciennes sauvegardes v2 reçoivent l’inventaire initial sans perdre leurs missions ni leurs crédits. Les biens et les munitions ajoutés sont conservés lors des reprises suivantes.

La sauvegarde est locale : la partie jouée sur localhost n’est pas partagée avec le site hébergé. Aucun compte en ligne de progression n’est requis par le jeu.

## Architecture et contrôles

- `src/story.ts` : missions, filières, fins, migration et écritures atomiques.
- `src/economy.ts` : catalogue, propriété, transactions, chargeurs et réserves.
- `src/game.ts` : simulation à 60 Hz, interactions, surveillance, combat, interface et interpolation.
- `src/world/data.ts`, `geometry.ts`, `terrain.ts` : plans SVG, implantations et surfaces communes au rendu et à la physique.
- `src/world/physics.ts` : balayages Rapier, niveaux, sorties, contacts et gravité des impacts.
- `src/world/navigation.ts`, `population.ts` : graphes séparés, destinations, horaires et trafic.
- `src/world/furniture.ts`, `render.ts` : placements audités, bâtiments visitables, toits et tabliers masqués visuellement.
- `src/world/roads.ts`, `fleet.ts`, `services.ts`, `effects.ts` : union et audit des chaussées, véhicules, logements et shaders.
- `src/world/driving.ts`, `pursuit.ts` : réseau routier, conduite autonome, priorités des carrefours, visibilité et renforts.
- `src/audio.ts`, `ui.ts`, `style.css` : ambiance, effets, menus et HUD.

`npm test` vérifie la progression, les récompenses, les deux filières et les deux fins, chaque route automobile dans les deux sens avec deux gabarits, les passages piétons, les parcours de toutes les quêtes, les achats, les munitions, les intérieurs, les sorties, les rotations, les impacts et les populations. Voir [VALIDATION.md](VALIDATION.md), [UPGRADE_PLAN.md](UPGRADE_PLAN.md) et [IMPLEMENTATION_BIBLE.md](IMPLEMENTATION_BIBLE.md).

## Limites connues

Les séquences sont plus courtes que les durées indicatives de 10–20 minutes par mission et 5–10 minutes par quête annexe ; ces cibles de rythme restent à équilibrer. Les armes ou dangers de gel, brûlure et démembrement restent hors du kit actuel, conformément à leur report dans le plan web. Les mesures de fluidité décrivent la machine de test ; aucun portable de référence n’a été fourni. La progression est locale, sans synchronisation entre appareils.
