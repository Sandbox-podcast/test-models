import {DISTRICTS,landHeight}from'./data.ts';
/** Exactly the same triangle buffers feed the renderer and Rapier. */
export const TERRAIN=DISTRICTS.map(district=>{
 const positions:number[]=[],indices:number[]=[],step=2,nx=Math.ceil(district.w/step),nz=Math.ceil(district.d/step),valid:boolean[]=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=district.origin.x+i*step,z=district.origin.z+j*step,y=landHeight(x,z);valid.push(y!==null);positions.push(x,(y??-4)-.035,z);}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;if(![a,a+1,a+nx+1,a+nx+2].every(i=>valid[i]))continue;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
 return{district,positions:new Float32Array(positions),indices:new Uint32Array(indices)};
});
