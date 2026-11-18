import * as T from 'three';
import { blocks, bounds, buildings, clamp, elevation, gates, inRect, roads, rooms, walls, type Building, type Point, type Rect } from './level';

const unit = new T.BoxGeometry();
const plane = new T.PlaneGeometry(1, 1);
const materialCache = new Map<string, T.Material>();
const standard = (color: string, emissive = false) => {
  const key = color + emissive;
  let material = materialCache.get(key);
  if (!material) {
    material = emissive ? new T.MeshBasicMaterial({ color })
      : new T.MeshStandardMaterial({ color, roughness: .77, metalness: .14 });
    materialCache.set(key, material);
  }
  return material;
};
function box(parent: T.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number, lit = false) {
  const mesh = new T.Mesh(unit, standard(color, lit));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}
function texture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
let randomState = 61287;
const random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 4294967296;
};
const scatter = (min: number, max: number) => min + (max - min) * random();

function asphalt() {
  const map = texture(256, 256, ctx => {
    ctx.fillStyle = '#343d4a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8500; i++) {
      const v = Math.floor(scatter(17, 66));
      ctx.fillStyle = 'rgba(' + v + ',' + (v + 5) + ',' + (v + 8) + ',.43)';
      ctx.fillRect(random() * 256, random() * 256, scatter(.5, 3), 1);
    }
    for (let i = 0; i < 19; i++) {
      const x = scatter(0, 256), y = scatter(0, 256);
      ctx.fillStyle = '#26344055';
      ctx.fillRect(x, y, scatter(15, 54), scatter(8, 28));
      ctx.strokeStyle = '#242d37';
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x + 29, y + 2);
      ctx.stroke();
    }
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  return new T.MeshStandardMaterial({ map, roughness: .82, metalness: .12, polygonOffset: true, polygonOffsetFactor: -1 });
}

function slabTexture(base: string, grid: boolean) {
  const map = texture(256, 256, ctx => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 74; i++) {
      const x = scatter(0, 256), y = scatter(0, 256), r = scatter(3, 47);
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
      cloud.addColorStop(0, i % 2 ? '#0717241a' : '#a0a9a618');
      cloud.addColorStop(1, '#00000000');
      ctx.fillStyle = cloud;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 4400; i++) {
      ctx.fillStyle = i % 3 ? '#111a231a' : '#c5c0a618';
      ctx.fillRect(scatter(0, 256), scatter(0, 256), scatter(.5, 2), scatter(.5, 1.5));
    }
    if (grid) {
      for (let i = 0; i < 256; i += 64) {
        for (let j = 0; j < 256; j += 64) {
          ctx.fillStyle = '#1428325a';
          ctx.fillRect(i, j, 64, 1);
          ctx.fillRect(i + (j % 128 ? 28 : 0), j, 1, 64);
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      const x = scatter(2, 209), y = scatter(0, 242);
      ctx.strokeStyle = '#21303788';
      ctx.lineWidth = .68;
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x + 9,y + 4);
      ctx.lineTo(x + 12,y + 9);
      ctx.lineTo(x + 19,y + 12);
      ctx.stroke();
    }
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  return new T.MeshStandardMaterial({ map, roughness: .86, metalness: .13 });
}

function surface(area: Rect, mat: T.Material, offset: number, cuts = 2.5) {
  const [x, z, w, d] = area;
  const g = new T.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / cuts)), Math.max(1, Math.ceil(d / cuts)));
  g.rotateX(-Math.PI / 2);
  g.translate(x, 0, z);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i), b = pos.getZ(i);
    pos.setY(i, elevation(a, b) + offset);
    uv.setXY(i, a / 7, -b / 7);
  }
  g.computeVertexNormals();
  return new T.Mesh(g, mat);
}

const textMaterials = new Map<string, T.MeshBasicMaterial>();
function sign(parent: T.Object3D, word: string, accent: string, x: number, y: number, z: number, w: number, h = .88, roof = false) {
  const key = word + accent;
  let mat = textMaterials.get(key);
  if (!mat) {
    mat = new T.MeshBasicMaterial({ map: texture(768, 152, c => {
      c.fillStyle = '#101923';
      c.fillRect(0, 0, 768, 152);
      c.strokeStyle = accent;
      c.lineWidth = 4;
      c.strokeRect(7, 7, 754, 138);
      c.font = 'bold 72px Arial Narrow, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = accent;
      c.shadowBlur = 14;
      c.fillStyle = accent;
      c.fillText(word, 384, 81, 690);
    }) });
    textMaterials.set(key, mat);
  }
  const mesh = new T.Mesh(plane, mat);
  mesh.scale.set(w, h, 1);
  mesh.position.set(x, y, z);
  if (roof) mesh.rotation.x = -Math.PI / 2;
  parent.add(mesh);
}

