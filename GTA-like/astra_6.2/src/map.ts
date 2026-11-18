import {rooms,isHouse} from './rooms'
import {blocks,routes,origins,districts,bounds,pointsOfInterest,sites,trackZ,type Point} from './level'

export function drawMap(canvas:HTMLCanvasElement, mode:'preview'|'atlas'|'mini', player?:Point,target?:Point,patrols:Point[]=[]){
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return
 const dpr=Math.min(devicePixelRatio,2), w=box.width,h=box.height
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const c=canvas.getContext('2d')!;c.setTransform(dpr,0,0,dpr,0,0)
 c.fillStyle='#111b1d';c.fillRect(0,0,w,h)
 const mid=mode==='atlas'?{x:(bounds.left+bounds.right)/2,z:(bounds.top+bounds.bottom)/2}:mode==='mini'&&player?player:{x:82,z:53}
 const scale=mode==='atlas'?Math.min((w-45)/424,(h-36)/427):mode==='mini'?2.15:Math.min(w/153,h/63)
 const angle=mode==='preview'?-.16:0
 function xy(q:Point){const x=q.x-mid.x,z=q.z-mid.z;return [w/2+(x*Math.cos(angle)-z*Math.sin(angle))*scale,h/2+(x*Math.sin(angle)+z*Math.cos(angle))*scale]}
 c.save();c.translate(w/2,h/2);c.scale(scale,scale);c.rotate(angle);c.translate(-mid.x,-mid.z)
 for(let i=-220;i<450;i+=8){c.strokeStyle=i%20===0?'#29383b':'#1d2a2d';c.lineWidth=.13;c.beginPath();c.moveTo(i,-220);c.lineTo(i,225);c.moveTo(-10,i);c.lineTo(430,i);c.stroke()}
 for(const r of routes){c.beginPath();r.points.forEach((v,i)=>i?c.lineTo(v.x,v.z):c.moveTo(v.x,v.z));c.strokeStyle=r.road?'#586a6b':'#497067';c.lineWidth=r.road?r.width:1.4;c.stroke();if(r.road){c.strokeStyle='#2b3b40';c.lineWidth=r.width-.65;c.stroke()}}
 for(const b of blocks){const l=b.x-b.w/2,t=b.z-b.d/2;c.fillStyle='#314144';c.strokeStyle='#607072';c.lineWidth=.18;c.fillRect(l,t,b.w,b.d);c.strokeRect(l,t,b.w,b.d)
   for(let j=1;j<b.w-2;j+=3.1){c.fillStyle='#253436';c.fillRect(l+j,t+.6,1.8,b.d*.48);c.strokeStyle='#4d5c5c';c.strokeRect(l+j,t+.6,1.8,b.d*.48)}
   c.strokeRect(l+b.w*.35,t+b.d*.62,b.w*.49,b.d*.19)
 }
 c.lineWidth=1.25;c.strokeStyle='#3d4a4e';c.beginPath();c.moveTo(0,trackZ);c.lineTo(180,trackZ);c.stroke()
 c.lineWidth=.27;c.setLineDash([.5,.5]);c.strokeStyle='#97a4a2';c.stroke();c.setLineDash([])
 if(mode==='preview'){
  c.beginPath();c.moveTo(sites.garage.x,sites.garage.z);c.lineTo(28.5,42);c.lineTo(28.5,38);c.lineTo(68,34);c.lineTo(89,36);c.lineTo(89,39);c.lineTo(83.5,39);c.lineTo(83.5,51);c.lineTo(88,57);c.strokeStyle='#daf637';c.lineWidth=.52;c.setLineDash([1.2,.8]);c.stroke();c.setLineDash([])
 }
 c.restore()
 function pin(q:Point,label:string,color:string,shape='square'){const [x,y]=xy(q);c.save();c.translate(x,y);c.strokeStyle=color;c.fillStyle='#122021';c.lineWidth=1.3
   c.beginPath();if(shape==='person'){c.moveTo(0,-6);c.lineTo(5.2,5);c.lineTo(0,3);c.lineTo(-5.2,5);c.closePath();c.fillStyle=color}else if(shape==='circle'){c.arc(0,0,4.5,0,Math.PI*2)}else{c.moveTo(0,-5);c.lineTo(5,0);c.lineTo(0,5);c.lineTo(-5,0);c.closePath()}c.fill();c.stroke();if(label){c.font='600 9px "IBM Plex Mono", monospace';const len=c.measureText(label).width;c.fillStyle='#121c1d';c.fillRect(8,-8,len+8,15);c.fillStyle=color;c.fillText(label,12,3)}c.restore()}
 if(mode!=='mini'){pointsOfInterest.forEach(([n,pos],i)=>pin(pos,n,i===1?'#e3f83b':i===0?'#69d4bc':'#bccbc9',i===0?'circle':'square'))
 if(mode==='atlas'){origins.forEach((o,i)=>pin({x:o.x+55,z:o.z+9},districts[i].toUpperCase(),'#dbe3cf','circle'))}}
 if(mode!=='preview')for(const r of rooms){const near=mode==='mini'&&player&&Math.hypot(player.x-r.entrance.x,player.z-r.entrance.z)<20
   pin(r.entrance,near?r.name.toUpperCase():mode==='atlas'&&r.id!=='cour'&&r.id!=='dealer'?r.name.toUpperCase():'',isHouse(r.id)?'#e7b592':'#88d9b7','circle')}
 for(const patrol of patrols)pin(patrol,'','#ff8565','circle')
 if(target)pin(target,'','#ebfa46');if(player)pin(player,'','#f1ffff','person')
}
