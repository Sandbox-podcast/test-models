/**
 * Contexte de jeu partagé entre systèmes — évite les imports circulaires.
 */
import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Input } from '../engine/input';
import type { AudioSys } from '../engine/audio';
import type { Player, Car } from './actors';
import type { Guard, Civilian, SurveillanceCam } from './ai';
import type { AlertSystem } from './vision';
import type { FxSystem } from './combat';
import type { Mission } from './mission';
import type { LevelData, BuiltGrate } from './level';

export interface Ctx {
  world: RAPIER.World;
  scene: THREE.Scene;
  camera: THREE.Camera;
  input: Input;
  audio: AudioSys;
  player: Player;
  car: Car;
  guards: Guard[];
  civilians: Civilian[];
  cams: SurveillanceCam[];
  alert: AlertSystem;
  fx: FxSystem;
  mission: Mission;
  level: LevelData;
  grates: BuiltGrate[];
  /** Temps de simulation cumulé (s). */
  time: number;
  /** Vrai pendant les séquences scriptées (briefing, remise). */
  cinematic: boolean;
  /** Notifie l'UI d'un dégât joueur (flash rouge). */
  hudDamage(): void;
  /** Toast générique. */
  toast(text: string, kind?: 'info' | 'reward' | 'warn'): void;
  /** Ouvre une grille (implant Intrusion ou conséquence). */
  openGrate(id: string): void;
}
