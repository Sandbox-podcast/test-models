import { extensionBlocks, extensionBuildings, extensionNavigation, extensionWalls } from './expansion';
import { roadHeight } from './roads';


export function foundation([x,z,w,d]: Rect) {
  return Math.min(elevation(x,z), ...[-1,1].flatMap(a=>[-1,1].map(b=>elevation(x+a*w*.5,z+b*d*.5))));
}
import { places as p } from './places';

export type Point = readonly [x: number, z: number];
export type Rect = readonly [x: number, z: number, width: number, depth: number];
export type Building = { id: string; area: Rect; height: number; style: 'workshop' | 'brick' | 'housing' | 'civic'; sign?: string; accent?: string };
export type Wall = { area: Rect; height: number; color?: string; base?: number };
export type Gate = { id: string; area: Rect; accent: string; label: string };
export type Sensor = { id: string; at: Point; angle: number; district: number };
export type Patrol = { id: string; at: Point; route: Point[]; district: number; drone?: boolean };

export const bounds = { west: -57, east: 237, north: -123, south: 112 };
export const spawn: Point = [-24, 23];
export const garage: Point = [-24, 17.8];
export const carSpawn: Point = [-11, 21.5];
export const chip: Point = [23, -24];
export const northDock: Point = [19.8, -35.9];
export const exchange: Point = [13, -50];

export const blocks: Rect[] = [
  [-26, 22, 46, 33], [24, 22, 34, 32], [-26, -21, 46, 29], [23, -21, 36, 31],
  [82, 23, 29, 38], [122, 23, 37, 39], [85, -22, 22, 31], [122, -23, 40, 31],
  [178, 25, 30, 35], [210, 24, 25, 37], [195, -25, 56, 32],
  ...extensionBlocks,
];

export const roads: Rect[] = [
  [-7, 0, 100, 12], [115, 0, 30, 11], [206.5, 0, 61, 11], [-53, -2.5, 8, 89], [43, 11.5, 12, 75], [-0.5, 5, 9, 84],
  [-2, 43, 110, 9], [23, -51, 47, 8], [-13, -53, 42, 5], [-22, 12, 49, 5],
  [105, 3, 7, 85], [144, 1, 8, 89], [175, -1, 8, 90], [149, 43, 150, 7],
  [198, -46, 54, 7], [49.6,-9.9,6.9,7],
];

export const buildings: Building[] = [
  { id: 'garage-back', area: [-24, 13.9, 14, 3.2], height: 3.5, style: 'workshop', sign: 'GARAGE MINA', accent: '#68f0cd' },
  { id: 'forge-press', area: [-41, 24, 12, 16], height: 7, style: 'brick', sign: 'ATELIERS 06', accent: '#ffbd66' },
  { id: 'repair', area: [-22, 34, 12, 7], height: 3.8, style: 'workshop', sign: 'RÉPARATIONS', accent: '#81c9e6' },
  { id: 'printing', area: [-8.5, 30.5, 6, 8], height: 4.6, style: 'brick' },
  { id: 'club', area: [13, 19, 15, 12], height: 6.6, style: 'brick', sign: 'LE MERCURE', accent: '#ff6098' },
  { id: 'arcade', area: [30, 29, 16, 10], height: 8, style: 'housing', sign: 'CHAMBRES', accent: '#a3b5fb' },
  { id: 'cafe', area: [31, 10.5, 10, 6], height: 4.5, style: 'workshop', sign: 'CAFÉ 24H', accent: '#f49c55' },
  { id: 'brick-west', area: [-41, -20, 13, 19], height: 8, style: 'brick', sign: 'FONDERIE', accent: '#d2a775' },
  { id: 'kiosk', area: [-19, -10.5, 9, 5.5], height: 3.3, style: 'workshop', sign: 'DISPENSAIRE', accent: '#68f0cd' },
  { id: 'mill-east', area: [34.5, -26, 6, 16], height: 6, style: 'brick' },
  { id: 'annex', area: [34, -11, 8, 5.5], height: 4.5, style: 'workshop', sign: 'CONTRÔLE', accent: '#ffb65e' },
  { id: 'dalle-a', area: [76, 28, 14, 14], height: 11, style: 'housing', sign: 'RÉSIDENCE 04', accent: '#ffb777' },
  { id: 'dalle-b', area: [94, 29, 11, 17], height: 9.2, style: 'housing' },
  { id: 'dalle-c', area: [119, 30, 15, 18], height: 9, style: 'housing', sign: 'TRAVERSÉE', accent: '#72edd3' },
  { id: 'dalle-d', area: [133, 28, 8, 12], height: 6, style: 'housing' },
  { id: 'dalle-e', area: [84, -23, 14, 18], height: 9, style: 'housing', sign: 'PHARMACIE', accent: '#8ae8cd' },
  { id: 'dalle-f', area: [133, -25, 13, 18], height: 8, style: 'housing', sign: 'MAISON CIVILE', accent: '#8aa6ff' },
  { id: 'node-west', area: [164, -26, 11, 21], height: 10, style: 'civic', sign: 'CONTRÔLE CIVIL', accent: '#ffd26d' },
  { id: 'node-south', area: [180, 30, 14, 21], height: 9.6, style: 'civic', sign: 'ADMINISTRATION', accent: '#88ecff' },
  { id: 'node-east', area: [210, 24, 17, 18], height: 13, style: 'civic', sign: 'IDENTITÉ', accent: '#a6bcff' },
  { id: 'node-back', area: [214, -28, 10, 25], height: 12.6, style: 'civic', sign: 'SERVEURS', accent: '#a6bcff' },
  ...extensionBuildings,
];

