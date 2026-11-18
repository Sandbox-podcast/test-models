/**
 * IA — Lot 4/5. Vigiles (patrouille → investigation → poursuite → recherche),
 * caméras de surveillance, civils (fuite + témoignage), PNJ (Mina, Ysec).
 */
import * as THREE from 'three';
import type { Ctx } from './ctx';
import { Actor } from './actors';
import type { Observer } from './vision';
import { GUARD, CAM, clamp, dist, lerp } from './defs';

/** Éventail de vision au sol (lisibilité GTA-like). */
export function makeVisionFan(radius: number, fov: number, color: number): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const segs = 22;
  const geo = new THREE.BufferGeometry();
  const verts: number[] = [0, 0, 0];
  for (let i = 0; i <= segs; i++) {
    const a = -fov / 2 + (i / segs) * fov;
    verts.push(Math.sin(a) * radius, 0, -Math.cos(a) * radius);
  }
  const idx: number[] = [];
  for (let i = 1; i <= segs; i++) idx.push(0, i, i + 1);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.07;
  return { mesh, mat };
}

export type GuardState = 'patrol' | 'investigate' | 'chase' | 'search' | 'down';

export class Guard extends Actor implements Observer {
  state: GuardState = 'patrol';
  offDuty = false;
  waypoint = 0;
  points: { x: number; z: number }[];
  pauseT = 0;
  target = new THREE.Vector3();       // cible investigation/poursuite
  searchT = 0;
  fireT = 0;
  stuckT = 0;
  sidestep = 0;
  sidestepDir = 1;
  lured = false;
  // Observer
  suspicion = 0;
  confirmedAt = -100;
  viewDist = GUARD.VIEW_DIST;
  fov = GUARD.FOV;
  disabled = false;
  isCam = false;
  gainRate = 0.5;
  fan: THREE.Mesh;
  fanMat: THREE.MeshBasicMaterial;
  muzzle!: THREE.PointLight;

  constructor(public name: string, points: { x: number; z: number }[]) {
    super('guard');
    this.points = points;
    const f = makeVisionFan(GUARD.VIEW_DIST, GUARD.FOV, 0x52ff9a);
    this.fan = f.mesh;
    this.fanMat = f.mat;
  }

  init(ctx: Ctx) {
    const p = this.points[0];
    this.initPhysics(ctx, p.x, p.z, 1.0);
    this.hp = GUARD.HP;
    this.buildMesh(ctx);
    ctx.alert.attach(this);
    ctx.scene.add(this.fan);
  }

