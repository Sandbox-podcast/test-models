# Ville vivante — Population et activité

La ville doit rester animée en exploration libre, avant et après les missions. Les passants et les véhicules ont des destinations. Les lieux où des gens s’arrêtent ou attendent sont aussi importants que les rues où ils circulent.

## Densité à viser

Les chiffres désignent les **personnages visibles simultanément** sur les axes fréquentés depuis la caméra normale. Ce sont des cibles de blocage, avec des passages volontairement plus calmes dans les ruelles et les zones techniques. Les habitants d’ambiance s’ajoutent aux personnages de mission.

| Quartier | Piétons | Trafic visible | Activités caractéristiques |
|---|---:|---:|---|
| Les Forges | 8–14 | 2–4 véhicules | Mécanos devant les ateliers, livraisons, voyageurs le long des voies. |
| La Dalle | 14–24 | 1–3 véhicules | Habitants sur les paliers, commerces, trajets scolaires et file à la permanence. |
| Le Nœud | 10–18 | 2–4 véhicules | Employés entre les bâtiments, visiteurs qui attendent, relève des vigiles. |
| Les Quais | 14–24 | 2–4 véhicules | Marché, manutention sur le quai haut, promenade en contrebas. |
| Les Belvédères | 10–18 | 1–3 véhicules | Terrasses, bancs, traversées piétonnes et promeneurs sur les remparts. |

## Comportements et intégration

- Chaque passant appartient à un flux. Relier des origines et des destinations comme école, atelier, arrêt, marché et domicile. Répartir les groupes en transit et les personnes qui discutent, patientent ou travaillent.
- Faire varier les flux selon trois plages simples, matin, journée et soirée. Les profils de mission peuvent modifier une porte, un contrôle ou une destination. Les trajets restent cohérents après la quête.
- Utiliser des graphes séparés pour les piétons et la circulation. Connecter les passages cloutés, les escaliers et les rampes aux bons niveaux. Un véhicule peut ralentir derrière un autre, céder le passage et repartir.
- À proximité d’un incident, les passants s’écartent ou cherchent un refuge. Les personnes concernées par un choc gardent les réactions et dégâts visibles définis dans le plan des Forges. Les civils reprennent des trajets normaux après la fin de l’alerte.
- Faire entrer et sortir la population aux portes, aux angles de rue et hors cadrage. Réemployer les mêmes modèles et animations avec des silhouettes et couleurs variées. Dans Three.js et Rapier, limiter les collisions et décisions détaillées aux acteurs proches du joueur, et mettre à jour moins souvent les acteurs éloignés.

## Critères de validation

1. Sur un trajet de deux minutes hors mission, croiser plusieurs groupes ayant des destinations différentes et voir au moins un lieu occupé et un véhicule en circulation.
2. Aux Forges, tester la fuite de « Puce fantôme » au niveau de densité prévu. La foule et le trafic réagissent à la poursuite, et les deux itinéraires de fuite restent praticables.
3. Revisiter le même lieu à une autre plage horaire et après un changement de campagne. Observer une différence identifiable liée à l’heure ou au choix du joueur.
4. Mesurer la fluidité en caméra normale, puis dans la rue la plus fréquentée pendant une poursuite. Comparer à la cible du prototype de 60 images par seconde à 1080p sur le portable de référence.