export const rooms = [
  { id: 'garage', area: [-24, 18.1, 14, 8.5] as Rect, height: 3.55, accent: '#64eccb' },
  { id: 'depot', area: [20, -24, 24, 20] as Rect, height: 5.8, accent: '#ffbb5e' },
  { id: 'archive', area: [109, -26, 19, 20] as Rect, height: 5.2, accent: '#8ee9db' },
  { id: 'core', area: [194, -27, 26, 24] as Rect, height: 9.3, accent: '#a0c4ff' },
  { id:'records',area:[-21,-28,14,10] as Rect,height:4.8,accent:'#9dd5ba' },
  { id:'housing',area:[105,-47,19,12] as Rect,height:4.8,accent:'#f4be92' },
  { id:'shop',area:[82.3,18.1,7.2,5.3] as Rect,height:3.8,accent:'#e2ae94' },
  { id:'paper',area:[72,-91,15,8] as Rect,height:6.4,accent:'#abdacb' },
];

export const gates: Gate[] = [
  { id: 'depot-gate', area: [8, -24, 0.55, 4], accent: '#ffbd67', label: 'Grille du quai' },
  { id: 'service', area: [9, -50, 0.7, 3.6], accent: '#6df9cb', label: 'Passage de service' },
  { id: 'gallery', area: [121, -6.5, 0.6, 4.8], accent: '#6df9cb', label: 'Galerie du collectif' },
  { id: 'community', area: [181, -29, 0.6, 4.7], accent: '#6df9cb', label: 'Accès communautaire' },
  { id: 'badge', area: [192.5, -15, 5, 0.6], accent: '#a8cbff', label: 'Accès de service' },
  { id:'records-front',area:[-21.1,-23,3.7,.62],accent:'#b4d6b9',label:'Porche des archives' },
  { id:'records-side',area:[-14,-26.3,.55,3.4],accent:'#94dfb6',label:'Grille des archives' },
  { id:'shop-door',area:[82,15.45,2.05,.45],accent:'#dfa894',label:'Arrière-boutique' },
  { id:'residence-court',area:[111.3,17.4,3.1,.45],accent:'#8be5b6',label:'Porte de cour' },
  { id:'paper-way',area:[138.7,-95,.48,3.2],accent:'#81e6c8',label:'Raccourci du coteau' },
  { id:'night-exit',area:[221.4,-16.75,4.2,.45],accent:'#8de1c8',label:'Sortie de nuit' },
  { id:'night-passage',area:[197.5,-39,4.9,.56],accent:'#a9bafb',label:'Coursive nord' },
];

