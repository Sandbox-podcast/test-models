# DeadLine

Jeu solo d’action et d’infiltration en 2,5D pour navigateur de bureau. Les Forges réunissent les ateliers et les voies ferrées. La Dalle s’étage sur le coteau. Le Nœud occupe le plateau administratif. Les Quais rejoignent la Charente et les Belvédères prolongent les remparts.

## Jouer en local

Avec Node.js 22 et npm, exécuter `npm ci` puis `npm run dev`. Ouvrir l’adresse affichée dans Chrome ou Firefox. Pour obtenir un fichier autonome, exécuter `npm run build:portable` puis ouvrir `outputs/DeadLine.html`. La partie est enregistrée dans le navigateur.

| Action | Commandes |
| --- | --- |
| Marcher ou conduire | ZQSD, WASD ou flèches |
| Courir | Maj |
| Viser et tirer | Souris et clic gauche |
| Changer d’arme, ouvrir l’arsenal, recharger | F, I ou R |
| Interagir, entrer et sortir de la voiture | E |
| Utiliser un implant | 1 ou 2 |
| Freiner | Espace |
| Se dégager du décor ou d’une voiture | T |
| Consulter ou démarrer une activité | G |
| Ouvrir le journal ou la carte | Tab ou M |
| Mettre en pause | Échap |

Parler à Mina pour accepter « Puce fantôme ». La cour et le quai nord permettent une entrée à pied. La rue longeant le dépôt donne sur un parking de fuite et sur le pont routier. La remise s’effectue à pied, sous les voies, après cinq secondes sans détection confirmée.

Les six missions principales suivent le bordereau de la puce jusqu’au poste de commande de Civis. Le destinataire du registre détermine l’accès privilégié au Nœud. Le choix final agit sur les contrôles et les services. Les cinq quêtes uniques modifient des lieux de la ville. Le panneau des relais propose aussi quatre types de contrats avec des trajets fixes qui se renouvellent après validation.

Le journal indique le prochain accès praticable et les conséquences des choix. Les passants vont aux ateliers, à l’école, à la halle ou aux guichets selon l’heure. Le trafic cède le passage aux intersections. La collision utilise les mêmes emplacements que le décor. Les traces d’impact restent sur la carrosserie jusqu’à la reprise au garage.

## Commerces et propriétés

La carte **M** signale les portes des lieux visitables. Sélectionner un lieu y pose un repère.

- Le **Comptoir Impulsion**, aux Forges, vend trois armes en plus de l’Étincelle. Chaque modèle conserve son chargeur et sa réserve. Les boîtes se rachètent au comptoir.
- **Véhicules Mina**, près de la rue basse des ateliers, vend quatre modèles. Une place de livraison est indiquée après l’achat. Le comptoir permet de récupérer et de réparer un véhicule déjà acheté. Les véhicules achetés reviennent à leur emplacement de livraison à la reprise. Les véhicules garés en ville se conduisent également.
- La **Halle des Quais** et le **Café des Remparts** servent des repas qui restaurent l’intégrité. La halle ouvre de 5 h à 19 h et laisse sortir les clients à la fermeture.
- La **Maison de la Traverse** et la **Maison des Terrasses** ouvrent après l’achat. S’y reposer restaure l’intégrité et enregistre ce lieu pour la prochaine reprise en ville libre.

La touche **T** essaie une autre sortie du véhicule ou ramène le personnage à un emplacement libre récent. Le contrat et les achats sont conservés.

## Poursuites et ville libre

Un acte violent signalé ou un gros accident vu par un passant peut déclencher une poursuite. Un premier niveau mobilise une patrouille, le deuxième en mobilise deux et le troisième jusqu’à quatre. Les sirènes indiquent qu’une patrouille approche. Quand les unités perdent le contact visuel, elles vérifient la dernière position connue. Le compte à rebours de recherche fait baisser les niveaux un à un. Rester immobilisé près d’une patrouille qui vous a repéré peut mener à une interpellation.

Ouvrir **G** pour voir les cinq activités et afficher leur départ sur la carte. Les activités se lancent entre les contrats et leurs récompenses et résultats sont sauvegardés.

- **Les Forges** accueillent un tour chronométré de huit points de passage.
- **La Dalle** propose une navette avec trois arrêts.
- **Le Nœud** propose la relève de trois balises à pied.
- **Les Quais** confient un chargement dont l’état détermine le bonus à la livraison.
- **Les Belvédères** proposent un carnet de trois points de vue photographiques.

## Sauvegarde et compilation

Une fermeture pendant une séquence restaure son point de reprise. Les crédits, implants, décisions, achats et munitions sont conservés. Les anciennes sauvegardes du navigateur conservent leur progression et reçoivent l’arsenal de départ.

`npm run build` prépare la distribution statique dans `dist/`.

npm run test:world vérifie les emprises et l’altimétrie, les quatre gabarits sur les deux voies et dans les deux sens, les portes, les places de stationnement, les accès des missions et les trajets des passants et des véhicules avec Rapier.

npm run test:pursuit vérifie la continuité du réseau de poursuite entre les cinq quartiers, les sept liaisons dans les deux sens et l’accès aux étapes des activités.
