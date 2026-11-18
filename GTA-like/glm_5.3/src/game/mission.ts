/**
 * Mission « Puce fantôme » — Lots 3/6.
 * États persistants : Disponible → Acceptée → Puce récupérée → Terminée.
 * L'alerte évolue séparément (vision.ts). Le point de reprise correspond à la
 * fin du briefing : joueur au garage, puce sur son pupitre, vigiles en patrouille.
 */
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { MissionPersist, SecondaryPersist } from './save';

export type MissionState = 'disponible' | 'acceptee' | 'puce' | 'terminee';
export type SecondaryState = 'verrouille' | 'disponible' | 'acceptee' | 'terminee';

export interface JournalEntry {
  title: string;
  body: string;
  status: string;
  kind: 'active' | 'done' | 'locked' | 'warn';
}

export interface JournalSection {
  title: string;
  entries: JournalEntry[];
}

export const REWARD_MAIN = 500;
export const REWARD_SECONDARY = 150;

export class Mission {
  state: MissionState = 'disponible';
  secondary: SecondaryState = 'verrouille';
  /** Entrée du dépôt déjà utilisée (journal). */
  usedEntrance: 'portail' | 'cour' | null = null;
  consequences: string[] = [];
  deliveredAt = -1;

  reset() {
    this.state = 'disponible';
    this.secondary = 'verrouille';
    this.usedEntrance = null;
    this.consequences = [];
  }

  restore(persist: { mission: MissionPersist; secondary: SecondaryPersist; consequences?: string[] }) {
    this.state = persist.mission as MissionState;
    this.secondary = persist.secondary as SecondaryState;
    this.consequences = persist.consequences ?? [];
    // une page fermée pendant la mission reprend au point de reprise (briefing)
    if (this.state === 'acceptee' || this.state === 'puce') this.state = 'acceptee';
  }

  // ---------------------------------------------------------------- transitions

  onAccepted(ctx: Ctx) {
    this.state = 'acceptee';
    ctx.toast('Contrat accepté : Puce fantôme', 'info');
  }

  onChipTaken(ctx: Ctx) {
    this.state = 'puce';
    ctx.alert.missionAlarm = true;
    // le vol déclenche une intervention unique au dépôt
    const spot = new THREE.Vector3(ctx.level.pedestal.x, 0, ctx.level.pedestal.z);
    for (const g of ctx.guards) {
      if (!g.dead) g.broadcast(ctx, spot);
    }
    ctx.audio.alarmOn();
    ctx.toast('ALARME — les vigiles convergent vers le dépôt', 'warn');
  }

  onDelivered(ctx: Ctx) {
    this.state = 'terminee';
    this.deliveredAt = ctx.time;
    // conséquences appliquées ensemble à la remise
    if (this.secondary === 'verrouille') this.secondary = 'disponible';
    this.consequences.push('Mina a ouvert la grille de service entre le passage inférieur et la rue des Ateliers.');
    this.consequences.push('Ysec, au bar Le Signal, propose un contrat de récupération.');
  }

  onSecondaryTaken(ctx: Ctx) {
    this.secondary = 'acceptee';
    ctx.toast('Contrat accepté : Colis perdu', 'info');
  }

  onSecondaryDone(ctx: Ctx) {
    this.secondary = 'terminee';
    this.consequences.push('Ysec fournit des munitions au Signal.');
  }

  /** Objectif courant (texte + cible du marqueur). */
  objective(ctx: Ctx): { text: string; sub: string; target: { x: number; z: number } | null } {
    const L = ctx.level;
    switch (this.state) {
      case 'disponible':
        return { text: 'Parler à Mina au garage', sub: 'Rue des Ateliers — choisir les implants', target: { x: L.minaHome.x, z: L.minaHome.z } };
      case 'acceptee':
        return {
          text: 'Voler la puce au dépôt NOVAK',
          sub: 'Entrée principale (avenue) ou cour latérale (ruelle)',
          target: { x: this.usedEntrance === 'cour' ? 202 : 152, z: this.usedEntrance === 'cour' ? 127 : 129 },
        };
      case 'puce':
        return {
          text: 'Semer les vigiles et remettre la puce',
          sub: 'À pied par le passage sous les voies · en voiture par le pont',
          target: { x: L.van.x, z: L.van.z },
        };
      case 'terminee':
        if (this.secondary === 'disponible') {
          return { text: 'Contrat « Colis perdu » au Signal', sub: 'Ysec t’attend au bar, face à l’avenue', target: { x: L.ysec.x, z: L.ysec.z } };
        }
        if (this.secondary === 'acceptee') {
          return { text: this.secondaryCarried(ctx) ? 'Livrer le colis à Ysec' : 'Récupérer le colis sur le quai',
            sub: 'Dépôt NOVAK — quai ouest', target: this.secondaryCarried(ctx) ? { x: L.ysec.x, z: L.ysec.z } : { x: L.crate.x, z: L.crate.z } };
        }
        return { text: 'Explorer Les Forges', sub: 'Le quartier continue de vivre — la piste des effacés mène vers La Dalle', target: null };
    }
  }

  private carried = false;
  setCarried(v: boolean) { this.carried = v; }
  secondaryCarried(_ctx: Ctx) { return this.carried; }

  // ---------------------------------------------------------------- journal

