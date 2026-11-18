import R from '@dimforge/rapier3d-compat';
import './style.css';
import { Game, type Menu, type Pin } from './game';
import { blocks, buildings, clamp, distance, districtAt, districtNames, gates, roads, walls, type Point, type Rect } from './level';
import { effects, implants, objectives, type Ending, type Implant, type Route } from './progression';

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const viewport = get<HTMLCanvasElement>('viewport');
const overlay = get('overlay'), dialog = get('dialog'), title = get('title'), hud = get('hud');
const play = get<HTMLButtonElement>('play');
const newGameButton = get<HTMLButtonElement>('new-game');
const body = get('dialog-body'), actions = get('dialog-actions'), close = get<HTMLButtonElement>('close');
const map = get<HTMLCanvasElement>('minimap'), ctx = map.getContext('2d')!;
const pins = get('waypoints');
const crosshair = get('crosshair');
const slots = [get('slot-1'), get('slot-2')];
const shade = document.querySelector<HTMLElement>('.vignette')!;
const moveKeys = new Set(['w','a','s','d','z','q','arrowup','arrowdown','arrowleft','arrowright','shift',' ']);
let game: Game | undefined;
let current: Menu | 'pause' | 'journal' | 'help' | 'restart' | null = null;
let previousFocus: HTMLElement | null = null;
let lastMap = 0;
let lastHud = 0;
const markerElements: HTMLElement[] = [];
const observerLabels = { camera: 'Caméra', guard: 'Vigile', drone: 'Drone' };

function show(kicker: string, heading: string, copy: string, isLocked = false) {
  if (overlay.hidden) previousFocus = document.activeElement as HTMLElement | null;
  game?.pause(true);
  get('dialog-kicker').textContent = kicker;
  get('dialog-title').textContent = heading;
  body.innerHTML = copy;
  actions.replaceChildren();
  actions.classList.remove('grid');
  close.hidden = isLocked;
  overlay.hidden = false;
  title.inert = true;
  hud.inert = true;
  dialog.scrollTop = 0;
  queueMicrotask(() => (close.hidden ? actions.querySelector('button') : close)?.focus());
}
function leave() {
  if (current === 'failed') return;
  current = null;
  overlay.hidden = true;
  title.inert = false;
  hud.inert = false;
  if (previousFocus && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true });
  if (game?.running) game.pause(document.hidden || !document.hasFocus());
}
function button(label: string, run: () => void, style = 'primary', disabled = false) {
  const b = document.createElement('button');
  b.className = style;
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', run);
  actions.append(b);
  return b;
}
function choice(data: typeof effects[Route | Ending], callback: () => void, disabled = false) {
  const b = button('', callback, 'choice', disabled);
  const name = document.createElement('span'), consequence = document.createElement('small');
  name.textContent = data.label;
  consequence.textContent = data.now + ' ' + data.later;
  b.append(name, consequence);
}

function commands() {
  current = 'help';
  show('DeadLine', 'Commandes', '<dl class="commands">' +
    '<dt>Se déplacer / conduire</dt><dd><kbd>ZQSD</kbd> <kbd>WASD</kbd> <kbd>↑ ↓ ← →</kbd></dd>' +
    '<dt>Courir à pied</dt><dd><kbd>Maj</kbd></dd>' +
    '<dt>Viser et tirer</dt><dd>Souris et clic gauche</dd>' +
    '<dt>Parler, récupérer, entrer, sortir</dt><dd><kbd>E</kbd></dd>' +
    '<dt>Utiliser les implants</dt><dd><kbd>1</kbd> <kbd>2</kbd></dd>' +
    '<dt>Freiner en voiture</dt><dd><kbd>Espace</kbd></dd>' +
    '<dt>Journal et pause</dt><dd><kbd>Tab</kbd> <kbd>Échap</kbd></dd></dl>');
  button('Fermer', leave);
}
function pause() {
  if (!game?.running) return;
  current = 'pause';
  show('DeadLine', 'En pause', '<p>La progression est enregistrée au briefing et à la fin de chaque contrat.</p>');
  button('Reprendre', leave);
  button('Commandes', commands, 'secondary');
  button(game.sound.muted ? 'Activer le son' : 'Couper le son', () => {
    game!.sound.silence(!game!.sound.muted);
    pause();
  }, 'secondary');
  button('Menu principal', () => {
    game!.running = false;
    game!.pause(true);
    title.hidden = false;
    hud.hidden = true;
    play.textContent = 'Reprendre';
    newGameButton.hidden = false;
    leave();
    play.focus();
  }, 'secondary');
}

