export type Implant = 'intrusion' | 'decoy' | 'overload';
export type Track = 'main' | 'side';
export type Chapter = 1 | 2 | 3;
export type Route = 'collective' | 'sorel';
export type Ending = 'publish' | 'protect';
export type SideState = 'locked' | 'available' | 'accepted' | 'complete';

export const implants: Record<Implant, { name: string; mark: string; help: string; cooldown: number }> = {
  intrusion: { name: 'Intrusion', mark: '⌗', help: 'Visez la grille du quai ou une caméra à moins de 16 m.', cooldown: 9 },
  decoy: { name: 'Leurre', mark: '◈', help: 'Visez le sol pour détourner un vigile proche du signal.', cooldown: 11 },
  overload: { name: 'Surcharge', mark: 'ϟ', help: 'Visez un drone à moins de 12 m pour le bloquer brièvement.', cooldown: 14 },
};

export type Save = {
  version: 1;
  credits: number;
  chapter: Chapter;
  checkpoint: Chapter | null;
  garage: 'mina';
  loadout: [Implant, Implant];
  side: SideState;
  route: Route | null;
  ending: Ending | null;
  tracking: Track;
};
const key = 'deadline.save.v1';
export const newGame = (): Save => ({
  version: 1, credits: 0, chapter: 1, checkpoint: null, garage: 'mina',
  loadout: ['intrusion', 'decoy'], side: 'locked', route: null, ending: null, tracking: 'main',
});
export function readSave(): Save | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    if (s?.version !== 1 || ![1, 2, 3].includes(s.chapter) ||
        !Number.isSafeInteger(s.credits) || s.credits < 0 ||
        !Array.isArray(s.loadout) || s.loadout.length !== 2 ||
        new Set(s.loadout).size !== 2 || s.loadout.some(i => !Object.hasOwn(implants, i)) ||
        !['locked', 'available', 'accepted', 'complete'].includes(s.side) ||
        ![null, 'collective', 'sorel'].includes(s.route) || ![null, 'publish', 'protect'].includes(s.ending) ||
        ![null, s.chapter].includes(s.checkpoint) || !['main', 'side'].includes(s.tracking)) return null;
    return s;
  } catch {
    return null;
  }
}
export function writeSave(save: Save) {
  try {
    localStorage.setItem(key, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
export const effects = {
  collective: { label: 'Confier le registre au collectif', now: 'La galerie de La Dalle s’ouvre pour les habitants.', later: 'Accès au bâtiment de service depuis le pied des remparts.' },
  sorel: { label: 'Confier le registre à Sorel', now: 'Sorel isole les dossiers personnels et vous remet un badge.', later: 'Le badge ouvre l’entrée de service sud du Nœud.' },
  publish: { label: 'Publier les preuves', now: 'La liste des révocations est rendue publique.', later: 'Les caméras de l’administration cessent de fonctionner et la galerie reste ouverte.' },
  protect: { label: 'Mettre le registre sous scellés', now: 'Les dossiers personnels sont isolés et les révocations suspendues.', later: 'Les contrôles restent en place et l’entrée de service devient accessible.' },
};
export const objectives: Record<Chapter, { name: string; heading: string; briefing: string; access: string; contact: string }> = {
  1: {
    name: 'Puce fantôme', heading: 'I — Puce fantôme', contact: 'Mina',
    briefing: '« Va au dépôt F-07, près des voies. Prends la puce et retrouve-moi sous le talus. Si tu prends la voiture, garde l’avenue dégagée. »',
    access: 'Entrée principale sur l’avenue. Depuis la cour latérale, longez le dépôt vers les voies pour atteindre le quai nord, ou ouvrez la grille avec Intrusion. Un leurre peut détourner le vigile du quai.',
  },
  2: {
    name: 'Les effacés', heading: 'II — Les effacés', contact: 'Mina',
    briefing: '« La liste contient ton nom. Les contrôles ont déjà coupé La Dalle en deux. Prends le registre des archives. Les habitants peuvent le diffuser. Sorel veut mettre leurs données à l’abri. À toi de choisir. »',
    access: 'Deux entrées aux archives. Le guichet au sud donne sur la rue, le passage nord contourne la cour de surveillance.',
  },
  3: {
    name: 'Le Nœud', heading: 'III — Le Nœud', contact: 'Sorel',
    briefing: '« Ils préparent une mise à jour cette nuit. Le relais central peut stopper les révocations. Si tu ouvres le registre, le public verra les ordres et les noms. Si tu l’isoles, les contrôles restent en place. »',
    access: 'Le passage ouest suit le pied des remparts. L’entrée sud mène au relais avec un badge. Les deux côtés sont surveillés et un drone couvre la cour.',
  },
};
