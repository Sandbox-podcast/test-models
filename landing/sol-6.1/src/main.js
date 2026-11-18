import { attachBottleControls } from './bottle-controls.js';

const root = document.documentElement;
const chapters = [...document.querySelectorAll('.chapter')];
const chapterLinks = [...document.querySelectorAll('.chapter-nav a')];
const chapterName = document.querySelector('.chapter-name');
const motionToggle = document.querySelector('.motion-toggle');
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
const pointerMedia = matchMedia('(pointer: fine)');
const fallback = document.querySelector('#bottle-fallback');
const bottleControl = document.querySelector('#bottle-control');
const sceneCanvas = document.querySelector('#cosmos-scene');
const starCanvas = document.querySelector('#stardust');
const stars = starCanvas.getContext('2d');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
let preference;
try { preference = localStorage.getItem('cosmos-motion'); } catch { /* Private browsing can disable storage. */ }
let reduced = preference ? preference === 'reduce' : motionMedia.matches;
let width = innerWidth, height = innerHeight, mobile = width <= 650;
let scrollPosition = scrollY, frame, lastFrame = 0, elapsed = 0;
let scene, bottleBounds, activeChapter = -1, timeline = [];
const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, yaw: 0, targetYaw: 0 };
const pose = { x: 0, y: 0, scale: 1, rx: .06, ry: -.24, rz: -.07, orbit: .65, blue: .2, violet: .1, silver: 0, finale: 0 };
let targetPose = { ...pose };
let seed = 8421;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const particles = Array.from({ length: 260 }, () => ({ x: random(), y: random(), depth: random(), size: .25 + random() * .9, phase: random() * Math.PI * 2, orbit: random() * Math.PI * 2, distance: .8 + random() * .4 }));

document.querySelector('#year').textContent = new Date().getFullYear();
attachBottleControls(bottleControl, {
  rotate: angle => { pointer.targetYaw += angle; schedule(); },
  reset: () => { pointer.targetYaw = 0; schedule(); },
  getWidth: () => bottleBounds?.width || 200,
});

function positionBottleControl(bounds) {
  bottleBounds = bounds;
  bottleControl.disabled = !bounds || !root.classList.contains('scene-ready');
  if (!bounds) return;
  bottleControl.style.width = `${Math.max(44, bounds.width)}px`;
  bottleControl.style.height = `${Math.max(44, bounds.height)}px`;
  bottleControl.style.transform = `translate3d(${bounds.left}px,${bounds.top}px,0)`;
}

function setMotion() {
  root.classList.toggle('reduced-motion', reduced);
  root.classList.toggle('js-motion', !reduced);
  motionToggle.setAttribute('aria-pressed', String(reduced));
  const label = reduced ? 'Activer les animations' : 'Réduire les animations';
  motionToggle.setAttribute('aria-label', label);
  motionToggle.title = label;
  motionToggle.querySelector('span').textContent = reduced ? 'Animations réduites' : 'Animations';
  if (reduced) pointer.targetX = pointer.targetY = 0;
  schedule();
}
motionToggle.addEventListener('click', () => {
  reduced = !reduced;
  try { localStorage.setItem('cosmos-motion', reduced ? 'reduce' : 'full'); } catch { /* Optional preference. */ }
  setMotion();
});
motionMedia.addEventListener('change', event => {
  preference = undefined;
  try { preference = localStorage.getItem('cosmos-motion'); } catch { /* Optional preference. */ }
  if (!preference) { reduced = event.matches; setMotion(); }
});

