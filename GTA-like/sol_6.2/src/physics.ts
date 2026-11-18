import R from '@dimforge/rapier3d-compat';
import { buildings, clamp, distance, elevation, gates, inRect, navigation, vehicleExclusions, walls, type Point, type Rect } from './level';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const rotation = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
export const step = 1 / 60;
const foot = new R.Cuboid(.39, .65, .39);
const car = new R.Cuboid(.98, .54, 1.96);

export class Physics {
  private readonly world = new R.World({ x: 0, y: -9.81, z: 0 });
  private readonly doors = new Map<string, R.Collider>();
  private readonly parked: R.Collider;
  private graph: { to: number; cost: number }[][] = [];

  constructor() {
    this.world.timestep = step;
    for (const b of buildings) this.solid(b.area, b.height);
    for (const w of walls) this.solid(w.area, w.height, w.base);
    for (const g of gates) this.doors.set(g.id, this.solid(g.area, 2.35));
    this.parked = this.world.createCollider(R.ColliderDesc.cuboid(.98, .54, 1.96).setEnabled(false));
    this.world.step();
    this.rebuild();
  }

  private solid([x, z, w, d]: Rect, height: number, base = elevation(x, z)) {
    return this.world.createCollider(R.ColliderDesc.cuboid(w / 2, height / 2, d / 2).setTranslation(x, base + height / 2, z));
  }

  setParked(at: Point, yaw: number, enabled: boolean) {
    this.parked.setEnabled(enabled);
    this.parked.setTranslation({ x: at[0], y: elevation(...at) + .55, z: at[1] });
    this.parked.setRotation(rotation(yaw));
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  addParked(at: Point, yaw: number) {
    this.world.createCollider(R.ColliderDesc.cuboid(.98, .54, 1.96)
      .setTranslation(at[0], elevation(...at) + .55, at[1]).setRotation(rotation(yaw)));
  }

  setGate(id: string, open: boolean) {
    const collider = this.doors.get(id);
    if (!collider || collider.isEnabled() === !open) return;
    collider.setEnabled(!open);
    this.world.step();
    this.rebuild();
  }

  tick() { this.world.step(); }

  private pos(at: Point, height: number) { return { x: at[0], y: elevation(...at) + height, z: at[1] }; }

  private collide(at: Point, yaw: number, driving: boolean, ignoreCar = false) {
    const shape = driving ? car : foot;
    const filter = ignoreCar || driving ? this.parked : undefined;
    return this.world.intersectionWithShape(this.pos(at, driving ? .62 : .73), rotation(yaw), shape, undefined, undefined, filter) !== null;
  }

  canStand(at: Point) { return !this.collide(at, 0, false, false); }
  canTurn(at: Point, yaw: number) { return !this.collide(at, yaw, true); }

  move(at: Point, dx: number, dz: number, yaw = 0, driving = false): { at: Point; hit: boolean } {
    if (Math.abs(dx) + Math.abs(dz) < .000001) return { at, hit: false };
    const shape = driving ? car : foot;
    const height = driving ? .62 : .73;
    const from = this.pos(at, height);
    const test = (start: typeof from, x: number, z: number) => {
      if (driving && vehicleExclusions.some(area => inRect(start.x + x, start.z + z, area))) return 0;
      const dy = elevation(start.x + x, start.z + z) - elevation(start.x, start.z);
      if (Math.abs(dy) > .86) return 0;
      const hit = this.world.castShape(start, rotation(yaw), { x, y: dy, z }, shape,
        .017, 1, false, undefined, undefined, driving ? this.parked : undefined);
      return hit ? clamp(hit.time_of_impact - .006, 0, 1) : 1;
    };
    const ratio = test(from, dx, dz);
    let current: Point = [at[0] + dx * ratio, at[1] + dz * ratio];
    if (ratio < .999 && !driving) {
      const start = this.pos(current, height);
      const sx = dx * (1 - ratio), sz = dz * (1 - ratio);
      const rx = test(start, sx, 0), rz = test(start, 0, sz);
      current = Math.abs(sx * rx) >= Math.abs(sz * rz) ? [current[0] + sx * rx, current[1]] : [current[0], current[1] + sz * rz];
    }
    return { at: current, hit: ratio < .999 };
  }

  ray(from: Point, to: Point, fromHeight = 1.18, toHeight = 1.18, ignoreCar = false) {
    const o = this.pos(from, fromHeight), t = this.pos(to, toHeight);
    const len = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
    if (len < .001) return 1;
    const dir = { x: (t.x - o.x) / len, y: (t.y - o.y) / len, z: (t.z - o.z) / len };
    const hit = this.world.castRay(new R.Ray(o, dir), len, true, undefined, undefined, ignoreCar ? this.parked : undefined);
    return hit ? hit.timeOfImpact / len : 1;
  }

  private rebuild() {
    this.graph = navigation.map(() => []);
    for (let i = 0; i < navigation.length; i++) {
      for (let j = i + 1; j < navigation.length; j++) {
        const a = navigation[i], b = navigation[j], d = distance(a, b);
        if (d > 23 || this.ray(a, b, .88, .88, true) < .99) continue;
        this.graph[i].push({ to: j, cost: d });
        this.graph[j].push({ to: i, cost: d });
      }
    }
  }

  findRoute(from: Point, to: Point): Point[] {
    if (this.ray(from, to, .85, .85, true) >= .99) return [to];
    const nearby = (point: Point) => navigation.map((at, index) => ({ index, cost: distance(at, point) }))
      .filter(n => n.cost < 27).sort((a, b) => a.cost - b.cost).slice(0, 8)
      .filter(n => this.ray(point, navigation[n.index], .84, .84, true) >= .99);
    const exits = new Map(nearby(to).map(n => [n.index, n.cost]));
    if (!exits.size) return [];
    const costs = this.graph.map(() => Infinity), prev = this.graph.map(() => -1);
    const open = new Set<number>();
    for (const start of nearby(from)) {
      costs[start.index] = start.cost;
      open.add(start.index);
    }
    let best = Infinity, finish = -1;
    while (open.size) {
      const current = [...open].reduce((a, b) => costs[a] <= costs[b] ? a : b);
      if (costs[current] >= best) break;
      open.delete(current);
      const exit = exits.get(current);
      if (exit !== undefined && costs[current] + exit < best) {
        best = costs[current] + exit;
        finish = current;
      }
      for (const next of this.graph[current]) {
        const c = costs[current] + next.cost;
        if (c >= costs[next.to]) continue;
        costs[next.to] = c;
        prev[next.to] = current;
        open.add(next.to);
      }
    }
    if (finish === -1) return [];
    const path: Point[] = [to];
    for (let i = finish; i !== -1; i = prev[i]) path.unshift(navigation[i]);
    return path;
  }
}
