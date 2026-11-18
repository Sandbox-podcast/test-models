/**
 * Vision et détection — Lot 4.
 *
 * Chaque observateur (vigile, caméra) accumule de la suspicion quand il voit
 * le joueur : « observé » à 35 %, « confirmé » à 100 %. La confirmation
 * transmet la position du joueur à tous les vigiles. Les murs coupent la
 * ligne de vue (raycast Rapier).
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx } from './ctx';
import { clamp, G_RAY } from './defs';

export interface Observer {
  pos: THREE.Vector3;
  yaw: number;
  viewDist: number;
  fov: number; // radians, total
  suspicion: number;
  /** Secondes depuis la dernière confirmation de CET observateur. */
  confirmedAt: number;
  disabled: boolean;   // caméra coupée par Intrusion
  isCam: boolean;
  gainRate: number;
}

export type AlertLevel = 'calme' | 'observé' | 'confirmé' | 'recherche';

export class AlertSystem {
  observers: Observer[] = [];
  lastKnown = new THREE.Vector3();
  lastConfirmTime = -100;
  /** Alarme déclenchée par le vol : les vigiles restent mobilisés. */
  missionAlarm = false;
  private rayPool: RAPIER.Ray | null = null;

  attach(o: Observer) { this.observers.push(o); }
  reset() {
    for (const o of this.observers) { o.suspicion = 0; o.confirmedAt = -100; o.disabled = false; }
    this.lastConfirmTime = -100;
    this.missionAlarm = false;
  }

  /** Ligne de vue dégagée entre deux points (yeux 1.55 m). */
  hasLOS(world: RAPIER.World, from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) return true;
    dir.normalize();
    if (!this.rayPool) this.rayPool = new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z });
    else this.rayPool.origin = { x: from.x, y: from.y, z: from.z };
    this.rayPool.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = world.castRay(this.rayPool, len, true, undefined, G_RAY);
    return hit === null || (hit.timeOfImpact > 0 && hit.timeOfImpact >= len - 0.4);
  }

  /** Facteur de visibilité 0..1 du joueur pour un observateur (0 = invisible). */
  visibility(world: RAPIER.World, o: Observer, playerPos: THREE.Vector3, playerFast: boolean): number {
    if (o.disabled) return 0;
    const eye = new THREE.Vector3(o.pos.x, 1.55, o.pos.z);
    const target = new THREE.Vector3(playerPos.x, 1.2, playerPos.z);
    const d = eye.distanceTo(target);
    if (d > o.viewDist) return 0;
    // angle
    const dx = target.x - eye.x, dz = target.z - eye.z;
    const angTo = Math.atan2(dx, -dz);
    let dAng = Math.abs(angTo - o.yaw) % (Math.PI * 2);
    if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
    if (dAng > o.fov / 2) return 0;
    if (!this.hasLOS(world, eye, target)) return 0;
    // proximité + mouvement
    let f = 1 - 0.55 * (d / o.viewDist);
    if (playerFast) f *= 1.35;
    return clamp(f, 0.15, 1.4);
  }

  /**
   * Intégration de la suspicion. Retourne la liste des observateurs qui
   * viennent de confirmer (transition < 1 → ≥ 1).
   */
  update(dt: number, ctx: Ctx): Observer[] {
    const pp = ctx.player.pos;
    const fast = ctx.player.speed > 3.5 || ctx.player.inCar;
    const justConfirmed: Observer[] = [];
    for (const o of this.observers) {
      const v = this.visibility(ctx.world, o, pp, fast);
      if (v > 0) {
        const was = o.suspicion;
        o.suspicion = clamp(o.suspicion + v * o.gainRate * dt, 0, 1);
        if (was < 1 && o.suspicion >= 1) {
          o.confirmedAt = ctx.time;
          justConfirmed.push(o);
        }
      } else if (o.suspicion < 1) {
        o.suspicion = Math.max(0, o.suspicion - 0.5 * dt);
      } else {
        // après confirmation, la suspicion retombe lentement (mémoire courte)
        o.suspicion = Math.max(0.6, o.suspicion - 0.12 * dt);
      }
    }
    if (justConfirmed.length > 0) {
      this.lastKnown.copy(pp);
      this.lastConfirmTime = ctx.time;
    }
    return justConfirmed;
  }

  anySeen(): boolean { return this.observers.some((o) => o.suspicion >= 0.35); }
  anyConfirmed(): boolean { return this.observers.some((o) => o.suspicion >= 0.999); }

  level(ctx: Ctx): AlertLevel {
    const since = ctx.time - this.lastConfirmTime;
    const chasing = ctx.guards.some((g) => g.state === 'chase');
    if (chasing || since < 2.5) return 'confirmé';
    if (this.missionAlarm || since < 18) return 'recherche';
    if (this.anySeen()) return 'observé';
    return 'calme';
  }

  /** Secondes sans détection confirmée (pour la remise). */
  calmTime(ctx: Ctx): number { return ctx.time - this.lastConfirmTime; }
}
