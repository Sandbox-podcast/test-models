/**
 * Point d'entrée — chargement de Rapier (WASM), construction du niveau, menu.
 * Le bouton « Jouer » ne s'active qu'une fois le moteur et le niveau prêts.
 */
import './style.css';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/session';
import { Hud } from './ui/hud';
import { loadSave } from './game/save';

async function boot() {
  const hud = new Hud();
  hud.setMenuStatus('Chargement du moteur physique…');
  await new Promise((r) => setTimeout(r, 30)); // laisse peindre le menu

  await RAPIER.init();
  hud.setMenuStatus('Construction des Forges…');
  await new Promise((r) => setTimeout(r, 30));

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  hud.setMenuStatus('Prêt.');
  hud.enableNewGame();
  if (loadSave()) hud.enableContinue();

  const btnNew = document.getElementById('btn-new') as HTMLButtonElement;
  const btnCont = document.getElementById('btn-continue') as HTMLButtonElement;
  btnNew.addEventListener('click', () => {
    game.begin(null);
  });
  btnCont.addEventListener('click', () => {
    game.begin(loadSave());
  });
}

void boot();
