// ─────────────────────────────────────────────────────────────────────────────
// AVA GUIDED TOUR — v2  (TypeScript, zero dependencies)
// ─────────────────────────────────────────────────────────────────────────────
//
// KEY IMPROVEMENTS over v1
// ─────────────────────────
// 1. Single positionTooltip() engine: tries every side in priority order until
//    one fits; no more manual px offsets per step.
// 2. ResizeObserver + scroll listener automatically reposition the tooltip when
//    the layout changes (sidebar open/close, viewport resize, scroll).
// 3. Arrow indicator rendered once in the DOM and always points to the target.
// 4. Smooth entrance animation via a tiny CSS class added after placement.
// 5. Fully typed — no implicit `any`.
// 6. A single exported `createTour(steps, options?)` factory so the caller
//    never has to touch globals.
//
// USAGE
// ──────
//   import { createTour } from './tour';
//
//   const tour = createTour(STEPS);
//   document.getElementById('tourReplayBtn')?.addEventListener('click', () => tour.start());
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TourStep {
  /** id of the element to highlight */
  targetId: string;
  title: string;
  text: string;
  /** src of the mascot image shown in the tooltip */
  avatar?: string;
  /**
   * Sidebar behaviour on mobile.
   * 'open'  → openSidebar() is called before this step.
   * 'close' → closeSidebar() is called.
   * 'keep'  → do nothing (default).
   */
  mobileSidebar?: 'open' | 'close' | 'keep';
  /**
   * Preferred side order for the auto-placement engine.
   * The engine tries each side in the given order and picks the first one that
   * fits inside the viewport without clipping.
   * Default: ['right', 'left', 'bottom', 'top']
   */
  preferredSides?: Side[];
  /**
   * Alignment along the axis perpendicular to the chosen side.
   * Default: 'center'
   */
  align?: Align;
}

export interface TourOptions {
  /** localStorage key used to suppress auto-start on repeat visits */
  storageKey?: string;
  /** Delay (ms) before the first step renders */
  startDelay?: number;
  /** Gap (px) between the target element and the tooltip box */
  gap?: number;
  /** Minimum margin (px) from the viewport edges */
  margin?: number;
  /** Mobile breakpoint (px) — ≤ this value = mobile */
  mobileBreakpoint?: number;
  /** Hook: called when sidebar needs to open (replaces openSidebar logic) */
  onOpenSidebar?: () => void;
  /** Hook: called when sidebar needs to close */
  onCloseSidebar?: () => void;
  /** Hook: called when the tour finishes */
  onEnd?: () => void;
}

type Side  = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

// ── Constants ─────────────────────────────────────────────────────────────────

