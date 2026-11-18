# DEADLINE — démo « Puce fantôme »

Jeu d'action et d'infiltration cyberpunk en 2.5D (caméra orthographique quasi
verticale), pour navigateur desktop, clavier + souris. Implémentation du
premier jalon du plan de développement : **la ville libre avant et après une
mission**, sur le quartier des **Forges** (référence cartographique : secteur
gare–L'Houmeau d'Angoulême, condensé).

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

## Ce que la démo démontre (critères du plan)

- Ville libre avant/après la mission ; le raccourci et le contrat secondaire
  **restent disponibles après rechargement** de la page (« Continuer »).
- Échec → **reprise au briefing** (puce remise, voiture au garage, vigiles en
  patrouille) ou abandon → retour en exploration.
- Approches validées : par la cour **sans tirer**, par le portail **sans
  implant** ;Mur, rayons de vue coupés par la géométrie ; signal
  « observé / confirmé / recherche » dans le HUD.
- Toits/tablier qui **s'effacent** quand ils masquent le joueur (garage, dépôt,
  passage inférieur, pont).
- Violence graphique : éclaboussures au point d'impact, traces au sol,
  renversements par véhicule (choc léger = étourdi, choc grave = projection
  et flaque).
- Conduite arcade (freinage perceptible, sortie côté dégagé à faible
  vitesse), caméra qui **anticipe** la direction du véhicule.
- Train de fond cosmétique sur les voies, civils qui paniquent et témoins
  qui signalent ta position.

## Architecture (src/)

| Fichier | Rôle |
|---|---|
| `main.ts` | amorçage : init Rapier (WASM), construction, menu |
| `engine/input.ts` | entrées via `event.code` (ZQSD/WASD automatiques) |
| `engine/audio.ts` | sons 100 % procéduraux (WebAudio) |
| `game/defs.ts` | constantes, groupes de collision Rapier |
| `game/level.ts` | Les Forges : géométrie + colliders + volumes d'effacement |
| `game/actors.ts` | joueur (contrôleur de personnage) et voiture arcade |
| `game/ai.ts` | vigiles (patrouille/investigation/poursuite/recherche), caméras, civils, PNJ |
| `game/vision.ts` | détection (suspicion → confirmé), ligne de vue raycast |
| `game/combat.ts` | hitscan, traceurs, gore (particules/décals poolés) |
| `game/implants.ts` | Intrusion (recharge partagée) et Leurre |
| `game/mission.ts` | machine à états, journal, dialogues |
| `game/save.ts` | sauvegarde versionnée `localStorage` |
| `game/session.ts` | boucle pas fixe, caméra, lumières, bloom, interactions |
| `ui/hud.ts` | HUD, journal, dialogues, modales |

Pistes laissées ouvertes par la spec : La Dalle et le Nœud, trafic civil
complet, gel/brûlure/démembrement (avec les armes qui les déclenchent).
