import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import './styles.css';
import { FORGES, ROAD_ROUTES, groundHeightAt } from './layout';
import { playAlarm, playImpact, playImplant, playShot, playSuccess, startSoundscape, toggleSound } from './audio';
import {
  animateEffects,
  buildCity,
  flashBlood,
  refreshNavigation,
  resizeCity,
  showVehicleDamageAt,
  updateForgesLife,
  updateActorVisual,
  type Character,
  type City,
  type Guard,
  type Point,
} from './world';

type MainState = 'available' | 'accepted' | 'chip' | 'complete';
type Implant = 'intrusion' | 'leurre' | 'surcharge';
type SaveData = {
  version: 1;
  credits: number;
  accepted: boolean;
  mainComplete: boolean;
  shortcutOpen: boolean;
  secondaryUnlocked: boolean;
  secondaryStage: 0 | 1 | 2;
  mainRewardPaid: boolean;
  sideRewardPaid: boolean;
  ownedImplants: Implant[];
  equippedImplants: [Implant, Implant];
};

const SAVE_KEY = 'deadline.puce-fantome.save.v1';
const STEP = 1 / 60;
const INITIAL_POSITION = FORGES.playerStart;
const CAR_POSITION = FORGES.carStart;
const DEPOT = FORGES.chip;
const HANDOFF = FORGES.handoff;
const PACKAGE = FORGES.package;
const MINA_GARAGE = { x: FORGES.garage.x - 7, z: FORGES.garage.z };
const GATE_POINT = { x: 114.5, z: 61.5 };
const CAMERA_POINT = FORGES.camera;
const SERVICE_PANEL_POINT = { x: 54.5, z: 60.5 };
const IMPLANT_NAMES: Record<Implant, string> = {
  intrusion: 'Intrusion',
  leurre: 'Leurre',
  surcharge: 'Surcharge',
};

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const bootScreen = $('#boot-screen');
const playButton = $('#play-button') as HTMLButtonElement;
const hud = $('#hud');
const dialogLayer = $('#dialog-layer');
const dialogTitle = $('#dialog-title');
const dialogCopy = $('#dialog-copy');
const dialogActions = $('#dialog-actions');
const dialogLabel = $('#dialog-label');
const pauseLayer = $('#pause-layer');
const journalLayer = $('#journal-layer');
const pauseActions = $('#pause-actions');
const objectiveText = $('#objective-text');
const objectiveKicker = $('#objective-kicker');
const interactionText = $('#interaction-text');
const interactionLabel = $('#interaction-label');
const interactionKey = $('#interaction-key');
const alertPill = $('#alert-pill');
const alertText = $('#alert-text');
const aimReticle = $('#aim-reticle');
const messageLine = $('#message-line');
const canvasMap = $('#minimap') as HTMLCanvasElement;
const mapContext = canvasMap.getContext('2d')!;
const healthBar = $('#health-bar') as HTMLElement;
const healthValue = $('#health-value');
const cashValue = $('#cash-value');

const freshSave = (): SaveData => ({
  version: 1,
  credits: 240,
  accepted: false,
  mainComplete: false,
  shortcutOpen: false,
  secondaryUnlocked: false,
  secondaryStage: 0,
  mainRewardPaid: false,
  sideRewardPaid: false,
  ownedImplants: ['intrusion', 'leurre'],
  equippedImplants: ['intrusion', 'leurre'],
});

function readSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = freshSave();
    if (parsed.version !== 1) return base;
    const owned = Array.isArray(parsed.ownedImplants)
      ? parsed.ownedImplants.filter((item): item is Implant => ['intrusion', 'leurre', 'surcharge'].includes(item))
      : base.ownedImplants;
    const equipped = Array.isArray(parsed.equippedImplants)
      ? parsed.equippedImplants.filter((item): item is Implant => owned.includes(item)).slice(0, 2)
      : base.equippedImplants;
    if (equipped.length < 2 && owned.length > 1) equipped.push(owned.find((item) => item !== equipped[0])!);
    return {
      ...base,
      ...parsed,
      credits: Number.isFinite(parsed.credits) ? Math.max(0, Number(parsed.credits)) : base.credits,
      accepted: Boolean(parsed.accepted && !parsed.mainComplete),
      mainComplete: Boolean(parsed.mainComplete),
      shortcutOpen: Boolean(parsed.shortcutOpen || parsed.mainComplete),
      secondaryUnlocked: Boolean(parsed.secondaryUnlocked || parsed.mainComplete),
      secondaryStage: parsed.secondaryStage === 1 || parsed.secondaryStage === 2 ? parsed.secondaryStage : 0,
      mainRewardPaid: Boolean(parsed.mainRewardPaid),
      sideRewardPaid: Boolean(parsed.sideRewardPaid),
      ownedImplants: owned.length >= 2 ? owned : base.ownedImplants,
      equippedImplants: [equipped[0] ?? 'intrusion', equipped[1] ?? 'leurre'],
    };
  } catch {
    return freshSave();
  }
}

let save = readSave();
let mainState: MainState = save.mainComplete ? 'complete' : save.accepted ? 'accepted' : 'available';
let city: City;
let physics: RAPIER.World;
let started = false;
let paused = false;
let dialogOpen = false;
let journalOpen = false;
let gameTime = 0;
let accumulator = 0;
let previousFrame = 0;
let interfaceClock = 0;
let observed = 0;
let confirmedAt = -1000;
let chipTakenAt = -1000;
let lastDamageAt = -1000;
let invulnerableUntil = 0;
let vehicleMode = false;
let cameraDisabledUntil = 0;
let violenceAlarmUntil = 0;
let implantReadyAt: [number, number] = [0, 0];
let weaponReadyAt = 0;
let weaponHeat = 0;
let playerAim = new THREE.Vector3(0, 0, -1);
let aimPoint = new THREE.Vector3(0, 0, -1);
let mouse = { x: .5, y: .5 };
let messageUntil = 0;
let lastMessage = '';
let hitMarkerUntil = 0;
let damageCount = 0;
let secondaryStorySeen = false;
let previousActivityPhase = -1;
let checkpointPosition = { ...INITIAL_POSITION };
let menuBeforeStart = true;

const pressed = new Set<string>();
const pointerNdc = new THREE.Vector2();
const aimPlanePoint = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const navOffsets = [
  [-1, 0, 10], [1, 0, 10], [0, -1, 10], [0, 1, 10],
  [-1, -1, 14], [1, -1, 14], [-1, 1, 14], [1, 1, 14],
] as const;

const objectiveMarker = new THREE.Group();
const markerDisc = new THREE.Mesh(
  new THREE.RingGeometry(.6, .82, 36),
  new THREE.MeshBasicMaterial({ color: 0xf1b66c, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }),
);
markerDisc.rotation.x = -Math.PI / 2;
markerDisc.position.y = .07;
objectiveMarker.add(markerDisc);
const markerCore = new THREE.Mesh(
  new THREE.CylinderGeometry(.035, .035, 3.2, 7),
  new THREE.MeshBasicMaterial({ color: 0xf1b66c, transparent: true, opacity: .22, depthWrite: false }),
);
markerCore.position.y = 1.65;
objectiveMarker.add(markerCore);
const markerCrown = new THREE.Mesh(
  new THREE.TorusGeometry(.55, .035, 5, 30),
  new THREE.MeshBasicMaterial({ color: 0xf1b66c, transparent: true, opacity: .9, depthWrite: false }),
);
markerCrown.position.y = 1.2;
objectiveMarker.add(markerCrown);
let objectivePoint: Point | null = null;
let trace: THREE.Line | null = null;
let traceExpires = 0;
const bulletPoints = new THREE.Points(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.PointsMaterial({ color: 0x83f5ed, size: .12, transparent: true, opacity: .9 }),
);
const liveTraces: Array<{ line: THREE.Line; expires: number }> = [];
const cameraConeBase = new THREE.Color(0xec6980);
const hackedCameraMat = new THREE.MeshStandardMaterial({ color: 0x52dfd1, emissive: 0x15756b, emissiveIntensity: .9 });
const alertCameraMat = new THREE.MeshStandardMaterial({ color: 0xff6275, emissive: 0xba152b, emissiveIntensity: 2.6 });
const idleCameraMat = new THREE.MeshStandardMaterial({ color: 0xe6849a, emissive: 0x853349, emissiveIntensity: .8 });
const keyToImplant: Array<Implant> = ['intrusion', 'leurre'];

function persist(): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function showMessage(text: string, duration = 3): void {
  lastMessage = text;
  messageUntil = gameTime + duration;
  messageLine.textContent = text;
}

function setMarker(point: Point | null): void {
  objectivePoint = point;
  objectiveMarker.visible = Boolean(point);
  if (point) objectiveMarker.position.set(point.x, groundHeightAt(point), point.z);
}

function missionObjective(): { kicker: string; text: string; point: Point | null } {
  if (mainState === 'available') return { kicker: 'PISTE PRINCIPALE · MINA', text: 'Parler à Mina au garage', point: MINA_GARAGE };
  if (mainState === 'accepted') return { kicker: 'PUCE FANTÔME · VOL', text: 'Approcher le dépôt par l’avenue ou la cour', point: { x: 89, z: 39 } };
  if (mainState === 'chip') return { kicker: 'PUCE FANTÔME · FUITE', text: 'Rejoindre Mina sous les voies', point: HANDOFF };
  if (save.secondaryStage === 1) return { kicker: 'QUÊTE · UNE PORTE DE PLUS', text: 'Prendre le module au garage', point: PACKAGE };
  if (save.secondaryStage === 2) return { kicker: 'QUÊTE · UNE PORTE DE PLUS', text: 'Rétablir l’éclairage au panneau de service', point: SERVICE_PANEL_POINT };
  if (save.secondaryUnlocked && !save.sideRewardPaid && !secondaryStorySeen) return { kicker: 'NOUVELLE PISTE', text: 'Revenir voir Mina au garage', point: MINA_GARAGE };
  return { kicker: 'VILLE LIBRE', text: 'Explorer Les Forges', point: null };
}

function refreshObjective(): void {
  const current = missionObjective();
  objectiveKicker.textContent = current.kicker;
  objectiveText.textContent = current.text;
  setMarker(current.point);
}

function implantMarkup(): string {
  return `<div class="implant-picker">
    <div class="implant-choice"><label for="implant-slot-one">Emplacement R</label><select id="implant-slot-one">${save.ownedImplants.map((name) => `<option value="${name}" ${save.equippedImplants[0] === name ? 'selected' : ''}>${IMPLANT_NAMES[name]}</option>`).join('')}</select></div>
    <div class="implant-choice"><label for="implant-slot-two">Emplacement F</label><select id="implant-slot-two">${save.ownedImplants.map((name) => `<option value="${name}" ${save.equippedImplants[1] === name ? 'selected' : ''}>${IMPLANT_NAMES[name]}</option>`).join('')}</select></div>
  </div>`;
}

