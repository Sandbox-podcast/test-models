# DeadLine

Jeu solo d’action et d’infiltration en 2,5D pour navigateur de bureau. La ville condense la topographie d’Angoulême en trois quartiers reliés. Les Forges réunissent le garage, les ateliers et les voies. La Dalle s’étage sur le coteau. Le Nœud occupe le plateau administratif.

## Lancer le jeu

Avec Node.js 22 et npm, exécuter `npm ci`, puis `npm run dev`. Ouvrir l’adresse locale affichée par Vite. `npm run build` vérifie TypeScript et prépare `dist/` pour un hébergement statique. Le jeu utilise WebGL 2. Les ressources, dont le moteur physique Rapier, sont incluses dans la compilation.

`npm run build:portable` produit `outputs/DeadLine.html`. Ouvrir ce fichier dans Chrome ou Firefox pour jouer directement, sans serveur.

| Action | Commandes |
| --- | --- |
| Marcher ou conduire | ZQSD, WASD ou flèches |
| Courir | Maj |
| Viser et tirer | Souris et clic gauche |
| Interagir, entrer et sortir de la voiture | E |
| Utiliser un implant | 1 ou 2 |
| Freiner | Espace |
| Ouvrir le journal ou mettre en pause | Tab ou Échap |

## Progression

Parler à Mina au garage pour accepter « Puce fantôme ». Le dépôt a une entrée sur l’avenue, une grille compatible avec Intrusion et un quai piéton ouvert au nord. Après le vol, la remise s’effectue à pied, sous les voies, après cinq secondes sans détection confirmée. Le pont à l’est permet de franchir les voies en voiture. La remise ouvre la grille de service et rend « Sous scellés » disponible auprès d’Ilyes.

La campagne se poursuit dans « Les effacés », puis « Le Nœud ». Le destinataire du registre dans La Dalle détermine l’entrée ouverte au Nœud. La décision finale modifie les accès et les contrôles réutilisés en exploration. Surcharge devient disponible au garage après le choix du destinataire.

La progression est liée au navigateur et à l’adresse de la page. Une fermeture pendant un contrat principal ramène au garage au point de reprise du briefing. Une livraison enregistre les choix, les accès et le paiement dans la même sauvegarde.
