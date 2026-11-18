/**
 * Combat et effets — Lots 4 & 7. Hitscan pistolet, traceurs, éclaboussures de
 * sang (particules poolées), décals au sol, secousse caméra. Les réactions
 * lisibles à distance : recul/étourdissement léger, chute au sol, flaque
 * sous le corps, projection en cas de choc véhicule (spéc. §6).
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx } from './ctx';
import type { Guard, Civilian } from './ai';
import { G_RAY, PLAYER, GUARD, clamp } from './defs';

export interface FireResult {
  endPoint: THREE.Vector3;
  hitGuard: Guard | null;
  hitCiv: Civilian | null;
  hitPlayer: boolean;
  hitCar: boolean;
}

interface Particle {
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  stuck: boolean;
  size: number;
}

const BLOOD_COUNT = 220;
const DECAL_COUNT = 44;

export class FxSystem {
  private particles: Particle[] = [];
  private bloodMesh: THREE.InstancedMesh;
  private decals: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private decalIdx = 0;
  private tracers: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private tracerIdx = 0;
  private ray: RAPIER.Ray;
  shake = 0;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();

  constructor(private ctx: Ctx) {
    // particules de sang (instances)
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9e1225, transparent: true, opacity: 0.95, depthWrite: false });
    this.bloodMesh = new THREE.InstancedMesh(geo, mat, BLOOD_COUNT);
    this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.frustumCulled = false;
    const colors = new Float32Array(BLOOD_COUNT * 3).fill(1);
    this.bloodMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    for (let i = 0; i < BLOOD_COUNT; i++) {
      this.particles.push({ vel: new THREE.Vector3(), life: 0, maxLife: 1, stuck: false, size: 0.08 });
      this.tmpM.makeScale(0, 0, 0);
      this.bloodMesh.setMatrixAt(i, this.tmpM);
    }
    ctx.scene.add(this.bloodMesh);
    // décals
    const dGeo = new THREE.CircleGeometry(1, 10);
    dGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < DECAL_COUNT; i++) {
      const dMat = new THREE.MeshBasicMaterial({ color: 0x6e0d1a, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(dGeo, dMat);
      mesh.position.y = -10;
      mesh.renderOrder = 2;
      ctx.scene.add(mesh);
      this.decals.push({ mesh, mat: dMat, life: 0 });
    }
    // traceurs
    const tGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < 14; i++) {
      const tMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(tGeo, tMat);
      mesh.visible = false;
      ctx.scene.add(mesh);
      this.tracers.push({ mesh, mat: tMat, life: 0 });
    }
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  /** Tir hitscan. */
  fire(from: THREE.Vector3, dir: THREE.Vector3, shooter: 'player' | 'guard'): FireResult {
    const res: FireResult = { endPoint: new THREE.Vector3(), hitGuard: null, hitCiv: null, hitPlayer: false, hitCar: false };
    this.ray.origin = { x: from.x, y: from.y, z: from.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const wallHit = this.ctx.world.castRay(this.ray, 70, true, undefined, G_RAY);
    let range = 70;
    let hitCar = false;
    if (wallHit) {
      range = wallHit.timeOfImpact;
      // la balle s'arrête-t-elle sur la voiture ?
      const col = wallHit.collider;
      if (col && this.ctx.car.body && col.parent() === this.ctx.car.body) hitCar = true;
    }
    res.hitCar = hitCar;
    const test = (p: THREE.Vector3, r: number): number | null => {
      const ox = p.x - from.x, oy = p.y - from.y, oz = p.z - from.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > range + r) return null;
      const cx = from.x + dir.x * t, cy = from.y + dir.y * t, cz = from.z + dir.z * t;
      const d2 = (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2;
      return d2 <= r * r ? t : null;
    };
    let bestT = range;
    for (const g of this.ctx.guards) {
      if (g.dead) continue;
      const t = test(g.pos, 0.55);
      if (t !== null && t < bestT) { bestT = t; res.hitGuard = g; res.hitCiv = null; res.hitPlayer = false; }
    }
    for (const c of this.ctx.civilians) {
      if (c.dead) continue;
      const t = test(c.pos, 0.5);
      if (t !== null && t < bestT) { bestT = t; res.hitCiv = c; res.hitGuard = null; res.hitPlayer = false; }
    }
    if (shooter === 'guard' && !this.ctx.player.inCar) {
      const t = test(this.ctx.player.pos, 0.5);
      if (t !== null && t < bestT) { bestT = t; res.hitPlayer = true; res.hitGuard = null; res.hitCiv = null; }
    }
    res.endPoint.copy(from).addScaledVector(dir, bestT);
    this.tracer(from, res.endPoint);
    return res;
  }

  tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const len = a.distanceTo(b);
    t.mesh.visible = true;
    t.mesh.position.lerpVectors(a, b, 0.5);
    t.mesh.lookAt(b);
    t.mesh.scale.set(1, 1, len);
    t.mat.opacity = 0.85;
    t.life = 0.09;
  }

  bloodBurst(pos: THREE.Vector3, dir: THREE.Vector3, count: number, power = 1) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      spawned++;
      p.stuck = false;
      p.maxLife = 2.5 + Math.random() * 2;
      p.life = p.maxLife;
      p.size = (0.05 + Math.random() * 0.08) * (0.7 + power * 0.5);
      p.vel.set(
        dir.x * (1.5 + Math.random() * 2.5) * power + (Math.random() - 0.5) * 3.2 * power,
        1.2 + Math.random() * 2.4 * power,
        dir.z * (1.5 + Math.random() * 2.5) * power + (Math.random() - 0.5) * 3.2 * power,
      );
      const m = this.tmpM;
      this.bloodMesh.getMatrixAt(i, m);
      m.setPosition(pos.x + (Math.random() - 0.5) * 0.15, pos.y + (Math.random() - 0.5) * 0.15, pos.z + (Math.random() - 0.5) * 0.15);
      this.bloodMesh.setMatrixAt(i, m);
      const c = this.bloodMesh.instanceColor!;
      c.setXYZ(i, 0.55 + Math.random() * 0.25, 0.04, 0.1);
    }
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    this.bloodMesh.instanceColor!.needsUpdate = true;
  }

  /** Flaque/suintement au sol. */
  decal(x: number, z: number, size: number, dark = 0.62) {
    const d = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    d.mesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.055 + this.decalIdx * 0.0004, z + (Math.random() - 0.5) * 0.3);
    d.mesh.scale.setScalar(size);
    d.mesh.rotation.y = Math.random() * Math.PI * 2;
    d.mat.color.setRGB(0.42 * dark, 0.05 * dark, 0.09 * dark);
    d.mat.opacity = 0.85;
    d.life = 30;
  }

  goreImpact(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.bloodBurst(pos, dir, 26, 1.9);
    this.decal(pos.x, pos.z, 1.15 + Math.random() * 0.5, 0.5);
    this.decal(pos.x + dir.x, pos.z + dir.z, 0.7, 0.7);
  }

  update(dt: number) {
    // particules
    let dirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      dirty = true;
      if (!p.stuck) {
        p.vel.y -= 9.81 * dt;
        this.bloodMesh.getMatrixAt(i, this.tmpM);
        const e = this.tmpM.elements;
        e[12] += p.vel.x * dt;
        e[13] += p.vel.y * dt;
        e[14] += p.vel.z * dt;
        if (e[13] <= 0.05) {
          e[13] = 0.05;
          p.stuck = true;
          p.life = Math.min(p.life, 6);
          if (Math.random() < 0.28) this.decal(e[12], e[14], 0.16 + Math.random() * 0.3);
        }
        this.bloodMesh.setMatrixAt(i, this.tmpM);
      }
      if (p.life <= 0) {
        this.tmpM.makeScale(0, 0, 0);
        this.bloodMesh.setMatrixAt(i, this.tmpM);
      }
    }
    if (dirty) this.bloodMesh.instanceMatrix.needsUpdate = true;
    // décals
    for (const d of this.decals) {
      if (d.life > 0) {
        d.life -= dt;
        if (d.life < 5) d.mat.opacity = Math.max(0, (d.life / 5) * 0.85);
        if (d.life <= 0) { d.mat.opacity = 0; d.mesh.position.y = -10; }
      }
    }
    // traceurs
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mat.opacity = Math.max(0, t.life / 0.09) * 0.85;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  /** Application des dégâts après un tir de joueur. */
  applyPlayerShot(res: FireResult, ctx: Ctx) {
    const dir = res.endPoint.clone().sub(ctx.player.pos).setY(0).normalize();
    if (res.hitGuard) {
      const g = res.hitGuard;
      const fatal = g.hp - PLAYER.PISTOL_DMG <= 0;
      ctx.audio.hitFlesh();
      this.bloodBurst(res.endPoint, dir, fatal ? 16 : 8, fatal ? 1.4 : 0.9);
      if (fatal) this.decal(g.pos.x, g.pos.z, 0.85);
      g.damage(PLAYER.PISTOL_DMG, ctx, ctx.player.pos, 'bullet');
      if (!g.dead) g.flinch = 0.45;
      this.notifyNeighbors(ctx, ctx.player.pos);
    } else if (res.hitCiv) {
      const c = res.hitCiv;
      ctx.audio.hitFlesh();
      this.bloodBurst(res.endPoint, dir, 12, 1);
      c.damage(PLAYER.PISTOL_DMG, ctx, ctx.player.pos, 'bullet');
      if (!c.dead) c.panic(ctx.player.pos);
    } else if (res.endPoint.distanceTo(ctx.player.pos) < 68) {
      ctx.audio.thud();
    }
    this.shake = Math.min(1, this.shake + 0.25);
  }

  applyGuardShot(res: FireResult, ctx: Ctx, fromPos: THREE.Vector3) {
    if (res.hitPlayer) {
      ctx.player.damage(GUARD.SHOOT_DMG, ctx, fromPos, 'bullet');
      ctx.audio.hurt();
      this.bloodBurst(res.endPoint.clone(), new THREE.Vector3(0, 0.3, 0), 7, 0.8);
      this.decal(ctx.player.pos.x, ctx.player.pos.z, 0.3, 0.8);
      this.shake = Math.min(1.4, this.shake + 0.5);
      ctx.hudDamage();
    } else {
      ctx.audio.thud();
    }
  }

  /** Renversement : choc lisible vs impact grave (spec §6 / lot 7 + bible 05). */
  vehicleHit(actor: Guard | Civilian, ctx: Ctx, speed: number, dir: THREE.Vector3) {
    const severe = speed > 8;
    if (severe) {
      ctx.audio.crashHeavy();
      this.goreImpact(actor.pos.clone(), dir);
      actor.hp = 0;
      actor.kill(ctx, dir, 'impact');
      // projection du corps (collider déjà désactivé par kill)
      this.thrown.push({ mesh: actor.mesh, vel: dir.clone().multiplyScalar(clamp(speed * 0.45, 2, 9)).setY(2.4), t: 1.1 });
    } else {
      ctx.audio.thud();
      this.bloodBurst(actor.pos.clone().setY(0.9), dir, 6, 0.7);
      actor.damage(28, ctx, ctx.player.pos, 'impact');
      actor.stun = 1.6;
      // écarté du gabarit du véhicule : un piéton vivant ne bloque pas la voiture
      const r = ctx.car.right();
      const rel = new THREE.Vector3(actor.pos.x - ctx.car.pos.x, 0, actor.pos.z - ctx.car.pos.z);
      const side = rel.x * r.x + rel.z * r.z >= 0 ? 1 : -1;
      const px = actor.pos.x + r.x * side * 1.9;
      const pz = actor.pos.z + r.z * side * 1.9;
      actor.pos.set(px, actor.pos.y, pz);
      if (actor.body) actor.body.setTranslation({ x: px, y: actor.pos.y, z: pz }, true);
      if ('panic' in actor) actor.panic(ctx.player.pos);
    }
    this.shake = Math.min(1.6, this.shake + 0.6);
  }

  private thrown: { mesh: THREE.Mesh | THREE.Group; vel: THREE.Vector3; t: number }[] = [];

  updateThrown(dt: number) {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const th = this.thrown[i];
      th.t -= dt;
      th.vel.y -= 9.81 * dt;
      th.mesh.position.addScaledVector(th.vel, dt);
      if (th.mesh.position.y < 0.3) {
        th.mesh.position.y = 0.3;
        th.vel.set(0, 0, 0);
      }
      if (Math.random() < 0.3 && th.vel.lengthSq() > 1) {
        this.decal(th.mesh.position.x, th.mesh.position.z, 0.35 + Math.random() * 0.3, 0.75);
      }
      if (th.t <= 0) this.thrown.splice(i, 1);
    }
  }

  private notifyNeighbors(ctx: Ctx, pos: THREE.Vector3) {
    for (const g of ctx.guards) g.hearGunshot(ctx, pos);
    for (const c of ctx.civilians) {
      if (!c.dead && c.pos.distanceTo(pos) < 30) c.panic(pos);
    }
  }
}
