(() => {
  'use strict';

  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const reveal = document.querySelector('.reveal');
  const revealStage = document.querySelector('.reveal-stage');
  const universe = document.querySelector('.universe');
  const gallery = document.querySelector('.gallery');
  const finale = document.querySelector('.finale');
  const header = document.querySelector('.masthead');
  const menu = document.querySelector('.menu-control');
  const motion = document.querySelector('.motion-control');
  const links = [...document.querySelectorAll('.navigation a')];
  const sections = links.map(link => document.querySelector(link.hash));
  const tableaux = [...document.querySelectorAll('.tableau')];
  const selectors = [...document.querySelectorAll('[data-tableau]')];
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = t => t * t * (3 - 2 * t);

  let manualMotion = null;
  try { manualMotion = sessionStorage.getItem('cosmos-motion'); } catch { /* Optional storage. */ }
  let animate = false;
  let pending = false;
  let activeChapter = -1;
  let activeTableau = -1;
  let heroVisible = true;
  let finaleVisible = false;
  let convergence = 0;
  let frame = 0;
  let lastFrame = 0;
  let elapsed = 0;

  function randomSequence(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function starField(selector, seed) {
    const canvas = document.querySelector(selector);
    const context = canvas.getContext('2d');
    const random = randomSequence(seed);
    const stars = Array.from({ length: 126 }, () => ({
      x: random(), y: random(), radius: .35 + random() * 1.1,
      phase: random() * Math.PI * 2, angle: random() * Math.PI * 2,
      orbit: .75 + random() * .5, light: .25 + random() * .65
    }));
    const field = { canvas, context, stars, width: 0, height: 0 };
    return field;
  }
  const openingField = starField('.hero-dust', 614);
  const closingField = starField('.finale-dust', 262);

  function sizeField(field) {
    if (!field.context) return;
    const { width, height } = field.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    field.canvas.width = Math.round(width * dpr);
    field.canvas.height = Math.round(height * dpr);
    field.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    field.width = width;
    field.height = height;
  }

  function paint(field, time, closing) {
    const { context: ctx, width, height, stars } = field;
    if (!ctx || width === 0) return;
    ctx.clearRect(0, 0, width, height);
    const mobile = width <= 580;
    const count = mobile ? 49 : stars.length;
    const gather = closing ? (animate ? ease(convergence) : 1) : 0;
    const cx = width * (mobile ? .57 : .70);
    const cy = height * (mobile ? .64 : .47);
    const radius = Math.min(width * (mobile ? .34 : .2), height * .29);
    for (let i = 0; i < count; i++) {
      const star = stars[i];
      const phase = star.phase + time * .00036;
      let x = star.x * width + Math.sin(phase) * 3;
      let y = star.y * height + Math.cos(phase * .8) * 3;
      if (closing && i % 5 !== 0) {
        const angle = star.angle + time * .000018;
        x += (cx + Math.cos(angle) * radius * star.orbit - x) * gather;
        y += (cy + Math.sin(angle) * radius * star.orbit * 1.16 - y) * gather;
      }
      const brightness = star.light * (.77 + Math.sin(phase) * .22);
      ctx.fillStyle = 'rgba(227,219,252,' + brightness + ')';
      ctx.beginPath();
      ctx.arc(x, y, star.radius * (mobile ? .82 : 1), 0, Math.PI * 2);
      ctx.fill();
      if (i % 29 === 0) {
        const ray = 3.5 + star.radius * 1.7;
        ctx.beginPath();
        ctx.moveTo(x - ray, y);
        ctx.quadraticCurveTo(x, y - .35, x, y - ray * 1.35);
        ctx.quadraticCurveTo(x, y - .35, x + ray, y);
        ctx.quadraticCurveTo(x, y + .35, x, y + ray * 1.35);
        ctx.quadraticCurveTo(x, y + .35, x - ray, y);
        ctx.fill();
      }
    }
  }

  function renderDust(time) {
    if (heroVisible) paint(openingField, time, false);
    if (finaleVisible) paint(closingField, time, true);
  }

  function animateDust(now) {
    frame = 0;
    if (!animate || document.hidden || (!heroVisible && !finaleVisible)) {
      lastFrame = 0;
      return;
    }
    if (!lastFrame || now - lastFrame >= 32) {
      elapsed += lastFrame ? Math.min(now - lastFrame, 64) : 0;
      renderDust(elapsed);
      lastFrame = now;
    }
    frame = requestAnimationFrame(animateDust);
  }

  function syncDust() {
    if (!animate) renderDust(elapsed);
    else if (!frame && !document.hidden && (heroVisible || finaleVisible)) {
      frame = requestAnimationFrame(animateDust);
    }
  }

  function showTableaux(progress) {
    const position = progress * (tableaux.length - 1);
    const active = Math.round(position);
    tableaux.forEach((panel, i) => {
      let mix = i === 0 ? 1 : ease(clamp((position - i + .72) / .44));
      if (!animate) mix = i <= active ? 1 : 0;
      panel.style.visibility = mix === 0 ? 'hidden' : 'visible';
      if (mix === 0 || mix === 1) panel.style.maskImage = 'none';
      else {
        const edge = mix * 140 - 30;
        panel.style.maskImage = 'linear-gradient(108deg,#000 ' + edge + '%,transparent ' + (edge + 28) + '%)';
      }
    });
    if (active !== activeTableau) {
      activeTableau = active;
      tableaux.forEach((panel, i) => panel.setAttribute('aria-hidden', String(i !== active)));
      selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
    }
  }

  function update() {
    pending = false;
    const viewport = window.innerHeight;
    const opening = hero.getBoundingClientRect();
    heroVisible = opening.bottom > 0 && opening.top < viewport;
    if (heroVisible) {
      const shift = animate ? clamp(-opening.top / opening.height) : 0;
      window.cosmosBottle?.pose('hero', -.34 + shift*.82);
      hero.style.setProperty('--sky-shift', shift * 43 + 'px');
      hero.style.setProperty('--product-shift', shift * 64 + 'px');
      hero.style.setProperty('--word-shift', shift * 28 + 'px');
    }
    const glass = reveal.getBoundingClientRect();
    if (glass.bottom > 0 && glass.top < viewport) {
      const t = animate ? ease(clamp(-glass.top / Math.max(1, glass.height - revealStage.offsetHeight))) : .4;
      window.cosmosBottle?.pose('reveal', animate ? -.58 + 2.34*t : -.43);
      revealStage.style.setProperty('--rotation', (-23 + 49 * t) + 'deg');
      revealStage.style.setProperty('--roll', (-7 + 12 * t) + 'deg');
      revealStage.style.setProperty('--zoom', (1 + t * .29).toFixed(3));
      revealStage.style.setProperty('--sweep', (120 - t * 160) + '%');
    }
    const space = universe.getBoundingClientRect();
    if (space.bottom >= 0 && space.top <= viewport) {
      showTableaux(clamp(-space.top / Math.max(1, space.height - gallery.offsetHeight)));
    }
    const final = finale.getBoundingClientRect();
    finaleVisible = final.top < viewport && final.bottom > 0;
    convergence = clamp(1 - final.top / viewport);
    if (finaleVisible) finale.style.setProperty('--halo', animate ? ease(convergence) : 1);
    const chapter = sections.reduce((current, section, i) =>
      section.getBoundingClientRect().top <= viewport * .48 ? i : current, 0);
    if (chapter !== activeChapter) {
      activeChapter = chapter;
      links.forEach((link, i) => {
        if (i === chapter) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    syncDust();
  }

  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(update);
    }
  }

  function clearTilt() {
    window.cosmosBottle?.pointer('hero', 0, 0);
    window.cosmosBottle?.pointer('reveal', 0, 0);
    hero.style.setProperty('--mx', '0px');
    hero.style.setProperty('--my', '0px');
    hero.style.setProperty('--tilt', '0deg');
    revealStage.style.setProperty('--rx', '0deg');
    revealStage.style.setProperty('--ry', '0px');
  }

  function syncMotion() {
    animate = manualMotion === null ? !preference.matches : manualMotion === 'on';
    root.dataset.motion = animate ? 'on' : 'off';
    window.cosmosBottle?.motion(animate);
    motion.setAttribute('aria-pressed', String(animate));
    motion.title = animate ? 'Mettre les animations en pause' : 'Activer les animations';
    if (!animate) clearTilt();
    schedule();
  }

  function setMenu(open) {
    header.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (open) links[0].focus({ preventScroll: true });
  }

  motion.addEventListener('click', () => {
    manualMotion = animate ? 'off' : 'on';
    try { sessionStorage.setItem('cosmos-motion', manualMotion); } catch { /* Keep the page setting. */ }
    syncMotion();
  });
  preference.addEventListener('change', syncMotion);
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => {
    if (!header.contains(event.target) || event.target.closest('a[href^="#"]')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menu.focus();
    }
  });
  header.addEventListener('focusout', event => {
    if (event.relatedTarget && !header.contains(event.relatedTarget)) setMenu(false);
  });
  selectors.forEach((button, i) => button.addEventListener('click', () => {
    const distance = universe.offsetHeight - gallery.offsetHeight;
    const top = universe.getBoundingClientRect().top + window.scrollY + distance * i / (tableaux.length - 1);
    window.scrollTo({ top, behavior: animate ? 'smooth' : 'instant' });
  }));
  [hero, revealStage].forEach(scene => {
    scene.addEventListener('pointermove', event => {
      if (!animate || !finePointer.matches) return;
      const rect = scene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      window.cosmosBottle?.pointer(scene === hero ? 'hero' : 'reveal', x, y);
      if (scene === hero) {
        hero.style.setProperty('--mx', x * 16 + 'px');
        hero.style.setProperty('--my', y * 10 + 'px');
        hero.style.setProperty('--tilt', x * 9 + 'deg');
      } else {
        revealStage.style.setProperty('--rx', x * 11 + 'deg');
        revealStage.style.setProperty('--ry', y * 10 + 'px');
      }
    }, { passive: true });
    scene.addEventListener('pointerleave', clearTilt);
  });

  function resize() {
    sizeField(openingField);
    sizeField(closingField);
    if (window.innerWidth > 780) setMenu(false);
    schedule();
  }
  root.classList.add('js');
  showTableaux(0);
  syncMotion();
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
})();
