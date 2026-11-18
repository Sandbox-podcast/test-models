# DeadLine — Puce fantôme (Les Forges)

Jeu d'action/infiltration cyberpunk 2.5D vue du dessus (Three.js + TypeScript + Vite), d'après `Deadline_spec.md` v0.3, `Deadline_dev_plan.md` et `map_ref.md` (Angoulême condensée : gare–L'Houmeau / ville basse).

## Lancer

```powershell
npm install
npm run dev      # développement : http://127.0.0.1:5173/
npm run build    # compilation TypeScript + build de production (dist/)
npm run preview  # sert le build : http://127.0.0.1:4173/
```

Ouvrir l'URL dans Chrome ou Firefox sur ordinateur, cliquer **Jouer**.

## Boucle jouable

1. Exploration libre des Forges (4 pâtés de maisons, avenue, voies, pont routier, passage sous les voies).
2. Briefing chez Mina au garage : choix de 2 implants, point de reprise créé.
3. Vol de la puce au dépôt par l'entrée principale (sans implant) ou par la cour (grille **Intrusion** / **Leurre**, sans tirer).
4. Fuite en voiture par le pont ou à pied par le passage inférieur, poursuite des vigiles (dernière position connue, fouille).
5. Remise à Mina à pied après 5 s sans détection confirmée → grille de service ouverte durablement + contrat secondaire (livraison Galerie → Jules, débloque **Surcharge**).
6. Échec : reprise au briefing (puce, voiture, vigiles restaurés) ou abandon vers la ville libre.

Sauvegarde versionnée `localStorage` (`deadline-save-v1`) : après rechargement, mission terminée, raccourci et contrat secondaire persistent ; récompenses touchées une seule fois.

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD / flèches | Se déplacer / conduire |
| Souris | Viser |
| Clic gauche | Tirer (à pied) |
| E | Parler, prendre, monter/descendre |
| F / R (/ G) | Implants équipés (Intrusion, Leurre, Surcharge) |
| J | Journal (décision, effet immédiat, conséquence future) |
| Échap | Pause (aussi sur perte de focus) |

## Notes d'implémentation

- Caméra orthographique quasi verticale à orientation fixe, anticipation en voiture, toits et tablier du passage estompés quand ils masquent le joueur.
- Simulation à pas fixe 60 Hz, collisions cercle/AABB, lignes de vue coupées par les murs ; caméra de surveillance à délai de confirmation visible, drone de cour.
- Effets de violence : éclaboussures et traces de sang en pools fixes, recul/trébuchement/chute, collisions voiture selon la vitesse (léger vs grave).
- Écart assumé vs plan : la physique utilise des collisions AABB maison au lieu de Rapier (pas de WASM à charger, démarrage immédiat) ; le reste de la stack (Three.js, TypeScript, Vite, sauvegarde locale) suit le plan.