export const walls: Wall[] = [
  { area: [-30.7, 18.4, 0.55, 8], height: 3.3 }, { area: [-17.3, 18.4, 0.55, 8], height: 3.3 },
  { area: [12.7, -14, 9.6, 0.7], height: 5.15 }, { area: [27.7, -14, 8.6, 0.7], height: 5.15 },
  { area: [32, -24, 0.7, 20], height: 5.15 },
  { area: [8, -18, 0.7, 8], height: 5.15 }, { area: [8, -30, 0.7, 8], height: 5.15 },
  { area: [12.6, -34, 9.2, 0.7], height: 5.15 }, { area: [27.7, -34, 8.6, 0.7], height: 5.15 },
  { area: [13.2, -28.5, 3.6, 1.8], height: 1.9, color: '#725948' },
  { area: [26.8, -19, 3.2, 2.2], height: 1.75, color: '#725948' },
  { area: [-0.7, -28.4, 2.6, 4.2], height: 1.65, color: '#4c6a70' },
  { area: [-24.6, -37.8, 65.15, 1.25], height: 7.26, base:0, color: '#857d6c' },
  { area: [27.22, -37.8, 19.35, 1.25], height: 7.26, base:0, color: '#857d6c' },
  { area: [-24.55, -41.65, 65.25, 6.4], height: 3, base:0, color: '#8b8477' },
  { area: [27.3, -41.65, 19.55, 6.4], height: 3, base:0, color: '#8b8477' },
  { area: [54.3, -41.65, 10.9, 7.8], height: 7.3, base:0, color: '#857d6c' },
  { area: [8.7, -46.5, 0.5, 5.2], height: 2.55, base:0, color:'#938a78' },
  { area: [17.2, -47.5, 0.5, 7], height: 2.55, base:0, color:'#938a78' },
  { area: [9.4, -34.9, 0.45, 0.5], height: 1.1, color: '#dbac5b' },
  { area: [12.8, -34.9, 0.45, 0.5], height: 1.1, color: '#dbac5b' },
  { area: [16.4, -34.9, 0.45, 0.5], height: 1.1, color: '#dbac5b' },
  { area: [111.5, -16, 14, 0.65], height: 4.8 },
  { area: [99.5, -26, 0.65, 20], height: 4.8 },
  { area: [118.5, -28, 0.65, 16], height: 4.8 },
  { area: [105.2, -36, 11.4, 0.65], height: 4.8 }, { area: [117.5, -36, 2, 0.65], height: 4.8 },
  { area: [108, -24, 2, 4], height: 1.9, color: '#53736f' },
  { area: [121, -12.4, 0.7, 7], height: 2.5, color: '#57716e' },
  { area: [121, -2.6, 0.7, 2.95], height: 2.5, color: '#57716e' },
  { area: [181, -35, 0.7, 9], height: 8 }, { area: [181, -21, 0.7, 9], height: 8 },
  { area: [187, -15, 7, 0.7], height: 8 }, { area: [201.4, -15, 12.7, 0.7], height: 8 },
  { area: [188.2, -39, 13.92, 0.7], height: 8 }, {area:[203.48,-39,7.06,.7],height:8},
  { area: [207, -30.2, 0.7, 17.5], height: 8 },
  { area: [196.4, -24.8, 4.7, 2.2], height: 2.25, color: '#415776' },
  { area: [146, -39, 3, 24], height: 3.4, color: '#6f6e67' },
  { area: [146, 28, 3, 35], height: 3.4, color: '#6f6e67' },
  { area: [-57, -5.5, 1, 235], height: 18, base:0 }, { area: [237, -5.5, 1, 235], height: 18, base:0 },
  { area: [90, -123, 294, 1], height: 9, base:0 }, { area: [90, 112, 294, 1], height: 18, base:0 },
  { area: [-12, -62, 90, .8], height: 3.8, base:0 },
  { area: [198, -62, 76, .8], height: 12.9, base:0 },
  { area: [19, 55, 152, .8], height: 8.2, base:0 },
  {area:[-21,-33,14,.55],height:4.5}, {area:[-28,-28,.55,10],height:4.5},
  {area:[-25.48,-23,5.04,.55],height:4.5}, {area:[-16.6,-23,5.18,.55],height:4.5},
  {area:[-14,-30.5,.55,5.1],height:4.5}, {area:[-14,-23.8,.55,1.65],height:4.5},
  {area:[105,-53,19,.55],height:4.2}, {area:[105,-41,19,.55],height:4.2},
  {area:[95.5,-51,.55,4],height:4.2}, {area:[95.5,-43.3,.55,4.6],height:4.2},
  {area:[114.5,-49,.55,8],height:4.2}, {area:[114.5,-41,.55,1.3],height:4.2},
  {area:[78.7,18.1,.46,5.3],height:3.5}, {area:[82.3,20.75,7.2,.46],height:3.5},
  {area:[79.78,15.45,2.2,.46],height:3.5}, {area:[84.49,15.45,2.7,.46],height:3.5},
  {area:[85.9,16.91,.46,2.92],height:3.5},
  {area:[64.5,-91,.53,8],height:5.9}, {area:[79.5,-91,.53,8],height:5.9},
  {area:[67.62,-87,6.2,.53],height:5.9}, {area:[76.37,-87,6.3,.53],height:5.9},
  {area:[68.27,-95,7.5,.53],height:5.9}, {area:[77.07,-95,4.85,.53],height:5.9},
  {area:[109.23,17.4,1.0,.46],height:1.9,color:'#927d70'}, {area:[114.07,17.4,2.45,.46],height:1.9,color:'#927d70'},
  {area:[138.7,-98.8,.46,4.5],height:1.65}, {area:[138.7,-91.1,.46,4.62],height:1.65},
  {area:[219,-16.75,.6,.5],height:1.65}, {area:[223.9,-16.75,.8,.5],height:1.65},
  ...extensionWalls,
];

