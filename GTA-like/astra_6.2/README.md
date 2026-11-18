# DeadLine

Jeu solo d’action et d’infiltration en 3D pour navigateur de bureau. À Angoulême, une migration du système de badges menace de priver tout un quartier de ses accès. Mina, mécanicienne aux Forges, a besoin d’un coursier pour retrouver le bordereau d’un convoi.

## Jouer en local

Avec Node.js 22 et npm, depuis ce dossier, lancer le serveur de développement.

```sh
npm ci
npm run dev
```

Ouvrir l’adresse locale affichée par Vite dans un navigateur compatible WebGL 2. Cliquer sur **Jouer**, s’approcher de Mina et appuyer sur **E**. La voiture jaune attend dans le garage. Le journal permet de suivre un contrat et la carte situe son objectif.

| Commande | Action |
| --- | --- |
| ZQSD, WASD ou flèches | Marcher, accélérer, reculer et braquer |
| Maj | Courir |
| R, F | Recharger depuis la réserve, changer d’arme possédée |
| Souris et clic gauche | Viser et tirer |
| E | Parler, prendre, livrer, monter en voiture ou en descendre à l’arrêt |
| Espace | Freiner |
| 1 et 2 | Utiliser les implants équipés au point visé |
| I au garage | Équiper les implants ou attendre la prochaine relève |
| J, M, Échap | Journal, carte, pause |

## Ville et campagne

Les Forges, La Dalle, Le Nœud, Les Quais et Les Belvédères sont reliés par six liaisons routières. Les passerelles, escaliers et tunnels offrent d’autres passages aux piétons. Le marché ferme en soirée. Les passages cloutés accueillent les traversées et les véhicules ralentissent pour laisser passer les habitants.

Le journal suit six missions principales, cinq quêtes annexes uniques et quatre types de contrats renouvelables. La personne à qui vous confiez le registre détermine votre accès au plateau. Au poste de commande, les deux décisions finales restent possibles. La ville demeure explorable après la campagne.

Le navigateur sauvegarde les crédits, les contrats, les implants et les conséquences des choix sur cette adresse locale. En cas de chute ou de rechargement pendant un contrat, le coursier retrouve au garage le contrat accepté, à sa première étape. Le menu de pause permet de l’abandonner.

## Voitures en circulation et vigiles

À pied, approchez-vous d’une portière et appuyez sur **E**. Si la berline roule encore, le premier appui fait freiner le conducteur. Appuyez de nouveau quand « Prendre le volant de la berline » apparaît. **Espace** freine et **E** permet de descendre à l’arrêt. Vous pouvez retrouver cette berline là où vous l’avez laissée pendant la partie. Votre véhicule personnel reste garé à son emplacement.

Prendre la place d’un conducteur déclenche le niveau d’alerte **1**. Une voiture de vigiles intervient aussi si vous conduisez après un signalement. Après six secondes cumulées de contact visuel, le niveau **2** appelle un renfort. À seize secondes, le niveau **3** en appelle un second. Les trois voitures peuvent poursuivre le même véhicule d’un quartier à l’autre. Le radar situe les unités engagées et le HUD indique leur nombre et la distance de la plus proche.

Une voiture civile peut couper la vue des vigiles. Après une perte de contact, rouler au rythme de la file rend votre berline plus difficile à identifier. Les vigiles cherchent autour du dernier point signalé. Une nouvelle observation relance la poursuite. Sans nouveau signalement, la recherche prend fin après 12, 15 ou 18 secondes selon le niveau. Si un vigile vous garde à portée pendant cinq secondes à l’arrêt, il vous intercepte.

## Commerces et logements

Entrez à pied dans le Garage du Convoi, au nord du garage de Mina, et utilisez **E** devant la caisse. La Véloce GT et la Gabare utilitaire ont chacune leur carrosserie, leur gabarit et leur conduite. Sortir un véhicule du garage remise le précédent. Au Comptoir Balise, à l’est du dépôt, vous pouvez acheter la carabine à arc, le projecteur à prisme et des recharges. Le HUD affiche les munitions du chargeur puis la réserve.

Les contrats financent les achats. Les annonces devant la Maison des Ateliers et la Maison des Belvédères permettent d’acheter les clés. Une fois à l’intérieur, le comptoir permet de se reposer et de choisir son domicile. En exploration libre, la prochaine reprise s’y fera. Les armes, les munitions et les propriétés sont enregistrées avec les crédits dans la sauvegarde locale.

Le Café de la rive sert des repas aux Quais. Sur la carte (**M**), choisissez une adresse pour la suivre à l’écran pendant l’exploration libre. Si le décor ou un véhicule vous enferme, **Échap → Dépannage · retour au garage** ramène le coursier à pied aux Forges et conserve le contrat en cours.

## Version compilée

```sh
npm run build
npm run preview
```

Vite sert le contenu de `dist/` en local. Le moteur, la physique, les images et les polices sont inclus.

## Vérification

Lancer le serveur de développement, puis ouvrir un second terminal. Exécuter d’abord `npm run build` pour vérifier également la version compilée. Les tests utilisent des profils de navigateur temporaires et des sauvegardes isolées.

```sh
python -m pip install playwright
python -m playwright install chromium firefox
python verify_game.py chromium firefox
```

Le contrôle géométrique inspecte les deux voies des quatorze tracés, l’espace des trottoirs, les points d’interaction et les niveaux du pont et du tunnel. Un trajet conduit des Forges à La Dalle vérifie les trois niveaux et le déplacement continu des renforts. Un essai de navigation suit une voiture sur chacune des six liaisons. Une comparaison rejoue une poursuite de niveau 3 à la même vitesse avec et sans convoi sur la liaison J05. Les scénarios de circulation contrôlent la prise de volant, la poursuite en virage, la perte de contact et l’interception. Ils vérifient la priorité du joueur aux quatorze carrefours, les files devant une sortie occupée et deux minutes de circulation avec les 29 véhicules. Un test indépendant compare les triangles de la chaussée, des trottoirs, des sentiers et des accotements et contrôle la couverture des tracés. Les trois véhicules font le circuit dans les deux sens. Les tests parcourent aussi les commerces, les logements et leurs seuils, achètent et utilisent les biens, puis vérifient les débits, les munitions et la persistance. Deux parcours de la première mission utilisent les commandes de jeu pour la fuite et la remise. Les tests de la suite de la campagne placent le coursier aux points d’interaction pour exercer les variantes, les fins, les récompenses et la reprise.

Les options suivantes activent le parcours de deux minutes simulées, les mesures de rendu en 1920 × 1080 et les quatre captures au zoom de jeu. La mesure de fluidité utilise les images rendues en temps réel.

```powershell
$env:DEADLINE_LIFE = '1'
$env:DEADLINE_CAPTURES = '1'
python verify_game.py chromium firefox
```

Les captures se trouvent dans `captures/`. La variable `DEADLINE_TEST_URL` sélectionne un autre serveur de développement local.
