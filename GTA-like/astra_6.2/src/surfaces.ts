import * as T from 'three'
import {origins,routes,nearestLane,ground,ribbon,along,sites,type Block} from './level'

function noise(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function texture(canvas:HTMLCanvasElement){const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t}

function roadMaterial(col:string,rough=false){
 const cv=document.createElement('canvas');cv.width=cv.height=128;const c=cv.getContext('2d')!;c.fillStyle=col;c.fillRect(0,0,128,128)
 const rand=noise(90);for(let i=0;i<2600;i++){c.fillStyle=rand()>.48?'#d8dfd80d':'#09121d1c';c.fillRect(rand()*128,rand()*128,rand()*2+.5,rand()*2+.5)}
 if(rough){c.strokeStyle='#93978838';c.strokeRect(0,0,64,32);c.strokeRect(64,0,64,32)}
 const map=texture(cv);map.wrapS=map.wrapT=T.RepeatWrapping
 return new T.MeshStandardMaterial({map,roughness:.87,side:T.DoubleSide})
}
const wallsByColor=new Map<string,T.MeshStandardMaterial>()
export function stonework(color:string){
 const old=wallsByColor.get(color);if(old)return old
 const cv=document.createElement('canvas');cv.width=512;cv.height=256;const c=cv.getContext('2d')!,rng=noise(475)
 c.fillStyle=color;c.fillRect(0,0,512,256)
 for(let row=0;row<16;row++){let x=row%2?-17:-3
  while(x<512){const w=20+Math.floor(rng()*26),y=row*16;c.fillStyle=rng()>.48?'#f9edcd25':'#3a392f25';c.fillRect(x+1,y+1,w-1,14)
   c.fillStyle='#35312e50';c.fillRect(x,y+15,w,1);c.fillRect(x,y,1,15);x+=w}}
 for(let i=0;i<9200;i++){c.fillStyle=rng()>.5?'#f2edcf1c':'#483f322b';c.fillRect(rng()*512,rng()*256,1+rng()*3,1)}
 const m=new T.MeshStandardMaterial({map:texture(cv),roughness:.94});wallsByColor.set(color,m);return m
}
export function streetscape(scene:T.Scene){
 const groundMats=['#525755','#898078','#59626a','#6c726c','#837b70'].map(c=>roadMaterial(c,true))
 const road=roadMaterial('#343d45'),side=roadMaterial('#81857f',true),path=roadMaterial('#757d77',true)
 const marking=new T.MeshBasicMaterial({color:'#b3aba0'}), stripes=new T.InstancedMesh(new T.BoxGeometry(1,1,1),marking,routes.reduce((n,r)=>n+Math.ceil(r.length/4)*3,0))
 const temp=new T.Object3D();let count=0
 function stripe(x:number,y:number,z:number,a:number,w:number,d:number){temp.position.set(x,y,z);temp.rotation.set(0,a,0);temp.scale.set(w,.025,d);temp.updateMatrix();stripes.setMatrixAt(count++,temp.matrix)}
 function mesh(vertices:Float32Array,indices:Uint32Array,material:T.Material){
  const g=new T.BufferGeometry(),uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/6,vertices[i+2]/6)
  g.setAttribute('position',new T.BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(new T.BufferAttribute(indices,1));g.computeVertexNormals();scene.add(new T.Mesh(g,material))
 }
 // Beyond the playable streets, the Charente valley continues below the escarpments.
 const valley=roadMaterial('#586450',true),vx:number[]=[],vi:number[]=[],rows=62,cols=80
 for(let z=0;z<=rows;z++)for(let x=0;x<=cols;x++){const xx=-110+x*8,zz=-305+z*10
  vx.push(xx,-3+.7*Math.sin(xx*.045+zz*.035)+.48*Math.cos(zz*.074),zz);const a=z*(cols+1)+x
  if(x<cols&&z<rows)vi.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2)}
 mesh(new Float32Array(vx),new Uint32Array(vi),valley)
 for(const [i,o] of origins.entries()){
  const w=i?160:180,d=i?110:120,nx=Math.ceil(w/2),nz=Math.ceil(d/2),xyz=[],idx=[]
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){const xx=o.x+x*w/nx,zz=o.z+z*d/nz;let y=ground(xx,zz)-.1
   const close=nearestLane({x:xx,z:zz});if(close&&close.d<close.r.width/2+.85)y-=.28
   if(i===0&&xx>155&&xx<175&&zz>=70&&zz<=80)y=0
   xyz.push(xx,y,zz);const v=z*(nx+1)+x;if(x<nx&&z<nz)idx.push(v,v+nx+1,v+1,v+1,v+nx+1,v+nx+2)}
  mesh(new Float32Array(xyz),new Uint32Array(idx),groundMats[i])
  const face:number[]=[],tris:number[]=[],rim=[...Array.from({length:nx+1},(_,x)=>x),...Array.from({length:nz},(_,z)=>(z+1)*(nx+1)+nx),...Array.from({length:nx},(_,x)=>nz*(nx+1)+nx-1-x),...Array.from({length:nz},(_,z)=>(nz-1-z)*(nx+1))]
  for(const [j,v] of rim.entries()){const [x,y,z]=xyz.slice(v*3,v*3+3);face.push(x,y,z,x,-4.8,z);if(j){const k=j*2;tris.push(k-2,k-1,k,k,k-1,k+1)}}
  mesh(new Float32Array(face),new Uint32Array(tris),groundMats[i])
 }
 for(const lane of routes){
  const width=lane.width/2
  const draw=(a:number,b:number,h:number,m:T.Material)=>{const data=ribbon(lane,a,b,h);mesh(data.vertices,data.indices,m)}
  if(lane.zone<0)draw(-width-3.1,width+3.1,-.08,groundMats[0]);
  if(lane.road){draw(-width-1.55,width+1.55,.025,side);draw(-width,width,.06,road)
   if(lane.length>50)for(let s=3;s<lane.length;s+=5.3){const q=along(lane,s);stripe(q.x,q.y+.09,q.z,q.angle,.115,2)}
  }else draw(-width,width,.046,path)
 }
 for(const z of [38,65.5])for(let i=-3;i<=3;i++)stripe((z===38?112:125)+i*.9,ground(z===38?112:125,z)+.10,z,0,.46,1.5)
 for(const lane of routes.filter(r=>r.road&&r.zone>=0&&r.length>50)){
  for(const s of [22,lane.length*.48]){const q=along(lane,s);for(let v=-4;v<=4;v++){stripe(q.x+Math.cos(q.angle)*v,q.y+.105,q.z-Math.sin(q.angle)*v,q.angle,.49,1.8)}}
 }
 stripes.count=count;scene.add(stripes)
 const water=new T.Mesh(new T.PlaneGeometry(167,22),roadMaterial('#295b68'));water.rotation.x=-Math.PI/2;water.position.set(origins[3].x+80,.06,origins[3].z+100);scene.add(water)
 function stencil(x:number,z:number,w:number,d:number,text:string,color:string){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const c=cv.getContext('2d')!;c.fillStyle=color;c.font='bold 78px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,65,500)
  const mesh=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:texture(cv),transparent:true,opacity:.72,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,ground(x,z)+.15,z);scene.add(mesh)
 }
 for(const [x,z,txt] of [[32,39,'ATELIER 07'],[112,39,'P / LIVRAISON'],[113,52,'QUAI 09'],[135,92,'RUE BASSE'],[125,62,'PASSAGE ↓']] as const)stencil(x,z,7.8,1.4,txt,'#d6c298')
 for(const [x,z] of [[32,47],[112,38],[142,97]]){for(const side of [-1,1])stripe(x+side*1.7,ground(x,z)+.12,z,0,.095,5.2);stripe(x,ground(x,z)+.12,z+2.6,0,3.4,.11)}
 stripes.count=count
 const signals:[[number,number],string][]=[[[sites.garage.x,sites.garage.z],'#ffc370'],[[sites.gate.x,sites.gate.z],'#82d9af'],[[sites.drop.x,sites.drop.z],'#e3a85d']]
 for(const [[x,z],color] of signals)halo(scene,x,ground(x,z)+.14,z,5,color,.50)
}
const corrugated=new Map<string,T.MeshStandardMaterial>()
export function roofing(color:string){
 if(corrugated.has(color))return corrugated.get(color)!
 const cv=document.createElement('canvas');cv.width=512;cv.height=256;const c=cv.getContext('2d')!,rng=noise(531);c.fillStyle=color;c.fillRect(0,0,512,256)
 for(let j=0;j<256;j+=8){const shade=c.createLinearGradient(0,j,0,j+8);shade.addColorStop(0,'#11161972');shade.addColorStop(.28,'#d5ddc84d');shade.addColorStop(.5,'#27333800');shade.addColorStop(1,'#262c3040');c.fillStyle=shade;c.fillRect(0,j,512,8)}
 for(let i=0;i<6600;i++){const x=rng()*512,y=rng()*256;c.fillStyle=i%3?'#c0b6a31b':'#62412a42';c.fillRect(x,y,rng()*6+.3,.6+rng()*1.1)}
 for(const x of [14,142,274,410]){c.fillStyle='#25282588';c.fillRect(x,0,2,256);for(let y=5;y<256;y+=24){c.fillStyle='#d3ceba';c.fillRect(x+1,y,2,2)}}
 const m=new T.MeshStandardMaterial({map:texture(cv),roughness:.78,metalness:.12});corrugated.set(color,m);return m
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
