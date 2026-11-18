/**
 * Trafic — bible 05/07 : 2 à 4 véhicules visibles sur l'axe animé des Forges.
 * Véhicules cinématiques sur des tracés (avenue, pont, route du nord) en
 * ping-pong, avec feux, freinage derrière un obstacle et arrêt pendant une
 * poursuite confirmée. Un choc du joueur les marque et les immobilise un temps.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx } from './ctx';
import { G_CAR, clamp, dist, lerp, bodyPos } from './defs';

interface PathNode { x: number; z: number; y: number }
export interface TrafficPathDef { name: string; nodes: PathNode[]; speed: number; loop?: boolean }

/** Construit un véhicule de trafic sur un tracé arbitraire (grande boucle inter-quartiers). */
export function makeTrafficCar(def: TrafficPathDef, ctx: Ctx, color: number, startNode = 0): TrafficCar {
  const car = new TrafficCar(def, ctx, color);
  car.node = startNode;
  return car;
}
export type { PathNode };

export class TrafficCar {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  pos = new THREE.Vector3();
  prev = new THREE.Vector3();
  yaw = 0;
  prevYaw = 0;
  speed = 0;
  node = 0;
  private forwardDir = true;
  private brakeT = 0;
  private marks = 0;
  private wheels: THREE.Mesh[] = [];
  private tailMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;

  constructor(private def: TrafficPathDef, ctx: Ctx, color: number) {
    const n0 = def.nodes[0];
    this.body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(n0.x, n0.y + 0.6, n0.z),
    );
    ctx.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.95, 0.5, 2.1)
        .setTranslation(0, -0.1, 0)
        .setCollisionGroups(G_CAR),
      this.body,
    );
    this.mesh = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
    const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 4.1), paint);
    bodyBox.position.y = 0.5;
    bodyBox.castShadow = true;
    this.mesh.add(bodyBox);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.48, 1.9), new THREE.MeshStandardMaterial({ color: 0x0c1116 }));
    cab.position.set(0, 0.98, 0.1);
    this.mesh.add(cab);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff3d0, emissiveIntensity: 2.4 });
    for (const sx of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.08), this.headMat);
      hl.position.set(sx, 0.6, -2.05);
      this.mesh.add(hl);
    }
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x1a0508, emissive: 0xff2d3a, emissiveIntensity: 1.1 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.08), this.tailMat);
    tail.position.set(0, 0.62, 2.05);
    this.mesh.add(tail);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.9 });
    for (const [wx, wz] of [[-0.86, -1.3], [0.86, -1.3], [-0.86, 1.3], [0.86, 1.3]] as [number, number][]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.33, wz);
      this.wheels.push(w);
      this.mesh.add(w);
    }
    ctx.scene.add(this.mesh);
    this.pos.set(n0.x, n0.y + 0.6, n0.z);
    this.prev.copy(this.pos);
  }

  /** Choc du joueur : marque visible + immobilisation brève. */
  hitStop() {
    this.brakeT = Math.max(this.brakeT, 1.6);
    if (this.marks < 4) {
      this.marks++;
      const mark = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.2, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.9 }),
      );
      mark.position.set((Math.random() - 0.5) * 1.4, 0.45 + Math.random() * 0.3, Math.random() > 0.5 ? -2.08 : 2.08);
      this.mesh.add(mark);
    }
  }

  update(dt: number, ctx: Ctx) {
    const nodes = this.def.nodes;
    const target = nodes[this.node];
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    // objectif de vitesse : nominal, nul si freinage/poursuite/obstacle
    let goal = this.def.speed;
    if (this.brakeT > 0) { this.brakeT -= dt; goal = 0; }
    if (ctx.alert.level(ctx) === 'confirmé') goal = 0;
    if (goal > 0) {
      // obstacle devant ? (piéton sur la chaussée) ; la voiture du joueur,
      // même en face-à-face dans une rue étroite, impose l'arrêt
      const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const ahead = (px: number, pz: number) => {
        const ox = px - this.pos.x, oz = pz - this.pos.z;
        const t = ox * fx + oz * fz;
        if (t < 0 || t > 8) return false;
        const lat = Math.abs(-ox * fz + oz * fx);
        return lat < 1.6;
      };
      const inLane = (px: number, pz: number) => {
        const ox = px - this.pos.x, oz = pz - this.pos.z;
        const t = ox * fx + oz * fz;
        const lat = Math.abs(-ox * fz + oz * fx);
        return t > -3.5 && t < 8 && lat < 1.9;
      };
      if (inLane(ctx.car.pos.x, ctx.car.pos.z)) goal = 0;
      for (const c of ctx.civilians) {
        if (!c.dead && ahead(c.pos.x, c.pos.z)) { goal = 0; break; }
      }
    }
    this.speed = lerp(this.speed, goal, clamp(dt * 2.2, 0, 1));
    this.tailMat.emissiveIntensity = this.speed < goal - 0.5 ? 3.2 : 1.1;
    if (d < 1.2) {
      // nœud atteint : circuit fermé ou demi-tour (le nœud change toujours)
      if (this.def.loop) {
        this.node = (this.node + 1) % nodes.length;
        this.forwardDir = true;
      } else if (this.forwardDir) {
        if (this.node < nodes.length - 1) this.node++;
        else { this.forwardDir = false; this.node--; }
      } else {
        if (this.node > 0) this.node--;
        else { this.forwardDir = true; this.node++; }
      }
    } else if (this.speed > 0.05) {
      // segment en cours : départ selon le sens de parcours (avec bouclage)
      let fromIdx: number;
      if (this.def.loop) fromIdx = (this.node - 1 + nodes.length) % nodes.length;
      else fromIdx = this.forwardDir ? Math.max(0, this.node - 1) : Math.min(nodes.length - 1, this.node + 1);
      const from = nodes[fromIdx];
      const segLen = Math.max(0.01, dist(from.x, from.z, target.x, target.z));
      const progress = clamp(1 - d / segLen, 0, 1);
      const step = Math.min(d, this.speed * dt);
      const nx = this.pos.x + (dx / d) * step;
      const nz = this.pos.z + (dz / d) * step;
      const ny = lerp(from.y, target.y, progress);
      this.yaw = Math.atan2(dx, -dz);
      this.body.setNextKinematicTranslation({ x: nx, y: ny + 0.6, z: nz });
    }
    for (const w of this.wheels) w.rotation.x += this.speed * 0.02;
  }

  postStep() {
    this.prev.copy(this.pos);
    this.prevYaw = this.yaw;
    const [x, y, z] = bodyPos(this.body);
    this.pos.set(x, y, z);
  }

  sync(alpha: number) {
    this.mesh.position.lerpVectors(this.prev, this.pos, alpha);
    let dy = this.yaw - this.prevYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.mesh.rotation.y = this.prevYaw + dy * alpha;
  }
}