const halo = texture(64, 64, ctx => {
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,.74)');
  gradient.addColorStop(.22, 'rgba(255,255,255,.24)');
  gradient.addColorStop(.64, 'rgba(255,255,255,.07)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
});

function glow(parent: T.Object3D, color: string, x: number, y: number, z: number, width: number, depth = width, power = 1) {
  const mat = new T.MeshBasicMaterial({ map: halo, color, transparent: true, opacity: power, blending: T.AdditiveBlending, depthWrite: false });
  const mesh = new T.Mesh(plane, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.scale.set(width, depth, 1);
  parent.add(mesh);
  return mesh;
}

function batchBoxes(group: T.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<T.Material, T.Mesh[]>();
  group.traverse(object => {
    if (object instanceof T.Mesh && object.geometry === unit && !Array.isArray(object.material)) {
      const list = buckets.get(object.material) ?? [];
      list.push(object);
      buckets.set(object.material, list);
    }
  });
  for (const [material, meshes] of buckets) {
    if (meshes.length < 3) continue;
    const instance = new T.InstancedMesh(unit, material, meshes.length);
    meshes.forEach((mesh, index) => {
      instance.setMatrixAt(index, mesh.matrixWorld);
      mesh.removeFromParent();
    });
    instance.instanceMatrix.needsUpdate = true;
    instance.computeBoundingSphere();
    group.add(instance);
  }
}

function fader(group: T.Group) {
  const originals = new Map<T.Material, T.Material>();
  group.traverse(object => {
    if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
    const material: T.Material = object.material;
    let copy = originals.get(material);
    if (!copy) {
      copy = material.clone();
      copy.transparent = true;
      originals.set(material, copy);
    }
    object.material = copy;
  });
  let opacity = 1;
  return (hidden: boolean, dt: number) => {
    const target = hidden ? 0 : 1;
    opacity = dt > 0 ? T.MathUtils.damp(opacity, target, 21, dt) : target;
    if (Math.abs(opacity - target) < .02) opacity = target;
    group.visible = opacity > 0;
    for (const material of originals.values()) {
      material.depthWrite = opacity >= .98;
      material.opacity = opacity;
    }
  };
}

function structure(group: T.Group, b: Building, roofs: Record<'steel' | 'felt', T.Material>) {
  const [x, z, w, d] = b.area;
  const y = elevation(x, z), h = b.height;
  const trim = b.style === 'brick' ? '#72554e' : '#52616d';
  const shells = { workshop: '#3a505c', brick: '#60484a', housing: '#586275', civic: '#38495d' };
  const shell = shells[b.style];
  const roof = b.style === 'brick' ? '#3e3c4a' : '#293845';
  box(group, '#141d27', x + .35, y + .035, z + .58, w + .8, .045, d + .9);
  box(group, trim, x, y + .18, z, w + .23, .35, d + .23);
  box(group, shell, x, y + h / 2, z, w, h, d);
  box(group, roof, x, y + h + .10, z, w + .38, .25, d + .38).material = roofs[b.style === 'brick' ? 'felt' : 'steel'];
  for (const edge of [-1, 1]) {
    box(group, trim, x, y + h + .24, z + edge * d / 2, w + .34, .29, .24);
    box(group, trim, x + edge * w / 2, y + h + .24, z, .24, .29, d + .34);
  }
  const skylight = b.style === 'brick' || b.style === 'workshop';
  if (skylight && w > 7) {
    for (const q of [-.25, .07, .32]) {
      box(group, '#151f2b', x + q * w, y + h + .25, z, .76, .34, d * .69);
      box(group, '#597785', x + q * w, y + h + .44, z, .43, .04, d * .65);
    }
    for (let i = -.46; i < .48; i += .052) {
      box(group, b.style === 'brick' ? '#554c55' : '#465965', x + i * w, y + h + .23, z, .055, .025, d * .94);
    }
  }
  for (let i = 0; i < Math.max(1, Math.floor(w / 6)); i++) {
    const x1 = x - w * .31 + i * 3.3, z1 = z - d * .30;
    box(group, '#55636c', x1, y + h + .50, z1, 1.42, .7, .85);
    for (let j = 0; j < 3; j++) box(group, '#222e38', x1, y + h + .86, z1 + (j - 1) * .20, 1.12, .04, .07);
  }
  const rows = Math.max(1, Math.floor(h / 2.5));
  for (let row = 0; row < rows; row++) {
    const wy = y + 1.62 + row * 2.14;
    box(group, trim, x, wy - .92, z + d / 2 + .07, w, .12, .13);
    for (let i = 1; i < w / 1.75; i++) {
      const wx = x - w / 2 + i * 1.75;
      box(group, '#263341', wx, wy, z + d / 2 + .017, 1.04, .94, .07);
      const palette = b.style === 'housing' ? ['#ffc48b', '#384756', '#72abb7'] : ['#e6a368', '#314252', '#7cb7d1'];
      const tone = random() < .4 ? palette[0] : random() < .58 ? palette[1] : palette[2];
      box(group, tone, wx - .17, wy, z + d / 2 + .063, .28, .67, .029, tone !== palette[1]);
      box(group, tone, wx + .17, wy, z + d / 2 + .063, .28, .67, .029, tone !== palette[1]);
    }
    for (let j = 1; j < d / 2.4; j++) {
      const wz = z - d / 2 + j * 2.4;
      box(group, '#516777', x + w / 2 + .05, wy, wz, .07, .72, .94);
      if (random() > .55) box(group, '#cda376', x - w / 2 - .045, wy, wz, .1, .57, .7, true);
    }
  }
  if (b.sign) {
    const accent = b.accent ?? '#8dc4bd';
    sign(group, b.sign, accent, x, y + h - .62, z + d / 2 + .08, Math.min(w * .8, 9), 1.15);
    box(group, accent, x, y + h - 1.32, z + d / 2 + .11, Math.min(w * .79, 8.7), .065, .12, true);
    glow(group, accent, x, y + .06, z + d / 2 + 1.5, 10, 6, .62);
  }
}

function lamp(group: T.Group, x: number, z: number, color: string, length = 3.8) {
  const y = elevation(x, z);
  box(group, '#576475', x, y + length * .5, z, .11, length, .11);
  box(group, '#495464', x + .38, y + length, z, .85, .1, .11);
  box(group, color, x + .81, y + length - .07, z, .48, .095, .30, true);
  box(group, '#27313f', x, y + .10, z, .32, .2, .33);
  glow(group, color, x + .65, y + .045, z, 9, 9, .86);
}

function crate(group: T.Group, x: number, z: number, w = 1.45, d = 1.4, h = 1.04, tone = '#665446') {
  const y = elevation(x, z);
  box(group, '#141f28', x + .15, y + .04, z + .20, w + .23, .05, d + .28);
  box(group, tone, x, y + h / 2, z, w, h, d);
  for (const side of [-1, 1]) {
    box(group, '#8f7760', x + side * w * .33, y + h + .015, z, .09, .05, d);
    box(group, '#8f7760', x + side * w * .33, y + h / 2, z + d / 2, .09, h, .05);
  }
}

export class City {
  readonly group = new T.Group();
  private readonly roofs: { area: Rect; fade: ReturnType<typeof fader>; slice: T.Group }[] = [];
  readonly gateMeshes = new Map<string, T.Group>();
  private railDeck = new T.Group();
  private fadeRail: ReturnType<typeof fader>;

  constructor(scene: T.Scene) {
    randomState = 61287;
    scene.add(this.group);
    const decor = new T.Group();
    this.group.add(decor);
    const base = slabTexture('#354450', false);
    decor.add(surface([83, -4, 317, 144], base, -.035, 2));
    const roadmat = asphalt();
    for (const area of roads) decor.add(surface(area, roadmat, .012, 1.5));
    const walkmat = slabTexture('#53616e', true);
    for (const area of blocks) {
      decor.add(surface(area, walkmat, .038));
      const [x, z, w, d] = area;
      for (let i = -w / 2; i <= w / 2; i += 1.1) {
        for (const side of [-1, 1]) {
          const zx = z + side * d / 2;
          box(decor, '#7a807d', x + i, elevation(x + i, zx) + .064, zx, 1.03, .14, .22);
        }
      }
      for (let j = -d / 2; j < d / 2; j += 1.1) {
        for (const side of [-1, 1]) {
          const xx = x + side * w / 2;
          box(decor, '#7a807d', xx, elevation(xx, z + j) + .064, z + j, .21, .14, 1.03);
        }
      }
    }
    for (let x = -52; x < 223; x += 4.4) {
      if ([-53, 0, 43, 105, 144, 175].some(road => Math.abs(x - road) < 7)) continue;
      const mark = box(decor, '#b0a98e', x, elevation(x, 0) + .035, 0, 1.95, .015, .12);
      mark.rotation.z = Math.atan2(elevation(x + .10, 0) - elevation(x - .10, 0), .20);
    }
    for (const x of [-53, 43, 105, 144, 175]) {
      for (let z = -33; z < 42; z += 4.7) {
        if (Math.abs(z) < 6) continue;
        const mark = box(decor, '#a6a28a', x, elevation(x, z) + .039, z, .12, .016, 2.08);
        mark.rotation.x = -Math.atan2(elevation(x, z + .10) - elevation(x, z - .10), .20);
      }
      for (let i = -3; i <= 3; i++) {
        box(decor, '#b1b6a9', x + i * .8, elevation(x + i * .8, 5.3) + .041, 5.3, .46, .016, 1.62);
        box(decor, '#b1b6a9', x + i * .8, elevation(x + i * .8, -5.3) + .041, -5.3, .46, .016, 1.62);
      }
    }
    const roofMats = { steel: slabTexture('#394b58', true), felt: slabTexture('#4d4650', true) };
    for (const b of buildings) structure(decor, b, roofMats);
    for (const w of walls) {
      const [x, z, width, depth] = w.area;
      const color = w.color ?? '#54616e';
      const y = w.base ?? elevation(x, z);
      const room = rooms.find(r => w.height >= 3.3 && inRect(x, z, r.area, .36));
      let slice: T.Group | undefined;
      if (room) {
        slice = new T.Group();
        this.group.add(slice);
        box(slice, color, x, y + w.height / 2, z, width, w.height, depth);
        box(slice, '#879098', x, y + w.height + .007, z, width + .11, .12, depth + .11);
      }
      const height = room ? 1.15 : w.height;
      box(decor, color, x, y + height / 2, z, width, height, depth);
      if (!room && height > 1) box(decor, '#66757e', x, y + height + .045, z, width + .1, .12, depth + .1);
      if (slice) {
        slice.userData.room = room!.id;
        slice.name = room!.id + '-wall';
      }
    }
    for (const r of rooms) {
      const [x, z, w, d] = r.area;
      const y = elevation(x, z);
      decor.add(surface(r.area, walkmat, .06));
      const mesh = new T.Group();
      const slice = new T.Group();
      const tallWalls = this.group.children.filter(c => c.userData.room === r.id);
      slice.add(...tallWalls);
      box(mesh, '#374652', x, y + r.height, z, w + .3, .42, d + .3).material = roofMats.steel;
      for (const offset of [-.40, -.21, 0, .21, .40]) {
        box(mesh, '#4f5a65', x + w * offset, y + r.height + .23, z, .26, .11, d);
      }
      for (const offset of [-.24, .24]) {
        box(mesh, '#26343e', x + offset * w, y + r.height + .47, z + d * .14, 2.3, .55, 1.25);
        box(mesh, '#657680', x + offset * w, y + r.height + .76, z + d * .14, 1.9, .05, .98);
      }
      const names: Record<string, string> = { garage: 'MINA / GARAGE', depot: 'DÉPÔT F-07', archive: 'ARCHIVES', core: 'NŒUD / REGISTRE' };
      sign(mesh, names[r.id], r.accent, x, y + r.height + .27, z + d * .30, Math.min(12, w - 1), 1.72, true);
      box(mesh, r.accent, x, y + r.height - .08, z + d / 2 + .225, w - .18, .09, .15, true);
      glow(decor, r.accent, x, y + .09, z + d / 2, 16, 8, .85);
      this.group.add(mesh, slice);
      this.roofs.push({ area: r.area, fade: fader(mesh), slice });
    }
    for (const gate of gates) {
      const [x, z, w, d] = gate.area, y = elevation(x, z);
      const group = new T.Group();
      this.group.add(group);
      this.gateMeshes.set(gate.id, group);
      const alongX = w > d;
      const span = alongX ? w : d;
      for (let i = -.47; i < .5; i += .115) {
        const ax = x + (alongX ? i * span : 0);
        const az = z + (alongX ? 0 : i * span);
        box(group, '#71818d', ax, y + 1.12, az, .095, 2.24, .095);
      }
      for (const h of [.18, 1.12, 2.24]) box(group, '#617582', x, y + h, z, alongX ? w : .18, .16, alongX ? .18 : d);
      box(group, gate.accent, x, y + 2.24, z, alongX ? w * .71 : .19, .057, alongX ? .19 : d * .71, true);
      glow(decor, gate.accent, x, y + .06, z, 5.2, 4.4, .5);
    }
    for (const [x, z, hue] of [
      [-34, 20, '#88edce'], [-16, 21, '#69ffe5'], [-10, 7, '#ffa85f'], [-33, 7, '#ffc37a'],
      [-47, -8, '#ffd284'], [-44, 36, '#f6bb70'], [8, 9, '#fc71a6'], [22, 13, '#ff7eb1'], [36, 7, '#ffd58c'],
      [9, -11, '#ffc578'], [31, -8, '#ffbe6e'], [2, -24, '#7be9dd'], [20, -35, '#ffc370'],
      [38.7, -25, '#ffcf81'], [46.8, -36, '#ffcd8c'], [39, -49, '#74bde7'], [19, -52, '#76eac6'],
      [-4, -54, '#cbdbad'], [-36, -53, '#ffcf8f'], [51, -7, '#c1b6fe'], [67, 5, '#9fd8ee'],
      [83, -6, '#a3ebc5'], [96, 7, '#ffcd81'], [112, 8, '#ffb67f'], [125, -8, '#9fefd7'],
      [138, 8, '#9fefd7'], [153, -6, '#abc7ff'], [169, -6, '#abc7ff'], [187, 7, '#d4d4ff'],
      [205, -10, '#85c7fb'], [219, 8, '#9db5fc'],
    ] as const) lamp(decor, x, z, hue);
    for (const [x, z] of [[-34, 16], [-33, 32], [-17, 14], [-31, -10], [-35, -29], [-8, -29], [-8, -27.4],
      [2.1, -28], [3.5, -28], [15.3, -28.5], [13.6, -28.5], [28, -19], [27.8, -30], [31, -16],
      [35, 15], [19, 29], [65, -11], [113, -26], [109.6, -25], [126, -24], [201, -31], [205, -34]]) {
      crate(decor, x, z, scatter(1.1, 1.55), scatter(1.1, 1.55), scatter(.45, 1.0), random() > .5 ? '#665446' : '#52656b');
    }
    for (const [x, z] of [[-28.8, 17.8], [-19.2, 17.8], [-20.9, 21.4]]) {
      box(decor, '#37505a', x, .46, z, 1.1, .92, .61);
      box(decor, '#a67354', x, .97, z, 1.15, .12, .66);
      box(decor, '#9dc1c0', x, .69, z + .314, .72, .045, .031);
      box(decor, '#9dc1c0', x, .49, z + .314, .72, .045, .031);
    }
    for (const [x,z,breadth] of [[-24,21.95,12.6],[22,-13.4,5.2],[14,-34.3,4.2],[103,-15.0,4.1],[192.5,-14.37,4.6]]) {
      for (let d = -breadth / 2; d < breadth / 2; d += .51) {
        const stripe = box(decor, '#cfaa62', x + d, elevation(x + d,z) + .09, z, .21, .014, .63);
        stripe.rotation.y = -.56;
      }
    }
    for (const [x,z,color] of [[-23,23,'#75ffee'],[-33,18,'#6bcec3'],[-36,9,'#ffd58c'],[10,17,'#e576a1'],[21,12,'#f191aa'],
      [22,-9,'#ffb571'],[5,-26,'#6ed4cb'],[32,-5,'#ffbe70'],[41,-48,'#8abfec'],[88,11,'#f2c28a'],[128,9,'#67ebc7'],
      [157,0,'#a3bcff'],[192,-13,'#8bafff']] as const) {
      const y = elevation(x,z);
      glow(decor, color, x, y + .085, z, 5.7, 10.5, .52);
      glow(decor, color, x + .46, y + .09, z - .90, 1.55, 5.7, .42);
    }
    for (const x of [-47, -34, -14, 7, 25, 35, 80, 93, 120, 133, 161, 180, 205]) {
      const z = x % 3 < 1 ? 39.5 : 8.2;
      const y = elevation(x, z);
      box(decor, '#626360', x, y + .23, z, 1.65, .46, 1.4);
      box(decor, '#313941', x, y + .47, z, 1.43, .06, 1.18);
      box(decor, '#655946', x, y + 1.02, z, .18, 1.1, .18);
      box(decor, '#314d4d', x, y + 1.89, z, 1.55, 1.24, 1.82);
      box(decor, '#51645a', x + .48, y + 2.11, z - .22, 1.06, 1.29, 1.23);
    }
    this.railway(decor);
    sign(decor, 'SOUS LES VOIES ↑', '#73efd3', 13, .065, -35.35, 5.9, 1.28, true);
    sign(decor, 'PONT ROUTIER ↑', '#ffd378', 43, elevation(43, -24) + .069, -24, 8.6, 1.39, true);
    sign(decor, 'QUAI NORD ↑', '#94ebdd', 4.0, .066, -30.6, 5.65, 1.46, true);
    sign(decor, 'QUAI NORD ↓', '#94ebdd', 21.5, .075, -35.75, 5.1, 1.22, true);
    sign(decor, 'DÉPÔT / ENTRÉE', '#ffba61', 22.4, .07, -10.2, 6.5, 1.40, true);
    sign(decor, 'LA DALLE →', '#8eded0', 65, elevation(65, 8) + 1.75, 8, 5.5, .93);
    sign(decor, 'LE NŒUD →', '#b0d4ff', 153, elevation(153, 7) + 1.8, 7, 5.5, .90);
    for (const x of [9.03, 16.94]) {
      for (let z = -35; z >= -46; z -= .50) {
        box(decor, '#657678', x, elevation(x, z) + .18, z, .11, .55, .54);
      }
    }
    for (let z = -34.6; z > -39.1; z -= .47) {
      box(decor, '#6c848a', 13, elevation(13, z) + .055, z, 7.4, .105, .14);
    }
    batchBoxes(decor);
    batchBoxes(this.railDeck);
    this.fadeRail = fader(this.railDeck);
  }

  private railway(decor: T.Group) {
    const z = -42;
    this.group.add(this.railDeck);
    for (const [x, width] of [[-24, 65], [13, 9], [38, 41]]) {
      const target = x === 13 ? this.railDeck : decor;
      box(target, '#384452', x, 2.45, z, width, .44, 7.4);
      for (const dz of [-2.3, -1.05, 1.1, 2.35]) box(target, '#8f9aa5', x, 2.81, z + dz, width, .075, .079);
      for (let xx = x - width / 2 + .22; xx < x + width / 2; xx += .70) {
        box(target, '#514c4b', xx, 2.728, z - 1.68, .22, .09, 2.02);
        box(target, '#514c4b', xx, 2.728, z + 1.74, .22, .09, 2.02);
      }
    }
    box(decor, '#354a58', 43, 2.92, z, 10.2, .23, 8.68);
    for (const lane of [-3.85, 3.85]) box(decor, '#98977c', 43 + lane, 3.046, z, .08, .015, 8.56);
    for (const dash of [-2.8, 0, 2.8]) box(decor, '#b8ad8a', 43, 3.045, z + dash, .12, .016, 1.38);
    for (const x of [38.15, 47.85]) {
      for (let z = -50; z <= -34; z += .57) {
        const y = elevation(x, z);
        box(decor, '#7a8490', x, y + .42, z, .19, .82, .62);
        box(decor, '#ddaa64', x, y + .85, z, .20, .095, .60);
      }
    }
    for (const x of [-44, -27, -10]) {
      box(decor, '#704e52', x, 3.72, -40.3, 11.6, 2.04, 2.65);
      box(decor, '#9c7167', x, 4.77, -40.3, 11.7, .12, 2.79);
      for (let i = -5.5; i < 5.6; i += .60) box(decor, '#925e5e', x + i, 3.72, -38.94, .105, 1.98, .09);
    }
    for (let z = -46; z >= -50; z -= 2) {
      glow(decor, '#60efd2', 13, elevation(13, z) + .05, z, 6.7, 5, .78);
      box(decor, '#81ffe4', 17.06, elevation(17, z) + 1.1, z, .11, .13, .48, true);
    }
  }

  updateVisibility(x: number, z: number, dt: number) {
    for (const roof of this.roofs) {
      const exposed = inRect(x, z + 1.55, roof.area, 1.42);
      roof.fade(exposed, dt);
      roof.slice.visible = !exposed;
    }
    this.fadeRail(x > 8.6 && x < 17.45 && z < -35.7 && z > -50.5, dt);
  }
}

const shadowMaterial = new T.MeshBasicMaterial({ map: halo, color: '#03070f', transparent: true, opacity: .74, depthWrite: false });
function shadow(parent: T.Group, w: number, d: number) {
  const s = new T.Mesh(plane, shadowMaterial);
  s.rotation.x = -Math.PI / 2;
  s.position.y = .023;
  s.scale.set(w, d, 1);
  parent.add(s);
}

export class PersonModel {
  readonly root = new T.Group();
  private readonly body = new T.Group();
  private readonly legs: T.Mesh[];
  constructor(tint: string, kind: 'player' | 'guard' | 'civil' | 'contact') {
    shadow(this.root, 2.35, 2.06);
    this.root.add(this.body);
    const armed = kind === 'player' || kind === 'guard';
    const under = kind === 'player' ? '#202b36' : '#353b47';
    const scale = kind === 'player' ? 1.14 : 1;
    box(this.body, '#161e2a', 0, .71, 0, .68, .19, .37);
    this.legs = [-.19, .19].map(x => box(this.body, under, x, .40, .02, .255, .71, .295));
    box(this.body, tint, 0, 1.06, .03, .77, .56, .47);
    box(this.body, under, 0, 1.07, -.24, .50, .46, .11);
    box(this.body, kind === 'player' ? '#b4ed85' : tint, 0, 1.39, .019, .65, .076, .50, kind === 'player');
    box(this.body, '#c89071', 0, 1.58, .025, .335, .32, .32);
    box(this.body, '#273542', 0, 1.68, .004, .38, .18, .37);
    const visor = kind === 'guard' ? '#ff7d57' : kind === 'player' ? '#e4fca9' : '#a1b7be';
    box(this.body, visor, 0, 1.59, .201, .33, .068, .034, armed);
    const arm = box(this.body, tint, .455, 1.02, armed ? .23 : .02, .205, .25, armed ? .59 : .25);
    if (!armed) arm.scale.y = .43;
    box(this.body, tint, -.46, 1.04, .11, .20, .42, .27);
    if (armed) {
      box(this.body, '#242d3d', .455, 1.09, .62, .12, .115, .38);
      box(this.body, '#d3ba84', .455, 1.10, .81, .09, .044, .05);
    }
    this.body.scale.setScalar(scale);
  }
  pose(yaw: number, stride: number, time: number, fallen: number, hit: number) {
    this.root.rotation.y = yaw;
    this.body.rotation.x = -fallen * 1.57 - hit * .19;
    this.body.rotation.z = hit * .24;
    this.body.position.y = Math.sin(time * 18) * .05 * stride;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(time * 13 + i * Math.PI) * .66 * stride;
      leg.position.z = Math.sin(time * 13 + i * Math.PI) * .19 * stride;
    });
  }
}

