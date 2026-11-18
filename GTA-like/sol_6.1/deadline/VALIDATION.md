# Validation de DeadLine

## Extension trafic et poursuites — 18 novembre 2026

**55 tests Node réussis et build de production réussi.** Cette recette complète les versions décrites plus bas.

### Contrôles physiques et de comportement

- Le réseau relie les cinq quartiers sans emprunter les escaliers ni la galerie piétonne. Le conducteur autonome parcourt les six jonctions J01–J06 dans les deux sens, depuis les routes d’approche jusqu’aux routes de sortie, avec Rapier et les véritables collisions.
- Un test du gestionnaire complet de poursuite fait conduire un joueur des Forges à La Dalle et vérifie que le même véhicule de vigiles franchit la limite du quartier derrière lui. Le véhicule actif ne se téléporte pas lors du changement de quartier.
- Demi-tour vers un dernier signalement situé derrière le poursuivant ; pas de détour obligatoire à travers toute la ville. La grille de badge fermée force un autre accès au plateau ; son ouverture autorise le trajet plus court.
- Voiture civile qui se décale devant le joueur, freinage après un appel F, conservation d’une sortie à pied. Freinage conservé pour les habitants qui traversent. Priorité du joueur, refus d’entrer dans un carrefour dont la sortie est bouchée et dégagement d’un véhicule déjà engagé.
- Croisement réel de trois véhicules opposés ou convergents aux Forges, avec passages successifs et sorties hors du carrefour. La vérification inclut les volumes et les voies, pas seulement une variable de réservation.
- Accumulation des quatre niveaux d’alerte, conservation de la dernière position pendant la perte de vue, réinitialisation du délai à une nouvelle observation et fin de recherche après le délai requis.
- Une camionnette interrompt réellement le rayon de visibilité. Un signalement radio ne permet pas à un vigile en voiture de tirer à travers ce véhicule ; le tir redevient possible lorsque la couverture est retirée.
- Renforts créés sur des emplacements libres de chaussée à distance du joueur, en dehors des zones de raccord. Le nombre de voitures de vigiles est borné à quatre. Les voitures déjà actives continuent leur déplacement physique.

### Recette au clavier et à la souris

Dans le navigateur local : F sur une voiture circulant sur la voie basse, freinage observé, approche de la portière, E puis conduite du véhicule. Le signalement est affiché et un premier véhicule de vigiles rejoint la zone. La visibilité est ensuite perdue derrière la circulation ; le niveau revient à zéro et le compteur d’évasions passe à un.

Un second essai déclenche un signalement puis une attaque de véhicule de vigiles. Le HUD atteint **Alerte 4**, et le relevé confirme **quatre véhicules de renfort actifs**, avec leurs positions et vitesses distinctes. Les soins, crédits, propriétés et progression de campagne n’ont pas été modifiés par un outil de test ; les tirs consomment les cartouches du jeu. Un relevé de cette séquence affiche 60 IPS et un 95e percentile proche de 16,8 ms à la taille de navigateur habituelle de 1280 × 720. Ce relevé ne certifie pas la même fluidité sur une autre machine ou à 1080p.

Le build compilé a aussi été rechargé à 1920 × 1080 : 60 IPS, 95e percentile proche de 16,8 ms, sans erreur JavaScript dans le contrôle de démarrage avec trafic. Le relevé à quatre renforts reste celui à 1280 × 720.

Preuves locales : `artifacts/qa-pursuits-build.json`, `artifacts/qa-pursuits.json`, `artifacts/chase-escape.jpg` et `artifacts/chase-level4.jpg`. La traversée de tous les raccords et le suivi entre quartiers sont vérifiés par simulation physique ; ils ne sont pas présentés comme douze poursuites manuelles distinctes.

### Limites de cette recette

Les règles réduisent les blocages de circulation sans garantir toutes les configurations possibles de véhicules abandonnés, d’accidents et de voies occupées. Les poursuivants peuvent être ralentis par la circulation, ce qui participe à l’évasion. Les alertes restent liées à la session et sont réinitialisées au briefing ou au rechargement de la page. Les déplacements et renforts restent locaux, sans publication ni service distant.

## Extension routes, arsenal et propriétés — 18 novembre 2026

**42 tests Node réussis et build de production réussi.** La version compilée a été chargée et jouée sur `http://127.0.0.1:5187/`. Livraison locale uniquement ; aucune mise à jour du site hébergé.

### Routes, intérieurs et protection contre les blocages