/** Les trois axes animés des Forges : avenue, pont + route du nord, navette. */
export function buildTraffic(ctx: Ctx): TrafficCar[] {
  const defs: TrafficPathDef[] = [
    {
      name: 'avenue-est', speed: 11,
      nodes: [{ x: 42, z: 131.2, y: 0 }, { x: 206, z: 131.2, y: 0 }],
    },
    {
      name: 'avenue-ouest', speed: 10,
      nodes: [{ x: 204, z: 135.6, y: 0 }, { x: 40, z: 135.6, y: 0 }],
    },
    {
      name: 'pont', speed: 12,
      nodes: [
        { x: 70, z: 131.2, y: 0 }, { x: 31, z: 129, y: 0.15 }, { x: 29, z: 100, y: 4.1 },
        { x: 29, z: 86, y: 6.2 }, { x: 29, z: 56, y: 5.9 }, { x: 29, z: 26, y: 1.0 },
        { x: 34, z: 14, y: 0 }, { x: 120, z: 14, y: 0 },
      ],
    },
    {
      name: 'nord', speed: 9.5,
      nodes: [{ x: 44, z: 16.8, y: 0 }, { x: 198, z: 16.8, y: 0 }],
    },
  ];
  const colors = [0x51392e, 0x2e3d51, 0x3c3c50, 0x51492e];
  return defs.map((d, i) => new TrafficCar(d, ctx, colors[i]));
}