function openDialog(title: string, copy: string, actions: Array<{ label: string; run: () => void; style?: string }>, label = 'LES FORGES / GARAGE DE MINA'): void {
  dialogTitle.textContent = title;
  dialogCopy.innerHTML = copy;
  dialogLabel.textContent = label;
  dialogActions.replaceChildren();
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `action-button ${action.style ?? ''}`;
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    dialogActions.append(button);
  }
  dialogLayer.classList.remove('hidden');
  dialogOpen = true;
  pressed.clear();
  requestAnimationFrame(() => dialogActions.querySelector('button')?.focus());
}

function closeDialog(): void {
  dialogLayer.classList.add('hidden');
  dialogOpen = false;
  pressed.clear();
}

function readImplantSelection(): void {
  const one = $('#implant-slot-one') as HTMLSelectElement | null;
  const two = $('#implant-slot-two') as HTMLSelectElement | null;
  if (!one || !two) return;
  if (one.value === two.value) {
    const other = save.ownedImplants.find((implant) => implant !== one.value);
    if (other) two.value = other;
  }
  save.equippedImplants = [one.value as Implant, two.value as Implant];
  persist();
  updateHud();
}

function moveMina(point: Point): void {
  const floorY = groundHeightAt(point);
  city.mina.position.set(point.x, floorY, point.z);
  city.minaTag.position.set(point.x, floorY + (distance(point.x, point.z, HANDOFF.x, HANDOFF.z) < 1 ? 2.25 : 5.1), point.z);
}

function setGate(open: boolean): void {
  const current = city.gateMesh.userData.collider as RAPIER.Collider | undefined;
  if (open) {
    if (current && current.isEnabled()) physics.removeCollider(current, true);
    city.gateMesh.userData.collider = undefined;
    city.gateMesh.visible = false;
  } else {
    city.gateMesh.visible = true;
    if (!current || !current.isEnabled()) {
      const desc = RAPIER.ColliderDesc.cuboid(1.28, .9, .11).setTranslation(GATE_POINT.x, groundHeightAt(GATE_POINT) + .9, GATE_POINT.z);
      city.gateMesh.userData.collider = physics.createCollider(desc);
    }
  }
  refreshNavigation(city);
}

function setShortcut(open: boolean): void {
  const current = city.shortcutMesh.userData.collider as RAPIER.Collider | undefined;
  if (open) {
    if (current && current.isEnabled()) physics.removeCollider(current, true);
    city.shortcutMesh.userData.collider = undefined;
    city.shortcutMesh.visible = false;
  } else {
    city.shortcutMesh.visible = true;
    if (!current || !current.isEnabled()) {
      const desc = RAPIER.ColliderDesc.cuboid(.24, 1.05, 1.1).setTranslation(FORGES.serviceGate.x, groundHeightAt(FORGES.serviceGate) + 1.05, FORGES.serviceGate.z);
      city.shortcutMesh.userData.collider = physics.createCollider(desc);
    }
  }
  refreshNavigation(city);
}

function setPlayerPosition(point: Point): void {
  const y = groundHeightAt(point) + .9;
  city.player.position.set(point.x, y, point.z);
  city.player.body.setTranslation({ x: point.x, y, z: point.z }, true);
  updateActorVisual(city.player);
}

function setCarPosition(point: Point, yaw = -Math.PI / 2): void {
  const groundY = groundHeightAt(point);
  city.car.position.set(point.x, groundY + .57, point.z);
  city.car.body.setTranslation({ x: point.x, y: groundY + .57, z: point.z }, true);
  city.car.yaw = yaw;
  city.car.group.position.set(point.x, groundY, point.z);
  city.car.group.rotation.y = yaw;
  city.car.speed = 0;
  city.car.available = true;
  city.car.contactHandles.clear();
  city.car.impactCount = 0;
  city.car.damageMarks.forEach((mark) => { mark.visible = false; });
}

function resetGuard(guard: Guard): void {
  const y = groundHeightAt(guard.initial) + .9;
  guard.position.set(guard.initial.x, y, guard.initial.z);
  guard.body.setTranslation({ x: guard.initial.x, y, z: guard.initial.z }, true);
  guard.facing = 0;
  guard.health = 100;
  guard.alive = true;
  guard.state = 'patrol';
  guard.memory = null;
  guard.stateUntil = 0;
  guard.attackClock = 0;
  guard.patrolIndex = 0;
  guard.route = [];
  guard.routeIndex = 0;
  guard.group.visible = true;
  guard.group.rotation.set(0, 0, 0);
  guard.collider.setEnabled(true);
  updateActorVisual(guard);
}

function resetToCheckpoint(): void {
  mainState = save.mainComplete ? 'complete' : 'accepted';
  vehicleMode = false;
  city.player.group.visible = true;
  city.player.collider.setEnabled(true);
  city.player.alive = true;
  city.player.health = 100;
  setPlayerPosition(checkpointPosition);
  setCarPosition(CAR_POSITION);
  city.chip.visible = true;
  city.secondaryPackage.visible = save.secondaryStage === 1;
  moveMina(MINA_GARAGE);
  for (const guard of city.guards) resetGuard(guard);
  setGate(false);
  setShortcut(save.shortcutOpen);
  cameraDisabledUntil = 0;
  violenceAlarmUntil = 0;
  observed = 0;
  confirmedAt = -1000;
  chipTakenAt = -1000;
  lastDamageAt = -1000;
  refreshObjective();
  updateHud();
  showMessage('Reprise au garage. Le dépôt est toujours là.', 4);
}

function startMainContract(): void {
  readImplantSelection();
  mainState = 'accepted';
  save.accepted = true;
  checkpointPosition = { ...INITIAL_POSITION };
  persist();
  city.chip.visible = true;
  for (const guard of city.guards) resetGuard(guard);
  setGate(false);
  setShortcut(false);
  observed = 0;
  confirmedAt = -1000;
  refreshObjective();
  closeDialog();
  showMessage('Contrat accepté. Deux entrées sont connues; le quai est surveillé.', 4.5);
}

function abandonMainContract(): void {
  mainState = 'available';
  save.accepted = false;
  persist();
  resetToCheckpoint();
  mainState = 'available';
  refreshObjective();
  closeDialog();
  showMessage('Contrat abandonné. Le quartier reste ouvert.', 3.5);
}

function showMinaDialog(): void {
  if (mainState === 'available') {
    openDialog(
      'La liste porte ton nom.',
      `<p><strong>Mina :</strong> La puce est dans un dépôt logistique, au nord des voies. La porte principale donne sur l’avenue; une grille ouvre sur la cour de livraison.</p><p>Prends-la, puis décroche sous le pont. Je déchiffrerai ce qu’elle contient. Les vigiles ont un angle mort dans la cour. Choisis tes deux implants avant de partir.</p>${implantMarkup()}`,
      [
        { label: 'Accepter le contrat', style: 'primary', run: startMainContract },
        { label: 'Pas encore', run: closeDialog },
      ],
      'BRIEFING · GARAGE DE MINA',
    );
    $('#implant-slot-one')?.addEventListener('change', readImplantSelection);
    $('#implant-slot-two')?.addEventListener('change', readImplantSelection);
    return;
  }
  if (mainState === 'accepted' || mainState === 'chip') {
    openDialog(
      'On reprend depuis le garage ?',
      `<p>Le point de reprise est enregistré au début du contrat. La puce, le véhicule et les vigiles retrouveront leur état initial.</p><p>Tu peux aussi abandonner et revenir à la ville libre.</p>`,
      [
        { label: 'Reprendre au garage', style: 'primary', run: () => { resetToCheckpoint(); closeDialog(); } },
        { label: 'Abandonner le contrat', style: 'danger', run: abandonMainContract },
        { label: 'Continuer à explorer', run: closeDialog },
      ],
      'POINT DE REPRISE',
    );
    return;
  }
  if (save.secondaryStage === 0 && save.secondaryUnlocked && !save.sideRewardPaid) {
    openDialog(
      'Une porte de plus.',
      `<p><strong>Mina :</strong> Le passage de service s’est ouvert, mais ses lampes sont mortes. Prends le module posé dans le garage et porte-le au panneau de la grille.</p><p>Le raccourci est ouvert depuis le dépôt; tu peux aussi rejoindre le panneau par l’avenue.</p>${implantMarkup()}`,
      [
        { label: 'Prendre le contrat', style: 'primary', run: () => {
          readImplantSelection();
          save.secondaryStage = 1;
          secondaryStorySeen = true;
          city.secondaryPackage.visible = true;
          persist();
          closeDialog();
          refreshObjective();
          showMessage('U01 · Une porte de plus. Le module est dans le garage.', 4);
        } },
        { label: 'Plus tard', run: () => { secondaryStorySeen = true; closeDialog(); refreshObjective(); } },
      ],
      'CONTRAT SECONDAIRE · GARAGE',
    );
    $('#implant-slot-one')?.addEventListener('change', readImplantSelection);
    $('#implant-slot-two')?.addEventListener('change', readImplantSelection);
    return;
  }
  const copy = save.secondaryStage === 1
    ? '<p>Le module attend dans le garage, près de l’établi.</p>'
    : save.secondaryStage === 2
      ? '<p>Le panneau est fixé à la grille de service ouverte. L’accès par l’avenue reste praticable.</p>'
      : '<p>Une partie des identités révoquées est encore récupérable. Mina déchiffre la puce; les Forges ont quelques raccourcis de plus ce soir.</p>';
  openDialog('Le garage tient encore.', `${copy}${implantMarkup()}`, [{ label: 'Reprendre la rue', style: 'primary', run: closeDialog }]);
  $('#implant-slot-one')?.addEventListener('change', readImplantSelection);
  $('#implant-slot-two')?.addEventListener('change', readImplantSelection);
}

