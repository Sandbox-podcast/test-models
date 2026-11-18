# DeadLine

Jeu solo d’action et d’infiltration pour navigateur desktop, au clavier et à la souris. La ville réunit Les Forges, La Dalle et Le Nœud dans une géographie condensée inspirée d’Angoulême.

## Lancer le jeu

Avec Node.js 22 et npm, depuis la racine du projet :

```sh
npm ci
npm run dev
```

Ouvrir l’adresse affichée par Vite dans un navigateur avec WebGL 2. Depuis le terminal du coursier, **Jouer** donne accès aux Forges. **E** ouvre le briefing de Mina. **J** affiche le journal, **M** la carte et **Échap** le menu de pause.

| Commande | Action |
| --- | --- |
| ZQSD, WASD ou flèches | Marcher, accélérer, reculer et braquer |
| Maj | Courir |
| Souris et clic gauche | Viser et tirer |
| E | Parler, prendre un objet, livrer, monter en voiture ou descendre |
| Espace | Freiner |
| 1 et 2 | Utiliser les implants équipés |
| I au garage | Choisir les deux implants |

## Campagne

Les trois chapitres comportent cinq contrats au total, dont deux secondaires. Les dialogues de livraison déterminent votre contact, votre accès au Nœud et le sort du registre. Les récompenses, les passages ouverts et le contrat en cours sont conservés dans le stockage local du navigateur. Recharger pendant un contrat reprend au garage avec le contrat accepté. Le journal permet de recommencer une campagne.

## Version statique

```sh
npm run build
npm run preview
```

Le contenu de `dist/` se sert à la racine d’un site statique par HTTP ou HTTPS. Three.js, Rapier, le module WebAssembly, les illustrations et les polices sont distribués avec le jeu.

## Vérification des parcours

`verify_game.py` utilise Python et Playwright avec des profils vierges. Il se connecte au serveur Vite de développement, exécute le déplacement simulé pour les trajets des Forges et vérifie les transitions des autres contrats en plaçant le personnage près de leurs points d’interaction. La variable `DEADLINE_TEST_URL` permet de changer l’adresse du serveur de développement.

```sh
python -m pip install playwright
python -m playwright install chromium firefox
python verify_game.py
```
