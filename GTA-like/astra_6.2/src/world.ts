import * as T from 'three'
import {streetscape,roofSkin,halo} from './surfaces'
import {blocks,walls,streetProps,roadsX,roadsZ,ground,sites,trackZ,underpasses,type Point} from './level'

const geo=new T.BoxGeometry(1,1,1), mats=new Map<string,T.MeshStandardMaterial>()
const mat=(color:string)=>{if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.78}));return mats.get(color)!}
function cube(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string):T.Mesh{
 const o=new T.Mesh(geo,mat(color));o.position.set(x,y,z);o.scale.set(w,h,d);parent.add(o);return o
}
function glow(col:string){return new T.MeshBasicMaterial({color:col,side:T.DoubleSide})}
function badge(txt:string,color:string,size:number){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const c=canvas.getContext('2d')!
 c.fillStyle='#11191be8';c.fillRect(0,0,512,80);c.fillStyle=color;c.fillRect(0,0,9,80)
 c.font='bold 42px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(txt,256,42,475)
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false}))
 sprite.scale.set(size,size*80/512,1);return sprite
}
export class Actor{
 obj=new T.Group(); body=new T.Group(); legs:T.Mesh[]=[]; arms:T.Mesh[]=[]
 constructor(scene:T.Scene,color:string,isPlayer=false){
  scene.add(this.obj);this.obj.add(this.body)
  cube(this.body,0,.98,0,.74,.7,.43,color);cube(this.body,0,1.48,0,.4,.41,.38,'#c09278')
  cube(this.body,0,1.68,-.04,.45,.14,.42,isPlayer?'#232931':'#303743');cube(this.body,0,1.48,.21,.31,.09,.05,isPlayer?'#b8ffff':'#fa8e6c')
  for(const n of [-1,1]){this.legs.push(cube(this.body,n*.19,.36,0,.26,.71,.3,'#252b32'));this.arms.push(cube(this.body,n*.44,.94,.07,.22,.62,.23,color))}
  if(isPlayer){cube(this.body,0,1.12,-.27,.53,.5,.19,'#b1bf43');cube(this.body,.34,1.12,.19,.13,.08,.65,'#899599')}
 }
 draw(q:Point,angle:number,phase:number,move:number,down:number,recoil=0){
   this.obj.position.set(q.x,ground(q.x,q.z)+.03,q.z);this.obj.rotation.y=angle;this.body.rotation.x=down*-1.52-recoil*.27
   this.body.position.z=down*.45;this.legs.forEach((a,i)=>a.rotation.x=Math.sin(phase+i*Math.PI)*move*.67);this.arms.forEach((a,i)=>a.rotation.x=Math.sin(phase-i*Math.PI)*move*.38)
 }
}
export class View{
 scene=new T.Scene();cam=new T.OrthographicCamera(-30,30,20,-20,.1,170);renderer:T.WebGLRenderer
 player:Actor;car=new T.Group();marker=new T.Group();aim=new T.Group(); gates=new Map<string,T.Object3D>()
 roofs:{obj:T.Group,x:number,z:number,w:number,d:number,h:number}[]=[];tracks=new T.Group()
 cones:T.Mesh[]=[];lamps:T.Mesh[]=[]; private batch=new Map<string,T.Matrix4[]>();private temp=new T.Object3D()
 private follow=new T.Vector3();private ray=new T.Raycaster();private plane=new T.Plane(new T.Vector3(0,1,0),0)
 private effects:{o:T.Mesh,life:number,vx:number,vz:number,vy:number}[]=[];private stains:T.Mesh[]=[];private stainIndex=0;private effectIndex=0
 private beam:T.Mesh;private beamTime=0;private frameTotal=0;private frames=0;private drawingScale=Math.min(devicePixelRatio,1.5)
 constructor(canvas:HTMLCanvasElement){
  this.renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(this.drawingScale)
  this.scene.background=new T.Color('#101c27');this.scene.fog=new T.FogExp2('#1f2e3d',.0055)
  this.scene.add(new T.HemisphereLight('#dbcff1','#718c92',1.85));const sun=new T.DirectionalLight('#b6dce2',1.9);sun.position.set(-36,55,-40);this.scene.add(sun)
  this.city();this.flush();streetscape(this.scene);this.player=new Actor(this.scene,'#c1d748',true)
  this.scene.add(this.car)
  cube(this.car,0,.56,0,2.05,.63,4.15,'#cbad48');cube(this.car,0,1.04,-.12,1.8,.46,2.10,'#253f4c');cube(this.car,0,1.31,-.18,1.7,.1,1.24,'#949b76')
  cube(this.car,0,.90,1.37,1.91,.08,1.05,'#a7a566');cube(this.car,0,.94,1.46,.32,.04,.82,'#27313b');cube(this.car,0,.98,-1.57,1.90,.12,.3,'#2f3942');cube(this.car,0,.38,-2.12,.56,.17,.03,'#e7dba8')
  for(const x of [-.7,.7])halo(this.car,x,.21,3,2.1,'#c5ebd7',.50)
  for(const x of [-1,1]){for(const z of [-1.33,1.26])cube(this.car,x*.99,.36,z,.26,.61,.67,'#111619')
   cube(this.car,x*.64,.65,2.1,.61,.13,.05,'#eeffff').material=glow('#e9ffde');cube(this.car,x*.69,.65,-2.1,.48,.14,.04,'#ff3a65').material=glow('#ff3866')}
  this.scene.add(this.marker,this.aim)
  const ring=new T.Mesh(new T.RingGeometry(.94,1.07,4),glow('#e3ff44'));ring.rotation.x=-Math.PI/2;this.marker.add(ring)
  const diamond=new T.Mesh(new T.OctahedronGeometry(.42),glow('#e6ff3a'));diamond.position.y=2.7;this.marker.add(diamond)
  const ret=new T.Mesh(new T.RingGeometry(.24,.32,24),glow('#f5ffda'));ret.rotation.x=-Math.PI/2;this.aim.add(ret)
  this.beam=new T.Mesh(geo,glow('#ffe88a'));this.beam.visible=false;this.scene.add(this.beam)
  for(let i=0;i<70;i++){const o=new T.Mesh(geo,mat(i%2?'#991a35':'#d63450'));o.visible=false;this.scene.add(o);this.effects.push({o,life:0,vx:0,vz:0,vy:0})}
  for(let i=0;i<42;i++){const o=new T.Mesh(new T.CircleGeometry(1,8),glow(i%2?'#6c2438':'#792137'));o.rotation.x=-Math.PI/2;o.visible=false;this.scene.add(o);this.stains.push(o)}
  this.resize();this.snap(sites.spawn)
 }
 private box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,rx=0,rz=0){
  const t=this.temp;t.position.set(x,y,z);t.scale.set(w,h,d);t.rotation.set(rx,0,rz);t.updateMatrix()
  if(!this.batch.has(color))this.batch.set(color,[]);this.batch.get(color)!.push(t.matrix.clone())
 }
 private flush(){for(const [color,matrices] of this.batch){const m=new T.InstancedMesh(geo,mat(color),matrices.length);matrices.forEach((v,i)=>m.setMatrixAt(i,v));this.scene.add(m)}this.batch.clear()}
 private city(){
  blocks.forEach((b,i)=>{
   const gr=ground(b.x,b.z),palette=[['#505a62','#3c4854','#655969'],['#657179','#56666e','#645d6a'],['#56687a','#617487','#4d586e']][b.district]
   const g=new T.Group();g.position.set(b.x,gr,b.z);this.scene.add(g);this.roofs.push({...b,obj:g})
   const add=(x:number,y:number,z:number,w:number,h:number,d:number,col:string)=>cube(g,x,y,z,w,h,d,col)
   this.box(b.x,gr+.12,b.z,b.w+1.3,.26,b.d+1.3,'#586368')
   add(0,b.h/2,0,b.w,b.h,b.d,palette[i%3]);add(0,b.h+.11,0,b.w+.28,.24,b.d+.28,'#26313b')
   add(0,b.h+.28,0,b.w-.44,.11,b.d-.42,palette[(i+1)%3])
   for(const n of [-1,1]){add(0,b.h+.41,n*(b.d/2-.1),b.w,.35,.17,'#78818a');add(n*(b.w/2-.1),b.h+.41,0,.17,.35,b.d,'#65717a')}
   for(let j=0;j<Math.floor(b.w/4);j++){const x=-b.w*.35+j*2.7;add(x,b.h+.72,-b.d*.18,1.65,.77,1.4,'#879095');for(let k=0;k<4;k++)add(x,b.h+1.13,-b.d*.18-.49+k*.27,1.19,.045,.10,'#35424a')}
   for(let j=0;j<Math.floor(b.w/2.3);j++){const x=-b.w*.42+j*2.2;for(let y=1.4;y<b.h-.8;y+=2.25){add(x,y,b.d/2+.03,1.22,.77,.09,(j+i)%4?'#43616a':'#d4aa72')}}
   for(let j=-b.d*.36;j<b.d*.4;j+=1.3)add(b.w*.23,b.h+.41,j,b.w*.30,.09,.12,'#72818c')
   add(-b.w*.36,1.3,b.d/2+.06,2,2.6,.18,'#2c393d');add(-b.w*.36,2.71,b.d/2+.13,2.3,.12,.19,i%3?'#69b9b4':'#dd6795')
   if(i===0||i===3||i===6||i===13||i===24){const label=badge(({0:'MINA / GARAGE',3:'DÉPÔT 09',6:'LES ATELIERS',13:'LA DALLE',24:'LE NŒUD'} as Record<number,string>)[i],i===3?'#f5a84b':'#86eee0',i===0?7:6.5);label.position.set(0,b.h+.8,b.d*.44);g.add(label)}
   // Batch the roof and façade separately per building so a whole occluder can fade.
   const items=g.children.filter((o):o is T.Mesh=>o instanceof T.Mesh)
   const shell=new T.InstancedMesh(geo,mat('#ffffff').clone(),items.length)
   items.forEach((o,n)=>{o.updateMatrix();shell.setMatrixAt(n,o.matrix);shell.setColorAt(n,(o.material as T.MeshStandardMaterial).color);g.remove(o)});g.add(shell)
   roofSkin(g,b,i)
   const strip=cube(g,0,b.h*.59,b.d/2+.08,Math.min(b.w*.76,10),.105,.12,'#5ee2d6');strip.material=glow(['#61e8db','#dc73be','#eaa266'][i%3])
   if(i===0||i===3){const garage=i===0,wx=garage?4.7:5.5,off=garage?-1:2;cube(g,off,1.36,b.d/2+.09,wx,2.7,.17,'#23333b')
    for(let u=0;u<11;u++)cube(g,off,.22+u*.23,b.d/2+.2,wx-.1,.07,.095,'#50646c')
    for(const dx of [-1,1])cube(g,off+dx*(wx/2+.13),1.46,b.d/2+.22,.10,2.92,.12,'#84ffdf').material=glow(garage?'#68ebdc':'#ff9679')
    cube(g,off,2.98,b.d/2+.56,wx+.9,.23,1.15,'#32424d');cube(g,off,3,b.d/2+1.12,wx+.8,.12,.08,'#66dec9').material=glow(garage?'#6ceee0':'#ea7c92')
   }
  })
  for(const b of [...walls,...streetProps]){const col=b.id?'#92a644':b.h>2?'#59636a':'#76808b'
    if(b.id){const g=new T.Group();g.position.set(b.x,ground(b.x,b.z),b.z);this.scene.add(g);this.gates.set(b.id,g);for(let i=-2;i<=2;i++)cube(g,b.w>1?i*b.w/5:0,b.h/2,b.d>1?i*b.d/5:0,b.w>1?.12:b.w,b.h,b.d>1?.12:b.d,col);cube(g,0,b.h*.8,0,b.w,.15,b.d,col)}
    else this.box(b.x,ground(b.x,b.z)+b.h/2,b.z,b.w,b.h,b.d,col)}
  this.scene.add(this.tracks)
  for(let x=-64;x<20;x+=2){cube(this.tracks,x,2.65,trackZ,2.04,.34,3,'#404751');for(const side of [-1,1])cube(this.tracks,x,2.93,trackZ+side*.91,2.04,.13,.13,'#b3b6b4');cube(this.tracks,x,2.86,trackZ,.26,.11,2.6,'#695d55')}
  for(const x of underpasses)for(let j=0;j<7;j++)this.box(x,.055,-20-j*.46,3.3,.1,.15,'#8c9690')
  for(const x of [20.3,29.7])for(let z=-36;z<=-15;z+=2)this.box(x,ground(25,z)+.53,z,.22,.6,2.12,'#94a2a6',-Math.atan((ground(25,z+1)-ground(25,z-1))/2))
  for(const z of roadsZ)for(let x=-51;x<160;x+=17){if(roadsX.some(q=>Math.abs(q-x)<4))continue;const g=ground(x,z);this.box(x,g+1.5,z+4.25,.13,3,.13,'#78828a');this.box(x,g+3.01,z+3.72,.38,.15,1.15,'#e6cf95')
   for(let j=0;j<3;j++)this.box(x+1+j*.19,g+.06,z+3.8,.06,.025,.56,'#48565b')}
 }
 cone(color:string,r:number,angle:number){
  const shape=new T.Shape();shape.moveTo(0,0);for(let i=0;i<=24;i++){const a=-angle+i*angle/12;shape.lineTo(Math.sin(a)*r,Math.cos(a)*r)}shape.closePath()
  const m=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color,transparent:true,opacity:.13,side:T.DoubleSide,depthWrite:false}));m.geometry.rotateX(Math.PI/2);this.scene.add(m);this.cones.push(m);return m
 }
 object(q:Point,label:string,color:string,scale=1){const g=new T.Group();g.position.set(q.x,ground(q.x,q.z),q.z);this.scene.add(g);cube(g,0,.54,0,1.15,1.08,.85,'#445760');cube(g,0,1.1,0,1.02,.13,.72,color);const s=badge(label,color,3.7*scale);s.position.y=2.1;g.add(s);return g}
 resize(){const c=this.renderer.domElement;const w=c.clientWidth||innerWidth,h=c.clientHeight||innerHeight;this.renderer.setSize(w,h,false);const half=18.5;this.cam.left=-half*w/h;this.cam.right=half*w/h;this.cam.top=half;this.cam.bottom=-half;this.cam.updateProjectionMatrix()}
 snap(q:Point){this.follow.set(q.x,ground(q.x,q.z),q.z);this.camera(q,1,0,0)}
 camera(q:Point,dt:number,angle:number,speed:number){const target=new T.Vector3(q.x+Math.sin(angle)*speed*.33,ground(q.x,q.z),q.z+Math.cos(angle)*speed*.33);this.follow.lerp(target,1-Math.exp(-dt*7));this.cam.position.copy(this.follow).add(new T.Vector3(0,39,23));this.cam.lookAt(this.follow);this.cam.updateMatrixWorld()}
 pick(nx:number,ny:number,height:number){this.ray.setFromCamera(new T.Vector2(nx,ny),this.cam);this.plane.constant=-height;const v=new T.Vector3();this.ray.ray.intersectPlane(this.plane,v);return {x:v.x,z:v.z}}
 screen(q:Point){const v=new T.Vector3(q.x,ground(q.x,q.z)+1.8,q.z).project(this.cam);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}}
 shot(a:Point,b:Point){const dx=b.x-a.x,dz=b.z-a.z;this.beam.visible=true;this.beamTime=.075;this.beam.position.set((a.x+b.x)/2,ground(a.x,a.z)+1,(a.z+b.z)/2);this.beam.rotation.y=Math.atan2(dx,dz);this.beam.scale.set(.06,.06,Math.hypot(dx,dz))}
 impact(q:Point,dx:number,dz:number,heavy:boolean){for(let i=0;i<(heavy?13:5);i++){const e=this.effects[this.effectIndex++%this.effects.length];e.life=.4+Math.random()*.35;e.o.visible=true;e.o.scale.setScalar(.09+Math.random()*.13);e.o.position.set(q.x,ground(q.x,q.z)+1,q.z);e.vx=dx*2+(Math.random()-.5)*4;e.vz=dz*2+(Math.random()-.5)*4;e.vy=1+Math.random()*3}
  const s=this.stains[this.stainIndex++%this.stains.length];s.visible=true;s.position.set(q.x,ground(q.x,q.z)+.15,q.z);s.scale.set(heavy?.88:.36,heavy?.53:.23,1);s.rotation.z=Math.random()*3}
 resetEffects(){for(const s of this.stains)s.visible=false;for(const e of this.effects){e.o.visible=false;e.life=0}}
 render(q:Point,dt:number,time:number){this.marker.children[1].position.y=2.7+Math.sin(time*3)*.18;this.marker.children[1].rotation.y=time
  for(const b of this.roofs){const fade=Math.abs(q.x-b.x)<b.w/2+1&&q.z<b.z&&q.z>b.z-b.d/2-b.h*.72; if(Boolean(b.obj.userData.faded)!==fade){b.obj.userData.faded=fade;for(const m of b.obj.children){if(m instanceof T.InstancedMesh){const a=m.material as T.MeshStandardMaterial;a.transparent=fade;a.opacity=fade?.20:1;a.depthWrite=!fade}else m.visible=!fade}}}
  this.tracks.visible=!(Math.abs(q.z-trackZ)<3.4&&underpasses.some(x=>Math.abs(q.x-x)<3.6))
  this.beamTime-=dt;if(this.beamTime<=0)this.beam.visible=false
  for(const e of this.effects)if(e.life>0){e.life-=dt;e.vy-=dt*12;e.o.position.x+=e.vx*dt;e.o.position.y+=e.vy*dt;e.o.position.z+=e.vz*dt;if(e.life<=0)e.o.visible=false}
  this.frameTotal+=dt;this.frames++
  if(this.frameTotal>=1.3){const average=this.frameTotal/this.frames;let next=this.drawingScale
   if(average>.032)next=Math.max(.5,this.drawingScale*.8)
   else if(average<.018&&this.frames>70)next=Math.min(Math.min(devicePixelRatio,1.5),this.drawingScale+.08)
   if(Math.abs(next-this.drawingScale)>.04){this.drawingScale=next;this.renderer.setPixelRatio(next)}
   this.frameTotal=0;this.frames=0
  }
  this.renderer.render(this.scene,this.cam)
 }
}
