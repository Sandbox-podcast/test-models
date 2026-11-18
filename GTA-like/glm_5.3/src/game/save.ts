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
}

const KEY = 'deadline-puce-fantome-v1';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* stockage indisponible : la session continue sans sauvegarde */
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
