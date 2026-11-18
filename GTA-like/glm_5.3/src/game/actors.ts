/**
 * Acteurs physiques — Lots 1 & 2.
 * Actor : corps cinématique + contrôleur de personnage Rapier + interpolation
 * d'affichage. Player : déplacement ZQSD/WASD, visée souris. Car : conduite
 * arcade (forces + amortissement latéral), entrée/sortie sur E côté dégagé.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx } from './ctx';
import { G_ACTOR, G_PLAYER, G_CAR, G_RAY, PLAYER, CAR, clamp, lerp, lerpAngle } from './defs';

export abstract class Actor {
  pos = new THREE.Vector3();
  prev = new THREE.Vector3();
  yaw = 0;
  prevYaw = 0;
  hp = 100;
  maxHp = 100;
  dead = false;
  deadAt = 0;
  mesh!: THREE.Group;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  cc!: RAPIER.KinematicCharacterController;
  grounded = false;
  /** 0 = pas d'étourdissement ; > 0 : secondes restantes. */
  stun = 0;
  flinch = 0;

  constructor(public readonly kind: 'player' | 'guard' | 'civ' | 'npc') {}

  initPhysics(ctx: Ctx, x: number, z: number, y = 1.0) {
    this.pos.set(x, y, z);
    this.prev.copy(this.pos);
    this.body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z),
    );
    const groups = this.kind === 'player' ? G_PLAYER : G_ACTOR;
    this.collider = ctx.world.createCollider(
      RAPIER.ColliderDesc.capsule(PLAYER.HALF_H, PLAYER.RADIUS)
        .setTranslation(0, 0, 0)
        .setCollisionGroups(groups),
      this.body,
    );
    this.cc = ctx.world.createCharacterController(0.06);
    this.cc.enableAutostep(0.5, 0.25, true);
    this.cc.enableSnapToGround(0.5);
    this.cc.setApplyImpulsesToDynamicBodies(true);
    // seul le joueur pousse les objets dynamiques ; les PNJ ne déplacent pas les véhicules
    this.cc.setCharacterMass(this.kind === 'player' ? 80 : 0);
    this.cc.setMaxSlopeClimbAngle(55 * (Math.PI / 180));
    this.cc.setSlideEnabled(true);
  }

  /** Déplacement voulu → collision KCC → position cinématique. */
  moveKcc(ctx: Ctx, dx: number, dy: number, dz: number) {
    this.cc.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz }, undefined, this.kind === 'player' ? G_PLAYER : G_ACTOR);
    const mv = this.cc.computedMovement();
    this.grounded = this.cc.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    return mv;
  }

  step(dt: number, ctx: Ctx) { this.update(dt, ctx); }
  protected abstract update(dt: number, ctx: Ctx): void;

  /** Après world.step : lit la position simulée pour l'interpolation. */
  postStep() {
    if (this.dead && this.kind !== 'player') return;
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;
    const t = this.body.translation();
    this.pos.set(t.x, t.y, t.z);
  }

  sync(alpha: number) {
    this.mesh.position.lerpVectors(this.prev, this.pos, alpha);
    this.mesh.rotation.y = lerpAngle(this.prevYaw, this.yaw, alpha);
    this.syncExtra(alpha);
  }
  protected syncExtra(_alpha: number) {}

  damage(n: number, ctx: Ctx, _from: THREE.Vector3, _gore: 'bullet' | 'impact' | 'none' = 'bullet') {
    if (this.dead) return;
    this.hp -= n;
    this.flinch = 0.25;
    if (this.hp <= 0) this.kill(ctx, _from, _gore);
  }

  kill(_ctx: Ctx, _from: THREE.Vector3, _gore: 'bullet' | 'impact' | 'none' = 'bullet') {
    this.dead = true;
    this.hp = 0;
  }
}

// --------------------------------------------------------------------------- joueur

export class Player extends Actor {
  inCar = false;
  speed = 0;
  aim = new THREE.Vector3();
  aimYaw = 0;
  hasChip = false;
  ammo = PLAYER.MAG;
  reserve = 36;
  fireT = 0;
  reloadT = 0;
  gunMesh!: THREE.Mesh;
  muzzleLight!: THREE.PointLight;