  journal(ctx: Ctx): JournalSection[] {
    const sec: JournalSection[] = [];
    const stateLabel: Record<MissionState, string> = {
      disponible: 'DISPONIBLE',
      acceptee: 'EN COURS',
      puce: 'PUCE RÉCUPÉRÉE',
      terminee: 'TERMINÉE',
    };
    sec.push({
      title: 'CHAPITRE I — Puce fantôme',
      entries: [{
        title: 'Vol au dépôt NOVAK',
        body: this.state === 'disponible'
          ? 'Mina propose un contrat : une puce de routage dort dans le bureau de contrôle du dépôt.'
          : this.state === 'acceptee'
            ? 'Prendre la puce dans le dépôt. Deux entrées connues : le portail sur l’avenue, la cour par la ruelle.'
            : this.state === 'puce'
              ? 'La puce est à toi. Semer les vigiles, puis rejoindre le van de Mina au nord du passage inférieur — cinq secondes sans détection confirmée.'
              : 'La puce est entre les mains de Mina. Elle porte la liste des identités à révoquer — dont la tienne. Prochaine étape : La Dalle.',
        status: stateLabel[this.state],
        kind: this.state === 'terminee' ? 'done' : 'active',
      }],
    });
    const contracts: JournalEntry[] = [];
    const secLabel: Record<SecondaryState, string> = {
      verrouille: 'VERROUILLÉ',
      disponible: 'DISPONIBLE',
      acceptee: 'EN COURS',
      terminee: 'TERMINÉ',
    };
    contracts.push({
      title: 'Colis perdu — Ysec',
      body: this.secondary === 'verrouille'
        ? 'Un contact de Mina trafique au bar Le Signal. Disponible après la remise de la puce.'
        : this.secondary === 'disponible'
          ? 'Ysec veut récupérer un colis confisqué par le dépôt NOVAK. Il traîne sur le quai ouest.'
          : this.secondary === 'acceptee'
            ? 'Le colis est sur le quai ouest du dépôt. Le ramener à Ysec, au Signal.'
            : 'Colis livré. Ysec arme maintenant les effacés de La Dalle.',
      status: secLabel[this.secondary],
      kind: this.secondary === 'terminee' ? 'done' : this.secondary === 'verrouille' ? 'locked' : 'active',
    });
    sec.push({ title: 'CONTRATS', entries: contracts });
    sec.push({
      title: 'CONTACTS',
      entries: [
        { title: 'Mina — mécanicienne, garage des Forges', body: 'Protège les habitants qui utilisent son garage comme relais. Déchiffre la puce.', status: 'CONNUE', kind: 'done' },
        {
          title: 'Ysec — revendeuse, bar Le Signal',
          body: this.secondary === 'verrouille' ? 'Mentionnée par Mina. À rencontrer après la remise.' : 'Fournit filtrages et prolongateurs aux effacés de La Dalle.',
          status: this.secondary === 'verrouille' ? 'INCONNUE' : 'CONNUE',
          kind: this.secondary === 'verrouille' ? 'locked' : 'done',
        },
      ],
    });
    if (this.consequences.length > 0) {
      sec.push({
        title: 'CONSÉQUENCES OBSERVÉES',
        entries: this.consequences.map((c) => ({ title: c, body: '', status: '', kind: 'warn' as const })),
      });
    }
    void ctx;
    return sec;
  }
}

// ---------------------------------------------------------------- dialogues

export const DIALOGUES = {
  briefing: {
    speaker: 'Mina',
    lines: [
      'Le fret vers La Dalle a encore doublé. Mes clients paient en pièces détachées, moi je paie le loyer en retards.',
      'Il y a un paquet dans le dépôt NOVAK. Une puce de routage, pas plus grosse qu’un ongle. Le genre de chose qui vaut trois mois de travaux.',
      'Le portail donne sur l’avenue : gardé, mais direct. La cour est à l’est, par la ruelle. De là, le quai — ou force leur grille avec l’implant Intrusion.',
      'Dès que tu la tiens, ils déclenchent l’intervention. Sème-les et retrouve-moi au van, sous les voies, côté nord.',
      'Cinq secondes sans être confirmé et je t’ouvre la portière. Les deux implants sont au casier. Et coursier — change de trottoir avant de changer d’avis.',
    ],
  },
  postMission: {
    speaker: 'Mina',
    lines: [
      'La puce est signée. Révocations d’identité, lot 7, mise à jour dans onze jours. Ton nom est dessus, coursier. Le mien aussi.',
      'J’ai ouvert la grille de service sous les voies. Coupe par la galerie, plus besoin de faire le pont.',
      'Ysec t’attend au Signal. Elle trafique avec les effacés de La Dalle — elle saura quoi faire du registre.',
      'On continue. Ce n’est plus du fret, maintenant.',
    ],
  },
  ysecStart: {
    speaker: 'Ysec',
    lines: [
      'Le NOVAK m’a confisqué un colis. Pas de la came — des filtrages. Des prolongateurs de badge pour les effacés.',
      'Il traîne sur leur quai, côté ouest, marqué au fluo. Ramène-le et je t’achète le prochain chargeur.',
    ],
  },
  ysecDone: {
    speaker: 'Ysec',
    lines: [
      'Propre. Les effacés de La Dalle te doivent une soirée.',
      'Reviens quand tu veux, coursier. La suite se joue sur le coteau.',
    ],
  },
  minaIdle: {
    speaker: 'Mina',
    lines: ['Le van est prêt. Le dépôt est au nord-est, le long des voies. Reviens avec la puce, pas en civière.'],
  },
} as const;