- Audit exact des triangles de chaussée : aucune intersection avec soi-même, aucun croisement à niveaux incompatibles ni passage routier de hauteur insuffisante. Les jonctions coplanaires sont rendues comme une union, avec retrait des trottoirs traversant une autre chaussée.
- J02 part maintenant de la voie basse, à l’écart de la rampe des Forges. J01 et la rampe conservent une portion horizontale à leurs raccords. L’audit final tolère au plus 4,5 cm d’écart aux raccords coplanaires et exige 4,5 m aux croisements superposés.
- Toutes les routes et jonctions ont été parcourues physiquement dans les deux sens avec le gabarit normal et celui du fourgon. Les parcours de toutes les quêtes et les passages piétons restent vérifiés.
- Entrée et sortie physiques de chaque logement après ouverture de sa porte achetée ; chaque porte de l’armurerie, du vendeur, du café et de la buvette est également traversée dans les deux sens avec son mobilier réel.
- Sorties sûres pour les cinq modèles, sorties avant/arrière quand les deux côtés sont bouchés, rotations refusées contre une paroi mince ou un autre véhicule, rappel sans chevauchement. La rotation affichée suit celle réellement autorisée par la physique.
- En navigateur : armurerie, vendeur, logement des Ateliers et buvette visités à pied ; J02 franchie ; conduite de la sportive, de la citadine, du fourgon, de l’utilitaire du trafic et du Courier. H et le bouton de dégagement de Pause ont été utilisés sans perte d’affaires. Un toit masquant la voiture à la sortie du garage a été corrigé et revérifié.

Les contrôles et le recours H réduisent les risques de blocage ; ils ne constituent pas une preuve exhaustive de toutes les combinaisons possibles de véhicules, portes et actions.

### Achats et munitions réellement essayés

À partir de la sauvegarde de recette à 4 740 crédits : achat du PM, du fusil à pompe, de la carabine, d’un lot de chaque calibre, de la Vesper GT, du Nil Fourgon et du Studio des Ateliers. Solde obtenu : **35 crédits**, cohérent avec **4 705 crédits** d’achats. La confirmation, l’état « Possédé » et le refus des doublons sont couverts. Dans le build final frais, l’achat du PM à 260 crédits est désactivé avec un solde de 120 crédits.

Les quatre armes ont tiré. Trois coups de pistolet suivis d’un rechargement font passer le chargeur de 9 à 12 et la réserve 9 mm de 108 à 105. Cinq coups de PM suivis d’un changement d’arme pendant la recharge laissent son chargeur à 25 et la réserve à 105. Le fusil à pompe conserve six cartouches et onze en réserve après un tir/rechargement ; la carabine conserve vingt cartouches et trente-huit en réserve après deux tirs/rechargement.

Après achat, entrée et repos au studio, un rechargement réel de la page replace le personnage dans le logement. Les armes, chargeurs, réserves, trois véhicules possédés, logement, 35 crédits et toutes les conséquences de campagne sont conservés. Le rappel du fourgon depuis le logement est confirmé et repéré sur la carte. Les positions et dégâts des véhicules empruntés ne sont pas sauvegardés entre sessions.

### Lumières, shaders et fluidité

Phares de nuit visibles, éclairage local des rues et intérieurs, eau animée observée aux Quais, sol humide et étalonnage activés. Le réglage « Lumières et shaders » a été désactivé puis réactivé. Les flashes de tir sont implémentés avec une lumière brève.

Recette en qualité élevée à **1920 × 1080** : 58–60 IPS après chargement dans les séquences observées, avec quatre relevés enregistrés à 60 IPS et un 95e percentile proche de 16,8 ms. La buvette affiche notamment 15 piétons et 3 véhicules ; le garage avec phares 10 et 4. Un creux ponctuel à 20 IPS a été vu pendant un changement de réglage et sa compilation graphique. Ces mesures concernent le navigateur disponible et ne certifient pas un portable de référence. Aucun message de niveau erreur JavaScript relevé dans la session finale du build compilé.

Preuves locales dans `artifacts/qa-upgrade.json`, `qa-upgrade-inventory.jpg`, `qa-upgrade-home-1080.jpg`, `qa-upgrade-headlights-1080.jpg`, `qa-upgrade-j02-1080.jpg`, `qa-upgrade-buvette-1080.jpg` et `qa-upgrade-production-1080.jpg`. Le viewport de recette a été rétabli à sa taille habituelle.

## Recette de campagne antérieure à l’extension

Recette du 18 novembre 2026. Navigateur Chromium intégré, viewport de 1920 × 1080, zoom normal et qualité élevée. Les déplacements et interactions ci-dessous passent par les commandes clavier et les menus du jeu, sans téléportation de test ni modification de la sauvegarde par script. Les reprises sont celles du menu de jeu.

## Campagne et quêtes jouées

- M01 : garage, sortie de voiture, dépôt par la porte nord sans arme ni implant, prise de puce, porte de cour, véritable descente à 0 m, passage sous les voies et remise après cinq secondes sans identification. État obtenu : 570 crédits et raccourci ouvert.
- M02 : tournée de l’agent suivie hors du champ de caméra, calendrier pris dans le local visitable et retour à Sorel. La filature s’interrompt en cas d’identification ou d’éloignement.
- M03 : permanence de Nadia, extraction du journal et retour.
- M04 : relais d’audit, copie puis choix de la filière Nadia.
- M05 : galerie communautaire S02 ouverte, arrivée distincte sur le plateau, relais d’alimentation et poste de commande. Horloge de purge visible.
- M06 : briefing par liaison au poste, salle de contrôle et fin « Registre public ». Retour en exploration et arrêt des contrôles.
- U01 : module, passage de service, réparation des lampes, persistance après rechargement.
- U02 : relevés, résidente et escorte jusqu’à la permanence ; porte de cour conservée.
- U03 : accord de la gardienne, armoire, choix de confier les preuves à Lise.
- U04 : papeterie des Quais par son porche et restitution au propriétaire ; carte annotée au garage.
- U05 : boîtier du portillon et information à l’équipe de nuit après la fin de campagne.
- C01-F, C02-F, C03-F et C04-Q : livraison, récupération, borne puis accompagnement terminés. Reprise au briefing contrôlée, identifiants d’offre conservés.