function history(g: Game) {
  const { chapter, route, ending, side } = g.save;
  if (chapter === 1) return '';
  let html = '<div class="history"><h3>Conséquences dans la ville</h3><p>Mina a déchiffré la puce. Passage de service ouvert et contrat d’Ilyes débloqué.</p>';
  if (route) html += '<p>' + effects[route].now + ' ' + effects[route].later + '</p>';
  if (side === 'complete') html += '<p>Ilyes a détruit les dossiers de chantage.</p>';
  if (ending) html += '<p>' + effects[ending].now + ' ' + effects[ending].later + '</p>';
  return html + '</div>';
}

function journal() {
  if (!game?.running) return;
  const g = game, { side, tracking, chapter, ending } = g.save;
  current = 'journal';
  const objective = g.objective(), brief = objectives[chapter];
  const overview = '<h3>Objectif suivi</h3><p>' + objective.name + ' · ' + objective.text + '</p>';
  const details = '<h3>' + brief.heading + '</h3><p><em>' + brief.briefing + '</em></p><p>' + brief.access + '</p>';
  const sideText = { locked: '', available: 'Ilyes attend au dispensaire des Forges.', accepted: 'Récupérez les dossiers de chantage puis retrouvez Ilyes.', complete: 'Dossier remis. Récompense versée.' }[side];
  const secondary = sideText ? '<h3>Sous scellés</h3><p>' + sideText + '</p>' : '';
  show('Journal', ending ? 'Ville libre' : brief.heading, overview + details + secondary + history(g));
  button('Retour au jeu', leave);
  if (!g.active && side === 'available') {
    button(tracking === 'main' ? 'Suivre Sous scellés' : 'Suivre le chapitre', () => {
      g.track(tracking === 'main' ? 'side' : 'main');
      journal();
    }, 'secondary');
  }
}

