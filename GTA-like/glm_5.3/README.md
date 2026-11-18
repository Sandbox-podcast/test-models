# DEADLINE — démo « Puce fantôme » et ville à cinq quartiers

Jeu d'action et d'infiltration cyberpunk en 2.5D (caméra orthographique quasi
verticale), pour navigateur desktop, clavier + souris. Le prototype
**« Puce fantôme »** (M01 + U01) se joue dans **Les Forges** ; la ville libre
s'étend désormais aux **quatre autres quartiers de la bible** — **La Dalle**
(coteau résidentiel, +4 m, galerie piétonne gravissable jusqu'à +12 m),
**Le Nœud** (plateau institutionnel +12 m derrière ses remparts, trois portes),
**Les Quais** (quai haut +2 m, halle, papeterie, promenade au bord du fleuve)
et **Les Belvédères** (rampe en lacet +4→+12 m, terrasses, belvédère) — reliés
par les **six jonctions J01–J06 + galerie S02** de la carte globale, toutes
praticables à pied ou en voiture.

**Stack :** Vite · TypeScript · Three.js (r169) · Rapier 3D (pas fixe 60 Hz,
interpolation d'affichage) · interface HTML/CSS · sauvegarde `localStorage`.

---

## Lancer

```bash
npm install
npm run dev        # développement : http://localhost:5173
```

```bash
npm run build      # production → dist/
npm run preview    # sert dist/ : http://localhost:4173
```

Le dossier `dist/` est autoporteur : déployable tel quel sur n'importe quel
hébergement statique (le WASM de Rapier est embarqué dans le bundle).

## Commandes

| Touche | Action |
|---|---|
| `ZQSD` / `WASD` / flèches | se déplacer · conduire |
| Souris | viser · **clic gauche** : tirer |
| `E` | interagir (parler, monter/descreindre, prendre, remettre) |
| `Maj` | sprinter (frein à main en voiture) |
| `1` ou **clic droit** | implant **Intrusion** (grille compatible / couper une caméra) |
| `2` | implant **Leurre** (projette un signal à l'endroit visé) |
| `R` | recharger |
| `J` ou `Tab` | journal (objectifs, contacts, conséquences) |
| `Échap` | pause (aussi déclenchée par la perte de focus) |
| `M` / `B` | couper le son · réduire les néons (bloom) |

## La mission « Puce fantôme »

1. **Briefing** — parle à **Mina** au garage (rue des Ateliers). Les deux
   implants (Intrusion, Leurre) sont équipés ; un point de reprise est créé.
2. **Entrée** — le dépôt NOVAK a deux accès : le **portail** sur l'avenue
   (gardé, direct) ou la **cour latérale** par la ruelle. Depuis la cour :
   la lane est surveillée par le vigile du quai (détournable au Leurre) ou
   forcez la **grille** avec Intrusion.
3. **Vol** — prends la puce dans le bureau de contrôle (nord-ouest du hall).
   L'intervention démarre : les vigiles convergent, ta position est
   transmise à chaque confirmation.
4. **Fuite** — à pied par le **passage inférieur** (bornes : piétons) ou en
   voiture par le **pont** (plus long, plus rapide).
5. **Remise** — rejoins le van de Mina au nord des voies, à pied, **5 s sans
   détection confirmée**. Le HUD affiche la condition qui bloque.

**Conséquences (enregistrées ensemble à la remise)** : +500 ¤ (crédités une
seule fois), **grille de service** ouverte sous les voies (raccourci durable
galerie ↔ rue des Ateliers), contrat secondaire **« Colis perdu »** disponible
chez Ysec au bar Le Signal (+150 ¤), sécurité du dépôt réduite.

## Ce que la démo démontre (critères du plan + bible)

- Ville libre avant/après la mission ; le raccourci et la quête U01
  **restent disponibles après rechargement** de la page (« Continuer »).
- Échec → **reprise au briefing** (puce remise, voiture au garage, vigiles en
  patrouille) ou abandon → retour en exploration.
- Approches validées : par la cour **sans tirer**, par le portail **sans
  implant** ; murs, rayons de vue coupés par la géométrie ; signal
  « observé / confirmé / recherche » dans le HUD.
- Toits/tablier qui **s'effacent** quand ils masquent le joueur (garage, dépôt,
  passage inférieur, pont).
- Violence graphique : éclaboussures au point d'impact, traces au sol,
  renversements par véhicule (choc léger = écarté/étourdi, choc grave =
  projection et flaque).
- **Dégâts visibles du véhicule** (bible 05) : rayure, bosse ou choc grave sur
  la face impactée, phare cassé en choc grave avant, voitures garées que l'on
  déplace en les percutant ; dégâts conservés jusqu'à la reprise.
- **Ville vivante** (bible 07) : 12 passants à flux (ateliers, dépôt, arrêt,
  bar, place) avec pauses et balancements, **4 véhicules de trafic** (avenue,
  pont, route du nord) qui freinent derrière un obstacle et s'arrêtent pendant
  une poursuite confirmée, **plages horaires** matin/journée/soirée (lumière,
  brouillard et flux piétons), mise à jour allégée des acteurs éloignés.
- **U01 « Une porte de plus »** (bible 03) : après M01, Mina confie un module
  d'éclairage à brancher au panneau de la grille de service — la galerie
  s'éclaire durablement (persistant en sauvegarde), récompense créditée une fois.
- **Direction artistique** (bible 04) : socles calcaire, ambre atelier,
  vert « accès de service » (voyants de grilles, galerie, panneau), sac plat
  du coursier, lampe de poitrine de Mina, bandeaux de casque des vigiles,
  sangles/outils sur la voiture.
- Conduite arcade (freinage perceptible, sortie côté dégagé à faible
  vitesse), caméra qui **anticipe** la direction du véhicule.
- Train de fond cosmétique sur les voies, civils qui paniquent et témoins
  qui signalent ta position.
- **Audit de collisions** : les 9 couloirs carrossables (avenue, rampe/tablier/
  descente du pont, route du nord, route de la halle, rue des Ateliers,
  ruelle, cour) sont vérifiés au gabarit voiture — aucun volume n'empiète.

## Architecture (src/)

| Fichier | Rôle |
|---|---|
| `main.ts` | amorçage : init Rapier (WASM), construction, menu |
| `engine/input.ts` | entrées via `event.code` (ZQSD/WASD automatiques) |
| `engine/audio.ts` | sons 100 % procéduraux (WebAudio) |
| `game/defs.ts` | constantes, groupes de collision Rapier |
| `game/level.ts` | Les Forges : géométrie + colliders + archives Civis + volumes d'effacement |
| `game/actors.ts` | joueur (contrôleur de personnage) et voiture arcade |
| `game/ai.ts` | vigiles (patrouille/investigation/poursuite/recherche), caméras, civils, PNJ |
| `game/vision.ts` | détection (suspicion → confirmé), ligne de vue raycast |
| `game/combat.ts` | hitscan, traceurs, gore (particules/décals poolés) |
| `game/implants.ts` | Intrusion (recharge partagée) et Leurre |
| `game/mission.ts` | M01 + U01, journal, dialogues |
| `game/quests.ts` | **campagne complète** : moteur à étapes, M02–M06, U02–U05, C01–C04, filière, fins |
| `game/save.ts` | sauvegarde versionnée `localStorage` (v2 : quêtes, filière, fin) |
| `game/traffic.ts` | trafic des Forges + circuit fermé inter-quartiers (avenue, pont, quai, coteau), cédule bidirectionnelle pour la voiture du joueur |
| `game/districts.ts` | La Dalle, Le Nœud, Les Quais, Les Belvédères + jonctions J01–J06, galerie S02, portique/relais/boutique/poste/salle de contrôle/portillon de campagne |
| `game/session.ts` | boucle pas fixe, caméra, lumières, bloom, dégâts visibles, cycle jour, escorte, agent des archives, fins A/B, purge |
| `ui/hud.ts` | HUD, journal, dialogues, modales |

## Campagne complète (bible 02/03) — tous les jalons livrés

| Jalons | Contenu |
|---|---|
| **M02 Date d’effet** | Suivre l’agent des archives jusqu’à son départ (il laisse la porte ouverte) ou forcer la porte latérale à l’implant ; calendrier → date du 28, premier immeuble ; débloque M03 + U04 |
| **M03 La première porte** | Portique nord de La Dalle sous patrouille Civis ; journal du portique lié au bordereau de M01 ; débloque M04, U02, U03 |
| **M04 Le registre des effacés** | Relais Civis (porte de relève cyclique ou Intrusion) ; **choix de filière enregistré séparément** : Nadia → galerie du coteau, Sorel → badge/annexe du Nœud |
| **M05 Dernière montée** | Poste de commande du Nœud selon la filière ; **horloge de purge au HUD (J-11)** ; débloque M06 + U05 |
| **M06 Droit d’accès** | Salle de contrôle (couloir surveillé) ; **Fin A — Registre public** (contrôles Civis fermés, vigiles/caméras hors service) ou **Fin B — Révocations annulées** ; générique puis ville explorable |
| **U02 L’étage des absents** | Relevés d’accès + **escorte de Racha** jusqu’à la permanence |
| **U03 Les noms de la nuit** | Arrière-boutique par le gardien (accord) ou la fenêtre de service (Intrusion) ; **choix détruire / remettre les preuves** |
| **U04 Papier carbone** | Lot à la papeterie des Quais → **carte annotée affichée au garage** |
| **U05 Le dernier portillon** | Boîtier de la face est du Nœud → sortie de nuit praticable |
| **C01–C04** | Panneau de contrats au garage : course entre relais, récupération surveillée, relais hors ligne (réarmer + sortir de la zone), passage accompagné — une offre à la fois |

Pistes laissées ouvertes par la bible : gel/brûlure/démembrement (liés aux
armes qui les déclenchent), densités de population des autres quartiers à
régler en jeu, variations de placements des contrats communs.
