import type { Point } from './world';

/** Coordinates follow bible/05-plan-map-les-forges.md: origin at the north-west corner. */
export const FORGES = {
  width: 180,
  depth: 120,
  upperLevel: 6,
  railLevel: 3,
  lowerLevel: 0,
  garage: { x: 32, z: 50 } satisfies Point,
  playerStart: { x: 29, z: 51 } satisfies Point,
  carStart: { x: 33.2, z: 54 } satisfies Point,
  depot: { x: 89, z: 52 } satisfies Point,
  chip: { x: 88, z: 57 } satisfies Point,
  courtyard: { x: 116, z: 52 } satisfies Point,
  parking: { x: 112, z: 30 } satisfies Point,
  bridge: { x: 165, z: 75 } satisfies Point,
  stairTop: { x: 125, z: 65 } satisfies Point,
  stairBottom: { x: 125, z: 71 } satisfies Point,
  handoff: { x: 141, z: 100 } satisfies Point,
  package: { x: 39, z: 50 } satisfies Point,
  serviceGate: { x: 51, z: 60 } satisfies Point,
  camera: { x: 86, z: 38 } satisfies Point,
} as const;

export type RoadRoute = {
  id: string;
  points: readonly { x: number; z: number; y: number }[];
  width: number;
  sidewalk: boolean;
};

/** Road axes are shared by the rendered surface, collision strips and ambient traffic. */
export const ROAD_ROUTES: readonly RoadRoute[] = [
  {
    id: 'avenue-haute',
    width: 12,
    sidewalk: true,
    points: [
      { x: 8, z: 30, y: 6 }, { x: 32, z: 30, y: 6 }, { x: 50, z: 30, y: 6 },
      { x: 70, z: 19, y: 6 }, { x: 90, z: 19, y: 6 }, { x: 112, z: 30, y: 6 },
      { x: 136, z: 30, y: 6 }, { x: 153, z: 42, y: 6 }, { x: 165, z: 60, y: 6 },
      { x: 165, z: 87, y: 6 },
    ],
  },
  {
    id: 'rampe-rue-basse',
    width: 12,
    sidewalk: true,
    points: [
      { x: 165, z: 87, y: 6 }, { x: 160, z: 92, y: 4.7 }, { x: 154, z: 97, y: 2.7 },
      { x: 147, z: 99.5, y: .8 }, { x: 141, z: 100, y: 0 },
    ],
  },
  {
    id: 'rue-basse',
    width: 12,
    sidewalk: true,
    points: [
      { x: 141, z: 100, y: 0 }, { x: 124, z: 100, y: 0 }, { x: 105, z: 107, y: 0 },
      { x: 88, z: 110, y: 0 }, { x: 69, z: 110, y: 0 }, { x: 48, z: 106, y: 0 },
      { x: 30, z: 101, y: 0 }, { x: 16, z: 100, y: 0 },
    ],
  },
  {
    id: 'accès-garage',
    width: 7,
    sidewalk: false,
    points: [{ x: 32, z: 30, y: 6 }, { x: 32, z: 38, y: 6 }, { x: 32, z: 41.5, y: 6 }],
  },
  {
    id: 'accès-cour',
    width: 7,
    sidewalk: false,
    points: [{ x: 112, z: 30, y: 6 }, { x: 112, z: 38, y: 6 }, { x: 116, z: 42.5, y: 6 }],
  },
  {
    id: 'accès-dépôt',
    width: 7,
    sidewalk: false,
    points: [{ x: 90, z: 19, y: 6 }, { x: 89, z: 30, y: 6 }, { x: 89, z: 40, y: 6 }],
  },
  {
    id: 'allée-de-service',
    width: 4,
    sidewalk: false,
    points: [{ x: 46, z: 55 }, { x: 51, z: 60 }, { x: 58, z: 62 }, { x: 66, z: 62 }].map((p) => ({ ...p, y: 6 })),
  },
  {
    id: 'escalier-piéton',
    width: 4.5,
    sidewalk: false,
    points: [
      { x: 116, z: 61.5, y: 6 }, { x: 121, z: 63.5, y: 6 }, { x: 125, z: 65, y: 6 },
      { x: 125, z: 67, y: 4 }, { x: 125, z: 69, y: 2 }, { x: 125, z: 71, y: 0 },
    ],
  },
  {
    id: 'passage-sous-voies',
    width: 8,
    sidewalk: false,
    points: [{ x: 125, z: 71, y: 0 }, { x: 125, z: 78, y: 0 }, { x: 130, z: 84, y: 0 }, { x: 135, z: 90, y: 0 }],
  },
  {
    id: 'liaison-mina',
    width: 5,
    sidewalk: false,
    points: [{ x: 135, z: 90, y: 0 }, { x: 140, z: 95, y: 0 }, { x: 141, z: 100, y: 0 }],
  },
] as const;