function openMinaHandoff(): void {
  if (mainState === 'chip') {
    const cleanFor = gameTime - Math.max(confirmedAt, chipTakenAt);
    const calm = cleanFor >= 5 && gameTime >= confirmedAt + 5;
    const onFoot = !vehicleMode;
    if (!calm || !onFoot) {
      const reasons = [!onFoot ? 'Tu dois descendre du véhicule.' : '', !calm ? `Aucune détection directe depuis cinq secondes (encore ${Math.max(0, 5 - cleanFor).toFixed(1)} s).` : ''].filter(Boolean).join(' ');
      showMessage(reasons, 3.5);
      return;
    }
    finishMainContract();
    return;
  }
  if (save.secondaryStage === 2 && distance(city.player.position.x, city.player.position.z, SERVICE_PANEL_POINT.x, SERVICE_PANEL_POINT.z) < 2.6) {
    save.secondaryStage = 0;
    save.secondaryUnlocked = false;
    if (!save.sideRewardPaid) {
      save.credits += 85;
      save.sideRewardPaid = true;
    }
    if (!save.ownedImplants.includes('surcharge')) save.ownedImplants.push('surcharge');
    const panelLamp = city.servicePanel.userData.lamp as THREE.Mesh;
    (panelLamp.material as THREE.MeshStandardMaterial).color.set(0x7ce5bb);
    (panelLamp.material as THREE.MeshStandardMaterial).emissive.set(0x2da676);
    (panelLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2;
    persist();
    refreshObjective();
    updateHud();
    playSuccess();
    openDialog('Le passage reprend vie.', '<p>Le panneau confirme le rétablissement des lampes de service. Le raccourci reste ouvert dans les Forges.</p><p>Mina t’a crédité 85 ¢ et le module <strong>Surcharge</strong> est disponible à l’équipement.</p>', [{ label: 'Voir le garage', style: 'primary', run: closeDialog }], 'U01 · TERMINÉ');
    showMessage('Éclairage rétabli · +85 ¢ · Surcharge débloquée.', 5);
    return;
  }
  showMinaDialog();
}

function finishMainContract(): void {
  mainState = 'complete';
  save.accepted = false;
  save.mainComplete = true;
  save.shortcutOpen = true;
  save.secondaryUnlocked = true;
  if (!save.mainRewardPaid) {
    save.credits += 180;
    save.mainRewardPaid = true;
  }
  persist();
  city.chip.visible = false;
  moveMina(MINA_GARAGE);
  violenceAlarmUntil = 0;
  setGate(true);
  setShortcut(true);
  for (const guard of city.guards) {
    guard.state = guard.alive ? 'patrol' : 'down';
    guard.memory = null;
  }
  refreshObjective();
  updateHud();
  playSuccess();
  openDialog(
    'Ton nom est dans la puce.',
    `<p>Mina confirme la révocation programmée. La mise à jour n’a pas encore eu lieu, mais le registre prouve que les identités peuvent déjà être désactivées à distance.</p><p>Elle a ouvert la grille de service entre le passage inférieur et les ateliers. Un nouveau contrat attend au garage.</p>`,
    [{ label: 'Retourner au quartier', style: 'primary', run: closeDialog }],
    'PUCE FANTÔME · TERMINÉ',
  );
  showMessage('Contrat terminé · raccourci ouvert · +180 ¢', 5);
}

function showFailure(): void {
  paused = true;
  pressed.clear();
  openDialog(
    'Plus de signal.',
    '<p>Tu as perdu connaissance. Le garage de Mina reste ton point de reprise; le dépôt, la puce et les vigiles seront réinitialisés.</p>',
    [
      { label: 'Reprendre au garage', style: 'primary', run: () => { paused = false; resetToCheckpoint(); closeDialog(); } },
      { label: 'Abandonner et explorer', style: 'danger', run: () => { paused = false; abandonMainContract(); } },
    ],
    'CONTRAT INTERROMPU',
  );
}

function objectiveTextForJournal(): string {
  if (mainState === 'available') return 'Mina a identifié le dépôt logistique au nord. Le contrat attend au garage.';
  if (mainState === 'accepted') return 'Prendre la puce dans le dépôt. Deux approches sont ouvertes: l’entrée principale et la cour de livraison.';
  if (mainState === 'chip') return 'La puce est récupérée. Rejoindre Mina sous les voies après cinq secondes sans détection directe.';
  if (save.secondaryStage === 1) return 'Prendre le module de service dans le garage de Mina.';
  if (save.secondaryStage === 2) return 'Livrer le module au panneau de la grille et rallumer le passage.';
  if (mainState === 'complete') return save.sideRewardPaid ? 'La grille et son éclairage restent opérationnels.' : 'Mina propose U01 · Une porte de plus au garage.';
  return 'Repérer les passages des Forges et les accès qui relient les ateliers aux voies.';
}

function showJournal(): void {
  const mainLabel = mainState === 'complete' ? 'TERMINÉ' : mainState === 'available' ? 'DISPONIBLE' : 'EN COURS';
  const side = save.secondaryStage === 1 ? 'Module à prendre dans le garage' : save.secondaryStage === 2 ? 'Panneau de service à alimenter' : save.sideRewardPaid ? 'Une porte de plus · terminé' : save.secondaryUnlocked ? 'Une porte de plus · disponible' : 'Aucun';
  $('#journal-content').innerHTML = `<section class="journal-section"><h3>Puce fantôme <span style="color:#70e4e5;font-size:9px;letter-spacing:.12em">${mainLabel}</span></h3><p>${objectiveTextForJournal()}</p><ul><li>Garage de Mina · point de reprise à +6 m</li><li>Dépôt logistique · entrée avenue et cour latérale</li><li>Fuite à pied · escalier, tunnel et remise à 0 m</li><li>Fuite en voiture · pont à +6 m et rampe vers la rue basse</li></ul></section><section class="journal-section"><h3>Quête unique</h3><p>${side}</p><h3>Contacts</h3><ul><li>Mina · mécanique, relais des Forges</li><li>Vigiles · patrouille du dépôt</li><li>Caméra · entrée principale, balayage variable</li></ul></section>`;
  journalLayer.classList.remove('hidden');
  journalOpen = true;
  pressed.clear();
  $('#journal-close').focus();
}

function closeJournal(): void {
  journalLayer.classList.add('hidden');
  journalOpen = false;
  pressed.clear();
}

function openPause(): void {
  if (!started || dialogOpen || journalOpen) return;
  paused = true;
  pressed.clear();
  pauseActions.replaceChildren();
  const choices = [
    { label: 'Reprendre la rue', fn: () => { paused = false; pauseLayer.classList.add('hidden'); } },
    { label: 'Journal de mission', fn: () => { pauseLayer.classList.add('hidden'); paused = false; showJournal(); } },
  ];
  if (save.accepted && !save.mainComplete) choices.push({ label: 'Recommencer au garage', fn: () => { pauseLayer.classList.add('hidden'); paused = false; resetToCheckpoint(); } });
  for (const choice of choices) {
    const button = document.createElement('button');
    button.className = 'action-button';
    button.textContent = choice.label;
    button.addEventListener('click', choice.fn);
    pauseActions.append(button);
  }
  pauseLayer.classList.remove('hidden');
  requestAnimationFrame(() => pauseActions.querySelector('button')?.focus());
}

function closePause(): void {
  paused = false;
  pauseLayer.classList.add('hidden');
  pressed.clear();
}

function interact(): void {
  if (!started || paused || dialogOpen || journalOpen) return;
  const player = city.player.position;
  if (vehicleMode) {
    if (Math.abs(city.car.speed) > 2.1) {
      showMessage('Ralentis avant de sortir.', 2.4);
      return;
    }
    exitVehicle();
    return;
  }
  if (mainState === 'chip' && distance(player.x, player.z, HANDOFF.x, HANDOFF.z) < 3.1) {
    openMinaHandoff();
    return;
  }
  if (save.secondaryStage === 2 && distance(player.x, player.z, SERVICE_PANEL_POINT.x, SERVICE_PANEL_POINT.z) < 2.6) {
    openMinaHandoff();
    return;
  }
  if (mainState === 'accepted' && city.chip.visible && distance(player.x, player.z, DEPOT.x, DEPOT.z) < 1.65) {
    takeChip();
    return;
  }
  if (save.secondaryStage === 1 && city.secondaryPackage.visible && distance(player.x, player.z, PACKAGE.x, PACKAGE.z) < 1.75) {
    city.secondaryPackage.visible = false;
    save.secondaryStage = 2;
    persist();
    refreshObjective();
    showMessage('Module pris. Le panneau est sur la grille de service.', 3.5);
    return;
  }
  const nearMina = distance(player.x, player.z, city.mina.position.x, city.mina.position.z) < 2.8 || distance(player.x, player.z, MINA_GARAGE.x, MINA_GARAGE.z) < 3.2;
  if (nearMina && (mainState === 'available' || save.secondaryUnlocked && save.secondaryStage === 0 && !save.sideRewardPaid)) {
    showMinaDialog();
    return;
  }
  if (distance(player.x, player.z, city.car.position.x, city.car.position.z) < 2.85 && city.car.available) {
    enterVehicle();
    return;
  }
  if (distance(player.x, player.z, MINA_GARAGE.x, MINA_GARAGE.z) < 3.2 || distance(player.x, player.z, city.mina.position.x, city.mina.position.z) < 2.7) {
    showMinaDialog();
    return;
  }
  if (mainState === 'accepted' && distance(player.x, player.z, GATE_POINT.x, GATE_POINT.z) < 2.5) {
      showMessage('Grille de livraison: utilise Intrusion (R).', 2.8);
    return;
  }
  showMessage('Rien à portée. Suis le repère sur le plan.', 2);
}

function takeChip(): void {
  mainState = 'chip';
  city.chip.visible = false;
  chipTakenAt = gameTime;
  confirmedAt = gameTime;
  observed = 0;
  moveMina(HANDOFF);
  for (const guard of city.guards) {
    guard.memory = { ...DEPOT };
    guard.state = 'investigate';
    guard.stateUntil = gameTime + 8;
  }
  refreshObjective();
  playAlarm();
  showMessage('Alerte au dépôt. Mina t’attend sous le pont; coupe la ligne de vue.', 5);
}

function enterVehicle(): void {
  if (!city.car.available) return;
  vehicleMode = true;
  city.player.group.visible = false;
  city.player.collider.setEnabled(false);
  const playerY = groundHeightAt({ x: city.car.position.x, z: city.car.position.z }) + .9;
  city.player.position.set(city.car.position.x, playerY, city.car.position.z);
  city.player.body.setTranslation({ x: city.car.position.x, y: playerY, z: city.car.position.z }, true);
  showMessage('Véhicule connecté. Lâche l’accélérateur avant de descendre.', 3);
  updateHud();
}

function exitVehicle(): void {
  const forward = new THREE.Vector3(-Math.sin(city.car.yaw), 0, -Math.cos(city.car.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const candidates = [right.clone().multiplyScalar(1.5), right.clone().multiplyScalar(-1.5), forward.clone().multiplyScalar(2.2)];
  for (const offset of candidates) {
    const x = city.car.position.x + offset.x;
    const z = city.car.position.z + offset.z;
    if (!isAreaClear(x, z, .45)) continue;
    city.player.collider.setEnabled(true);
    setPlayerPosition({ x, z });
    city.player.group.visible = true;
    city.player.facing = city.car.yaw;
    vehicleMode = false;
    showMessage('À pied. Le véhicule reste ici.', 2.6);
    updateHud();
    return;
  }
  showMessage('Les deux côtés sont bloqués. Avance un peu pour sortir.', 3);
}

function distance(x: number, z: number, tx: number, tz: number): number {
  return Math.hypot(x - tx, z - tz);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq, 0, 1) : 0;
  return distance(point.x, point.z, start.x + dx * t, start.z + dz * t);
}

function actorPoint(): Point {
  return vehicleMode ? { x: city.car.position.x, z: city.car.position.z } : { x: city.player.position.x, z: city.player.position.z };
}

function isAreaClear(x: number, z: number, radius: number): boolean {
  const floorY = groundHeightAt({ x, z });
  for (const object of city.blockers) {
    if (!object.visible) continue;
    const inspect = (mesh: THREE.Object3D): boolean => {
      if (!(mesh as THREE.Mesh).isMesh || !mesh.visible) return false;
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (bounds.max.y < floorY + .14 || bounds.min.y > floorY + 1.66) return false;
      return x > bounds.min.x - radius && x < bounds.max.x + radius && z > bounds.min.z - radius && z < bounds.max.z + radius;
    };
    if ((object as THREE.Mesh).isMesh ? inspect(object) : (() => { let hit = false; object.traverse((child) => { if (inspect(child)) hit = true; }); return hit; })()) return false;
  }
  return true;
}

function lineOfSight(from: THREE.Vector3, to: THREE.Vector3, padding = .22): boolean {
  tmpVec.subVectors(to, from);
  const length = tmpVec.length();
  if (length < .1) return true;
  rayOrigin.copy(from);
  rayDirection.copy(tmpVec).divideScalar(length);
  city.aimRay.set(rayOrigin, rayDirection);
  city.aimRay.near = .05;
  city.aimRay.far = Math.max(.1, length - padding);
  const hits = city.aimRay.intersectObjects(city.blockers, true);
  return hits.length === 0;
}

function clearFromActor(point: Point, targetHeight = .95): boolean {
  const actor = actorPoint();
  const fromY = groundHeightAt(actor) + (vehicleMode ? 1.02 : 1.1);
  const from = new THREE.Vector3(actor.x, fromY, actor.z);
  const to = new THREE.Vector3(point.x, groundHeightAt(point) + targetHeight, point.z);
  return lineOfSight(from, to);
}

function navCell(point: Point): { x: number; z: number } {
  const grid = city.navGrid;
  return {
    x: THREE.MathUtils.clamp(Math.round((point.x - grid.minX) / grid.step), 0, grid.width - 1),
    z: THREE.MathUtils.clamp(Math.round((point.z - grid.minZ) / grid.step), 0, grid.height - 1),
  };
}

function navPoint(x: number, z: number): Point {
  return { x: city.navGrid.minX + x * city.navGrid.step, z: city.navGrid.minZ + z * city.navGrid.step };
}

function findRoute(start: Point, destination: Point): Point[] {
  const grid = city.navGrid;
  if (!grid.blocked.length) return [destination];
  const count = grid.width * grid.height;
  const index = (x: number, z: number) => z * grid.width + x;
  const seekFree = (cell: { x: number; z: number }, desiredHeight: number): { x: number; z: number } => {
    if (!grid.blocked[index(cell.x, cell.z)] && Math.abs(grid.heights[index(cell.x, cell.z)] - desiredHeight) < 1.6) return cell;
    for (let ring = 1; ring <= 5; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = cell.x + dx;
        const z = cell.z + dz;
        if (x < 0 || z < 0 || x >= grid.width || z >= grid.height) continue;
        if (!grid.blocked[index(x, z)] && Math.abs(grid.heights[index(x, z)] - desiredHeight) < 1.6) return { x, z };
      }
    }
    return cell;
  };
  const source = seekFree(navCell(start), groundHeightAt(start));
  const target = seekFree(navCell(destination), groundHeightAt(destination));
  const startIndex = index(source.x, source.z);
  const goalIndex = index(target.x, target.z);
  if (startIndex === goalIndex) return [destination];
  const g = new Float32Array(count).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const heap: Array<{ index: number; f: number }> = [];
  const push = (node: { index: number; f: number }) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].f <= node.f) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = node;
  };
  const pop = () => {
    const first = heap[0];
    const tail = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
        if (heap[child].f >= tail.f) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = tail;
    }
    return first;
  };
  const heuristic = (x: number, z: number) => {
    const point = navPoint(x, z);
    return Math.hypot(destination.x - point.x, destination.z - point.z);
  };
  g[startIndex] = 0;
  push({ index: startIndex, f: heuristic(source.x, source.z) });
  let visits = 0;
  while (heap.length && visits++ < count) {
    const current = pop();
    if (!current || closed[current.index]) continue;
    if (current.index === goalIndex) break;
    closed[current.index] = 1;
    const cx = current.index % grid.width;
    const cz = Math.floor(current.index / grid.width);
    for (const [dx, dz, scale] of navOffsets) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
      const ni = index(nx, nz);
      if (grid.blocked[ni] || closed[ni]) continue;
      if (Math.abs(grid.heights[current.index] - grid.heights[ni]) > 1.6) continue;
      if (dx && dz && (grid.blocked[index(cx + dx, cz)] || grid.blocked[index(cx, cz + dz)])) continue;
      const cost = g[current.index] + (dx && dz ? scale / 10 : 1);
      if (cost >= g[ni]) continue;
      g[ni] = cost;
      previous[ni] = current.index;
      push({ index: ni, f: cost + heuristic(nx, nz) });
    }
  }
  if (previous[goalIndex] < 0) return [start];
  const cells: number[] = [];
  let cursor = goalIndex;
  while (cursor !== startIndex && cursor >= 0 && cells.length < count) {
    cells.push(cursor);
    cursor = previous[cursor];
  }
  cells.reverse();
  const points = cells.map((i) => navPoint(i % grid.width, Math.floor(i / grid.width)));
  points.push(destination);
  const smoothed: Point[] = [];
  let anchor = start;
  for (let i = 0; i < points.length; i++) {
    if (i === points.length - 1 || !lineOfSight(
      new THREE.Vector3(anchor.x, groundHeightAt(anchor) + .9, anchor.z),
      new THREE.Vector3(points[i + 1].x, groundHeightAt(points[i + 1]) + .9, points[i + 1].z), .08,
    )) {
      smoothed.push(points[i]);
      anchor = points[i];
    }
  }
  return smoothed.length ? smoothed : points;
}

