(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');

  function createBottleVolume(parent, type) {
    const volume = document.createElement('div');
    volume.className = `bottle-volume bottle-${type}`;
    const faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
    let frontFace;
    faces.forEach((faceName) => {
      const face = document.createElement('div');
      face.className = `face face-${faceName}`;
      if (faceName === 'front') frontFace = face;
      volume.appendChild(face);
    });
    parent.appendChild(volume);
    return { volume, frontFace };
  }

  function buildBottleModel(host) {
    const solid = document.createElement('div');
    solid.className = 'bottle-solid';
    createBottleVolume(solid, 'cap');
    createBottleVolume(solid, 'neck');
    const body = createBottleVolume(solid, 'body');

    const liquid = document.createElement('div');
    liquid.className = 'bottle-liquid';
    body.frontFace.appendChild(liquid);

    const label = document.createElement('div');
    label.className = 'bottle-label';
    const name = document.createElement('strong');
    name.textContent = 'COSMOS';
    const maker = document.createElement('span');
    maker.textContent = 'SANDBOX';
    label.append(name, maker);
    body.frontFace.appendChild(label);

    const engraving = document.createElement('span');
    engraving.className = 'bottle-engraving';
    engraving.textContent = 'EAU DE PARFUM';
    body.frontFace.appendChild(engraving);

    host.appendChild(solid);
    requestAnimationFrame(() => host.classList.add('is-ready'));
  }

  document.querySelectorAll('[data-bottle-model]').forEach(buildBottleModel);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const story = document.querySelector('.story');
  const storyStage = document.querySelector('.story-sticky');
  const chapters = [...document.querySelectorAll('.chapter')];
  let activeScene = -1;
  let scrollQueued = false;

  function updateStory() {
    scrollQueued = false;
    if (!story || !storyStage) return;
    const rect = story.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / travel, 0, 1);
    const scene = progress < 0.34 ? 0 : progress < 0.68 ? 1 : 2;
    storyStage.style.setProperty('--story-progress', progress.toFixed(3));
    storyStage.style.setProperty('--story-rotate', reducedMotion ? '0deg' : `${(-16 + progress * 32).toFixed(1)}deg`);
    storyStage.style.setProperty('--story-roll', reducedMotion ? '0deg' : `${(Math.sin(progress * Math.PI * 2) * 2.2).toFixed(1)}deg`);
    storyStage.style.setProperty('--story-y', reducedMotion ? '0px' : `${(Math.sin(progress * Math.PI) * -10).toFixed(1)}px`);
    if (scene !== activeScene) {
      activeScene = scene;
      storyStage.dataset.scene = String(scene);
      chapters.forEach((chapter, index) => {
        chapter.classList.toggle('is-active', index === scene);
        chapter.setAttribute('aria-hidden', index === scene ? 'false' : 'true');
      });
    }
  }

  function queueStoryUpdate() {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(updateStory);
  }
  window.addEventListener('scroll', queueStoryUpdate, { passive: true });
  window.addEventListener('resize', queueStoryUpdate, { passive: true });
  updateStory();

  const revealItems = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-parallax]').forEach((item) => {
      let frame = 0;
      item.addEventListener('pointermove', (event) => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const bounds = item.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width - 0.5;
          const y = (event.clientY - bounds.top) / bounds.height - 0.5;
          item.style.setProperty('--tilt-x', `${(x * 5).toFixed(2)}deg`);
          item.style.setProperty('--tilt-y', `${(-y * 4).toFixed(2)}deg`);
          if (item.classList.contains('story-product')) {
            item.style.setProperty('--story-x', `${(x * 12).toFixed(1)}px`);
            item.style.setProperty('--story-y', `${(y * 10).toFixed(1)}px`);
          } else {
            item.style.setProperty('--float-x', `${(x * 9).toFixed(1)}px`);
            item.style.setProperty('--float-y', `${(y * 8).toFixed(1)}px`);
          }
        });
      });
      item.addEventListener('pointerleave', () => {
        item.style.setProperty('--tilt-x', '0deg');
        item.style.setProperty('--tilt-y', '0deg');
        item.style.setProperty(item.classList.contains('story-product') ? '--story-x' : '--float-x', '0px');
        item.style.setProperty(item.classList.contains('story-product') ? '--story-y' : '--float-y', '0px');
      });
    });
  }

  const finaleParticles = document.querySelector('.finale-particles');
  if (finaleParticles) {
    const particleCount = window.matchMedia('(max-width: 760px)').matches ? 20 : 38;
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.46;
    for (let index = 0; index < particleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.48 + Math.random() * 0.72);
      const particle = document.createElement('i');
      particle.className = 'halo-particle';
      particle.style.setProperty('--x', `${(Math.cos(angle) * distance).toFixed(1)}px`);
      particle.style.setProperty('--y', `${(Math.sin(angle) * distance).toFixed(1)}px`);
      particle.style.setProperty('--size', `${(Math.random() * 1.5 + 1).toFixed(1)}px`);
      particle.style.setProperty('--duration', `${(6 + Math.random() * 5).toFixed(1)}s`);
      particle.style.setProperty('--delay', `${(-Math.random() * 10).toFixed(1)}s`);
      finaleParticles.appendChild(particle);
    }
  }

  const canvas = document.querySelector('.starfield');
  const context = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !context) return;

  const stars = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let pointerX = -1000;
  let pointerY = -1000;
  const isSmall = window.matchMedia('(max-width: 760px)').matches;
  const starCount = reducedMotion ? (isSmall ? 28 : 58) : (isSmall ? 38 : 92);

  function resizeCanvas() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (!stars.length) {
      for (let index = 0; index < starCount; index += 1) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 1.15 + 0.25,
          alpha: Math.random() * 0.58 + 0.14,
          phase: Math.random() * Math.PI * 2,
          drift: Math.random() * 0.09 + 0.015,
          tint: Math.random() > 0.72 ? '194, 166, 242' : '222, 229, 255',
        });
      }
    }
    paint(0);
  }

  function paint(time) {
    context.clearRect(0, 0, width, height);
    stars.forEach((star) => {
      const twinkle = reducedMotion ? 1 : 0.72 + Math.sin(time * 0.0007 + star.phase) * 0.28;
      let x = star.x;
      let y = star.y + (reducedMotion ? 0 : Math.sin(time * 0.00015 + star.phase) * 3);
      const dx = x - pointerX;
      const dy = y - pointerY;
      const distance = Math.hypot(dx, dy);
      if (!reducedMotion && distance < 70) {
        const force = (70 - distance) / 70;
        x += (dx / (distance || 1)) * force * 6;
        y += (dy / (distance || 1)) * force * 6;
      }
      context.beginPath();
      context.fillStyle = `rgba(${star.tint}, ${star.alpha * twinkle})`;
      context.shadowBlur = star.radius > 0.9 ? 7 : 0;
      context.shadowColor = `rgba(${star.tint}, .7)`;
      context.arc(x, y, star.radius, 0, Math.PI * 2);
      context.fill();
    });
    context.shadowBlur = 0;
    if (!reducedMotion) window.requestAnimationFrame(paint);
  }

  window.addEventListener('resize', resizeCanvas, { passive: true });
  if (!reducedMotion) {
    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    }, { passive: true });
  }
  resizeCanvas();
})();
