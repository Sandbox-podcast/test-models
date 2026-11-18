import R from '@dimforge/rapier3d-compat';
import { buildings, clamp, crossingSurfaces, distance, elevation, foundation, gates, inRect, navigation, vehicleExclusions, walls, type Point, type Rect } from './level';
import { footprint, furniture } from './furniture';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const rotation = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
export const step = 1 / 60;
const foot = new R.Cuboid(.39, .65, .39);
const car = new R.Cuboid(.98, .54, 1.96);
type Obstacle = { id: string; type: 'structure' | 'furniture' | 'vehicle' };
export type Contact = Obstacle & { normal: Point; point: Point };
type Motion = { at: Point; hit: boolean; contact?: Contact };

export class Physics {
  private readonly world = new R.World({ x: 0, y: -9.81, z: 0 });
  private readonly doors = new Map<string, R.Collider>();
  private readonly parked: R.Collider;
  private readonly props = new Map<string, R.Collider>();
  private readonly vehicles = new Map<string, R.Collider>();
  private readonly obstacle = new Map<number, Obstacle>();
  private readonly support = new Set<number>();
  private graphDirty = true;
  private graph: { to: number; cost: number }[][] = [];

  constructor() {
    this.world.timestep = step;
    for (const b of buildings) this.solid(b.id, b.area, b.height, foundation(b.area));
    for (const [i, w] of walls.entries()) this.solid('wall-' + i, w.area, w.height, w.base);
    for(const [id, surface] of Object.entries(crossingSurfaces)){
      // Kinematic actors follow the sampled height of the matching surface.
      // The three supports remain solid for rays, including under an invisible deck.
      this.support.add(this.solid(id,surface.area,surface.height,surface.base).handle);
    }
    for (const prop of furniture) this.addProp(prop.id, footprint(prop), prop.size[1]);
    for (const g of gates) this.doors.set(g.id, this.solid(g.id, g.area, 2.35));
    this.parked = this.world.createCollider(R.ColliderDesc.cuboid(.98, .54, 1.96).setEnabled(false));
    this.obstacle.set(this.parked.handle, { id:'player-car', type:'vehicle' });
    this.world.step();
  }

  private solid(id: string, [x, z, w, d]: Rect, height: number, base = elevation(x, z), type: Obstacle['type'] = 'structure') {
    const collider = this.world.createCollider(R.ColliderDesc.cuboid(w / 2, height / 2, d / 2).setTranslation(x, base + height / 2, z));
    this.obstacle.set(collider.handle, { id, type });
    return collider;
  }

  addProp(id: string, area: Rect, height: number) {
    this.props.set(id, this.solid(id, area, height, undefined, 'furniture'));
    this.graphDirty = true;
  }

  setProp(id: string, enabled: boolean) {
    const collider = this.props.get(id);
    if (!collider || collider.isEnabled() === enabled) return;
    collider.setEnabled(enabled);
    this.graphDirty = true;
  }

  placeProp(id:string,at:Point,height:number) {
    this.props.get(id)?.setTranslation(this.pos(at,height*.5));
    this.graphDirty=true;
  }