  private buildMesh(ctx: Ctx) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4c545f, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 6, 12), mat);
    body.position.y = 0.8;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8a97a8, roughness: 0.5 }));
    head.position.y = 1.48;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.32), new THREE.MeshStandardMaterial({ color: 0x11161c }));
    cap.position.y = 1.6;
    g.add(cap);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.42), new THREE.MeshStandardMaterial({ color: 0x151a20, emissive: 0xffb347, emissiveIntensity: 0.9, roughness: 0.6 }));
    vest.position.y = 1.06;
    g.add(vest);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.34), new THREE.MeshStandardMaterial({ color: 0x11161c, metalness: 0.8, roughness: 0.3 }));
    gun.position.set(0.22, 1.05, -0.42);
    g.add(gun);
    this.muzzle = new THREE.PointLight(0xffe6b0, 0, 8, 2);
    this.muzzle.position.set(0.22, 1.05, -0.7);
    g.add(this.muzzle);
    this.mesh = g;
    this.yaw = this.yawToward(this.points[1] ?? this.points[0]);
    ctx.scene.add(g);
  }

  private yawToward(p: { x: number; z: number }) {
    return Math.atan2(p.x - this.pos.x, -(p.z - this.pos.z));
  }

  kill(ctx: Ctx, _from: THREE.Vector3, _gore: 'bullet' | 'impact' | 'none' = 'bullet') {
    super.kill(ctx, _from, _gore);
    this.state = 'down';
    this.suspicion = 0;
    this.fanMat.opacity = 0;
    this.fan.visible = false;
    this.deadAt = ctx.time;
  }

  revive(ctx: Ctx) {
    this.dead = false;
    this.hp = GUARD.HP;
    this.state = 'patrol';
    this.waypoint = 0;
    this.suspicion = 0;
    this.pauseT = 0;
    this.stuckT = 0;
    this.deadAnimT = 0;
    this.fan.visible = true;
    const p = this.points[0];
    this.teleportTo(ctx, p.x, p.z);
  }

  teleportTo(ctx: Ctx, x: number, z: number) {
    this.pos.set(x, 1.0, z);
    this.prev.copy(this.pos);
    this.body.setTranslation({ x, y: 1.0, z }, true);
    this.deadAnimT = 0;
    this.mesh.rotation.z = 0;
    this.mesh.position.y = 0;
  }

  /** Signaux reçus du système d'alerte. */
  broadcast(ctx: Ctx, pos: THREE.Vector3) {
    if (this.dead || this.state === 'chase') return;
    this.target.copy(pos);
    this.state = this.suspicion >= 0.999 ? 'chase' : 'investigate';
    if (this.state === 'investigate') this.searchT = GUARD.SEARCH_TIME;
    void ctx;
  }

  lure(pos: THREE.Vector3) {
    if (this.dead || this.state === 'chase') return false;
    this.target.copy(pos);
    this.state = 'investigate';
    this.searchT = GUARD.SEARCH_TIME;
    this.lured = true;
    return true;
  }

  hearGunshot(ctx: Ctx, pos: THREE.Vector3) {
    if (this.dead || this.state === 'chase') return;
    if (dist(this.pos.x, this.pos.z, pos.x, pos.z) < 34) {
      this.target.copy(pos);
      this.state = 'investigate';
      this.searchT = GUARD.SEARCH_TIME;
    }
  }

  protected update(dt: number, ctx: Ctx) {
    if (this.dead) return;
    this.flinch = Math.max(0, this.flinch - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.fireT = Math.max(0, this.fireT - dt);
    const pp = ctx.player.pos;

    // transitions d'état liées à la vision
    if (this.suspicion >= 0.999 && this.state !== 'chase') {
      this.state = 'chase';
      ctx.audio.confirmed();
    }
    if (this.state === 'chase') {
      this.target.copy(ctx.alert.hasLOS(ctx.world, new THREE.Vector3(this.pos.x, 1.55, this.pos.z), new THREE.Vector3(pp.x, 1.2, pp.z))
        ? pp : ctx.alert.lastKnown);
    }

    let moveX = 0, moveZ = 0;
    let speed = 0;
    let faceYaw = this.yaw;

    switch (this.state) {
      case 'patrol': {
        const wp = this.points[this.waypoint];
        const d = dist(this.pos.x, this.pos.z, wp.x, wp.z);
        if (this.pauseT > 0) {
          this.pauseT -= dt;
          // balayage du regard
          faceYaw = this.baseYaw() + Math.sin(ctx.time * 0.8 + this.waypoint) * 0.7;
        } else if (d < 0.9) {
          this.waypoint = (this.waypoint + 1) % this.points.length;
          this.pauseT = 1.4 + Math.random() * 1.6;
        } else {
          const dirX = wp.x - this.pos.x, dirZ = wp.z - this.pos.z;
          const l = Math.hypot(dirX, dirZ);
          moveX = (dirX / l) * GUARD.WALK * dt;
          moveZ = (dirZ / l) * GUARD.WALK * dt;
          speed = GUARD.WALK;
          faceYaw = Math.atan2(dirX, -dirZ);
        }
        break;
      }
      case 'investigate': {
        const d = dist(this.pos.x, this.pos.z, this.target.x, this.target.z);
        if (d > 1.2) {
          const dirX = this.target.x - this.pos.x, dirZ = this.target.z - this.pos.z;
          const l = Math.hypot(dirX, dirZ);
          moveX = (dirX / l) * GUARD.WALK * 1.5 * dt;
          moveZ = (dirZ / l) * GUARD.WALK * 1.5 * dt;
          speed = GUARD.WALK * 1.5;
          faceYaw = Math.atan2(dirX, -dirZ);
        } else {
          // sur place : inspecte les sorties proches
          this.searchT -= dt;
          faceYaw = this.yaw + Math.sin(ctx.time * 1.6) * 1.1;
          if (this.searchT <= 0) {
            this.state = 'patrol';
            this.lured = false;
          }
        }
        break;
      }
      case 'chase': {
        const d = dist(this.pos.x, this.pos.z, this.target.x, this.target.z);
        const los = ctx.alert.hasLOS(ctx.world, new THREE.Vector3(this.pos.x, 1.55, this.pos.z), new THREE.Vector3(pp.x, 1.2, pp.z));
        if (d > 1.0) {
          const dirX = this.target.x - this.pos.x, dirZ = this.target.z - this.pos.z;
          const l = Math.hypot(dirX, dirZ);
          speed = GUARD.CHASE;
          moveX = (dirX / l) * speed * dt;
          moveZ = (dirZ / l) * speed * dt;
          faceYaw = Math.atan2(dirX, -dirZ);
        }
        // tir
        if (los && d < GUARD.SHOOT_RANGE && this.flinch <= 0 && !ctx.player.dead) {
          faceYaw = Math.atan2(pp.x - this.pos.x, -(pp.z - this.pos.z));
          if (this.fireT <= 0) {
            this.fireT = GUARD.FIRE_INTERVAL * (0.75 + Math.random() * 0.5);
            this.shootAt(ctx, pp);
          }
        }
        if (!los && d < 1.5) {
          this.state = 'search';
          this.searchT = GUARD.SEARCH_TIME;
        }
        break;
      }
      case 'search': {
        this.searchT -= dt;
        faceYaw = this.yaw + Math.sin(ctx.time * 1.4 + this.waypoint) * 1.2;
        // oscille autour de la dernière position connue
        const wob = Math.sin(ctx.time * 0.7) * 3;
        const tx = this.target.x + Math.cos(ctx.time * 0.9) * wob;
        const tz = this.target.z + Math.sin(ctx.time * 0.9) * wob;
        const d = dist(this.pos.x, this.pos.z, tx, tz);
        if (d > 1.4) {
          const dirX = tx - this.pos.x, dirZ = tz - this.pos.z;
          const l = Math.hypot(dirX, dirZ);
          moveX = (dirX / l) * GUARD.WALK * dt;
          moveZ = (dirZ / l) * GUARD.WALK * dt;
          speed = GUARD.WALK;
          faceYaw = Math.atan2(dirX, -dirZ);
        }
        if (this.searchT <= 0) {
          this.state = 'patrol';
        }
        break;
      }
      default: break;
    }

    // contournement d'obstacle : si bloqué, pas de côté
    if (this.sidestep > 0) {
      this.sidestep -= dt;
      const perp = this.sidestepDir;
      const l = Math.hypot(moveX, moveZ) || 1;
      const nx = -moveZ / l, nz = moveX / l;
      moveX = nx * perp * speed * dt;
      moveZ = nz * perp * speed * dt;
    }
    if (speed > 0) {
      const desired = Math.hypot(moveX, moveZ);
      const mv = this.moveKcc(ctx, moveX, -9.81 * dt * dt, moveZ);
      const done = Math.hypot(mv.x, mv.z);
      if (done < desired * 0.35) {
        this.stuckT += dt;
        if (this.stuckT > 0.25 && this.sidestep <= 0) {
          this.sidestep = 0.55;
          this.sidestepDir = Math.random() > 0.5 ? 1 : -1;
          this.stuckT = 0;
        }
      } else {
        this.stuckT = Math.max(0, this.stuckT - dt * 2);
      }
    } else {
      this.moveKcc(ctx, 0, -9.81 * dt * dt, 0);
    }

    this.yaw = lerp(this.yaw, faceYaw, clamp(dt * 10, 0, 1));
  }

  private shootAt(ctx: Ctx, target: THREE.Vector3) {
    ctx.audio.enemyShot();
    this.muzzle.intensity = 20;
    setTimeout(() => { this.muzzle.intensity = 0; }, 60);
    const from = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.5, 1.35, this.pos.z - Math.cos(this.yaw) * 0.5);
    const dir = new THREE.Vector3(target.x - from.x, 1.1 - from.y, target.z - from.z).normalize();
    dir.x += (Math.random() - 0.5) * GUARD.INACCURACY;
    dir.z += (Math.random() - 0.5) * GUARD.INACCURACY;
    dir.normalize();
    ctx.fx.fire(from, dir, 'guard');
  }

  private baseYaw() {
    const a = this.points[this.waypoint];
    const b = this.points[(this.waypoint + 1) % this.points.length];
    return Math.atan2(b.x - a.x, -(b.z - a.z));
  }

  protected syncExtra(alpha: number) {
    this.fan.position.set(this.mesh.position.x, 0.07, this.mesh.position.z);
    this.fan.rotation.y = this.mesh.rotation.y;
    if (this.dead) {
      // chute au sol
      const t = clamp((this.deadAnimT ?? 0) + 0.06, 0, 1);
      this.deadAnimT = t;
      this.mesh.rotation.z = t * Math.PI / 2;
      this.mesh.position.y = -t * 0.35;
    }
    void alpha;
  }
  private deadAnimT = 0;

  /** Couleur de l'éventail selon l'état. */
  updateFan() {
    if (this.dead) return;
    let color = 0x52ff9a;
    if (this.state === 'chase') color = 0xff4757;
    else if (this.suspicion >= 0.35) color = 0xffb347;
    else if (this.state === 'investigate' || this.state === 'search') color = 0xff2d78;
    this.fanMat.color.setHex(color);
    this.fanMat.opacity = 0.09 + clamp(this.suspicion, 0, 1) * 0.14;
  }
}

