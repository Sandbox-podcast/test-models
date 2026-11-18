import * as T from 'three'
import {blocks,roadsX,roadsZ,ground,type Block} from './level'

function noise(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function texture(canvas:HTMLCanvasElement){const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t}
export function streetscape(scene:T.Scene){
 const rng=noise(7401),x0=-71,x1=169,z0=-59,z1=62,unit=13,w=x1-x0,d=z1-z0
 const cv=document.createElement('canvas');cv.width=w*unit;cv.height=d*unit;const c=cv.getContext('2d')!
 c.scale(unit,unit);c.translate(-x0,-z0);c.fillStyle='#343a40';c.fillRect(x0,z0,w,d)
 const line=(x:number,z:number,ex:number,ez:number,col:string,width:number)=>{c.beginPath();c.moveTo(x,z);c.lineTo(ex,ez);c.strokeStyle=col;c.lineWidth=width;c.stroke()}
 const road=(x:number,z:number,rw:number,rd:number)=>{c.fillStyle='#677070';c.fillRect(x-.22,z-.22,rw+.44,rd+.44);c.fillStyle='#212932';c.fillRect(x,z,rw,rd)}
 for(const x of roadsX)road(x-3.8,z0,7.6,d)
 for(const z of roadsZ)road(x0,z-3.7,w,7.4)
 for(const x of roadsX)for(const z of roadsZ){c.fillStyle='#222a32';c.fillRect(x-4,z-4,8,8);for(let j=-3;j<=3;j++){c.fillStyle='#8c9593';c.fillRect(x+j*.88-.18,z+4.5,.36,1.05)}}
 for(const x of roadsX)for(let z=z0;z<z1;z+=5.3)if(!roadsZ.some(v=>Math.abs(v-z)<6))line(x,z,x,z+1.9,'#aea071',.12)
 for(const z of roadsZ)for(let x=x0;x<x1;x+=5.3)if(!roadsX.some(v=>Math.abs(v-x)<6))line(x,z,x+2,z,'#b5a56e',.13)
 for(let i=0;i<57000;i++){const x=x0+rng()*w,z=z0+rng()*d;c.fillStyle=rng()>.51?'#d5dddf13':'#01080e32';c.fillRect(x,z,.04+rng()*.18,.04+rng()*.10)}
 for(let i=0;i<550;i++){const x=x0+rng()*w,z=z0+rng()*d;line(x,z,x+.2+rng()*1.4,z+.2,'#0f181e66',.04)}
 for(const b of blocks){const x=b.x-b.w/2,z=b.z-b.d/2;c.fillStyle='#10161d';c.shadowBlur=unit*1.3;c.shadowColor='#02060bd9';c.shadowOffsetX=unit*1.2;c.shadowOffsetY=unit*1.1;c.fillRect(x,z,b.w,b.d);c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0
   for(let j=x;j<x+b.w;j+=1.35)line(j,z+b.d,j+.05,z+b.d+1.04,'#19262b',.065)
 }
 function light(x:number,z:number,r:number,color:string){const g=c.createRadialGradient(x,z,0,x,z,r);g.addColorStop(0,color+'ab');g.addColorStop(.32,color+'57');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(x-r,z-r,r*2,r*2)}
 for(const z of roadsZ)for(let x=-51;x<160;x+=17){if(roadsX.some(q=>Math.abs(q-x)<4))continue
   light(x,z+2.4,5.5,'#c28b47');const dl=x-1.1;for(let k=0;k<7;k++)line(dl+k*.14,z-3.25,dl+k*.14,z-2.92,'#11191d',.08)
   for(let k=0;k<7;k++){const ox=(rng()-.5)*3,oz=rng()*4;line(x+ox,z+oz,x+ox+.15+rng()*.3,z+oz,'#e3b97141',.055)}
 }
 for(const [x,z,r,col] of [[-44,16,7,'#1db8ad'],[-26,-11,6,'#ec735a'],[-19,17,6,'#b7609e'],[11,20,6,'#21aaa5'],[76,21,7,'#d35d8c'],[138,-4,6,'#1bb5dc']] as const)light(x,z,r,col)
 for(const [x,z,w,rot,word] of [[-32,19,2,0,'MINA / 07'],[-26,-2,2,0,'DÉPÔT 09'],[9,28,2.2,0,'ATELIERS'],[60,10,1.1,-Math.PI/2,'LA DALLE'],[130,1,1.4,0,'CONTRÔLE']] as const){c.save();c.translate(x,z);c.rotate(rot);c.font='bold '+w+'px monospace';c.fillStyle='#9caeaa80';c.fillText(word,0,0);c.restore()}
 for(const [x,z] of [[-44,15.5],[-22,-13],[5,-21],[135,-3]]){for(let k=0;k<7;k++)line(x+k*.55,z,x+.42+k*.55,z-.65,'#d3b15d',.19)}
 const xs=[x0,19.49,19.51,30.49,30.51,34,56,99,116,x1],zs=[z0,-38,-30,-20,-12,z1]
 const xyz:number[]=[],uv:number[]=[],indices:number[]=[]
 for(let iz=0;iz<zs.length;iz++)for(let ix=0;ix<xs.length;ix++){const x=xs[ix],z=zs[iz],i=iz*xs.length+ix
  xyz.push(x,ground(x,z)+.135,z);uv.push((x-x0)/w,1-(z-z0)/d)
  if(ix+1<xs.length&&iz+1<zs.length)indices.push(i,i+xs.length,i+1,i+1,i+xs.length,i+xs.length+1)
 }
 const mesh=new T.BufferGeometry();mesh.setAttribute('position',new T.Float32BufferAttribute(xyz,3));mesh.setAttribute('uv',new T.Float32BufferAttribute(uv,2));mesh.setIndex(indices)
 scene.add(new T.Mesh(mesh,new T.MeshBasicMaterial({map:texture(cv)})))
}
export function roofSkin(g:T.Group,b:Block,i:number){
 const rng=noise(813+i*211),cv=document.createElement('canvas');cv.width=512;cv.height=256;const c=cv.getContext('2d')!
 const colors=['#394a50','#4c454d','#485157','#444852','#3d5254'];c.fillStyle=colors[i%colors.length];c.fillRect(0,0,512,256)
 for(let k=0;k<3400;k++){c.fillStyle=rng()>.4?'#d0e2e313':'#090d1931';c.fillRect(rng()*512,rng()*256,rng()*5+1,rng()*2+1)}
 for(let x=0;x<512;x+=32){c.fillStyle='#141d2a83';c.fillRect(x,0,2.3,256);c.fillStyle='#b7c5c22b';c.fillRect(x+3,0,1.2,256)}
 for(let y=32;y<256;y+=78){c.fillStyle='#101a284a';c.fillRect(0,y,512,1.6)}
 const grad=c.createLinearGradient(0,0,512,256);grad.addColorStop(0,'#1013235e');grad.addColorStop(.65,'#17202b00');grad.addColorStop(1,i%2?'#83577860':'#48909266');c.fillStyle=grad;c.fillRect(0,0,512,256)
 c.fillStyle='#c4d0cb83';c.font='bold 29px monospace';c.fillText(String(i+7).padStart(2,'0'),24,224)
 const m=new T.Mesh(new T.PlaneGeometry(b.w-.52,b.d-.50),new T.MeshBasicMaterial({map:texture(cv)}));m.rotation.x=-Math.PI/2;m.position.y=b.h+.37;g.add(m)
}
export function halo(parent:T.Object3D,x:number,y:number,z:number,r:number,color:string,strength=.4){
 const cv=document.createElement('canvas');cv.width=cv.height=64;const c=cv.getContext('2d')!,g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffff');g.addColorStop(.28,'#ffffffa0');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,64,64)
 const m=new T.Mesh(new T.PlaneGeometry(r*2,r*2),new T.MeshBasicMaterial({map:texture(cv),color,transparent:true,opacity:strength,depthWrite:false,blending:T.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);parent.add(m)
}
