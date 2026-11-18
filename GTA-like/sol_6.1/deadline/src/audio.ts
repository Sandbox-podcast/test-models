export class Sound {
 ctx: AudioContext | null = null; volume=.25; ambient: GainNode|null=null;
 start(){
  if(!this.ctx){
   this.ctx=new AudioContext(); this.ambient=this.ctx.createGain();this.ambient.gain.value=.022*this.volume;this.ambient.connect(this.ctx.destination);
   for(const freq of [55,82.41,110]) {const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=freq;o.connect(this.ambient);o.start();}
  }this.ctx.resume().catch(()=>{});
 }
 tone(freq:number,duration=.12,type:OscillatorType='sine',vol=.2){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ctx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.45),this.ctx.currentTime+duration);g.gain.setValueAtTime(vol*this.volume,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.connect(g);g.connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+duration);}
 shot(){this.tone(96,.13,'sawtooth',.5);this.tone(680,.035,'square',.13);}
 ui(){this.tone(660,.09,'sine',.3);}
 alert(){this.tone(340,.35,'triangle',.3);}
 reward(){this.tone(440,.35);setTimeout(()=>this.tone(660,.35),130);setTimeout(()=>this.tone(880,.5),260);}
 setVolume(v:number){this.volume=v;if(this.ambient&&this.ctx)this.ambient.gain.setTargetAtTime(.022*v,this.ctx.currentTime,.1);}
}
