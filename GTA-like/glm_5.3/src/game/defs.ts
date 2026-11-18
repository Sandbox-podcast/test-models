/**
 * Constantes et types partagés — groupes de collision, réglages de gameplay.
 */

export const DT = 1 / 60;

// Groupes d'interaction Rapier (membres).
export const GR = {
  WORLD: 0x0001,
  PLAYER: 0x0002,
  CAR: 0x0004,
  ACTOR: 0x0008,
  PROP: 0x0010,
} as const;

/**filtres classiques (membership << 16 | filter).*/
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Solides statiques : murs, sols, rampes, limites. */
export const G_STATIC = groups(GR.WORLD, 0xffff);
/** Rayon (vision, balles) : accepte les solides, la voiture et les caisses. */
export const G_RAY = groups(0xffff, GR.WORLD | GR.CAR | GR.PROP);
/** Personnages (joueur, vigiles, civils) : tout bloque sauf eux-mêmes ? — non, ils se bloquent aussi. */
export const G_ACTOR = groups(GR.ACTOR, 0xffff);
export const G_PLAYER = groups(GR.PLAYER, 0xffff);
export const G_CAR = groups(GR.CAR, 0xffff);
export const G_PROP = groups(GR.PROP, 0xffff);

export const PLAYER = {
  WALK: 3.1,
  RUN: 5.5,
  RADIUS: 0.36,
  HALF_H: 0.42,
  EYE: 1.55,
  HP: 100,
  PISTOL_DMG: 34,
  MAG: 12,
  RESERVE_MAX: 60,
  RELOAD: 1.3,
  FIRE_INTERVAL: 0.22,
};

export const GUARD = {
  HP: 100,
  WALK: 1.9,
  CHASE: 4.9,
  VIEW_DIST: 22,
  FOV: 100 * (Math.PI / 180),
  SHOOT_RANGE: 16,
  SHOOT_DMG: 9,
  FIRE_INTERVAL: 0.9,
  INACCURACY: 0.09,
  SEARCH_TIME: 9,
};

export const CAM = {
  VIEW_DIST: 17,
  FOV: 58 * (Math.PI / 180),
  GAIN: 0.55,       // suspicion/s à pleine visibilité
  DECAY: 0.9,
  DISABLE_TIME: 10, // Intrusion
};

export const CAR = {
  ENGINE_FORCE: 11500,
  BRAKE_FORCE: 9000,
  MAX_SPEED: 23,
  STEER_RATE: 2.6,
  LATERAL_DAMP: 7.5,
  EXIT_MAX_SPEED: 2.0,
};

export const IMPLANTS = {
  INTRUSION_RANGE: 14,
  INTRUSION_CD: 9,
  LEURRE_RANGE: 22,
  LEURRE_CD: 8,
  LEURRE_LIFETIME: 12,
};

/** Délai sans détection confirmée pour autoriser la remise (spec : 5 s, à ajuster en test). */
export const DELIVERY_CALM = 5.0;

export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }

/**
 * Lectures « à portée courte » des corps Rapier : les getters retournent des
 * objets réutilisés côté WASM ; les consumer dans une fonction dédiée évite
 * l'erreur « recursive use / unsafe aliasing » quand plusieurs lectures
 * s'enchaînent sur une même frame.
 */
export interface BodyLike {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
  linvel(): { x: number; y: number; z: number };
  angvel(): { x: number; y: number; z: number };
}
export function bodyPos(b: BodyLike): [number, number, number] {
  const t = b.translation();
  return [t.x, t.y, t.z];
}
export function bodyRot(b: BodyLike): [number, number, number, number] {
  const q = b.rotation();
  return [q.x, q.y, q.z, q.w];
}
export function bodyVel(b: BodyLike): [number, number, number] {
  const v = b.linvel();
  return [v.x, v.y, v.z];
}
export function bodyAng(b: BodyLike): [number, number, number] {
  const a = b.angvel();
  return [a.x, a.y, a.z];
}
export function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
export function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}