  constructor() { super('player'); }

  init(ctx: Ctx, x: number, z: number) {
    this.initPhysics(ctx, x, z, 1.0);
    this.buildMesh(ctx);
    this.hp = PLAYER.HP;
  }

  private buildMesh(ctx: Ctx) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d4d5f, roughness: 0.7 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x1d2a35, roughness: 0.65 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER.RADIUS, PLAYER.HALF_H * 2, 6, 12), mat);
    body.position.y = 0.78;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8a97a8, roughness: 0.5 }));
    head.position.y = 1.5;
    g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.12), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 1.6 }));
    visor.position.set(0, 1.5, -0.16);
    g.add(visor);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2d78, emissiveIntensity: 1.2 }));
    stripe.position.set(0, 1.12, 0);
    g.add(stripe);
    // bras + pistolet
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 4, 8), jacket);
    arm.position.set(0.24, 1.05, -0.22);
    arm.rotation.x = Math.PI / 2.4;
    g.add(arm);
    this.gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x11161c, metalness: 0.85, roughness: 0.3 }));
    this.gunMesh.position.set(0.24, 1.06, -0.5);
    g.add(this.gunMesh);
    this.muzzleLight = new THREE.PointLight(0xffe6b0, 0, 7, 2);
    this.muzzleLight.position.set(0.24, 1.06, -0.7);
    g.add(this.muzzleLight);
    this.mesh = g;
    ctx.scene.add(g);
  }

  protected update(dt: number, ctx: Ctx) {
    this.fireT = Math.max(0, this.fireT - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    this.stun = Math.max(0, this.stun - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = PLAYER.MAG - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    if (this.inCar) {
      this.pos.copy(ctx.car.pos);
      this.speed = ctx.car.speed;
      // le corps reste hors collision, au-dessus de la scène
      this.body.setNextKinematicTranslation({ x: this.pos.x, y: 50, z: this.pos.z });
      return;
    }
    // déplacement
    const inp = ctx.input;
    let mx = 0, mz = 0;
    if (!ctx.cinematic && this.stun <= 0) {
      if (inp.isDown('forward')) mz -= 1;
      if (inp.isDown('back')) mz += 1;
      if (inp.isDown('left')) mx -= 1;
      if (inp.isDown('right')) mx += 1;
    }
    const len = Math.hypot(mx, mz);
    const running = inp.isDown('sprint') && this.flinch <= 0;
    let sp = running ? PLAYER.RUN : PLAYER.WALK;
    if (this.flinch > 0) sp *= 0.55;
    let dx = 0, dz = 0;
    if (len > 0) {
      dx = (mx / len) * sp * dt;
      dz = (mz / len) * sp * dt;
    }
    this.speed = len > 0 ? sp : 0;
    this.moveKcc(ctx, dx, -9.81 * dt * dt, dz);
    // visée : yaw vers le point visé
    this.yaw = this.aimYaw;
  }

  startReload() {
    if (this.reloadT <= 0 && this.ammo < PLAYER.MAG && this.reserve > 0) this.reloadT = PLAYER.RELOAD;
  }

  postStep() {
    if (this.inCar) { this.prev.copy(this.pos); return; }
    super.postStep();
  }

  muzzleFlash() {
    this.muzzleLight.intensity = 26;
    setTimeout(() => { this.muzzleLight.intensity = 0; }, 55);
  }
}

// --------------------------------------------------------------------------- voiture

export class Car {
  body!: RAPIER.RigidBody;
  mesh!: THREE.Group;
  wheels: THREE.Mesh[] = [];
  pos = new THREE.Vector3();
  prev = new THREE.Vector3();
  quat = new THREE.Quaternion();
  prevQuat = new THREE.Quaternion();
  yaw = 0;
  driven = false;
  speed = 0;         // m/s signés (avant +)
  headlights!: THREE.SpotLight;
  private taillights!: THREE.Mesh;
  private reverseLight!: THREE.Mesh;

  init(ctx: Ctx, x: number, z: number, yaw: number) {
    this.yaw = yaw;
    this.body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 0.62, z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setLinearDamping(0.06)
        .setAngularDamping(1.5)
        .setCanSleep(false),
    );
    ctx.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.95, 0.42, 2.05)
        .setTranslation(0, -0.12, 0)
        .setCollisionGroups(G_CAR)
        .setFriction(0.04)
        .setRestitution(0.15),
      this.body,
    );
    this.body.setAdditionalMass(1150, true);
    this.buildMesh(ctx);
    this.pos.set(x, 0.62, z);
    this.prev.copy(this.pos);
  }

  private buildMesh(ctx: Ctx) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: 0x1e4d4a, metalness: 0.55, roughness: 0.42 });
    const cabin = new THREE.MeshStandardMaterial({ color: 0x0c1116, metalness: 0.4, roughness: 0.3 });
    const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.2), paint);
    bodyBox.position.y = 0.52;
    bodyBox.castShadow = true;
    g.add(bodyBox);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.5, 2.0), cabin);
    cab.position.set(0, 1.02, 0.15);
    g.add(cab);
    const underglow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 3.6), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 2.2 }));
    underglow.position.y = 0.24;
    g.add(underglow);
    // feux
    const hlMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff3d0, emissiveIntensity: this.driven ? 3 : 0.6 });
    for (const sx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), hlMat);
      hl.position.set(sx, 0.62, -2.1);
      g.add(hl);
    }
    this.taillights = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x1a0508, emissive: 0xff2d3a, emissiveIntensity: 1.6 }));
    this.taillights.position.set(0, 0.66, 2.1);
    g.add(this.taillights);
    this.reverseLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0 }));
    this.reverseLight.position.set(0, 0.66, 2.1);
    g.add(this.reverseLight);
    // roues
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.9 });
    for (const [wx, wz] of [[-0.88, -1.32], [0.88, -1.32], [-0.88, 1.32], [0.88, 1.32]] as [number, number][]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.34, wz);
      wheel.castShadow = true;
      this.wheels.push(wheel);
      g.add(wheel);
    }
    // phare spot
    this.headlights = new THREE.SpotLight(0xfff0cf, 90, 34, 0.5, 0.45, 1.0);
    this.headlights.position.set(0, 0.9, -1.9);
    this.headlights.target.position.set(0, 0, -12);
    g.add(this.headlights);
    g.add(this.headlights.target);
    this.mesh = g;
    ctx.scene.add(g);
  }

  forward(): THREE.Vector3 { return new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(): THREE.Vector3 { return new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  update(dt: number, ctx: Ctx) {
    const v = this.body.linvel();
    const f = this.forward(), r = this.right();
    let fwdSpeed = v.x * f.x + v.z * f.z;
    let latSpeed = v.x * r.x + v.z * r.z;
    const inp = ctx.input;

    if (this.driven && !ctx.cinematic) {
      let throttle = 0;
      if (inp.isDown('forward')) throttle += 1;
      if (inp.isDown('back')) throttle -= 1;
      let steer = 0;
      if (inp.isDown('left')) steer += 1;
      if (inp.isDown('right')) steer -= 1;
      const handbrake = inp.isDown('sprint');

      const spd = Math.abs(fwdSpeed);
      // moteur / frein / marche arrière
      let force = 0;
      if (throttle > 0) force = CAR.ENGINE_FORCE * (1 - clamp(spd / CAR.MAX_SPEED, 0, 0.85));
      else if (throttle < 0) {
        force = fwdSpeed > 0.5 ? -CAR.BRAKE_FORCE : -CAR.ENGINE_FORCE * 0.55 * (1 - clamp(spd / (CAR.MAX_SPEED * 0.45), 0, 0.85));
      } else {
        force = -Math.sign(fwdSpeed) * 900; // frein moteur
      }
      if (handbrake) force = -Math.sign(fwdSpeed) * CAR.BRAKE_FORCE * 0.7;
      this.body.resetForces(true);
      this.body.addForce({ x: f.x * force, y: 0, z: f.z * force }, true);

      // direction
      const steerAuthority = clamp(spd / 6, 0, 1) * (1 - clamp(spd / CAR.MAX_SPEED, 0, 0.45));
      const targetYawRate = steer * CAR.STEER_RATE * steerAuthority * Math.sign(fwdSpeed >= 0 ? 1 : -1);
      const av = this.body.angvel();
      this.body.setAngvel({ x: av.x * 0.82, y: lerp(av.y, targetYawRate, clamp(dt * 10, 0, 1)), z: av.z * 0.82 }, true);

      // amortissement latéral (accroche arcade)
      const latKill = clamp(CAR.LATERAL_DAMP * dt, 0, 1) * (handbrake ? 0.35 : 1);
      const newLat = latSpeed * (1 - latKill);
      let nvx = v.x + r.x * (newLat - latSpeed);
      let nvz = v.z + r.z * (newLat - latSpeed);
      // vitesse max
      const hsp = Math.hypot(nvx, nvz);
      if (hsp > CAR.MAX_SPEED) {
        nvx *= CAR.MAX_SPEED / hsp;
        nvz *= CAR.MAX_SPEED / hsp;
      }
      this.body.setLinvel({ x: nvx, y: v.y, z: nvz }, true);

      // anti-retournement
      const up = { x: 0, y: 1, z: 0 };
      const q = this.body.rotation();
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      void up;
      if (upY < 0.55) {
        this.body.setAngvel({ x: av.x * 0.6, y: this.body.angvel().y, z: av.z * 0.6 }, true);
        this.body.addTorque({ x: (1 - upY) * 6000, y: 0, z: 0 }, true);
      }
      // feux
      (this.taillights.material as THREE.MeshStandardMaterial).emissiveIntensity = throttle < 0 ? 3.2 : 1.2;
      (this.reverseLight.material as THREE.MeshStandardMaterial).emissiveIntensity = fwdSpeed < -0.5 ? 2 : 0;
      this.headlights.intensity = 60;
      // roues avant braquées
      const steerVis = steer * 0.42;
      this.wheels[0].rotation.y = steerVis;
      this.wheels[1].rotation.y = steerVis;
    } else {
      this.headlights.intensity = 8;
      const av = this.body.angvel();
      if (Math.abs(v.y) < 0.05 && Math.hypot(v.x, v.z) < 0.3) this.body.sleep();
      else this.body.wakeUp();
      void av;
    }

    void fwdSpeed; void latSpeed;
    this.speed = fwdSpeed;
  }

  postStep() {
    this.prev.copy(this.pos);
    this.prevQuat.copy(this.quat);
    const t = this.body.translation();
    this.pos.set(t.x, t.y, t.z);
    const q = this.body.rotation();
    this.quat.set(q.x, q.y, q.z, q.w);
    this.yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  sync(alpha: number) {
    this.mesh.position.lerpVectors(this.prev, this.pos, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
    // roulis visuel des roues
    const roll = this.speed * 0.02;
    for (const w of this.wheels) w.rotation.x += roll;
  }

  /**
   * Tente de sortir : côté dégagé et vitesse faible. Retourne la position de
   * sortie ou null (les deux côtés sont occupés / trop vite).
   */
  tryExit(ctx: Ctx): THREE.Vector3 | null {
    if (Math.abs(this.speed) > CAR.EXIT_MAX_SPEED) return null;
    const f = this.forward();
    const sides = [
      this.right().multiplyScalar(1.6),
      this.right().multiplyScalar(-1.6),
    ];
    const from = { x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z };
    for (const s of sides) {
      const len = s.length();
      const dir = { x: s.x / len, y: 0, z: s.z / len };
      const ray = new RAPIER.Ray(from, dir);
      const hit = ctx.world.castRay(ray, len + 0.55, true, undefined, G_RAY);
      void f;
      if (hit === null || hit.timeOfImpact > len + 0.3) {
        return new THREE.Vector3(this.pos.x + s.x * 1.15, 1.0, this.pos.z + s.z * 1.15);
      }
    }
    return null;
  }

  teleport(ctx: Ctx, x: number, z: number, yaw: number) {
    this.body.setTranslation({ x, y: 0.7, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
    this.postStep();
    this.prev.copy(this.pos);
    this.prevQuat.copy(this.quat);
    void ctx;
  }
}
