# Transformer — Benchmark 3

Benchmark de Marlburrow partagé pour l’épisode Sandbox du 18 novembre 2026 : une voiture jaune se transforme en robot, marche, puis redevient une voiture, dans une boucle de 12 secondes.

Le [prompt intégral](prompt.md) est identique pour les dix variantes. Chaque dossier contient le fichier `index.html` original produit par le modèle, copié sans modification. Une seule exécution par variante, effort `medium` pour toutes : il s’agit d’une comparaison de productions, pas d’un classement statistique.

## Productions

| Modèle annoncé par le moteur | Production | Temps de travail | Durée écoulée | Attente humaine |
|---|---|---:|---:|---:|
| claude-opus-5-5 | [opus](opus/index.html) | 35 min 21 s | 67 min 23 s | 32 min 01 s |
| claude-fable-5-2 | [fable](fable/index.html) | 33 min 53 s | 33 min 53 s | 0 min 00 s |
| claude-sonnet-5-5 | [sonnet](sonnet/index.html) | 20 min 26 s | 20 min 26 s | 0 min 00 s |
| claude-haiku-5-5 | [haiku](haiku/index.html) | 9 min 42 s | 9 min 42 s | 0 min 00 s |
| gpt-6-astra | [gpt-6-astra](gpt-6-astra/index.html) | 9 min 18 s | 9 min 18 s | 0 min 00 s |
| gpt-6.2-sol | [gpt-6.2-sol](gpt-6.2-sol/index.html) | 7 min 57 s | 7 min 57 s | 0 min 00 s |
| gpt-6.2-astra | [gpt-6.2-astra](gpt-6.2-astra/index.html) | 4 min 43 s | 4 min 43 s | 0 min 00 s |
| gpt-6.1-terra | [gpt-6.1-terra](gpt-6.1-terra/index.html) | 1 min 14 s | 1 min 14 s | 0 min 00 s |
| gpt-6-luna | [gpt-6-luna](gpt-6-luna/index.html) | 2 min 46 s | 2 min 46 s | 0 min 00 s |
| gpt-6.1-sol | [gpt-6.1-sol](gpt-6.1-sol/index.html) | 4 min 32 s | 4 min 32 s | 0 min 00 s |

## Ouvrir les scènes

Depuis ce dossier, lancer un serveur statique :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrir ensuite le dossier du modèle dans le navigateur via ce serveur. Si le serveur tourne sur une machine distante, utiliser un tunnel SSH ou son adresse de prévisualisation. GitHub affiche le code HTML et ne lance pas les scènes.

Une connexion Internet est nécessaire pour charger Three.js depuis les CDN référencés dans chaque fichier. Aucune compilation ni clé API n’est nécessaire.

## Mesures et limites

- Benchmark créé le 2026-11-17 ; partagé pour l’épisode du 18 novembre.
- Les [mesures enregistrées](results.json) proviennent de Sillage : modèles demandés et annoncés, versions des CLI, durées, jetons, outils et empreintes SHA-256 des fichiers.
- Le temps de travail est la durée écoulée moins l’attente humaine : le chronomètre de Sillage s’arrête quand une demande attend une réponse. Il inclut les outils ; ce n’est pas un temps de calcul pur du modèle.
- Opus tournait en mode `bypassPermissions`, mais Claude Code 2.1.325 a quand même demandé neuf autorisations : son garde-fou contre les suppressions dangereuses (`dangerousRemoval`) s’est déclenché à chaque commande contenant `rm -f shots/*`, que le modèle lançait pour vider ses captures. Ces demandes sont restées 32 minutes sans réponse. Elles sont retirées de son temps de travail, qui passe de 67 min 23 s à 35 min 21 s. Aucune autre variante n’a attendu.
- Les coûts présents sont les valeurs historiques enregistrées par le harnais, pas une facture ni un recalcul aux tarifs actuels. `null` signifie non renseigné, jamais gratuit.
- Le statut `succeeded` indique que l’agent a terminé ; il ne certifie pas le respect du prompt, la qualité visuelle ou le bon fonctionnement de la scène.
- Les productions sont conservées telles quelles, avec leurs éventuels défauts. Aucun classement ni note n’a été ajouté.
