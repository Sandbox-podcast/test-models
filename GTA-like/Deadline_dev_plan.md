# DeadLine — Plan de développement web de Puce fantôme

**Stack retenue : Three.js, TypeScript et Rapier 3D.** Le livrable est une démo jouable par lien sur navigateur desktop, au clavier et à la souris. Le joueur peut explorer Les Forges, accepter le contrat de Mina, voler la puce, semer les vigiles et reprendre l’exploration. Après rechargement de la page, le passage débloqué et le contrat secondaire restent disponibles.

Le premier jalon tient sur **un îlot en blocs gris**. On y valide le trajet à pied, le passage en voiture et la poursuite avant d’étendre la carte aux quatre pâtés de maisons du prototype.

## 1. Architecture du prototype

| Brique | Mise en œuvre |
|---|---|
| **Projet web** | Vite pour le développement local et la compilation TypeScript. Le résultat se déploie sur un hébergement statique. Les fichiers du jeu, dont le module WebAssembly de Rapier, sont servis depuis le même site. |
| **Rendu** | Three.js avec `WebGLRenderer` et une caméra orthographique fixe, presque verticale. La caméra anticipe la direction de la voiture. Un volume masque le tablier des voies quand il gêne la lecture du passage inférieur. |
| **Simulation** | Rapier à pas fixe de 60 Hz, avec interpolation des positions affichées entre deux pas. Les cloisons, véhicules et personnages ont des formes de collision simples. La présentation lit l’état simulé et y applique les effets visuels. |
| **Niveau** | Une scène Three.js construite à partir d’un fichier de niveau qui décrit les placements, collisions, accès, points de patrouille et volumes de mission. Les objets interactifs ont des identifiants stables. On pourra remplacer les volumes gris par des modèles glTF sans déplacer les déclencheurs de mission. |
| **Interface** | HTML et CSS pour le menu, le journal, les indications d’interaction, la santé et les recharges. Le HUD indique si le joueur est observé, repéré ou peut livrer la puce. |
| **Sauvegarde** | Une sauvegarde locale versionnée dans `localStorage`. La livraison écrit dans un même enregistrement l’état final du contrat, le passage ouvert et la récompense. Le point de reprise recrée une situation connue au garage. |

Au lancement, le bouton **Jouer** devient disponible quand Rapier et les ressources du niveau sont prêts. La perte de focus met le jeu en pause et relâche les touches. Le retour dans l’onglet reprend depuis le même état de simulation.

## 2. Ordre de développement

| Lot | À construire | Validation en jeu |
|---|---|---|
| **1. Îlot jouable** | Poser le garage, une avenue, une cour et une ruelle. Ajouter le déplacement ZQSD/WASD, la visée à la souris, les collisions du personnage et la caméra. | Le trajet garage → cour est faisable sans traverser de mur. Le viseur reste sous la souris pendant que la caméra suit le joueur. |
| **2. Voiture arcade** | Ajouter l’accélération, le freinage, le braquage et la marche arrière. Utiliser Rapier pour tester les obstacles le long du déplacement et limiter les traversées à grande vitesse. `E` transfère le contrôle et vérifie qu’un côté est dégagé pour sortir. | On peut faire le tour de l’îlot, freiner, se garer et repartir à pied. Un mur bloque la voiture. Si les deux côtés sont occupés, le joueur reste à bord. |
| **3. Mission de bout en bout** | Étendre Les Forges à quatre pâtés de maisons. Ajouter Mina, le briefing, le journal, la puce et le point de remise sous les voies. Faire fonctionner les transitions avec des repères temporaires. | On peut explorer avant le briefing, prendre la puce, la remettre et continuer à circuler dans la même carte. |
| **4. Surveillance et combat** | Ajouter une arme, deux vigiles et une caméra. Relier les points de patrouille par un petit graphe autour du dépôt et des rues voisines. Les murs coupent la ligne de vue. | Le vol attire les vigiles vers le dépôt. Un joueur repéré est poursuivi. Quand ils le perdent, les vigiles fouillent sa dernière position connue. La remise se débloque après cinq secondes sans détection confirmée. |
| **5. Approches et implants** | Relier **Intrusion** à la grille et à la caméra, puis **Leurre** à l’état d’investigation des vigiles. Afficher la cible valide et la recharge. Finaliser le quai piéton et l’itinéraire de fuite en voiture. | On peut réussir par l’entrée principale sans implant et par la cour sans tirer. Une voiture coincée laisse la fuite à pied praticable. |
| **6. Reprise et conséquences** | Créer le point de reprise à la fin du briefing. À la remise, ouvrir le raccourci, rendre disponible un contrat secondaire court et enregistrer la récompense. | Échouer après le vol puis reprendre restaure la puce, la voiture et les vigiles. Après une réussite et un rechargement, le passage et le contrat secondaire sont disponibles et la récompense reste créditée une seule fois. |
| **7. Effets et livraison web** | Ajouter l’éclairage cyberpunk, les sons, les réactions aux tirs et aux collisions graves, les éclaboussures et les traces au sol. Déployer la démo et tester son URL dans Chrome et Firefox sur ordinateur. | Une personne qui découvre le jeu peut charger la démo, finir le contrat et expliquer ce qui l’a fait repérer. Elle peut rejouer par une autre entrée et un autre trajet de fuite. |

