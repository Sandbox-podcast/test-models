import { chip, exchange, garage, northDock, type Point } from './level';
import { places as p } from './places';
import { starterArsenal, weaponIds, weapons, type Arsenal } from './arsenal';
import { vehicleIds, type VehicleId } from './fleet';
import { homes, type HomeId } from './venues';
import { activityIds, type ActivityHistory } from './activities';

export type Implant = 'intrusion' | 'decoy' | 'overload';
export type Chapter = 1 | 2 | 3 | 4 | 5 | 6;
export type Route = 'collective' | 'sorel';
export type Ending = 'publish' | 'protect';
export type UniqueId = 'U01' | 'U02' | 'U03' | 'U04' | 'U05';
export type CommonId = 'C01' | 'C02' | 'C03' | 'C04';
export type SideId = UniqueId | CommonId;
export type BlackmailChoice = 'destroy' | 'give';
export type Track = 'main' | SideId;

export const implants: Record<Implant, { name: string; mark: string; help: string; cooldown: number }> = {
  intrusion: { name:'Intrusion',mark:'⌗',help:'Visez une grille verte compatible ou une caméra à moins de 16 m.',cooldown:9 },
  decoy: { name:'Leurre',mark:'◈',help:'Visez le sol pour détourner un vigile proche du signal.',cooldown:11 },
  overload: { name:'Surcharge',mark:'ϟ',help:'Visez un drone à moins de 12 m pour le bloquer brièvement.',cooldown:14 },
};
const uniqueIds: UniqueId[] = ['U01','U02','U03','U04','U05'];
const commonIds: CommonId[] = ['C01','C02','C03','C04'];
export const sideIds: SideId[] = [...uniqueIds,...commonIds];
const chapters: Chapter[] = [1,2,3,4,5,6];
const common = (id: SideId): id is CommonId => id[0]==='C';

