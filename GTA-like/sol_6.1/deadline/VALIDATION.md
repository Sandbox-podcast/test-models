# Validation de la version bible

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
