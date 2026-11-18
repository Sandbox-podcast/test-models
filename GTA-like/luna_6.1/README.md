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
| E | Parler, prendre un objet, entrer ou sortir du véhicule |
| R | Utiliser l’implant de l’emplacement R |
| F | Utiliser l’implant de l’emplacement F |
| J | Ouvrir le journal |
| Échap | Pause |

En voiture, l’accélération est sur Z/W et le frein ou la marche arrière sur S. Relâche l’accélérateur et ralentis avant de sortir. La caméra suit le coursier et anticipe la direction de la voiture.

## Contenu jouable

- Garage de Mina, avenues, cour de livraison, ruelles, passage sous les voies et pont routier surélevé.
- Contrat « Puce fantôme » avec entrée principale, grille de cour piratable, patrouilles, caméra, tir et leurre.
- Poursuite et recherche de la dernière position connue; livraison à pied après cinq secondes sans détection directe.
- Reprise au briefing, sauvegarde versionnée locale, raccourci persistant et contrat secondaire « Données fantômes ».
- Deux implants à équiper parmi ceux débloqués; le contrat secondaire débloque Surcharge.

La progression permanente est conservée dans `localStorage` sous la clé `deadline.puce-fantome.save.v1`. Pour recommencer une partie, efface cette clé dans les outils de développement du navigateur.
