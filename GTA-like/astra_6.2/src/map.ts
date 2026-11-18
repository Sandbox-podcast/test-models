import {blocks,roadsX,roadsZ,pointsOfInterest,sites,trackZ,type Point} from './level'

export function drawMap(canvas:HTMLCanvasElement, mode:'preview'|'atlas'|'mini', player?:Point,target?:Point){
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return
 const dpr=Math.min(devicePixelRatio,2), w=box.width,h=box.height
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const c=canvas.getContext('2d')!;c.setTransform(dpr,0,0,dpr,0,0)
 c.fillStyle='#111b1d';c.fillRect(0,0,w,h)
 const mid=mode==='atlas'?{x:48,z:1}:mode==='mini'&&player?player:{x:-19,z:-6}
 const scale=mode==='atlas'?Math.min((w-38)/230,(h-40)/112):mode==='mini'?2.15:Math.max(w/117,h/72)
 const angle=mode==='preview'?.58:0
 function xy(q:Point){const x=q.x-mid.x,z=q.z-mid.z;return [w/2+(x*Math.cos(angle)-z*Math.sin(angle))*scale,h/2+(x*Math.sin(angle)+z*Math.cos(angle))*scale]}
 c.save();c.translate(w/2,h/2);c.scale(scale,scale);c.rotate(angle);c.translate(-mid.x,-mid.z)
 for(let i=-120;i<220;i+=4){c.strokeStyle=i%20===0?'#29383b':'#1d2a2d';c.lineWidth=.13;c.beginPath();c.moveTo(i,-110);c.lineTo(i,110);c.moveTo(-125,i);c.lineTo(225,i);c.stroke()}
 const streets=(color:string,width:number)=>{c.lineWidth=width;c.strokeStyle=color;c.beginPath();for(const x of roadsX){c.moveTo(x,-59);c.lineTo(x,61)}for(const z of roadsZ){c.moveTo(-76,z);c.lineTo(172,z)}c.stroke()}
 streets('#506062',4.6);streets('#243134',4.1)
 for(const b of blocks){const l=b.x-b.w/2,t=b.z-b.d/2;c.fillStyle='#314144';c.strokeStyle='#607072';c.lineWidth=.18;c.fillRect(l,t,b.w,b.d);c.strokeRect(l,t,b.w,b.d)
   for(let j=1;j<b.w-2;j+=3.1){c.fillStyle='#253436';c.fillRect(l+j,t+.6,1.8,b.d*.48);c.strokeStyle='#4d5c5c';c.strokeRect(l+j,t+.6,1.8,b.d*.48)}
   c.strokeRect(l+b.w*.35,t+b.d*.62,b.w*.49,b.d*.19)
 }
 c.lineWidth=1.25;c.strokeStyle='#3d4a4e';c.beginPath();c.moveTo(-100,trackZ);c.lineTo(170,trackZ);c.stroke()
 c.lineWidth=.27;c.setLineDash([.5,.5]);c.strokeStyle='#97a4a2';c.stroke();c.setLineDash([])
 if(mode==='preview'){
  c.beginPath();c.moveTo(sites.garage.x,sites.garage.z);c.lineTo(-40,23);c.lineTo(-5,23);c.lineTo(-5,0);c.lineTo(-27,0);c.lineTo(-27,-12);c.lineTo(-22,-12);c.strokeStyle='#daf637';c.lineWidth=.52;c.setLineDash([1.2,.8]);c.stroke();c.setLineDash([])
 }
 c.restore()
 function pin(q:Point,label:string,color:string,shape='square'){const [x,y]=xy(q);c.save();c.translate(x,y);c.strokeStyle=color;c.fillStyle='#122021';c.lineWidth=1.3
   c.beginPath();if(shape==='person'){c.moveTo(0,-6);c.lineTo(5.2,5);c.lineTo(0,3);c.lineTo(-5.2,5);c.closePath();c.fillStyle=color}else if(shape==='circle'){c.arc(0,0,4.5,0,Math.PI*2)}else{c.moveTo(0,-5);c.lineTo(5,0);c.lineTo(0,5);c.lineTo(-5,0);c.closePath()}c.fill();c.stroke();if(label){c.font='600 9px "IBM Plex Mono", monospace';const len=c.measureText(label).width;c.fillStyle='#121c1d';c.fillRect(8,-8,len+8,15);c.fillStyle=color;c.fillText(label,12,3)}c.restore()}
 if(mode!=='mini'){pointsOfInterest.forEach(([n,pos],i)=>pin(pos,n,i===1?'#e3f83b':i===0?'#69d4bc':'#bccbc9',i===0?'circle':'square'))
 if(mode==='atlas'){pin(sites.ledger,'REGISTRE','#75d8d1');pin(sites.core,'LE NŒUD','#e8b77d')}}
 if(target)pin(target,'','#ebfa46');if(player)pin(player,'','#f1ffff','person')
}
