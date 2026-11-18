export type Job = 'chip'|'ledger'|'core'|'parcel'|'relay'
export const jobNames:Record<Job,string>={chip:'Puce fantôme',ledger:'Les effacés',core:'Le dernier signal',parcel:'Courrier de nuit',relay:'Fréquence libre'}
export type Implant = 'Intrusion'|'Leurre'|'Surcharge'
export type Save = {version:1,done:Job[],active:Job|null,money:number,route:'collectif'|'sorel'|null,ending:'public'|'seal'|null,equip:Implant[],sound:boolean,track:Job|null,contact:'mina'|'sorel'}
const key='deadline.courier.v1'
const jobs=Object.keys(jobNames) as Job[]
export const fresh=():Save=>({version:1,done:[],active:null,money:0,route:null,ending:null,equip:['Intrusion','Leurre'],sound:true,track:null,contact:'mina'})
export function readSave():Save {
  try {const raw=JSON.parse(localStorage.getItem(key)||'null'); if(raw?.version!==1)return fresh()
    return {...fresh(),...raw,done:Array.isArray(raw.done)?[...new Set<Job>(raw.done.filter((x:Job)=>jobs.includes(x)))]:[],active:jobs.includes(raw.active)?raw.active:null}
  }catch{return fresh()}
}
export function writeSave(s:Save){try{localStorage.setItem(key,JSON.stringify(s));return true}catch{return false}}
export function chapter(s:Save):Job {return !s.done.includes('chip')?'chip':!s.done.includes('ledger')?'ledger':'core'}
export function available(s:Save):Job[]{const options:Job[]=[chapter(s)];if(s.done.includes('chip'))options.push('parcel');if(s.done.includes('ledger'))options.push('relay');return options.filter(x=>!s.done.includes(x))}
export function finish(s:Save,j:Job){if(s.done.includes(j))return;s.done.push(j);s.money+=({chip:450,ledger:650,core:1000,parcel:200,relay:300})[j];s.active=null;s.track=null;writeSave(s)}
export const brief:Record<Job,string>={
 chip:'Une puce contenant des identités à révoquer transite par le dépôt. Mina veut la récupérer avant le prochain convoi.',
 ledger:'Le registre relie chaque identité à une adresse. Récupérez-le à La Dalle et choisissez qui pourra le consulter.',
 core:'Le serveur du Nœud applique les révocations à minuit. Rejoignez son terminal pour décider du sort du registre.',
 parcel:'Un relais conserve les dossiers de personnes victimes de chantage. Rapportez le pli scellé aux ateliers.',
 relay:'Les habitants ont besoin d’une fréquence privée. Réactivez le relais technique du plateau.'
}
