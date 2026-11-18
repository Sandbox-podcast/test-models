import type{WeaponId}from'./economy.ts';
export class Sound {
 ctx: AudioContext | null = null; volume=.25; ambient: GainNode|null=null;
 private sirenAt=0;
 siren(time:number,level:number,active:boolean){if(!active||!level||time<this.sirenAt)return;this.sirenAt=time+.7;this.tone(Math.floor(time*2)%2?490:650,.45,'sine',.12);}
 private city:GainNode|null=null;private river:GainNode|null=null;private engine:OscillatorNode|null=null;private motor:GainNode|null=null;
 start(){
  if(!this.ctx){
   this.ctx=new AudioContext(); this.ambient=this.ctx.createGain();this.ambient.gain.value=.022*this.volume;this.ambient.connect(this.ctx.destination);
   for(const freq of [55,82.41,110]) {const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=freq;o.connect(this.ambient);o.start();}
   const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*4,this.ctx.sampleRate),samples=buffer.getChannelData(0);let brown=0;for(let i=0;i<samples.length;i++){brown=(brown+(Math.random()*2-1)*.035)/1.02;samples[i]=brown;}
   for(const kind of ['city','river']as const){const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();source.buffer=buffer;source.loop=true;filter.type=kind==='city'?'bandpass':'lowpass';filter.frequency.value=kind==='city'?480:950;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.ctx.destination);source.start();this[kind]=gain;}
   this.engine=this.ctx.createOscillator();this.engine.type='triangle';this.engine.frequency.value=42;this.motor=this.ctx.createGain();this.motor.gain.value=0;this.engine.connect(this.motor);this.motor.connect(this.ctx.destination);this.engine.start();
  }this.ctx.resume().catch(()=>{});
 }
 tone(freq:number,duration=.12,type:OscillatorType='sine',vol=.2){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.45),this.ctx.currentTime+duration);g.gain.setValueAtTime(vol*this.volume,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.connect(g);g.connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+duration);}
 weaponShot(id:WeaponId){if(id==='shotgun'){this.tone(65,.25,'sawtooth',.6);this.tone(240,.12,'square',.20);}else if(id==='rifle'){this.tone(80,.2,'sawtooth',.55);this.tone(940,.04,'square',.12);}else if(id==='smg'){this.tone(120,.08,'sawtooth',.32);this.tone(560,.025,'square',.08);}else this.shot();}
 shot(){this.tone(96,.13,'sawtooth',.5);this.tone(680,.035,'square',.13);}
 ui(){this.tone(660,.09,'sine',.3);}
 alert(){this.tone(340,.35,'triangle',.3);}
 reward(){this.tone(440,.35);setTimeout(()=>this.tone(660,.35),130);setTimeout(()=>this.tone(880,.5),260);}
 setVolume(v:number){this.volume=v;if(this.ambient&&this.ctx)this.ambient.gain.setTargetAtTime(.022*v,this.ctx.currentTime,.1);}
 environment(district:string,inCar:boolean,speed:number,active:boolean){if(!this.ctx)return;const t=this.ctx.currentTime,v=active?this.volume:0;this.city?.gain.setTargetAtTime((district==='node'?.07:.13)*v,t,.5);this.river?.gain.setTargetAtTime((district==='quais'?.35:.015)*v,t,.7);this.motor?.gain.setTargetAtTime(inCar?.035*v:0,t,.15);this.engine?.frequency.setTargetAtTime(42+Math.abs(speed)*3.5,t,.12);if(this.ambient)this.ambient.gain.setTargetAtTime(.022*v,t,.2);}
}
