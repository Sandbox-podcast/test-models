import*as T from'three';import{FURNITURE}from'./furniture.ts';import{BUILDINGS}from'./data.ts';import{HOMES}from'../economy.ts';import{distance,type Vec3}from'./geometry.ts';
export const FilmShader={uniforms:{tDiffuse:{value:null},uTime:{value:0},uNight:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uNight;varying vec2 vUv;void main(){vec4 src=texture2D(tDiffuse,vUv);vec3 c=src.rgb;float l=dot(c,vec3(.2126,.7152,.0722));c*=mix(vec3(1.015,1.,.975),vec3(.94,1.015,1.045),uNight);c+=vec3(.012,.007,.002)*smoothstep(.4,1.4,l);float edge=smoothstep(.20,.78,length((vUv-.5)*vec2(1.,.85)));c*=1.-edge*.17;float grain=fract(sin(dot(gl_FragCoord.xy+mod(uTime,100.),vec2(12.9898,78.233)))*43758.5453)-.5;gl_FragColor=vec4(max(c+grain*.003,0.),src.a);}`};
export class Atmosphere{
 enabled=true;time={value:0};night={value:1};strength={value:1};asphalt:T.MeshStandardMaterial;water:T.ShaderMaterial;group=new T.Group();
 private pool:T.PointLight[]=[];private headlights:T.SpotLight[]=[];
 constructor(scene:T.Scene){
  scene.add(this.group);
  this.asphalt=new T.MeshStandardMaterial({color:0x303b42,roughness:.78,metalness:.22});
  this.asphalt.onBeforeCompile=shader=>{shader.uniforms.uClock=this.time;shader.uniforms.uWet=this.strength;shader.uniforms.uNight=this.night;
   shader.vertexShader='varying vec3 vStreetWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStreetWorld=(modelMatrix*vec4(position,1.)).xyz;');
   shader.fragmentShader='varying vec3 vStreetWorld;uniform float uClock,uWet,uNight;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    vec2 p=vStreetWorld.xz*.11;float n=sin(p.x+sin(p.y*1.7))*sin(p.y*.76+sin(p.x*1.4));float puddle=smoothstep(.35,.68,n)*uWet;roughnessFactor=mix(.90,.20,puddle);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float stain=sin(vStreetWorld.x*.31)*sin(vStreetWorld.z*.24);diffuseColor.rgb*=.94+stain*.055;`);
  };
  this.asphalt.customProgramCacheKey=()=> 'deadline-wet-street-1';
  this.water=new T.ShaderMaterial({uniforms:{uTime:this.time,uNight:this.night,uEffects:this.strength},vertexShader:`uniform float uTime,uEffects;varying vec3 vWorld;void main(){vec3 p=position;p.z+=sin(p.x*.12+uTime*.7)*sin(p.y*.3-uTime*.4)*.07*uEffects;vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,fragmentShader:`uniform float uTime,uNight,uEffects;varying vec3 vWorld;void main(){vec2 q=vWorld.xz;float a=sin(q.x*.29+q.y*.7-uTime*.9),b=sin(q.x*.67-q.y*.21+uTime*.6);float wave=(a+b)*.25+.5;float line=pow(max(0.,a*b),8.);vec3 base=mix(vec3(.08,.17,.19),vec3(.25,.40,.40),wave*.65);float fresnel=pow(1.-abs(normalize(cameraPosition-vWorld).y),3.);base+=vec3(.15,.22,.22)*fresnel+vec3(.30,.36,.32)*line*.28*uEffects;gl_FragColor=vec4(base*mix(1.12,.66,uNight),1.);}`});
  for(let i=0;i<10;i++){const l=new T.PointLight(i<7?0xffc68a:0xaeddd7,0,18,2);l.position.y=-500;this.pool.push(l);this.group.add(l);}
  for(const side of [-1,1]){const light=new T.SpotLight(0xffecc3,0,34,.40,.65,1.6);light.userData.side=side;this.headlights.push(light);this.group.add(light,light.target);}
 }
 update(p:Vec3,time:number,hour:number,flags:Set<string>){this.time.value=time;const night=hour<7||hour>=19;this.night.value=night?1:0;this.strength.value=this.enabled?1:0;this.group.visible=this.enabled;
  const sources=[...FURNITURE.filter(r=>r.kind==='lamp').map(r=>({x:r.x,y:r.y+3.55,z:r.z,color:0xffc68a,power:night?65:3})),...BUILDINGS.filter(b=>b.interior).map(b=>{const home=Object.values(HOMES).find(h=>h.building===b.id);return{x:b.x,y:b.y+2.6,z:b.z,color:home?0xffb975:0x9bd8ca,power:home&&!flags.has(home.id)?0:night?55:18};})].filter(q=>distance(p,q)<43).sort((a,b)=>distance(p,a)-distance(p,b));
  this.pool.forEach((light,i)=>{const q=sources[i];light.intensity=q?.power||0;if(q){light.position.set(q.x,q.y,q.z);light.color.set(q.color);}});
 }
 followVehicle(p:Vec3,angle:number,active:boolean,broken:boolean){this.headlights.forEach(l=>{const side=l.userData.side as number;l.position.set(p.x+Math.sin(angle)*1.7+Math.cos(angle)*side*.6,p.y+.8,p.z+Math.cos(angle)*1.7-Math.sin(angle)*side*.6);l.target.position.set(p.x+Math.sin(angle)*22,p.y-.4,p.z+Math.cos(angle)*22);l.intensity=active&&!broken&&this.night.value>.5?100:0;});}
}
