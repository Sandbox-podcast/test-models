import * as T from 'three';
import { blocks, bounds, distance, elevation, type Point } from './level';
import { furniture } from './furniture';
import { fillPaving } from './roads';
import { populationHour } from './population';
import { venues } from './venues';

export const groundBounds = { west:bounds.west-12, east:bounds.east+12, north:bounds.north-10, south:bounds.south+10 };

export function paveGround(ground:T.MeshStandardMaterial, street:T.Texture, sidewalk:T.Texture) {
  const {west,east,north,south}=groundBounds, width=east-west, depth=south-north;
  const canvas=document.createElement('canvas');
  canvas.width=width*4;
  canvas.height=depth*4;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#000000';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#00ff00';
  for(const [x,z,w,d] of blocks) ctx.fillRect((x-w/2-west)*4,(z-d/2-north)*4,w*4,d*4);
  fillPaving(ctx,x=>(x-west)*4,z=>(z-north)*4,'#ff0000','#00ff00');
  const mask=new T.CanvasTexture(canvas);
  mask.anisotropy=4;
  const daylight={value:.5};
  ground.onBeforeCompile=program=>{
    Object.assign(program.uniforms,{
      pavingMask:{value:mask},asphaltMap:{value:street},sidewalkMap:{value:sidewalk},daylight,
      pavingRect:{value:new T.Vector4(west,north,width,depth)},
    });
    program.vertexShader=`varying vec2 groundXZ;\n${program.vertexShader}`.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ngroundXZ = position.xz;');
    program.fragmentShader=`
      varying vec2 groundXZ;
      uniform sampler2D pavingMask, asphaltMap, sidewalkMap;
      uniform vec4 pavingRect;
      uniform float daylight;
      float grain(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float runoff(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(grain(i),grain(i+vec2(1,0)),f.x),mix(grain(i+vec2(0,1)),grain(i+1.0),f.x),f.y);
      }
    ${program.fragmentShader}`
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec2 uvStreet = (groundXZ-pavingRect.xy)/pavingRect.zw;
        vec2 paving = texture2D(pavingMask, vec2(uvStreet.x,1.0-uvStreet.y)).rg;
        vec3 sidewalk = texture2D(sidewalkMap,vMapUv).rgb;
        vec3 tarmac = texture2D(asphaltMap,vMapUv).rgb;
        float damp = smoothstep(0.58,0.82,runoff(groundXZ*vec2(0.46,0.34)))*paving.r;
        tarmac = mix(tarmac,tarmac*vec3(.56,.65,.72),damp);
        diffuseColor.rgb = mix(mix(diffuseColor.rgb,sidewalk,paving.g),tarmac,paving.r);`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor,.27+daylight*.13,damp*.84);`);
  };
  return daylight;
}