export type Save = {
  version:2;
  credits:number;
  chapter:Chapter;
  checkpoint:Chapter|null;
  loadout:[Implant,Implant];
  side:SideId|null;
  completed:UniqueId[];
  offers:Record<CommonId,number>;
  records:BlackmailChoice|null;
  route:Route|null;
  ending:Ending|null;
  tracking:Track;
  arsenal:Arsenal;
  vehicles:VehicleId[];
  properties:HomeId[];
  residence:HomeId|null;
  activities:ActivityHistory;
};
export const saveKey = 'deadline.save.v2';
export const newGame=():Save=>({
  version:2,credits:0,chapter:1,checkpoint:null,loadout:['intrusion','decoy'],
  side:null,completed:[],offers:{C01:0,C02:0,C03:0,C04:0},records:null,route:null,ending:null,tracking:'main',
  arsenal:starterArsenal(),vehicles:[],properties:[],residence:null,
  activities:{},
});
function validLoadout(value:unknown):value is Save['loadout']{
  return Array.isArray(value) && value.length===2 && value[0]!==value[1] && value.every(i=>typeof i==='string'&&Object.hasOwn(implants,i));
}
function migrateLegacy(raw:string):Save|null {
  const old=JSON.parse(raw);
  if(old?.version!==1||![1,2,3].includes(old.chapter)||!validLoadout(old.loadout)||!Number.isSafeInteger(old.credits)||old.credits<0) return null;
  const state=newGame();
  state.chapter=old.chapter===3?(old.ending?6:5):old.chapter;
  state.checkpoint=old.checkpoint===old.chapter&&!old.ending?state.chapter:null;
  state.credits=old.credits;
  state.loadout=old.loadout;
  state.route=old.route==='collective'||old.route==='sorel'?old.route:null;
  state.ending=old.ending==='publish'||old.ending==='protect'?old.ending:null;
  if(old.side==='complete'){state.completed=['U03'];state.records='destroy';}
  return state;
}
export function readSave():Save|null {
  try {
    const raw=localStorage.getItem(saveKey);
    if(!raw){
      const previous=localStorage.getItem('deadline.save.v1');
      return previous?migrateLegacy(previous):null;
    }
    const s=JSON.parse(raw) as Save;
    if(s?.version!==2||!chapters.includes(s.chapter)||!Number.isSafeInteger(s.credits)||s.credits<0||
      !validLoadout(s.loadout)||![null,s.chapter].includes(s.checkpoint)||
      ![null,'collective','sorel'].includes(s.route)||![null,'publish','protect'].includes(s.ending)||
      !Array.isArray(s.completed)||!s.completed.every(id=>uniqueIds.includes(id))||new Set(s.completed).size!==s.completed.length||
      ![null,...sideIds].includes(s.side)||!['main',...sideIds].includes(s.tracking)||![null,'destroy','give'].includes(s.records)||
      !s.offers||commonIds.some(id=>!Number.isSafeInteger(s.offers[id])||s.offers[id]<0)) return null;
    if(s.side && (s.checkpoint||!sideAvailable(s,s.side))) return null;
    return {...s,...readAssets(s),activities:readActivities(s.activities)};
  } catch { return null; }
}
function readActivities(saved:ActivityHistory|undefined):ActivityHistory {
  const history:ActivityHistory={};
  for(const id of activityIds){
    const item=saved?.[id];
    if(item&&Number.isSafeInteger(item.count)&&item.count>0&&Number.isFinite(item.best)&&item.best>0)
      history[id]={count:item.count,best:item.best};
  }
  return history;
}
function readAssets(s:Partial<Save>):Pick<Save,'arsenal'|'vehicles'|'properties'|'residence'> {
  const arsenal=starterArsenal();
  for(const id of weaponIds){
    const ammo=s.arsenal?.ammo?.[id], spec=weapons[id];
    if(ammo && Number.isSafeInteger(ammo.loaded) && ammo.loaded>=0 && ammo.loaded<=spec.magazine &&
       Number.isSafeInteger(ammo.spare) && ammo.spare>=0 && ammo.spare<=spec.reserve) arsenal.ammo[id]={...ammo};
  }
  const equipped=s.arsenal?.equipped;
  if(equipped && weaponIds.includes(equipped) && arsenal.ammo[equipped]) arsenal.equipped=equipped;
  const vehicles=vehicleIds.filter(id=>Array.isArray(s.vehicles)&&s.vehicles.includes(id));
  const properties=homes.map(home=>home.id).filter(id=>Array.isArray(s.properties)&&s.properties.includes(id));
  return {arsenal,vehicles,properties,residence:s.residence && properties.includes(s.residence)?s.residence:null};
}
export function writeSave(save:Save) {
  try {localStorage.setItem(saveKey,JSON.stringify(save));return true;} catch {return false;}
}
export function sideAvailable(save:Save,id:SideId) {
  if(common(id)) return save.chapter>1;
  return save.chapter>=unique[id].unlock && !save.completed.includes(id);
}
export function finishSide(save:Save,id:SideId,records?:BlackmailChoice):Save {
  if(save.side!==id||!sideAvailable(save,id)) return save;
  return {...save,side:null,tracking:'main',credits:save.credits+getSide(save,id).reward,
    completed:common(id)?save.completed:[...save.completed,id],
    offers:common(id)?{...save.offers,[id]:save.offers[id]+1}:save.offers,
    records:records??save.records};
}

export const effects = {
  collective: { label:'Confier le registre à Nadia',now:'Nadia prépare les relais de quartier à la purge.',later:'La galerie du coteau débouche au pied de l’annexe du plateau.' },
  sorel: { label:'Confier le registre à Sorel',now:'Sorel isole les dossiers personnels et prépare la contestation.',later:'Son badge donne accès au vestibule de service du Nœud.' },
  publish: { label:'Publier le registre expurgé',now:'Les preuves sont rendues publiques et les relais reçoivent des autorisations provisoires.',later:'Les contrôles Civis ferment. Les relais de quartier corrigent les accès à la main.' },
  protect: { label:'Annuler les révocations',now:'L’audit annule la purge et rétablit les droits.',later:'Les portiques rouvrent sous une cellule de contrôle dont Sorel fait partie.' },
};
export type Marker = { at:Point; label:string };
export type ActionStep = {
  at:Point; label:string; text:string; kind:'take'|'use'|'meet'|'escort'|'exit'|'choice'|'delivery'; signal?:string;
  routes?:Marker[];
};
const on=(at:Point,label:string,text:string,kind:ActionStep['kind']='take', extra:Partial<ActionStep>={}):ActionStep=>({at,label,text,kind,...extra});
const marker=(at:Point,label:string):Marker=>({at,label});
export type Mission = {name:string;heading:string;briefing:string;access:string;contact:string;at:Point;district:number;reward:number;steps:ActionStep[]};