// --------------------------------------------------------------------------- caméra de surveillance

export class SurveillanceCam implements Observer {
  pos = new THREE.Vector3();
  yaw = 0;
  viewDist = CAM.VIEW_DIST;
  fov = CAM.FOV;
  suspicion = 0;
  confirmedAt = -100;
  disabled = false;
  isCam = true;
  gainRate = CAM.GAIN;
  private t = Math.random() * 10;
  mesh: THREE.Group;
  cone: THREE.Mesh;
  coneMat: THREE.MeshBasicMaterial;
  beeped = false;

  constructor(private def: { id: string; x: number; z: number; y: number; baseYaw: number; sweep: number }, ctx: Ctx) {
    this.pos.set(def.x, def.y, def.z);
    this.yaw = def.baseYaw;
    this.mesh = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.8, roughness: 0.35 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.55), poleMat);
    head.castShadow = true;
    this.mesh.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0x000, emissive: 0xff4757, emissiveIntensity: 2 }));
    eye.position.set(0, 0, -0.3);
    this.mesh.add(eye);
    this.mesh.position.set(def.x, def.y, def.z);
    ctx.scene.add(this.mesh);
    const fan = makeVisionFan(CAM.VIEW_DIST, CAM.FOV, 0xff4757);
    this.cone = fan.mesh;
    this.coneMat = fan.mat;
    this.coneMat.opacity = 0.1;
    ctx.scene.add(this.cone);
    ctx.alert.attach(this);
  }

  update(dt: number, ctx: Ctx) {
    this.t += dt;
    if (this.disabled) {
      this.coneMat.color.setHex(0x3a4650);
      this.coneMat.opacity = 0.04;
      (this.mesh.children[1] as THREE.Mesh).visible = false;
      return;
    }
    (this.mesh.children[1] as THREE.Mesh).visible = true;
    this.yaw = this.def.baseYaw + Math.sin(this.t * 0.55) * this.def.sweep;
    this.cone.position.set(this.pos.x, 0.08, this.pos.z);
    this.cone.rotation.y = this.yaw;
    this.coneMat.color.setHex(this.suspicion > 0.35 ? 0xff4757 : 0xff8f6b);
    this.coneMat.opacity = 0.09 + clamp(this.suspicion, 0, 1) * 0.2;
    if (this.suspicion > 0.35 && !this.beeped) {
      this.beeped = true;
      ctx.audio.uiOpen();
    }
    if (this.suspicion <= 0.2) this.beeped = false;
  }

  disable(ctx: Ctx) {
    this.disabled = true;
    this.suspicion = 0;
    ctx.audio.implantDeny();
    setTimeout(() => { this.disabled = false; }, CAM.DISABLE_TIME * 1000);
  }
}