export function makeCar(color = '#48636d') {
  const car = new T.Group();
  shadow(car, 4.8, 7.5);
  box(car, '#1a2430', 0, .38, 0, 1.92, .47, 3.9);
  box(car, color, 0, .71, 0, 1.86, .49, 3.85);
  box(car, '#7d9ca8', 0, .915, 1.18, 1.66, .09, 1.18);
  box(car, '#87a2a7', 0, .94, -1.29, 1.62, .075, .99);
  box(car, '#263b49', 0, 1.105, -.21, 1.46, .54, 1.66);
  const glass = box(car, '#456678', 0, 1.075, .59, 1.35, .07, .61);
  glass.rotation.x = .53;
  const rear = box(car, '#456678', 0, 1.081, -.95, 1.35, .06, .51);
  rear.rotation.x = -.45;
  box(car, color, 0, 1.397, -.25, 1.29, .083, .93);
  box(car, '#b8a777', 0, .966, 1.26, .13, .028, 1.25);
  for (const side of [-1, 1]) {
    const x = side * .92;
    box(car, '#222c38', x, .62, 0, .11, .092, 3.84);
    for (const z of [-1.22, 1.22]) {
      box(car, '#131a24', side * .943, .35, z, .29, .61, .67);
      box(car, '#5e6a75', side * 1.102, .36, z, .027, .34, .34);
    }
    box(car, '#f1f4d3', side * .62, .76, 1.942, .46, .12, .066, true);
    box(car, '#ff5775', side * .61, .74, -1.963, .48, .10, .073, true);
  }
  glow(car, '#fff2c4', 0, .025, 3.08, 5.5, 4.6, .7);
  glow(car, '#ff476a', 0, .028, -2.1, 3.4, 2.8, .7);
  return car;
}

