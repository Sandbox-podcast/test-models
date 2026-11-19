# Sandbox — Le banc d’essai des modèles IA

[![Licence MIT](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

**Le même défi, plusieurs modèles. À vous de juger sur pièce.**

Pour le podcast Sandbox, on met des modèles IA face à des cas d’usage concrets, puis on publie les consignes et les démos produites. Lancez le jeu, faites défiler la page ou rejouez l’animation pour voir ce que chaque modèle a réussi à livrer, où il a coincé et ce qui mérite un autre essai.

## Trois défis, vingt démos

| Défi | Ce qu’on met à l’épreuve | Démos et consignes |
| --- | --- | --- |
| **DeadLine** | Transformer une spec et une bible de jeu en prototype d’action et d’infiltration. On peut comparer les déplacements, les collisions, la conduite, les missions et la vie des quartiers. | [6 prototypes](#deadline--un-jeu-à-partir-dune-spec) · [Prompts](GTA-like/prompts.md) · [Spec](GTA-like/Deadline_spec.md) · [Plan](GTA-like/Deadline_dev_plan.md) · [Carte de référence](GTA-like/map_ref.md) · [Bible](GTA-like/bible/) |
| **COSMOS** | Créer une landing page de parfumerie immersive. On peut comparer la direction artistique, le flacon 3D, les effets au défilement et le rendu sur mobile. | [4 versions](#cosmos--un-flacon-quon-découvre-en-défilant) · [Brief et consigne 3D](landing/prompt.md) |
| **Transformer** | Animer en Three.js une voiture jaune qui devient un robot, marche, puis reprend sa forme initiale dans une boucle de 12 secondes. On peut comparer la mécanique, le rythme et la finition du rendu. | [10 scènes](#transformer--douze-secondes-pour-changer-de-forme) · [Prompt commun](Transformer/prompt.md) · [Données Sillage](Transformer/results.json) |

### DeadLine — Un jeu à partir d’une spec

| Variante | À découvrir |
| --- | --- |
| [Astra 6.2](GTA-like/astra_6.2/README.md) | Une mise en scène 3D des Forges, du garage de Mina aux poursuites. |
| [GLM 5.3](GTA-like/glm_5.3/README.md) | Le contrat « Puce fantôme » et une ville libre de cinq quartiers reliés. |
| [Luna 6](GTA-like/luna_6/README.md) | Une version compacte des Forges, avec plusieurs accès au dépôt et des renforts progressifs. |
| [Muse Wonder](GTA-like/muse_wonder/deadline/README.md) | La campagne à ramifications, les quêtes secondaires et les contrats récurrents. |
| [Sol 6.1](GTA-like/sol_6.1/deadline/README.md) | Une campagne à deux fins, des parcours à plusieurs niveaux et une ville qui évolue selon l’heure. |
| [Sol 6.2](GTA-like/sol_6.2/README.md) | Cinq quartiers, des intérieurs visitables et une économie avec véhicules, armes et propriétés. |

### COSMOS — Un flacon qu’on découvre en défilant

| Variante | À découvrir |
| --- | --- |
| [Astra 6.2](landing/astra-6.2/index.html) | Un flacon au format GLB, éclairé en WebGL et présenté sous plusieurs angles. |
| [Luna 6](landing/luna-6/index.html) | Un flacon composé de volumes CSS, des halos et un champ d’étoiles animé. |
| [Sol 6.1](landing/sol-6.1/README.md) | Un flacon sculpté en Three.js, manipulable à la souris, au clavier et au toucher. |
| [Sol 6.2](landing/sol-6.2/index.html) | Un flacon généré en WebGL et mis en scène dans des tableaux cosmiques au défilement. |

### Transformer — Douze secondes pour changer de forme

- **OpenAI** · [GPT-6 Astra](Transformer/gpt-6-astra/index.html) · [GPT-6 Luna](Transformer/gpt-6-luna/index.html) · [GPT-6.1 Sol](Transformer/gpt-6.1-sol/index.html) · [GPT-6.1 Terra](Transformer/gpt-6.1-terra/index.html) · [GPT-6.2 Astra](Transformer/gpt-6.2-astra/index.html) · [GPT-6.2 Sol](Transformer/gpt-6.2-sol/index.html)
- **Claude** · [Fable](Transformer/fable/index.html) · [Haiku](Transformer/haiku/index.html) · [Opus](Transformer/opus/index.html) · [Sonnet](Transformer/sonnet/index.html)

Les [mesures du benchmark](Transformer/README.md) détaillent les versions annoncées, les durées et les attentes humaines.

### Lancer une démo en local

Pour les six **DeadLine** et **COSMOS Sol 6.1**, entrez dans le dossier de la variante qui contient `package.json`, puis lancez ces commandes avec Node.js 22.12+ et npm. Ouvrez l’adresse affichée dans le terminal.

```sh
npm ci
npm run dev
```

Pour les autres versions de **COSMOS** et les scènes **Transformer**, lancez ce serveur depuis la racine du dépôt, puis ouvrez le chemin du fichier dans le navigateur. Par exemple, [COSMOS Astra 6.2](http://127.0.0.1:8000/landing/astra-6.2/) ou [Transformer Opus](http://127.0.0.1:8000/Transformer/opus/). Prévoyez un navigateur compatible WebGL et une connexion Internet pour les scènes Transformer, qui chargent Three.js depuis un CDN.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

## À vous de jouer

- **Testez un autre modèle** sur l’un des trois défis. Reprenez les entrées et les étapes du protocole, conservez la sortie brute et joignez la trace du run à votre pull request.
- **Proposez votre propre défi.** Choisissez un livrable vérifiable, publiez le prompt et les conditions d’exécution, puis ajoutez au moins un résultat de référence.

Le contrôle GitHub vérifie la fiche du run et les empreintes des consignes, de la trace et des fichiers livrés. La revue confronte les messages réellement envoyés, les réglages et l’aide humaine au protocole. Le [guide de contribution](CONTRIBUTING.md) explique comment préparer un essai et documenter les écarts.

Les prototypes historiques de DeadLine et de COSMOS ont été enrichis au fil de plusieurs échanges. Transformer, réalisé par **Marlburrow**, documente une exécution par modèle avec un prompt commun et un effort `medium`. Comparez les démos à conditions équivalentes et interprétez chaque sortie comme un résultat d’essai.

## Licence

Le code et la documentation du projet sont publiés sous [licence MIT](LICENSE). Les éléments tiers restent soumis à leurs licences respectives, dont les polices [Baskervville](landing/astra-6.2/assets/baskervville-license.txt) et [DM Sans](landing/astra-6.2/assets/dm-license.txt).
