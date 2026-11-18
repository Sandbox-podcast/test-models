import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { furniture, type Furniture } from './furniture';
import { ribbons } from './roads';
import { places } from './places';
import { blocks, bounds, buildings, clamp, crossingSurfaces, elevation, foundation, gates, inRect, roads, rooms, walls, type Building, type Point, type Rect } from './level';

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

function ribbonSurface(axis: (typeof ribbons)[number]['samples'], width: number, material: T.Material, offset: number) {
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const across = Math.max(3,Math.ceil(width/2.1));
  const stride = across+1;
  for(const [i,p] of axis.entries()){
    for(let j=0;j<=across;j++){
      const side = (j/across-.5)*width;
      const x=p.x+Math.cos(p.yaw)*side,z=p.z-Math.sin(p.yaw)*side;
      vertices.push(x,elevation(x,z)+offset,z);
      uvs.push(x/7,-z/7);
      if(i>0&&j>0){
        const k=i*stride+j;
        indices.push(k-stride-1,k,k-stride,k-stride-1,k-1,k);
      }
    }
  }
  const mesh=new T.BufferGeometry();
  mesh.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  mesh.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return new T.Mesh(mesh,material);
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

const vertexMat = new T.MeshStandardMaterial({vertexColors:true,roughness:.77,metalness:.14});
const vertexGlow = new T.MeshBasicMaterial({vertexColors:true});
function fuseParts(group:T.Group, keep:T.Object3D[]=[]){
  const batches = new Map<T.Material,T.BufferGeometry[]>();
  for(const object of [...group.children]){
    if(!(object instanceof T.Mesh) || object.geometry!==unit || keep.includes(object)) continue;
    const material = object.material;
    if(!(material instanceof T.MeshStandardMaterial || material instanceof T.MeshBasicMaterial)) continue;
    object.updateMatrix();
    const geo=unit.clone().applyMatrix4(object.matrix);
    const colors=new Float32Array(geo.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=material.color.r;colors[i+1]=material.color.g;colors[i+2]=material.color.b;}
    geo.setAttribute('color',new T.BufferAttribute(colors,3));
    const target=material instanceof T.MeshBasicMaterial?vertexGlow:vertexMat;
    const list=batches.get(target)??[];
    list.push(geo);
    batches.set(target,list);
    object.removeFromParent();
  }
  for(const [material,geometries] of batches){
    group.add(new T.Mesh(mergeGeometries(geometries),material));
    geometries.forEach(geo=>geo.dispose());
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
  const y = foundation(b.area), h = b.height;
  const trim = b.style === 'brick' ? '#72554e' : '#52616d';
  const shells = { workshop:'#52616a', brick:'#9a8876', housing:'#aa9285', civic:'#788590' };
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

function buildFurniture(prop: Furniture) {
  const group = new T.Group();
  const {at:[x,z], size:[w,h,d], tint, kind} = prop;
  group.name = prop.id;
  group.position.set(x, elevation(x,z), z);
  if (kind === 'lamp') {
    box(group, '#576475', 0, h * .5, 0, .11, h, .11);
    box(group, '#495464', .38, h, 0, .85, .10, .11);
    box(group, tint, .81, h - .07, 0, .48, .095, .30, true);
    box(group, '#27313f', 0, .10, 0, w, .20, d);
    const pool = glow(group, tint, .65, .045, 0, 8.5, 7.5, .86);
    pool.name = 'light';
  } else if (kind === 'tree') {
    box(group, '#696c61', 0, h*.5, 0, w, h, d);
    box(group, '#333941', 0, h+.02, 0, w-.17, .04, d-.18);
    box(group, '#635743', 0, h+.49, 0, .18, 1.16, .18);
    for (const [xx, zz, shade, size] of [[-.25,-.13,'#264841',1.7],[.52,.19,'#496551',1.22],[.17,-.47,'#3e5b51',1.02]] as const) {
      const crown = new T.Mesh(new T.IcosahedronGeometry(size*.57,1), standard(shade));
      crown.position.set(xx,h+1.43+size*.16,zz);
      crown.scale.y=.81;
      group.add(crown);
    }
  } else if (kind === 'bench') {
    for (const xx of [-w*.34,w*.34]) box(group, '#283843', xx, .21, 0, .12, .42, d*.9);
    box(group,tint,0,.45,0,w,.12,d);
    box(group,tint,0,h-.11,-d*.36,w,.19,.10);
  } else if (kind === 'stall') {
    box(group, '#594d45',0,.46,0,w,.92,d);
    box(group, '#a18970',0,.96,0,w,.13,d);
    for (const xx of [-w*.46,w*.46]) box(group,'#735b47',xx,h*.53,0,.1,h*.90,.11);
    box(group,tint,0,h-.07,0,w,.14,d);
    for(let xx=-w/2+.27;xx<w/2;xx+=.55) box(group,'#e8d4ae',xx,h-.055,0,.23,.15,d);
  } else {
    box(group,kind==='cabinet'?'#37505a':tint,0,h*.5,0,w,h,d);
    if (kind==='crate') {
      for (const xx of [-w*.31,w*.31]) {
        box(group,'#8f7760',xx,h+.018,0,.075,.036,d);
        box(group,'#8f7760',xx,h*.5,d*.5,.075,h,.036);
      }
    } else {
      box(group,tint,0,h-.08,0,w+.025,.12,d+.028);
      for (const yy of [.41,.63]) box(group,'#acd0c9',0,h*yy,d*.51,w*.60,.045,.025,kind==='bollard');
    }
  }
  fuseParts(group);
  return group;
}

export class City {
  readonly group = new T.Group();
  private readonly roofs: { area: Rect; fade: ReturnType<typeof fader>; slice: T.Group }[] = [];
  readonly gateMeshes = new Map<string, T.Group>();
  private readonly propModels = new Map<string, T.Group>();
  private readonly serviceLights = new T.Group();
  private readonly garageMap = new T.Group();
  private readonly civicSigns = new T.Group();
  private readonly relaySigns = new T.Group();
  private readonly marketOpen = new T.Group();
  private readonly marketClosed = new T.Group();
  private railDeck = new T.Group();
  private fadeRail: ReturnType<typeof fader>;

  constructor(scene: T.Scene) {
    randomState = 61287;
    scene.add(this.group);
    this.group.add(this.serviceLights,this.garageMap,this.civicSigns,this.relaySigns,this.marketOpen,this.marketClosed);
    const decor = new T.Group();
    this.group.add(decor);
    const base = slabTexture('#34414a', false);
    for (let x=bounds.west-12;x<bounds.east+12;x+=31) {
      for (let z=bounds.north-10;z<bounds.south+10;z+=31) decor.add(surface([x+15.5,z+15.5,31,31],base,-.035,1.85));
    }
    const roadmat = asphalt();
    for (const area of roads) decor.add(surface(area, roadmat, .012, 1.5));
    const walkmat = slabTexture('#53616e', true);
    for(const road of ribbons) {
      if(!road.pedestrian) decor.add(ribbonSurface(road.samples,road.width+2.8,walkmat,.047));
      decor.add(ribbonSurface(road.samples,road.width,road.pedestrian?walkmat:roadmat,.083));
      if (road.pedestrian) continue;
      for(const [i,p] of road.samples.entries()){
        if(i%4!==0 || i===0 || i===road.samples.length-1) continue;
        const mark=box(decor,'#bcb098',p.x,elevation(p.x,p.z)+.105,p.z,.13,.015,1.59);
        mark.rotation.y=p.yaw;
      }
    }
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
      if ((x>40 && x<102) || (x>126 && x<177) || [-53,0,105].some(road => Math.abs(x-road)<6)) continue;
      const mark = box(decor, '#b0a98e', x, elevation(x, 0) + .035, 0, 1.95, .015, .12);
      mark.rotation.z = Math.atan2(elevation(x + .10, 0) - elevation(x - .10, 0), .20);
    }
    for (const x of [-53, 43, 105, 144, 175,225]) {
      for (let z = -33; z < 42; z += 4.7) {
        if (Math.abs(z) < 6 || (x===43 && z < -25)) continue;
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
      const names: Record<string, string> = { garage:'MINA / GARAGE',depot:'DÉPÔT F-07',archive:'ARCHIVES CIVIS',core:'NŒUD / REGISTRE',records:'ARCHIVES D’ATELIER',housing:'RÉSIDENCE HAUTE',shop:'ARRIÈRE-BOUTIQUE',paper:'PAPETERIE' };
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
    for (const prop of furniture) {
      const model = buildFurniture(prop);
      this.group.add(model);
      this.propModels.set(prop.id, model);
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
    this.railway(decor);
    const water=new T.MeshStandardMaterial({color:'#284d5d',roughness:.36,metalness:.41});
    decor.add(surface([99,-117.1,111,12.2],water,.16,1.5));
    for(let x=48;x<154;x+=4.9){
      for(let i=0;i<3;i++) box(decor,i%2?'#4f727b':'#3a6370',x,.185,-112.6-i*3,3.2+i*.35,.007,.067);
    }
    sign(this.garageMap,'CARTE DU COTEAU','#f3cd95',-24.45,elevation(-24.45,16)+1.8,16.00,3.6,.74);
    sign(this.civicSigns,'CELLULE D’APPEL','#bacfec',195,elevation(195,12)+1.9,12,5.15,.90);
    sign(this.relaySigns,'DROITS / RELAIS','#a5e8b8',198.6,elevation(198.6,10.9)+1.9,10.9,5.6,.90);
    sign(decor,'PERMANENCE DE NADIA','#f1c697',116,elevation(116,12.6)+1.9,12.6,5.1,.84);
    sign(this.marketOpen,'HALLE OUVERTE','#fdd190',106,elevation(106,-81.9)+1.82,-81.9,6.3,.92);
    glow(this.marketOpen,'#ffbb77',106,elevation(106,-80.1)+.14,-80.1,10,6,.74);
    sign(this.marketClosed,'HALLE FERMÉE','#a7b4af',106,elevation(106,-81.88)+1.82,-81.88,6.3,.92);
    sign(decor,'SOUS LES VOIES ↑','#95dcb0',13,elevation(13,-35.15)+.14,-35.15,5.9,1.28,true);
    sign(decor, 'PONT ROUTIER ↑', '#ffd378', 43, elevation(43, -24) + .069, -24, 8.6, 1.39, true);
    const [px,pz]=places.escapeParking;
    for(const edge of [-1,1]) box(decor,'#c2ab79',px+edge*1.47,elevation(px,pz)+.047,pz,.08,.012,5.35);
    box(decor,'#c2ab79',px,elevation(px,pz)+.047,pz-2.63,2.98,.012,.08);
    sign(decor,'P','#f3dc9d',px,elevation(px,pz)+.057,pz,1.13,1.13,true);
    sign(decor, 'QUAI NORD ↑', '#94ebdd', 4.0, elevation(4,-30.6)+.066, -30.6, 5.65, 1.46, true);
    sign(decor, 'QUAI NORD ↓', '#94ebdd', 21.5, elevation(21.5,-35.75)+.075, -35.75, 5.1, 1.22, true);
    sign(decor, 'DÉPÔT / ENTRÉE', '#ffba61', 22.4, elevation(22.4,-10.2)+.07, -10.2, 6.5, 1.40, true);
    sign(decor, 'LA DALLE →', '#8eded0', 65, elevation(65, 8) + 1.75, 8, 5.5, .93);
    sign(decor, 'LE NŒUD →', '#b0d4ff', 153, elevation(153, 7) + 1.8, 7, 5.5, .90);
    sign(decor,'LES QUAIS →','#86d4c4',56,elevation(56,-69)+.13,-69,7,1.42,true);
    sign(decor,'BELVÉDÈRES ↓','#eec1a2',105,elevation(105,49)+.095,49,7.5,1.31,true);
    sign(decor,'RAMPE DU NŒUD','#bdd9e9',223,elevation(223,31)+.106,31,8.1,1.33,true);
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
    const {railway,bridge,tunnel}=crossingSurfaces;
    const [tunnelX,tunnelZ,tunnelWidth,tunnelLength]=tunnel.area;
    box(decor,'#7f7261',tunnelX,tunnel.base+tunnel.height*.5,tunnelZ,tunnelWidth,tunnel.height,tunnelLength);
    for (const [x, width] of [[-24, 65], [railway.area[0],railway.area[2]], [38, 41]]) {
      const target = x === 13 ? this.railDeck : decor;
      box(target, '#384452', x, railway.base+railway.height*.5, z, width, railway.height, railway.area[3]);
      for (const dz of [-2.3,-1.05,1.1,2.35]) box(target,'#a9afb3',x,3.084,z+dz,width,.075,.079);
      for (let xx = x - width / 2 + .22; xx < x + width / 2; xx += .70) {
        box(target,'#615953',xx,3.021,z-1.68,.22,.046,2.02);
        box(target,'#615953',xx,3.021,z+1.74,.22,.046,2.02);
      }
    }
    box(decor,'#726e65',bridge.area[0],bridge.base+bridge.height*.5,z,bridge.area[2],bridge.height,bridge.area[3]);
    for(let z=-46;z<-40;z+=1.1){
      box(decor,'#343f4b',36.98,5.82,z,.38,.54,1.12);
      box(decor,'#343f4b',49.04,5.82,z,.38,.54,1.12);
    }
    for (const x of [-44, -27, -10]) {
      box(decor, '#704e52', x, 3.72, -40.3, 11.6, 2.04, 2.65);
      box(decor, '#9c7167', x, 4.77, -40.3, 11.7, .12, 2.79);
      for (let i = -5.5; i < 5.6; i += .60) box(decor, '#925e5e', x + i, 3.72, -38.94, .105, 1.98, .09);
    }
    for (let z=-42;z>=-51;z-=2.25){
      glow(decor,'#995e48',13,elevation(13,z)+.057,z,5,4,.55);
      glow(this.serviceLights,'#ffc886',13,elevation(13,z)+.087,z,8,6,.95);
      box(this.serviceLights,'#ffd49b',16.84,elevation(16.84,z)+1.25,z,.13,.16,.54,true);
    }
  }

  setStoryLights(service:boolean, annotated:boolean, ending:'publish'|'protect'|null) {
    this.serviceLights.visible=service;
    this.garageMap.visible=annotated;
    this.relaySigns.visible=ending==='publish';
    this.civicSigns.visible=ending==='protect';
  }

  setPeriod(period:'morning'|'day'|'evening') {
    this.marketOpen.visible=period!=='evening';
    this.marketClosed.visible=period==='evening';
  }

  damageProp(id: string, dx: number, dz: number, strength: number) {
    const model = this.propModels.get(id);
    const prop = furniture.find(p => p.id === id);
    if (!model || !prop?.fragile || strength < 4.5) return false;
    const toppled = strength >= (prop.kind === 'lamp' ? 11 : 8);
    const tilt = toppled ? 1.46 : .25;
    model.rotation.x = tilt * dz;
    model.rotation.z = -tilt * dx;
    model.position.x = prop.at[0] + dx * (toppled ? .52 : .08);
    model.position.z = prop.at[1] + dz * (toppled ? .52 : .08);
    const light = model.getObjectByName('light');
    if (light) light.visible = !toppled;
    return toppled;
  }

  resetProps() {
    for (const prop of furniture) {
      const model = this.propModels.get(prop.id)!;
      model.position.set(prop.at[0],elevation(...prop.at),prop.at[1]);
      model.rotation.set(0,0,0);
      const light = model.getObjectByName('light');
      if (light) light.visible = true;
    }
  }

  updateVisibility(x: number, z: number, dt: number) {
    for (const roof of this.roofs) {
      const exposed = inRect(x, z + 1.55, roof.area, 1.42);
      roof.fade(exposed, dt);
      roof.slice.visible = !exposed;
    }
    this.fadeRail(x > 8.6 && x < 17.45 && z < -37 && z > -47.8 && elevation(x,z)<2.2,dt);
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
    fuseParts(this.body,this.legs);
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

export type CarSide = 'front' | 'rear' | 'left' | 'right';

export class CarModel extends T.Group {
  private readonly marks = new Map<CarSide, T.Group>();
  private readonly brakes = new T.Group();
  private readonly bends: { mesh: T.Mesh; side: CarSide; origin: T.Vector3 }[] = [];
  private readonly damage: Record<CarSide, number> = { front: 0, rear: 0, left: 0, right: 0 };

  constructor() {
    super();
    for(const x of [-.63,.63]) box(this.brakes,'#ff9e80',x,.756,-2.009,.39,.07,.033,true);
    this.brakes.visible = false;
    this.add(this.brakes);
    for (const side of ['front','rear','left','right'] as const) {
      const mark = new T.Group();
      const lengthwise = side === 'left' || side === 'right';
      const facing = side === 'front' || side === 'right' ? 1 : -1;
      for (const [n, tone] of ['#5a3940','#dba88f','#f6cfac'].entries()) {
        if (lengthwise) box(mark,tone,facing*.962,.79+n*.045,.21-n*.19,.025,.046,.64+n*.15);
        else box(mark,tone,-.15+n*.12,.755+n*.047,facing*1.97,.50+n*.12,.04,.025);
      }
      mark.visible = false;
      this.marks.set(side,mark);
      this.add(mark);
    }
  }

  bend(mesh: T.Mesh, side: CarSide) {
    this.bends.push({mesh, side, origin:mesh.position.clone()});
  }

  setBrake(on: boolean) { this.brakes.visible = on && this.damage.rear < 2.1; }

  fuseBody() { fuseParts(this,this.bends.map(part=>part.mesh)); }

  impact(side: CarSide, strength: number) {
    const level = clamp(this.damage[side] + (strength > 13 ? 2.2 : strength > 7 ? 1.1 : .43),0,3);
    this.damage[side] = level;
    const mark = this.marks.get(side)!;
    mark.visible = true;
    mark.scale.setScalar(1 + level * .065);
    for (const part of this.bends) {
      if (part.side !== side) continue;
      const {mesh, origin} = part;
      mesh.position.copy(origin);
      if (side === 'front' || side === 'rear') mesh.position.z *= 1 - level * .047;
      else mesh.position.x *= 1 - level * .067;
      mesh.position.y -= level * .042;
      mesh.rotation.y = level * (origin.x < 0 ? -.08 : .09);
      if (level >= 2.1 && mesh.name === 'lamp') mesh.visible = false;
    }
  }

  resetDamage() {
    for (const [side, mark] of this.marks) {
      this.damage[side] = 0;
      mark.visible = false;
    }
    for (const {mesh, origin} of this.bends) {
      mesh.position.copy(origin);
      mesh.rotation.y = 0;
      mesh.visible = true;
    }
  }
}

export function makeCar(color = '#48636d') {
  const car = new CarModel();
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
  box(car, '#28383e', 0, .997, -1.30, .84, .09, .52);
  for (const x of [-.29,.29]) box(car,'#b3a077',x,1.06,-1.3,.06,.045,.56);
  car.bend(box(car,'#3f565c',0,.54,1.934,1.91,.25,.13),'front');
  car.bend(box(car,'#43555e',0,.51,-1.934,1.91,.23,.13),'rear');
  for (const side of [-1, 1]) {
    const x = side * .92;
    car.bend(box(car,'#222c38',x,.62,0,.11,.092,3.84),side===-1?'left':'right');
    for (const z of [-1.22, 1.22]) {
      box(car, '#131a24', side * .943, .35, z, .29, .61, .67);
      box(car, '#5e6a75', side * 1.102, .36, z, .027, .34, .34);
    }
    const head = box(car, '#f1f4d3', side * .62, .76, 1.942, .46, .12, .066, true);
    const tail = box(car, '#ff5775', side * .61, .74, -1.963, .48, .10, .073, true);
    if (side > 0) { head.name = 'lamp'; tail.name = 'lamp'; }
    car.bend(head,'front');
    car.bend(tail,'rear');
  }
  glow(car, '#fff2c4', 0, .025, 3.08, 5.5, 4.6, .7);
  glow(car, '#ff476a', 0, .028, -2.1, 3.4, 2.8, .7);
  car.fuseBody();
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