// --------------------------------------------------------------------------- civils

export class Civilian extends Actor {
  private wp: { x: number; z: number }[];
  private idx = 0;
  private fleeT = 0;
  witness = false;
  witnessT = 0;
  sawCrime = false;
  crimePos = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private shirt: THREE.Mesh;

  constructor(points: { x: number; z: number }[], ctx: Ctx) {
    super('civ');
    this.wp = points;
    this.initPhysics(ctx, points[0].x, points[0].z, 1.0);
    this.hp = 60;
    const g = new THREE.Group();
    const hue = 0.5 + Math.random() * 0.4;
    const color = new THREE.Color().setHSL(hue, 0.4, 0.45);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.78, 6, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    body.position.y = 0.78;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.6 }));
    head.position.y = 1.45;
    g.add(head);
    this.shirt = body;
    this.mesh = g;
    this.yaw = Math.random() * Math.PI * 2;
    ctx.scene.add(g);
  }

  panic(from: THREE.Vector3) {
    if (this.dead) return;
    this.fleeT = Math.max(this.fleeT, 5 + Math.random() * 3);
    this.dir.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    if (this.dir.lengthSq() < 0.01) this.dir.set(1, 0, 0);
  }

  protected update(dt: number, ctx: Ctx) {
    if (this.dead) return;
    this.flinch = Math.max(0, this.flinch - dt);
    let mx = 0, mz = 0;
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      mx = this.dir.x * 4.4 * dt;
      mz = this.dir.z * 4.4 * dt;
      this.yaw = Math.atan2(mx, -mz);
    } else {
      const wp = this.wp[this.idx];
      const d = dist(this.pos.x, this.pos.z, wp.x, wp.z);
      if (d < 0.8) {
        this.idx = (this.idx + 1) % this.wp.length;
        this.pause = 1 + Math.random() * 3;
      } else if (this.pause > 0) {
        this.pause -= dt;
      } else {
        const dx = (wp.x - this.pos.x) / d, dz = (wp.z - this.pos.z) / d;
        mx = dx * 1.2 * dt;
        mz = dz * 1.2 * dt;
        this.yaw = Math.atan2(dx, -dz);
      }
    }
    this.moveKcc(ctx, mx, -9.81 * dt * dt, mz);
    // fuite si alerte confirmée à proximité
    if (ctx.alert.level(ctx) === 'confirmé' && dist(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z) < 26) {
      this.panic(ctx.player.pos);
    }
  }
  private pause = 0;

  kill(ctx: Ctx, _from: THREE.Vector3, _gore: 'bullet' | 'impact' | 'none' = 'bullet') {
    super.kill(ctx, _from, _gore);
    this.deadAt = ctx.time;
    (this.shirt.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.5);
  }

  /** Réinitialisation après un point de reprise. */
  teleportCiv() {
    const p = this.wp[0];
    this.pos.set(p.x, 1, p.z);
    this.prev.copy(this.pos);
    this.body.setTranslation({ x: p.x, y: 1, z: p.z }, true);
    this.deadAnimT = 0;
    this.mesh.rotation.z = 0;
    this.mesh.position.y = 0;
    this.fleeT = 0;
    this.idx = 0;
    this.sawCrime = false;
  }

  protected syncExtra(_alpha: number) {
    if (this.dead) {
      const t = clamp((this.deadAnimT ?? 0) + 0.06, 0, 1);
      this.deadAnimT = t;
      this.mesh.rotation.z = t * Math.PI / 2;
      this.mesh.position.y = -t * 0.35;
    }
  }
  private deadAnimT = 0;
}

