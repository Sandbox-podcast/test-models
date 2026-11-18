export type Stage = 'available' | 'accepted' | 'carrying' | 'complete';
export type Route = 'collective' | 'sorel' | null;
export type Ending = 'publish' | 'protect' | 'destroy' | null;
export type Implant = 'intrusion' | 'lure' | 'overload';
export interface Save {
  version: 1; chapter: number; money: number; ghost: Stage; registry: Stage; node: Stage;
  side: Stage; route: Route; ending: Ending; shortcut: boolean; rewarded: string[];
  implants: [Implant, Implant]; checkpoint: boolean;
}
export const SAVE_KEY = 'deadline.signal-mort.v1';
export const freshSave = (): Save => ({ version: 1, chapter: 1, money: 120, ghost: 'available', registry: 'available', node: 'available', side: 'available', route: null, ending: null, shortcut: false, rewarded: [], implants: ['intrusion', 'lure'], checkpoint: false });
export function decodeSave(raw: string | null): Save {
  try {
    if (!raw) return freshSave();
    const s = JSON.parse(raw) as Save;
    const stages: Stage[] = ['available', 'accepted', 'carrying', 'complete'];
    const implants = ['intrusion', 'lure', 'overload'];
    if (s.version !== 1 || !stages.includes(s.ghost) || !stages.includes(s.registry) || !stages.includes(s.node) || !stages.includes(s.side) || !Array.isArray(s.rewarded) || !Array.isArray(s.implants) || s.implants.length !== 2 || s.implants.some(i => !implants.includes(i)) || !Number.isFinite(s.money) || ![1,2,3,4].includes(s.chapter) || ![null,'collective','sorel'].includes(s.route) || ![null,'publish','protect','destroy'].includes(s.ending)) return freshSave();
    return { ...freshSave(), ...s, rewarded: [...new Set(s.rewarded.filter(r => typeof r === 'string'))] };
  } catch { return freshSave(); }
}
export function resumeSave(s: Save): Save {
  // Active sequences always resume at the briefing, never with an orphaned stolen item.
  return { ...s, ghost: s.ghost === 'carrying' ? 'accepted' : s.ghost, registry: s.registry === 'carrying' ? 'accepted' : s.registry, node: s.node === 'carrying' ? 'accepted' : s.node, side: s.side === 'carrying' ? 'accepted' : s.side };
}
export function reward(s: Save, id: string, amount: number): Save {
  if (s.rewarded.includes(id)) return s;
  return { ...s, money: s.money + amount, rewarded: [...s.rewarded, id] };
}
export function finishGhost(s: Save): Save { return s.ghost === 'complete' ? s : reward({ ...s, ghost: 'complete', chapter: 2, shortcut: true, checkpoint: false }, 'ghost', 450); }
export function finishRegistry(s: Save, route: Exclude<Route, null>): Save { return s.registry === 'complete' ? s : reward({ ...s, registry: 'complete', route, chapter: 3, checkpoint: false }, 'registry', 650); }
export function finishNode(s: Save, ending: Exclude<Ending, null>): Save { return s.node === 'complete' ? s : reward({ ...s, node: 'complete', ending, chapter: 4, checkpoint: false }, 'node', 1000); }
export const ENDINGS = {
  publish: { title: 'Les noms ne meurent pas', text: 'Le registre est public. Des milliers d’identités sont rétablies. Les archives exposées restent une arme entre de mauvaises mains. Mina transforme son garage en relais du collectif. La surveillance du Nœud s’est éteinte.' },
  protect: { title: 'Une ville sous protection', text: 'Sorel reprend le contrôle du registre. Les révocations sont suspendues et les dossiers privés restent protégés. Les habitants retrouvent leurs accès. Mais le système qui les a effacés existe toujours. Les patrouilles restent au Nœud.' },
  destroy: { title: 'Personne aux commandes', text: 'Tu détruis le serveur et les identités que la ville utilisait pour décider qui avait le droit d’exister. Les contrôles tombent. Les transports aussi. Dans les ateliers, on fabrique déjà de nouveaux papiers. La liberté a le bruit d’un générateur.' }
};
export const ACTIVE = (s: Save) => [s.ghost, s.registry, s.node, s.side].some(v => v === 'accepted' || v === 'carrying');