export function makeDrone() {
  const drone = new T.Group();
  shadow(drone, 3.1, 2.6);
  box(drone, '#53687b', 0, 1.78, 0, 1.32, .30, .96);
  box(drone, '#b1bac6', 0, 1.963, 0, .62, .13, .83);
  box(drone, '#ffad63', 0, 1.78, .55, .32, .13, .10, true);
  for (const side of [-1, 1]) {
    box(drone, '#384657', side * .89, 1.84, 0, .52, .14, 1.19);
    box(drone, '#ffc773', side * .92, 1.88, .46, .15, .05, .25, true);
  }
  return drone;
}

export function makeCamera() {
  const root = new T.Group();
  box(root, '#728292', 0, 1.40, 0, .13, 2.8, .13);
  const pivot = new T.Group();
  pivot.position.y = 2.78;
  root.add(pivot);
  box(pivot, '#91a0ae', 0, .10, .22, .37, .29, .68);
  box(pivot, '#ffd977', 0, .07, .57, .21, .13, .064, true);
  return { root, pivot };
}

export class Effects {
  private readonly particles: { mesh: T.Mesh; velocity: T.Vector3; age: number; life: number }[] = [];
  private readonly marks: T.Mesh[] = [];
  private readonly tracers: { mesh: T.Mesh; age: number }[] = [];
  private readonly rings: { mesh: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>; age: number; life: number }[] = [];
  private cursor = { particle: 0, mark: 0, tracer: 0, ring: 0 };
  constructor(scene: T.Scene) {
    const reds = ['#8c263d', '#ca4554', '#77263a'];
    const geo = new T.IcosahedronGeometry(.12, 0);
    for (let i = 0; i < 128; i++) {
      const mesh = new T.Mesh(geo, standard(reds[i % reds.length]));
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, velocity: new T.Vector3(), age: 0, life: 0 });
    }
    const stain = texture(64, 64, c => {
      for (let i = 0; i < 44; i++) {
        const a = scatter(0, Math.PI * 2), r = scatter(0, 25);
        c.fillStyle = i % 3 ? '#611526cc' : '#8d2135d9';
        c.beginPath();
        c.ellipse(32 + Math.sin(a) * r, 32 + Math.cos(a) * r, scatter(1, 8), scatter(1, 5), a, 0, Math.PI * 2);
        c.fill();
      }
    });
    const mat = new T.MeshBasicMaterial({ map: stain, transparent: true, depthWrite: false, opacity: .82 });
    for (let i = 0; i < 58; i++) {
      const mesh = new T.Mesh(plane, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.marks.push(mesh);
    }
    for (let i = 0; i < 13; i++) {
      const mesh = box(scene, '#ffe0a0', 0, 0, 0, .045, .045, 1, true);
      mesh.visible = false;
      this.tracers.push({ mesh, age: 0 });
    }
    const ring = new T.RingGeometry(.82, 1, 32);
    ring.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mesh = new T.Mesh(ring, new T.MeshBasicMaterial({ color: '#b5fdd1', transparent: true, opacity: .8, depthWrite: false, side: T.DoubleSide }));
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, age: 0, life: 0 });
    }
  }
  blood(x: number, y: number, z: number, dx: number, dz: number, strong: boolean) {
    const qty = strong ? 23 : 10;
    for (let i = 0; i < qty; i++) {
      const p = this.particles[this.cursor.particle++ % this.particles.length];
      p.mesh.position.set(x + scatter(-.21, .21), y + scatter(.05, .58), z + scatter(-.22, .22));
      p.mesh.scale.setScalar(scatter(.48, strong ? 1.65 : 1.15));
      p.mesh.visible = true;
      p.velocity.set(dx * scatter(1, 4) + scatter(-3, 3), scatter(.65, strong ? 5 : 2.4), dz * scatter(1, 4) + scatter(-3, 3));
      p.age = 0;
      p.life = scatter(.25, .64);
    }
    this.stain(x + dx * .38, z + dz * .38, strong ? 2.7 : 1.35);
  }
  stain(x: number, z: number, size: number) {
    const m = this.marks[this.cursor.mark++ % this.marks.length];
    m.position.set(x, elevation(x, z) + .08 + (this.cursor.mark % 17) * .001, z);
    m.rotateZ(scatter(0, 6));
    m.scale.set(size, size * scatter(.6, 1.3), 1);
    m.visible = true;
  }
  trace(from: T.Vector3, to: T.Vector3) {
    const t = this.tracers[this.cursor.tracer++ % this.tracers.length];
    t.mesh.position.copy(from).add(to).multiplyScalar(.5);
    t.mesh.scale.z = from.distanceTo(to);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.age = .085;
  }
  pulse(at: Point, color: string, life = .85) {
    const p = this.rings[this.cursor.ring++ % this.rings.length], [x, z] = at;
    p.mesh.position.set(x, elevation(x, z) + .1, z);
    p.mesh.material.color.set(color);
    p.mesh.scale.setScalar(.3);
    p.mesh.visible = true;
    p.age = 0;
    p.life = life;
  }
  update(dt: number) {
    for (const p of this.particles) {
      if (!p.mesh.visible) continue;
      p.age += dt;
      p.velocity.y -= 10.5 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const { x, y, z } = p.mesh.position;
      if (p.age >= p.life || y < elevation(x, z) + .05) {
        p.mesh.visible = false;
        if (p.age < p.life && random() < .36) this.stain(x, z, .32);
      }
    }
    for (const t of this.tracers) {
      t.age -= dt;
      t.mesh.visible = t.age > 0;
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      r.mesh.material.opacity = clamp(1 - r.age / r.life, 0, 1) * .78;
      r.mesh.scale.setScalar(.3 + r.age * 4.55);
      if (r.age >= r.life) r.mesh.visible = false;
    }
  }
  clear() {
    for (const p of this.particles) p.mesh.visible = false;
    for (const m of this.marks) m.visible = false;
    for (const t of this.tracers) { t.mesh.visible = false; t.age = 0; }
    for (const r of this.rings) r.mesh.visible = false;
  }
}

export function sightCone(length: number, width: number, color: string) {
  const shape = new T.BufferGeometry();
  shape.setAttribute('position', new T.Float32BufferAttribute([0, .10, 0, -width, .10, length, width, .10, length], 3));
  shape.setAttribute('alpha', new T.Float32BufferAttribute([.26, .015, .015], 1));
  return new T.Mesh(shape, new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color(color) }, strength: { value: 1 } },
    vertexShader: 'attribute float alpha; varying float fade; void main(){fade=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint; uniform float strength; varying float fade; void main(){gl_FragColor=vec4(tint,fade*strength);}',
    side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  }));
}