// --------------------------------------------------------------------------- PNJ

export class Npc extends Actor {
  private head!: THREE.Mesh;
  constructor(x: number, z: number, ctx: Ctx, private color: number) {
    super('npc');
    this.initPhysics(ctx, x, z, 1.0);
    this.hp = 9999;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
    body.position.y = 0.8;
    body.castShadow = true;
    g.add(body);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.55 }));
    this.head.position.y = 1.5;
    g.add(this.head);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.2), new THREE.MeshStandardMaterial({ color: 0x000, emissive: this.color, emissiveIntensity: 2 }));
    mark.position.y = 1.72;
    g.add(mark);
    this.mesh = g;
    ctx.scene.add(g);
  }

  teleport(x: number, z: number, faceYaw: number) {
    this.pos.set(x, 1, z);
    this.prev.copy(this.pos);
    this.yaw = faceYaw;
    this.prevYaw = faceYaw;
    this.body.setTranslation({ x, y: 1, z }, true);
  }

  protected update(dt: number, ctx: Ctx) {
    // fait face au joueur quand il est proche
    const d = dist(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z);
    if (d < 7) {
      const ty = Math.atan2(ctx.player.pos.x - this.pos.x, -(ctx.player.pos.z - this.pos.z));
      this.yaw = lerp(this.yaw, ty, clamp(dt * 6, 0, 1));
    }
    this.moveKcc(ctx, 0, -9.81 * dt * dt, 0);
  }
}
