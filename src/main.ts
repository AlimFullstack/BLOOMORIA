import { createPhaserGame } from './app/createPhaserGame';

function installRuntimeErrorGuards(): void {
  if (typeof window === 'undefined') return;
  const seen = new Set<string>();
  const log = (kind: string, detail: unknown): void => {
    try {
      const msg =
        detail instanceof Error
          ? `${detail.name}: ${detail.message}`
          : typeof detail === 'string'
            ? detail
            : JSON.stringify(detail);
      const key = `${kind}:${msg}`.slice(0, 240);
      if (seen.has(key)) return;
      seen.add(key);
      console.error(`[BLOOMORIA] ${kind}`, detail);
    } catch {
      // never interfere with gameplay
    }
  };
  window.addEventListener('error', (e) => log('runtime-error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => log('unhandled-rejection', e.reason));
}

installRuntimeErrorGuards();

function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return ('ontouchstart' in window || (nav.maxTouchPoints ?? 0) > 0) && !!window.document;
}

function tryEnterFullscreenOnce(): void {
  if (typeof document === 'undefined') return;
  const doc = document as Document & {
    fullscreenElement?: Element | null;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
  const target = (document.getElementById('game-root') ??
    document.documentElement) as HTMLElement & {
    requestFullscreen?: () => Promise<void> | void;
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const req = target.requestFullscreen ?? target.webkitRequestFullscreen;
  if (typeof req !== 'function') return;
  try {
    void Promise.resolve(req.call(target)).catch(() => undefined);
  } catch {
    // Browser restriction / unsupported (e.g. iOS Safari gesture policy) — ignore, game still runs.
  }
}

function installBestEffortAutoFullscreen(): void {
  // Browsers usually require a user gesture for fullscreen. Attempt once on load (may be rejected)
  // and, if still not fullscreen, retry on the first real user gesture only. No loops, no blocking.
  if (!isTouchCapable()) return;
  tryEnterFullscreenOnce();
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const onFirstGesture = (): void => {
    tryEnterFullscreenOnce();
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('touchstart', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
  };
  window.addEventListener('pointerdown', onFirstGesture, { capture: true, once: true });
  window.addEventListener('touchstart', onFirstGesture, { capture: true, once: true });
  window.addEventListener('keydown', onFirstGesture, { capture: true, once: true });
}

function updateViewportCssVars(): void {
  if (typeof window === 'undefined' || !document.documentElement) return;
  const root = document.getElementById('app') ?? document.documentElement;
  const rect = root.getBoundingClientRect?.();
  const vv = window.visualViewport;
  const vw = rect?.width || vv?.width || document.documentElement.clientWidth || window.innerWidth;
  const vh =
    rect?.height || vv?.height || document.documentElement.clientHeight || window.innerHeight;
  const w = Math.max(1, Math.round(vw));
  const h = Math.max(1, Math.round(vh));
  document.documentElement.style.setProperty('--app-vw', `${w}px`);
  document.documentElement.style.setProperty('--app-vh', `${h}px`);
}

function installViewportHandling(refreshScale: () => void): void {
  if (typeof window === 'undefined') return;
  updateViewportCssVars();
  let raf = 0;
  const schedule = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      try {
        updateViewportCssVars();
        // Avoid refreshing into a collapsed viewport during rotation transitions (prevents black screen on mobile).
        const vw =
          Number.parseFloat(document.documentElement.style.getPropertyValue('--app-vw')) || 0;
        const vh =
          Number.parseFloat(document.documentElement.style.getPropertyValue('--app-vh')) || 0;
        if (vw < 32 || vh < 32) return;
        refreshScale();
      } catch {
        // never block game
      }
    });
  };
  const scheduleDelayed = (): void => {
    schedule();
    window.setTimeout(schedule, 50);
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 250);
    window.setTimeout(schedule, 500);
    window.setTimeout(schedule, 900);
  };
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', scheduleDelayed);
  window.screen?.orientation?.addEventListener?.('change', scheduleDelayed);
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleDelayed();
  });
  document.addEventListener('fullscreenchange', scheduleDelayed);
  document.addEventListener('webkitfullscreenchange', scheduleDelayed as EventListener);
}

const game = createPhaserGame();
if (typeof window !== 'undefined') {
  (window as unknown as { game: Phaser.Game }).game = game;
}
installBestEffortAutoFullscreen();
installViewportHandling(() => {
  try {
    game.scale.refresh();
  } catch {
    // ignore
  }
});