  setParked(at: Point, yaw: number, enabled: boolean) {
    this.parked.setEnabled(enabled);
    this.parked.setTranslation({ x: at[0], y: elevation(...at) + .55, z: at[1] });
    this.parked.setRotation(rotation(yaw));
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  addVehicle(id: string, at: Point, yaw: number) {
    const collider = this.world.createCollider(R.ColliderDesc.cuboid(.98, .54, 1.96)
      .setTranslation(at[0], elevation(...at) + .55, at[1]).setRotation(rotation(yaw)));
    this.vehicles.set(id, collider);
    this.obstacle.set(collider.handle, { id, type:'vehicle' });
  }

  placeVehicle(id: string, at: Point, yaw: number, enabled: boolean) {
    const collider = this.vehicles.get(id);
    if (!collider) return;
    collider.setEnabled(enabled);
    if (!enabled) return;
    collider.setTranslation(this.pos(at, .55));
    collider.setRotation(rotation(yaw));
  }

  setGate(id: string, open: boolean) {
    const collider = this.doors.get(id);
    if (!collider || collider.isEnabled() === !open) return;
    collider.setEnabled(!open);
    this.world.step();
    this.graphDirty = true;
  }

  tick() { this.world.step(); }

  private pos(at: Point, height: number) { return { x: at[0], y: elevation(...at) + height, z: at[1] }; }
  private readonly obstacleFilter=(collider:R.Collider)=>!this.support.has(collider.handle);
  private readonly walkingFilter=(collider:R.Collider)=>this.obstacleFilter(collider)&&this.obstacle.get(collider.handle)?.type!=='vehicle';

  private collide(at: Point, yaw: number, driving: boolean, ignoreCar = false) {
    const shape = driving ? car : foot;
    const filter = ignoreCar || driving ? this.parked : undefined;
    return this.world.intersectionWithShape(this.pos(at, driving ? .62 : .73), rotation(yaw), shape,
      undefined, undefined, filter, undefined, this.obstacleFilter) !== null;
  }

  canStand(at: Point) { return !this.collide(at, 0, false, false); }
  canTurn(at: Point, yaw: number) { return !this.collide(at, yaw, true); }

  move(at: Point, dx: number, dz: number, yaw = 0, driving = false, ignoreVehicle?: string): Motion {
    if (Math.abs(dx) + Math.abs(dz) < .000001) return { at, hit: false };
    const shape = driving ? car : foot;
    const height = driving ? .62 : .73;
    const from = this.pos(at, height);
    const excluded = ignoreVehicle ? this.vehicles.get(ignoreVehicle) : driving ? this.parked : undefined;
    const test = (start: typeof from, x: number, z: number) => {
      if (driving && vehicleExclusions.some(area => inRect(start.x + x, start.z + z, area))) return {ratio:0};
      const dy = elevation(start.x + x, start.z + z) - elevation(start.x, start.z);
      if (Math.abs(dy) > .86) return {ratio:0};
      const hit = this.world.castShape(start, rotation(yaw), { x, y: dy, z }, shape,
        .017, 1, false, undefined, undefined, excluded, undefined, this.obstacleFilter);
      return {ratio:hit ? clamp(hit.time_of_impact - .006, 0, 1) : 1, hit};
    };
    const {ratio, hit} = test(from, dx, dz);
    let current: Point = [at[0] + dx * ratio, at[1] + dz * ratio];
    if (ratio < .999 && !driving) {
      const start = this.pos(current, height);
      const sx = dx * (1 - ratio), sz = dz * (1 - ratio);
      const rx = test(start, sx, 0).ratio, rz = test(start, 0, sz).ratio;
      current = Math.abs(sx * rx) >= Math.abs(sz * rz) ? [current[0] + sx * rx, current[1]] : [current[0], current[1] + sz * rz];
    }
    if (!hit) return { at: current, hit: ratio < .999 };
    const {x:nx, z:nz} = hit.normal1;
    const length = Math.hypot(nx,nz);
    const normal: Point = length > .01 ? [nx/length,nz/length] : [0,0];
    const dot = dx*normal[0] + dz*normal[1];
    if (driving && length > .01 && Math.abs(dot) < Math.hypot(dx,dz)*.65) {
      const tx = (dx-dot*normal[0]) * (1-ratio), tz = (dz-dot*normal[1]) * (1-ratio);
      const slide = test(this.pos(current,height),tx,tz).ratio;
      current = [current[0]+tx*slide,current[1]+tz*slide];
    }
    const obstacle = this.obstacle.get(hit.collider.handle);
    return { at: current, hit: true, contact: obstacle && {
      ...obstacle, normal, point:[hit.witness1.x,hit.witness1.z],
    } };
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
    this.graphDirty = false;
    this.graph = navigation.map(() => []);
    for (let i = 0; i < navigation.length; i++) {
      for (let j = i + 1; j < navigation.length; j++) {
        const a = navigation[i], b = navigation[j], d = distance(a, b);
        if(d>23||!this.walkable(a,b)) continue;
        this.graph[i].push({ to: j, cost: d });
        this.graph[j].push({ to: i, cost: d });
      }
    }
  }

  private walkable(from:Point,to:Point) {
    const length=distance(from,to);
    const checks=Math.max(1,Math.ceil(length/1.3));
    let at=this.pos(from,.73);
    for(let i=1;i<=checks;i++){
      const t=i/checks;
      const next=this.pos([from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t],.73);
      const dir={x:next.x-at.x,y:next.y-at.y,z:next.z-at.z};
      if(Math.abs(dir.y)>1.65||this.world.castShape(at,identity,dir,foot,.015,1,false,
        undefined,undefined,undefined,undefined,this.walkingFilter)) return false;
      at=next;
    }
    return true;
  }

  findRoute(from: Point, to: Point): Point[] {
    if (this.graphDirty) this.rebuild();
    if (this.walkable(from,to)) return [to];
    const nearby = (point: Point) => navigation.map((at, index) => ({ index, cost: distance(at, point) }))
      .filter(n => n.cost < 27).sort((a, b) => a.cost - b.cost).slice(0, 8)
      .filter(n => this.walkable(point,navigation[n.index]));
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
