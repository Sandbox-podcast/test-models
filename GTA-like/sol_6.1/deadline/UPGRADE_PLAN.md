# Extension demandée le 18 novembre 2026

## Complément : circulation et poursuites

| Demande | Réalisation et vérification |
|---|---|
| Prendre le volant des voitures qui circulent | F pour héler, freinage, E à proximité ; prise de volant et conduite essayées dans le navigateur |
| Vigiles en voiture et renforts | Quatre véhicules physiques, gyrophares, sirène, déploiement progressif ; niveau 4 et quatre unités observés |
| Trafic qui cède le passage et dégage les carrefours | Décalage vers le bord, priorités, réservation, contrôle de sortie ; croisement opposé et convergent testé physiquement |
| Plusieurs niveaux d’alerte | Quatre niveaux, signalements, observation, recherche, délais d’évasion et compteur de pertes de poursuite |
| Suivi entre quartiers | Réseau commun des cinq quartiers, six liaisons dans les deux sens, demi-tours, détours face aux grilles ; même poursuivant conservé derrière un joueur qui change de quartier |
| Semer les vigiles dans la circulation | Visibilité bloquée par les voitures, dernière position conservée, recherche limitée ; une évasion observée en jeu |

Recette détaillée dans VALIDATION.md. La version finale comporte 55 tests. Les poursuites et positions des emprunts restent liées à la session. Les véhicules abandonnés et les collisions peuvent encore gêner une voie ; les contrôles ne constituent pas une preuve exhaustive de toute configuration de circulation.

Livraison uniquement locale. L’objectif conserve tous les éléments demandés ; une fonctionnalité n’est cochée qu’après vérification du code et de son comportement.

| Exigence | Travail et preuve attendue | État |
|---|---|---|
| Routes sans superposition indésirable, praticables | Audit exact des triangles et auto-intersections ; J01, J02 et rampe corrigés ; union des chaussées ; deux gabarits sur toutes les routes dans les deux sens | Vérifié |
| Lumières et shaders | Dix lumières locales mutualisées, phares et flashes, eau animée, sol humide et étalonnage réglable ; recette 1080p | Vérifié ; mesure locale |
| Armes supplémentaires et munitions | Quatre armes, trois calibres, chargeurs et réserves, rechargement interrompu, achats et sauvegarde ; tirs essayés pour chaque arme | Vérifié |
| Bâtiments visitables | Deux commerces, trois logements, café et buvette ; mobilier, ouvertures, collisions ; parcours de chaque nouvelle porte | Vérifié |
| Plusieurs véhicules conduisibles | Cinq modèles aux profils et gabarits distincts ; véhicules de partage et trafic arrêté empruntables ; sorties, dégâts et rappel | Vérifié |
| Protection contre les blocages | Seuils, pentes, sorties avant/arrière, balayage des rotations, rappel sans chevauchement ; H et bouton Pause avec progression conservée | Vérifié sur les cas testés |
| Achat de véhicules, armes et maisons | Vendeurs situés dans le monde, confirmations, fonds, propriété, rappel, portes et point de retour des maisons | Vérifié |
| Sauvegarde compatible et économie | Ancienne sauvegarde conservée ; paiements atomiques, doublons et fonds insuffisants refusés ; reprise avec inventaire et propriété | Vérifié |
| Livraison | 55 tests, build, recette du build compilé, documentation et deux archives locales actualisées | Livré localement |

## Constat initial

- Un seul véhicule du joueur ; les véhicules du trafic ne peuvent pas être conduits.
- Une arme avec 12 cartouches et une réserve remise gratuitement à 120 à chaque reprise.
- Aucun achat ni propriété ; quelques bâtiments sont creux mais peu meublés.
- J02 rejoint le bas de la rampe dans sa courbe, créant une superposition de chaussées à moins de la hauteur d’un véhicule.
- Les tests de chaussée vérifient les axes mais pas l’intersection exacte des bandes ; le nouveau contrôle doit porter sur leurs surfaces.

## Recette et limites

La preuve détaillée figure dans VALIDATION.md et `artifacts/qa-upgrade.json`. Le build final est servi sur `http://127.0.0.1:5187/`, le développement sur le port 5186. Les archives `../Deadline-jeu-web.zip` et `../Deadline-source.zip` sont uniquement locales. Le site hébergé reste inchangé.

Les tests couvrent les cas décrits, sans garantir l’absence de toute combinaison de blocage. H fournit une récupération conservant les affaires. Les modèles achetés sont persistants ; les positions et dégâts des emprunts restent liés à la session. La fluidité est mesurée sur l’environnement disponible, avec compilation graphique parfois visible lors des changements de paramètres. L’équilibrage des prix et le rythme de la campagne restent ajustables.
