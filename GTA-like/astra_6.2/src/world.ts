import * as T from 'three'
import {streetscape,roofSkin,roofing,stonework,halo} from './surfaces'
import {blocks,walls,streetProps,ground,fixtures,sites,trackZ,underpasses,type Point} from './level'

const geo=new T.BoxGeometry(1,1,1), mats=new Map<string,T.MeshStandardMaterial>()
const mat=(color:string)=>{if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.78}));return mats.get(color)!}
function cube(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string):T.Mesh{
 const o=new T.Mesh(geo,mat(color));o.castShadow=true;o.receiveShadow=true;o.position.set(x,y,z);o.scale.set(w,h,d);parent.add(o);return o
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
  if(color==='#519a8d'){cube(this.body,-.16,1.2,.25,.19,.15,.06,'#fff0ab').material=glow('#ffdb8c');cube(this.body,.27,.89,.2,.13,.39,.12,'#c39864')}if(color==='#aa6662'){cube(this.body,0,1.22,0,.99,.29,.48,'#556069');cube(this.body,0,1.66,.02,.50,.21,.47,'#333c49')}
  if(isPlayer){cube(this.body,0,1.12,-.27,.53,.5,.19,'#b1bf43');cube(this.body,.34,1.12,.19,.13,.08,.65,'#899599')}
 }
 dress(zone:number,role:number){if(role%5===0){cube(this.body,0,1.72,.03,.48,.14,.47,zone===0||zone===3?'#c9a856':'#6c6e75');cube(this.body,0,1.08,.25,.65,.08,.04,'#d2c9a0')}else if(role%5===1){cube(this.body,0,.91,.23,.52,.78,.06,zone===3?'#9caa8a':'#64757b')}else if(role%5===2){cube(this.body,-.36,.85,-.18,.3,.45,.3,'#a3815c')}this.obj.scale.setScalar(.91+role%4*.047)}
 draw(q:Point,angle:number,phase:number,move:number,down:number,recoil=0){
   this.obj.position.set(q.x,ground(q.x,q.z)+.03,q.z);this.obj.rotation.y=angle;this.body.rotation.x=down*-1.52-recoil*.27
   this.body.position.z=down*.45;this.legs.forEach((a,i)=>a.rotation.x=Math.sin(phase+i*Math.PI)*move*.67);this.arms.forEach((a,i)=>a.rotation.x=Math.sin(phase-i*Math.PI)*move*.38)
 }
}
export class View{
 scene=new T.Scene();cam=new T.OrthographicCamera(-30,30,20,-20,.1,170);renderer:T.WebGLRenderer;sun=new T.DirectionalLight('#ffdfb3',2.1)
 player:Actor;car=new T.Group();marker=new T.Group();aim=new T.Group(); gates=new Map<string,T.Object3D>()
 roofs:{obj:T.Group,x:number,z:number,w:number,d:number,h:number}[]=[];freight=new T.Group();tracks=new T.Group()
 furniture=new Map<object,T.Group>();market=new T.Group();publicRelays=new T.Group();official=new T.Group();annotated=new T.Group();purge=new T.Group();nightExit=new T.Group();hemi?:T.HemisphereLight;carMarks:T.Mesh[]=[];brokenLights=new Set<number>(); brakeLights:T.Mesh[]=[];serviceLights=new T.Group();lure=new T.Group();lureUntil=0
 cones:T.Mesh[]=[];lamps:T.Mesh[]=[]; private batch=new Map<string,T.Matrix4[]>();private temp=new T.Object3D()
 private follow=new T.Vector3();private ray=new T.Raycaster();private plane=new T.Plane(new T.Vector3(0,1,0),0)
 private effects:{o:T.Mesh,life:number,vx:number,vz:number,vy:number}[]=[];private stains:T.Mesh[]=[];private stainIndex=0;private effectIndex=0
 private beam:T.Mesh;private beamTime=0;private frameTotal=0;private frames=0;private drawingScale=Math.min(devicePixelRatio,1.5)
 constructor(canvas:HTMLCanvasElement){
  this.renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(this.drawingScale)
  this.scene.background=new T.Color('#101c27');this.scene.fog=new T.FogExp2('#1f2e3d',.0055)
  this.hemi=new T.HemisphereLight('#dce4e0','#737d78',1.8);this.scene.add(this.hemi);const sun=this.sun;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-47,right:47,top:40,bottom:-40,near:.3,far:150});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.055;sun.shadow.bias=-.0004;this.scene.add(sun,sun.target);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap
  this.city();this.flush();streetscape(this.scene);this.player=new Actor(this.scene,'#c1d748',true)
  this.scene.add(this.car)
  cube(this.car,0,.56,0,2.05,.63,4.15,'#cbad48');cube(this.car,0,1.04,-.12,1.8,.46,2.10,'#253f4c');cube(this.car,0,1.31,-.18,1.7,.1,1.24,'#949b76')
  cube(this.car,0,.90,1.37,1.91,.08,1.05,'#a7a566');cube(this.car,0,.94,1.46,.32,.04,.82,'#27313b');cube(this.car,0,.98,-1.57,1.90,.12,.3,'#2f3942');cube(this.car,0,.38,-2.12,.56,.17,.03,'#e7dba8')
  for(const x of [-.7,.7])halo(this.car,x,.21,3,2.1,'#c5ebd7',.50)
  for(const x of [-1,1]){for(const z of [-1.33,1.26])cube(this.car,x*.99,.36,z,.26,.61,.67,'#111619')
   cube(this.car,x*.64,.65,2.1,.61,.13,.05,'#eeffff').material=glow('#e9ffde');const tail=cube(this.car,x*.69,.65,-2.1,.48,.14,.04,'#ff3a65');tail.material=glow('#a42636');this.brakeLights.push(tail)}
  for(const x of [-.55,.55])cube(this.car,x,.90,-1.4,.10,.09,.8,'#584332')
  this.scene.add(this.marker,this.aim,this.lure,this.serviceLights);this.lure.visible=false
  const pulse=new T.Mesh(new T.RingGeometry(.91,1,40),glow('#73efe1'));pulse.rotation.x=-Math.PI/2;this.lure.add(pulse)
  for(const z of [71,78,82]){const lamp=cube(this.serviceLights,36.65,1.9,z,.35,.32,.55,'#c3ffe1');lamp.material=glow('#aeffcc');halo(this.serviceLights,35.3,.12,z,3.6,'#81e3af',.65)}
  const ring=new T.Mesh(new T.RingGeometry(.94,1.07,4),glow('#e3ff44'));ring.rotation.x=-Math.PI/2;this.marker.add(ring)
  const diamond=new T.Mesh(new T.OctahedronGeometry(.42),glow('#e6ff3a'));diamond.position.y=2.7;this.marker.add(diamond)
  const ret=new T.Mesh(new T.RingGeometry(.24,.32,24),glow('#f5ffda'));ret.rotation.x=-Math.PI/2;this.aim.add(ret)
  this.beam=new T.Mesh(geo,glow('#ffe88a'));this.beam.visible=false;this.scene.add(this.beam)
  for(let i=0;i<70;i++){const o=new T.Mesh(geo,mat(i%2?'#991a35':'#d63450'));o.visible=false;this.scene.add(o);this.effects.push({o,life:0,vx:0,vz:0,vy:0})}
  for(let i=0;i<42;i++){const o=new T.Mesh(new T.CircleGeometry(1,8),glow(i%2?'#6c2438':'#792137'));o.rotation.x=-Math.PI/2;o.visible=false;this.scene.add(o);this.stains.push(o)}
  this.scene.traverse(o=>{if(o instanceof T.Mesh&&!(o.material as T.Material).transparent){o.receiveShadow=true;o.castShadow=o.geometry.type!=='PlaneGeometry'&&o.geometry.type!=='BufferGeometry'}});this.resize();this.snap(sites.spawn)
 }
 private box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,rx=0,rz=0){
  const t=this.temp;t.position.set(x,y,z);t.scale.set(w,h,d);t.rotation.set(rx,0,rz);t.updateMatrix()
  if(!this.batch.has(color))this.batch.set(color,[]);this.batch.get(color)!.push(t.matrix.clone())
 }
 private flush(){for(const [color,matrices] of this.batch){const m=new T.InstancedMesh(geo,mat(color),matrices.length);matrices.forEach((v,i)=>m.setMatrixAt(i,v));this.scene.add(m)}this.batch.clear()}
 private city(){
  blocks.forEach((b,i)=>{
   const gr=ground(b.x,b.z),palette=[['#b7aa93','#8d877d','#948574'],['#cbbdad','#b49884','#8d796e'],['#d6dce1','#99a3ac','#647080'],['#aba08f','#859591','#a99481'],['#c5b49b','#a2a091','#b1a18e']][b.district]
   const g=new T.Group();g.position.set(b.x,gr,b.z);this.scene.add(g);this.roofs.push({...b,obj:g})
   const add=(x:number,y:number,z:number,w:number,h:number,d:number,col:string)=>cube(g,x,y,z,w,h,d,col)
   this.box(b.x,gr+.12,b.z,b.w+1.3,.26,b.d+1.3,'#586368')
   const stone=add(0,b.h/2,0,b.w,b.h,b.d,palette[i%3]);stone.material=stonework(palette[i%3]);stone.userData.skin=true;add(0,b.h+.11,0,b.w+.28,.24,b.d+.28,'#26313b')
   add(0,b.h+.28,0,b.w-.44,.11,b.d-.42,palette[(i+1)%3])
   for(const n of [-1,1]){add(0,b.h+.41,n*(b.d/2-.1),b.w,.35,.17,'#78818a');add(n*(b.w/2-.1),b.h+.41,0,.17,.35,b.d,'#65717a')}
   for(let j=0;j<Math.floor(b.w/4);j++){const x=-b.w*.35+j*2.7;add(x,b.h+.72,-b.d*.18,1.65,.77,1.4,'#879095');for(let k=0;k<4;k++)add(x,b.h+1.13,-b.d*.18-.49+k*.27,1.19,.045,.10,'#35424a')}
   for(let j=0;j<Math.floor(b.w/2.3);j++){const x=-b.w*.42+j*2.2;for(let y=1.4;y<b.h-.8;y+=2.25){add(x,y,b.d/2+.03,1.22,.77,.09,(j+i)%4?'#43616a':'#d4aa72')}}
   for(let j=-b.d*.36;j<b.d*.4;j+=1.3)add(b.w*.23,b.h+.41,j,b.w*.30,.09,.12,'#72818c')
   add(-b.w*.36,1.3,b.d/2+.06,2,2.6,.18,'#2c393d');add(-b.w*.36,2.71,b.d/2+.13,2.3,.12,.19,i%3?'#69b9b4':'#dd6795')
   if(b.district===0||b.district===3){for(let z=-b.d*.4;z<b.d*.49;z+=2.4){add(-b.w/2-.09,b.h*.5,z,.13,b.h,.19,'#9e927e');add(b.w/2+.09,b.h*.5,z,.13,b.h,.19,'#9e927e')}
    for(let j=0;j<5;j++)add(b.w*.3+j*.18,b.h*.4,b.d/2+.13,.07,b.h*.63,.09,'#697774')
    for(const side of [-1,1]){const roof=add(side*b.w/4,b.h+.6,0,b.w*.516,.17,b.d+.35,i%2?'#615a55':'#586771');roof.rotation.z=-side*.105;roof.material=roofing(i%2?'#78675a':'#566b72');roof.userData.roof=true}}
   if(b.district===0||b.district===3){
    for(const zSide of [-1,1])for(let j=0;j<Math.max(1,Math.floor(b.w/4));j++){
     const x=-b.w/2+2.1+j*3.7,z=zSide*(b.d/2+.075),lit=(j+i)%3>0,y=b.h*.62
     add(x,y,z,1.72,1.40,.11,'#453c36');add(x,y,z+zSide*.09,1.50,1.18,.07,lit?'#d69750':'#546a71')
     add(x,y,z+zSide*.15,.09,1.22,.08,'#454441');add(x,y-.08,z+zSide*.15,1.53,.075,.08,'#454441')
     add(x,y-.79,z+zSide*.1,1.94,.14,.28,'#a49c85');add(x,y+.79,z,1.90,.16,.18,'#a79c85')
    }
    for(const end of [-1,1]){add(end*(b.w/2-.18),b.h/2,b.d/2+.06,.33,b.h,.25,'#b5a991');add(end*(b.w/2-.45),b.h*.46,-b.d/2-.18,.12,b.h*.91,.14,'#555d59')}
   }
   if(b.district===1||b.district===4){for(let j=0;j<Math.floor(b.w/4);j++){const x=-b.w/2+2+j*4;add(x,2.9,b.d/2+.33,2,.16,.76,'#aa9584');add(x,3.43,b.d/2+.70,2,.14,.09,'#715d55');add(x+.35,3.47,b.d/2+.74,.76,.64,.06,['#b89779','#739e9a','#ad7e86'][j%3])}}
   const label=badge(b.name.toLocaleUpperCase('fr'),['#ffd39b','#f1c4a1','#e1e7fa','#a1dfc9','#f4c0a3'][b.district],Math.min(9,b.w*.82));label.position.set(0,b.h+1.37,b.d*.43);g.add(label)
   // Batch the roof and façade separately per building so a whole occluder can fade.
   const items=g.children.filter((o):o is T.Mesh=>o instanceof T.Mesh&&!o.userData.roof&&!o.userData.skin)
   const shell=new T.InstancedMesh(geo,mat('#ffffff').clone(),items.length)
   items.forEach((o,n)=>{o.updateMatrix();shell.setMatrixAt(n,o.matrix);shell.setColorAt(n,(o.material as T.MeshStandardMaterial).color);g.remove(o)});g.add(shell)
   roofSkin(g,b,i)
   const strip=cube(g,0,b.h*.59,b.d/2+.08,Math.min(b.w*.76,10),.105,.12,'#5ee2d6');strip.material=glow(['#ffc370','#eab296','#c4deef','#79c3b0','#ecb591'][b.district])
   if(i===0||i===2){const garage=i===0,wx=garage?4.7:5.5,off=garage?-1:2;cube(g,off,1.36,b.d/2+.09,wx,2.7,.17,'#23333b')
    for(let u=0;u<11;u++)cube(g,off,.22+u*.23,b.d/2+.2,wx-.1,.07,.095,'#50646c')
    for(const dx of [-1,1])cube(g,off+dx*(wx/2+.13),1.46,b.d/2+.22,.10,2.92,.12,'#84ffdf').material=glow(garage?'#ffd08a':'#a3d5a8')
    cube(g,off,2.98,b.d/2+.56,wx+.9,.23,1.15,'#32424d');cube(g,off,3,b.d/2+1.12,wx+.8,.12,.08,'#66dec9').material=glow(garage?'#ffc370':'#82d9af')
   }
  })
  for(const b of [...walls,...streetProps]){const col=b.id?'#92a644':b.h>2?'#59636a':'#76808b'
    if(b.id){const g=new T.Group();g.position.set(b.x,b.base??ground(b.x,b.z),b.z);this.scene.add(g);this.gates.set(b.id,g);for(let i=-2;i<=2;i++)cube(g,b.w>1?i*b.w/5:0,b.h/2,b.d>1?i*b.d/5:0,b.w>1?.12:b.w,b.h,b.d>1?.12:b.d,col);cube(g,0,b.h*.8,0,b.w,.15,b.d,col)}
    else if(b.kind==='light'){const g=new T.Group();g.position.set(b.x,ground(b.x,b.z),b.z);this.scene.add(g);this.furniture.set(b,g);cube(g,0,b.h/2,0,b.w,b.h,b.d,'#58676d');cube(g,0,b.h,.05,.52,.20,.65,'#ffe0a2').material=glow('#ffd49e')}
    else if(!b.kind)this.box(b.x,(b.base??ground(b.x,b.z))+b.h/2,b.z,b.w,b.h,b.d,col)}
  this.scene.add(this.tracks,this.market,this.publicRelays,this.official,this.annotated,this.purge,this.nightExit)
  for(const {point:b,label} of fixtures){const g=new T.Group();g.position.set(b.x,ground(b.x,b.z),b.z);this.scene.add(g);this.furniture.set(b,g)
   if(b.kind==='tree'){cube(g,0,1.4,0,.55,2.8,.55,'#735b49');const crown=new T.Mesh(new T.IcosahedronGeometry(1.65,0),mat('#647b5f'));crown.position.y=3.35;g.add(crown)}
   else if(b.kind==='stall'){cube(g,0,.65,0,b.w,1.2,b.d,'#89755c');for(const v of [-1,1])cube(g,v*(b.w/2-.13),1.7,0,.13,1.65,.13,'#b7ae98');for(let j=0;j<5;j++)cube(g,-b.w*.4+j*b.w/5,2.6,0,b.w/5,.15,b.d+.4,j%2?'#e2bc8e':'#548379');for(const v of [-1,0,1]){const box=cube(this.market,0,0,0,.54,.29,.56,['#a66d54','#9d9e65','#be9458'][v+1]);box.position.set(b.x+v*.65,g.position.y+1.32,b.z)}}
   else if(b.kind==='table'||b.kind==='bench'){cube(g,0,.69,0,b.w,.18,b.d,'#c29b71');for(const v of [-1,1])cube(g,v*b.w*.32,.32,0,.14,.64,b.d*.68,'#596462');if(b.kind==='bench')cube(g,0,.99,-b.d*.4,b.w,.55,.1,'#b6936f')}
   else if(label==='Papier'||label==='Pneus'){for(let k=0;k<3;k++){const cyl=new T.Mesh(new T.CylinderGeometry(b.w*.45,b.w*.45,b.h/3-.035,16),mat(label==='Papier'?'#d2c7ad':'#36383a'));cyl.position.y=(k+.5)*b.h/3;g.add(cyl)}const hole=new T.Mesh(new T.CylinderGeometry(.17,.17,.05,12),mat('#5b5147'));hole.position.y=b.h;g.add(hole)}
   else if(label==='Servante'||label==='Outillage'){cube(g,0,b.h/2,0,b.w,b.h,b.d,'#96593f');for(let j=1;j<5;j++)cube(g,0,b.h*j/5,-b.d/2,.65,.055,.08,'#d5ccab');cube(g,0,b.h+.05,0,b.w+.08,.1,b.d+.1,'#737d76')}
   else{cube(g,0,b.h/2,0,b.w,b.h,b.d,b.kind==='terminal'?'#596d70':'#87775f');cube(g,0,b.h+.04,0,b.w*1.02,.1,b.d*1.01,b.kind==='terminal'?'#89d1b2':'#b7a389')}
   if(label&&b.kind!=='box'){const text=badge(label.toUpperCase(),'#d9e7cc',4.2);text.position.y=b.h+.7;g.add(text)}}
  const sign=(parent:T.Group,q:Point,text:string,col:string)=>{cube(parent,q.x,ground(q.x,q.z)+1,q.z,.12,2,.12,'#889293');const tag=badge(text,col,5.6);tag.position.set(q.x,ground(q.x,q.z)+2.3,q.z);parent.add(tag)}
  sign(this.publicRelays,sites.mina,'RELAIS · DROITS PROVISOIRES','#91efb3');sign(this.official,sites.service,'CELLULE DE RECOURS','#c4d9f8');sign(this.annotated,sites.garageMap,'PLAN DU COTEAU','#e4ba85');sign(this.purge,sites.power,'PURGE · 00 H 00','#ff9c78')
  this.tracks.add(this.freight)
  for(let j=0;j<4;j++){const x=-j*6.8;cube(this.freight,x,.58,0,6.3,1,1.9,'#514944')
   cube(this.freight,x,1.34,0,5.98,.9,1.78,j?'#84664d':'#647b75')
   for(const e of [-1,1]){cube(this.freight,x+e*2.1,.18,0,1.0,.38,1.97,'#323536');cube(this.freight,x+e*1.8,1.83,0,.13,.12,1.72,'#4b504c')}}
  const architectureSigns=new T.Group();this.scene.add(architectureSigns)
  for(const [id,label] of [['entretien','ENTRETIEN · PORTIQUE B'],['maintenance','RELAIS · RELÈVE'],['coursive','COURSIVE · CONTRÔLE'],['archives','ARCHIVES · ACCÈS LATÉRAL']]){
   const gate=walls.find(w=>w.id===id)!;sign(architectureSigns,{x:gate.x+.6,z:gate.z+gate.d*.62},label,'#edc49a')}
  sign(this.nightExit,sites.exit,'SORTIE ÉQUIPE DE NUIT','#a4e8b1')
  for(let x=1;x<180;x+=2){const tunnel=underpasses.some(v=>Math.abs(x-v)<4.2)
   const part=(y:number,z:number,w:number,h:number,d:number,col:string)=>{if(tunnel)cube(this.tracks,x,y,z,w,h,d,col);else this.box(x,y,z,w,h,d,col)}
   part(2.75,trackZ,2,.42,9.9,'#485258');for(const s of [-3,-1.55,1.55,3])part(3.13,trackZ+s,2,.14,.12,'#a5a8a3');part(3.01,trackZ,.27,.1,8,'#66574e');if(x%16===1&&x!==161){this.box(x,4.65,trackZ-4.6,.15,3.4,.15,'#686a62');this.box(x,6.3,trackZ-3.9,.18,.14,1.65,'#7d7f72')}}
  for(const x of underpasses){for(const side of [-1,1]){const xx=x+side*3.92;for(let z=66.5;z<82;z+=1.25){const gy=ground(xx,z);this.box(xx,gy+.7,z,.1,1.4,.1,'#6c786e');this.box(xx,gy+1.25,z,.11,.12,1.35,'#9aa295',z<70?Math.PI*.24:0)}
   for(const z of [71,78]){this.box(xx,1.95,z,.35,.3,.5,'#edd599');halo(this.scene,xx-side*.8,.10,z,2.7,'#f2bc72',.35)}}
  }
  for(const x of underpasses)for(let j=0;j<15;j++){const z=64+j*.4;this.box(x,ground(x,z)+.075,z,7.7,.10,.14,'#c1b297')}
  for(const [cx,cz,w,d,h,name] of [[32,50,21,17,4.8,'MINA · MÉCANIQUE'],[91.8,52,24,24,5.9,'DÉPÔT CIVIS']] as const){
   const g=new T.Group();g.position.set(cx,6,cz);this.scene.add(g);this.roofs.push({obj:g,x:cx,z:cz,w,d,h})
   const roofColor=cx===32?'#71675d':'#626d70'
   for(const side of [-1,1]){const roof=cube(g,side*w/4,h+.7,0,w*.518,.22,d+.75,roofColor);roof.rotation.z=-side*.20;roof.material=roofing(roofColor)
    for(let j=-d*.48;j<d*.5;j+=1.3){const seam=cube(g,side*w/4,h+.84,j,w*.518,.08,.09,'#8b887d');seam.rotation.z=-side*.20}}
   for(const side of [-1,1])for(let j=0;j<3;j++){const x=side*w*.23,z=-d*.34+j*d*.30,tilt=-side*.20
    const frame=cube(g,x,h+.94,z,w*.24,.17,2.6,'#433c32');frame.rotation.z=tilt
    for(const bar of [-1,0,1]){const glass=cube(g,x+bar*w*.073,h+1.06-bar*side*w*.0146,z,w*.065,.12,2.23,'#b4824c');glass.rotation.z=tilt}}
   const label=badge(name,'#ffd597',8);label.position.set(0,h-.45,-d/2);g.add(label)
   for(const side of [-1,1]){for(let j=0;j<3;j++){const xx=cx+side*(w/2-.8);this.box(xx,7.1+j*1.1,cz+1.4,.78,.10,4.3,'#5d655e');for(let k=0;k<3;k++)this.box(xx,7.36+j*1.1,cz+k*.99,.46,.45,.71,k%2?'#99694c':'#a8a196')}
    this.box(cx+side*(w/2-.2),6+h/2,cz-d/2,.35,h,.35,'#756c60');this.box(cx+side*(w/2-.2),6+h-.65,cz-d/2-.15,.72,.22,.43,'#ffd098');halo(this.scene,cx+side*(w*.39),6.12,cz-d*.4,3.8,'#ffbb69',.45)}
  }
 }
 cone(color:string,r:number,angle:number){
  const shape=new T.Shape();shape.moveTo(0,0);for(let i=0;i<=24;i++){const a=-angle+i*angle/12;shape.lineTo(Math.sin(a)*r,Math.cos(a)*r)}shape.closePath()
  const m=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color,transparent:true,opacity:.13,side:T.DoubleSide,depthWrite:false}));m.geometry.rotateX(Math.PI/2);this.scene.add(m);this.cones.push(m);return m
 }
 object(q:Point,label:string,color:string,scale=1){const g=new T.Group();g.position.set(q.x,ground(q.x,q.z),q.z);this.scene.add(g);cube(g,0,.54,0,1.15,1.08,.85,'#445760');cube(g,0,1.1,0,1.02,.13,.72,color);const s=badge(label,color,3.7*scale);s.position.y=2.1;g.add(s);return g}
 resize(){const c=this.renderer.domElement;const w=c.clientWidth||innerWidth,h=c.clientHeight||innerHeight;this.renderer.setSize(w,h,false);const half=18.5;this.cam.left=-half*w/h;this.cam.right=half*w/h;this.cam.top=half;this.cam.bottom=-half;this.cam.updateProjectionMatrix()}
 snap(q:Point){this.follow.set(q.x,ground(q.x,q.z),q.z);this.camera(q,1,0,0)}
 camera(q:Point,dt:number,angle:number,speed:number){const target=new T.Vector3(q.x+Math.sin(angle)*speed*.33,ground(q.x,q.z),q.z+Math.cos(angle)*speed*.33);this.follow.lerp(target,1-Math.exp(-dt*7));this.sun.target.position.copy(this.follow);this.sun.position.copy(this.follow).add(new T.Vector3(-28,45,-30));this.cam.position.copy(this.follow).add(new T.Vector3(0,39,23));this.cam.lookAt(this.follow);this.cam.updateMatrixWorld()}
 pick(nx:number,ny:number,height:number){this.ray.setFromCamera(new T.Vector2(nx,ny),this.cam);this.plane.constant=-height;const v=new T.Vector3();this.ray.ray.intersectPlane(this.plane,v);return {x:v.x,z:v.z}}
 screen(q:Point){const v=new T.Vector3(q.x,ground(q.x,q.z)+1.8,q.z).project(this.cam);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}}
 shot(a:Point,b:Point){const dx=b.x-a.x,dz=b.z-a.z;this.beam.visible=true;this.beamTime=.075;this.beam.position.set((a.x+b.x)/2,ground(a.x,a.z)+1,(a.z+b.z)/2);this.beam.rotation.y=Math.atan2(dx,dz);this.beam.scale.set(.06,.06,Math.hypot(dx,dz))}
 impact(q:Point,dx:number,dz:number,heavy:boolean){for(let i=0;i<(heavy?13:5);i++){const e=this.effects[this.effectIndex++%this.effects.length];e.life=.4+Math.random()*.35;e.o.visible=true;e.o.scale.setScalar(.09+Math.random()*.13);e.o.position.set(q.x,ground(q.x,q.z)+1,q.z);e.vx=dx*2+(Math.random()-.5)*4;e.vz=dz*2+(Math.random()-.5)*4;e.vy=1+Math.random()*3}
  const s=this.stains[this.stainIndex++%this.stains.length];s.visible=true;s.position.set(q.x,ground(q.x,q.z)+.15,q.z);s.scale.set(heavy?.88:.36,heavy?.53:.23,1);s.rotation.z=Math.random()*3}
 carImpact(side:number,end:number,severity:number,front:boolean){
  const x=front?Math.max(-.86,Math.min(.86,side)):Math.sign(side)*1.04,z=front?Math.sign(end)*2.09:Math.max(-1.65,Math.min(1.65,end))
  const scar=cube(this.car,x,.67,z,front?.27+.25*severity:.065,.065+.055*severity,front?.065:.40+.32*severity,severity===1?'#ddd5be':'#433b37')
  scar.rotation.z=.18*Math.sign(side||1);this.carMarks.push(scar)
  if(severity>=2){const trim=cube(this.car,x,.43,z,front?.76:.12,.12,front?.14:.79,'#626364');trim.rotation.x=.17*severity;trim.rotation.z=.1*severity*Math.sign(side||1);this.carMarks.push(trim)}
  if(severity>=3&&front&&end>0){const lamp=cube(this.car,Math.sign(side||1)*.64,.65,2.14,.62,.16,.06,'#27272a');this.carMarks.push(lamp)}
  while(this.carMarks.length>32)this.car.remove(this.carMarks.shift()!)
 }
 resetEffects(){this.lureUntil=0;this.lure.visible=false;this.beamTime=0;this.beam.visible=false;for(const m of this.carMarks)this.car.remove(m);this.carMarks=[];for(const g of this.furniture.values())g.rotation.z=0;for(const s of this.stains)s.visible=false;for(const e of this.effects){e.o.visible=false;e.life=0}}
 render(q:Point,dt:number,time:number){this.marker.children[1].position.y=2.7+Math.sin(time*3)*.18;this.marker.children[1].rotation.y=time
  for(const b of this.roofs){const fade=Math.abs(q.x-b.x)<b.w/2+1&&q.z<b.z+b.d/2+.8&&q.z>b.z-b.d/2-b.h*.72; if(Boolean(b.obj.userData.faded)!==fade){b.obj.userData.faded=fade;for(const m of b.obj.children){if(m instanceof T.InstancedMesh){const a=m.material as T.MeshStandardMaterial;a.transparent=fade;a.opacity=fade?.20:1;a.depthWrite=!fade}else m.visible=!fade}}}
  this.tracks.visible=!(Math.abs(q.z-trackZ)<6&&underpasses.some(x=>Math.abs(q.x-x)<4.5))
  const trainX=(time%61)*6.5-90;this.freight.position.set(trainX,3.13,73.4);this.freight.visible=trainX>1&&trainX<185;this.lure.visible=time<this.lureUntil;if(this.lure.visible)this.lure.scale.setScalar(.5+((this.lureUntil-time)*2%1)*3)
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
