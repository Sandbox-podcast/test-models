/**
 * Campagne complète de la bible — fiches 02 (M02–M06), 03 (U02–U05, C01–C04).
 *
 * Moteur à étapes : chaque étape porte un déclencheur que la session vérifie
 * (parler, rejoindre, prendre, activer, porte ouverte, livrer, choix, escorte).
 * Les décisions majeures — filière (M04) et fin (M06) — sont enregistrées
 * séparément, comme l’exige la bible.
 */
import type { Ctx } from './ctx';
import type { JournalSection, JournalEntry } from './mission';

export type QuestId = 'm02' | 'm03' | 'm04' | 'm05' | 'm06' | 'u02' | 'u03' | 'u04' | 'u05' | 'c01' | 'c02' | 'c03' | 'c04';
export type Trigger =
  | { k: 'talk'; npc: string }
  | { k: 'reach'; x: number; z: number; y?: number; r: number }
  | { k: 'pickup'; prop: string }
  | { k: 'use'; prop: string }
  | { k: 'door'; any: string[] }                 // complétée quand l'une des portes s'ouvre
  | { k: 'event'; any: string[] }                // événements poussés par la session
  | { k: 'deliver'; npc: string; prop: string }  // parler au destinataire en portant l'objet
  | { k: 'choice'; npc: string; prop: string }   // dialogue à deux options → choix enregistré
  | { k: 'escort'; npc: string; to: { x: number; z: number; y?: number }; r: number };

export interface Stage {
  text: string;
  sub: string;
  trigger: Trigger;
  /** Cible du marqueur HUD (défaut : selon le déclencheur). */
  target?: { x: number; z: number; y?: number };
}

export interface QuestDef {
  id: QuestId;
  title: string;
  kind: 'main' | 'unique' | 'common';
  giver: string; // npc id du donneur ('board' pour les contrats communs
  brief: { speaker: string; lines: string[] };
  stages: Stage[];
  reward: number;
  requires?: QuestId[];
  /** Conséquence affichée au journal à la complétion. */
  consequence?: string;
  endLines?: { speaker: string; lines: string[] };
}

export interface QuestRun {
  taken: boolean;
  stage: number;      // 0 = briefing non fait ; stages.length atteint = terminée
  done: boolean;
  choice?: string;
}

export type Filiere = 'nadia' | 'sorel' | null;
export type Fin = 'A' | 'B' | null;

/** API que la session fournit au moteur. */
export interface QuestHost {
  npcPos(id: string): { x: number; z: number } | null;
  doorOpen(id: string): boolean;
  propTaken(id: string): boolean;
  questEvent(name: string): boolean;      // consomme les événements non traités
  escortDone(npc: string): boolean;
  playerDist(x: number, z: number): number;
  playerY(): number;
}

// ------------------------------------------------------------------ dialogues