function moveActor(actor: Character, direction: Point, speed: number, dt: number): void {
  const length = Math.hypot(direction.x, direction.z);
  if (length < .001) return;
  actor.walking = true;
  const dx = direction.x / length * speed * dt;
  const dz = direction.z / length * speed * dt;
  const currentFloor = groundHeightAt({ x: actor.position.x, z: actor.position.z });
  const destination = { x: actor.position.x + dx, z: actor.position.z + dz };
  const nextFloor = groundHeightAt(destination);
  actor.controller.computeColliderMovement(actor.collider, { x: dx, y: nextFloor - currentFloor, z: dz });
  const corrected = actor.controller.computedMovement();
  const nextX = actor.position.x + corrected.x;
  const nextZ = actor.position.z + corrected.z;
  const nextY = actor.position.y + corrected.y;
  actor.body.setTranslation({ x: nextX, y: nextY, z: nextZ }, true);
  actor.position.set(nextX, nextY, nextZ);
  actor.facing = Math.atan2(-direction.x, -direction.z);
}

function canSeeTarget(observer: Character, range: number, fovCos: number): boolean {
  if (!observer.alive) return false;
  const target = actorPoint();
  const dx = target.x - observer.position.x;
  const dz = target.z - observer.position.z;
  const length = Math.hypot(dx, dz);
  if (length > range || length < .1) return false;
  const forwardX = -Math.sin(observer.facing);
  const forwardZ = -Math.cos(observer.facing);
  if ((forwardX * dx + forwardZ * dz) / length < fovCos) return false;
  const source = new THREE.Vector3(observer.position.x, observer.position.y + .25, observer.position.z);
  const targetPoint = new THREE.Vector3(target.x, groundHeightAt(target) + (vehicleMode ? .95 : 1.0), target.z);
  return lineOfSight(source, targetPoint, .28);
}

function cameraSeesPlayer(): boolean {
  if (gameTime < cameraDisabledUntil) return false;
  const target = actorPoint();
  const dx = target.x - CAMERA_POINT.x;
  const dz = target.z - CAMERA_POINT.z;
  const length = Math.hypot(dx, dz);
  if (length > 15 || length < .1) return false;
  const yaw = city.cameraUnit.rotation.y;
  const dot = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / length;
  if (dot < Math.cos(.57)) return false;
  return lineOfSight(new THREE.Vector3(CAMERA_POINT.x, groundHeightAt(CAMERA_POINT) + 1.55, CAMERA_POINT.z), new THREE.Vector3(target.x, groundHeightAt(target) + 1, target.z), .2);
}

function securityActive(): boolean {
  return mainState === 'accepted' || mainState === 'chip' || gameTime < violenceAlarmUntil;
}

function chooseGuardTarget(guard: Guard, target: Point): void {
  guard.memory = { ...target };
  guard.state = 'chase';
  guard.stateUntil = gameTime + 10;
  guard.route = [];
  guard.pathClock = 0;
}

