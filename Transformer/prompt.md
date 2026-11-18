Crée une scène 3D interactive et animée représentant une voiture sportive jaune qui se transforme mécaniquement en robot, marche quelques pas, puis redevient une voiture.

Le résultat doit être spectaculaire, dynamique et soigné, comme une courte démonstration destinée à une vidéo. Réalise directement le projet complet en prenant les décisions artistiques et techniques nécessaires dans le respect des contraintes ci-dessous.

## 1. Identité visuelle imposée

Respecte ces constantes :

- Une voiture sportive à quatre roues, de type muscle car moderne, inspirée de l’esprit de Bumblebee dans Transformers.
- Une carrosserie jaune vif, couleur de base `#FFC400`. Tous les panneaux peints utilisent le même matériau jaune.
- Deux bandes noires longitudinales parallèles sur le capot, le toit et le coffre.
- Des pneus noirs, des jantes métalliques et des vitres fumées.
- Un robot humanoïde avec une tête, deux bras et deux jambes. Il conserve les panneaux jaunes et les bandes noires de la voiture.
- Des articulations et éléments mécaniques en métal gris foncé. Les yeux du robot sont bleu clair.
- Un studio sobre avec un sol gris anthracite, des ombres et un éclairage blanc neutre.
- Une caméra initiale en vue de trois quarts avant, montrant le sujet entier sous ses deux formes.

Tu es libre de concevoir la silhouette exacte, les détails mécaniques et l’organisation des pièces. Recherche une esthétique de jouet mécanique haut de gamme, avec une carrosserie travaillée, des articulations lisibles et des matériaux soignés.

La scène occupe presque tout l’écran, avec une interface discrète et un cadrage adapté au format 16:9.

## 2. Timing strict : une boucle de 12 secondes

À vitesse normale, respecte exactement ce déroulé :

| Temps | Action |
|---|---|
| 0 à 1,5 s | Présentation de la voiture immobile. |
| 1,5 à 3,5 s | Transformation complète de la voiture en robot, en exactement 2 secondes. |
| 3,5 à 4 s | Le robot prend brièvement une pose héroïque. |
| 4 à 7 s | Le robot effectue deux ou trois pas avec un déplacement réel. |
| 7 à 9 s | Transformation complète du robot en voiture, en exactement 2 secondes. |
| 9 à 11 s | La voiture roule pour retrouver sa position et son orientation initiales. Elle peut reculer pour cela. |
| 11 à 12 s | Courte présentation de la voiture avant la reprise de la boucle. |

**Les transformations doivent être rapides et énergiques.** Plusieurs groupes de pièces bougent simultanément, avec de légers décalages pour rendre la mécanique lisible.

Évite de déplacer chaque pièce séparément l’une après l’autre. Utilise des accélérations et décélérations brèves, des mouvements francs et des verrouillages nets. Aucun ralenti automatique ni longue attente entre deux mouvements.

Le cycle démarre automatiquement à vitesse normale. Calcule l’animation à partir du temps écoulé en secondes, indépendamment du nombre d’images par seconde.

## 3. Une véritable continuité mécanique

La voiture et le robot sont constitués du même ensemble de pièces 3D pendant toute la séquence.

Les roues, les panneaux de carrosserie et les bandes noires restent identifiables dans la forme robot. Tu choisis leur emplacement et la façon dont ils s’articulent.

Utilise des rotations, charnières, glissières et mécanismes télescopiques. Des pièces internes peuvent être cachées dans la voiture puis révélées pendant la transformation.

Respecte ces règles :

- Aucun remplacement instantané entre deux modèles distincts.
- Aucun fondu, aucune téléportation et aucune disparition artificielle de pièces.
- Aucun étirement élastique ou changement arbitraire d’échelle.
- Aucune modification de couleur pour masquer un changement de forme.
- La transformation reste entièrement visible dans le cadre.
- Les mouvements sont coordonnés pour limiter les traversées évidentes entre les pièces.

Une mécanique stylisée est acceptable. La priorité est de pouvoir suivre visuellement comment la voiture devient le robot, même au ralenti.

## 4. Marche et animation

Le robot doit donner une impression de poids et de personnalité.

Sa marche comprend une alternance des jambes, une flexion des genoux, un balancement des bras et des contacts au sol crédibles. Le déplacement doit correspondre aux pas, avec un pied d’appui qui reste stable pendant son contact avec le sol.

Lorsque la voiture revient à son point de départ, ses roues tournent dans le bon sens. La boucle reprend sans saut de position ni changement brusque de pose.

## 5. Contrôles d’inspection

Ajoute une interface compacte avec :

- Lecture / pause.
- Recommencer.
- Vitesse normale, sélectionnée par défaut.
- Ralenti à 0,25×, activé uniquement sur demande.
- Un curseur temporel de 0 à 12 secondes.
- Deux raccourcis permettant de figer et d’examiner la forme voiture et la forme robot.
- Une caméra orbitale contrôlable à la souris et un bouton pour retrouver le cadrage initial.

Le curseur doit mettre à jour correctement toutes les pièces à n’importe quel instant, y compris en pause et lorsqu’on revient en arrière.

Le ralenti sert à inspecter la mécanique. La présentation initiale doit impérativement conserver les transformations rapides de 2 secondes.

## 6. Contraintes techniques et livraison

Utilise Three.js et livre un unique fichier `index.html` contenant le HTML, le CSS et le JavaScript.

Tu peux charger Three.js et ses modules depuis un CDN, avec des versions explicites et compatibles. Toute la géométrie, les matériaux et les animations doivent être créés par ton code : aucun modèle 3D, aucune image, aucune texture ou animation préfabriquée importés.

Le projet doit fonctionner dans un navigateur moderne via un simple serveur statique, sans compilation, sans clé API et sans service payant.

Si ton environnement permet d’exécuter le projet, ouvre-le et vérifie le rendu, les commandes et le cycle complet. Vérifie particulièrement que chaque transformation dure bien 2 secondes à vitesse normale. Corrige les problèmes observés avant de livrer et indique brièvement ce que tu as pu vérifier.

Livre le fichier complet et les instructions minimales pour le lancer.

Priorités : respect des couleurs et du timing, transformation mécanique cohérente et rapide, silhouettes réussies, animation expressive et finition visuelle soignée.
