import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BOUNDS, heightAt, LOC, type Point } from './level';

export interface Wall { x: number; z: number; w: number; d: number; y: number; h: number; collider: RAPIER.Collider; mesh?: T.Object3D; id?: string; }
export interface City { scene: T.Scene; walls: Wall[]; roofs: T.Mesh[]; rail: T.Group; gates: Record<string, Wall>; markers: Record<string,T.Group>; cameras: {pos:Point; angle:number; mesh:T.Group; cone:T.Mesh; disabled:number}[]; }
const materials = new Map<string,T.MeshStandardMaterial>();
export function mat(color:number, emit=0, opacity=1) {
  const key=`${color}/${emit}/${opacity}`;
  if(!materials.has(key)) materials.set(key,new T.MeshStandardMaterial({ color, roughness:.78, metalness:.24, emissive:color, emissiveIntensity:emit, transparent:opacity<1, opacity, depthWrite:opacity===1 }));
  return materials.get(key)!;
}
export function box(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:number,emit=0) {
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color,emit)); mesh.position.set(x,y,z); mesh.castShadow=h>1; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
export function label(text:string,color='#b4d4d7',size=4):T.Sprite {
  const cv=document.createElement('canvas'); cv.width=1024; cv.height=128;
  const c=cv.getContext('2d')!; c.font='600 44px "Segoe UI", sans-serif'; c.textAlign='center'; c.fillStyle=color; c.fillText(text,512,80);
  const texture=new T.CanvasTexture(cv); texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:false,opacity:.85})); sprite.scale.set(size*7,size,.1); return sprite;
}
export function ring(parent:T.Object3D,x:number,z:number,color:number,r=1.5) {
  const g=new T.Group(); g.position.set(x,heightAt(x,z)+.10,z);
  const mesh=new T.Mesh(new T.RingGeometry(r*.82,r,48),new T.MeshBasicMaterial({color,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false})); mesh.rotation.x=-Math.PI/2; g.add(mesh);
  const pillar=box(g,0,1,0,.1,2,.1,color,2); pillar.visible=false; parent.add(g); return g;
}
export function human(color:number,guard=false) {
  const g=new T.Group();
  const torso=box(g,0,1,0,.7,.75,.45,color); torso.rotation.z=.03;
  const head=new T.Mesh(new T.SphereGeometry(.27,8,6),mat(0xcaa587)); head.position.y=1.62; head.castShadow=true; g.add(head);
  box(g,0,1.8,-.04,.56,.18,.48,guard?0x23323c:0x1b2430);
  const legL=box(g,-.18,.35,0,.23,.65,.28,0x17232e); const legR=box(g,.18,.35,0,.23,.65,.28,0x17232e);
  box(g,-.49,1,.05,.22,.68,.26,color); const arm=box(g,.45,1.15,.26,.21,.23,.72,color);
  box(g,.45,1.19,.70,.15,.17,.5,0x161c25);
  box(g,0,1.18,-.24,.48,.12,.035,guard?0xf9745e:0x8de8df,2);
  g.userData={legL,legR,arm}; return g;
}
export function carModel(color=0xd4a24f) {
 const g=new T.Group();
 box(g,0,.57,0,2.05,.65,4.2,color); box(g,0,.94,-.15,1.8,.5,2.0,0x25333e);
 box(g,0,1.2,-.14,1.7,.18,1.65,color); box(g,0,1.01,.89,1.65,.42,.08,0x78a7b8,.2);
 box(g,0,1.0,-1.16,1.64,.38,.08,0x4b6e7d); box(g,0,.65,2.12,1.8,.18,.08,0x141e27);
 for(const x of [-1.05,1.05]) for(const z of [-1.38,1.36]) {
  const wh=new T.Mesh(new T.CylinderGeometry(.42,.42,.3,12),mat(0x111922)); wh.rotation.z=Math.PI/2; wh.position.set(x,.43,z); g.add(wh);
 }
 for(const x of [-.70,.70]) {box(g,x,.69,2.16,.42,.20,.06,0xffecae,3);box(g,x,.69,-2.14,.42,.15,.06,0xfc4e50,2);}
 box(g,0,.84,1.54,.16,.01,.95,0x1b2c37); box(g,0,.84,1.54,1.6,.01,.1,0x26323d);
 // Soft headlight pools remain cheap and readable from the orthographic camera.
 for(const x of [-.65,.65]) {
  const cone=new T.Mesh(new T.PlaneGeometry(2.5,8),new T.MeshBasicMaterial({color:0xffd98c,opacity:.06,transparent:true,depthWrite:false,side:T.DoubleSide})); cone.rotation.x=-Math.PI/2;cone.position.set(x,.08,6);g.add(cone);
 }
 return g;
}