export const objectives:Record<Chapter,Mission> = {
  1: {name:'Puce fantôme',heading:'M01 — Puce fantôme',contact:'Mina',at:garage,district:0,reward:450,
    briefing:'« Civis m’a déjà fait livrer ce genre de bordereau. Va au dépôt F-07, prends la puce et retrouve-moi sous les voies. Tu peux garer la voiture près de la cour. »',
    access:'Le portail principal donne sur l’avenue. Depuis la cour latérale, longez le dépôt jusqu’au quai nord ou ouvrez la grille avec Intrusion. Fuite par le pont en voiture ou par l’escalier à pied.',
    steps:[
      on(chip,'Prendre la puce','Récupérer la puce au dépôt F-07','take',{signal:'chip',routes:[marker([22,-11.2],'Entrée principale'),marker(northDock,'Quai nord')]}),
      on(exchange,'Donner la puce à Mina','Remettre la puce à Mina sous les voies','delivery',{routes:[marker([13,-35.15],'Escalier'),marker([43,-41],'Pont routier'),marker(p.lowParking,'Parking bas')]}),
    ]},
  2: {name:'Date d’effet',heading:'M02 — Date d’effet',contact:'Sorel',at:p.recordsSorel,district:0,reward:460,
    briefing:'« Mina a reconnu la référence d’audit. J’ai vu un bordereau signé, pas son calendrier. La copie papier est encore aux archives d’atelier. Si vous la trouvez, vous saurez quand ils vont révoquer votre accès. »',
    access:'Suivez l’agent des archives jusqu’à ce qu’il quitte le bureau. L’accès latéral à l’est réagit à Intrusion, le porche sud s’ouvre pendant sa tournée.',
    steps:[
      on(p.calendar,'Prendre le calendrier','Récupérer la copie papier du calendrier','take',{signal:'calendar',routes:[marker(p.recordsDoor,'Porche des archives'),marker(p.recordsSide,'Accès latéral')]}),
      on(p.recordsSorel,'Montrer le calendrier','Présenter la date et l’adresse du premier immeuble à Sorel','meet'),
    ]},
  3: {name:'La première porte',heading:'M03 — La première porte',contact:'Nadia Keita',at:p.nadia,district:1,reward:520,
    briefing:'« À la résidence haute, une famille dort sur le palier depuis que le portique refuse son badge. Récupérez son journal. Je veux savoir à quel ordre le refus répond. »',
    access:'Prenez les paliers et l’escalier extérieur par l’ouest. Le passage d’entretien à l’est mène au même hall. Détournez la patrouille avec un leurre ou attendez son passage.',
    steps:[
      on(p.portico,'Copier le journal du portique','Récupérer le journal des accès de la résidence','use',{signal:'portico',routes:[marker(p.stair,'Escaliers des paliers'),marker(p.serviceWalk,'Accès d’entretien')]}),
      on(p.nadia,'Remettre le journal à Nadia','Relier le refus au bordereau de la puce avec Nadia','meet'),
    ]},
  4: {name:'Le registre des effacés',heading:'M04 — Le registre des effacés',contact:'Nadia Keita',at:p.nadia,district:1,reward:750,
    briefing:'« Le bordereau et le journal portent le même numéro. Croisez-les à la borne Civis. Le registre d’audit dira qui a avancé la purge. Il contient aussi des dossiers privés. »',
    access:'La borne est sur le parvis. Entrez ensuite aux archives par le guichet sud pendant la relève ou par la galerie technique derrière le bâtiment.',
    steps:[
      on(p.audit,'Croiser le bordereau et le journal','Interroger la borne d’audit de Civis','use',{signal:'audit'}),
      on(p.register,'Prendre le registre','Récupérer le registre d’audit aux archives','take',{signal:'register',routes:[marker([102,-13.5],'Guichet sud'),marker([114,-38],'Galerie technique')]}),
      on(p.nadia,'Confier le registre à Nadia','Choisir à qui confier une copie du registre','choice',{routes:[marker(p.sorel,'Sorel')]}),
    ]},
  5: {name:'Dernière montée',heading:'M05 — Dernière montée',contact:'Sorel',at:p.plateauSorel,district:2,reward:850,
    briefing:'« Varenne a avancé la purge. Rétablissez le poste qui commande le registre au plateau. Le vestibule de service et l’annexe peuvent tous les deux relayer l’ordre. »',
    access:'La filière Nadia ouvre la galerie piétonne du coteau et mène à l’annexe. Le badge de Sorel donne un accès légal au vestibule. La rampe routière et les escaliers restent disponibles.',
    steps:[
      on(p.sorelConsole,'Rétablir la commande','Rétablir le poste de commande depuis le vestibule','use',{signal:'sorelConsole',routes:[marker([190,-8.9],'Vestibule de service'),marker([175,-11],'Accès piéton')]}),
      on(p.restoredConsole,'Vérifier l’horloge de purge','Vérifier l’horloge et les deux décisions possibles','use',{signal:'purge'}),
    ]},
  6: {name:'Droit d’accès',heading:'M06 — Droit d’accès',contact:'Sorel',at:p.plateauSorel,district:2,reward:1000,
    briefing:'« Votre badge répond encore. Celui des habitants dépend maintenant de cet ordre. À vous de prendre la décision au poste de commande. »',
    access:'Accédez à la salle par le couloir surveillé de votre filière ou la coursive nord. Son portillon s’ouvre par créneaux. Les deux décisions restent possibles.',
    steps:[
      on(p.commander,'Décider du sort du registre','Atteindre le poste de commande et choisir','choice',{signal:'command',routes:[marker([197.5,-41.1],'Coursive nord')]}),
    ]},
};
export const nadiaPlateau=on(p.nadiaConsole,'Rétablir la commande','Rétablir le poste depuis l’annexe des remparts','use',{
  signal:'nadiaConsole',routes:[marker(p.gallery,'Galerie du coteau'),marker([176,-21],'Arrivée au pied de l’annexe')],
});

