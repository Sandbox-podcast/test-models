export type Point = readonly [x: number, z: number];
export type Rect = readonly [x: number, z: number, width: number, depth: number];
export type Building = { id: string; area: Rect; height: number; style: 'workshop' | 'brick' | 'housing' | 'civic'; sign?: string; accent?: string };
export type Wall = { area: Rect; height: number; color?: string; base?: number };
export type Gate = { id: string; area: Rect; accent: string; label: string };
export type Sensor = { id: string; at: Point; angle: number; district: number };
export type Patrol = { id: string; at: Point; route: Point[]; district: number; drone?: boolean };

export const bounds = { west: -57, east: 226, north: -62, south: 55 };
export const spawn: Point = [-24, 23];
export const garage: Point = [-24, 17.8];
export const carSpawn: Point = [-11, 21.5];
export const chip: Point = [23, -24];
export const northDock: Point = [19.8, -35.9];
export const exchange: Point = [13, -50];
export const sideContact: Point = [-27, -18];
export const dossier: Point = [-30.6, 33.5];
export const residents: Point = [86, 13];
export const register: Point = [109, -26];
export const collective: Point = [103, -3];
export const sorel: Point = [133, 16];
export const nodeContact: Point = [177, 13];
export const relay: Point = [197, -27];

export const blocks: Rect[] = [
  [-26, 22, 46, 33], [24, 22, 34, 32], [-26, -21, 46, 29], [23, -21, 36, 31],
  [82, 23, 29, 38], [122, 23, 37, 39], [85, -22, 22, 31], [122, -23, 40, 31],
  [178, 25, 30, 35], [210, 24, 25, 37], [195, -25, 56, 32],
];

export const roads: Rect[] = [
  [84.5, 0, 283, 10], [-53, -2.5, 8, 89], [43, -5, 10, 112], [-0.5, 5, 9, 84],
  [-2, 43, 110, 9], [23, -51, 47, 8], [-13, -53, 42, 5], [-22, 12, 49, 5],
  [105, 3, 7, 85], [144, 1, 8, 89], [175, -1, 8, 90], [149, 43, 150, 7],
  [198, -46, 54, 7],
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
  { id: 'workshop-west', area: [-21, -28, 14, 10], height: 5.2, style: 'workshop', sign: 'LIVRAISONS', accent: '#98e0fd' },
  { id: 'kiosk', area: [-19, -10.5, 9, 5.5], height: 3.3, style: 'workshop', sign: 'DISPENSAIRE', accent: '#68f0cd' },
  { id: 'mill-east', area: [34.5, -26, 6, 16], height: 6, style: 'brick' },
  { id: 'annex', area: [34, -11, 8, 5.5], height: 4.5, style: 'workshop', sign: 'CONTRÔLE', accent: '#ffb65e' },
  { id: 'dalle-a', area: [76, 26, 14, 18], height: 11, style: 'housing', sign: 'RÉSIDENCE 04', accent: '#ffb777' },
  { id: 'dalle-b', area: [94, 29, 11, 17], height: 9.2, style: 'housing' },
  { id: 'dalle-c', area: [119, 30, 15, 18], height: 9, style: 'housing', sign: 'TRAVERSÉE', accent: '#72edd3' },
  { id: 'dalle-d', area: [133, 28, 8, 12], height: 6, style: 'housing' },
  { id: 'dalle-e', area: [84, -23, 14, 18], height: 9, style: 'housing', sign: 'PHARMACIE', accent: '#8ae8cd' },
  { id: 'dalle-f', area: [133, -25, 13, 18], height: 8, style: 'housing', sign: 'MAISON CIVILE', accent: '#8aa6ff' },
  { id: 'node-west', area: [164, -26, 11, 21], height: 10, style: 'civic', sign: 'CONTRÔLE CIVIL', accent: '#ffd26d' },
  { id: 'node-south', area: [180, 30, 14, 21], height: 9.6, style: 'civic', sign: 'ADMINISTRATION', accent: '#88ecff' },
  { id: 'node-east', area: [210, 24, 17, 18], height: 13, style: 'civic', sign: 'IDENTITÉ', accent: '#a6bcff' },
  { id: 'node-back', area: [214, -28, 10, 25], height: 12.6, style: 'civic', sign: 'SERVEURS', accent: '#a6bcff' },
];

export const rooms = [
  { id: 'garage', area: [-24, 18.1, 14, 8.5] as Rect, height: 3.55, accent: '#64eccb' },
  { id: 'depot', area: [20, -24, 24, 20] as Rect, height: 5.8, accent: '#ffbb5e' },
  { id: 'archive', area: [109, -26, 19, 20] as Rect, height: 5.2, accent: '#8ee9db' },
  { id: 'core', area: [194, -27, 26, 24] as Rect, height: 9.3, accent: '#a0c4ff' },
];

