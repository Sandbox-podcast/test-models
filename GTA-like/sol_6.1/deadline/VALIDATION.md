# Validation de livraison

Vérifications effectuées le 17 novembre 2026, dans le navigateur Chromium intégré, via les vrais contrôles clavier et les menus du jeu.

- Chargement Three.js et Rapier, écran titre, lancement de la partie : validés.
- Déplacement ZQSD/WASD avec obstacles, entrée dans la voiture, accélération, freinage et sortie : validés.
- Briefing de Mina, vol de la puce sans tir ni implant, déclenchement de l’intervention, poursuite et remise après rupture de la ligne de vue : validés.
- Mort et retour au briefing : validés.
- Rechargement après la première mission : 570 crédits, mission terminée, grille ouverte et contrat secondaire conservés.
- Rencontre du collectif, extraction du registre, remise au collectif et récompense de 650 crédits : validées.
- Briefing de Sorel, accès au serveur par la galerie débloquée, choix « Publier les preuves », retour en exploration : validés.
- Rechargement après la fin : choix, conséquences et solde de 2 220 crédits conservés.
- Contrat secondaire : récupération des dossiers, livraison à La Dalle et récompense ; solde final 2 470 crédits.
- Carte complète, journal, contacts, conséquences, réglages et pause : contrôlés dans l’interface.
- Aucun message d’erreur JavaScript pendant le parcours de campagne. Rapier émet un avertissement interne concernant ses paramètres d’initialisation, sans empêcher le chargement.
- Compilation TypeScript et production Vite : réussies.
- Sept tests Node : réussis. Les tests couvrent les deux branches et les trois fins, la reprise, les données corrompues, l’absence de double récompense, la collision automobile à 115 km/h et la glissade contre un mur.

Limites de validation : la branche Sorel et les deux autres fins ont été vérifiées dans les transitions persistantes, sans second parcours complet au clavier. Les implants n’ont pas fait l’objet d’un parcours complet séparé. Chrome et Firefox n’ont pas été testés individuellement. La cible de 60 IPS sur un portable de référence n’a pas été mesurée : aucun portable de référence n’était défini. Les missions du prototype sont condensées et ne satisfont pas encore la cible de durée de la campagne finale.
