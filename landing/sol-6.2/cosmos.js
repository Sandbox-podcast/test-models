(() => {
  const hero = document.querySelector('[data-hero]');
  const reveal = document.querySelector('[data-reveal]');
  const stage = document.querySelector('[data-stage]');
  const finale = document.querySelector('[data-finale]');
  const finaleBottle = document.querySelector('[data-finale-bottle]');
  const header = document.querySelector('[data-header]');
  const universe = document.querySelector('#univers');
  const tableaux = [...universe.querySelectorAll('[data-tableau]')];
  const navigation = [...header.querySelectorAll('nav a')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const precisePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const compact = matchMedia('(max-width: 760px)');
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const ease = (value) => value * value * (3 - 2 * value);
  const range = Math.PI * 2;

  function setStyle(element, properties) {
    for (const [name, value] of Object.entries(properties)) {
      element.style.setProperty(name, value);
    }
  }

  function makeField(canvas) {
    const context = canvas.getContext('2d');
    if (!context) return null;

    const isFinale = canvas.dataset.particles === 'finale';
    const points = Array.from({ length: 126 }, () => ({
      x: Math.random(),
      y: Math.random(),
      angle: Math.random() * range,
      radius: .75 + Math.random() * .42,
      depth: Math.random(),
      phase: Math.random() * range,
    }));
    let width = 0;
    let height = 0;

    return {
      isFinale,
      resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        const density = Math.min(1.5, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * density);
        canvas.height = Math.round(height * density);
        context.setTransform(density, 0, 0, density, 0, 0);
      },
      paint(seconds, offset, halo) {
        context.clearRect(0, 0, width, height);
        context.fillStyle = isFinale ? '#e5caff' : '#cec8ff';
        const count = compact.matches ? 44 : points.length;

        for (let i = 0; i < count; i++) {
          const point = points[i];
          const pulse = .6 + .35 * Math.sin(seconds * (.52 + point.depth) + point.phase);
          let x = point.x * width + Math.sin(seconds * .2 + point.phase) * (6 + point.depth * 13);
          let y = point.y * height + Math.cos(seconds * .26 + point.phase) * 9 - offset * point.depth * .11;
          if (halo) {
            const angle = point.angle + seconds * (.03 + point.depth * .026);
            const distance = halo.radius * point.radius;
            const orbitX = Math.cos(angle) * distance;
            const orbitY = Math.sin(angle) * distance * .32;
            const targetX = width * .5 + orbitX * .94 + orbitY * .34;
            const targetY = halo.center - orbitX * .34 + orbitY * .94;
            x += (targetX - x) * halo.progress;
            y += (targetY - y) * halo.progress;
          }

          const size = .65 + point.depth ** 3 * 1.75;
          context.globalAlpha = pulse * (.25 + point.depth * .54) * (halo ? .6 + halo.progress * .4 : 1);
          context.fillRect(x, y, size, size);
          if (i % 17 === 0) {
            context.globalAlpha *= .2;
            context.fillRect(x - 3, y + size * .4, size + 6, .7);
            context.fillRect(x + size * .4, y - 3, .7, size + 6);
          }
        }
        context.globalAlpha = 1;
      },
    };
  }

  const fields = [...document.querySelectorAll('[data-particles]')].map(makeField).filter(Boolean);
  const pointer = { targetX: 0, targetY: 0, x: 0, y: 0 };
  const animatedSurfaces = [hero, stage, finale, ...tableaux];
  let geometry;
  let activeLink = '';
  let currentScroll = 0;
  const halo = { center: 0, radius: 0, progress: 0 };
  let layoutChanged = true;
  let scrollChanged = true;
  let frameId = 0;
  let bottles;

  function measure() {
    const scroll = window.scrollY;
    const read = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scroll, height: rect.height };
    };
    geometry = {
      height: window.innerHeight,
      pageTravel: Math.max(1, document.documentElement.scrollHeight - window.innerHeight),
      hero: read(hero),
      reveal: read(reveal),
      revealTravel: Math.max(1, reveal.offsetHeight - reveal.firstElementChild.offsetHeight),
      universe: read(universe),
      tableaux: tableaux.map(read),
      finale: read(finale),
    };
    const bottleBox = read(finaleBottle);
    halo.center = bottleBox.top + bottleBox.height * .5 - geometry.finale.top;
    halo.radius = Math.min(finale.clientWidth * .39, finaleBottle.clientWidth * 1.45);
    setStyle(finale, {
      '--halo-center': `${halo.center}px`,
      '--halo-diameter': `${halo.radius * 2}px`,
    });
    fields.forEach((field) => field.resize());
    bottles?.resize(compact.matches);
  }

  function updateScroll() {
    currentScroll = Math.max(0, window.scrollY);
    const marker = currentScroll + geometry.height * .38;
    const nextLink = marker >= geometry.universe.top && marker < geometry.finale.top
      ? '#univers'
      : marker >= geometry.reveal.top && marker < geometry.universe.top ? '#flacon' : '';
    header.classList.toggle('is-scrolled', currentScroll > 22);
    if (activeLink !== nextLink) {
      activeLink = nextLink;
      for (const link of navigation) {
        if (link.hash === activeLink) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
    if (reducedMotion.matches) return;

    setStyle(header, { '--reading': clamp(currentScroll / geometry.pageTravel) });
    if (currentScroll <= geometry.hero.height) {
      setStyle(hero, {
        '--sky-y': `${currentScroll * .34}px`,
        '--fog-y': `${currentScroll * .25}px`,
        '--title-y': `${currentScroll * .14}px`,
        '--bottle-y': `${currentScroll * .22}px`,
      });
    } else if (hero.style.cssText) {
      hero.removeAttribute('style');
    }

    tableaux.forEach((tableau, i) => {
      const box = geometry.tableaux[i];
      const position = clamp((currentScroll + geometry.height - box.top) / (geometry.height + box.height));
      setStyle(tableau, {
        '--frame-y': `${(position - .5) * (compact.matches ? 48 : 94)}px`,
        '--frame-scale': 1.03 + (1 - position) * .07,
        '--aperture': `${34 + 32 * Math.sin(position * Math.PI)}%`,
      });
    });

    const finaleEntry = (currentScroll + geometry.height - geometry.finale.top) / geometry.height;
    halo.progress = ease(clamp((finaleEntry - .13) / .85));
    setStyle(finale, { '--halo': .22 + halo.progress * .78 });
  }

  function updateBottle() {
    const progress = ease(clamp((currentScroll - geometry.reveal.top) / geometry.revealTravel));
    pointer.x += (pointer.targetX - pointer.x) * .15;
    pointer.y += (pointer.targetY - pointer.y) * .15;
    const pitch = 5 - progress * 8 - pointer.y * 9;
    const yaw = -26 + progress * 54 + pointer.x * 12;
    const roll = -7 + progress * 12;
    setStyle(stage, {
      '--lift': `${12 - progress * 27}px`,
      '--tilt-x': `${pitch}deg`,
      '--tilt-y': `${yaw}deg`,
      '--roll': `${roll}deg`,
      '--scale': .89 + progress * .25,
      '--orbit': `${-23 + progress * 24}deg`,
      '--sheen': `${(1 - progress) * 100}%`,
      '--sheen-strength': Math.sin(progress * Math.PI) * .92,
    });
    bottles?.paint('reveal', pitch, yaw, roll, progress * 2 - 1);
  }

  function visible(box) {
    return currentScroll + geometry.height > box.top && currentScroll < box.top + box.height;
  }

  function render(timestamp) {
    frameId = 0;
    if (layoutChanged) {
      measure();
      layoutChanged = false;
    }
    if (scrollChanged) {
      updateScroll();
      scrollChanged = false;
    }
    if (document.hidden) return;

    const heroVisible = visible(geometry.hero);
    const revealVisible = visible(geometry.reveal);
    const finaleVisible = visible(geometry.finale);
    if (reducedMotion.matches) {
      if (heroVisible) bottles?.paint('hero', -2, 5, 0, -.45);
      if (revealVisible) bottles?.paint('reveal', -3, -17, -3, -.55);
      if (finaleVisible) bottles?.paint('finale', -2, 6, 0, .45);
      return;
    }

    const seconds = timestamp / 1000;
    const lightSeconds = Math.floor(seconds * 30) / 30;
    if (heroVisible) {
      const progress = clamp(currentScroll / geometry.hero.height);
      bottles?.paint('hero', -2 + progress * 4, 5 + progress * 17, -progress * 4, Math.sin(lightSeconds * .65) * .65);
    }
    if (revealVisible) updateBottle();
    if (finaleVisible) {
      bottles?.paint('finale', -3, 9 - halo.progress * 6, 0, Math.sin(lightSeconds * .44 + 1) * .58);
    }

    let moving = revealVisible && (Math.abs(pointer.targetX - pointer.x) + Math.abs(pointer.targetY - pointer.y) > .002);
    for (const field of fields) {
      if (field.isFinale ? finaleVisible : heroVisible) {
        field.paint(seconds, field.isFinale ? 0 : currentScroll, field.isFinale ? halo : null);
        moving = true;
      }
    }
    if (moving) schedule();
  }

  function schedule() {
    if (!frameId) frameId = requestAnimationFrame(render);
  }

  function onResize() {
    layoutChanged = true;
    scrollChanged = true;
    schedule();
  }

  function resetPointer() {
    pointer.targetX = 0;
    pointer.targetY = 0;
    schedule();
  }

  stage.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || !precisePointer.matches || event.pointerType === 'touch') return;
    const bounds = stage.getBoundingClientRect();
    pointer.targetX = clamp((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.targetY = clamp((event.clientY - bounds.top) / bounds.height) * 2 - 1;
    schedule();
  });
  stage.addEventListener('pointerleave', resetPointer);
  stage.addEventListener('pointercancel', resetPointer);
  window.addEventListener('scroll', () => {
    scrollChanged = true;
    schedule();
  }, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      for (const surface of animatedSurfaces) surface.removeAttribute('style');
      pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0;
    }
    onResize();
  });
  onResize();

  if (typeof createCosmosBottles === 'function') {
    const poster = hero.querySelector('.bottle');
    const prepareBottles = () => {
      // Give the decoded poster a paint before compiling the WebGL shaders.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bottles = createCosmosBottles(document.querySelectorAll('[data-bottle-scene]'), schedule);
        onResize();
      }));
    };
    poster.decode().then(prepareBottles, prepareBottles);
  }
})();