## 3. Règles de mission à fixer dès le lot 3

La mission suit quatre états persistants en jeu. **Disponible → Acceptée → Puce récupérée → Terminée.** L’alerte évolue séparément. Une poursuite peut reprendre tant que le joueur reste repérable, et une nouvelle détection remet le délai de livraison à zéro.

- **Avant le vol**, le journal pointe vers le dépôt. Le joueur peut y aller à pied ou en voiture et choisir où se garer.
- **À la prise de la puce**, l’intervention démarre une fois et le point de remise apparaît. Les vigiles reçoivent la dernière position du joueur quand une détection est confirmée.
- **À la remise**, le joueur doit être à pied, près de Mina et hors détection confirmée depuis cinq secondes. Le HUD indique la condition qui bloque la remise.
- **En cas d’échec**, le joueur peut reprendre au briefing ou abandonner le contrat et retrouver la ville libre. Les changements permanents sont appliqués à la livraison.
- **Après rechargement**, un contrat terminé reste terminé. Si la page a été fermée pendant le contrat, la reprise repart du point enregistré au briefing.

## 4. Fluidité et périmètre visuel

**Cible de travail : 60 images par seconde à 1080p sur un portable de référence**, à mesurer d’abord avec l’îlot gris, puis pendant une fuite avec les effets activés. Relever les temps par image et les saccades après quelques virages, au passage sous les voies et lors d’impacts rapprochés. Tester aussi le premier chargement et le retour après un changement d’onglet.

Pour tenir cette cible, limiter la résolution interne sur les écrans à forte densité, utiliser des matériaux émissifs pour la plupart des enseignes et réserver les ombres dynamiques aux éléments qui en ont besoin. Réutiliser un nombre fixe de particules et de traces de sang. Si le test ralentit, comparer la même fuite avec les ombres, la résolution puis les particules réduites pour identifier ce qui coûte le plus.

Les **tirs et collisions graves** conservent leurs éclaboussures et réactions dans la démo. Le gel, les brûlures et le démembrement seront produits avec les armes, implants ou dangers qui les déclenchent. La simulation du trafic civil et l’extension aux autres quartiers viennent après la validation de « Puce fantôme ».

## 5. Premier jalon à livrer

Une page jouable permet de **sortir du garage à pied, prendre la voiture, tourner au coin du dépôt, se garer et repartir par la ruelle pendant qu’un vigile suit le joueur**. Ce trajet vérifie les trois points qui peuvent imposer de revoir le plan web rapidement : la lisibilité de la caméra, la conduite avec collisions et la fluidité en situation de poursuite. Il sert ensuite de parcours de référence pour mesurer le coût des néons, des ombres et des impacts.

## 6. Développement global

Une fois le premier jalon validé, livre l'ensemble du jeu.