function updateGuard(guard: Guard, dt: number, direct: boolean): void {
  if (!guard.alive) return;
  guard.walking = false;
  if (guard.state === 'stunned') {
    if (gameTime < guard.stateUntil) return;
    guard.collider.setEnabled(true);
    guard.state = securityActive() && gameTime - confirmedAt < 10 ? 'chase' : 'search';
    guard.stateUntil = gameTime + 4;
  }
  const target = actorPoint();
  if (direct && securityActive()) chooseGuardTarget(guard, target);

  if (!direct && securityActive() && gameTime - confirmedAt > 10 && (guard.state === 'chase' || guard.state === 'investigate')) {
    guard.state = 'search';
    guard.stateUntil = gameTime + 5;
    guard.route = [];
  }
  if (guard.state === 'search' && gameTime >= guard.stateUntil) {
    guard.state = 'patrol';
    guard.memory = null;
    guard.route = [];
  }

  const decoy = city.decoys.find((entry) => {
    if (!entry.visible) return false;
    const startedAt = entry.userData.started as number;
    const p = entry.position;
    return gameTime - startedAt < 6 && distance(guard.position.x, guard.position.z, p.x, p.z) < 13;
  });
  const alreadyAtDecoy = Boolean(decoy && guard.state === 'investigate' && guard.memory && distance(guard.memory.x, guard.memory.z, decoy.position.x, decoy.position.z) < .5);
  if (decoy && !alreadyAtDecoy && !direct && securityActive() && guard.state !== 'chase') {
    guard.memory = { x: decoy.position.x, z: decoy.position.z };
    guard.state = 'investigate';
    guard.stateUntil = gameTime + 6;
    guard.route = [];
  }

  let destination: Point;
  if (guard.state === 'patrol') {
    destination = guard.patrol[guard.patrolIndex % guard.patrol.length];
  } else if (guard.memory) {
    destination = guard.memory;
  } else {
    destination = guard.patrol[guard.patrolIndex % guard.patrol.length];
  }
  const goalDistance = distance(guard.position.x, guard.position.z, destination.x, destination.z);
  if (guard.state === 'patrol' && goalDistance < .55) {
    guard.patrolIndex = (guard.patrolIndex + 1) % guard.patrol.length;
    destination = guard.patrol[guard.patrolIndex];
    guard.route = [];
  } else if (guard.state === 'investigate' && goalDistance < .7 && gameTime > guard.stateUntil - 4) {
    guard.state = 'search';
    guard.stateUntil = gameTime + 4;
  } else if ((guard.state === 'chase' || guard.state === 'search') && goalDistance < .75 && !direct) {
    if (guard.state === 'chase') {
      guard.state = 'search';
      guard.stateUntil = gameTime + 5;
    }
  }
  if (guard.state === 'search' && guard.memory) {
    guard.facing += Math.sin(gameTime * 2.8 + guard.initial.x) * dt * .6;
    if (gameTime > guard.stateUntil) guard.memory = null;
  }
  if (!guard.memory && guard.state !== 'patrol') {
    guard.state = 'patrol';
    guard.route = [];
    destination = guard.patrol[guard.patrolIndex % guard.patrol.length];
  }
  if (direct && securityActive()) destination = target;

  guard.pathClock -= dt;
  const directRoute = lineOfSight(
    new THREE.Vector3(guard.position.x, guard.position.y + .1, guard.position.z),
    new THREE.Vector3(destination.x, groundHeightAt(destination) + .9, destination.z), .12,
  );
  if (directRoute) {
    guard.route = [destination];
    guard.routeIndex = 0;
  } else if (guard.pathClock <= 0 || !guard.route.length) {
    guard.route = findRoute({ x: guard.position.x, z: guard.position.z }, destination);
    guard.routeIndex = 0;
    guard.pathClock = .7 + Math.random() * .28;
  }
  let waypoint = guard.route[Math.min(guard.routeIndex, Math.max(0, guard.route.length - 1))] ?? destination;
  if (distance(guard.position.x, guard.position.z, waypoint.x, waypoint.z) < .72 && guard.routeIndex < guard.route.length - 1) {
    waypoint = guard.route[++guard.routeIndex];
  }
  const dx = waypoint.x - guard.position.x;
  const dz = waypoint.z - guard.position.z;
  const speed = guard.state === 'chase' ? 2.7 : guard.state === 'investigate' ? 2.2 : guard.state === 'search' ? .75 : 1.25;
  if (Math.hypot(dx, dz) > .12 && !(guard.state === 'search' && goalDistance < .7)) moveActor(guard, { x: dx, z: dz }, speed, dt);

  if (direct && guard.state === 'chase' && gameTime >= guard.attackClock && distance(guard.position.x, guard.position.z, target.x, target.z) < 11) {
    if (lineOfSight(new THREE.Vector3(guard.position.x, guard.position.y + .22, guard.position.z), new THREE.Vector3(target.x, groundHeightAt(target) + 1, target.z), .35)) {
      guard.attackClock = gameTime + 1.45 + Math.random() * .35;
      hitPlayer(7 + Math.random() * 3);
      spawnTrace({ x: guard.position.x, z: guard.position.z }, target, 0xe27672);
    }
  }
  updateActorVisual(guard);
}

function updateSecurity(dt: number): void {
  const active = securityActive();
  city.cameraUnit.rotation.y = Math.PI + Math.sin(gameTime * .34) * .31;
  city.cameraCone.rotation.y = city.cameraUnit.rotation.y;
  const cameraDirect = active && cameraSeesPlayer();
  const guardDirect = city.guards.some((guard) => guard.alive && canSeeTarget(guard, 15, Math.cos(.72)));
  const direct = cameraDirect || guardDirect;
  const wasConfirmed = observed >= 1.05;
  if (direct) {
    observed = Math.min(1.45, observed + dt * .95);
    if (observed >= 1.05) {
      if (!wasConfirmed) playAlarm();
      confirmedAt = gameTime;
      const target = actorPoint();
      for (const guard of city.guards) if (guard.alive) chooseGuardTarget(guard, target);
    }
  } else {
    observed = Math.max(0, observed - dt * .38);
  }
  if (active && cameraDirect) {
    (city.cameraCone.material as THREE.MeshBasicMaterial).color.set(0xff5e74);
    const lens = city.cameraUnit.children[2] as THREE.Mesh;
    lens.material = alertCameraMat;
  } else if (gameTime < cameraDisabledUntil) {
    (city.cameraCone.material as THREE.MeshBasicMaterial).color.set(0x61e5d7);
    const lens = city.cameraUnit.children[2] as THREE.Mesh;
    lens.material = hackedCameraMat;
  } else {
    (city.cameraCone.material as THREE.MeshBasicMaterial).color.copy(cameraConeBase);
    const lens = city.cameraUnit.children[2] as THREE.Mesh;
    lens.material = idleCameraMat;
  }
  for (const guard of city.guards) {
    const directForGuard = active && canSeeTarget(guard, 15, Math.cos(.72));
    updateGuard(guard, dt, directForGuard);
  }
}

function hitPlayer(damage: number): void {
  if (gameTime < invulnerableUntil || !started) return;
  playImpact();
  invulnerableUntil = gameTime + .48;
  city.player.health = Math.max(0, city.player.health - damage);
  lastDamageAt = gameTime;
  damageCount++;
  document.querySelector('#vignette')?.classList.remove('damage-flash');
  void (document.querySelector('#vignette') as HTMLElement).offsetWidth;
  document.querySelector('#vignette')?.classList.add('damage-flash');
  showMessage(vehicleMode ? 'Impact reçu. Dégage de la ligne de tir.' : 'Touché. Coupe la ligne de vue.', 2);
  if (city.player.health <= 0) {
    if (mainState === 'accepted' || mainState === 'chip') showFailure();
    else {
      city.player.health = 100;
      setPlayerPosition(MINA_GARAGE);
      if (vehicleMode) {
        vehicleMode = false;
        city.player.collider.setEnabled(true);
        city.player.group.visible = true;
      }
      showMessage('Tu as perdu connaissance. Réveil au garage; 20 ¢ pour les soins.', 4);
      save.credits = Math.max(0, save.credits - 20);
      persist();
    }
  }
}

function spawnTrace(start: Point, end: Point, color = 0x83f5ed): void {
  const points = [new THREE.Vector3(start.x, groundHeightAt(start) + 1.12, start.z), new THREE.Vector3(end.x, groundHeightAt(end) + .85, end.z)];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .86 }));
  city.scene.add(line);
  liveTraces.push({ line, expires: gameTime + .1 });
}

function hitGuard(guard: Guard, damage: number): void {
  if (!guard.alive) return;
  playImpact();
  guard.health -= damage;
  flashBlood(city, { x: guard.position.x, z: guard.position.z }, gameTime);
  guard.state = 'stunned';
  guard.stateUntil = gameTime + .35;
  const target = actorPoint();
  for (const witness of city.guards) {
    if (witness === guard || !witness.alive) continue;
    if (distance(witness.position.x, witness.position.z, guard.position.x, guard.position.z) < 15) chooseGuardTarget(witness, target);
  }
  // A shot is noisy: the patrol knows the weapon was used even before a clean visual confirm.
  confirmedAt = gameTime;
  observed = Math.max(observed, 1.2);
  violenceAlarmUntil = gameTime + 20;
  if (guard.health <= 0) {
    guard.health = 0;
    guard.alive = false;
    guard.state = 'down';
    guard.group.rotation.x = Math.PI / 2;
    guard.group.position.y = .1;
    flashBlood(city, { x: guard.position.x + .15, z: guard.position.z - .13 }, gameTime);
    showMessage('Vigile neutralisé. Le tir a donné ta position.', 3.5);
  } else {
    showMessage('Impact confirmé. Le dépôt est en alerte.', 2.5);
  }
  hitMarkerUntil = gameTime + .22;
  updateActorVisual(guard);
}

function fireWeapon(): void {
  if (!started || paused || dialogOpen || journalOpen || vehicleMode || gameTime < weaponReadyAt) return;
  weaponReadyAt = gameTime + .24;
  playShot();
  const origin = actorPoint();
  const direction = new THREE.Vector2(aimPoint.x - origin.x, aimPoint.z - origin.z);
  if (direction.lengthSq() < .05) return;
  direction.normalize();
  playerAim.set(direction.x, 0, direction.y).normalize();
  city.player.facing = Math.atan2(-direction.x, -direction.y);
  const candidates: Array<{ guard: Guard; along: number; error: number }> = [];
  for (const guard of city.guards) {
    if (!guard.alive) continue;
    const dx = guard.position.x - origin.x;
    const dz = guard.position.z - origin.z;
    const along = dx * direction.x + dz * direction.y;
    const error = Math.abs(dx * direction.y - dz * direction.x);
    if (along > .4 && along < 16 && error < .64 && lineOfSight(new THREE.Vector3(origin.x, groundHeightAt(origin) + 1.12, origin.z), new THREE.Vector3(guard.position.x, groundHeightAt(guard.position) + 1, guard.position.z), .15)) {
      candidates.push({ guard, along, error });
    }
  }
  candidates.sort((a, b) => a.along - b.along || a.error - b.error);
  if (candidates.length) {
    const victim = candidates[0].guard;
    spawnTrace(origin, { x: victim.position.x, z: victim.position.z });
    hitGuard(victim, 36);
  } else {
    spawnTrace(origin, { x: aimPoint.x, z: aimPoint.z });
    showMessage('Le coup de feu résonne dans la cour.', 2);
    const heard = city.guards.filter((guard) => guard.alive && distance(guard.position.x, guard.position.z, origin.x, origin.z) < 20);
    const witnessed = cameraSeesPlayer() || city.guards.some((guard) => guard.alive && canSeeTarget(guard, 15, Math.cos(.72)));
    if (witnessed) {
      violenceAlarmUntil = gameTime + 20;
      confirmedAt = gameTime;
      observed = Math.max(observed, 1.2);
      for (const guard of heard) chooseGuardTarget(guard, origin);
      showMessage('Tir identifié. Les vigiles connaissent ta position.', 3);
    } else if (securityActive()) {
      for (const guard of heard) {
        guard.memory = { ...origin };
        guard.state = 'investigate';
        guard.stateUntil = gameTime + 4;
        guard.route = [];
      }
    }
  }
}

