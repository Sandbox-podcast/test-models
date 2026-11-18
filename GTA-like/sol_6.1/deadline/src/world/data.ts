import { clamp, mix, svgPath, closestOnPath,atDistance, rectangleContains, type Path, type Rect, type Vec3 } from './geometry.ts';
export type DistrictId='forges'|'dalle'|'node'|'quais'|'belvederes';
export interface District {id:DistrictId;name:string;description:string;origin:{x:number;z:number};w:number;d:number;color:number;stone:number;accent:number;population:[number,number];traffic:number}
export const DISTRICTS:District[]=[
 {id:'forges',name:'Les Forges',description:'Gare · ateliers · ville basse',origin:{x:0,z:0},w:180,d:120,color:0x536c71,stone:0xb7aa93,accent:0xffc370,population:[8,14],traffic:4},
 {id:'dalle',name:'La Dalle',description:'Le coteau · paliers habités',origin:{x:220,z:-30},w:160,d:110,color:0x8d796e,stone:0xcbbead,accent:0xf4c88d,population:[14,24],traffic:3},
 {id:'node',name:'Le Nœud',description:'Plateau administratif · Civis',origin:{x:220,z:-200},w:160,d:110,color:0x303744,stone:0xd6dce1,accent:0xbcdce5,population:[10,18],traffic:4},
 {id:'quais',name:'Les Quais',description:'Papeterie · marché · Charente',origin:{x:220,z:135},w:160,d:110,color:0x3d6e66,stone:0xb2b09a,accent:0x82e4ce,population:[14,24],traffic:3},
 {id:'belvederes',name:'Les Belvédères',description:'Remparts · terrasses · lacets',origin:{x:0,z:-185},w:160,d:110,color:0x74617e,stone:0xc2b1a1,accent:0xefad91,population:[10,18],traffic:2}
];
// Public world limits include the connector corridors; the river is a distinct non-walkable surface.
export const BOUNDS={minX:-24,maxX:408,minZ:-225,maxZ:252};
export function districtById(id:DistrictId){return DISTRICTS.find(d=>d.id===id)!;}
export function districtAt(x:number,z:number):District {
 const containing=DISTRICTS.find(d=>x>=d.origin.x&&x<=d.origin.x+d.w&&z>=d.origin.z&&z<=d.origin.z+d.d);if(containing)return containing;
 return DISTRICTS.reduce((best,d)=>{const score=(q:District)=>Math.hypot(x-clamp(x,q.origin.x,q.origin.x+q.w),z-clamp(z,q.origin.z,q.origin.z+q.d));return score(d)<score(best)?d:best;});
}
export function baseHeight(id:DistrictId,x:number,z:number){
 const d=districtById(id),lz=z-d.origin.z;
 if(id==='forges')return lz<68?6:0;
 if(id==='node')return 12;
 if(id==='dalle')return lz<25?12:lz<55?mix(12,4,(lz-25)/30):lz<78?4:mix(4,0,clamp((lz-78)/22,0,1));
 if(id==='quais')return mix(2,0,clamp((lz-50)/24,0,1));
 return mix(12,4,clamp((lz-22)/88,0,1));
}
export const PATHS:Path[]=[];
function add(id:string,district:DistrictId|string,d:string,height:number|((x:number,z:number,t:number)=>number),mode:'road'|'walk'|'rail'='road',width=11,origin?:{x:number;z:number},scale=.25,gate?:string){
 const o=origin||(DISTRICTS.find(v=>v.id===district)?.origin||{x:0,z:0});
 const path:Path={id,district,points:svgPath(d,o,typeof height==='number'?()=>height:height,scale),mode,width,sidewalk:mode==='road'?1.5:0,gate};PATHS.push(path);return path;
}
// Forges: these axes are the original SVG path, in metres (one SVG unit = .25 m).
add('F-avenue','forges','M32 120 H128 C205 120 224 72 310 77 S385 120 448 120 H540 C615 120 660 166 660 238 V350',6,'road',12);
add('F-ramp','forges','M660 350 C660 383 623 400 564 400',(x,z,t)=>mix(6,0,t),'road',12);
add('F-low','forges','M564 400 H496 C408 400 371 450 278 442 S161 400 64 400',0,'road',12);
add('F-west','forges','M64 400 C-20 400 -32 360 -32 306 V220 C-32 168 -4 120 32 120',(x,z,t)=>mix(0,6,t),'road',12);
add('F-garage','forges','M128 120 V192',6,'road',6);
add('F-parking','forges','M448 120 V192',6,'road',6);
add('F-alley','forges','M128 238 V263.2 H176 L192 244 H224 L240 263.2 H468 V248',6,'walk',2.4);
add('F-courtyard','forges','M468 176 V252 H500',6,'walk',4);
add('F-stairs','forges','M500 260 V280',(x,z,t)=>mix(6,0,t),'walk',4);
add('S01','forges','M500 280 V360 H540',0,'walk',8);
add('F-drop-connection','forges','M540 360 H564 V400',0,'walk',5);
add('F-service','forges','M540 360 H472 V326 H208 V280',0,'walk',3.2,undefined,.25,'shortcut');
add('F-service-stairs','forges','M208 280 V252',(x,z,t)=>mix(0,6,t),'walk',3.2,undefined,.25,'shortcut');
add('F-service-top','forges','M208 244 V252',6,'walk',3.2);
add('F-rail','forges','M0 300 H720',3,'rail',10);
// Residential road and the two crossing pedestrian galleries from plan-la-dalle.svg.
add('D-coteau','dalle','M0 260 C95 260 130 205 245 220 S370 300 465 274 Q565 243 640 260',4);
const dalleFoot=(x:number,z:number)=>baseHeight('dalle',x+220,z-30);
add('D-palier','dalle','M155 0 Q158 49 220 72 L338 101 Q381 118 388 155 L398 238 L414 440',dalleFoot,'walk',4);
add('D-gallery','dalle','M0 110 Q90 100 148 133 T345 152 L388 155 Q503 175 640 142',dalleFoot,'walk',4);
// The service loop, separate foot arrivals and parvis are based on plan-le-noeud.svg.
add('N-loop','node','M0 88 H405 C520 88 583 110 583 186 V261 C583 327 510 361 408 359 H230 C139 359 99 388 90 440',12);
add('N-gallery','node','M328 440 V314 Q331 253 375 226 L382 155 V88',12,'walk',4);
add('N-parvis','node','M132 88 L152 155 Q160 190 217 211 L375 226 L534 256',12,'walk',5);
add('N-control-front','node','M484 256 V196',12,'walk',5);
add('N-control-back','node','M560 210 V160 H524 V178',12,'walk',3.2);
add('N-exit','node','M528 358 V404 H572',12,'walk',4,undefined,.25,'exit');
// Riverside road and the low promenade with two independent pedestrian ramps.
add('Q-road','quais','M0 103 H259 C341 103 340 168 421 168 H640',2);
add('Q-link','quais','M270 0 V47 Q270 88 259 103',2);
add('Q-promenade','quais','M0 301 C95 292 129 320 224 325 S391 268 502 286 L640 315',0,'walk',5);
add('Q-west-ramp','quais','M110 103 V174 Q110 222 168 226 L224 225 V325',(x,z,t)=>mix(2,0,t),'walk',4);
add('Q-east-ramp','quais','M475 168 L488 237 L502 286',(x,z,t)=>mix(2,0,t),'walk',4);
// The hairpin road descends continuously by arc length, never by an X/Z threshold.
add('B-hairpin','belvederes','M640 88 H510 C433 88 401 141 414 192 C421 232 361 258 290 252 C187 245 133 272 133 329 Q129 390 66 440',(x,z,t)=>mix(12,4,clamp((t-.10)/.80,0,1)));
const belFoot=(x:number,z:number)=>baseHeight('belvederes',x,z-185);
add('B-terrace','belvederes','M221 440 L238 367 Q274 330 355 328 Q465 328 527 281 L640 240',belFoot,'walk',4);
add('B-cafe','belvederes','M414 192 Q475 196 501 218 L527 281',belFoot,'walk',4);
add('B-stairs','belvederes','M133 329 Q181 339 238 367',belFoot,'walk',4);
// Paired six-junction assembly: compatible widths, altitudes and lane directions.
add('J01','forges','M135 30 C167 25 185 35 220 35',(x,z,t)=>mix(6,4,clamp((t-.23)/.54,0,1)),'road',11,{x:0,z:0},1);
add('J02','quais','M141 100 C164 100 177 160.75 220 160.75',(x,z,t)=>mix(0,2,clamp((t-.15)/.70,0,1)),'road',11,{x:0,z:0},1);
add('J03','dalle','M287.5 135 C287.5 112 341 110 336.25 38.5',(x,z,t)=>mix(2,4,clamp((t-.15)/.65,0,1)),'road',11,{x:0,z:0},1);
add('J04','node','M336.25 38.5 C410 15 414 -45 350 -64 C325 -73 275 -72 242.5 -90',(x,z,t)=>mix(4,12,clamp((t-.15)/.80,0,1)),'road',11,{x:0,z:0},1);
add('J05','belvederes','M250 32 C200 8 185 -25 165 -36 C116 -55 36 -57 16.5 -75',4,'road',11,{x:0,z:0},1);
add('J06','node','M160 -163 C180 -163 200 -178 220 -178',12,'road',11,{x:0,z:0},1);
add('J01-foot','dalle','M135 40 C165 45 190 7 220 -2.5',(x,z,t)=>mix(6,12,t),'walk',4,{x:0,z:0},1);
add('S02','node','M258.75 -30 C258.75 -48 302 -57 302 -90',12,'walk',4,{x:0,z:0},1,'gallery');
add('J03-foot','quais','M323.5 80 C323.5 100 276 115 276 216.25',0,'walk',4,{x:0,z:0},1);
add('J05-foot','belvederes','M220 -2.5 C170 -4 150 -45 55.25 -75',(x,z,t)=>mix(12,4,t),'walk',4,{x:0,z:0},1);
export const JUNCTIONS=['J01','J02','J03','J04','J05','J06'].map(id=>{const p=PATHS.find(p=>p.id===id)!;return{id,width:p.width,a:{...p.points[0],id:id+'-a'},b:{...p.points.at(-1)!,id:id+'-b'},path:p.id};});