function measure() {
  width = innerWidth; height = innerHeight; mobile = width <= 650;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  starCanvas.width = Math.round(width * dpr);
  starCanvas.height = Math.round(height * dpr);
  stars?.setTransform(dpr, 0, 0, dpr, 0, 0);
  const anchors = chapters.map(section => section.offsetTop);
  const positions = mobile ? [
    { x: 0, y: .15, scale: .86, rx: .07, ry: -.46, rz: -.07, orbit: .5, blue: .2, violet: .08, silver: 0, finale: 0 },
    { x: .19, y: .94, scale: .8, rx: -.05, ry: .38, rz: .07, orbit: .85, blue: .4, violet: .13, silver: 0, finale: 0 },
    { x: -.13, y: .99, scale: .93, rx: .13, ry: -.62, rz: -.13, orbit: .25, blue: 1, violet: .05, silver: 0, finale: 0 },
    { x: .17, y: .95, scale: .87, rx: -.08, ry: .5, rz: .13, orbit: .6, blue: .15, violet: 1, silver: 0, finale: 0 },
    { x: -.3, y: 1.04, scale: 1.07, rx: .08, ry: -.6, rz: -.18, orbit: .1, blue: .1, violet: .15, silver: 1, finale: 0 },
    { x: 0, y: .42, scale: .8, rx: .03, ry: -.14, rz: -.025, orbit: .9, blue: .2, violet: .4, silver: .2, finale: 1 }
  ] : [
    { x: 0, y: .04, scale: 1, rx: .09, ry: -.46, rz: -.07, orbit: .65, blue: .2, violet: .1, silver: 0, finale: 0 },
    { x: 1.6, y: -.02, scale: 1.22, rx: -.05, ry: .49, rz: .08, orbit: 1, blue: .45, violet: .2, silver: 0, finale: 0 },
    { x: -1.65, y: .06, scale: 1.4, rx: .16, ry: -.65, rz: -.15, orbit: .24, blue: 1, violet: .05, silver: 0, finale: 0 },
    { x: 1.65, y: .04, scale: 1.27, rx: -.08, ry: .57, rz: .13, orbit: .8, blue: .15, violet: 1, silver: 0, finale: 0 },
    { x: -1.95, y: -.16, scale: 1.9, rx: .13, ry: -.65, rz: -.24, orbit: .1, blue: .1, violet: .12, silver: 1, finale: 0 },
    { x: 0, y: .22, scale: 1.04, rx: .03, ry: -.14, rz: -.025, orbit: 1, blue: .2, violet: .4, silver: .2, finale: 1 }
  ];
  timeline = positions.map((p, i) => ({ ...p, at: i === 0 ? 0 : anchors[i] + height * (i === 1 ? .12 : .06) }));
  scene?.resize(width, height, mobile);
  updateScroll(); schedule();
}

