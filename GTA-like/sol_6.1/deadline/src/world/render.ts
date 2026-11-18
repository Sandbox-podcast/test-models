import{Atmosphere}from'./effects.ts';
import{VEHICLES,type VehicleId}from'../economy.ts';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Physics, type Obstacle, type Impact } from './physics.ts';
import { PATHS, BUILDINGS, DISTRICTS, GATES, LOC,RAIL_DECKS,RAIL_FENCES,CURBS, landHeight, districtById, type Building } from './data.ts';
import { pathMesh, atDistance, rectangleContains, type Vec3, type Rect } from './geometry.ts';
import {TERRAIN}from'./terrain.ts';
import{FURNITURE}from'./furniture.ts';
import{roadMesh}from'./roads.ts';

const unitBox=new T.BoxGeometry(1,1,1),unitSphere=new T.SphereGeometry(1,9,7),identity=new T.Matrix4();
export const standard=new T.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.12});
export function coloredBox(x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0){
 const geo=unitBox.clone();geo.scale(w,h,d);geo.rotateY(angle);geo.translate(x,y,z);const c=new T.Color(color),colors=new Float32Array(geo.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)colors.set([c.r,c.g,c.b],i);geo.setAttribute('color',new T.BufferAttribute(colors,3));return geo;
}
function combine(geos:T.BufferGeometry[],material:T.Material=standard){const geo=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());if(!geo)throw new Error('Empty geometry batch');return new T.Mesh(geo,material);}
export function textSprite(text:string,color='#e7d9bd',width=13){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const c=canvas.getContext('2d')!;c.font='600 52px Bahnschrift,Segoe UI,sans-serif';c.textAlign='center';c.fillStyle=color;c.fillText(text,512,81);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:true}));sprite.scale.set(width,width/8,1);return sprite;
}
export function marker(scene:T.Scene,p:Vec3,color=0xffc370,r=1){const group=new T.Group();group.position.set(p.x,p.y+.06,p.z);const mesh=new T.Mesh(new T.RingGeometry(r*.8,r,40),new T.MeshBasicMaterial({color,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;group.add(mesh);scene.add(group);return group;}

const humanPrototypes=new Map<string,T.BufferGeometry>();
const legGeometry=new T.BoxGeometry(.22,.67,.28);legGeometry.translate(0,-.32,0);
export function makeHuman(color:number,role:'courier'|'guard'|'civilian'|'mina'='civilian'){
 const key=color+'/'+role;let geo=humanPrototypes.get(key);
 if(!geo){const parts=[coloredBox(0,1.02,0,role==='guard'?.85:.70,.75,.43,color),coloredBox(0,1.62,0,.40,.42,.39,0xc4a58e),coloredBox(-.47,1,0,.2,.65,.26,color),coloredBox(.47,1,0,.2,.65,.26,color)];
  if(role==='courier')parts.push(coloredBox(0,1,-.30,.58,.63,.15,0xc78a4a),coloredBox(0,1.25,.23,.60,.12,.025,0xd7e5cf));
  if(role==='guard')parts.push(coloredBox(0,1.8,0,.56,.17,.48,0x26343a),coloredBox(0,1.63,.22,.44,.10,.035,0xc3d5d8),coloredBox(.46,1.1,.5,.13,.15,.65,0x1b2a33));
  if(role==='mina')parts.push(coloredBox(-.19,1.2,.25,.12,.16,.06,0xffd296));
  geo=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());humanPrototypes.set(key,geo);
 }
 const group=new T.Group(),body=new T.Mesh(geo,standard);body.castShadow=role!=='civilian';group.add(body);
 const legL=new T.Mesh(legGeometry,new T.MeshStandardMaterial({color:0x273540,roughness:.9})),legR=new T.Mesh(legGeometry,legL.material);legL.position.set(-.18,.67,0);legR.position.set(.18,.67,0);group.add(legL,legR);group.userData={legL,legR,role};return group;
}
export function animateHuman(group:T.Group,walking:boolean,time:number,speed=1){const angle=walking?Math.sin(time*8*speed+group.id)*.42:0;group.userData.legL.rotation.x=angle;group.userData.legR.rotation.x=-angle;}

const carGeometry=new Map<string,T.BufferGeometry>();
export function makeCar(color=0xb99a6d,model:VehicleId='courier'){
 const profile=VEHICLES[model],cacheKey=color+'/'+model;let geo=carGeometry.get(cacheKey);if(!geo){const parts=[coloredBox(0,.57,0,1.96,.65,4.15,color),coloredBox(0,.96,-.25,1.74,.50,2.05,0x3c5661),coloredBox(0,1.24,-.25,1.73,.16,1.6,0xc4beb0),coloredBox(0,.86,1.38,1.80,.08,1.1,0x847c69),coloredBox(0,.70,2.1,1.72,.16,.12,0x32424a),coloredBox(0,.70,-2.1,1.72,.16,.12,0x32424a)];
  for(const x of [-1,1])for(const z of [-1.35,1.3])parts.push(coloredBox(x,.43,z,.24,.70,.76,0x18252c));
  for(const x of [-.65,.65]){parts.push(coloredBox(x,.69,2.16,.43,.18,.05,0xffe5a9),coloredBox(x,.69,-2.16,.43,.14,.05,0x873c3b));}
  // The courier carries delivery tools behind the cabin.
  parts.push(coloredBox(0,.95,-1.55,1.0,.26,.4,0x526e69),coloredBox(-.38,1.11,-1.55,.10,.07,.48,0xd6bc87),coloredBox(.38,1.11,-1.55,.10,.07,.48,0xd6bc87));
  if(model==='van')parts.push(coloredBox(0,1.35,-.55,1.85,1.1,2.7,color),coloredBox(0,1.95,-.55,1.9,.10,2.8,0xc6c5b6));
  if(model==='utility')parts.push(coloredBox(0,1.1,-1.5,1.7,.6,1.15,color),coloredBox(0,1.6,-.4,1.65,.18,1.35,color));
  if(model==='sport')parts.push(coloredBox(0,1,-1.9,1.85,.09,.25,0x252f35));
  geo=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());carGeometry.set(cacheKey,geo);
 }
 const group=new T.Group(),body=new T.Mesh(geo,standard);body.castShadow=true;group.add(body);
 const brakeMat=new T.MeshBasicMaterial({color:0xff5248}),brakes=new T.Mesh(new T.BoxGeometry(1.5,.12,.04),brakeMat);brakes.position.set(0,.74,-2.19);brakes.visible=false;group.add(brakes);
 const lightMaterial=new T.MeshBasicMaterial({color:0xffe9b9});const lamps=new T.Mesh(new T.BoxGeometry(1.6,.13,.04),lightMaterial);lamps.position.set(0,.76,2.18);group.add(lamps);
 const damageMarks=Array.from({length:12},()=>{const mesh=new T.Mesh(new T.BoxGeometry(.06,.10,.75),new T.MeshBasicMaterial({color:0xd8ceba}));mesh.visible=false;group.add(mesh);return mesh;});
 const dents=Array.from({length:8},()=>{const mesh=new T.Mesh(new T.BoxGeometry(.4,.25,.35),new T.MeshStandardMaterial({color:0x4c5759,roughness:.95}));mesh.visible=false;group.add(mesh);return mesh;});
 group.scale.set(profile.width/2,model==='sport'?.88:1,profile.length/4.2);group.userData={model,body,brakes,lamps,damageMarks,dents,damageCount:0,damage:{front:0,rear:0,left:0,right:0}};return group;
}
export function applyCarDamage(group:T.Group,impact:Impact){
 const state=group.userData;state.damage[impact.side]=Math.min(3,state.damage[impact.side]+impact.severity);const mark=state.damageMarks[state.damageCount++%state.damageMarks.length]as T.Mesh;
 const side=impact.side,front=side==='front',rear=side==='rear';mark.visible=true;
 group.updateMatrixWorld(true);const local=group.worldToLocal(new T.Vector3(impact.point.x,impact.point.y,impact.point.z)),x=T.MathUtils.clamp(local.x,-.8,.8),z=T.MathUtils.clamp(local.z,-1.7,1.7);
 if(front||rear){mark.position.set(x,.78,front?2.14:-2.14);mark.rotation.y=Math.PI/2;mark.scale.set(1,impact.severity,impact.severity*.45);}else{mark.position.set(side==='left'?-.99:.99,.72,z);mark.rotation.y=0;mark.scale.set(1,impact.severity,impact.severity*.6);}
 if(impact.severity>=2){const dent=state.dents[state.damageCount%state.dents.length]as T.Mesh;dent.visible=true;dent.position.copy(mark.position);dent.position.y=.62;dent.scale.set(front||rear?1:.5,1,front||rear?.5:1);}
 if(impact.severity===3&&front)state.lamps.visible=false;
}
export function repairCar(group:T.Group){for(const m of [...group.userData.damageMarks,...group.userData.dents]as T.Mesh[])m.visible=false;group.userData.damage={front:0,rear:0,left:0,right:0};group.userData.damageCount=0;group.userData.lamps.visible=true;}

export interface WorldView {effects:Atmosphere;scene:T.Scene;roofs:Map<string,T.Group>;gates:Map<string,T.Group>;props:Map<number,T.Object3D>;lamps:T.Mesh[];train:T.Group;clockSigns:T.Sprite[];update:(p:Vec3,time:number,hour:number,flags:Set<string>)=>void;}
export function makeWorld(physics:Physics):WorldView {
 const scene=new T.Scene();const effects=new Atmosphere(scene);scene.background=new T.Color(0x263a47);scene.fog=new T.FogExp2(0x263a47,.0034);
 const hemi=new T.HemisphereLight(0xc5dce6,0x5a5351,2.5);scene.add(hemi);const ambient=new T.AmbientLight(0xb0c7d4,.9);scene.add(ambient);
 const sun=new T.DirectionalLight(0xffe5bb,2.5);sun.position.set(-60,100,50);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:2,far:220});sun.shadow.bias=-.0005;sun.shadow.normalBias=.12;scene.add(sun);scene.add(sun.target);
 const roofGroups=new Map<string,T.Group>(),gateMeshes=new Map<string,T.Group>(),props=new Map<number,T.Object3D>(),lamps:T.Mesh[]=[],clockSigns:T.Sprite[]=[];
 const staticGeos:T.BufferGeometry[]=[],emissiveGeos:T.BufferGeometry[]=[];
 const detail=(r:Rect,color:number,emit=false)=>{(emit?emissiveGeos:staticGeos).push(coloredBox(r.x,r.y+r.h/2,r.z,r.w,r.h,r.d,color,r.angle));};
 const railPieces:{mesh:T.Mesh;x0:number;x1:number}[]=[];
 // Continuous terrain triangulation shares its vertices with Rapier. No X/Z-based body teleportation.
 for(const {district,positions,indices} of TERRAIN){
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(positions,3));geom.setIndex(new T.BufferAttribute(indices,1));geom.computeVertexNormals();
  const mesh=new T.Mesh(geom,new T.MeshStandardMaterial({color:district.id==='forges'?0x58656a:district.id==='dalle'?0x8d8377:district.id==='node'?0x6c7880:district.id==='quais'?0x7b8176:0x8e887d,roughness:.93}));mesh.receiveShadow=true;scene.add(mesh);
 }
 const river=new T.Mesh(new T.PlaneGeometry(620,90,70,8),effects.water);river.rotation.x=-Math.PI/2;river.position.set(195,-.4,268);scene.add(river);
 for(let i=0;i<40;i++)detail({id:'water-ripple',x:25+i*11,z:244+Math.sin(i)*7,y:-.37,w:4+(i%3),d:.12,h:.02},0x72979c);
 for(const path of PATHS){
  if(path.mode==='rail')continue;
  const surface=(width:number,offset:number,lift:number,color:number)=>{const {positions,indices}=path.mode==='road'?roadMesh(path,width,offset,lift,width===path.sidewalk):pathMesh(path,width,offset,lift);const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setIndex(new T.BufferAttribute(indices,1));g.computeVertexNormals();const m=new T.Mesh(g,path.mode==='road'&&width===path.width?effects.asphalt:new T.MeshStandardMaterial({color,roughness:.94}));m.receiveShadow=true;scene.add(m);};
  surface(path.width,0,.015,path.mode==='road'?0x303b42:0x9b9a86);
  if(path.mode==='road'){
   for(const side of [-1,1])surface(path.sidewalk,side*(path.width/2+path.sidewalk/2),.035,0x90988f);
   for(let s=3;s<path.points.at(-1)!.s-2;s+=7){const p=atDistance(path,s);detail({id:'lane',x:p.x,z:p.z,y:p.y+.04,w:.12,h:.018,d:2.8,angle:Math.atan2(p.tx,p.tz)},0xd5c7a4);}
   for(let s=18;s<path.points.at(-1)!.s-5;s+=26){const p=atDistance(path,s),angle=Math.atan2(p.tx,p.tz);for(let offset=-path.width/2+.4;offset<path.width/2;offset+=.9){const q=atDistance(path,s,offset);detail({id:'crosswalk',x:q.x,z:q.z,y:q.y+.045,w:.45,h:.018,d:2.8,angle},0xd6d1ba);}}
  }
 }
 // Visible stone foundations connect the raised roads to the valley below.
 for(const path of PATHS.filter(p=>p.mode==='road'&&(p.id.startsWith('J')||p.id==='B-hairpin')))for(let s=1;s<path.points.at(-1)!.s;s+=2)for(const side of [-1,1]){const p=atDistance(path,s,side*(path.width/2+path.sidewalk+.22));detail({id:'retaining-'+path.id+s+side,x:p.x,z:p.z,y:-1,w:.4,h:Math.max(.2,p.y+.65),d:2.2,angle:Math.atan2(p.tx,p.tz)},0xa49e8d);}
 for(const r of physics.obstacles.filter(o=>o.kind==='building')){const b=BUILDINGS.find(b=>r.id.startsWith(b.id));detail(r,b?districtById(b.district).stone:0xb7aa93);}
 for(const b of BUILDINGS){
  detail({id:'foundation',x:b.x,z:b.z,y:b.y-.12,w:b.w+.2,h:.12,d:b.d+.2},0x67716f);
  const roof=new T.Group();roof.position.set(b.x,b.y+b.h,b.z);roofGroups.set(b.id,roof);scene.add(roof);
  const roofColor=b.roof==='metal'?0x637478:b.roof==='flat'?0x4f626b:0x796c64;
  if(b.roof==='flat'){const mesh=combine([coloredBox(0,.10,0,b.w+.5,.20,b.d+.5,roofColor)]);roof.add(mesh);}else{
   const ridge=Math.min(3,b.d*.27),hw=b.w/2+.35,hd=b.d/2+.35;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-hw,0,-hd,hw,0,-hd,-hw,ridge,0,hw,ridge,0,-hw,0,hd,hw,0,hd],3));geo.setIndex([0,2,1,1,2,3,2,4,3,3,4,5]);geo.computeVertexNormals();const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color:roofColor,roughness:.8,side:T.DoubleSide}));mesh.castShadow=true;roof.add(mesh);
   const roofDetails:T.BufferGeometry[]=[];for(let x=-hw+1;x<hw;x+=1.5){for(const side of [-1,1]){const g=coloredBox(x,ridge/2+.025,side*hd/2,.045,.07,Math.hypot(hd,ridge),0x9e9c8e);g.translate(0,-ridge/2,-side*hd/2);g.rotateX(side*Math.atan2(ridge,hd));g.translate(0,ridge/2,side*hd/2);roofDetails.push(g);}}
   if(roofDetails.length)roof.add(combine(roofDetails));
  }
  const sign=textSprite(b.name,'#e9d5a4',Math.min(17,b.w));sign.position.set(b.x,b.y+2.8,b.z+b.d/2+.25);scene.add(sign);
  for(let x=b.x-b.w/2+1.7;x<b.x+b.w/2-1;x+=3.4){for(let y=1.8;y<b.h-.7;y+=2.8){
   const door=(b.doors||[]).some(d=>d.side==='s'&&Math.abs(x-b.x-d.offset)<d.width/2+1);
   if(!door){detail({id:'window',x,z:b.z+b.d/2+.04,y:b.y+y,w:1.2,h:1.25,d:.06},0x354b57);detail({id:'window-light',x,z:b.z+b.d/2+.08,y:b.y+y+.1,w:1.0,h:1.0,d:.025},b.district==='node'?0xc1d9df:0xe7bf81,true);detail({id:'window-mullion',x,z:b.z+b.d/2+.1,y:b.y+y,w:.06,h:1.25,d:.04},0x6e7772);}
  }}
  for(const door of b.doors||[]){const horizontal=door.side==='n'||door.side==='s',x=b.x+(horizontal?door.offset:(door.side==='e'?b.w/2:-b.w/2)),z=b.z+(horizontal?(door.side==='s'?b.d/2:-b.d/2):door.offset);detail({id:'door-lintel',x,z,y:b.y+2.5,w:horizontal?door.width+.3:.4,d:horizontal?.4:door.width+.3,h:.14},0x82d9af,true);}
 }
 for(const [id,r]of Object.entries(GATES)){
  const group=new T.Group();group.position.set(r.x,r.y,r.z);const geos:T.BufferGeometry[]=[];for(let t=-(r.w>r.d?r.w:r.d)/2;t<=(r.w>r.d?r.w:r.d)/2;t+=.38)geos.push(coloredBox(r.w>r.d?t:0,r.h/2,r.w>r.d?0:t,.09,r.h,.09,0x618b7b));geos.push(coloredBox(0,r.h,0,r.w,.15,r.d,0x82d9af));group.add(combine(geos));const signal=new T.Mesh(new T.BoxGeometry(.18,.18,.18),new T.MeshBasicMaterial({color:0xffc370}));signal.position.y=r.h+.25;group.add(signal);gateMeshes.set(id,group);scene.add(group);
 }
 // Rail deck collision remains solid while the visual pieces above each tunnel fade.
 for(const r of RAIL_DECKS){
  const mesh=combine([coloredBox(r.x,r.y+.18,r.z,r.w,r.h,r.d,0x5c6665)],new T.MeshStandardMaterial({vertexColors:true,roughness:.9,transparent:true}));scene.add(mesh);railPieces.push({mesh,x0:r.x-r.w/2,x1:r.x+r.w/2});
 }
 for(let x=2;x<180;x+=2){detail({id:'sleeper',x,z:75,y:3.20,w:.28,h:.1,d:6.2},0x55544c);}
 for(const z of [72.5,73.5,76.5,77.5])detail({id:'rail',x:90,z,y:3.30,w:180,h:.1,d:.12},0xa3aaa4);
 // Guardrails close the railway approach without occupying bridge or stair clearances.
 for(const r of RAIL_FENCES)detail(r,0x58676d);
 for(const r of CURBS)detail(r,r.h>.3?0x697c7c:0xa7a89b);
 for(const id of ['F-stairs','F-service-stairs']){const path=PATHS.find(p=>p.id===id)!;for(let s=.2;s<path.points.at(-1)!.s;s+=.36){const p=atDistance(path,s);detail({id:'tread-'+id+s,x:p.x,z:p.z,y:p.y+.035,w:path.width-.25,h:.055,d:.14,angle:Math.atan2(p.tx,p.tz)},0xced0bd);}}
 for(const x of [121.2,128.8])for(const z of [72,78]){detail({id:'tunnel-frame',x,z,y:0,w:.5,h:2.7,d:.6},0xb7aa93);}
 const train=new T.Group();scene.add(train);for(let i=0;i<3;i++){const car=combine([coloredBox(-i*10,1.0,0,9.5,1.9,2.7,0x6a797a),coloredBox(-i*10,1.4,1.36,7.5,.6,.04,0xd6b57c)]);train.add(car);}
 // Furniture uses one audited placement list in the renderer, physics and navigation.
 for(const r of FURNITURE){
  const obstacle=physics.obstacles.find(o=>o.id===r.id)!;
  const mesh=combine([coloredBox(0,r.h/2,0,r.w,r.h,r.d,r.kind==='tree'?0x6a6852:r.color,r.angle)]);mesh.position.set(r.x,r.y,r.z);mesh.castShadow=true;scene.add(mesh);props.set(obstacle.collider.handle,mesh);
  if(r.kind==='lamp')detail({id:r.id+'-head',x:r.x,z:r.z,y:r.y+3.8,w:.6,h:.10,d:.7},0xf5ce8c,true);
  if(r.kind==='tree'){const geo=unitSphere.clone();geo.scale(1.6,1.9,1.6);geo.translate(r.x,r.y+3.8,r.z);const tree=new T.Mesh(geo,new T.MeshStandardMaterial({color:r.color,roughness:1}));tree.castShadow=true;scene.add(tree);}
  if(r.kind==='bed'){detail({id:r.id+'-pillow',x:r.x-r.w*.28,z:r.z,y:r.y+r.h+.05,w:.6,h:.14,d:r.d*.8},0xd8d1b9);detail({id:r.id+'-cover',x:r.x+r.w*.12,z:r.z,y:r.y+r.h+.02,w:r.w*.65,h:.06,d:r.d*.94},0x829894);}
  if(r.kind==='shelf')for(const y of [.4,.9,1.4])detail({id:r.id+'-shelf',x:r.x,z:r.z,y:r.y+y,w:r.w+.05,h:.05,d:r.d+.05},0xb6a181);
  if(r.kind==='counter')for(let i=-2;i<=2;i++)detail({id:r.id+'-stock',x:r.x+i*.9,z:r.z,y:r.y+r.h+.03,w:.55,h:.08,d:.2},i%2?0xbbb4a0:0x435755);
  if(r.kind==='stall'){detail({id:r.id+'-awning',x:r.x,z:r.z,y:r.y+2.4,w:3.8,h:.10,d:2.3},r.x%2?0xa46e5c:0x789a87);for(let i=0;i<3;i++)detail({id:r.id+'-fruit',x:r.x-1+i,z:r.z,y:r.y+1.02,w:.7,h:.25,d:.7},[0xc69259,0x96a06c,0xb97d5a][i]);}
 }
 if(staticGeos.length){const mesh=combine(staticGeos);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
 if(emissiveGeos.length){const mesh=combine(emissiveGeos,new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}));scene.add(mesh);lamps.push(mesh);}
 const serviceLights:T.PointLight[]=[],serviceBulbs:T.Mesh[]=[];
 for(const z of [74,81.5]){const l=new T.PointLight(0xffc279,40,12,2);l.position.set(52,2.2,z);scene.add(l);serviceLights.push(l);const bulb=new T.Mesh(new T.BoxGeometry(.20,.2,.35),new T.MeshBasicMaterial({color:0x465b5b}));bulb.position.set(53.5,2.1,z);scene.add(bulb);serviceBulbs.push(bulb);}
 const relayFlags=['endingPublish','service:C03-F','service:C03-Q'];const relayPoints=[{x:319,y:12,z:-143},LOC.workshopTerminal,LOC.offline];const relays=relayPoints.map((p,i)=>{const g=new T.Group();g.position.set(p.x,p.y,p.z);g.add(combine([coloredBox(0,.65,0,.55,1.3,.4,0x628b7b)],new T.MeshBasicMaterial({vertexColors:true})));const sign=textSprite(i===0?'RELAIS / DROITS PROVISOIRES':'RELAIS EN LIGNE','#b6e2be',8);sign.position.y=2;g.add(sign);scene.add(g);return g;});
 const update=(p:Vec3,time:number,hour:number,flags:Set<string>)=>{
  effects.update(p,time,hour,flags);const daylight=hour>=7&&hour<19;hemi.intensity=daylight?2.9:1.7;ambient.intensity=daylight?1:.9;sun.intensity=daylight?2.6:1.35;sun.color.set(daylight?0xffedca:0xa7c8da);scene.background=new T.Color(daylight?0x83959a:0x263a47);(scene.fog as T.FogExp2).color.copy(scene.background);
  sun.position.set(p.x-60,p.y+100,p.z+50);sun.target.position.set(p.x,p.y,p.z);
  for(const [id,roof]of roofGroups){const b=BUILDINGS.find(b=>b.id===id)!;const behind=Math.abs(p.x-b.x)<b.w/2+2&&p.z>b.z-b.d/2-(b.h+3)*.72&&p.z<b.z+b.d/2+b.h*.6&&p.y<b.y+b.h;roof.visible=!behind;}
  for(const [id,g]of gateMeshes)g.visible=!physics.open.has(id);
  for(const piece of railPieces){const under=p.y<2&&p.x>piece.x0-2&&p.x<piece.x1+2&&p.z>68&&p.z<83;const material=piece.mesh.material as T.MeshStandardMaterial;material.opacity=T.MathUtils.lerp(material.opacity,under?.12:1,.15);material.depthWrite=material.opacity>.6;}
  train.position.set((time*9)%260-40,3.3,75);train.visible=train.position.x>-30&&train.position.x<210;
  serviceLights.forEach(l=>l.visible=flags.has('shortcutLit'));serviceBulbs.forEach(b=>(b.material as T.MeshBasicMaterial).color.set(flags.has('shortcutLit')?0xffd393:0x465b5b));relays.forEach((g,i)=>g.visible=flags.has(relayFlags[i]));
  for(const o of physics.obstacles)if(o.fragile&&o.broken){const mesh=props.get(o.collider.handle);if(mesh){mesh.rotation.z=.8;mesh.position.y=o.y;}}
 };
 return{effects,scene,roofs:roofGroups,gates:gateMeshes,props,lamps,train,clockSigns,update};
}