const CELL=12;
interface Segment {path:Path;a:Path['points'][number];b:Path['points'][number];first:boolean;last:boolean}
const segmentIndex=new Map<string,Segment[]>();
for(const path of PATHS)for(let i=0;i<path.points.length-1;i++){
 const a=path.points[i],b=path.points[i+1],margin=path.width/2+path.sidewalk+1;
 for(let x=Math.floor((Math.min(a.x,b.x)-margin)/CELL);x<=Math.floor((Math.max(a.x,b.x)+margin)/CELL);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/CELL);z<=Math.floor((Math.max(a.z,b.z)+margin)/CELL);z++){
  const k=x+','+z;if(!segmentIndex.has(k))segmentIndex.set(k,[]);segmentIndex.get(k)!.push({path,a,b,first:i===0,last:i===path.points.length-2});
 }
}
export function surfacesNear(p:{x:number;z:number}) {
 const nearest=new Map<string,{path:Path;distance:number;y:number;s:number;onStrip:boolean}>();
 for(const {path,a,b,first,last}of segmentIndex.get(Math.floor(p.x/CELL)+','+Math.floor(p.z/CELL))||[]){const dx=b.x-a.x,dz=b.z-a.z,raw=((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),t=clamp(raw,0,1),distance=Math.hypot(p.x-mix(a.x,b.x,t),p.z-mix(a.z,b.z,t));if(distance<(nearest.get(path.id)?.distance??Infinity))nearest.set(path.id,{path,distance,y:mix(a.y,b.y,t),s:mix(a.s,b.s,t),onStrip:!(first&&raw<-.03||last&&raw>1.03)});}
 return [...nearest.values()];
}

export interface Building {id:string;district:DistrictId;x:number;z:number;w:number;d:number;h:number;y:number;name:string;interior?:boolean;doors?:{side:'n'|'s'|'e'|'w';offset:number;width:number}[];roof:'tile'|'metal'|'flat';}
export const BUILDINGS:Building[]=[];
function building(id:string,district:DistrictId,x:number,z:number,w:number,d:number,h:number,name:string,interior=false,doors?:Building['doors'],roof:Building['roof']='tile') {
 const o=districtById(district).origin;const b:Building={id,district,x:o.x+x,z:o.z+z,w,d,h,y:baseHeight(district,o.x+x,o.z+z),name,interior,doors,roof};BUILDINGS.push(b);return b;
}
building('garage','forges',32,50,34,17,5.8,'MINA / MÉCANIQUE',true,[{side:'n',offset:0,width:6.5},{side:'e',offset:0,width:3}], 'metal');
building('depot','forges',89,52,29,24,8,'CIVIS / DÉPÔT 04',true,[{side:'n',offset:0,width:5},{side:'e',offset:2,width:4}], 'metal');
building('workshop','forges',17.5,15.6,17,9.7,6,'ATELIERS DU NIL');
building('archives','forges',40,8,14,8,6,'ARCHIVES DE MIGRATION',true,[{side:'s',offset:0,width:3},{side:'e',offset:0,width:2.5}]);
building('annex','forges',62.1,46,12.2,10,5,'ENTRETIEN');
building('annex-low','forges',61.2,55.4,11.5,4,4,'MAGASIN / OUTILS');
building('store','forges',140,54.3,12,11,6,'ÉPICERIE DE NUIT');
building('warehouse-low','forges',35,87.5,20,6.5,5,'FRET / RIVE BASSE');
building('low-houses','forges',63.1,91.6,22.7,8.7,7,'LOGEMENTS DES ATELIERS');
building('low-sheds','forges',94.6,87.5,22.7,7.7,4,'REMISES');
building('home-a','dalle',32,17.5,21.4,7.5,10,'RÉSIDENCE DES PALIERS');
building('nadia-office','dalle',80.6,16,19.8,7.5,5,'PERMANENCE / NADIA',true,[{side:'s',offset:0,width:3}]);
building('home-b','dalle',134,18.7,21.4,7.5,12,'LES TERRASSES');
building('night-office','dalle',16,41.5,18.2,7.5,6,'PERMANENCE DE NUIT',true,[{side:'n',offset:0,width:3},{side:'e',offset:0,width:3}]);
building('audit-relay','dalle',130,40,18,7.5,6,'CIVIS / RELAIS D’AUDIT',true,[{side:'n',offset:0,width:3},{side:'e',offset:0,width:3},{side:'w',offset:.4,width:3}]);
building('school','dalle',31,85.2,17,7.5,6,'ÉCOLE DES COTEAUX');
building('home-c','dalle',79,91.2,21.4,7.5,11,'LES ABSENTS');
building('dalle-workshop','dalle',134.5,91,17,7.5,5,'RÉPARATIONS / COUTURE');
building('node-west','node',22.8,10,26.2,7.5,6,'CIVIS / ACCUEIL');
building('sorel-annex','node',70.2,10,17,7.5,6,'SERVICE DES RÉVOCATIONS',true,[{side:'s',offset:0,width:3}]);
building('node-archive','node',124.7,10.7,17,7.5,9,'ARCHIVES CENTRALES');
building('node-service','node',19,51.7,17,7.5,6,'SERVICES');
building('civis','node',64.2,37,17,7.5,14,'CIVIS');
building('control','node',121,45.2,27,7.5,7,'CENTRE DE COMMANDE',true,[{side:'s',offset:0,width:4},{side:'e',offset:0,width:3},{side:'n',offset:10,width:3}],'flat');
building('technical','node',115,69,20,7.5,5,'DÉPÔT TECHNIQUE');
building('service-court','node',66.9,74.7,27.8,7.5,5,'ÉQUIPE DE NUIT');
building('riverside','quais',24.1,11,27.8,7.5,5,'ATELIER DE RIVE');
building('market-hall','quais',88.2,12,17,7.5,7,'HALLE DES QUAIS');
building('quai-store','quais',140.7,23.2,17,7.5,8,'TRANSPORTS / CHARENTE');
building('paper-mill','quais',15.1,42,18.2,7.5,8,'PAPETERIE DU NIL',true,[{side:'e',offset:0,width:3},{side:'n',offset:0,width:3}],'metal');
building('market','quais',73.2,48,17,7.5,4,'MARCHÉ');
building('buvette','quais',99.5,58.7,17,7.5,4,'BUVETTE DE LA RIVE');
building('quai-hangar','quais',141.2,58.7,17,7.5,6,'MANUTENTION');
building('bel-home','belvederes',77.8,15,18.2,7.5,9,'MAISONS DES REMPARTS');
building('kiosk','belvederes',129.5,8.7,17,7.5,4,'KIOSQUE');
building('cafes','belvederes',137.7,36.7,17,7.5,5,'CAFÉ DU PLATEAU');
building('bel-hotel','belvederes',74.8,45.2,28,7.5,10,'HÔTEL DES REMPARTS');
building('bel-gallery','belvederes',16,68,18,8,7,'ATELIER / GALERIE');

/** Hollow buildings are actual walls with stable openings, never a solid box with an interior marker. */
export function buildingSolids(b:Building):Rect[] {
 if(!b.interior)return[{...b,id:b.id}];const walls:Rect[]=[];
 for(const side of ['n','s','e','w']as const){
  const horizontal=side==='n'||side==='s',length=horizontal?b.w:b.d,doors=(b.doors||[]).filter(d=>d.side===side).sort((a,c)=>a.offset-c.offset);let cursor=-length/2;
  for(const door of [...doors,{side,offset:length/2+.25,width:.5}]){const end=door.offset-door.width/2;if(end>cursor+.01){const mid=(cursor+end)/2;walls.push({id:b.id+'-'+side+'-'+cursor,x:b.x+(horizontal?mid:(side==='e'?b.w/2:-b.w/2)),z:b.z+(horizontal?(side==='s'?b.d/2:-b.d/2):mid),y:b.y,w:horizontal?end-cursor:.35,d:horizontal?.35:end-cursor,h:b.h});}cursor=door.offset+door.width/2;}
 }return walls;
}
export const SOLIDS:Rect[]=BUILDINGS.flatMap(buildingSolids);
export const RAIL_DECKS:Rect[]=[[0,78],[78,82],[82,121],[121,129],[129,180]].map(([a,b])=>({id:'rail-deck-'+a,x:(a+b)/2,z:75,y:2.8,w:b-a,h:.36,d:10}));
export const RAIL_FENCES:Rect[]=[[0,49.8],[54.2,120],[130,158],[172,180]].map(([a,b])=>({id:'rail-fence-'+a,x:(a+b)/2,z:67.5,y:6,w:b-a,h:1.1,d:.15}));
// Coteau footways follow the terrain across their full width. Extruding a centreline
// height sideways would create ledges where the two sloping galleries intersect.
for(const path of PATHS.filter(p=>p.mode==='walk'&&['dalle','belvederes','quais'].includes(p.district)&&!p.id.startsWith('J')&&p.id!=='S02')){
 path.heightAt=landHeight;for(const p of path.points)p.y=landHeight(p.x,p.z)??p.y;
}

export const CURBS:Rect[]=[];
for(const path of PATHS.filter(p=>p.mode==='road'))for(let s=1;s<path.points.at(-1)!.s-1;s+=2)for(const side of [-1,1]){
 const p=atDistance(path,s,side*(path.width/2+.12));const cross=((s-18)%26+26)%26;if(cross<2||cross>24)continue;
 if(BUILDINGS.some(b=>b.interior&&rectangleContains(p,{...b,h:0,id:b.id},.2)))continue;
 if(surfacesNear(p).some(q=>q.path.id!==path.id&&q.path.mode==='road'&&q.onStrip&&q.distance<q.path.width/2+2&&Math.abs(q.y-p.y)<.7))continue;
 if(surfacesNear(p).some(q=>q.path.mode==='walk'&&q.onStrip&&q.distance<q.path.width/2+.7&&Math.abs(q.y-p.y)<1.2))continue;
 const a=atDistance(path,s-.6),b=atDistance(path,s+.6),bridge=path.id==='F-avenue'&&p.z>64,slope=Math.abs(b.y-a.y)>.04;
 CURBS.push({id:'curb-'+path.id+'-'+s+'-'+side,x:p.x,z:p.z,y:p.y,w:.18,h:bridge||slope?.8:.16,d:2.04,angle:Math.atan2(p.tx,p.tz)});
}
export const GATES:Record<string,Rect>={
 depot:{id:'depot',x:128,z:54,y:6,w:.35,d:5,h:2.5},shortcut:{id:'shortcut',x:52,z:81,y:0,w:3.2,d:.35,h:2.4},
 gallery:{id:'gallery',x:302,z:-85,y:12,w:4,d:.35,h:2.5},badge:{id:'badge',x:242.5,z:-97,y:12,w:6,d:.35,h:2.5},
 residence:{id:'residence',x:325,z:1,y:10,w:.35,d:4,h:2.5},exit:{id:'exit',x:352,z:-102,y:12,w:4,d:.35,h:2.5}
};
export const LOC:Record<string,Vec3>={
 spawn:{x:25,y:6,z:50},garage:{x:26,y:6,z:52},car:{x:32,y:6,z:45},parking:{x:112,y:6,z:36},chip:{x:88,y:6,z:57},drop:{x:135,y:0,z:90},
 sorel:{x:55,y:6,z:32},calendar:{x:40,y:6,z:8},archiveAgent:{x:40,y:6,z:17},archiveStop:{x:69,y:6,z:34},nadia:{x:300.5,y:12,z:-7},portLog:{x:257,y:9,z:7},registry:{x:350,y:8,z:10},
 power:{x:342,y:12,z:-120},post:{x:319,y:12,z:-143},server:{x:344,y:12,z:-155},sorelNode:{x:290,y:12,z:-184.5},
 module:{x:24,y:6,z:54},panel:{x:54,y:0,z:82.5},residentLogs:{x:299,y:1.6,z:56},resident:{x:284,y:1.4,z:58},
 lise:{x:236,y:8,z:7},nightKeeper:{x:234,y:8,z:12},nightDossier:{x:239,y:8,z:12},paper:{x:235,y:2,z:177},paperOwner:{x:242,y:2,z:167.5},exitPanel:{x:350,y:12,z:-104},nightCrew:{x:334,y:12,z:-119},
 boardF:{x:47,y:6,z:37},boardD:{x:292,y:4,z:36},boardQ:{x:291,y:2,z:173},commonPickup:{x:27,y:6,z:52},commonDelivery:{x:132,y:6,z:39},
 salvage:{x:116,y:6,z:60},workshopTerminal:{x:18,y:6,z:22},offline:{x:224,y:0,z:211},escort:{x:276,y:0,z:215},escortSafe:{x:309,y:0,z:218}
};
// Public interaction points follow the same visible terrain as the supporting physics.
export function landHeight(x:number,z:number):number|null {
 const d=DISTRICTS.find(d=>x>=d.origin.x&&x<=d.origin.x+d.w&&z>=d.origin.z&&z<=d.origin.z+d.d);if(!d)return null;
 if(d.id==='forges'&&z>=68&&z<=82)return null;
 if(d.id==='quais'&&z>225)return null;
 let y=baseHeight(d.id,x,z),roadWeight=0,roadY=y;
 for(const q of surfacesNear({x,z})){const path=q.path;if(!q.onStrip)continue;
  if(path.mode==='road'){const weight=clamp((path.width/2+path.sidewalk+8-q.distance)/8,0,1);if(weight>roadWeight){roadWeight=weight;roadY=q.y;}}
  else if(path.mode==='walk'&&path.district===d.id&&!['dalle','belvederes','quais'].includes(d.id)&&q.distance<path.width/2+.15&&Math.abs(q.y-y)<4)y=q.y;
 }
 y=mix(y,roadY,roadWeight);
 const building=BUILDINGS.find(b=>rectangleContains({x,z},{...b,h:0,id:b.id},.1));if(building)y=building.y;
 return y;
}
export function supportAt(p:{x:number;z:number},previousY:number,mode:'foot'|'car',travel=.2,open=new Set<string>()):number|null {
 const candidates:number[]=[];
 if(mode==='foot'){const ground=landHeight(p.x,p.z);if(ground!==null)candidates.push(ground);}
 for(const q of surfacesNear(p)){const path=q.path;if(!q.onStrip||path.mode==='rail'||mode==='car'&&path.mode!=='road'||path.gate&&!open.has(path.gate))continue;if(q.distance<path.width/2+(mode==='foot'?path.sidewalk:0)-.05)candidates.push(q.y);}
 // Real interior floors and the depot courtyard are reachable with the base equipment.
 if(mode==='foot')for(const b of BUILDINGS)if(b.interior&&rectangleContains(p,{...b,h:0,id:b.id}))candidates.push(b.y);
 if(mode==='car'&&rectangleContains(p,{...BUILDINGS[0],id:'garage-floor'},-.05))candidates.push(6);
 if(mode==='car'&&p.x>107&&p.x<119&&p.z>29&&p.z<43)candidates.push(6);
 const limit=(mode==='foot'?.35+travel*1.45:.18+travel*.6);
 const reachable=candidates.filter(y=>Math.abs(y-previousY)<=limit).sort((a,b)=>Math.abs(a-previousY)-Math.abs(b-previousY));
 return reachable[0]??null;
}
export function isClear(p:Vec3,radius=.4,open=new Set<string>()) {
 return ![...SOLIDS,...RAIL_DECKS,...RAIL_FENCES,...Object.values(GATES).filter(g=>!open.has(g.id))].some(r=>p.y+1.7>r.y&&p.y<r.y+r.h&&rectangleContains(p,r,radius));
}
for(const p of Object.values(LOC)){
 const interior=BUILDINGS.find(b=>b.interior&&rectangleContains(p,{...b,h:0,id:b.id},-.4));
 p.y=interior?.y??landHeight(p.x,p.z)??p.y;
}