export const TRAFFIC_ROUTES: readonly (readonly Point[])[] = [
  [{ x: 44, z: 30 }, { x: 68, z: 20 }, { x: 90, z: 20 }, { x: 112, z: 30 }, { x: 136, z: 30 }, { x: 153, z: 42 }, { x: 165, z: 60 }, { x: 165, z: 86 }],
  [{ x: 165, z: 83 }, { x: 165, z: 60 }, { x: 153, z: 42 }, { x: 136, z: 30 }, { x: 112, z: 30 }, { x: 90, z: 20 }, { x: 68, z: 20 }, { x: 44, z: 30 }],
  [{ x: 17, z: 100 }, { x: 30, z: 101 }, { x: 48, z: 106 }, { x: 69, z: 110 }, { x: 88, z: 110 }, { x: 105, z: 107 }, { x: 124, z: 100 }, { x: 141, z: 100 }],
] as const;

type RampSample = { x: number; y: number; z: number };

function catmullRomPoint(points: readonly { x: number; y: number; z: number }[], t: number): RampSample {
  const p = (points.length - 1) * t;
  let segment = Math.floor(p);
  let weight = p - segment;
  if (weight === 0 && segment === points.length - 1) { segment--; weight = 1; }
  const p1 = points[segment];
  const p2 = points[segment + 1];
  const p0 = segment > 0
    ? points[segment - 1]
    : { x: p1.x * 2 - p2.x, y: p1.y * 2 - p2.y, z: p1.z * 2 - p2.z };
  const p3 = segment + 2 < points.length
    ? points[segment + 2]
    : { x: p2.x * 2 - p1.x, y: p2.y * 2 - p1.y, z: p2.z * 2 - p1.z };
  const distanceStep = (a: RampSample, b: RampSample) => Math.pow((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2, .25);
  let dt0 = distanceStep(p0, p1);
  let dt1 = distanceStep(p1, p2);
  let dt2 = distanceStep(p2, p3);
  if (dt1 < 1e-4) dt1 = 1;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;

  const component = (a: number, b: number, c: number, d: number): number => {
    let tangent1 = (b - a) / dt0 - (c - a) / (dt0 + dt1) + (c - b) / dt1;
    let tangent2 = (c - b) / dt1 - (d - b) / (dt1 + dt2) + (d - c) / dt2;
    tangent1 *= dt1;
    tangent2 *= dt1;
    const c2 = -3 * b + 3 * c - 2 * tangent1 - tangent2;
    const c3 = 2 * b - 2 * c + tangent1 + tangent2;
    return b + tangent1 * weight + c2 * weight ** 2 + c3 * weight ** 3;
  };
  return {
    x: component(p0.x, p1.x, p2.x, p3.x),
    y: component(p0.y, p1.y, p2.y, p3.y),
    z: component(p0.z, p1.z, p2.z, p3.z),
  };
}

const rampRoute = ROAD_ROUTES.find((route) => route.id === 'rampe-rue-basse')!;
const rampSamples = Array.from({ length: 513 }, (_, index) => catmullRomPoint(rampRoute.points, index / 512));
const rampBounds = rampSamples.reduce((bounds, point) => ({
  minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
  minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

function rampHeightAt(x: number, z: number): number | null {
  const corridorRadius = 8.3;
  if (x < rampBounds.minX - corridorRadius || x > rampBounds.maxX + corridorRadius
    || z < rampBounds.minZ - corridorRadius || z > rampBounds.maxZ + corridorRadius) return null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let height = 0;
  for (let i = 0; i < rampSamples.length - 1; i++) {
    const a = rampSamples[i];
    const b = rampSamples[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 1e-8 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq)) : 0;
    const closestX = a.x + dx * t;
    const closestZ = a.z + dz * t;
    const distanceSq = (x - closestX) ** 2 + (z - closestZ) ** 2;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      height = a.y + (b.y - a.y) * t;
    }
  }
  return bestDistanceSq <= corridorRadius ** 2 ? height : null;
}

/** Walkable height function for the elevated district, stair and road ramp. */
export function groundHeightAt(point: Point): number {
  const { x, z } = point;
  if (x >= 121 && x <= 129 && z >= 64 && z <= 72) {
    const stairT = Math.max(0, Math.min(1, (z - 65) / 6));
    return 6 - stairT * 6;
  }
  if (x >= 121 && x <= 129 && z > 71 && z <= 90) return 0;
  if (x >= 157 && x <= 173 && z >= 59 && z <= 87) return 6;
  const rampHeight = rampHeightAt(x, z);
  if (rampHeight !== null) return rampHeight;
  if (z >= 70 && z <= 78) return 3;
  if (x >= 0 && x <= 180 && z >= 0 && z <= 68) return 6;
  return 0;
}