export const sensors: Sensor[] = [
  { id: 'depot-eye', at: [30.7, -15.1], angle: -2.6, district: 0 },
  { id: 'archive-eye', at: [116.5, -30], angle: 2.65, district: 1 },
  { id: 'node-eye-a', at: [199.5, -17], angle: 1.8, district: 2 },
  { id: 'node-eye-b', at: [192, -37.5], angle: 0, district: 2 },
];

export const patrols: Patrol[] = [
  { id: 'quai', at: [13, -30.25], route: [[12, -30], [19, -30], [18, -20], [12, -20]], district: 0 },
  { id: 'avenue', at: [23, -9], route: [[23, -10], [17, -9], [10, -10], [10, -3], [25, -5]], district: 0 },
  { id:'archiviste',at:[-23.5,-26.7],route:[[-23.5,-26.7],[-21.1,-24.4],[-21.1,-21.6],[-24.25,-18.5],[-21.1,-21.6]],district:0 },
  { id:'residence',at:[108.8,-44.8],route:[[108.8,-44.8],[113,-43],[116,-43],[119,-47],[116,-43]],district:1 },
  { id: 'archive', at: [104, -27], route: [[104, -31], [111, -31], [113, -20], [103, -20]], district: 1 },
  { id: 'court', at: [116, -12], route: [[116, -11], [112, -13], [103, -12], [91, -12]], district: 1 },
  { id: 'node-a', at: [187, -34], route: [[187, -35], [200, -34], [203, -20], [185, -22]], district: 2 },
  { id: 'node-b', at: [203, -13], route: [[205, -12], [194, -11], [180, -12], [182, -6]], district: 2 },
  { id: 'drone', at: [211, -11], route: [[210, -11], [210, -19], [203, -18], [200, -12]], district: 2, drone: true },
];