Après rechargement : les six missions principales, les cinq uniques, leurs conséquences, la filière Nadia, la fin publiée, le choix de Lise, les quatre occurrences communes et les **4 740 crédits** sont conservés. Aucun deuxième paiement au rechargement. Les preuves locales sont enregistrées dans `artifacts/qa-campaign-v2.json` et `artifacts/consequences-reloaded.jpg` (dossier ignoré par Git).

## Géométrie, simulation et tests

**30 tests Node réussis**, puis `npm run build` réussi.

- Toutes les routes, rampes et jonctions sont parcourues physiquement dans les deux sens par le gabarit entier de la voiture.
- Tous les passages piétons et les itinéraires successifs de toutes les quêtes sont parcourus avec les murs, portails, garde-corps et meubles réels.
- Les deux filières vers le plateau sont testées physiquement, y compris la marge de capsule à l’arrivée de S02.
- Garage et dépôt sont des murs percés ; le pont à +6 m, les voies à +3 m et le passage inférieur à 0 m restent distincts. Le masquage des toits et tabliers change le rendu, pas les collisions.
- Les réserves de chaussée, trottoirs, seuils et passages excluent les bâtiments et le mobilier. Le contrôle vertical retire aussi les éléments placés sous une rampe mais assez hauts pour l’intersecter.
- Les impacts distinguent côté, gravité, premier contact et frottement ; un contact immobile n’ajoute pas continuellement des dégâts. Les marques et bosses utilisent des réserves bornées et la réparation restaure les feux.
- Tests des destinations selon les horaires, refuge puis reprise d’activité, déplacement et freinage du trafic.
- Les quatre combinaisons filière/fin, les conséquences uniques, la migration v1, les sauvegardes corrompues, la reprise et les récompenses par occurrence sont vérifiées.

## Population et fluidité

Un trajet libre de plus de deux minutes a relié les Forges, La Dalle, la galerie, Le Nœud et Les Belvédères après la fin de campagne. Aucune mission n’était active et le solde est resté à 4 740 crédits. Plusieurs activités et véhicules ont été observés. La mesure locale est dans `artifacts/qa-free-roam-v2.json`.

Relevés au fil de la recette à 1080p : généralement 60 IPS, passages ponctuels à 54–58 IPS ; 95e percentile autour de 16,8 ms. Exemples observés : La Dalle 17 piétons/2 véhicules sur l’axe, Le Nœud 14/2 près du service de nuit, Les Belvédères 15/2 avec café, terrasse et banc. Les ruelles et les corridors techniques sont volontairement moins peuplés.

Ces chiffres décrivent le navigateur de recette. Aucun portable de référence n’était défini : ils ne certifient pas la cible sur une autre machine.

## Limites de recette et de contenu

Le parcours complet au clavier utilise Nadia et « Registre public ». La filière Sorel et l’autre fin ont des contrôles physiques et de progression, sans deuxième campagne complète dans l’interface. Une variante de chaque famille commune a été jouée ; les huit variantes disposent de parcours physiques et de contrôles de récompense.

Chrome et Firefox n’ont pas été lancés séparément. Rapier produit un avertissement interne d’initialisation ; Vite signale la taille du bloc contenant le WebAssembly. Aucun de ces avertissements ne bloque la compilation ou la partie.

Le contenu jouable reste plus court que les durées indicatives de la bible. Le rythme de 10–20 minutes par mission et 5–10 minutes par unique n’est pas présenté comme validé. Gel, brûlure et démembrement restent liés à des équipements ou dangers futurs, comme prévu par le plan web.

## Captures et derniers contrôles

Trois cadrages de nuit à la même échelle et orientation : `garage-night-1080.jpg`, `depot-night-1080.jpg`, `bridge-tunnel-night-1080.jpg`. Comparaisons au garage : `garage-grayscale-1080.jpg` et `garage-morning-1080.jpg`. La carte annotée est placée à l’écart du coursier et de Mina. Les commandes d’attente 08 h, 14 h et 21 h 30 ont été utilisées dans l’interface.

Le choc frontal en conduite a atteint le niveau de dégâts 3 sans traverser la bordure. La reprise a restauré le véhicule. Preuve locale : `qa-impact.json` et `car-impact.jpg`. Aucun message de niveau erreur JavaScript relevé dans la dernière session.


## Livraison

Livraison uniquement locale, conformément à la décision de l’utilisateur. Le site hébergé n’a pas été modifié. `../Deadline-jeu-web.zip` contient le build statique vérifié et les instructions de lancement ; `../Deadline-source.zip` contient les sources et les tests. Le serveur de développement sur le port 5186 est conservé pour l’aperçu.
