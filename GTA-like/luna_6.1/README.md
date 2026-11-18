# DeadLine — Puce fantôme

Démo solo de jeu d’action et d’infiltration, dans une version compacte du quartier des Forges. La ville est générée en volumes bas poly; ses collisions et les déplacements des personnages passent par Rapier 3D.

## Lancer la démo

```powershell
npm install
npm run dev
```

Pour produire les fichiers statiques à héberger, lance `npm run build`. Le résultat est placé dans `dist/` et peut être servi depuis un hébergement statique.

## Commandes

| Touche | Action |
|---|---|
| ZQSD ou WASD | Marcher / conduire |
| Souris | Viser |
| Clic gauche | Tirer |
| E | Parler, prendre un objet, entrer ou sortir d’un véhicule, intercepter une voiture civile |
| R | Utiliser l’implant de l’emplacement R |
| F | Utiliser l’implant de l’emplacement F |
| 1–4 | Choisir une arme possédée |
| G | Recharger l’arme équipée |
| J | Ouvrir le journal |
| Échap | Pause |

En voiture, l’accélération est sur Z/W et le frein ou la marche arrière sur S. Relâche l’accélérateur et ralentis avant de sortir. La caméra suit le coursier et anticipe la direction de la voiture. Maintiens le clic gauche pour tirer en rafale avec une arme automatique.

## Contenu jouable

- Garage de Mina, avenues, cour de livraison, ruelles, passage sous les voies et pont routier surélevé.
- Contrat « Puce fantôme » avec entrée principale, grille de cour piratable, patrouilles, caméra, tir et leurre.
- Quatre niveaux d'alerte, poursuites et renforts progressifs jusqu'à quatre voitures; les vigiles gardent la dernière position connue assez longtemps pour suivre le joueur d'un quartier à l'autre.
- Reprise au briefing, sauvegarde versionnée locale, raccourci persistant et contrat secondaire « Une porte de plus ».
- Deux implants à équiper parmi ceux débloqués; le contrat secondaire débloque Surcharge.
- Trois modèles de véhicules conduisibles, sélectionnables au garage de Mina et sauvegardés avec la progression.
- Les voitures civiles en circulation peuvent être interceptées; leur vol déclenche une alerte et des patrouilles en voiture poursuivent le joueur. Le trafic peut couper leur ligne de vue et permettre au joueur de les semer.
- Les voitures de trafic changent de voie pour laisser passer le joueur, suivent les distances de sécurité et contournent les arrêts prolongés près des carrefours.
- Quatre armes aux portées, cadences, dégâts et chargeurs distincts; réserves, rechargement et achats de munitions.
- Catalogue de Mina pour les véhicules, armes et deux maisons; les intérieurs sont accessibles par leurs portes et une maison achetée sert de refuge.
- Éclairage de rue animé, halos shader pulsés et récupération locale si le personnage reste coincé contre un obstacle.

La progression permanente est conservée dans `localStorage` sous la clé `deadline.puce-fantome.save.v1`. Pour recommencer une partie, efface cette clé dans les outils de développement du navigateur.