export function buildCity(world:RAPIER.World):City {
 const scene=new T.Scene(); scene.background=new T.Color(0x0d1821); scene.fog=new T.FogExp2(0x0d1821,.0041);
 scene.add(new T.HemisphereLight(0x9ecbd1,0x354358,3.1));
 scene.add(new T.AmbientLight(0x9ab4c9,2.0));
 const moon=new T.DirectionalLight(0x8baec4,2.1); moon.position.set(-60,90,30); moon.castShadow=true;
 moon.shadow.mapSize.set(2048,2048); Object.assign(moon.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:240}); moon.shadow.bias=-.001; moon.shadow.normalBias=.15; scene.add(moon);
 const walls:Wall[]=[], roofs:T.Mesh[]=[], gates:Record<string,Wall>={}, markers:Record<string,T.Group>={}, cameras:City['cameras']=[];
 const batches=new Map<string,{color:number;emit:number;geos:T.BufferGeometry[]}>();
 function detail(x:number,y:number,z:number,w:number,h:number,d:number,color:number,emit=0) {
  const key=`${color}/${emit}`; if(!batches.has(key)) batches.set(key,{color,emit,geos:[]});
  const geo=new T.BoxGeometry(w,h,d); geo.translate(x,y,z); batches.get(key)!.geos.push(geo);
 }
 function wall(x:number,z:number,w:number,d:number,h:number,color:number,id?:string):Wall {
  const y=heightAt(x,z);const mesh=box(scene,x,y+h/2,z,w,h,d,color);
  const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y+h/2,z));
  const v={x,z,w,d,h,y,collider,mesh,id}; walls.push(v);return v;
 }
 // Terrain is sampled so the eastern plateau and the road bridge have continuous ramps.
 for(let x=-150;x<155;x+=5) for(let z=-135;z<125;z+=5){
  const y=heightAt(x+2.5,z+2.5); detail(x+2.5,y-.30,z+2.5,5,.6,5,x>22?0x26303a:0x1d2a34);
 }
 // Four industrial blocks, then the ascending road to the residential district.
 const roads=[{x:-72,z:13,w:142,d:12},{x:-65,z:-6,w:12,d:231},{x:-132,z:36,w:10,d:152},{x:-35,z:102,w:210,d:11},{x:14,z:26,w:12,d:170},{x:79,z:12,w:143,d:12},{x:70,z:61,w:12,d:105},{x:92,z:-27,w:115,d:12},{x:91,z:-70,w:12,d:88},{x:-48,z:-83,w:179,d:11}];
 for(const r of roads){
  // Split roads into 2-unit strips to follow heights.
  for(let x=r.x-r.w/2;x<r.x+r.w/2;x+=2) for(let z=r.z-r.d/2;z<r.z+r.d/2;z+=2) detail(x+1,heightAt(x+1,z+1)+.02,z+1,2,.055,2,0x121e28);
  if(r.w>r.d) for(let x=r.x-r.w/2+3;x<r.x+r.w/2;x+=6) detail(x,heightAt(x,r.z)+.07,r.z,2.8,.02,.13,0x9a8150,.1);
  else for(let z=r.z-r.d/2+3;z<r.z+r.d/2;z+=6) detail(r.x,heightAt(r.x,z)+.07,z,.13,.02,2.8,0x9a8150,.1);
 }
 for(const z of [7,19,96,108]) for(let x=-128;x<140;x+=5) detail(x,heightAt(x,z)+.12,z,4.7,.22,.3,0x46505a);
 // Pedestrian crossings, parking bays, gutters and roadside light poles.
 for(const p of [{x:-65,z:23},{x:-65,z:92},{x:14,z:23},{x:70,z:23}]) for(let i=-3;i<=3;i++) detail(p.x+i*.85,heightAt(p.x,p.z)+.08,p.z,.44,.03,4,0xa8b4b7);
 for(let i=0;i<5;i++){ const x=-93+i*4; detail(x,.10,65,.13,.03,7,0x69747a); }
 const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;const glowContext=glowCanvas.getContext('2d')!;const radial=glowContext.createRadialGradient(64,64,0,64,64,64);radial.addColorStop(0,'rgba(255,213,143,0.55)');radial.addColorStop(.45,'rgba(255,190,90,0.15)');radial.addColorStop(1,'rgba(255,170,65,0)');glowContext.fillStyle=radial;glowContext.fillRect(0,0,128,128);const glowTexture=new T.CanvasTexture(glowCanvas);
 for(let x=-135;x<142;x+=22) for(const z of [23,91]) {
  const y=heightAt(x,z);detail(x,y+2.3,z,.16,4.6,.16,0x59646b); detail(x+.7,y+4.6,z,1.5,.13,.2,0x59646b); detail(x+1.3,y+4.52,z,.4,.08,.5,0xffc37d,3);
  const pool=new T.Mesh(new T.PlaneGeometry(12,12),new T.MeshBasicMaterial({map:glowTexture,color:0xffd4a0,opacity:.30,transparent:true,depthWrite:false,blending:T.AdditiveBlending})); pool.rotation.x=-Math.PI/2;pool.position.set(x+1,y+.08,z);scene.add(pool);
 }
 for(const b of BLOCKS){
  const y=heightAt(b.x,b.z); wall(b.x,b.z,b.w,b.d,b.h,b.color,b.id);
  const roof=box(scene,b.x,y+b.h+.16,b.z,b.w+.4,.32,b.d+.4,0x425865);roof.material=roof.material.clone();roofs.push(roof);
  // Roof seams, skylights and ducts make the large silhouettes legible at night.
  for(let z=b.z-b.d/2+3;z<b.z+b.d/2-1;z+=4)detail(b.x,y+b.h+.34,z,b.w-1,.025,.06,0x71818b);
  for(let k=0;k<2;k++){detail(b.x-b.w*.22+k*b.w*.42,y+b.h+.5,b.z-b.d*.18,2.8,.4,3.6,0x263c49);detail(b.x-b.w*.22+k*b.w*.42,y+b.h+.72,b.z-b.d*.18,2.4,.06,3.2,0x78abb8,.35);}
  // Parapets, rooftop ducts and mechanical rooms.
  for(const side of [-1,1]) detail(b.x+side*(b.w/2-.3),y+b.h+.55,b.z,.4,.7,b.d,0x45505a);
  detail(b.x+2,y+b.h+.8,b.z+1,3.7,1.5,3,0x49515a);detail(b.x-3,y+b.h+.5,b.z-2,2,.7,4,0x3b454f);
  const ec=b.neon||0xffc789;
  for(let x=b.x-b.w/2+2;x<b.x+b.w/2-1;x+=3.5) for(let h=2;h<b.h-1;h+=3.5){
   const on=Math.sin(x*29+h*78)>.05;detail(x,y+h,b.z+b.d/2+.03,1.6,1.2,.06,on?ec:0x14232c,on?.6:0);
  }
  for(let z=b.z-b.d/2+2;z<b.z+b.d/2-1;z+=4) for(let h=2;h<b.h-1;h+=3.5) detail(b.x+b.w/2+.03,y+h,z,.06,1.2,1.5,Math.sin(z*38+h)>0?ec:0x18232d,Math.sin(z*38+h)>0?.4:0);
  if(b.sign){
   detail(b.x,y+3.6,b.z+b.d/2+.22,Math.min(b.w-1,21),1.8,.25,0x101a24);
   const sign=label(b.sign,'#'+ec.toString(16).padStart(6,'0'),2.3);sign.position.set(b.x,y+4,b.z+b.d/2+.4);scene.add(sign);
   detail(b.x,y+.18,b.z+b.d/2+1,Math.min(b.w,20),.06,1.6,ec,.25);
  }
 }
 // The depot has two genuinely separate entrances: a broad front and a hacked courtyard gate.
 wall(-66,-58,1,18,2.4,0x58626a);wall(-66,-23,1,9,2.4,0x58626a);
 gates.depot=wall(-66,-39,1,8,2.6,0x4b686b,'depot-gate');
 const gateSign=label('GRILLE // INTRUSION','#76ddd4',1.2);gateSign.position.set(-65,4,-39);scene.add(gateSign);
 // Service shortcut is opened atomically with the first mission reward.
 wall(-18,26,1,13,2.5,0x485b62);wall(-18,49,1,10,2.5,0x485b62);gates.shortcut=wall(-18,36,1,7,2.5,0x667679,'shortcut');
 // Node security perimeter: both ground-level routes work, the acquired route opens another gate.
 wall(64,-86,1,50,3.4,0x4b656b);gates.node=wall(64,-54,1,12,3.4,0x6ca6a8,'node-gate');
 wall(69,-42,10,1,3,0x4b656b);wall(115.5,-42,59,1,3,0x4b656b);
 gates.gallery=wall(80,-42,12,1,3,0x60717e,'gallery');
 const gallerySign=label('GALERIE / COLLECTIF','#e58ab5',1.6);gallerySign.position.set(80,7,-34);scene.add(gallerySign);
 for(let i=0;i<6;i++)detail(80,4.6+i*.17,-33-i*1.1,6,.22,1.1,0x6c7886);
 // Rail viaduct above the lower pedestrian route; its deck fades in the visibility volume.
 const rail=new T.Group();scene.add(rail);
 for(const z of [-3,-10]){
  box(rail,-27,4.35,z,239,.6,5.5,0x34414a);
  for(const off of [-1,1]) detail(-27,4.72,z+off,239,.11,.13,0x8a999e);
  for(let x=-144;x<92;x+=2.6) detail(x,4.69,z,1.0,.11,3.3,0x1d2931);
 }
 for(let x=-138;x<98;x+=20) if(Math.abs(x+65)>11&&Math.abs(x+7)>10) for(const z of [-13,1])wall(x,z,1.4,1.4,4.3,0x4e5c63);
 rail.traverse(o=>{if(o instanceof T.Mesh)o.material=(o.material as T.Material).clone();});
 for(const x of [-72,-58]){detail(x,5.5,-4,.25,.8,24,0x8e9693);}
 const under=label('PASSAGE SOUS LES VOIES','#7ddccf',1.3);under.position.set(-7,2,4);scene.add(under);
 // Stairs leading down from the courtyard into the underpass.
 for(let i=0;i<9;i++) detail(-7,1.7-i*.19,-24+i*1.1,4,.27,1.1,0x67737a);
 // Industrial containers, bollards and low cover. Low walls block bullets and navigation.
 for(const p of [{x:-90,z:-56},{x:-79,z:-21},{x:-121,z:9},{x:113,z:38},{x:87,z:-67}]) {
  wall(p.x,p.z,5,2.1,1.6,0x646153);
  for(let i=-2;i<=2;i++) detail(p.x+i,heightAt(p.x,p.z)+.85,p.z+1.08,.1,1.4,.06,0x8d8669);
 }
 for(const p of [{x:-48,z:46},{x:-122,z:-31},{x:30,z:74}]){wall(p.x,p.z,4,2.4,2.5,0x345b62);detail(p.x,heightAt(p.x,p.z)+2.6,p.z,4.1,.2,2.5,0x41747b);}
 // A few vents, neon puddles and rubbish piles give the streets scale.
 for(let i=0;i<85;i++){
  const x=Math.sin(i*61.2)*139,z=Math.cos(i*39.4)*117,y=heightAt(x,z);
  if(BLOCKS.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1))continue;
  detail(x,y+.04,z,1.5+Math.abs(Math.sin(i))*2,.025,.8,0x375061,.15);
  if(i%3===0)detail(x+1,y+.2,z+.8,.5,.4,.65,0x494d49);
 }
 // Plateau ramparts reference Angoulême's upper city.
 for(let z=-125;z<-35;z+=8)detail(25,3,z,2,6,7.7,0x45525c);
 const cityLabel=label('ANGOULÊME / SECTEUR 07','#65828b',2.5);cityLabel.position.set(-48,.2,116);scene.add(cityLabel);
 function cameraAt(x:number,z:number,angle:number){
  const g=new T.Group();g.position.set(x,heightAt(x,z),z);box(g,0,2.1,0,.18,4.2,.18,0x69777a);const eye=box(g,0,4.1,.4,.65,.4,.8,0xa8b8b7);eye.rotation.y=angle;
  const shape=new T.Shape();shape.moveTo(0,0);shape.lineTo(-8,17);shape.lineTo(8,17);shape.closePath();
  const cone=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color:0xffae55,transparent:true,opacity:.075,side:T.DoubleSide,depthWrite:false}));cone.rotation.x=Math.PI/2;cone.rotation.z=-angle;cone.position.y=.1;g.add(cone);scene.add(g);cameras.push({pos:{x,z},angle,mesh:g,cone,disabled:0});
 }
 cameraAt(-74,-61,0);cameraAt(126,25,-1.5);cameraAt(106,-109,0);cameraAt(58,-27,1.6);
 for(const [id,p]of Object.entries(LOC))if(!['car','gate','depotGate','nodeGate','gallery'].includes(id))markers[id]=ring(scene,p.x,p.z,id==='chip'||id==='registry'||id==='server'?0xf6b94a:0x76e0d2,1.7);
 for(const batch of batches.values()){
  const geo=mergeGeometries(batch.geos,false);if(geo){const mesh=new T.Mesh(geo,mat(batch.color,batch.emit));mesh.receiveShadow=true;scene.add(mesh);}batch.geos.forEach(g=>g.dispose());
 }
 // World edges are real collision barriers, including along all out-of-bounds approaches.
 for(const [x,z,w,d]of [[BOUNDS.minX,0,2,280],[BOUNDS.maxX,0,2,280],[0,BOUNDS.minZ,305,2],[0,BOUNDS.maxZ,305,2]]){const v=wall(x,z,w,d,20,0x182a34);v.mesh!.visible=false;}
 return {scene,walls,roofs,rail,gates,markers,cameras};
}

export function segmentBlocked(a:Point,b:Point,walls:Wall[],extra=.0) {
 const dx=b.x-a.x,dz=b.z-a.z;
 for(const w of walls){
  if(!w.collider.isEnabled())continue;
  let lo=0,hi=1;const minX=w.x-w.w/2-extra,maxX=w.x+w.w/2+extra,minZ=w.z-w.d/2-extra,maxZ=w.z+w.d/2+extra;
  if(Math.abs(dx)<.0001){if(a.x<minX||a.x>maxX)continue;}else{const t1=(minX-a.x)/dx,t2=(maxX-a.x)/dx;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
  if(Math.abs(dz)<.0001){if(a.z<minZ||a.z>maxZ)continue;}else{const t1=(minZ-a.z)/dz,t2=(maxZ-a.z)/dz;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
  if(hi>=lo&&hi>0.005&&lo<.995)return true;
 }return false;
}
