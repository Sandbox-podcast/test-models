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

## Version compilée

```sh
npm run build
npm run preview
```

Vite sert le contenu de `dist/` en local. Le moteur, la physique, les images et les polices sont inclus.

## Vérification

Lancer le serveur de développement, puis ouvrir un second terminal. Les tests utilisent des profils de navigateur temporaires et des sauvegardes isolées.

```sh
python -m pip install playwright
python -m playwright install chromium firefox
python verify_game.py chromium firefox
```

Le contrôle géométrique inspecte les deux voies des seize tracés, l’espace des trottoirs, les points d’interaction et les niveaux du pont et du tunnel. Deux parcours de la première mission utilisent les commandes de jeu pour la fuite et la remise. Les tests de la suite de la campagne placent le coursier aux points d’interaction pour exercer les variantes, les fins, les récompenses et la reprise.

Les options suivantes activent le parcours de deux minutes simulées, les mesures de rendu en 1920 × 1080 et les quatre captures au zoom de jeu. La mesure de fluidité utilise les images rendues en temps réel.

```powershell
$env:DEADLINE_LIFE = '1'
$env:DEADLINE_CAPTURES = '1'
python verify_game.py chromium firefox
```

Les captures se trouvent dans `captures/`. La variable `DEADLINE_TEST_URL` sélectionne un autre serveur de développement local.