export const gates: Gate[] = [
  { id: 'depot-gate', area: [8, -24, 0.55, 4], accent: '#ffbd67', label: 'Grille du quai' },
  { id: 'service', area: [9, -50, 0.7, 3.6], accent: '#6df9cb', label: 'Passage de service' },
  { id: 'gallery', area: [121, -6.5, 0.6, 4.8], accent: '#6df9cb', label: 'Galerie du collectif' },
  { id: 'community', area: [181, -29, 0.6, 4.7], accent: '#6df9cb', label: 'Accès communautaire' },
  { id: 'badge', area: [192.5, -15, 5, 0.6], accent: '#a8cbff', label: 'Accès de service' },
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
  { area: [-8.5, -38, 33, 2], height: 2, color: '#3d474d' },
  { area: [27.3, -38, 19.5, 2], height: 2, color: '#3d474d' },
  { area: [-38, -41, 26, 7.8], height: 2.5, color: '#41464a' },
  { area: [-8.5, -41, 33, 7.8], height: 2.5, color: '#41464a' },
  { area: [27.3, -41, 19.5, 7.8], height: 2.5, color: '#41464a' },
  { area: [54, -41, 10, 7.8], height: 2.5, color: '#41464a' },
  { area: [8.7, -46.5, 0.5, 5.2], height: 2.9, base: -2.4 },
  { area: [17.2, -48, 0.5, 8], height: 2.9, base: -2.4 },
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
  { area: [194.2, -39, 26.4, 0.7], height: 8 },
  { area: [207, -30.2, 0.7, 17.5], height: 8 },
  { area: [196.4, -24.8, 4.7, 2.2], height: 2.25, color: '#415776' },
  { area: [146, -39, 3, 24], height: 3.4, color: '#6f6e67' },
  { area: [146, 28, 3, 35], height: 3.4, color: '#6f6e67' },
  { area: [-57, -3.5, 1, 117], height: 3.8 }, { area: [226, -3.5, 1, 117], height: 3.8 },
  { area: [84.5, -62, 283, 1], height: 3.8 }, { area: [84.5, 55, 283, 1], height: 3.8 },
];

export const sensors: Sensor[] = [
  { id: 'depot-eye', at: [30.7, -15.1], angle: -2.6, district: 0 },
  { id: 'archive-eye', at: [116.5, -30], angle: 2.65, district: 1 },
  { id: 'node-eye-a', at: [199.5, -17], angle: 1.8, district: 2 },
  { id: 'node-eye-b', at: [192, -37.5], angle: 0, district: 2 },
];

export const patrols: Patrol[] = [
  { id: 'quai', at: [13, -29.5], route: [[12, -30], [19, -30], [18, -20], [12, -20]], district: 0 },
  { id: 'avenue', at: [23, -9], route: [[23, -10], [17, -9], [10, -10], [10, -3], [25, -5]], district: 0 },
  { id: 'archive', at: [104, -27], route: [[104, -31], [111, -31], [113, -20], [103, -20]], district: 1 },
  { id: 'court', at: [116, -12], route: [[116, -11], [112, -13], [103, -12], [91, -12]], district: 1 },
  { id: 'node-a', at: [187, -34], route: [[187, -35], [200, -34], [203, -20], [185, -22]], district: 2 },
  { id: 'node-b', at: [203, -13], route: [[205, -12], [194, -11], [180, -12], [182, -6]], district: 2 },
  { id: 'drone', at: [211, -11], route: [[210, -11], [210, -19], [203, -18], [200, -12]], district: 2, drone: true },
];

export const pedestrians: { at: Point; to: Point; tint: string; name?: string }[] = [
  { at: [-16, 7], to: [-42, 7], tint: '#c47868' },
  { at: [31, 5.6], to: [8, 5.6], tint: '#66a8a9' },
  { at: [-49, 14], to: [-49, 37], tint: '#aead6a' },
  { at: [-39, -5.6], to: [-18, -5.6], tint: '#7b779d' },
  { at: [35, 39], to: [10, 39], tint: '#896e9d' },
  { at: [74, 6.5], to: [96, 6.5], tint: '#a8798d' },
  { at: [125, 6.5], to: [108, 6.5], tint: '#e4a778' },
  { at: [133, -7], to: [125, -7], tint: '#63b2a5' },
  { at: [152, 7], to: [172, 7], tint: '#808baf' },
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
];

export const districtNames = ['Les Forges', 'La Dalle', 'Le Nœud'] as const;
export const vehicleExclusions: Rect[] = [[13, -45.05, 8.15, 19.6]];
export const districtAt = (x: number) => x < 59 ? 0 : x < 151 ? 1 : 2;
export const inRect = (x: number, z: number, [cx, cz, w, d]: Rect, pad = 0) =>
  Math.abs(x - cx) <= w / 2 + pad && Math.abs(z - cz) <= d / 2 + pad;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function elevation(x: number, z: number) {
  const hillside = 6.8 * clamp((x - 57) / 20, 0, 1) + 4.4 * clamp((x - 140) / 20, 0, 1);
  const bridge = x >= 37.5 && x <= 48.5
    ? 2.7 * Math.min(clamp((-z - 27) / 10, 0, 1), clamp((z + 57) / 11, 0, 1)) : 0;
  const edge = Math.max(8.9 - x, x - 17.05, 0);
  const stairWidth = edge === 0 ? 1 : z < -52 ? clamp(1 - edge / 2.8, 0, 1) : 0;
  const underpass = -2.7 * stairWidth * Math.min(clamp((-z - 35.5) / 5.5, 0, 1), clamp((z + 57.5) / 6, 0, 1));
  const serviceRamp = x <= 9.3
    ? -2.7 * clamp((x - 3) / 5.8, 0, 1) * clamp((4.1 - Math.abs(z + 50.5)) / 2.65, 0, 1) : 0;
  return hillside + bridge + Math.min(underpass, serviceRamp);
}
