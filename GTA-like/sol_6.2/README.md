# DeadLine

Jeu solo d’action et d’infiltration en 2,5D pour navigateur de bureau. Les Forges réunissent les ateliers et les voies ferrées. La Dalle s’étage sur le coteau. Le Nœud occupe le plateau administratif. Les Quais rejoignent la Charente et les Belvédères prolongent les remparts.

## Jouer en local

Ouvrir [DeadLine.html](outputs/DeadLine.html) dans Chrome ou Firefox. Le fichier contient le jeu et ses ressources. La partie est enregistrée dans le navigateur pour ce fichier.

| Action | Commandes |
| --- | --- |
| Marcher ou conduire | ZQSD, WASD ou flèches |
| Courir | Maj |
| Viser et tirer | Souris et clic gauche |
| Interagir, entrer et sortir de la voiture | E |
| Utiliser un implant | 1 ou 2 |
| Freiner | Espace |
| Ouvrir le journal ou la carte | Tab ou M |
| Mettre en pause | Échap |

Parler à Mina pour accepter « Puce fantôme ». La cour et le quai nord permettent une entrée à pied. La rue longeant le dépôt donne sur un parking de fuite et sur le pont routier. La remise s’effectue à pied, sous les voies, après cinq secondes sans détection confirmée.

Les six missions principales suivent le bordereau de la puce jusqu’au poste de commande de Civis. Le destinataire du registre détermine l’accès privilégié au Nœud. Le choix final agit sur les contrôles et les services. Les cinq quêtes uniques modifient des lieux de la ville. Le panneau des relais propose aussi quatre types de contrats avec des trajets fixes qui se renouvellent après validation.

Le journal indique le prochain accès praticable et les conséquences des choix. Les passants vont aux ateliers, à l’école, à la halle ou aux guichets selon l’heure. Le trafic cède le passage aux intersections. La collision utilise les mêmes emplacements que le décor. Les traces d’impact restent sur la carrosserie jusqu’à la reprise au garage.

## Sauvegarde et compilation

Une fermeture pendant une séquence restaure son point de reprise. La version 2 reprend les crédits, les implants et les décisions des sauvegardes de la démo lorsqu’elles sont accessibles au navigateur. Les anciennes missions actives reprennent au premier objectif de leur équivalent dans la nouvelle campagne.

Avec Node.js 22 et npm, exécuter npm ci, puis npm run dev. npm run build:portable reconstruit outputs/DeadLine.html. npm run build prépare aussi la distribution statique dans dist/.

npm run test:world vérifie les passages des deux voies dans les deux sens, les accès des missions, le placement du mobilier et les trajets des passants et des véhicules avec Rapier.
