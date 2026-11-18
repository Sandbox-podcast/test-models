# Réalisation de la bible — 18 novembre 2026

La version actuelle remplace la première campagne condensée et la carte à trois quartiers. Le suivi distingue les fonctionnalités réalisées des limites de recette et d’équilibrage.

| Exigence | Réalisation et preuve | État |
|---|---|---|
| Cinq quartiers, six jonctions, boucle dans les deux sens | Courbes échantillonnées depuis les SVG, raccords appariés, graphe automobile et traversées physiques | Vérifié par tests |
| Forges, garage et dépôt visitables | Façades creuses, véritables ouvertures, cour et seuils ; M01 jouée | Vérifié en jeu |
| Pont +6 m, voies +3 m, passage 0 m, rampes et S02 | Surfaces rendues et physiques communes ; deux fuites physiques ; descente et S02 jouées | Vérifié |
| Réserves routières et piétonnes libres | Audit 3D, passages de porte, mobilier partagé entre rendu, physique et navigation | Vérifié par tests |
| Impacts localisés, contacts et persistance de session | Rayures, bosses, feux, mobilier fragile, blessures et sang ; réserves bornées | Implémenté et testé |
| Population, activités et trois horaires | Destinations par quartier, horaires, travail/attente/discussion, refuge, retour et décisions éloignées espacées | Implémenté et testé |
| Trafic et réactions | Circulation locale, freinage devant les personnes et véhicules, réaction aux incidents | Testé et observé |
| M01–M06 et personnages | Six missions jouées jusqu’à la fin publique, filières indépendantes des fins | Vérifié |
| U01–U05 et conséquences | Cinq quêtes jouées, éclairage, porte, dossiers, carte et portillon persistants | Vérifié en jeu |
| C01–C04 et huit variantes fixes | Quatre familles jouées, huit variantes accessibles et testées physiquement, une offre active et IDs distincts | Vérifié |
| Sauvegarde et migration | Migration v1, reprise active, corruption, récompenses atomiques ; rechargement après recette à 4 740 crédits | Vérifié |
| Art calcaire / ateliers / silhouettes | Kit procédural, pierre et tôle, toits, portes éclairées, voies, escaliers et fondations ; captures de recette locales | Réalisé |
| Fluidité et vie libre | Trajet supérieur à deux minutes, relevés 1080p, populations observées ; voir VALIDATION.md | Mesuré dans l’environnement disponible |
| Source, compilation et livraison | Tests et build réussis ; aperçu et archives conservés uniquement en local à la demande de l’utilisateur | Livré localement |

## Limites conservées explicitement

- Les durées de mission proposées restent des cibles d’équilibrage, non atteintes par les séquences actuelles.
- Les mesures ne remplacent pas un test sur un portable de référence identifié.
- La seconde campagne complète au clavier (Sorel / autre fin) et les essais séparés Chrome / Firefox restent hors de la recette effectuée ; leurs règles de progression et leurs accès sont testés.
- Les effets nécessitant des armes ou dangers de gel, brûlure et démembrement sont reportés conformément au plan web.

Les détails des parcours, soldes, réglages et preuves sont dans VALIDATION.md. Le dossier `artifacts/` contient uniquement des preuves locales de recette et ne constitue pas des ressources nécessaires au jeu.
