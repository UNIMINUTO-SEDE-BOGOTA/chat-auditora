// ============================================================
// components/Splash.ts
// Pantalla de bienvenida GALÁCTICA
// Órbitas giratorias + MUCHAS estrellas fijas parpadeantes
// ============================================================

const AVATARS = [
  '/ava_frente.png',
  '/ava_lado.png',
  '/ava_derecha.png',
];

const AVATAR_INTERVAL_MS = 900;
const SPLASH_DURATION_MS = 3800;

export function initSplash(onDone: () => void): void {
  const splash = document.getElementById('splashScreen');
  if (!splash) { onDone(); return; }

  // Limpiar contenido existente
  splash.innerHTML = '';

  // Crear fondo con estrellas fijas
  const starsBg = document.createElement('div');
  starsBg.className = 'splash-stars-bg';
  
  // TIPOS DE ESTRELLAS Y SUS CANTIDADES
  const starTypes = [
    { type: 'splash-star-small', count: 300, className: 'splash-star-small' },
    { type: 'splash-star-medium', count: 150, className: 'splash-star-medium' },
    { type: 'splash-star-large', count: 50, className: 'splash-star-large' },
    { type: 'splash-star-orange', count: 40, className: 'splash-star-orange' },
    { type: 'splash-star-teal', count: 40, className: 'splash-star-teal' },
    { type: 'splash-star-gold', count: 40, className: 'splash-star-gold' },
  ];
  
  // Generar todas las estrellas
  starTypes.forEach(starType => {
    for (let i = 0; i < starType.count; i++) {
      const star = document.createElement('div');
      star.className = starType.className;
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.animationDelay = `${Math.random() * 5}s`;
      star.style.animationDuration = `${1 + Math.random() * 4}s`;
      starsBg.appendChild(star);
    }
  });

  // Crear ÓRBITAS (7 en total)
  const orbits = [
    { className: 'splash-orbit-1' },
    { className: 'splash-orbit-2' },
    { className: 'splash-orbit-3' },
    { className: 'splash-orbit-4' },
    { className: 'splash-orbit-5' },
    { className: 'splash-orbit-6' },
    { className: 'splash-orbit-7' },
  ];
  
  orbits.forEach(orbit => {
    const orbitElement = document.createElement('div');
    orbitElement.className = orbit.className;
    starsBg.appendChild(orbitElement);
  });

  // Crear contenido central
  const content = document.createElement('div');
  content.className = 'splash-content';
  content.innerHTML = `
    <div class="splash-avatar-wrap">
      <img id="splashAvatar" src="${AVATARS[0]}" alt="EVA">
    </div>
    <div class="splash-logo">EVA</div>
    <div class="splash-subtitle">Asistente Virtual de Apoyo</div>
    <div class="splash-hint">🌠 Toca para saltar 🌠</div>
  `;
  
  splash.appendChild(starsBg);
  splash.appendChild(content);

  // Preload avatars
  AVATARS.forEach(src => { const i = new Image(); i.src = src; });

  // Cycle avatars
  let avatarIndex = 0;
  const avatarEl = document.getElementById('splashAvatar') as HTMLImageElement | null;

  if (avatarEl) {
    const cycleTimer = setInterval(() => {
      if (!avatarEl) return;
      avatarEl.style.opacity = '0';
      setTimeout(() => {
        avatarIndex = (avatarIndex + 1) % AVATARS.length;
        avatarEl.src = AVATARS[avatarIndex];
        avatarEl.style.opacity = '1';
      }, 300);
    }, AVATAR_INTERVAL_MS);

    // Auto-dismiss after duration
    setTimeout(() => {
      clearInterval(cycleTimer);
      dismissSplash(splash, onDone);
    }, SPLASH_DURATION_MS);
  }

  // Skip on click / tap
  splash.addEventListener('click', () => {
    dismissSplash(splash, onDone);
  }, { once: true });
}

function dismissSplash(splash: HTMLElement, onDone: () => void): void {
  splash.classList.add('splash-exit');
  splash.addEventListener('animationend', () => {
    splash.remove();
    onDone();
  }, { once: true });
}