function updateScroll() {
  scrollPosition = scrollY;
  const total = document.documentElement.scrollHeight - height;
  root.style.setProperty('--scroll-progress', String(clamp(scrollPosition / Math.max(1, total))));
  root.style.setProperty('--hero-progress', String(clamp(scrollPosition / height)));
  let before = timeline[0], after = timeline.at(-1);
  for (let i = 0; i < timeline.length - 1; i++) {
    if (scrollPosition >= timeline[i].at && scrollPosition < timeline[i + 1].at) { before = timeline[i]; after = timeline[i + 1]; break; }
  }
  if (scrollPosition >= timeline.at(-1).at) before = after = timeline.at(-1);
  const t = before === after ? 1 : ease(clamp((scrollPosition - before.at) / (after.at - before.at)));
  root.style.setProperty('--wipe-x', `${t * 150 - 25}%`);
  root.style.setProperty('--wipe-opacity', reduced ? '0' : String(Math.sin(t * Math.PI) ** 6 * .75));
  for (const key of Object.keys(pose)) targetPose[key] = lerp(before[key], after[key], t);
  let nextChapter = 0;
  chapters.forEach((section, index) => { if (section.offsetTop <= scrollPosition + height * .48) nextChapter = index; });
  if (nextChapter !== activeChapter) {
    activeChapter = nextChapter;
    chapterName.textContent = chapters[nextChapter].dataset.chapter;
    chapterLinks.forEach((link, i) => {
      link.classList.toggle('active', i === nextChapter);
      if (i === nextChapter) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }
  root.style.setProperty('--blue', targetPose.blue.toFixed(3));
  root.style.setProperty('--violet', targetPose.violet.toFixed(3));
  root.style.setProperty('--silver', targetPose.silver.toFixed(3));
  schedule();
}

function drawStars(time) {
  if (!stars) return;
  stars.clearRect(0, 0, width, height);
  const count = mobile ? 85 : particles.length;
  const final = pose.finale;
  for (let i = 0; i < count; i++) {
    const p = particles[i];
    const drift = reduced ? 0 : time * .0008 * (1 + p.depth);
    let x = ((p.x + drift) % 1) * width + pointer.x * p.depth * 10;
    let y = ((p.y + drift * .22) % 1) * height - (reduced ? 0 : scrollPosition * .015 * p.depth) % height;
    if (y < 0) y += height;
    if (final > 0) {
      const angle = p.orbit + (reduced ? 0 : time * .018);
      const radius = Math.min(width, height) * (mobile ? .32 : .37) * p.distance;
      x = lerp(x, width / 2 + Math.cos(angle) * radius, final);
      y = lerp(y, height * .43 + Math.sin(angle) * radius * .7, final);
    }
    const twinkle = reduced ? .7 : .55 + Math.sin(time * .5 + p.phase) * .25;
    const alpha = (.22 + p.depth * .5) * twinkle;
    stars.fillStyle = `rgba(${Math.round(180 + p.depth * 65)},${Math.round(177 + p.depth * 63)},235,${alpha})`;
    stars.beginPath(); stars.arc(x, y, p.size * (mobile ? .75 : 1), 0, Math.PI * 2); stars.fill();
    if (p.depth > .96 && !mobile) {
      stars.strokeStyle = `rgba(209,196,255,${alpha * .25})`; stars.lineWidth = .5;
      stars.beginPath(); stars.moveTo(x - 4, y); stars.lineTo(x + 4, y); stars.moveTo(x, y - 4); stars.lineTo(x, y + 4); stars.stroke();
    }
  }
}

function tick(now) {
  frame = undefined;
  if (document.hidden) return;
  const delta = Math.min((now - lastFrame) / 1000 || .016, .06);
  if (!reduced && now - lastFrame < (mobile ? 31 : 15)) { schedule(); return; }
  lastFrame = now;
  if (!reduced) elapsed += delta;
  const damping = reduced ? 1 : 1 - Math.exp(-delta * 8);
  for (const key of Object.keys(pose)) pose[key] = lerp(pose[key], targetPose[key], damping);
  pointer.x = lerp(pointer.x, reduced ? 0 : pointer.targetX, damping);
  pointer.y = lerp(pointer.y, reduced ? 0 : pointer.targetY, damping);
  pointer.yaw = lerp(pointer.yaw, pointer.targetYaw, damping);
  drawStars(elapsed);
  positionBottleControl(scene?.render(pose, reduced ? 0 : elapsed, pointer, reduced));
  if (!root.classList.contains('scene-ready')) {
    const sx = pose.x / (mobile ? 2.8 : 6.4) * width;
    const sy = -pose.y / 5.2 * height;
    fallback.style.transform = `translate(calc(-50% + ${sx}px),calc(-50% + ${sy}px)) rotate(${pose.rz * 57}deg) scale(${pose.scale * (mobile ? .78 : 1)})`;
  }
  if (!reduced) schedule();
}
function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); }

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting));
}, { threshold: .1, rootMargin: '0px 0px -5% 0px' });
document.querySelectorAll('.reveal-copy').forEach(el => observer.observe(el));
addEventListener('scroll', updateScroll, { passive: true });
let resizeFrame;
addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(measure); }, { passive: true });
addEventListener('pointermove', event => {
  if (reduced || !pointerMedia.matches || mobile) return;
  pointer.targetX = (event.clientX / width - .5) * 2;
  pointer.targetY = (event.clientY / height - .5) * 2;
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.targetX = pointer.targetY = 0; });
sceneCanvas.addEventListener('webglcontextlost', () => { bottleControl.disabled = true; });
sceneCanvas.addEventListener('webglcontextrestored', schedule);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = undefined; } else { lastFrame = performance.now(); schedule(); } });
setMotion(); measure();

import('./scene.js').then(async ({ createScene }) => {
  scene = await createScene(sceneCanvas, width, height, mobile);
  const bounds = scene.render(targetPose, 0, pointer, reduced);
  root.classList.add('scene-ready'); positionBottleControl(bounds); schedule();
}).catch(error => {
  console.warn('COSMOS : la composition en verre reste disponible sans WebGL.', error);
});