export function makeWater() {
  return new T.ShaderMaterial({
    uniforms:{...T.UniformsUtils.clone(T.UniformsLib.fog),time:{value:0},daylight:{value:.5}}, fog:true,
    vertexShader:`varying vec2 riverXZ;
      #include <fog_pars_vertex>
      void main(){
        riverXZ=position.xz;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform float time, daylight; varying vec2 riverXZ;
      #include <fog_pars_fragment>
      void main(){
        vec2 p=riverXZ;
        float swell=sin(p.y*1.73+p.x*.32-time*1.32)+.38*sin(p.y*5.03-p.x*.85+time*2.1);
        float chop=.54*sin(p.y*9.31+p.x*.48+swell*1.65-time*2.14)
          +.29*sin(p.y*5.22-p.x*1.07+swell-time*1.36)+.17*sin(p.y*14.2+p.x*2.2+time*1.63);
        float glint=pow(clamp(chop,0.0,1.0),3.5);
        float reflection=exp(-pow((p.x-108.5+swell*1.27)*.104,2.0));
        vec3 water=mix(vec3(.015,.041,.058),vec3(.047,.123,.154),daylight*.83+chop*.09+.09);
        water+=glint*(vec3(.041,.112,.136)+reflection*mix(vec3(.242,.130,.070),vec3(.077,.146,.19),daylight));
        gl_FragColor=vec4(water,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

const fixtures = [
  ...furniture.filter(prop=>prop.kind==='lamp').map(prop=>({id:prop.id,at:prop.at,y:prop.size[1]-.48,color:prop.tint,indoor:false})),
  ...venues.map(venue=>({id:venue.id,at:[venue.area[0],venue.area[1]] as Point,y:2.9,color:venue.accent,indoor:true})),
];

export class Lighting {
  private readonly sky=new T.HemisphereLight();
  private readonly sun=new T.DirectionalLight();
  private readonly fixtures=Array.from({length:4},()=>new T.PointLight('#fff1bc',0,13,2));
  private readonly headlight=new T.SpotLight('#e6ecff',0,21,.37,.74,1.6);
  private readonly flash=new T.PointLight('#fff1bc',0,7,2);
  private readonly morning=new T.Color('#ffd0a1');
  private readonly day=new T.Color('#e8edf9');
  private readonly night=new T.Color('#94acda');
  private readonly brokenFixtures = new Set<string>();
  private flashStarted=-1;
  private lastChoice=-1;
  constructor(scene:T.Scene){
    scene.add(this.sky,this.sun,this.headlight,this.headlight.target,this.flash,...this.fixtures);
  }
  breakLamp(id:string){this.brokenFixtures.add(id);this.lastChoice=-1;}
  reset(){this.brokenFixtures.clear();this.lastChoice=-1;this.flashStarted=-1;}
  muzzle(at:Point,yaw:number,color:string,time:number){
    this.flash.position.set(at[0]+Math.sin(yaw)*.7,elevation(...at)+1.23,at[1]+Math.cos(yaw)*.7);
    this.flash.color.set(color);
    this.flashStarted=time;
  }
  update(time:number,at:Point,car:{at:Point;yaw:number}|null) {
    const hour=populationHour(time);
    const high=Math.max(0,Math.sin((hour-5)/14*Math.PI));
    const daylight=T.MathUtils.smoothstep(high,0,.70);
    this.sky.color.copy(this.night).lerp(this.day,daylight);
    this.sky.groundColor.set('#716468');
    this.sky.intensity=1.16+daylight*.53;
    this.sun.color.copy(this.morning).lerp(this.day,high).lerp(this.night,1-daylight);
    this.sun.intensity=.77+high*1.72;
    this.sun.position.set(-Math.cos((hour-5)/14*Math.PI)*52,16+high*45,28);
    const choice=Math.floor(time*5);
    if(choice!==this.lastChoice){
      this.lastChoice=choice;
      const near=fixtures.filter(f=>!this.brokenFixtures.has(f.id)&&distance(at,f.at)<25)
        .sort((a,b)=>distance(at,a.at)-distance(at,b.at)).slice(0,this.fixtures.length);
      this.fixtures.forEach((light,i)=>{
        const f=near[i];
        if(!f){light.intensity=0;return;}
        light.position.set(f.at[0],elevation(...f.at)+f.y,f.at[1]);
        light.color.set(f.color);
        light.intensity=f.indoor?30:37-26*daylight;
      });
    }
    this.flash.intensity=this.flashStarted<0?0:55*Math.max(0,1-(time-this.flashStarted)*16);
    this.headlight.intensity=car ? 26+48*(1-daylight) : 0;
    if(car){
      const [x,z]=car.at,y=elevation(x,z), dx=Math.sin(car.yaw),dz=Math.cos(car.yaw);
      this.headlight.position.set(x+dx*1.86,y+.73,z+dz*1.86);
      this.headlight.target.position.set(x+dx*14,y-.32,z+dz*14);
    }
    return daylight;
  }
}
