# DeadLine — Puce fantôme (Les Forges)

Jeu d'action/infiltration cyberpunk 2.5D vue du dessus (Three.js + TypeScript + Vite), d'après `Deadline_spec.md` v0.3, `Deadline_dev_plan.md` et `map_ref.md` (Angoulême condensée : gare–L'Houmeau / ville basse).

## Lancer

```powershell
npm install
npm run dev      # développement : http://127.0.0.1:5615/
npm run build    # compilation TypeScript + build de production (dist/)
npm run preview  # sert le build : http://127.0.0.1:5615/
```

Ouvrir l'URL dans Chrome ou Firefox sur ordinateur, cliquer **Jouer**.

## Boucle jouable

1. Exploration libre des Forges (4 pâtés de maisons, avenue, voies, pont routier, passage sous les voies).
2. Briefing chez Mina au garage : choix de 2 implants, point de reprise créé.
3. Vol de la puce au dépôt par l'entrée principale (sans implant) ou par la cour (grille **Intrusion** / **Leurre**, sans tirer).
4. Fuite en voiture par le pont ou à pied par le passage inférieur, poursuite des vigiles (dernière position connue, fouille).
5. Remise à Mina à pied après 5 s sans détection confirmée → grille de service ouverte durablement + quête unique **U01 — Une porte de plus** (bible) : module du garage à poser au panneau de la grille verte, lampes allumées durablement, débloque **Surcharge**.
6. Échec : reprise au briefing (puce, voiture, vigiles restaurés) ou abandon vers la ville libre.
7. Campagne bible : **M02 — Date d'effet** (Sorel, annexe des archives Civis, calendrier papier → accès La Dalle au journal), **U04 — Papier carbone** (documents côté quai → carte annotée au garage). Mina se déplace **sous les voies** pour la remise M01 ; le pont est (avenue → rue haute) est surélevé avec rampes ; plages d'activité Soirée/Nuit/Aube (lumière, flux piétons, trafic).
8. Suite de campagne (bible 02/03/06/08) : quartiers **La Dalle, Le Nœud, Les Quais, Les Belvédères** reliés (J01–J06), **M03** (Nadia, permanence, journal du portique), **U02** (escorte de la résidente), **U03** (dossier de Lise, choix détruire/remettre), **M04** (registre, **filière Nadia ou Sorel** ouvrant galerie S02 ou annexe), **M05** (poste de commande), **M06** (**Fin A/B** avec enseignes d'après-campagne), **U05** (portillon du Nœud) et **contrats communs C01–C04** rotatifs chez Mina (120 ¤ par occurrence).

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

## Monde vivant & collisions (bible 05/07)

- 12 piétons (cible Forges 8–14) : flux entre ateliers, dépôt, voies et cafés, plus des lieux occupés (mécanos au garage, habitués au café, voyageur au passage) ; fuite lors d'un incident.
- 3 voitures de trafic (cible 2–4) sur une boucle avenue séparée du graphe piéton : elles ralentissent derrière le joueur ou un autre véhicule puis repartent, phares/feux visibles.
- Dégâts voiture gradués et persistants jusqu'à la reprise : rayure (> 3,5), bosse/phare (> 8), déformation teintée (> 13), frottement distingué du choc.
- Audit de placement rejoué par script : points clés, waypoints des vigiles et spots piétons vérifiés hors des murs (9 blocages corrigés : tunnel scellé, colis dans un bâtiment, rue bloquée par le garage, waypoint dans une caisse…).

## Notes d'implémentation

- Caméra orthographique quasi verticale à orientation fixe, anticipation en voiture, toits et tablier du passage estompés quand ils masquent le joueur.
- Simulation à pas fixe 60 Hz, collisions cercle/AABB, lignes de vue coupées par les murs ; caméra de surveillance à délai de confirmation visible, drone de cour.
- Effets de violence : éclaboussures et traces de sang en pools fixes, recul/trébuchement/chute, collisions voiture selon la vitesse (léger vs grave).
- Écart assumé vs plan : la physique utilise des collisions AABB maison au lieu de Rapier (pas de WASM à charger, démarrage immédiat) ; le reste de la stack (Three.js, TypeScript, Vite, sauvegarde locale) suit le plan.