const D = {
  m02Brief: {
    speaker: 'Mina',
    lines: [
      'La puce portait une référence d’audit. Pour la faire parler, il me faut le calendrier papier de la migration — Civis le garde aux archives, au nord.',
      'Un agent descend le calendrier chaque semaine. Tu peux le suivre jusqu’à son départ, il laisse la porte ouverte. Ou forcer la porte latérale avec ton implant — à toi de voir.',
      'Rapporte-moi la date d’effet, coursier. Avant qu’elle nous tombe dessus.',
    ],
  },
  m02End: {
    speaker: 'Mina',
    lines: [
      'Le 28. Mise à jour le 28, premier immeuble visé : la galerie basse de La Dalle.',
      'Ça colle avec ce que racontait la puce. Va voir Nadia Keita — sa permanence tient le premier palier du coteau. Elle t’ouvrira la route.',
    ],
  },
  m03Brief: {
    speaker: 'Nadia Keita',
    lines: [
      'Bienvenue à La Dalle. Le 28, ils commencent ici — et un immeuble a déjà perdu ses accès avant tout le monde.',
      'Le journal du portique dira qui a coupé quoi, et quand. Il est au portique nord, en haut des marches. Civis y garde une patrouille : reste dans leur dos, ou passe par la galerie.',
      'Rapporte-moi ce journal et on saura si le bordereau de Mina et leurs révocations parlent de la même porte.',
    ],
  },
  m03End: {
    speaker: 'Nadia Keita',
    lines: [
      'Le journal est signé du même lot que ta puce. Lot 7 — révocations liées à un registre d’audit que même leurs agents ne voient plus.',
      'Ce registre passe par un relais Civis, ici sur le coteau. Trouve-le. Après ça… il faudra décider qui y aura accès.',
    ],
  },
  m04Brief: {
    speaker: 'Nadia Keita',
    lines: [
      'Le relais est en bas du palier nord. La porte s’ouvre à chaque relève d’équipe — ou force-la, si tu presses.',
      'Le registre d’audit croisé avec le bordereau et le journal, c’est la chaîne complète. Avec ça, on peut prouver qui a signé quoi.',
      'Une copie, une seule. À qui tu la confies, c’est ton choix — mais il engage la suite.',
    ],
  },
  m04EndN: {
    speaker: 'Nadia Keita',
    lines: [
      'Avec cette copie, on prépare les accès communautaires. La galerie du coteau est à toi — elle monte droit au plateau.',
      'Quand tu monteras, préviens-moi. La dernière marche se joue là-haut.',
    ],
  },
  m04EndS: {
    speaker: 'Sorel',
    lines: [
      'Tu me confies ça à moi. Je signe des validations depuis trois ans — je sais où sont les failles, et le registre en est une grande.',
      'Prends ce badge de service. L’annexe du Nœud t’est ouverte, légitimement. C’est une drôle de sensation.',
    ],
  },
  m05Brief: {
    speaker: 'Mina',
    lines: [
      'Dernière montée. Le poste de commande du registre est au cœur du Nœud — par la galerie si Nadia t’a ouvert la voie, par l’annexe si Sorel t’a donné son badge.',
      'Rétablis le poste et lis l’horloge de purge. Ce qu’on en fera se décide là-haut, pas ici.',
    ],
  },
  m05End: {
    speaker: 'Sorel',
    lines: [
      'Le poste répond. Onze jours, comptés. La salle de contrôle est plus loin — couloir surveillé, coursive étroite. Un créneau, pas deux.',
      'Varenne y sera. Il parle de continuité de service même quand il évince des familles. Écoute-le, puis décide.',
    ],
  },
  m06Brief: {
    speaker: 'Journal',
    lines: [],
  },
  u02Brief: {
    speaker: 'Nadia Keita',
    lines: [
      'Un immeuble du palier nord a perdu ses accès avant la date. Les relevés sont encore au guichet — va les chercher.',
      'Et Racha, l’étage au-dessus, ne descend plus seule depuis que le portique la rejette. Ramène-la à la permanence.',
    ],
  },
  u02End: {
    speaker: 'Nadia Keita',
    lines: [
      'Les relevés, Racha, et un toit qui tient. Voilà une bonne journée.',
      'La porte de cour au fond du palier reste ouverte, si tu veux couper par là.',
    ],
  },
  u03Brief: {
    speaker: 'Lise Marec',
    lines: [
      'Des dossiers servent à faire plier des gens de la permanence. Du chantage, propre, administratif.',
      'La copie est chez un gardien d’arrière-boutique, au fond du rang sud. Parle-lui d’abord — il garde ça pour quelqu’un. Ou passe par la fenêtre de service, si tu n’as pas le temps.',
      'Ce que tu en fais… je te laisse le choix. Mais les noms, eux, n’ont pas à circuler.',
    ],
  },
  u03EndDetruire: {
    speaker: 'Lise Marec',
    lines: [
      'Brûlés. Les personnes respirent, et moi je garde les preuves qu’il reste : les dates, les signatures.',
      'La permanence reste ouverte. Reviens quand tu veux — la nuit surtout.',
    ],
  },
  u03EndPreuves: {
    speaker: 'Lise Marec',
    lines: [
      'Les preuves complète mon dossier. Ceux qui ont signé ces pages vont devoir s’expliquer.',
      'Les noms ne quitteront pas cette pièce. C’était la condition, et elle tient.',
    ],
  },
  u04Brief: {
    speaker: 'Mina',
    lines: [
      'Avant les voies, il y avait une papeterie, aux Quais. Le propriétaire y a laissé un lot de documents — des plans, des droits de passage.',
      'Entre par le quai ou par le porche, peu importe. Rapporte le lot et je remonte sa carte annotée au mur du garage.',
    ],
  },
  u04End: {
    speaker: 'Mina',
    lines: [
      'Le lot complet. La carte remonte au mur — regarde : il y a un accès de service vers le coteau, personne ne s’en sert plus.',
      'Les Quais, La Dalle, le plateau. La ville se recoud, coursier.',
    ],
  },
  u05Brief: {
    speaker: 'Sorel',
    lines: [
      'Les équipes de nuit du Nœud sortent par un portillon fermé depuis la migration. Le boîtier est à côté, face est.',
      'Remets-le en service. Ceux qui travaillent quand tout ferme méritent une porte.',
    ],
  },
  u05End: {
    speaker: 'Sorel',
    lines: [
      'Le portillon répond. La sortie de nuit est praticable — la signalétique suivra, quelle que soit la fin qu’on choisit.',
    ],
  },
};

