import type { Point } from './level';

export const places = {
  recordsSorel: [25.5,-7.6], recordsDoor: [-21.1,-21.8], recordsSide: [-13.75,-26.3], calendar: [-20.9,-28.3],
  nadia: [117.3,11.7], school: [89,14.2], stair: [94.4,-37.5], serviceWalk: [116.4,-43], portico: [103.7,-47.2],
  audit: [113.1,-11.1], register: [109,-26], sorel: [133,16], gallery: [118.6,-6.5],
  plateauNadia: [171.7,9.6], plateauSorel: [177,13], nadiaConsole: [173.8,-22.2], sorelConsole: [193,-10.6],
  restoredConsole: [196.1,-12.25], commander: [201.4,-27.7], varenne: [204.5,-30.6],
  module: [-27.2,19.85], servicePanel: [10.8,-50.9], residentLog: [120.7,-39.7], ines: [88.8,12.55],
  lise: [87,-8.8], keeper: [82.5,12.45], lockerDoor: [82,15.7], blackmail: [81.4,19.0], backRoom: [86.1,19.2],
  paper: [72,-91.1], paperNorth: [72,-85.85], paperSouth: [73.6,-96.1], paperOwner: [76.7,-98.1],
  lastGate: [222.15,-11.8], contracts: [-24.9,24.85],
  communityDesk: [198.6,10.9], lowParking:[45,-61.9], escapeParking:[51.15,-9.9],
} as const satisfies Record<string, Point>;
