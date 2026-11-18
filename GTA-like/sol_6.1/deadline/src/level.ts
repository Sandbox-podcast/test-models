export interface Block { id: string; x: number; z: number; w: number; d: number; h: number; color: number; sign?: string; neon?: number; }
export interface Point { x: number; z: number; }
export const LOC = {
 garage: { x: -95, z: 70 }, car: { x: -79, z: 68 }, chip: { x: -85, z: -43 },
 drop: { x: -7, z: 8 }, gate: { x: -18, z: 36 }, depotGate: { x: -66, z: -39 },
 collective: { x: 68, z: 66 }, registry: { x: 117, z: 32 }, sorel: { x: 14, z: -63 },
 server: { x: 97, z: -82 }, nodeGate: { x: 64, z: -54 }, gallery: { x: 80, z: -42 },
 side: { x: -117, z: 15 }, sideDrop: { x: 75, z: 83 }
};
export const BOUNDS = { minX: -147, maxX: 151, minZ: -132, maxZ: 120 };
export const BLOCKS: Block[] = [
 {id:'garage',x:-108,z:78,w:24,d:20,h:6,color:0x283c46,sign:'MINA // MÉCANIQUE',neon:0x73e3d1},
 {id:'workshop',x:-108,z:39,w:27,d:25,h:7,color:0x303e49,sign:'ATELIERS 07',neon:0xffb854},
 {id:'warehouse',x:-105,z:-47,w:27,d:29,h:10,color:0x2d3a42,sign:'CIVITAS / LOGISTIQUE',neon:0xff6258},
 {id:'depot-south',x:-91,z:-19,w:49,d:8,h:4,color:0x23323c},
 {id:'depot-north',x:-91,z:-67,w:49,d:8,h:4,color:0x23323c},
 {id:'forge1',x:-43,z:75,w:30,d:23,h:9,color:0x383e49,sign:'HÔTEL DES OUBLIÉS',neon:0xe77aa1},
 {id:'forge2',x:-43,z:29,w:25,d:21,h:7,color:0x263740,sign:'NUIT / PHARMACIE',neon:0x6ad7b0},
 {id:'forge3',x:0,z:75,w:23,d:24,h:12,color:0x343b48,sign:'LES FORGES',neon:0xffb854},
 {id:'forge4',x:-42,z:-53,w:25,d:25,h:8,color:0x2b3b49,sign:'FRET 24',neon:0x80c4df},
 {id:'west',x:-131,z:-95,w:20,d:35,h:14,color:0x27353f},
 {id:'rail-office',x:-13,z:-94,w:28,d:27,h:10,color:0x293845,sign:'GARE BASSE',neon:0xffb854},
 {id:'dalle1',x:47,z:49,w:23,d:21,h:14,color:0x3d3b48,sign:'LES EFFACÉS',neon:0xe58ab5},
 {id:'dalle2',x:91,z:57,w:20,d:22,h:17,color:0x323b4d,sign:'RÉSIDENCE 14',neon:0x8db1e8},
 {id:'dalle3',x:125,z:64,w:22,d:22,h:13,color:0x3f3e49,sign:'BAINS PUBLICS',neon:0xf2b65d},
 {id:'dalle4',x:48,z:98,w:24,d:20,h:18,color:0x34394a},
 {id:'dalle5',x:104,z:101,w:40,d:18,h:15,color:0x383744,sign:'LA DALLE',neon:0xe58ab5},
 {id:'archive1',x:121,z:16,w:30,d:9,h:8,color:0x3b404a,sign:'ARCHIVES / IDENTITÉS',neon:0xffb854},
 {id:'archive2',x:138,z:33,w:8,d:26,h:7,color:0x3b404a},
 {id:'node1',x:47,z:-93,w:24,d:40,h:22,color:0x34434d,sign:'CIVITAS',neon:0x6adce2},
 {id:'node2',x:118,z:-101,w:32,d:20,h:19,color:0x2f404a,sign:'RÉVOCATIONS',neon:0x6adce2},
 {id:'node3',x:126,z:-58,w:21,d:28,h:15,color:0x34434a},
 {id:'node4',x:83,z:-120,w:30,d:12,h:10,color:0x293942},
 {id:'admin',x:33,z:-41,w:17,d:13,h:8,color:0x33424a,sign:'SERVICE / C',neon:0x78ddd6},
];
export function heightAt(x: number, z: number): number {
  const east = Math.max(0, Math.min(1, (x - 17) / 20));
  const north = Math.max(0, Math.min(1, (-z - 12) / 23));
  const bridge = Math.abs(x + 65) < 7 ? Math.max(0, Math.min(1, (26 - Math.abs(z + 4)) / 12)) * 5 : 0;
  return Math.max(east * (3 + north * 3), bridge);
}
export function district(x: number, z: number) { return x < 23 ? 'Les Forges' : z > -14 ? 'La Dalle' : 'Le Nœud'; }
export const DISTRICTS = [
 { name: 'Les Forges', text: 'La ville basse', x: -75, z: 45, color: '#f6b94a' },
 { name: 'La Dalle', text: 'Les rues du coteau', x: 88, z: 65, color: '#e58ab5' },
 { name: 'Le Nœud', text: 'Le plateau administratif', x: 84, z: -76, color: '#76d9df' }
];
export const PATROLS = [
 [{x:-78,z:-30},{x:-78,z:-54},{x:-62,z:-54},{x:-62,z:-30}],
 [{x:-64,z:-12},{x:-42,z:-12},{x:-30,z:3},{x:-64,z:6}],
 [{x:111,z:29},{x:116,z:44},{x:101,z:44},{x:104,z:27}],
 [{x:75,z:-61},{x:98,z:-61},{x:101,z:-93},{x:74,z:-93}],
 [{x:69,z:-27},{x:96,z:-27},{x:99,z:-46},{x:69,z:-46}]
];
