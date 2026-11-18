/**
 * Sauvegarde locale versionnée — Lot 6. Une seule clé localStorage.
 * L'enregistrement d'une fin de mission écrit ensemble : état du contrat,
 * passage ouvert et récompense (créditée une seule fois, même après rechargement).
 */

export type MissionPersist = 'disponible' | 'acceptee' | 'puce' | 'terminee';
export type SecondaryPersist = 'verrouille' | 'disponible' | 'acceptee' | 'terminee';

export interface SaveData {
  v: number;
  money: number;
  mission: MissionPersist;
  secondary: SecondaryPersist;
  /** Raccourci de Mina : grille de service sous les voies. */
  grilleService: boolean;
  recompensePrincipale: boolean;
  recompenseSecondaire: boolean;
  /** Conséquences visibles au journal. */
  consequences?: string[];
  /** Position d'exploration pour « Continuer ». */
  px: number;
  pz: number;
  carX: number;
  carZ: number;
  carYaw: number;
  /** Campagne (bible 02/03) : états des quêtes M02–M06, U02–U05, C01–C04. */
  quests?: Record<string, { taken: boolean; stage: number; done: boolean; choice?: string }>;
  filiere?: 'nadia' | 'sorel' | null;
  fin?: 'A' | 'B' | null;
  /** Props de quête déjà ramassées (id). */
  propsTaken?: string[];
  /** Portes ouvertes par l'histoire (id). */
  doorsOpen?: string[];
}

const KEY = 'deadline-puce-fantome-v1';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== 1 && data.v !== 2) return null;
    if (data.v === 1) data.v = 2; // migration : campagne absente = non commencée
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, v: 2 }));
  } catch {
    /* stockage indisponible : la session continue sans sauvegarde */
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