function menu(which: Menu) {
  const g = game!;
  const { chapter, side, ending, route } = g.save;
  const briefing = objectives[chapter];
  current = which;
  switch (which) {
    case 'garage': {
      const available = g.availableImplants;
      const loadout = g.save.loadout;
      const equipment = available.map(i => '<label><input type="checkbox" data-implant="' + i + '"' + (loadout.includes(i) ? ' checked' : '') + '><span>' +
        implants[i].name + '</span><small>' + implants[i].help + '</small></label>').join('');
      const canAccept = chapter <= 2 && !g.active && side !== 'accepted' && !ending;
      const line = chapter === 1
        ? '« Les badges de leurs employés ouvrent encore toutes les portes. Les nôtres sautent sans préavis. Le dépôt peut nous dire qui donne l’ordre. »'
        : '« La puce a livré une liste. J’y ai reconnu ceux que j’héberge au-dessus de l’atelier. Retrouve le registre à La Dalle. »';
      show('Garage des Forges / Mina', canAccept ? briefing.heading : 'Garage de Mina', '<p>' + (canAccept ? line + '</p><p><em>' + briefing.briefing + '</em></p><p>' + briefing.access : 'Mina vous soigne et règle vos implants.') +
        '</p><h3>Équipez deux implants</h3><div class="loadout">' + equipment + '</div>');
      const inputs = Array.from(body.querySelectorAll<HTMLInputElement>('[data-implant]'));
      const selection = () => inputs.filter(input => input.checked).map(input => input.dataset.implant as Implant);
      const apply = () => {
        const selected = selection();
        if (selected.length === 2 && (selected[0] !== loadout[0] || selected[1] !== loadout[1])) {
          g.equip([selected[0], selected[1]]);
        }
      };
      const accept = button(canAccept ? 'Accepter le contrat' : 'Équiper et sortir', () => {
        apply();
        if (canAccept) g.accept();
        leave();
      });
      button(canAccept ? 'Équiper et sortir' : 'Retour au jeu', () => { apply(); leave(); }, 'secondary');
      for (const input of inputs) input.addEventListener('change', () => {
        const count = selection().length;
        accept.disabled = count !== 2;
        for (const other of inputs) other.disabled = !other.checked && count === 2;
      });
      for (const input of inputs) input.disabled = !input.checked && selection().length === 2;
      break;
    }
    case 'brief':
      show('Sorel', briefing.heading, '<p><em>' + (chapter === 2
        ? '« J’ai vérifié le numéro de la puce. Le registre des archives contient les ordres et les dossiers personnels. Récupérez-le avant la prochaine révocation. On peut encore protéger les habitants. »'
        : briefing.briefing) + '</em></p><p>' + briefing.access + '</p>' + history(g));
      button('Accepter le contrat', () => { g.accept(); leave(); });
      button('Plus tard', leave, 'secondary');
      break;
    case 'side':
      show('Dispensaire / Ilyes', 'Sous scellés', '<p>« Ils ont photographié les pièces d’identité de celles et ceux qui bossent au Mercure. Maintenant ils les menacent de dénonciation. Le dossier doit encore être dans leur boîte morte, près des ateliers. Je peux le détruire. »</p><p>Récompense de 280 ₡.</p>');
      button('Accepter le contrat', () => { g.acceptSide(); leave(); }, 'primary', g.active);
      button('Plus tard', leave, 'secondary');
      break;
    case 'route': {
      const atSorel = g.at[0] > 119;
      show(atSorel ? 'Sorel' : 'Collectif de La Dalle', 'Les effacés',
        atSorel ? '<p>« Je peux séparer les identités des ordres de révocation. Il faudra me faire confiance. Le badge vous donnera accès au relais. »</p><p>Le collectif attend près de la galerie.</p>'
          : '<p>« Le quartier a besoin des ordres pour pouvoir se défendre. S’ils sortent sans précaution, ils exposeront aussi les habitants. Nous pouvons ouvrir la galerie. »</p><p>Sorel attend sur la place du coteau.</p>');
      choice(atSorel ? effects.sorel : effects.collective, () => { g.finishRoute(atSorel ? 'sorel' : 'collective'); leave(); });
      button('Réfléchir', leave, 'secondary');
      break;
    }
    case 'ending':
      show('Relais du Nœud', 'Le registre', '<p>Le relais attend un ordre. Les personnes déjà effacées pourront demander le rétablissement de leurs droits.</p>');
      actions.classList.add('grid');
      choice(effects.publish, () => g.finishEnding('publish'));
      choice(effects.protect, () => g.finishEnding('protect'));
      break;
    case 'epilogue':
      show('DeadLine / Épilogue', ending === 'publish' ? 'La liste circule' : 'Un sursis', '<p>' + (ending ? effects[ending].now + ' ' + effects[ending].later : '') +
        '</p><p>' + (route === 'collective' ? 'Mina garde le garage ouvert pour ceux qui regagnent La Dalle.' : 'Sorel vous remet une attestation. Votre badge répond de nouveau.') + '</p><p>Les rues restent accessibles.</p>');
      button('Continuer en ville libre', leave);
      break;
    case 'failed':
      show('Intégrité à zéro', 'Séquence interrompue', '<p>' + (g.active ? 'Le point de reprise ramène au garage, avec la puce, les vigiles et la voiture restaurés.' : 'Vous pouvez retrouver le garage et reprendre l’exploration.') + '</p>', true);
      button(g.active || side === 'accepted' ? 'Reprendre au point de sauvegarde' : 'Revenir au garage', () => {
        current = null;
        g.retry(false);
        leave();
      });
      if (g.active || side === 'accepted') button('Abandonner le contrat', () => {
        current = null;
        g.retry(true);
        leave();
      }, 'secondary');
      break;
    case 'residents':
      show('La Dalle', 'Inès', '<p>« Mon frère dort dans l’escalier depuis qu’on lui a coupé son badge. Je ne peux plus le faire entrer chez moi. S’il passe le contrôle, ils me coupent le mien. »</p>');
      button('Reprendre la route', leave);
      break;
  }
}

