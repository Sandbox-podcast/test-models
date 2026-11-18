import * as T from 'three'
import {ground,type Point} from './level'
export const daylight={value:.8},cityTime={value:0}
const vertex=`varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
const fragment=`varying vec2 coord;uniform float time;uniform vec3 tint;uniform float beam;void main(){
 vec2 uv=coord-0.5;float glow=pow(max(0.,1.-2.*length(uv)),2.);
 if(beam>.5){float t=coord.y;float width=mix(.41,.065,t);glow=pow(max(0.,1.-abs(uv.x)/width),2.)*smoothstep(0.,.3,t)*(1.-smoothstep(.88,1.,t));}
 float shimmer=.92+.045*sin(time*2.4)+.025*sin(time*7.3);
 gl_FragColor=vec4(tint,glow*shimmer*.83);
 #include <colorspace_fragment>
}`
export class Lighting{
 time={value:0};flash=new T.PointLight('#ffcf85',0,9,2);head=new T.SpotLight('#ffe4ac',32,20,.48,.65,1.4)
 beams=new T.Group();private glowTime=0;private doorway=new T.PointLight('#ffbc81',16,10,1.7)
 constructor(scene:T.Scene,car:T.Group,private doors:Point[]){
  scene.add(this.flash,this.doorway);car.add(this.head,this.head.target,this.beams);this.head.position.set(0,.9,1.9);this.head.target.position.set(0,0,12)
  for(const x of [-.68,.68])this.pool(this.beams,x,.13,6.6,4.8,10,'#ffdf9a',true)
  for(const q of doors)this.pool(scene,q.x,ground(q.x,q.z)+.16,q.z,7,5,'#ffc995')
 }
 private pool(parent:T.Object3D,x:number,y:number,z:number,w:number,d:number,color:string,beam=false){
  const m=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{time:this.time,tint:{value:new T.Color(color)},beam:{value:Number(beam)}},transparent:true,depthWrite:false,blending:T.AdditiveBlending})
  const mesh=new T.Mesh(new T.PlaneGeometry(w,d),m);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);parent.add(mesh)
 }
 pulse(q:Point,color:string){this.flash.color.set(color);this.flash.position.set(q.x,ground(q.x,q.z)+1.3,q.z);this.glowTime=.10}
 update(q:Point,dt:number,time:number,driving:boolean,evening:boolean){
  cityTime.value=time;daylight.value=evening?.18:.82;this.time.value=time;this.glowTime=Math.max(0,this.glowTime-dt);this.flash.intensity=55*this.glowTime/.10
  this.beams.visible=driving||evening;this.head.intensity=this.beams.visible?42:0
  const near=this.doors.reduce((a,b)=>Math.hypot(q.x-a.x,q.z-a.z)<Math.hypot(q.x-b.x,q.z-b.z)?a:b)
  this.doorway.position.set(near.x,ground(near.x,near.z)+2.1,near.z);this.doorway.intensity=evening?26:12
 }
}
export function riverSurface(){
 return new T.ShaderMaterial({uniforms:{time:cityTime,day:daylight},vertexShader:vertex,fragmentShader:`
 varying vec2 coord;uniform float time;uniform float day;
 void main(){
  vec2 p=coord*vec2(115.,18.);float ripple=sin(p.y*6.+sin(p.x*.53-time*.65)*1.8+time*1.9);
  float wave=.5+.5*sin(p.y*3.-time*.8+sin(p.x*.24+time*.41));
  vec3 water=mix(vec3(.018,.047,.075),vec3(.041,.15,.18),day);
  float reflection=pow(max(0.,ripple),9.)*wave;
  float windows=pow(max(0.,cos(p.x*.82+wave*.7)),4.)*smoothstep(.0,.9,coord.y);
  vec3 glint=mix(vec3(.25,.43,.44),vec3(.85,.40,.16),windows*(1.-day));
  gl_FragColor=vec4(water+glint*reflection*(.15+.28*windows),1.);
  #include <colorspace_fragment>
 }`})
}
