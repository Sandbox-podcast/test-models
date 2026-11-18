/**
 * Implants — Lot 5. Intrusion (grilles compatibles + coupure caméra, recharge
 * partagée) et Leurre (signal projeté qui détourne un vigile).
 */
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { SurveillanceCam } from './ai';
import { IMPLANTS, dist } from './defs';

export type IntrusionTarget =
  | { kind: 'grate'; label: string }
  | { kind: 'cam'; label: string }
  | null;

export class Implants {
  cdIntrusion = 0;
  cdLeurre = 0;
  private lureMesh: THREE.Mesh;
  private lureRing: THREE.Mesh;
  lurePos: THREE.Vector3 | null = null;
  lureT = 0;

  constructor(ctx: Ctx) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7, depthWrite: false });
    this.lureMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 12, 1, true), mat);
    this.lureMesh.visible = false;
    ctx.scene.add(this.lureMesh);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.lureRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 26), ringMat);
    this.lureRing.rotation.x = -Math.PI / 2;
    this.lureRing.visible = false;
    ctx.scene.add(this.lureRing);
  }

  update(dt: number, ctx: Ctx) {
    this.cdIntrusion = Math.max(0, this.cdIntrusion - dt);
    this.cdLeurre = Math.max(0, this.cdLeurre - dt);
    if (this.lureT > 0) {
      this.lureT -= dt;
      const s = 1 + Math.sin(ctx.time * 6) * 0.08;
      this.lureMesh.scale.set(s, 1, s);
      this.lureRing.scale.setScalar(1 + ((IMPLANTS.LEURRE_LIFETIME - this.lureT) % 1.2) * 1.4);
      if (this.lureT <= 0) {
        this.lureMesh.visible = false;
        this.lureRing.visible = false;
        this.lurePos = null;
      }
    }
  }

  /** Cible valide d'Intrusion sous le réticule (pour le HUD). */
  target(ctx: Ctx): { obj: SurveillanceCam | 'grate'; label: string; distTo: number } | null {
    const p = ctx.player;
    const aim = p.aim;
    // caméras
    let best: { obj: SurveillanceCam | 'grate'; label: string; distTo: number } | null = null;
    let bestD = 1e9;
    for (const c of ctx.cams) {
      if (c.disabled) continue;
      const d = dist(aim.x, aim.z, c.pos.x, c.pos.z);
      const dp = dist(p.pos.x, p.pos.z, c.pos.x, c.pos.z);
      if (d < 2.2 && dp < IMPLANTS.INTRUSION_RANGE && dp < bestD && ctx.alert.hasLOS(ctx.world, new THREE.Vector3(p.pos.x, 1.55, p.pos.z), c.pos)) {
        best = { obj: c, label: 'CAMÉRA — couper', distTo: dp };
        bestD = dp;
      }
    }
    // grilles compatibles
    for (const g of ctx.grates) {
      if (g.open || !g.def.byIntrusion) continue;
      const d = dist(aim.x, aim.z, g.def.x, g.def.z);
      const dp = dist(p.pos.x, p.pos.z, g.def.x, g.def.z);
      if (d < 2.4 && dp < IMPLANTS.INTRUSION_RANGE && dp < bestD) {
        best = { obj: 'grate', label: 'GRILLE — forcer', distTo: dp };
        bestD = dp;
      }
    }
    return best;
  }

  castIntrusion(ctx: Ctx): boolean {
    if (this.cdIntrusion > 0) {
      ctx.audio.implantDeny();
      ctx.toast(`Intrusion en recharge (${this.cdIntrusion.toFixed(1)} s)`, 'warn');
      return false;
    }
    const t = this.target(ctx);
    if (!t) {
      ctx.audio.implantDeny();
      ctx.toast('Aucune cible compatible sous le réticule', 'warn');
      return false;
    }
    this.cdIntrusion = IMPLANTS.INTRUSION_CD;
    ctx.audio.implantCast();
    if (t.obj === 'grate') {
      ctx.openGrate('grille-quai');
      ctx.toast('Grille forcée', 'info');
    } else {
      t.obj.disable(ctx);
      ctx.toast('Caméra hors ligne (10 s)', 'info');
    }
    return true;
  }

  castLeurre(ctx: Ctx): boolean {
    if (this.cdLeurre > 0) {
      ctx.audio.implantDeny();
      ctx.toast(`Leurre en recharge (${this.cdLeurre.toFixed(1)} s)`, 'warn');
      return false;
    }
    const p = ctx.player;
    const d = dist(p.pos.x, p.pos.z, p.aim.x, p.aim.z);
    if (d > IMPLANTS.LEURRE_RANGE) {
      ctx.audio.implantDeny();
      ctx.toast('Trop loin pour projeter un signal', 'warn');
      return false;
    }
    this.cdLeurre = IMPLANTS.LEURRE_CD;
    this.lureT = IMPLANTS.LEURRE_LIFETIME;
    this.lurePos = new THREE.Vector3(p.aim.x, 0, p.aim.z);
    this.lureMesh.position.set(p.aim.x, 1.1, p.aim.z);
    this.lureRing.position.set(p.aim.x, 0.09, p.aim.z);
    this.lureMesh.visible = true;
    this.lureRing.visible = true;
    ctx.audio.implantCast();
    // le vigile disponible le plus proche vient vérifier
    let best: import('./ai').Guard | null = null;
    let bestD = 26;
    for (const g of ctx.guards) {
      if (g.dead || g.state === 'chase') continue;
      const gd = dist(g.pos.x, g.pos.z, p.aim.x, p.aim.z);
      if (gd < bestD) { best = g; bestD = gd; }
    }
    if (best) {
      best.lure(this.lurePos);
      ctx.toast('Signal projeté — un vigile vient vérifier', 'info');
    } else {
      ctx.toast('Signal projeté', 'info');
    }
    return true;
  }
}