type Contract = { name:string; area:string; contact:string; at:Point; briefing:string; access:string; reward:number; result:string; steps:ActionStep[] };
const unique:Record<UniqueId,Contract&{unlock:Chapter}> = {
  U01: {name:'Une porte de plus',area:'Les Forges',contact:'Mina',at:garage,unlock:2,reward:210,
    briefing:'« La grille est ouverte. Va chercher le module sur mon établi et branche-le au panneau, côté tunnel. Les gens doivent pouvoir voir où ils mettent les pieds. »',
    access:'Passez par la grille ouverte côté ateliers ou rejoignez le passage par l’avenue.',result:'Le passage de service reste éclairé.',
    steps:[on(p.module,'Prendre le module','Prendre le module à l’atelier','take',{signal:'module'}),on(p.servicePanel,'Brancher le module','Rétablir les lampes du passage inférieur','use',{signal:'servicePanel'})]},
  U02: {name:'L’étage des absents',area:'La Dalle',contact:'Nadia Keita',at:p.nadia,unlock:4,reward:360,
    briefing:'« Inès attend près de l’école. Ramenez-moi les relevés du palier, puis revenez avec elle. Elle connaît les escaliers, mais ne doit pas traverser la chaussée seule. »',
    access:'La galerie et les escaliers rejoignent la permanence.',result:'Inès a rejoint la permanence. La porte de cour est ouverte.',
    steps:[on(p.residentLog,'Prendre les relevés','Récupérer les relevés d’accès du palier','take',{signal:'residentLog'}),
      on(p.ines,'Rejoindre Inès','Rejoindre Inès en bas du coteau','meet'),
      on(p.nadia,'Mettre Inès à l’abri','Accompagner Inès jusqu’à la permanence','escort')]},
  U03: {name:'Les noms de la nuit',area:'La Dalle',contact:'Lise Marec',at:p.lise,unlock:4,reward:340,
    briefing:'« Quelqu’un utilise les dossiers de la permanence pour faire chanter les adultes que j’accompagne. On m’a promis une copie au magasin. Récupérez-la et reparlez-moi avant de décider quoi en faire. »',
    access:'Ada peut ouvrir l’arrière-boutique. L’espace de service donne aussi sur la cour.',result:'La permanence de Lise reste ouverte.',
    steps:[on(p.blackmail,'Récupérer le dossier','Récupérer le dossier de chantage','take',{signal:'blackmail',routes:[marker(p.keeper,'Demander la clé à Ada'),marker(p.backRoom,'Accès de service')]}),on(p.lise,'Parler du dossier à Lise','Décider du sort des dossiers avec Lise','choice')]},
  U04: {name:'Papier carbone',area:'Les Quais',contact:'Mina',at:garage,unlock:3,reward:310,
    briefing:'« Le propriétaire de la papeterie cherche ses plans. Récupère son lot de documents et rends-les-lui sur la promenade. Il a tracé un raccourci jusqu’au coteau. »',
    access:'La papeterie peut être abordée par le porche, côté rue, ou par le quai inférieur.',result:'Le garage expose une carte annotée et l’accès du coteau est ouvert.',
    steps:[on(p.paper,'Récupérer les plans','Retrouver les documents de la papeterie','take',{signal:'paper',routes:[marker(p.paperNorth,'Porche'),marker(p.paperSouth,'Quai')]}),on(p.paperOwner,'Rendre les plans','Rendre les documents à leur propriétaire','meet')]},
  U05: {name:'Le dernier portillon',area:'Le Nœud',contact:'Sorel',at:p.plateauSorel,unlock:6,reward:320,
    briefing:'« L’équipe de nuit termine près des serveurs. Remettez son portillon en service. Ces gens doivent pouvoir rentrer à pied, quel que soit le sort du registre. »',
    access:'Le boîtier se rejoint par la rampe orientale ou l’escalier de maintenance derrière le bâtiment.',result:'La sortie de nuit reste ouverte.',
    steps:[on(p.lastGate,'Rétablir le portillon','Remettre en service la sortie de nuit','use',{signal:'nightExit',routes:[marker([224.4,-6.1],'Rampe'),marker([220.3,-20],'Escalier de maintenance')]})]},
};
const board=p.contracts;
const delivery=(from:Point,to:Point,name:string):ActionStep[]=>[on(from,'Prendre '+name,'Récupérer '+name,'take',{signal:'sideItem'}),on(to,'Livrer '+name,'Livrer '+name,'meet')];
const repair=(at:Point,exit:Point):ActionStep[]=>[on(at,'Rétablir la borne','Remettre la borne en service','use',{signal:'sideItem'}),on(exit,'Confirmer la sortie','Quitter la zone de service','exit')];
const escort=(at:Point,to:Point):ActionStep[]=>[on(at,'Rejoindre le passant','Rejoindre la personne à accompagner','meet'),on(to,'Terminer l’accompagnement','Accompagner la personne jusqu’au point sûr','escort')];
const variants:Record<CommonId,readonly {area:string;steps:ActionStep[];access:string}[]> = {
  C01:[{area:'Les Forges',steps:delivery([-34.5,35.7],[-2.5,-54.3],'le colis'),access:'L’avenue et le pont conviennent à la voiture. L’escalier raccourcit le trajet à pied.'},
       {area:'La Dalle',steps:delivery([92,12.6],[95.1,-32.8],'le colis'),access:'Remontez les paliers entre l’école et les logements.'}],
  C02:[{area:'La Dalle',steps:delivery([121.7,-39.6],[109.8,9.1],'la caisse de relais'),access:'La ruelle latérale rejoint la cour. Leurre peut attirer la patrouille.'},
       {area:'Les Quais',steps:delivery([136.88,-94.65],[119.2,-102.1],'la caisse étanche'),access:'Le quai haut et la rampe piétonne mènent au même point.'},
       {area:'Le Nœud',steps:delivery([217.3,-9.6],[187.7,9.8],'le boîtier'),access:'Passez par la chaussée est ou le parvis.'}],
  C03:[{area:'Les Forges',steps:repair([-33.7,17.2],[-44,7.9]),access:'La rue d’ateliers donne sur l’avenue.'},
       {area:'Les Belvédères',steps:repair([167.6,78.8],[177.7,85.2]),access:'Empruntez les terrasses ou le lacet routier.'},
       {area:'Le Nœud',steps:repair([216.8,9.5],[225,3.4]),access:'Passez le parvis ou l’avenue orientale.'}],
  C04:[{area:'La Dalle',steps:escort([93.5,11.2],[116.9,12.3]),access:'Longez les façades jusqu’à la permanence.'},
       {area:'Les Quais',steps:escort([95.1,-102],[118,-104]),access:'Restez sur la promenade basse.'},
       {area:'Les Forges',steps:escort([-33.5,28.1],[-24.3,22.8]),access:'Le garage est au bout de la cour.'}],
};
const commonNames:Record<CommonId,string>={C01:'Course entre relais',C02:'Récupération de matériel',C03:'Relais hors ligne',C04:'Passage accompagné'};
export function getSide(save:Save,id:SideId):Contract {
  if(!common(id)) return unique[id];
  const list=variants[id], offer=list[save.offers[id]%list.length];
  return {...offer,name:commonNames[id],contact:'Panneau des relais',at:board,briefing:'Offre '+(save.offers[id]+1)+'. '+offer.steps[0].text+'.',
    reward:{C01:150,C02:175,C03:175,C04:160}[id],result:'Offre terminée. Le panneau propose un nouveau trajet.'};
}
