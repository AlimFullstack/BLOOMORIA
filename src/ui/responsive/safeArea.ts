import Phaser from 'phaser';

export interface SafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Read CSS safe-area insets (env) and convert to Phaser game logical coordinates.
 * In FIT scale mode, logical size stays constant but display size changes; safe
 * areas are CSS pixels at the viewport edge, so we map them proportionally.
 */
export function readSafeInsets(scene: Phaser.Scene): SafeInsets {
  if (typeof document === 'undefined' || !document.body) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
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
  if (!canvas) return css;
  const rect = canvas.getBoundingClientRect();
  const gw = scene.scale.width || rect.width || 1;
  const gh = scene.scale.height || rect.height || 1;
  const sx = gw / Math.max(1, rect.width);
  const sy = gh / Math.max(1, rect.height);
  // Map viewport-edge safe insets into game logical coords, accounting for visualViewport and letterboxing.
  const vv = window.visualViewport;
  let canvasLeft = rect.left;
  let canvasTop = rect.top;
  let canvasRight = window.innerWidth - rect.right;
  let canvasBottom = window.innerHeight - rect.bottom;
  if (vv) {
    canvasLeft = rect.left - vv.offsetLeft;
    canvasTop = rect.top - vv.offsetTop;
    canvasRight = vv.width - (rect.right - vv.offsetLeft);
    canvasBottom = vv.height - (rect.bottom - vv.offsetTop);
  }
  return {
    left: Math.max(0, css.left - Math.max(0, canvasLeft)) * sx,
    right: Math.max(0, css.right - Math.max(0, canvasRight)) * sx,
    top: Math.max(0, css.top - Math.max(0, canvasTop)) * sy,
    bottom: Math.max(0, css.bottom - Math.max(0, canvasBottom)) * sy,
  };
}

export function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return 'ontouchstart' in window || (nav.maxTouchPoints ?? 0) > 0;
}