export const navigation: Point[] = [
  [-24, 18], [-24, 8], [-8, 8], [-4, -7], [-4, -23], [-4, -33], [5.5, -33], [5.5, -24],
  [5.5, -10], [5.5, -35.9], [13, -31], northDock, [20, -32], [21, -26], [21, -17], [20, -12],
  [21, -7], [9, -7], [32, -6], [38, -7], [43, -15], [43, -31], [43, -44], [43, -53],
  [32, -52], [18.5, -53.6], [13, -54], [13, -47], [13, -38], [13, -32],
  [1, -51], [-21, -51], [-52, -49], [-52, 0], [-52, 40], [-15, 41], [1, 41],
  [1, 12], [22, 12], [42, 12], [58, 0], [72, 0], [92, 0], [105, 0], [121, 0], [145, 0],
  [97, -12], [104, -12], [104, -19], [102, -25], [104, -30], [113, -31], [113, -37],
  [120, -39], [122, -30], [122, -12], [126, -8], [126, 7], [103, 11], [144, 15],
  [161, 0], [175, 0], [192, 0], [214, 0], [175, -13], [176, -28], [176, -42], [207, -44],
  [220, -36], [220, -22], [209, -19], [204, -24], [199, -31], [189, -29], [189, -21],
  [192, -14], [193, -11], [201, -11], [211, -11], [211, 7],
  [-23.5,-26.7],[-21.1,-24.4],p.recordsDoor,[-24.25,-18.5],[-13,-26.3],[-17,-26.3],
  [93.6,-47.1],[97.8,-47.1],p.portico,[113,-43],[116,-43],[118,-47],
  [198,-43],[197.5,-38],p.commander,[217,-14],[222,-12],[222,-19],
  ...extensionNavigation,
];

export const districtNames = ['Les Forges', 'La Dalle', 'Le Nœud', 'Les Quais', 'Les Belvédères'] as const;
export const vehicleExclusions: Rect[] = [[13, -42.2, 8.15, 14.7], [100,-106,107,8]];
export const crossingSurfaces = {
  bridge: { area:[43,-42,11.92,8.45] as Rect, base:5.58, height:.4 },
  railway: { area:[13,-42,9,7.4] as Rect, base:2.23, height:.44 },
  tunnel: { area:[13,-45.3,7.95,8.5] as Rect, base:-.27, height:.27 },
};
export const districtAt = (x: number, z = 0) => z < -63 && x > 38 && x < 158 ? 3
  : z > 55 && x > 96 ? 4 : x < 59 ? 0 : x < 151 ? 1 : 2;
export const inRect = (x: number, z: number, [cx, cz, w, d]: Rect, pad = 0) =>
  Math.abs(x - cx) <= w / 2 + pad && Math.abs(z - cz) <= d / 2 + pad;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function elevation(x: number, z: number) {
  let ground = 6 - 2 * clamp((x - 56) / 24, 0, 1) + 8 * clamp((x - 141) / 20, 0, 1);
  const coteau = clamp((x - 66) / 17, 0, 1) * clamp((145 - x) / 15, 0, 1);
  ground += coteau * (7.8 * clamp((-z - 7) / 49, 0, 1) - 3.7 * clamp((z - 9) / 38, 0, 1));
  if (x < 60 && z < -36.4) {
    const railGround = 6 - 3.37 * clamp((-z - 36.4) / 1.15,0,1) - 2.63 * clamp((-z - 44.5) / 3,0,1);
    ground = ground + (railGround-ground) * clamp((60-x)/3,0,1);
  }
  if (z < -35.1 && x >= 8.9 && x <= 17.05) ground = Math.min(ground, 6 * clamp((z+41.2)/6.1,0,1));
  if(x >= 48 && x < 156 && z < -63) {
    const quay = 2 * clamp((z+105) / 25,0,1);
    ground += (quay-ground)*clamp((-z-63)/6,0,1);
  }
  if(x > 98 && z > 53) {
    const terrace=4+8*clamp((x-109)/88,0,1);
    ground+=(terrace-ground)*clamp((z-53)/8,0,1);
  }
  const path=roadHeight(x,z);
  return path ? ground+(path.height-ground)*path.weight : ground;
}