function useImplant(slot: 0 | 1): void {
  if (!started || paused || dialogOpen || journalOpen) return;
  const implant = save.equippedImplants[slot];
  const readyAt = implantReadyAt[slot];
  if (gameTime < readyAt) {
    showMessage(`${IMPLANT_NAMES[implant]} recharge dans ${(readyAt - gameTime).toFixed(1)} s.`, 2);
    return;
  }
  const player = actorPoint();
  if (implant === 'intrusion') {
    const gateDistance = distance(player.x, player.z, GATE_POINT.x, GATE_POINT.z);
    const cameraDistance = distance(player.x, player.z, CAMERA_POINT.x, CAMERA_POINT.z);
    if (mainState === 'accepted' && gateDistance < 4 && city.gateMesh.visible) {
      setGate(true);
      implantReadyAt[slot] = gameTime + 16;
      playImplant();
      showMessage('Grille déverrouillée. La cour mène au quai.', 3.3);
    } else if (mainState === 'accepted' && cameraDistance < 12 && gameTime >= cameraDisabledUntil) {
      cameraDisabledUntil = gameTime + 12;
      implantReadyAt[slot] = gameTime + 16;
      playImplant();
      showMessage('Caméra coupée pour douze secondes.', 3);
    } else {
      showMessage('Aucun accès compatible à portée. Approche une grille ou une caméra.', 2.8);
    }
    return;
  }
  if (implant === 'leurre') {
    const point = { x: aimPoint.x, z: aimPoint.z };
    const range = distance(player.x, player.z, point.x, point.z);
    if (range < 1.2 || range > 20 || !Number.isFinite(point.x + point.z)) {
      showMessage('Vise un point au sol à moins de vingt mètres.', 2.5);
      return;
    }
    const decoy = city.decoys.find((entry) => !entry.visible) ?? city.decoys[0];
    decoy.position.set(point.x, groundHeightAt(point), point.z);
    decoy.userData.started = gameTime;
    decoy.visible = true;
    implantReadyAt[slot] = gameTime + 13;
    playImplant();
    showMessage('Leurre lancé. Un vigile proche va vérifier le signal.', 3);
    return;
  }
  const nearest = city.guards.filter((guard) => guard.alive)
    .sort((a, b) => distance(a.position.x, a.position.z, player.x, player.z) - distance(b.position.x, b.position.z, player.x, player.z))[0];
  if (nearest && distance(nearest.position.x, nearest.position.z, player.x, player.z) < 5.5 && lineOfSight(new THREE.Vector3(player.x, 1, player.z), new THREE.Vector3(nearest.position.x, 1, nearest.position.z))) {
    nearest.state = 'stunned';
    nearest.stateUntil = gameTime + 4.5;
    implantReadyAt[slot] = gameTime + 18;
    playImplant();
    showMessage('Vigile immobilisé. Son implant vient d’émettre une alerte.', 3.3);
    if (securityActive()) {
      confirmedAt = gameTime;
      for (const guard of city.guards) if (guard !== nearest && guard.alive) chooseGuardTarget(guard, player);
    }
  } else {
    showMessage('Aucune cible à portée de Surcharge.', 2.5);
  }
}

function updateVehicle(dt: number): void {
  const car = city.car;
  const previousContacts = car.contactHandles;
  const accelerate = pressed.has('KeyW') || pressed.has('KeyZ') || pressed.has('ArrowUp');
  const brake = pressed.has('KeyS') || pressed.has('ArrowDown');
  const left = pressed.has('KeyA') || pressed.has('KeyQ') || pressed.has('ArrowLeft');
  const right = pressed.has('KeyD') || pressed.has('ArrowRight');
  if (accelerate) car.speed = Math.min(9.1, car.speed + 8.6 * dt);
  if (brake) {
    if (car.speed > .25) car.speed = Math.max(0, car.speed - 17 * dt);
    else car.speed = Math.max(-4.1, car.speed - 5.8 * dt);
  }
  if (!accelerate && !brake) car.speed = Math.abs(car.speed) < .1 ? 0 : car.speed - Math.sign(car.speed) * Math.min(Math.abs(car.speed), 1.75 * dt);
  const steering = (right ? 1 : 0) - (left ? 1 : 0);
  if (steering) car.yaw += steering * Math.min(1, Math.abs(car.speed) / 2.2) * 1.6 * dt * (car.speed >= 0 ? 1 : -1);
  const forward = new THREE.Vector3(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
  const desired = { x: forward.x * car.speed * dt, z: forward.z * car.speed * dt };
  const intendedEnd = { x: car.position.x + desired.x, z: car.position.z + desired.z };
  const impactSpeed = Math.abs(car.speed);
  type ImpactTarget = { kind: 'guard' | 'citizen' | 'traffic'; entity: typeof city.guards[number] | typeof city.citizens[number] | typeof city.traffic[number]; range: number };
  const candidates: ImpactTarget[] = impactSpeed > .01 ? [
    ...city.guards.filter((guard) => guard.alive).map((entity) => ({ kind: 'guard' as const, entity, range: 1.95 })),
    ...city.citizens.filter((person) => person.alive).map((entity) => ({ kind: 'citizen' as const, entity, range: 1.9 })),
    ...city.traffic.filter((traffic) => traffic.collider.isEnabled()).map((entity) => ({ kind: 'traffic' as const, entity, range: 2.5 })),
  ] : [];
  const impactTarget = candidates
    .map((candidate) => ({ candidate, distance: distanceToSegment(candidate.entity.position, { x: car.position.x, z: car.position.z }, intendedEnd) }))
    .filter((entry) => entry.distance < entry.candidate.range && !previousContacts.has(entry.candidate.entity.collider.handle))
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
  impactTarget?.entity.collider.setEnabled(false);
  const currentFloor = groundHeightAt({ x: car.position.x, z: car.position.z });
  const nextFloor = groundHeightAt(intendedEnd);
  car.controller.computeColliderMovement(car.collider, { x: desired.x, y: nextFloor - currentFloor, z: desired.z });
  const moved = car.controller.computedMovement();
  const contacts = new Set<number>();
  let freshImpact: THREE.Vector3 | null = null;
  const collision = Math.hypot(moved.x - desired.x, moved.z - desired.z) > .001;
  if (collision) {
    for (let i = 0; i < car.controller.numComputedCollisions(); i++) {
      const contact = car.controller.computedCollision(i);
      const collider = contact?.collider;
      if (!contact || !collider) continue;
      contacts.add(collider.handle);
      if (previousContacts.has(collider.handle) || impactSpeed < .01) continue;
      freshImpact ??= new THREE.Vector3(contact.witness1.x, contact.witness1.y, contact.witness1.z);
      showVehicleDamageAt(car, new THREE.Vector3(contact.witness1.x, contact.witness1.y, contact.witness1.z), impactSpeed);
      const prop = city.breakables.find((entry) => entry.collider.handle === collider.handle && !entry.broken);
      if (prop) {
        prop.durability -= impactSpeed;
        prop.mesh.rotation.z += Math.sign(desired.x + desired.z || 1) * Math.min(.18, .04 + impactSpeed * .022);
        prop.mesh.position.y += Math.min(.035, impactSpeed * .008);
        if (prop.durability <= 0) {
          prop.broken = true;
          prop.collider.setEnabled(false);
          prop.mesh.rotation.z = Math.sign(desired.x + desired.z || 1) * .72;
          prop.mesh.position.y += .22;
          showMessage(prop.kind === 'crate' ? 'La caisse éclate sous le choc.' : 'La borne est arrachée.', 2.2);
        }
      }
    }
    car.speed *= .16;
    if (impactSpeed >= 5.4) hitPlayer(Math.min(9, Math.round((impactSpeed - 4.5) * .8)));
    if (!freshImpact && impactSpeed > 2.5) showMessage('La carrosserie heurte un obstacle.', 1.5);
  } else {
    contacts.clear();
  }
  car.position.x += moved.x;
  car.position.z += moved.z;
  const floorY = groundHeightAt({ x: car.position.x, z: car.position.z });
  car.position.y = floorY + .57;
  car.body.setTranslation({ x: car.position.x, y: car.position.y, z: car.position.z }, true);
  car.body.setRotation({ x: 0, y: Math.sin(car.yaw / 2), z: 0, w: Math.cos(car.yaw / 2) }, true);
  car.group.position.set(car.position.x, floorY, car.position.z);
  car.group.rotation.y = car.yaw;
  const playerY = floorY + .9;
  city.player.position.set(car.position.x, playerY, car.position.z);
  city.player.body.setTranslation({ x: car.position.x, y: playerY, z: car.position.z }, true);
  city.player.facing = car.yaw;
  const targetReached = impactTarget && distance(car.position.x, car.position.z, impactTarget.entity.position.x, impactTarget.entity.position.z) < impactTarget.range + .3;
  if (impactTarget && !targetReached) impactTarget.entity.collider.setEnabled(true);
  if (targetReached && impactTarget) {
    const severity = impactSpeed;
    const contactPoint = new THREE.Vector3(impactTarget.entity.position.x, floorY + .56, impactTarget.entity.position.z);
    showVehicleDamageAt(car, contactPoint, severity);
    if (impactTarget.kind === 'traffic') {
      const other = impactTarget.entity as typeof city.traffic[number];
      other.collider.setEnabled(true);
      showVehicleDamageAt(other, contactPoint, severity);
      other.speed *= .28;
      other.pauseUntil = gameTime + 1.2;
    } else if (impactTarget.kind === 'guard') {
      const guard = impactTarget.entity as typeof city.guards[number];
      guard.health = Math.max(0, guard.health - severity * 10);
      guard.state = severity > 6 ? 'down' : 'stunned';
      guard.alive = guard.health > 0;
      guard.stateUntil = gameTime + 2.5;
      guard.collider.setEnabled(false);
      guard.position.x += forward.x * 1.05;
      guard.position.z += forward.z * 1.05;
      guard.position.y = groundHeightAt(guard.position) + .9;
      guard.body.setTranslation({ x: guard.position.x, y: guard.position.y, z: guard.position.z }, true);
      if (severity > 5) flashBlood(city, { x: guard.position.x, z: guard.position.z }, gameTime);
      if (!guard.alive) guard.group.rotation.x = Math.PI / 2;
      else guard.collider.setEnabled(true);
      updateActorVisual(guard);
    } else {
      const citizen = impactTarget.entity as typeof city.citizens[number];
      citizen.startledUntil = gameTime + 7;
      citizen.panicTarget = citizen.route.reduce((best, point) =>
        distance(point.x, point.z, car.position.x, car.position.z) > distance(best.x, best.z, car.position.x, car.position.z) ? point : best,
      citizen.route[0]);
      if (severity > 6) {
        citizen.alive = false;
        citizen.fallenUntil = gameTime + 8;
        citizen.collider.setEnabled(false);
        citizen.group.rotation.x = Math.PI / 2;
        flashBlood(city, citizen.position, gameTime);
      } else {
        citizen.collider.setEnabled(true);
        citizen.position.x += forward.x * .9;
        citizen.position.z += forward.z * .9;
        citizen.body.setTranslation({ x: citizen.position.x, y: groundHeightAt(citizen.position) + .9, z: citizen.position.z }, true);
      }
    }
    confirmedAt = gameTime;
    observed = Math.max(observed, .9);
    violenceAlarmUntil = gameTime + 20;
    car.speed *= .42;
    showMessage(severity > 5 ? 'Choc grave. Les vigiles et les passants réagissent.' : 'Collision. Les passants s’écartent.', 3);
    contacts.add(impactTarget.entity.collider.handle);
  }
  const nearbyActors: Array<{ entity: Character | typeof city.citizens[number] | typeof city.traffic[number]; range: number }> = [
    ...city.guards.map((entity) => ({ entity, range: 2.45 })),
    ...city.citizens.map((entity) => ({ entity, range: 2.4 })),
    ...city.traffic.map((entity) => ({ entity, range: 3 })),
  ];
  for (const { entity, range } of nearbyActors) {
    if (previousContacts.has(entity.collider.handle) && distance(car.position.x, car.position.z, entity.position.x, entity.position.z) < range) {
      contacts.add(entity.collider.handle);
    }
  }
  car.contactHandles = contacts;
}

function fixedUpdate(dt: number): void {
  gameTime += dt;
  const fleeingAlarm = observed >= .72 || gameTime < violenceAlarmUntil || mainState === 'chip' && gameTime - confirmedAt < 12;
  const activityPhase = updateForgesLife(city, dt, gameTime, actorPoint(), fleeingAlarm);
  if (previousActivityPhase >= 0 && activityPhase !== previousActivityPhase) {
    showMessage(['Le matin reprend aux Forges.', 'Les ateliers tournent à plein régime.', 'La nuit retombe sur le quartier.'][activityPhase], 3.2);
  }
  previousActivityPhase = activityPhase;
  if (!vehicleMode) {
    const x = Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('KeyQ') || pressed.has('ArrowLeft'));
    const z = Number(pressed.has('KeyS') || pressed.has('ArrowDown')) - Number(pressed.has('KeyW') || pressed.has('KeyZ') || pressed.has('ArrowUp'));
    city.player.walking = Boolean(x || z);
    if (x || z) moveActor(city.player, { x, z }, 4.4, dt);
    const dx = aimPoint.x - city.player.position.x;
    const dz = aimPoint.z - city.player.position.z;
    if (Math.hypot(dx, dz) > .1) city.player.facing = Math.atan2(-dx, -dz);
    updateActorVisual(city.player);
  } else {
    updateVehicle(dt);
  }
  updateSecurity(dt);
  physics.step();
}

