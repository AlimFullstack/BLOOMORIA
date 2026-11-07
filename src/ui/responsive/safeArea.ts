import Phaser from 'phaser';

export interface SafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const ZERO: SafeInsets = { left: 0, right: 0, top: 0, bottom: 0 };
let cachedInsets: SafeInsets = ZERO;
let cacheValid = false;
let invalidateInstalled = false;

function installInvalidation(): void {
  if (invalidateInstalled || typeof window === 'undefined') return;
  invalidateInstalled = true;
  const invalidate = (): void => {
    cacheValid = false;
  };
  window.addEventListener('resize', invalidate, { passive: true });
  window.addEventListener('orientationchange', invalidate);
  window.screen?.orientation?.addEventListener?.('change', invalidate);
  window.visualViewport?.addEventListener('resize', invalidate, { passive: true });
  window.visualViewport?.addEventListener('scroll', invalidate, { passive: true });
  document.addEventListener('fullscreenchange', invalidate);
  document.addEventListener('webkitfullscreenchange', invalidate as EventListener);
}

export function invalidateSafeInsetsCache(): void {
  cacheValid = false;
}

/**
 * Read CSS safe-area insets (env) and convert to Phaser game logical coordinates.
 * Cached and invalidated on viewport/orientation/fullscreen changes to avoid per-frame
 * DOM layout/reflow on mobile (HUDs call this during render).
 */
export function readSafeInsets(scene: Phaser.Scene): SafeInsets {
  if (cacheValid) return cachedInsets;
  installInvalidation();
  if (typeof document === 'undefined' || !document.body) {
    cachedInsets = ZERO;
    cacheValid = true;
    return cachedInsets;
  }
  try {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const px = (v: string): number => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    const css = {
      left: px(cs.paddingLeft),
      right: px(cs.paddingRight),
      top: px(cs.paddingTop),
      bottom: px(cs.paddingBottom),
    };
    el.remove();

    const canvas = scene.game.canvas;
    if (!canvas) {
      cachedInsets = css;
      cacheValid = true;
      return cachedInsets;
    }
    const rect = canvas.getBoundingClientRect();
    const rw = Math.max(1, rect.width || 0);
    const rh = Math.max(1, rect.height || 0);
    const gw = scene.scale.width || rw;
    const gh = scene.scale.height || rh;
    const sx = gw / rw;
    const sy = gh / rh;
    // Map viewport-edge safe insets into game logical coords, accounting for visualViewport and letterboxing.
    const vv = window.visualViewport;
    let canvasLeft = rect.left;
    let canvasTop = rect.top;
    let canvasRight = (vv?.width ?? window.innerWidth) - rect.right;
    let canvasBottom = (vv?.height ?? window.innerHeight) - rect.bottom;
    if (vv) {
      canvasLeft = rect.left - vv.offsetLeft;
      canvasTop = rect.top - vv.offsetTop;
      canvasRight = vv.width - (rect.right - vv.offsetLeft);
      canvasBottom = vv.height - (rect.bottom - vv.offsetTop);
    }
    cachedInsets = {
      left: Math.max(0, css.left - Math.max(0, canvasLeft)) * sx,
      right: Math.max(0, css.right - Math.max(0, canvasRight)) * sx,
      top: Math.max(0, css.top - Math.max(0, canvasTop)) * sy,
      bottom: Math.max(0, css.bottom - Math.max(0, canvasBottom)) * sy,
    };
    cacheValid = true;
    return cachedInsets;
  } catch {
    // Fail-safe: never let safe-area measurement crash rendering/input.
    cachedInsets = ZERO;
    cacheValid = true;
    return cachedInsets;
  }
}

export function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return 'ontouchstart' in window || (nav.maxTouchPoints ?? 0) > 0;
}
