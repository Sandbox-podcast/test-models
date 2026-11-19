# Contribuer au banc d’essai Sandbox

Vous pouvez essayer un autre modèle sur un défi existant ou proposer un nouveau cas d’usage. Une démo qui échoue ou qui ne termine qu’une partie du défi peut aussi être publiée. Décrivez le point d’arrêt et conservez ce que le modèle a produit.

## Rejouer un défi

1. Faites un fork et créez une branche. Lisez le protocole du défi et ses entrées. [DeadLine](GTA-like/protocol.json) · [COSMOS](landing/protocol.json) · [Transformer](Transformer/protocol.json).
2. Partez d’une session neuve et d’un dossier de travail propre avec les seules entrées du défi. Envoyez les messages dans l’ordre du protocole, puis notez le modèle demandé et, s’il est visible, le modèle annoncé, l’outil et sa version, ses réglages, les outils autorisés et l’accès réseau. Pour comparer plusieurs modèles, gardez ces conditions et le nombre d’essais aussi proches que possible.
3. Gardez la sortie brute de l’essai. Consignez chaque relance, précision, validation manuelle, retouche et différence de configuration. Si vous retentez le défi depuis le début, enregistrez chaque essai dans un dossier distinct. Utilisez `deviations` pour signaler tout écart au protocole, intervalle de trace manquant ou réglage non vérifiable.
4. Rejouez la démo avec les critères du protocole. Notez ce qui fonctionne, ce qui échoue et les conditions de vérification. Une durée manquante reste `null`. Si vous avez les deux mesures, indiquez le temps écoulé total et la part passée à attendre une intervention humaine.

## Publier un essai

Ajoutez un dossier `<défi>/runs/<identifiant>/`, par exemple `Transformer/runs/mon-modele-01/`. Il contient trois éléments.

| Chemin | Contenu |
| --- | --- |
| `run.json` | Fiche d’exécution. Reprenez les champs de l’exemple ci-dessous. |
| `transcript.md` | Export ou transcription de l’essai, avec les messages effectivement envoyés dans leur ordre, les réglages observables et toute intervention humaine. Précisez les pièces jointes et à quelle étape elles ont été fournies. Conservez les passages qui permettent à la revue de confirmer ces informations. Retirez les secrets et données personnelles, et signalez les passages masqués. |
| `output/` | Fichiers produits par le modèle et nécessaires à la démo. Si l’essai a échoué avant de produire un fichier, le dossier peut être absent. Laissez les caches, `node_modules` et journaux temporaires hors de Git. |

Exemple de `run.json` pour Transformer. Adaptez les valeurs à votre essai.

```json
{
  "date": "2026-11-19",
  "model": "identifiant-du-modele-demande",
  "reportedModel": null,
  "runner": "Nom et version de l’outil ou du harnais",
  "effort": "medium",
  "environment": "OS, versions utiles, outils autorisés et accès réseau",
  "stepsRun": 1,
  "status": "completed",
  "durationSeconds": null,
  "humanWaitSeconds": null,
  "deviations": [],
  "launch": "Servir output/ par HTTP puis ouvrir index.html"
}
```

`stepsRun` compte les messages du protocole effectivement envoyés. Utilisez `completed`, `partial` ou `failed` pour décrire l’état de l’essai. Un essai peut être `completed` même si son rendu ne satisfait pas tous les critères. Utilisez `null` pour `effort` ou `reportedModel` si le réglage ou le modèle annoncé n’est pas visible. Si aucune démo ne peut être lancée, expliquez pourquoi dans `launch`.

Depuis la racine du dépôt, enregistrez les empreintes puis vérifiez le dossier avec Python 3.10+ et Git.

```sh
python scripts/validate_runs.py --record Transformer/runs/mon-modele-01/run.json
python scripts/validate_runs.py
```

Ouvrez ensuite une pull request avec le résumé des vérifications et les écarts éventuels. Vous devez avoir le droit de publier les fichiers proposés. En contribuant, vous acceptez que vos ajouts originaux soient distribués sous [licence MIT](LICENSE). Joignez leurs notices aux éléments tiers que vous avez le droit de redistribuer.

## Proposer un nouveau défi

Créez `benchmarks/<nom-du-defi>/`. Ajoutez un README qui explique l’objectif, le résultat attendu et comment l’observer, puis publiez les messages et les éventuelles pièces jointes. Dans `protocol.json`, indiquez les chemins des `inputs` relatifs au dossier du défi, les `steps` dans leur ordre et les `criteria` à examiner. `effort` est facultatif. Ajoutez au moins un essai sous `runs/` et liez le défi depuis le README principal. Pour faire évoluer les consignes d’un défi déjà utilisé, créez une nouvelle variante de protocole dans `benchmarks/` afin que les essais précédents restent vérifiables.

## Comment la validation fonctionne

Le contrôle GitHub `Validation des essais` vérifie la fiche, le nombre d’étapes déclaré, l’effort attendu lorsqu’il est fixé et les empreintes des entrées, de la trace et des sorties. Les fichiers sources textuels du protocole sont hachés avec des fins de ligne LF. Les traces et les sorties sont contrôlées octet pour octet. Les démos ne sont pas exécutées par ce contrôle.

La personne qui relit la pull request compare la trace aux entrées et aux étapes publiées, vérifie les réglages, les interventions humaines et les résultats observés. Pour une reproduction à comparer aux autres, elle doit pouvoir retrouver les messages et réglages nécessaires et constater que la procédure a été suivie. Une soumission avec écart déclaré peut être conservée comme variante en faisant figurer cet écart sur sa fiche et dans la PR. Les démos historiques sont consultables à leurs emplacements d’origine. Les protocoles ci-dessus servent de référence aux futurs essais.