const ARROW_SIZE = 10; // px, half-width of the arrow triangle

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTour(steps: TourStep[], options: TourOptions = {}) {
  const {
    storageKey      = 'ava_tour_done',
    startDelay      = 800,
    gap             = 14,
    margin          = 10,
    mobileBreakpoint = 768,
    onOpenSidebar,
    onCloseSidebar,
    onEnd,
  } = options;

  // ── DOM refs (resolved lazily so the tour can be imported before the DOM is ready) ──

  function $<T extends HTMLElement>(id: string) {
    return document.getElementById(id) as T | null;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  let currentStep   = 0;
  let highlightEl: HTMLElement | null = null;
  let repositionRAF = 0;
  let resizeObs: ResizeObserver | null = null;

  // ── Sidebar helpers ────────────────────────────────────────────────────────

  function openSidebar() {
    if (onOpenSidebar) { onOpenSidebar(); return; }
    $('sidebar')?.classList.add('sidebar-open');
    $('sidebarOverlay')?.classList.remove('hidden');
  }
  function closeSidebar() {
    if (onCloseSidebar) { onCloseSidebar(); return; }
    $('sidebar')?.classList.remove('sidebar-open');
    $('sidebarOverlay')?.classList.add('hidden');
  }

  // ── Highlight ──────────────────────────────────────────────────────────────

  function setHighlight(el: HTMLElement | null) {
    highlightEl?.classList.remove('tour-highlight');
    highlightEl = el;
    highlightEl?.classList.add('tour-highlight');
  }

  // ── Auto-placement engine ──────────────────────────────────────────────────

  /**
   * Computes { top, left } for the tooltip given a target rect and a preferred
   * sides list.  Tries each side in order and returns the first one that does
   * NOT overflow the viewport.  Falls back to 'center' if nothing fits.
   */
  function computePosition(
    rect: DOMRect,
    tW: number,
    tH: number,
    sides: Side[],
    align: Align,
  ): { top: number; left: number; side: Side | 'center' } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    for (const side of sides) {
      let top = 0;
      let left = 0;

      // Primary axis
      switch (side) {
        case 'top':    top  = rect.top    - tH - gap - ARROW_SIZE; break;
        case 'bottom': top  = rect.bottom + gap + ARROW_SIZE;       break;
        case 'left':   left = rect.left   - tW - gap - ARROW_SIZE;  break;
        case 'right':  left = rect.right  + gap + ARROW_SIZE;       break;
      }

      // Secondary axis (alignment)
      if (side === 'top' || side === 'bottom') {
        switch (align) {
          case 'start':  left = rect.left;                          break;
          case 'center': left = rect.left + rect.width / 2 - tW / 2; break;
          case 'end':    left = rect.right - tW;                    break;
        }
      } else {
        switch (align) {
          case 'start':  top = rect.top;                             break;
          case 'center': top = rect.top + rect.height / 2 - tH / 2; break;
          case 'end':    top = rect.bottom - tH;                    break;
        }
      }

      // Clamp & check overflow
      const clampedLeft = Math.max(margin, Math.min(left, vw - tW - margin));
      const clampedTop  = Math.max(margin, Math.min(top,  vh - tH - margin));

      const fitsH = (side === 'left' || side === 'right')
        ? (left >= margin && left + tW <= vw - margin)
        : true;
      const fitsV = (side === 'top'  || side === 'bottom')
        ? (top  >= margin && top  + tH <= vh - tH - margin)  // Note: small tolerance
        : true;

      if (fitsH && fitsV) {
        return { top: Math.round(clampedTop), left: Math.round(clampedLeft), side };
      }
    }

    // Nothing fit — center on screen
    return {
      top:  Math.round(window.innerHeight / 2 - tH / 2),
      left: Math.round(window.innerWidth  / 2 - tW / 2),
      side: 'center',
    };
  }

  /** Positions the arrow element to point toward the target */
  function positionArrow(
    tooltip: HTMLElement,
    rect: DOMRect,
    placedSide: Side | 'center',
    tTop: number,
    tLeft: number,
    tW: number,
    tH: number,
  ) {
    const arrow = tooltip.querySelector<HTMLElement>('.tour-arrow');
    if (!arrow || placedSide === 'center') {
      if (arrow) arrow.style.display = 'none';
      return;
    }
    arrow.style.display = '';

    // Remove previous side classes
    arrow.className = `tour-arrow tour-arrow--${placedSide}`;

    // Center the arrow along the perpendicular axis
    if (placedSide === 'top' || placedSide === 'bottom') {
      const targetCenterX = rect.left + rect.width / 2;
      const arrowX = Math.round(
        Math.max(8, Math.min(targetCenterX - tLeft - ARROW_SIZE, tW - 8 - ARROW_SIZE * 2))
      );
      arrow.style.left = `${arrowX}px`;
      arrow.style.top  = '';
    } else {
      const targetCenterY = rect.top + rect.height / 2;
      const arrowY = Math.round(
        Math.max(8, Math.min(targetCenterY - tTop - ARROW_SIZE, tH - 8 - ARROW_SIZE * 2))
      );
      arrow.style.top  = `${arrowY}px`;
      arrow.style.left = '';
    }
  }

  // ── Main positioning orchestrator ──────────────────────────────────────────

  function positionTooltip(tooltip: HTMLElement, step: TourStep) {
    const target = $(step.targetId);
    if (!target) {
      // No target: float to center
      tooltip.style.position  = 'fixed';
      tooltip.style.top       = '50%';
      tooltip.style.left      = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
      const arrow = tooltip.querySelector<HTMLElement>('.tour-arrow');
      if (arrow) arrow.style.display = 'none';
      return;
    }

    const tW   = tooltip.offsetWidth;
    const tH   = tooltip.offsetHeight;
    const rect = target.getBoundingClientRect();

    const isMob = window.innerWidth <= mobileBreakpoint;
    // On mobile always prefer center (overlay) unless caller specifies sides
    const sides: Side[] = (!isMob && step.preferredSides)
      ? step.preferredSides
      : (isMob ? ['bottom', 'top', 'right', 'left'] : ['right', 'left', 'bottom', 'top']);

    const align = step.align ?? 'center';
    const { top, left, side } = computePosition(rect, tW, tH, sides, align);

    tooltip.style.position  = 'fixed';
    tooltip.style.transform = '';
    tooltip.style.top       = `${top}px`;
    tooltip.style.left      = `${left}px`;

    positionArrow(tooltip, rect, side, top, left, tW, tH);
  }

  // ── Reactive repositioning ─────────────────────────────────────────────────

  function scheduleReposition() {
    cancelAnimationFrame(repositionRAF);
    repositionRAF = requestAnimationFrame(() => {
      const tooltip = $('tourTooltip');
      if (!tooltip || tooltip.classList.contains('hidden')) return;
      const step = STEPS_REF[currentStep];
      if (step) positionTooltip(tooltip, step);
    });
  }

  // We keep a reference to the steps array so the reactive callbacks can see it
  let STEPS_REF: TourStep[] = steps;

  function attachReactiveListeners() {
    window.addEventListener('resize', scheduleReposition, { passive: true });
    window.addEventListener('scroll', scheduleReposition, { passive: true, capture: true });

    // Watch the sidebar for size changes (triggered by sidebar-open class)
    resizeObs = new ResizeObserver(scheduleReposition);
    const sidebar = $('sidebar');
    if (sidebar) resizeObs.observe(sidebar);
  }

  function detachReactiveListeners() {
    window.removeEventListener('resize', scheduleReposition);
    window.removeEventListener('scroll', scheduleReposition, { capture: true } as EventListenerOptions);
    resizeObs?.disconnect();
    resizeObs = null;
  }

  // ── Step rendering ─────────────────────────────────────────────────────────

  function showStep(index: number) {
    const step = STEPS_REF[index];
    if (!step) { endTour(); return; }

    const isMob = window.innerWidth <= mobileBreakpoint;

    // Sidebar management
    if (isMob) {
      if (step.mobileSidebar === 'open')  openSidebar();
      if (step.mobileSidebar === 'close') closeSidebar();
    }

    // Update UI text
    const labelEl  = $('tourStepLabel');
    const titleEl  = $('tourTooltipTitle');
    const textEl   = $('tourTooltipText');
    const prevBtn  = $<HTMLButtonElement>('tourPrevBtn');
    const nextBtn  = $<HTMLButtonElement>('tourNextBtn');
    const avatarEl = $<HTMLImageElement>('tourAvatar');
    const tooltip  = $('tourTooltip')!;

    if (labelEl) labelEl.textContent = `${index + 1} / ${STEPS_REF.length}`;
    if (titleEl) titleEl.textContent = step.title;
    if (textEl)  textEl.textContent  = step.text;
    if (prevBtn) prevBtn.disabled    = index === 0;
    if (nextBtn) nextBtn.textContent = index === STEPS_REF.length - 1 ? 'Finalizar ✓' : 'Siguiente →';

    if (avatarEl && step.avatar) {
      const newSrc = step.avatar;
      const isSameImage = avatarEl.src.endsWith(newSrc);
      if (isSameImage && avatarEl.complete && avatarEl.naturalWidth > 0) {
        avatarEl.style.opacity = '1';
      } else {
        // Crossfade: fade out → swap src → fade in
        avatarEl.style.transition = 'opacity 0.18s ease';
        avatarEl.style.opacity = '0';
        setTimeout(() => {
          avatarEl.src = newSrc;
          avatarEl.onload  = () => { avatarEl.style.opacity = '1'; };
          avatarEl.onerror = () => { avatarEl.src = '/icon-ava.png'; avatarEl.style.opacity = '1'; };
          if (avatarEl.complete && avatarEl.naturalWidth > 0) avatarEl.style.opacity = '1';
        }, 180);
      }
    }

    // Show backdrop
    $('tourBackdrop')?.classList.remove('hidden');

    // Highlight target
    setHighlight($(step.targetId));

    // Hide tooltip off-screen while measuring, then position
    tooltip.classList.remove('hidden', 'tour-enter');
    tooltip.style.visibility = 'hidden';
    tooltip.style.top  = '-9999px';
    tooltip.style.left = '-9999px';

    // Sidebar animation takes ~300 ms; other steps need no delay
    const delay = isMob && step.mobileSidebar === 'open' ? 320 : 0;

    setTimeout(() => {
      // Double RAF to ensure layout is fully painted after sidebar transition
      requestAnimationFrame(() => requestAnimationFrame(() => {
        positionTooltip(tooltip, step);
        tooltip.style.visibility = '';
        // Trigger entrance animation
        void tooltip.offsetWidth; // force reflow
        tooltip.classList.add('tour-enter');
      }));
    }, delay);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function nextStep() {
    if (currentStep < STEPS_REF.length - 1) showStep(++currentStep);
    else endTour();
  }
  function prevStep() {
    if (currentStep > 0) showStep(--currentStep);
  }
  function endTour() {
    $('tourTooltip')?.classList.add('hidden');
    $('tourBackdrop')?.classList.add('hidden');
    setHighlight(null);
    if (window.innerWidth <= mobileBreakpoint) closeSidebar();
    detachReactiveListeners();
    localStorage.setItem(storageKey, '1');
    onEnd?.();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function start() {
    STEPS_REF = steps; // allow hot-swapping steps
    currentStep = 0;
    attachReactiveListeners();
    showStep(0);
  }

  function init() {
    $('tourCloseBtn')?.addEventListener('click', endTour);
    $('tourNextBtn')?.addEventListener('click', nextStep);
    $('tourPrevBtn')?.addEventListener('click', prevStep);
    $('tourReplayBtn')?.addEventListener('click', start);
    if (!localStorage.getItem(storageKey)) setTimeout(start, startDelay);
  }

  return { init, start, next: nextStep, prev: prevStep, end: endTour };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS to inject (copy into your stylesheet or call injectTourStyles())
// ─────────────────────────────────────────────────────────────────────────────

export function injectTourStyles() {
  if (document.getElementById('ava-tour-styles')) return;
  const style = document.createElement('style');
  style.id = 'ava-tour-styles';
  style.textContent = TOUR_CSS;
  document.head.appendChild(style);
}

export const TOUR_CSS = /* css */ `
/* ── Backdrop ──────────────────────────────────────────────────────────────── */
#tourBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 9998;
  transition: opacity 0.25s;
}
#tourBackdrop.hidden { display: none; }

/* ── Highlight ─────────────────────────────────────────────────────────────── */
.tour-highlight {
  position: relative;
  z-index: 9999 !important;
  border-radius: 6px;
  outline: 2px solid var(--tour-accent, #7c6af7);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(124, 106, 247, 0.25);
  transition: outline 0.2s, box-shadow 0.2s;
}

/* ── Tooltip ───────────────────────────────────────────────────────────────── */
#tourTooltip {
  position: fixed;
  z-index: 10000;
  width: min(320px, calc(100vw - 24px));
  background: var(--tour-bg, #ffffff);
  color: var(--tour-text, #1a1a2e);
  border-radius: 14px;
  box-shadow:
    0 4px 6px -1px rgba(0,0,0,0.12),
    0 12px 28px -4px rgba(0,0,0,0.18),
    0 0 0 1px rgba(0,0,0,0.06);
  padding: 18px 20px 16px;
  /* Entrance animation (added via JS) */
  opacity: 1;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(.34,1.36,.64,1);
}
#tourTooltip.hidden { display: none; }
#tourTooltip.tour-enter {
  animation: tourPop 0.28s cubic-bezier(.34,1.36,.64,1) both;
}
@keyframes tourPop {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

/* ── Arrow ─────────────────────────────────────────────────────────────────── */
.tour-arrow {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}
.tour-arrow--right  { right: -10px; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left:  10px solid var(--tour-bg, #fff); }
.tour-arrow--left   { left:  -10px; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-right: 10px solid var(--tour-bg, #fff); }
.tour-arrow--bottom { bottom:-10px; border-left: 10px solid transparent; border-right:  10px solid transparent; border-top:   10px solid var(--tour-bg, #fff); }
.tour-arrow--top    { top:   -10px; border-left: 10px solid transparent; border-right:  10px solid transparent; border-bottom:10px solid var(--tour-bg, #fff); }

/* ── Header ────────────────────────────────────────────────────────────────── */
.tour-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
#tourAvatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  object-position: top center;
  flex-shrink: 0;
  transition: opacity 0.18s ease;
}
#tourTooltipTitle {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.3;
  flex: 1;
}

/* ── Body ──────────────────────────────────────────────────────────────────── */
#tourTooltipText {
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--tour-muted, #555);
  margin-bottom: 14px;
}

/* ── Footer ────────────────────────────────────────────────────────────────── */
.tour-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
#tourStepLabel {
  font-size: 0.75rem;
  color: var(--tour-muted, #888);
  min-width: 36px;
}
.tour-actions {
  display: flex;
  gap: 6px;
}
.tour-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s, transform 0.1s;
}
.tour-btn:active  { transform: scale(0.96); }
.tour-btn:disabled { opacity: 0.35; cursor: default; }
.tour-btn--ghost  { background: transparent; color: var(--tour-muted, #666); }
.tour-btn--ghost:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
.tour-btn--primary { background: var(--tour-accent, #7c6af7); color: #fff; }
.tour-btn--primary:hover { background: var(--tour-accent-hover, #6758e0); }
.tour-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: none;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: var(--tour-muted, #aaa);
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
}
.tour-close:hover { color: var(--tour-text, #333); }

/* ── Dark mode support ─────────────────────────────────────────────────────── */
@media (prefers-color-scheme: dark) {
  :root {
    --tour-bg:           #1e1e2e;
    --tour-text:         #e2e2f0;
    --tour-muted:        #9090b0;
    --tour-accent:       #a78bfa;
    --tour-accent-hover: #8b70f0;
  }
}
/* Honour explicit .dark class too */
.dark #tourTooltip,
[data-theme="dark"] #tourTooltip {
  --tour-bg:           #1e1e2e;
  --tour-text:         #e2e2f0;
  --tour-muted:        #9090b0;
  --tour-accent:       #a78bfa;
  --tour-accent-hover: #8b70f0;
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// HTML template for the tooltip (paste inside your <body>)
// ─────────────────────────────────────────────────────────────────────────────

export const TOUR_HTML = /* html */ `
<!-- Tour backdrop -->
<div id="tourBackdrop" class="hidden"></div>

<!-- Tour tooltip -->
<div id="tourTooltip" class="hidden" role="dialog" aria-modal="false" aria-labelledby="tourTooltipTitle">
  <!-- Arrow pointer (positioned by JS) -->
  <div class="tour-arrow" aria-hidden="true"></div>

  <!-- Close ✕ -->
  <button id="tourCloseBtn" class="tour-close" aria-label="Cerrar tour">✕</button>

  <!-- Header -->
  <div class="tour-header">
    <img id="tourAvatar" src="/ava-mascota.png" alt="EVA" />
    <span id="tourTooltipTitle"></span>
  </div>

  <!-- Body -->
  <p id="tourTooltipText"></p>

  <!-- Footer -->
  <div class="tour-footer">
    <span id="tourStepLabel"></span>
    <div class="tour-actions">
      <button id="tourPrevBtn" class="tour-btn tour-btn--ghost">← Anterior</button>
      <button id="tourNextBtn" class="tour-btn tour-btn--primary">Siguiente →</button>
    </div>
  </div>
</div>
`;

// ─────────────────────────────────────────────────────────────────────────────
// Example step definitions (same content as original, updated schema)
// ─────────────────────────────────────────────────────────────────────────────

// ── Avatar paths ───────────────────────────────────────────────────────────────
// Four poses of AVA, cycling across the 7 tour steps:
//   paso 1 → ava-mascota  (frente, sonriendo — bienvenida)
//   paso 2 → ava_lado     (de lado — señalando el historial)
//   paso 3 → ava_derecha  (girando a la derecha — apunta al botón Teams)
//   paso 4 → ava_frente   (frente seria — calificación / feedback)
//   paso 5 → ava_lado     (de lado — señala el tema)
//   paso 6 → ava-mascota  (frente — presenta los módulos)
//   paso 7 → ava_derecha  (despedida mirando al botón replay)

export const AVA_STEPS: TourStep[] = [
  {
    targetId: 'newChatBtn',
    title: '➕ Nuevo Chat',
    text: 'Crea una nueva conversación en cualquier momento. Cada chat es independiente y se guarda automáticamente.',
    avatar: '/ava-mascota.png',   // pose: frente sonriendo
    mobileSidebar: 'open',
    preferredSides: ['right', 'bottom', 'left', 'top'],
    align: 'center',
  },
  {
    targetId: 'chatsList',
    title: '💬 Tus conversaciones',
    text: 'Aquí aparecerá tu historial de chats. Haz clic en cualquiera para retomarlo, o usa el ícono 🗑 para eliminarlo.',
    avatar: '/ava_lado.png',      // pose: de lado (señala la lista)
    mobileSidebar: 'open',
    preferredSides: ['right', 'bottom', 'left', 'top'],
    align: 'start',
  },
  {
    targetId: 'teamsBtn',
    title: '👩‍💼 Chat En Línea',
    text: 'Si necesitas una asesoría personalizada, este botón te lleva a Microsoft Teams con alguien experto en el tema.',
    avatar: '/ava_derecha.png',   // pose: mirando a la derecha (apunta al botón)
    mobileSidebar: 'open',
    preferredSides: ['right', 'bottom', 'top', 'left'],
    align: 'center',
  },
  {
    targetId: 'feedbackBtn',
    title: '⭐ Califica tu experiencia',
    text: 'Tu opinión nos ayuda a mejorar. Usa este formulario para reportar fallas, dar sugerencias o calificar tu experiencia con AVA.',
    avatar: '/ava_frente.png',    // pose: frente (expresión atenta)
    mobileSidebar: 'open',
    preferredSides: ['right', 'top', 'bottom', 'left'],
    align: 'center',
  },
  {
    targetId: 'themeToggleBtn',
    title: '🌙 Tema oscuro',
    text: 'Cambia entre el modo claro y oscuro según tu preferencia. La selección se guarda para tus próximas visitas.',
    avatar: '/ava_lado.png',      // pose: de lado (señala el toggle)
    mobileSidebar: 'close',
    preferredSides: ['bottom', 'left', 'top', 'right'],
    align: 'end',
  },
  {
    targetId: 'categoriesGrid',
    title: '🧠 Módulos de AVA',
    text: 'Elige un módulo para comenzar: Capacitación SGC, Simulador de Auditorías y más.',
    avatar: '/ava-mascota.png',   // pose: frente sonriendo (presenta los módulos)
    mobileSidebar: 'close',
    preferredSides: ['top', 'bottom', 'right', 'left'],
    align: 'center',
  },
  {
    targetId: 'tourReplayBtn',
    title: '❓ Repetir tour',
    text: '¡Eso es todo! Si quieres volver a ver este tour en cualquier momento, haz clic en este botón.',
    avatar: '/ava_derecha.png',   // pose: mirando a la derecha (despedida)
    mobileSidebar: 'close',
    preferredSides: ['bottom', 'left', 'top', 'right'],
    align: 'end',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Quick-start helper (mirrors the original initTour() call)
// ─────────────────────────────────────────────────────────────────────────────

export function initTour(customSteps = AVA_STEPS, opts: TourOptions = {}) {
  injectTourStyles();
  const tour = createTour(customSteps, opts);
  tour.init();
  return tour;
}