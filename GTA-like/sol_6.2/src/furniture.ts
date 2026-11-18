import type { Point, Rect } from './level';
import { extensionFurniture } from './expansion';

export type Furniture = {
  id: string;
  at: Point;
  size: readonly [width: number, height: number, depth: number];
  kind: 'lamp' | 'crate' | 'cabinet' | 'tree' | 'bollard' | 'bench' | 'stall';
  tint: string;
  fragile?: boolean;
};

const lamps: readonly (readonly [number, number, string])[] = [
  [-34, 20, '#ffc783'], [-16, 21, '#bce4ce'], [-10, 8.4, '#ffa85f'], [-33, 8.15, '#ffc37a'],
  [-47, -8, '#ffd284'], [-44, 36, '#f6bb70'], [8, 9, '#fc91b0'], [22, 13, '#ffc389'], [36, 7, '#ffd58c'],
  [9, -11, '#ffc578'], [31, -8, '#ffbe6e'], [2, -24, '#8ed9ad'], [22.2, -35.4, '#ffc370'],
  [37.9, -16.9, '#ffcf81'], [49.3, -36, '#ffcd8c'], [36.8, -49, '#74bde7'], [19, -52, '#76eac6'],
  [-4, -54, '#cbdbad'], [-36, -53, '#ffcf8f'], [54.55, -6.9, '#c1b6fe'], [67, 6.6, '#9fd8ee'],
  [83, -6.6, '#eedab9'], [96, 7, '#ffcd81'], [112, 8, '#ffb67f'], [125, -8, '#9fefd7'],
  [138, 8, '#9fefd7'], [153, -6.7, '#abc7ff'], [169, -6.7, '#abc7ff'], [187, 7, '#d4d4ff'],
  [205, -10, '#85c7fb'], [219, 8, '#9db5fc'],
];

const crates: Point[] = [
  [-34, 16], [-33, 32], [-15.5, 13], [-31, -10], [-32, -31], [-8, -29], [-8, -27.4],
  [2.1, -27], [3.5, -27], [29, -21], [27.8, -30], [30.6, -17.5],
  [35, 15], [19, 29], [65, -11], [114, -26], [110.2, -28.4], [125, -36.8], [201, -31], [205, -34],
];

const trees: Point[] = [
  [-47, 37.5], [-34, 39.5], [-14, 7.9], [7, 8.2], [25, 39.5], [36, 38.6],
  [80, 12.65], [93, 8.2], [120, 39.5], [133, 8.2], [161, 7.9], [181, 8.3], [205, 8.8],
];

export const furniture: Furniture[] = [
  ...lamps.map(([x,z,tint], i): Furniture => ({ id:`lamp-${i}`, at:[x,z], size:[.33,3.8,.33], kind:'lamp', tint, fragile:true })),
  ...crates.map((at, i): Furniture => ({ id:`pallet-${i}`, at, size:[1.35,.84,1.30], kind:'crate', tint:i%3?'#675645':'#52656b', fragile:true })),
  ...trees.map((at, i): Furniture => ({ id:`planter-${i}`, at, size:[1.65,.53,1.4], kind:'tree', tint:'#526652' })),
  ...([[-28.8,17.8],[-19.2,17.8],[-20.9,21.4]] as Point[]).map((at,i): Furniture => ({
    id:`garage-tools-${i}`, at, size:[1.15,1.03,.66], kind:'cabinet', tint:'#af7954', fragile:true,
  })),
  { id:'utility-forecourt', at:[-7.5,16.3], size:[.55,1.06,.52], kind:'bollard', tint:'#dbab65', fragile:true },
  { id:'transit-bench', at:[-27.1,6.9], size:[2.5,.82,.68], kind:'bench', tint:'#8c7262' },
  { id:'dalle-bench', at:[92.7,9.7], size:[2.5,.82,.68], kind:'bench', tint:'#8c7262' },
  { id:'node-bench', at:[189,9], size:[2.5,.82,.68], kind:'bench', tint:'#778391' },
  ...extensionFurniture,
];

export function footprint({ at, size }: Furniture): Rect {
  return [at[0], at[1], size[0], size[2]];
}