function text(id: string, value: string) {
  const el = get(id);
  if (el.textContent !== value) el.textContent = value;
}
function minimap(g: Game, markers: Pin[]) {
  const [x, z] = g.at, w = map.width, h = map.height, scale = 2.03;
  const sx = (a: number) => (a - x) * scale + w / 2;
  const sy = (b: number) => (b - z) * scale + h / 2;
  const area = ([cx, cz, width, depth]: Rect, tint: string) => {
    if (Math.abs(cx - x) > w / scale / 2 + width / 2 || Math.abs(cz - z) > h / scale / 2 + depth / 2) return;
    ctx.fillStyle = tint;
    ctx.fillRect(sx(cx - width / 2), sy(cz - depth / 2), width * scale, depth * scale);
  };
  ctx.fillStyle = '#131f29';
  ctx.fillRect(0, 0, w, h);
  for (const r of roads) area(r, '#293d48');
  for (const r of blocks) area(r, '#20313a');
  for (const b of buildings) area(b.area, '#37505b');
  for (const b of walls) if (b.height >= 1.6) area(b.area, '#445c65');
  for (const gate of gates) if (g.city.gateMeshes.get(gate.id)?.visible) area(gate.area, '#8d7771');
  for (const guard of g.guards) {
    if (guard.health <= 0) continue;
    ctx.fillStyle = guard.state === 'pursue' ? '#ff9b79' : '#ac7464';
    ctx.fillRect(sx(guard.at[0]) - 1.5, sy(guard.at[1]) - 1.5, 3, 3);
  }
  for (const pin of markers) {
    const px = clamp(sx(pin.at[0]), 6, w - 6), py = clamp(sy(pin.at[1]), 6, h - 6);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = pin.kind === 'goal' ? '#e9f684' : '#80aeab';
    ctx.fillRect(-2.7, -2.7, 5.4, 5.4);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-(g.driven ? g.car.yaw : g.player.yaw));
  ctx.fillStyle = '#9aefce';
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(-4.6, -4);
  ctx.lineTo(0, -2);
  ctx.lineTo(4.6, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paint(g: Game) {
  if (!g.running || hud.hidden) return;
  const objective = g.objective();
  const width = window.innerWidth, height = window.innerHeight;
  const now = performance.now();
  const activePins = objective.pins.filter(pin => pin.kind === 'goal' || distance(pin.at, g.at) < (pin.kind === 'car' ? 25 : 36));
  markerElements.forEach((el, i) => { el.hidden = i >= activePins.length; });
  for (const [i, pin] of activePins.entries()) {
    let el = markerElements[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'waypoint';
      el.innerHTML = '<i></i><span></span>';
      pins.append(el);
      markerElements.push(el);
    }
    const p = g.project(pin.at, pin.kind === 'route' ? 1.65 : 2.25);
    const rawX = (p.x + 1) * width / 2, rawY = (1 - p.y) * height / 2;
    const x = clamp(rawX, width < 700 ? 40 : 112, width - 106);
    const y = clamp(rawY, width < 700 ? 164 : 165, height - 100);
    el.hidden = false;
    el.style.left = x + 'px';
    el.style.top = (i === 0 ? y : y + (Math.abs(rawY - y) > 4 ? 23 : 0)) + 'px';
    el.dataset.type = pin.kind;
    el.dataset.edge = String(rawX !== x || rawY !== y);
    const label = el.querySelector('span')!;
    if (label.textContent !== pin.label) label.textContent = pin.label;
  }
  crosshair.hidden = !g.pointer.visible || g.driven;
  crosshair.style.left = g.pointer.x + 'px';
  crosshair.style.top = g.pointer.y + 'px';
  crosshair.dataset.valid = String(g.validAim);

  if (now - lastHud < 55) return;
  lastHud = now;
  const district = districtNames[districtAt(g.at[0])];
  text('district', district);
  text('map-name', district);
  text('mission-name', objective.name);
  text('objective-text', objective.text);
  text('distance', objective.pins[0] ? Math.ceil(distance(g.at, objective.pins[0].at)) + ' m' : '');
  text('money', g.save.credits.toLocaleString('fr-FR') + ' ₡');
  text('health-number', String(Math.ceil(g.health)));
  get('health-fill').style.width = g.health + '%';
  get('health-track').setAttribute('aria-valuenow', String(g.health));
  get('health-track').dataset.low = String(g.health <= 28);
  shade.dataset.hurt = String(g.damageFlash > 0);
  g.save.loadout.forEach((id, i) => {
    const slot = slots[i], cool = g.cooldown[id];
    slot.dataset.ready = String(cool <= 0);
    slot.querySelector('span')!.textContent = implants[id].name;
    slot.querySelector('small')!.textContent = cool > 0 ? Math.ceil(cool) + 's' : 'Prêt';
  });

  const delivery = g.active && g.save.chapter === 1 && g.loot;
  const state = g.confirmed ? 'confirmed' : g.observation > .06 ? 'watch' : delivery && g.safeFor >= 5 ? 'delivery' : 'clear';
  let alert = state === 'confirmed' ? 'Position confirmée' : state === 'watch' ? 'Observé' : state === 'delivery' ? 'Remise autorisée'
    : g.pursuing ? 'Fouille en cours' : 'Hors détection';
  if ((state === 'confirmed' || state === 'watch') && g.observer) alert += ' · ' + observerLabels[g.observer];
  if (delivery && !g.confirmed && g.safeFor < 5) alert += ' · ' + Math.max(1, Math.ceil(5 - g.safeFor)) + ' s';
  get('danger').dataset.state = state;
  text('alert-text', alert);
  get('alert-meter').style.setProperty('--progress', (state === 'delivery' || g.confirmed ? 100 : g.observation * 100) + '%');
  const prompt = g.interaction();
  get('prompt').hidden = !prompt;
  text('prompt-text', prompt?.label ?? '');
  get('notice').hidden = g.messageTime <= 0;
  text('notice', g.message);
  get('speed').hidden = !g.driven;
  get('speed').querySelector('strong')!.textContent = String(Math.round(Math.abs(g.car.speed) * 3.6));
  if (now - lastMap >= 70) { lastMap = now; minimap(g, activePins); }
}

function setFocus() {
  if (!game?.running) return;
  game.pause(document.hidden || !document.hasFocus() || current !== null);
}
window.addEventListener('blur', () => { game?.pause(true); });
window.addEventListener('focus', setFocus);
document.addEventListener('visibilitychange', setFocus);
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === 'escape' && current !== 'failed') {
    if (current) leave();
    else if (!event.repeat) pause();
    return;
  }
  if (current || !game?.running || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Tab') { event.preventDefault(); if (!event.repeat) journal(); return; }
  if (moveKeys.has(key)) {
    event.preventDefault();
    if (!game.paused) game.keys.add(key);
  }
  if (event.repeat) return;
  if (key === 'e') { event.preventDefault(); game.interact(); }
  const slot = key === '1' || event.code === 'Digit1' ? 0 : key === '2' || event.code === 'Digit2' ? 1 : null;
  if (slot !== null) { event.preventDefault(); game.implant(slot); }
});
window.addEventListener('keyup', e => game?.keys.delete(e.key.toLowerCase()));
viewport.addEventListener('pointermove', event => {
  if (!game) return;
  Object.assign(game.pointer, { x: event.clientX, y: event.clientY, visible: event.pointerType === 'mouse' });
});
viewport.addEventListener('pointerleave', () => { if (game) Object.assign(game.pointer, { visible: false, down: false }); });
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !game?.running || game.paused) return;
  event.preventDefault();
  Object.assign(game.pointer, { x: event.clientX, y: event.clientY, visible: true, down: true });
});
window.addEventListener('pointerup', () => { if (game) game.pointer.down = false; });
viewport.addEventListener('contextmenu', e => e.preventDefault());
get('title-help').addEventListener('click', commands);
get('pause').addEventListener('click', pause);
get('journal').addEventListener('click', journal);
close.addEventListener('click', leave);
function begin() {
  if (!game) return;
  title.hidden = true;
  hud.hidden = false;
  play.blur();
  game.start();
  paint(game);
}
play.addEventListener('click', begin);
newGameButton.addEventListener('click', () => {
  current = 'restart';
  show('DeadLine', 'Nouvelle partie', '<p>Commencer une nouvelle partie remplace la sauvegarde de ce navigateur.</p>');
  button('Recommencer', () => { leave(); game?.restart(); begin(); });
  button('Garder la sauvegarde', leave, 'secondary');
});

try {
  await R.init();
  game = new Game(viewport, menu, paint);
  play.textContent = game.checkpointAvailable ? 'Reprendre' : 'Jouer';
  newGameButton.hidden = !game.checkpointAvailable;
  play.disabled = false;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
    Object.assign(window, { deadlineQA: game });
  }
} catch (error) {
  get('boot-error').hidden = false;
  text('boot-error', 'Le moteur 3D n’a pas démarré. Vérifiez que WebGL 2 est disponible.');
  play.textContent = 'Jeu indisponible';
  console.error(error);
}