// ------------------------------------------------------------------ définitions


export const QUESTS: QuestDef[] = [
  {
    id: 'm02', title: 'M02 — Date d’effet', kind: 'main', giver: 'mina',
    brief: D.m02Brief,
    stages: [
      { text: 'Localiser le calendrier aux archives', sub: 'Suivre l’agent jusqu’à son départ — ou forcer la porte latérale (Intrusion)', trigger: { k: 'event', any: ['agent-depart', 'door:porte-archives-cote', 'door:porte-archives'] }, target: { x: 193, z: 16 } },
      { text: 'Prendre le calendrier papier', sub: 'Sur le pupitre, dans les archives Civis', trigger: { k: 'pickup', prop: 'calendrier' }, target: { x: 194, z: 30 } },
      { text: 'Rapporter le calendrier à Mina', sub: 'Garage des Forges', trigger: { k: 'deliver', npc: 'mina', prop: 'calendrier' }, target: { x: 86.5, z: 152.5 } },
    ],
    reward: 200, requires: [],
    consequence: 'La date de purge est fixée au 28 ; premier immeuble visé : la galerie basse de La Dalle.',
    endLines: D.m02End,
  },
  {
    id: 'm03', title: 'M03 — La première porte', kind: 'main', giver: 'nadia',
    brief: D.m03Brief,
    stages: [
      { text: 'Atteindre le portique nord', sub: 'Escalier extérieur à pied — éviter la patrouille Civis', trigger: { k: 'reach', x: 284, z: 114, y: 4, r: 5 }, target: { x: 284, z: 111, y: 4 } },
      { text: 'Récupérer le journal du portique', sub: 'Dans la loge du portique', trigger: { k: 'pickup', prop: 'journal-portique' }, target: { x: 284, z: 116.5, y: 4 } },
      { text: 'Rapporter le journal à Nadia', sub: 'Permanence de La Dalle', trigger: { k: 'deliver', npc: 'nadia', prop: 'journal-portique' }, target: { x: 300, z: 130, y: 4 } },
    ],
    reward: 250, requires: ['m02'],
    consequence: 'Le journal du portique lie les révocations au bordereau de M01 — même lot, même signature.',
    endLines: D.m03End,
  },
  {
    id: 'm04', title: 'M04 — Le registre des effacés', kind: 'main', giver: 'nadia',
    brief: D.m04Brief,
    stages: [
      { text: 'Entrer dans le relais Civis', sub: 'Porte de relève au palier nord — créneau ou Intrusion', trigger: { k: 'door', any: ['porte-relais'] }, target: { x: 316, z: 74, y: 4 } },
      { text: 'Prendre le registre d’audit', sub: 'Dans le relais, palier nord de La Dalle', trigger: { k: 'pickup', prop: 'registre' }, target: { x: 316, z: 68.5, y: 4 } },
      { text: 'Choisir qui reçoit la copie', sub: 'Nadia (accès communautaires) ou Sorel (contestation administrative)', trigger: { k: 'choice', npc: 'nadia|sorel', prop: 'registre' }, target: { x: 300, z: 130, y: 4 } },
    ],
    reward: 300, requires: ['m03'],
    consequence: 'Le registre d’audit est sorti. La filière choisie ouvre une route vers le plateau.',
    endLines: undefined, // selon la filière
  },
  {
    id: 'm05', title: 'M05 — Dernière montée', kind: 'main', giver: 'mina',
    brief: D.m05Brief,
    stages: [
      { text: 'Atteindre le poste de commande', sub: 'Par la galerie (Nadia) ou l’annexe de service (Sorel) — route de secours à pied par la rampe', trigger: { k: 'reach', x: 353, z: -78, y: 12, r: 6 }, target: { x: 353, z: -76, y: 12 } },
      { text: 'Rétablir le poste de commande', sub: 'Console du registre, bâtiment central du Nœud', trigger: { k: 'use', prop: 'console-poste' }, target: { x: 353, z: -80, y: 12 } },
    ],
    reward: 350, requires: ['m04'],
    consequence: 'Le poste de commande répond. L’horloge de purge est affichée : J-11.',
    endLines: D.m05End,
  },
  {
    id: 'm06', title: 'M06 — Droit d’accès', kind: 'main', giver: 'journal',
    brief: D.m06Brief,
    stages: [
      { text: 'Atteindre la salle de contrôle', sub: 'Couloir surveillé ou coursive — un créneau de passage', trigger: { k: 'reach', x: 386, z: -109, y: 12, r: 6 }, target: { x: 384, z: -110, y: 12 } },
      { text: 'Décider du sort du registre', sub: 'Terminal final — publication expurgée ou annulation de la purge', trigger: { k: 'choice', npc: 'terminal', prop: 'terminal-controle' }, target: { x: 388.4, z: -108, y: 12 } },
    ],
    reward: 500, requires: ['m05'],
    consequence: 'La décision finale est enregistrée. La ville reste explorable.',
  },
  {
    id: 'u02', title: 'U02 — L’étage des absents', kind: 'unique', giver: 'nadia',
    brief: D.u02Brief,
    stages: [
      { text: 'Récupérer les relevés d’accès', sub: 'Guichet du palier nord de La Dalle', trigger: { k: 'pickup', prop: 'releves-acces' }, target: { x: 396, z: 88, y: 4 } },
      { text: 'Escorter Racha à la permanence', sub: 'Elle te suit — reste près d’elle', trigger: { k: 'escort', npc: 'residente', to: { x: 300, z: 130, y: 4 }, r: 6 }, target: { x: 300, z: 130, y: 4 } },
      { text: 'Prévenir Nadia', sub: 'Permanence de La Dalle', trigger: { k: 'deliver', npc: 'nadia', prop: 'releves-acces' }, target: { x: 300, z: 130, y: 4 } },
    ],
    reward: 150, requires: ['m03'],
    consequence: 'Racha a rejoint la permanence. La porte de cour du palier reste ouverte.',
    endLines: D.u02End,
  },
  {
    id: 'u03', title: 'U03 — Les noms de la nuit', kind: 'unique', giver: 'lise',
    brief: D.u03Brief,
    stages: [
      { text: 'Ouvrir l’arrière-boutique', sub: 'Parler au gardien — ou forcer la fenêtre de service (Intrusion)', trigger: { k: 'door', any: ['porte-boutique', 'fenetre-service'] }, target: { x: 272, z: 170, y: 4 } },
      { text: 'Récupérer le dossier de chantage', sub: 'Arrière-boutique, rang sud de La Dalle', trigger: { k: 'pickup', prop: 'dossier-chantage' }, target: { x: 272, z: 167, y: 4 } },
      { text: 'Décider avec Lise', sub: 'Détruire les dossiers privés, ou lui remettre les preuves', trigger: { k: 'choice', npc: 'lise', prop: 'dossier-chantage' }, target: { x: 305, z: 133, y: 4 } },
    ],
    reward: 150, requires: ['m03'],
    consequence: 'Le dossier de chantage est réglé. La permanence reste accessible.',
  },
  {
    id: 'u04', title: 'U04 — Papier carbone', kind: 'unique', giver: 'mina',
    brief: D.u04Brief,
    stages: [
      { text: 'Retrouver le lot à la papeterie', sub: 'Les Quais — par le quai ou le porche', trigger: { k: 'reach', x: 182, z: 226, y: 2, r: 6 }, target: { x: 182, z: 228, y: 2 } },
      { text: 'Prendre le lot de documents', sub: 'Devant le porche de la papeterie', trigger: { k: 'pickup', prop: 'documents-papeterie' }, target: { x: 182, z: 232, y: 2 } },
      { text: 'Rendre le lot à Mina', sub: 'Garage des Forges', trigger: { k: 'deliver', npc: 'mina', prop: 'documents-papeterie' }, target: { x: 86.5, z: 152.5 } },
    ],
    reward: 150, requires: ['m02'],
    consequence: 'La carte annotée du quartier est affichée au garage — avec un accès facultatif vers le coteau.',
    endLines: D.u04End,
  },
  {
    id: 'u05', title: 'U05 — Le dernier portillon', kind: 'unique', giver: 'sorel',
    brief: D.u05Brief,
    stages: [
      { text: 'Remettre le portillon en service', sub: 'Boîtier de la face est du Nœud', trigger: { k: 'use', prop: 'boitier-portillon' }, target: { x: 427, z: -53.5, y: 12 } },
    ],
    reward: 150, requires: ['m05'],
    consequence: 'La sortie piétonne de nuit du Nœud est praticable.',
    endLines: D.u05End,
  },
  {
    id: 'c01', title: 'C01 — Course entre relais', kind: 'common', giver: 'board',
    brief: { speaker: 'Panneau des contrats', lines: ['Colis au Signal, livraison à la permanence de Nadia. Le véhicule reste facultatif — les ponts, eux, ne le sont pas.'] },
    stages: [
      { text: 'Prendre le colis au Signal', sub: 'Comptoir du bar, face à l’avenue', trigger: { k: 'pickup', prop: 'colis-signal' }, target: { x: 154, z: 161.5 } },
      { text: 'Livrer à la permanence de La Dalle', sub: 'Nadia Keita, palier sud', trigger: { k: 'deliver', npc: 'nadia', prop: 'colis-signal' }, target: { x: 300, z: 130, y: 4 } },
    ],
    reward: 80,
  },
  {
    id: 'c02', title: 'C02 — Récupération de matériel', kind: 'common', giver: 'board',
    brief: { speaker: 'Panneau des contrats', lines: ['Un module est égaré dans la cour du dépôt NOVAK, sous surveillance. Leurre et Intrusion peuvent modifier l’accès. Ramène-le à Ysec.'] },
    stages: [
      { text: 'Récupérer le module dans la cour du dépôt', sub: 'Cour surveillée — approche discrète', trigger: { k: 'pickup', prop: 'colis-relais' }, target: { x: 76.8, z: 159.5 } },
      { text: 'Le ramener à Ysec', sub: 'Bar Le Signal', trigger: { k: 'deliver', npc: 'ysec', prop: 'colis-relais' }, target: { x: 155, z: 158 } },
    ],
    reward: 80,
  },
  {
    id: 'c03', title: 'C03 — Relais hors ligne', kind: 'common', giver: 'board',
    brief: { speaker: 'Panneau des contrats', lines: ['La borne de la rue des Ateliers est hors ligne. Remets le service en marche puis quitte la zone.'] },
    stages: [
      { text: 'Réarmer la borne des Ateliers', sub: 'Rue des Ateliers, haut de la rue', trigger: { k: 'use', prop: 'borne-relais' }, target: { x: 60, z: 120 } },
      { text: 'Quitter la zone', sub: 'Le service est validé au départ de la zone', trigger: { k: 'event', any: ['zone-left-borne'] }, target: { x: 60, z: 146 } },
    ],
    reward: 80,
  },
  {
    id: 'c04', title: 'C04 — Passage accompagné', kind: 'common', giver: 'board',
    brief: { speaker: 'Panneau des contrats', lines: ['Un habitant attend sur la place de la Halle. Accompagne-le jusqu’au garage de Mina — il attend si tu t’éloignes.'] },
    stages: [
      { text: 'Accompagner l’habitant au garage', sub: 'De la place de la Halle au garage des Forges', trigger: { k: 'escort', npc: 'habitant', to: { x: 84, z: 152 }, r: 7 }, target: { x: 84, z: 152 } },
    ],
    reward: 80,
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// ------------------------------------------------------------------ moteur

export class QuestEngine {
  runs = new Map<QuestId, QuestRun>();
  filiere: Filiere = null;
  fin: Fin = null;
  /** Ordre de proposition des contrats communs au panneau. */
  boardCycle: QuestId[] = ['c01', 'c02', 'c03', 'c04'];

  run(id: QuestId): QuestRun {
    let r = this.runs.get(id);
    if (!r) { r = { taken: false, stage: 0, done: false }; this.runs.set(id, r); }
    return r;
  }

  resetAll() {
    this.runs.clear();
    this.filiere = null;
    this.fin = null;
  }

  /** Quêtes proposables : prérequis remplis, non entamées ; une seule par rôle. */
  offerable(m01Done: boolean, u01Done: boolean): QuestDef[] {
    const out: QuestDef[] = [];
    for (const q of QUESTS) {
      const r = this.run(q.id);
      if (r.taken) continue;
      if (q.requires && q.requires.some((req) => !this.run(req).done)) continue;
      if (q.kind === 'main') {
        // une seule mission principale active à la fois, dans l’ordre
        const activeMain = QUESTS.some((o) => o.kind === 'main' && this.run(o.id).taken && !this.run(o.id).done);
        if (activeMain) continue;
        if (q.id === 'm02' && !m01Done) continue;
      }
      // quêtes uniques : menables en parallèle (bible : « jouables une fois », pas une à la fois)
      if (q.kind === 'common') {
        const activeCommon = QUESTS.some((o) => o.kind === 'common' && this.run(o.id).taken && !this.run(o.id).done);
        if (activeCommon) continue;
      }
      out.push(q);
    }
    return out;
  }

  accept(id: QuestId) {
    const r = this.run(id);
    r.taken = true;
    r.stage = 1;
  }

  /** Quête principale active (marqueur/journal) ou null. */
  activeMain(): QuestDef | null {
    return QUESTS.find((q) => q.kind === 'main' && this.run(q.id).taken && !this.run(q.id).done) ?? null;
  }

  activeSide(): QuestDef | null {
    return QUESTS.find((q) => q.kind !== 'main' && this.run(q.id).taken && !this.run(q.id).done) ?? null;
  }

  /** Vérifie l’étape courante ; retourne un payload d’avancement. */
  checkStage(q: QuestDef, host: QuestHost): { advanced: boolean; offerDialogue?: boolean } {
    const r = this.run(q.id);
    if (r.done) return { advanced: false };
    const st = q.stages[r.stage - 1];
    if (!st) return { advanced: false };
    const t = st.trigger;
    let ok = false;
    let offer = false;
    switch (t.k) {
      case 'talk': {
        const p = host.npcPos(t.npc);
        ok = !!p && host.playerDist(p.x, p.z) < 4.5;
        offer = ok; // la session affiche le dialogue au E
        break;
      }
      case 'reach':
        ok = host.playerDist(t.x, t.z) < t.r && Math.abs((t.y ?? 0) + 1 - host.playerY()) < 3.2;
        break;
      case 'pickup':
        ok = host.propTaken(t.prop);
        break;
      case 'use': {
        const p = propPos(t.prop);
        ok = !!p && host.playerDist(p.x, p.z) < 3.2 && host.questEvent('use:' + t.prop);
        break;
      }
      case 'door':
        ok = t.any.some((d) => host.doorOpen(d));
        break;
      case 'event':
        ok = t.any.some((e) => host.questEvent(e));
        break;
      case 'deliver': {
        const p = host.npcPos(t.npc);
        ok = !!p && host.playerDist(p.x, p.z) < 4.5;
        offer = ok;
        break;
      }
      case 'choice':
        offer = true; // géré par la session (dialogue à options)
        ok = false;
        break;
      case 'escort':
        ok = host.escortDone(t.npc);
        break;
    }
    return { advanced: ok, offerDialogue: offer };
  }

  advance(q: QuestDef, ctx: Ctx): { finished: boolean } {
    const r = this.run(q.id);
    r.stage++;
    if (r.stage > q.stages.length) {
      r.done = true;
      void ctx;
      return { finished: true };
    }
    return { finished: false };
  }

  // -------------------------------------------------------------- journal

  journal(m01State: string, u01State: string): JournalSection[] {
    const sec: JournalSection[] = [];
    const chap: JournalEntry[] = [];
    const mainTitles: [QuestId, string][] = [
      ['m02', 'M02 — Date d’effet · Les Forges'],
      ['m03', 'M03 — La première porte · La Dalle'],
      ['m04', 'M04 — Le registre des effacés · La Dalle'],
      ['m05', 'M05 — Dernière montée · Le Nœud'],
      ['m06', 'M06 — Droit d’accès · Le Nœud'],
    ];
    chap.push({
      title: 'M01 — Puce fantôme · Les Forges',
      body: m01State === 'terminee' ? 'La puce est chez Mina ; la liste des révocations porte ton nom.' : 'Contrat en cours ou à prendre au garage de Mina.',
      status: m01State === 'terminee' ? 'TERMINÉE' : m01State.toUpperCase(),
      kind: m01State === 'terminee' ? 'done' : 'active',
    });
    for (const [id, title] of mainTitles) {
      const r = this.run(id);
      const def = QUEST_BY_ID[id];
      chap.push({
        title,
        body: r.done
          ? (def.consequence ?? '')
          : r.taken
            ? def.stages[r.stage - 1]?.sub ?? ''
            : (def as QuestDef).brief.lines[0]?.slice(0, 90) + '…',
        status: r.done ? 'TERMINÉE' : r.taken ? 'EN COURS' : 'À VENIR',
        kind: r.done ? 'done' : r.taken ? 'active' : 'locked',
      });
    }
    sec.push({ title: 'CHAPITRE — campagne', entries: chap });

    const uniques: JournalEntry[] = [{
      title: 'U01 — Une porte de plus · Mina',
      body: u01State === 'terminee' ? 'La galerie de service est éclairée durablement.' : 'Rétablir l’éclairage de la galerie de service après M01.',
      status: u01State === 'terminee' ? 'TERMINÉE' : 'À PRENDRE',
      kind: u01State === 'terminee' ? 'done' : 'active',
    }];
    for (const id of ['u02', 'u03', 'u04', 'u05'] as QuestId[]) {
      const r = this.run(id);
      const def = QUEST_BY_ID[id];
      uniques.push({
        title: def.title,
        body: r.done ? (def.consequence ?? '') : r.taken ? def.stages[r.stage - 1]?.sub ?? '' : 'Disponible auprès de son donneur.',
        status: r.done ? 'TERMINÉE' : r.taken ? 'EN COURS' : (def.requires ?? []).some((rq: QuestId) => !this.run(rq).done) ? 'VERROUILLÉE' : 'DISPONIBLE',
        kind: r.done ? 'done' : r.taken ? 'active' : 'locked',
      });
    }
    sec.push({ title: 'QUÊTES UNIQUES', entries: uniques });

    const communs = (['c01', 'c02', 'c03', 'c04'] as QuestId[]).map((id) => {
      const r = this.run(id);
      const def = QUEST_BY_ID[id];
      return { title: def.title, body: r.done ? 'Offre honorée.' : r.taken ? def.stages[r.stage - 1]?.sub ?? '' : 'Proposée au panneau du garage.', status: r.done ? 'HONORÉE' : r.taken ? 'EN COURS' : 'AU PANNEAU', kind: r.done ? 'done' : r.taken ? 'active' : 'locked' } as JournalEntry;
    });
    const restantes = communs.filter((c) => c.kind !== 'done').length;
    communs.push({ title: 'Panneau des contrats', body: restantes > 0 ? `${restantes} offre(s) restante(s) au panneau du garage.` : 'Toutes les offres ont été honorées.', status: restantes > 0 ? 'ACTIF' : 'ÉPUISÉ', kind: restantes > 0 ? 'active' : 'done' });
    sec.push({ title: 'CONTRATS COMMUNS', entries: communs });

    const dec: JournalEntry[] = [{
      title: 'Filière (M04)',
      body: this.filiere === 'nadia' ? 'Copie confiée à Nadia — accès communautaires, galerie du coteau ouverte.' : this.filiere === 'sorel' ? 'Copie confiée à Sorel — badge de service, annexe du Nœud ouverte.' : 'Non décidée.',
      status: this.filiere ? this.filiere.toUpperCase() : '—',
      kind: this.filiere ? 'warn' : 'locked',
    }, {
      title: 'Décision finale (M06)',
      body: this.fin === 'A' ? 'Registre public : preuves expurgées publiées, autorisations provisoires transférées aux relais. Les contrôles Civis ferment.' : this.fin === 'B' ? 'Révocations annulées : droits restaurés, services rouverts. Civis garde les portiques, sous la cellule de Sorel.' : 'Non décidée.',
      status: this.fin === 'A' ? 'FIN A — REGISTRE PUBLIC' : this.fin === 'B' ? 'FIN B — ANNULATIONS' : '—',
      kind: this.fin ? 'warn' : 'locked',
    }];
    sec.push({ title: 'DÉCISIONS', entries: dec });
    return sec;
  }
}

// positions des props de quête — remplies par la session à la construction
const PROP_POS = new Map<string, { x: number; z: number }>();
export function registerProp(id: string, x: number, z: number) { PROP_POS.set(id, { x, z }); }
function propPos(id: string) { return PROP_POS.get(id) ?? null; }