function updateCamera(dt: number): void {
  const active = actorPoint();
  const velocityLead = vehicleMode
    ? new THREE.Vector3(-Math.sin(city.car.yaw), 0, -Math.cos(city.car.yaw)).multiplyScalar(Math.min(3.2, Math.abs(city.car.speed) * .35) * Math.sign(city.car.speed || 1))
    : playerAim.clone().multiplyScalar(.55);
  const targetX = active.x + velocityLead.x;
  const targetZ = active.z + velocityLead.z;
  const currentLook = city.camera.position.clone().add(new THREE.Vector3(0, -51, -31));
  const ease = 1 - Math.exp(-dt * 3.5);
  const lookX = THREE.MathUtils.lerp(currentLook.x, targetX, ease);
  const lookZ = THREE.MathUtils.lerp(currentLook.z, targetZ, ease);
  const lookY = THREE.MathUtils.lerp(currentLook.y, groundHeightAt(active), ease);
  city.camera.position.set(lookX, lookY + 51, lookZ + 31);
  city.camera.lookAt(lookX, lookY, lookZ);
}

function updateCutaways(): void {
  const actor = actorPoint();
  for (const building of city.buildings) {
    const near = Math.abs(actor.x - building.x) < building.width / 2 + 1.2 && Math.abs(actor.z - building.z) < building.depth / 2 + 1.2;
    const material = building.roof.material as THREE.MeshStandardMaterial;
    const nextOpacity = near ? .16 : 1;
    if (material.opacity !== nextOpacity) {
      material.transparent = near;
      material.opacity = nextOpacity;
      material.depthWrite = !near;
      material.needsUpdate = true;
    }
  }
  const underRailTunnel = actor.x > 120 && actor.x < 130 && actor.z > 69 && actor.z < 92;
  const deckMaterial = city.railDeck.material as THREE.MeshStandardMaterial;
  const deckOpacity = underRailTunnel ? .14 : 1;
  if (deckMaterial.opacity !== deckOpacity) {
    deckMaterial.transparent = underRailTunnel;
    deckMaterial.opacity = deckOpacity;
    deckMaterial.depthWrite = !underRailTunnel;
    deckMaterial.needsUpdate = true;
  }
}

function updateInteraction(): void {
  if (!started) return;
  const actor = actorPoint();
  let key = 'J';
  let label = 'JOURNAL';
  let text = 'Voir les pistes';
  if (vehicleMode) {
    key = 'E';
    label = 'VÉHICULE';
    text = Math.abs(city.car.speed) > 2.1 ? 'Ralentir pour descendre' : 'Descendre du véhicule';
  } else if (mainState === 'chip' && distance(actor.x, actor.z, HANDOFF.x, HANDOFF.z) < 3.2) {
    key = 'E';
    const cleanFor = gameTime - Math.max(chipTakenAt, confirmedAt);
    if (vehicleMode) {
      label = 'REMISE BLOQUÉE';
      text = 'Descends du véhicule';
    } else if (cleanFor < 5) {
      label = observed > .08 ? 'DÉTECTION DIRECTE' : 'SE FAIRE OUBLIER';
      text = observed > .08 ? 'Couper la ligne de vue' : `Attendre ${Math.max(0, 5 - cleanFor).toFixed(1)} s`;
    } else {
      label = 'CONTACT';
      text = 'Remettre la puce à Mina';
    }
  } else if (save.secondaryStage === 1 && city.secondaryPackage.visible && distance(actor.x, actor.z, PACKAGE.x, PACKAGE.z) < 2.1) {
    key = 'E'; label = 'U01 · MODULE'; text = 'Prendre le module';
  } else if (save.secondaryStage === 2 && distance(actor.x, actor.z, SERVICE_PANEL_POINT.x, SERVICE_PANEL_POINT.z) < 3) {
    key = 'E'; label = 'U01 · PANNEAU'; text = 'Rétablir les lampes';
  } else if (mainState === 'accepted' && city.chip.visible && distance(actor.x, actor.z, DEPOT.x, DEPOT.z) < 2.1) {
    key = 'E'; label = 'OBJECTIF'; text = 'Prendre la puce';
  } else if (distance(actor.x, actor.z, city.mina.position.x, city.mina.position.z) < 2.8 && (mainState === 'available' || save.secondaryUnlocked && save.secondaryStage === 0 && !save.sideRewardPaid)) {
    key = 'E'; label = 'CONTACT'; text = mainState === 'available' ? 'Écouter Mina' : 'Nouvelle quête · Mina';
  } else if (!vehicleMode && city.car.available && distance(actor.x, actor.z, city.car.position.x, city.car.position.z) < 3.2) {
    key = 'E'; label = 'VÉHICULE'; text = 'Prendre le volant';
  } else if (distance(actor.x, actor.z, city.mina.position.x, city.mina.position.z) < 3 || distance(actor.x, actor.z, MINA_GARAGE.x, MINA_GARAGE.z) < 3.2 && mainState !== 'chip') {
    key = 'E'; label = 'CONTACT'; text = mainState === 'available' ? 'Écouter Mina' : 'Parler à Mina';
  } else if (mainState === 'accepted' && city.gateMesh.visible && distance(actor.x, actor.z, GATE_POINT.x, GATE_POINT.z) < 4.4) {
    key = 'R'; label = 'INTRUSION'; text = save.equippedImplants.includes('intrusion') ? 'Ouvrir la grille' : 'Équiper Intrusion au garage';
  } else if (mainState === 'accepted' && gameTime >= cameraDisabledUntil && distance(actor.x, actor.z, CAMERA_POINT.x, CAMERA_POINT.z) < 10) {
    key = 'R'; label = 'INTRUSION'; text = 'Couper la caméra';
  }
  interactionKey.textContent = key;
  interactionLabel.textContent = label;
  interactionText.textContent = text;
}

function updateHud(): void {
  if (!city) return;
  refreshObjective();
  const health = Math.max(0, Math.round(city.player.health));
  healthValue.textContent = String(health);
  healthBar.style.width = `${health}%`;
  healthBar.style.background = health < 30 ? 'linear-gradient(90deg,#ed6470,#d8374d)' : 'linear-gradient(90deg,#6dd9c3,#d5d682)';
  cashValue.textContent = `${save.credits} ¢`;
  const implants = save.equippedImplants;
  $('#implant-one b').textContent = IMPLANT_NAMES[implants[0]];
  $('#implant-two b').textContent = IMPLANT_NAMES[implants[1]];
  $('#implant-one small').textContent = implants[0] === 'intrusion' ? 'grille · caméra' : implants[0] === 'leurre' ? 'signal projeté' : 'cible proche';
  $('#implant-two small').textContent = implants[1] === 'intrusion' ? 'grille · caméra' : implants[1] === 'leurre' ? 'signal projeté' : 'cible proche';
  const cooldownOne = $('#cooldown-one');
  const cooldownTwo = $('#cooldown-two');
  cooldownOne.textContent = implantReadyAt[0] > gameTime ? `${(implantReadyAt[0] - gameTime).toFixed(0)} s` : 'PRÊT';
  cooldownTwo.textContent = implantReadyAt[1] > gameTime ? `${(implantReadyAt[1] - gameTime).toFixed(0)} s` : 'PRÊT';
  const alert = observed > .04
    ? observed >= 1.05 ? 'Repéré · poursuite' : `Observé · ${Math.round(Math.min(1, observed / 1.05) * 100)}%`
    : securityActive() && gameTime - confirmedAt < 10 ? 'Dernière position connue' : 'Hors surveillance';
  alertText.textContent = alert;
  alertPill.classList.toggle('observed', observed > .04 && observed < 1.05);
  alertPill.classList.toggle('confirmed', observed >= 1.05 || securityActive() && gameTime - confirmedAt < 4);
  const timeLabel = $('#district-time');
  if (timeLabel) timeLabel.textContent = `LES FORGES · ${['AUBE', 'JOUR', 'NUIT'][Math.max(0, city.activityPhase)]}`;
  if (messageUntil > gameTime) messageLine.textContent = lastMessage;
  else messageLine.textContent = vehicleMode ? `VITESSE ${Math.abs(city.car.speed * 12).toFixed(0)} KM/H` : '';
  updateInteraction();
}

function mapPoint(point: Point, size: number): { x: number; y: number } {
  const border = 8;
  const extent = size - border * 2;
  return { x: border + point.x / FORGES.width * extent, y: border + point.z / FORGES.depth * extent };
}

