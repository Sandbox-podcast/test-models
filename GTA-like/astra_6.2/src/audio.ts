export class AudioBus{
 ctx?:AudioContext;master?:GainNode;hum?:OscillatorNode;on=true
 start(){if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.on?.38:0;this.master.connect(this.ctx.destination)
   this.hum=this.ctx.createOscillator();const gain=this.ctx.createGain();gain.gain.value=.023;this.hum.type='triangle';this.hum.frequency.value=52;this.hum.connect(gain);gain.connect(this.master);this.hum.start()}
  if(this.ctx.state==='suspended')void this.ctx.resume().catch(()=>{})}
 enable(on:boolean){this.on=on;if(this.master&&this.ctx)this.master.gain.setTargetAtTime(on?.38:0,this.ctx.currentTime,.04)}
 engine(speed:number){if(this.hum&&this.ctx)this.hum.frequency.setTargetAtTime(52+Math.abs(speed)*3,this.ctx.currentTime,.12)}
 beep(freq:number,dur=.12,end=freq,kind:OscillatorType='sine'){if(!this.ctx||!this.master||!this.on)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=kind;o.frequency.setValueAtTime(freq,c.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(15,end),c.currentTime+dur);g.gain.setValueAtTime(.17,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+dur);o.connect(g);g.connect(this.master);o.start();o.stop(c.currentTime+dur+.01)}
}
