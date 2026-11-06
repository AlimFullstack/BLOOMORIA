import { createPhaserGame } from './app/createPhaserGame';

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

createPhaserGame();
installBestEffortAutoFullscreen();