function drawMap(): void {
  const ctx = mapContext;
  const size = canvasMap.width;
  const margin = 8;
  const extent = size - margin * 2;
  const scaleX = extent / FORGES.width;
  const scaleZ = extent / FORGES.depth;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#16211f';
  ctx.fillRect(0, 0, size, size);
  const xy = (x: number, z: number) => mapPoint({ x, z }, size);
  ctx.fillStyle = '#343a35';
  ctx.fillRect(margin, margin, extent, 68 * scaleZ);
  ctx.fillStyle = 'rgba(6,12,15,.94)';
  ctx.fillRect(margin, xy(0, 70).y, extent, 8 * scaleZ);
  ctx.fillStyle = '#838c83';
  for (const z of [71.6, 75.5]) {
    ctx.fillRect(margin, xy(0, z).y - .7, extent, 1.4);
  }
  ctx.strokeStyle = '#67706b';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const route of ROAD_ROUTES) {
    ctx.beginPath();
    route.points.forEach((point, index) => {
      const p = xy(point.x, point.z);
      if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.lineWidth = Math.max(1.5, route.width * scaleX);
    ctx.stroke();
  }
  ctx.fillStyle = '#56615c';
  for (const building of city.buildings) {
    const pos = xy(building.x, building.z);
    ctx.fillRect(pos.x - building.width * scaleX / 2, pos.y - building.depth * scaleZ / 2, building.width * scaleX, building.depth * scaleZ);
  }
  const depot = city.buildingsByName.get('Dépôt logistique');
  if (depot) {
    const pos = xy(depot.x, depot.z);
    ctx.strokeStyle = mainState === 'accepted' ? '#e7b56d' : '#718887';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pos.x - depot.width * scaleX / 2, pos.y - depot.depth * scaleZ / 2, depot.width * scaleX, depot.depth * scaleZ);
  }
  ctx.strokeStyle = 'rgba(196,222,215,.12)';
  ctx.lineWidth = .7;
  for (let x = 0; x < size; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
  const actor = actorPoint();
  if (objectivePoint) {
    const obj = mapPoint(objectivePoint, size);
    ctx.beginPath(); ctx.strokeStyle = '#f1b66c'; ctx.lineWidth = 1.2; ctx.setLineDash([2.2, 2.1]);
    ctx.moveTo(actor.x === undefined ? obj.x : mapPoint(actor, size).x, mapPoint(actor, size).y); ctx.lineTo(obj.x, obj.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.fillStyle = '#f1b66c'; ctx.arc(obj.x, obj.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  const minaPoint = mapPoint({ x: city.mina.position.x, z: city.mina.position.z }, size);
  ctx.fillStyle = '#e6849a'; ctx.beginPath(); ctx.arc(minaPoint.x, minaPoint.y, 2.7, 0, Math.PI * 2); ctx.fill();
  for (const citizen of city.citizens) {
    if (!citizen.alive) continue;
    const person = mapPoint(citizen.position, size);
    ctx.fillStyle = gameTime < citizen.startledUntil ? '#efb77a' : 'rgba(202,215,188,.6)';
    ctx.beginPath(); ctx.arc(person.x, person.y, 1.15, 0, Math.PI * 2); ctx.fill();
  }
  if (securityActive()) {
    ctx.fillStyle = '#ea7180';
    for (const guard of city.guards) {
      if (!guard.alive) continue;
      const pos = mapPoint({ x: guard.position.x, z: guard.position.z }, size);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 2.7, 0, Math.PI * 2); ctx.fill();
    }
    if (gameTime >= cameraDisabledUntil) {
      const cam = mapPoint(CAMERA_POINT, size);
      ctx.strokeStyle = '#e86f80'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cam.x, cam.y, 4, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (city.car.available) {
    const car = mapPoint({ x: city.car.position.x, z: city.car.position.z }, size);
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(city.car.yaw);
    ctx.fillStyle = vehicleMode ? '#d4ffff' : '#60c8ca'; ctx.fillRect(-2.2, -3.4, 4.4, 6.8); ctx.restore();
  }
  for (const traffic of city.traffic) {
    const pos = mapPoint({ x: traffic.position.x, z: traffic.position.z }, size);
    ctx.fillStyle = '#c89d68'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  const player = mapPoint(actor, size);
  const angle = vehicleMode ? city.car.yaw : city.player.facing;
  ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(angle);
  ctx.fillStyle = '#e7fffa'; ctx.beginPath(); ctx.moveTo(0, -4.4); ctx.lineTo(3.3, 3.3); ctx.lineTo(-3.3, 3.3); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(112,228,229,.3)'; ctx.lineWidth = 1; ctx.strokeRect(margin, margin, extent, extent);
}

function pointerMove(event: PointerEvent | MouseEvent): void {
  if (!city) return;
  const rect = city.renderer.domElement.getBoundingClientRect();
  mouse = { x: event.clientX, y: event.clientY };
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  city.aimRay.setFromCamera(pointerNdc, city.camera);
  city.floorPlane.constant = -groundHeightAt(actorPoint());
  if (city.aimRay.ray.intersectPlane(city.floorPlane, aimPlanePoint)) {
    aimPoint.copy(aimPlanePoint);
    const actor = actorPoint();
    const dx = aimPoint.x - actor.x;
    const dz = aimPoint.z - actor.z;
    if (Math.hypot(dx, dz) > 1) playerAim.set(dx, 0, dz).normalize();
  }
  aimReticle.style.left = `${event.clientX}px`;
  aimReticle.style.top = `${event.clientY}px`;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code === 'Escape') {
    event.preventDefault();
    if (dialogOpen) closeDialog();
    else if (journalOpen) closeJournal();
    else if (paused) closePause();
    else openPause();
    return;
  }
  if (event.code === 'KeyM' && started && !paused && !dialogOpen && !journalOpen) {
    const enabled = toggleSound();
    showMessage(enabled ? 'Son activé.' : 'Son coupé.', 1.8);
    return;
  }
  if (!started || paused || dialogOpen || journalOpen) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  pressed.add(event.code);
  if (event.code === 'KeyE') interact();
  if (event.code === 'KeyR') useImplant(0);
  if (event.code === 'KeyF') useImplant(1);
  if (event.code === 'KeyJ') showJournal();
}

function onKeyUp(event: KeyboardEvent): void {
  pressed.delete(event.code);
}

function setupInput(): void {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    pressed.clear();
    if (started && !dialogOpen && !journalOpen) {
      paused = true;
      pauseLayer.classList.remove('hidden');
      pauseActions.replaceChildren();
      const resume = document.createElement('button');
      resume.className = 'action-button primary';
      resume.textContent = 'Reprendre';
      resume.addEventListener('click', closePause);
      pauseActions.append(resume);
    }
  });
  window.addEventListener('focus', () => {
    if (paused && !dialogOpen && !document.hidden) closePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pressed.clear();
      if (started && !dialogOpen && !journalOpen) {
        paused = true;
        pauseLayer.classList.remove('hidden');
        pauseActions.replaceChildren();
      }
    } else if (paused && !dialogOpen && pauseActions.querySelectorAll('button').length === 0) closePause();
  });
  $('#dialog-close').addEventListener('click', closeDialog);
  $('#journal-close').addEventListener('click', closeJournal);
  $('#play-button').addEventListener('click', () => {
    startSoundscape();
    started = true;
    menuBeforeStart = false;
    bootScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    refreshObjective();
    updateHud();
    showMessage('Quitte le garage, parle à Mina ou prends la voiture.', 4);
    city.renderer.domElement.focus();
  });
}

function updateFrame(now: number): void {
  const dt = Math.min(.05, Math.max(0, (now - previousFrame) / 1000 || 0));
  previousFrame = now;
  if (started && !paused && !dialogOpen && !journalOpen) {
    accumulator += dt;
    while (accumulator >= STEP) {
      fixedUpdate(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  const elapsed = started && !paused && !dialogOpen && !journalOpen ? dt : 0;
  if (started) updateCamera(Math.max(elapsed, .005));
  objectiveMarker.visible = Boolean(objectivePoint) && started && !dialogOpen && !journalOpen;
  if (objectiveMarker.visible) {
    const pulse = .96 + Math.sin(now * .003) * .08;
    markerDisc.scale.setScalar(pulse);
    markerCrown.rotation.y = now * .0015;
  }
  animateEffects(city, dt, gameTime);
  updateCutaways();
  for (const entry of liveTraces) {
    if (gameTime > entry.expires) {
      city.scene.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
      liveTraces.splice(liveTraces.indexOf(entry), 1);
    }
  }
  if (gameTime >= traceExpires && trace) {
    trace.visible = false;
  }
  city.renderer.render(city.scene, city.camera);
  interfaceClock += dt;
  if (interfaceClock >= .12) {
    interfaceClock = 0;
    updateHud();
    if (started) drawMap();
  }
  requestAnimationFrame(updateFrame);
}

async function initialize(): Promise<void> {
  setupInput();
  playButton.querySelector('.button-label')!.textContent = 'Chargement de la ville';
  try {
    await RAPIER.init();
    physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    physics.timestep = STEP;
    city = buildCity($('#world'), physics);
    city.scene.add(objectiveMarker);
    city.scene.add(bulletPoints);
    city.secondaryPackage.visible = save.secondaryStage === 1;
    if (save.sideRewardPaid) {
      const panelLamp = city.servicePanel.userData.lamp as THREE.Mesh;
      (panelLamp.material as THREE.MeshStandardMaterial).color.set(0x7ce5bb);
      (panelLamp.material as THREE.MeshStandardMaterial).emissive.set(0x2da676);
      (panelLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2;
    }
    city.chip.visible = !save.mainComplete;
    city.player.health = 100;
    if (save.shortcutOpen) setShortcut(true);
    refreshObjective();
    resizeCity(city, window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => resizeCity(city, window.innerWidth, window.innerHeight));
    city.renderer.domElement.addEventListener('pointermove', pointerMove);
    city.renderer.domElement.addEventListener('pointerdown', (event) => {
      pointerMove(event);
      if (event.button === 0) fireWeapon();
    });
    city.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    city.renderer.domElement.tabIndex = 0;
    city.renderer.domElement.style.cursor = 'none';
    playButton.disabled = false;
    playButton.querySelector('.button-label')!.textContent = 'Entrer dans Les Forges';
    previousFrame = performance.now();
    requestAnimationFrame(updateFrame);
  } catch (error) {
    console.error(error);
    playButton.disabled = true;
    playButton.querySelector('.button-label')!.textContent = 'Impossible de charger la ville';
    const copy = document.querySelector('.boot-copy');
    if (copy) copy.innerHTML = 'Rapier ou WebGL n’a pas pu démarrer.<br />Ouvre cette démo dans un navigateur compatible.';
  }
}

void initialize();
