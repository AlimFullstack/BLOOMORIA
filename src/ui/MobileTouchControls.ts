import Phaser from 'phaser';
import { readSafeInsets } from './responsive/safeArea';

export interface TouchIntent {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  downPressed: boolean;
  attackHeld: boolean;
  dashPressed: boolean;
  /** True when attack is coming from the mobile Attack button (not mouse/keyboard pointer). */
  attackByTouch: boolean;
  /** Pointer IDs currently captured by touch controls (ignore for mouse/aim pointer attack). */
  capturedPointerIds: ReadonlySet<number>;
}

export interface CooldownState {
  remainingMs: number;
  durationMs: number;
}

type AbilityCooldownProvider = () => CooldownState;

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const COLORS = {
  bg: '#18223A',
  bgActive: '#223055',
  border: '#8589E9',
  borderActive: '#FFFFFF',
  text: '#EAF2FF',
  icon: '#EAF2FF',
  cooldown: '#000000',
  joyBase: '#18223A',
  joyBaseStroke: '#8589E9',
  joyKnob: '#223055',
  joyKnobActive: '#8589E9',
} as const;

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type OrientationLock = {
  lock?: (orientation: 'landscape') => Promise<void>;
};

function getFullscreenElement(doc: FullscreenDocument): Element | null {
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

function canRequestFullscreen(el: FullscreenElement | null): boolean {
  if (!el) return false;
  return !!(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen
  );
}

function requestFullscreenSafe(el: FullscreenElement): Promise<void> | void {
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return undefined;
}

function exitFullscreenSafe(doc: FullscreenDocument): Promise<void> | void {
  if (doc.exitFullscreen) return doc.exitFullscreen();
  if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
  if (doc.mozCancelFullScreen) return doc.mozCancelFullScreen();
  if (doc.msExitFullscreen) return doc.msExitFullscreen();
  return undefined;
}

function tryLockLandscape(): void {
  try {
    const orientation = (screen as Screen & { orientation?: OrientationLock }).orientation;
    const lock = orientation?.lock;
    if (typeof lock === 'function') {
      void Promise.resolve(lock.call(orientation, 'landscape')).catch(() => undefined);
    }
  } catch {
    // Orientation lock unsupported or blocked - ignore.
  }
}

function safeScaleRefresh(scene: Phaser.Scene): void {
  try {
    scene.scale.refresh();
  } catch {
    // Keep gameplay running even if scale refresh fails.
  }
}

function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function logPerf(label: string, startedAt: number): void {
  try {
    const ms = Math.round((perfNow() - startedAt) * 100) / 100;
    console.info(`[BLOOMORIA][perf] ${label} ${ms}ms`);
  } catch {
    // never block gameplay
  }
}

function isTouchDevice(scene: Phaser.Scene): boolean {
  const touchCapable = !!scene.sys.game.device.input.touch;
  const maxPoints =
    typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
      ? navigator.maxTouchPoints
      : 0;
  return touchCapable || maxPoints > 0;
}

class ActionButton {
  public readonly id: 'attack' | 'dash' | 'slam' | 'fullscreen';
  public readonly hit: Phaser.GameObjects.Rectangle;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly cooldownGfx: Phaser.GameObjects.Graphics;
  private readonly container: Phaser.GameObjects.Container;
  private readonly activePointers = new Set<number>();
  private edgePending = false;
  private readonly hold: boolean;
  private readonly w: number;
  private readonly h: number;
  private readonly onAction: (() => void) | null;
  private readonly cooldownProvider: AbilityCooldownProvider | null;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    cfg: {
      id: 'attack' | 'dash' | 'slam' | 'fullscreen';
      label: string;
      x: number;
      y: number;
      w: number;
      h: number;
      hold: boolean;
      onAction?: () => void;
    },
    cooldownProvider: AbilityCooldownProvider | null,
  ) {
    this.id = cfg.id;
    this.hold = cfg.hold;
    this.w = cfg.w;
    this.h = cfg.h;
    this.onAction = cfg.onAction ?? null;
    this.cooldownProvider = cooldownProvider;
    this.container = scene.add.container(cfg.x, cfg.y);
    this.bg = scene.add.rectangle(0, 0, cfg.w, cfg.h, toHex(COLORS.bg), 0.42);
    this.bg.setStrokeStyle(2, toHex(COLORS.border), 0.78);
    this.icon = scene.add.graphics();
    this.drawIcon();
    this.label = scene.add
      .text(0, cfg.h * 0.24, cfg.label, {
        fontFamily: 'monospace',
        fontSize: this.id === 'fullscreen' ? '10px' : '12px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0.92);
    this.cooldownGfx = scene.add.graphics();
    this.cooldownGfx.setVisible(false);
    this.hit = scene.add.rectangle(0, 0, cfg.w, cfg.h, 0xffffff, 0.001);
    this.hit.setInteractive({ draggable: false, useHandCursor: false });
    this.hit.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    // Do NOT release on pointerout/pointerupoutside: on mobile, finger drift would falsely cancel hold/edge.
    // Release handled by pointerup/pointercancel + scene/global safety handlers.
    this.hit.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.hit.on('pointercancel', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.container.add([this.bg, this.icon, this.label, this.cooldownGfx, this.hit]);
    parent.add(this.container);
  }

  public get isHeld(): boolean {
    return this.activePointers.size > 0;
  }

  public consumeEdge(): boolean {
    if (this.hold) return this.isHeld;
    if (this.edgePending) {
      this.edgePending = false;
      return true;
    }
    return false;
  }

  public releasePointer(id: number): void {
    if (this.activePointers.delete(id)) this.applyVisualState();
  }

  public releaseAll(): void {
    this.activePointers.clear();
    this.edgePending = false;
    this.applyVisualState();
  }

  public collectCapturedPointers(out: Set<number>): void {
    for (const id of this.activePointers) out.add(id);
  }

  public setDisplayScale(scale: number): void {
    this.container.setScale(scale);
  }

  public setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  public updateCooldown(): void {
    if (!this.cooldownProvider) {
      this.cooldownGfx.clear();
      this.cooldownGfx.setVisible(false);
      return;
    }
    const { remainingMs, durationMs } = this.cooldownProvider();
    const rem = Math.max(0, remainingMs);
    const dur = Math.max(1, durationMs);
    if (rem <= 0) {
      this.cooldownGfx.clear();
      this.cooldownGfx.setVisible(false);
      return;
    }
    const progress = Phaser.Math.Clamp(1 - rem / dur, 0, 1);
    const revealedH = this.h * progress;
    const darkH = this.h - revealedH;
    this.cooldownGfx.clear();
    if (darkH > 0.5) {
      this.cooldownGfx.fillStyle(toHex(COLORS.cooldown), 0.38);
      this.cooldownGfx.fillRect(-this.w / 2, -this.h / 2 + revealedH, this.w, darkH);
    }
    this.cooldownGfx.setVisible(true);
  }

  public setInputEnabled(enabled: boolean): void {
    if (this.hit.input) this.hit.input.enabled = enabled;
    else if (enabled) this.hit.setInteractive();
  }

  public setLabel(text: string): void {
    this.label.setText(text);
  }

  public setIconVariant(variant: 'default' | 'fullscreen-enter' | 'fullscreen-exit'): void {
    if (this.id !== 'fullscreen') return;
    this.drawFullscreenIcon(variant === 'fullscreen-exit');
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.container.visible || this.hit.input?.enabled === false) return;
    if (this.activePointers.has(pointer.id)) return;
    const wasEmpty = this.activePointers.size === 0;
    this.activePointers.add(pointer.id);
    if (!this.hold && wasEmpty) {
      this.edgePending = true;
      this.onAction?.();
    }
    this.applyVisualState();
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    this.releasePointer(pointer.id);
  }

  private applyVisualState(): void {
    const active = this.isHeld;
    this.bg.setFillStyle(toHex(active ? COLORS.bgActive : COLORS.bg), active ? 0.62 : 0.42);
    this.bg.setStrokeStyle(
      2,
      toHex(active ? COLORS.borderActive : COLORS.border),
      active ? 0.95 : 0.78,
    );
  }

  private drawFullscreenIcon(exit: boolean): void {
    const g = this.icon;
    g.clear();
    g.lineStyle(2, toHex(COLORS.icon), 0.95);
    const s = 8;
    if (!exit) {
      g.lineBetween(-s, -s + 4, -s, -s);
      g.lineBetween(-s, -s, -s + 4, -s);
      g.lineBetween(s - 4, -s, s, -s);
      g.lineBetween(s, -s, s, -s + 4);
      g.lineBetween(s, s - 4, s, s);
      g.lineBetween(s, s, s - 4, s);
      g.lineBetween(-s + 4, s, -s, s);
      g.lineBetween(-s, s, -s, s - 4);
    } else {
      g.lineBetween(-s, -s + 2, -s + 4, -s + 2);
      g.lineBetween(-s + 2, -s, -s + 2, -s + 4);
      g.lineBetween(s - 4, -s + 2, s, -s + 2);
      g.lineBetween(s - 2, -s, s - 2, -s + 4);
      g.lineBetween(s - 4, s - 2, s, s - 2);
      g.lineBetween(s - 2, s - 4, s - 2, s);
      g.lineBetween(-s, s - 2, -s + 4, s - 2);
      g.lineBetween(-s + 2, s - 4, -s + 2, s);
    }
  }

  private drawIcon(): void {
    const g = this.icon;
    g.clear();
    if (this.id === 'fullscreen') {
      this.drawFullscreenIcon(false);
      return;
    }
    g.fillStyle(toHex(COLORS.icon), 0.95);
    g.lineStyle(2, toHex(COLORS.icon), 0.95);
    const s = 12;
    switch (this.id) {
      case 'attack':
        g.lineBetween(-s, 0, s, 0);
        g.lineBetween(0, -s, 0, s);
        g.strokeCircle(0, 0, s * 0.85);
        break;
      case 'dash':
        g.fillTriangle(s * 0.8, 0, -s * 0.2, -s * 0.75, -s * 0.2, s * 0.75);
        g.fillRect(-s * 0.9, -s * 0.35, s * 0.55, s * 0.7);
        break;
      case 'slam':
        g.lineBetween(0, -s * 0.85, 0, s * 0.25);
        g.fillTriangle(0, s * 0.95, -s * 0.45, s * 0.2, s * 0.45, s * 0.2);
        g.lineBetween(-s * 0.7, -s * 0.15, s * 0.7, -s * 0.15);
        break;
      default:
        break;
    }
  }
}

class MovementJoystick {
  private readonly container: Phaser.GameObjects.Container;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly hit: Phaser.GameObjects.Arc;
  private readonly onScenePointerMove: (p: Phaser.Input.Pointer) => void;
  private pointerId: number | null = null;
  private vecX = 0;
  private vecY = 0;
  private jumpEdge = false;
  private jumpLatched = false; // require release/recenter before next jump edge
  private centerX = 0;
  private centerY = 0;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    private readonly radius: number,
    knobRadius: number,
  ) {
    this.container = scene.add.container(0, 0);
    this.base = scene.add.circle(0, 0, radius, toHex(COLORS.joyBase), 0.38);
    this.base.setStrokeStyle(2, toHex(COLORS.joyBaseStroke), 0.78);
    this.knob = scene.add.circle(0, 0, knobRadius, toHex(COLORS.joyKnob), 0.72);
    this.knob.setStrokeStyle(2, toHex(COLORS.joyBaseStroke), 0.9);
    // Hit area slightly larger than visual base for reliability.
    this.hit = scene.add.circle(0, 0, radius * 1.15, 0xffffff, 0.001);
    this.hit.setInteractive({ draggable: false, useHandCursor: false });
    this.hit.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    // CRITICAL: never release on pointerout/pointerupoutside. Dragging outside the visual/interactive
    // joystick must keep the same captured pointerId active; release only on real up/cancel/loss handlers.
    this.hit.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.hit.on('pointercancel', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.container.add([this.base, this.knob, this.hit]);
    parent.add(this.container);

    this.onScenePointerMove = (p: Phaser.Input.Pointer) => this.onMove(p);
    scene.input.on('pointermove', this.onScenePointerMove);
  }

  public setDisplayScale(scale: number): void {
    this.container.setScale(scale);
  }

  public setPosition(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
    this.container.setPosition(x, y);
  }

  public getIntent(): { left: boolean; right: boolean; jumpPressed: boolean } {
    const jumpPressed = this.jumpEdge;
    this.jumpEdge = false;
    const dead = 0.22;
    return {
      left: this.vecX < -dead,
      right: this.vecX > dead,
      jumpPressed,
    };
  }

  public collectCapturedPointer(out: Set<number>): void {
    if (this.pointerId != null) out.add(this.pointerId);
  }

  public releasePointer(id: number): void {
    if (this.pointerId === id) this.reset();
  }

  public releaseAll(): void {
    this.reset();
  }

  public setInputEnabled(enabled: boolean): void {
    if (this.hit.input) this.hit.input.enabled = enabled;
    else if (enabled) this.hit.setInteractive();
  }

  public destroy(scene: Phaser.Scene): void {
    scene.input.off('pointermove', this.onScenePointerMove);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.container.visible || this.hit.input?.enabled === false) return;
    if (this.pointerId != null) return;
    this.pointerId = pointer.id;
    this.updateFromPointer(pointer);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.pointerId == null || pointer.id !== this.pointerId) return;
    this.updateFromPointer(pointer);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    this.releasePointer(pointer.id);
  }

  private updateFromPointer(pointer: Phaser.Input.Pointer): void {
    // Track the activating pointer anywhere (including far outside the visual joystick/canvas deltas).
    const s = this.container.scaleX || 1;
    const dx = (pointer.worldX - this.centerX) / s;
    const dy = (pointer.worldY - this.centerY) / s;
    const dist = Math.hypot(dx, dy);
    const max = this.radius * 0.72;
    const clamped = dist > max && dist > 0 ? max / dist : 1;
    const kx = dx * clamped;
    const ky = dy * clamped;
    this.knob.setPosition(kx, ky);
    this.vecX = Phaser.Math.Clamp(kx / max, -1, 1);
    this.vecY = Phaser.Math.Clamp(ky / max, -1, 1);
    // Up = jump (edge), with latch so holding up doesn't retrigger every frame.
    const upActive = this.vecY < -0.62;
    if (upActive && !this.jumpLatched) {
      this.jumpEdge = true;
      this.jumpLatched = true;
    } else if (this.vecY > -0.28) {
      this.jumpLatched = false;
    }
    const active = Math.abs(this.vecX) > 0.05 || Math.abs(this.vecY) > 0.05;
    this.knob.setFillStyle(
      toHex(active ? COLORS.joyKnobActive : COLORS.joyKnob),
      active ? 0.88 : 0.72,
    );
  }

  private reset(): void {
    this.pointerId = null;
    this.vecX = 0;
    this.vecY = 0;
    this.jumpEdge = false;
    this.jumpLatched = false;
    this.knob.setPosition(0, 0);
    this.knob.setFillStyle(toHex(COLORS.joyKnob), 0.72);
  }
}

export class MobileTouchControls {
  private readonly root: Phaser.GameObjects.Container;
  private readonly buttons: ActionButton[] = [];
  private readonly buttonById = new Map<string, ActionButton>();
  private readonly joystick: MovementJoystick | null = null;
  private readonly capturedPointerIds = new Set<number>();
  private readonly enabled: boolean;
  private readonly fullscreenAvailable: boolean;
  private visible = false;
  private readonly onResize: () => void;
  private readonly onBlur: () => void;
  private readonly onVisibility: () => void;
  private readonly onGlobalUp: (e: Event) => void;
  private readonly preventContextMenu: (e: Event) => void;
  private readonly onFullscreenChange: () => void;
  private readonly onFullscreenError: () => void;
  private readonly onScenePointerUp: (p: Phaser.Input.Pointer) => void;
  private readonly onGameOut: () => void;
  private fullscreenTransitionPending = false;
  private resizeLayoutRaf = 0;
  private resizeLayoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    providers: {
      attackCooldown: AbilityCooldownProvider;
      dashCooldown: AbilityCooldownProvider;
      groundSlamCooldown?: AbilityCooldownProvider;
    },
  ) {
    this.enabled = isTouchDevice(scene);
    this.root = scene.add.container(0, 0);
    // Above HUD/PauseButton (160), below upgrade (200), game-over (220), and PauseScene (separate, 500).
    this.root.setDepth(150);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);

    this.fullscreenAvailable = this.enabled && this.detectFullscreenApi();
    if (this.enabled) {
      // Left: joystick (replaces 3 buttons). Up = jump. 3x size (base 72->216, knob 30->90).
      this.joystick = new MovementJoystick(scene, this.root, 216, 90);
      this.buildButtons(providers);
      this.layout();
      this.updateFullscreenButtonState();
    }

    this.onResize = () => this.scheduleLayout();
    this.onBlur = () => this.releaseAll();
    this.onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) this.releaseAll();
    };
    this.onGlobalUp = (e: Event) => {
      // Safety release for lost pointers. CRITICAL: release ONLY the specific pointer when known.
      // Never releaseAll() on generic touch/pointer end events — doing so resets joystick when
      // another finger (e.g. Attack) is released (root cause of movement interruption).
      const pe = e as PointerEvent & { pointerId?: number };
      if (typeof pe.pointerId === 'number' && Number.isFinite(pe.pointerId)) {
        // PointerEvent pointerId 0 can appear in some non-pointer paths; still safe to target.
        if (pe.pointerId >= 0) this.releasePointer(pe.pointerId);
      }
      // TouchEvent fallback: resolve changed touches via active tracking when possible.
      // If we cannot map to a tracked pointer, do nothing (scene/global pointer handlers + blur/hidden handle safety).
    };
    this.preventContextMenu = (e: Event) => {
      if (this.enabled && this.visible) e.preventDefault();
    };
    this.onFullscreenChange = () => {
      const t0 = perfNow();
      this.fullscreenTransitionPending = false;
      try {
        this.updateFullscreenButtonState();
      } catch {
        // ignore
      }
      // Do not call scale.refresh() here: fullscreenchange is typically followed by resize events and
      // Phaser/browser already coordinate canvas sizing. Only relayout touch controls (coalesced).
      this.scheduleLayout();
      logPerf('fullscreenchange+touch-layout-scheduled', t0);
    };
    this.onFullscreenError = () => {
      this.fullscreenTransitionPending = false;
      try {
        this.updateFullscreenButtonState();
      } catch {
        // ignore
      }
      this.scheduleLayout();
    };
    this.onScenePointerUp = (p: Phaser.Input.Pointer) => this.releasePointer(p.id);
    this.onGameOut = () => this.releaseAll();

    scene.scale.on('resize', this.onResize);
    scene.input.on('pointerup', this.onScenePointerUp);
    scene.input.on('pointerupoutside', this.onScenePointerUp);
    scene.input.on('pointercancel', this.onScenePointerUp);
    scene.input.on('gameout', this.onGameOut);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onBlur);
      window.addEventListener('pointerup', this.onGlobalUp, true);
      window.addEventListener('pointercancel', this.onGlobalUp, true);
      window.addEventListener('touchend', this.onGlobalUp, true);
      window.addEventListener('touchcancel', this.onGlobalUp, true);
      window.addEventListener('contextmenu', this.preventContextMenu);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
      document.addEventListener('fullscreenchange', this.onFullscreenChange);
      document.addEventListener('webkitfullscreenchange', this.onFullscreenChange as EventListener);
      document.addEventListener('fullscreenerror', this.onFullscreenError);
      document.addEventListener('webkitfullscreenerror', this.onFullscreenError as EventListener);
    }
  }

  private scheduleLayout(): void {
    if (!this.enabled) return;
    if (typeof window === 'undefined') {
      this.layout();
      return;
    }
    if (this.resizeLayoutRaf) cancelAnimationFrame(this.resizeLayoutRaf);
    if (this.resizeLayoutTimer) {
      clearTimeout(this.resizeLayoutTimer);
      this.resizeLayoutTimer = null;
    }
    this.resizeLayoutRaf = requestAnimationFrame(() => {
      this.resizeLayoutRaf = 0;
      const t0 = perfNow();
      try {
        this.layout();
      } catch {
        // never block game
      }
      logPerf('touch-layout', t0);
    });
    // Browser fullscreen/rotation often emits late size changes; run one cheap follow-up layout.
    this.resizeLayoutTimer = setTimeout(() => {
      this.resizeLayoutTimer = null;
      try {
        this.layout();
      } catch {
        // ignore
      }
    }, 180);
  }

  public read(): TouchIntent {
    this.capturedPointerIds.clear();
    if (!this.enabled || !this.visible || !this.joystick) {
      return {
        left: false,
        right: false,
        jumpPressed: false,
        downPressed: false,
        attackHeld: false,
        dashPressed: false,
        attackByTouch: false,
        capturedPointerIds: this.capturedPointerIds,
      };
    }
    this.joystick.collectCapturedPointer(this.capturedPointerIds);
    for (const b of this.buttons) b.collectCapturedPointers(this.capturedPointerIds);
    const move = this.joystick.getIntent();
    const attackBtn = this.buttonById.get('attack');
    const attackHeld = attackBtn?.isHeld ?? false;
    return {
      left: move.left,
      right: move.right,
      jumpPressed: move.jumpPressed,
      downPressed: this.buttonById.get('slam')?.consumeEdge() ?? false,
      attackHeld,
      dashPressed: this.buttonById.get('dash')?.consumeEdge() ?? false,
      attackByTouch: attackHeld, // mobile Attack button -> auto-aim nearest enemy (#2)
      capturedPointerIds: this.capturedPointerIds,
    };
  }

  public updateVisuals(): void {
    if (!this.enabled || !this.visible) return;
    for (const b of this.buttons) b.updateCooldown();
  }

  public setVisible(visible: boolean): void {
    if (!this.enabled) return;
    this.visible = visible;
    this.root.setVisible(visible);
    // Prevent hidden controls from capturing touches (menus/pause/upgrade/game-over).
    for (const b of this.buttons) {
      if (b.id === 'fullscreen') b.setInputEnabled(visible && this.fullscreenAvailable);
      else b.setInputEnabled(visible);
    }
    this.joystick?.setInputEnabled(visible);
    if (!visible) this.releaseAll();
  }

  public releasePointer(pointerId: number): void {
    this.joystick?.releasePointer(pointerId);
    for (const b of this.buttons) b.releasePointer(pointerId);
    this.capturedPointerIds.delete(pointerId);
  }

  public releaseAll(): void {
    this.joystick?.releaseAll();
    for (const b of this.buttons) b.releaseAll();
    this.capturedPointerIds.clear();
  }

  public destroy(): void {
    this.releaseAll();
    if (this.resizeLayoutRaf) cancelAnimationFrame(this.resizeLayoutRaf);
    if (this.resizeLayoutTimer) clearTimeout(this.resizeLayoutTimer);
    this.scene.scale.off('resize', this.onResize);
    this.scene.input.off('pointerup', this.onScenePointerUp);
    this.scene.input.off('pointerupoutside', this.onScenePointerUp);
    this.scene.input.off('pointercancel', this.onScenePointerUp);
    this.scene.input.off('gameout', this.onGameOut);
    this.joystick?.destroy(this.scene);
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('pointerup', this.onGlobalUp, true);
      window.removeEventListener('pointercancel', this.onGlobalUp, true);
      window.removeEventListener('touchend', this.onGlobalUp, true);
      window.removeEventListener('touchcancel', this.onGlobalUp, true);
      window.removeEventListener('contextmenu', this.preventContextMenu);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        this.onFullscreenChange as EventListener,
      );
      document.removeEventListener('fullscreenerror', this.onFullscreenError);
      document.removeEventListener(
        'webkitfullscreenerror',
        this.onFullscreenError as EventListener,
      );
    }
    this.root.destroy(true);
    this.buttons.length = 0;
    this.buttonById.clear();
  }

  private getFullscreenTarget(): FullscreenElement | null {
    const parent = this.scene.scale.parent as HTMLElement | null;
    if (parent) return parent;
    return (this.scene.game.canvas?.parentElement as FullscreenElement | null) ?? null;
  }

  private detectFullscreenApi(): boolean {
    if (typeof document === 'undefined') return false;
    const target = this.getFullscreenTarget();
    return canRequestFullscreen(target);
  }

  private isInFullscreen(): boolean {
    if (typeof document === 'undefined') return false;
    const target = this.getFullscreenTarget();
    const active = getFullscreenElement(document as FullscreenDocument);
    if (!active) return false;
    return !!(target && (active === target || target.contains(active) || active.contains(target)));
  }

  private updateFullscreenButtonState(): void {
    const btn = this.buttonById.get('fullscreen');
    if (!btn) return;
    if (!this.fullscreenAvailable) {
      btn.setLabel('FULL');
      btn.setIconVariant('fullscreen-enter');
      btn.setInputEnabled(false);
      return;
    }
    const active = this.isInFullscreen();
    btn.setLabel(active ? 'EXIT' : 'FULL');
    btn.setIconVariant(active ? 'fullscreen-exit' : 'fullscreen-enter');
    btn.setInputEnabled(this.visible);
  }

  private toggleFullscreen = (): void => {
    this.requestFullscreen('user');
  };

  public requestFullscreen(source: 'user' | 'auto'): void {
    if (!this.fullscreenAvailable || typeof document === 'undefined') {
      this.fullscreenTransitionPending = false;
      this.updateFullscreenButtonState();
      return;
    }
    const doc = document as FullscreenDocument;
    const target = this.getFullscreenTarget();
    if (!target) {
      this.fullscreenTransitionPending = false;
      this.updateFullscreenButtonState();
      return;
    }
    // Avoid duplicate fullscreen requests during an active transition (prevents request storms on mobile).
    if (this.fullscreenTransitionPending) return;
    try {
      if (this.isInFullscreen()) {
        if (source === 'user') {
          this.fullscreenTransitionPending = true;
          const t0 = perfNow();
          const result = exitFullscreenSafe(doc);
          void Promise.resolve(result)
            .catch(() => undefined)
            .finally(() => {
              this.fullscreenTransitionPending = false;
              this.updateFullscreenButtonState();
              logPerf('fullscreen-exit-request', t0);
            });
        }
        return;
      }
      this.fullscreenTransitionPending = true;
      const t0 = perfNow();
      // Fire-and-forget: do not block the pointer handler / main thread waiting for fullscreen.
      const result = requestFullscreenSafe(target);
      void Promise.resolve(result)
        .then(() => tryLockLandscape())
        .catch(() => undefined)
        .finally(() => {
          this.fullscreenTransitionPending = false;
          this.updateFullscreenButtonState();
          logPerf('fullscreen-enter-request', t0);
        });
    } catch {
      this.fullscreenTransitionPending = false;
      this.updateFullscreenButtonState();
      safeScaleRefresh(this.scene);
    }
  }

  private buildButtons(providers: {
    attackCooldown: AbilityCooldownProvider;
    dashCooldown: AbilityCooldownProvider;
    groundSlamCooldown?: AbilityCooldownProvider;
  }): void {
    // Right side: Attack + Dash + Ground Slam (edge, air-only in Player). Left side uses joystick.
    const cfgs: Array<{
      id: 'attack' | 'dash' | 'slam' | 'fullscreen';
      label: string;
      w: number;
      h: number;
      hold: boolean;
      onAction?: () => void;
      provider: AbilityCooldownProvider | null;
    }> = [
      {
        id: 'attack',
        label: 'ATK',
        w: 132,
        h: 132,
        hold: true,
        provider: providers.attackCooldown,
      },
      { id: 'dash', label: 'DASH', w: 118, h: 118, hold: false, provider: providers.dashCooldown },
      {
        id: 'slam',
        label: 'DOWN',
        w: 96,
        h: 96,
        hold: false,
        provider: providers.groundSlamCooldown ?? null,
      },
    ];
    if (this.fullscreenAvailable) {
      cfgs.push({
        id: 'fullscreen',
        label: 'FULL',
        w: 52,
        h: 40,
        hold: false,
        provider: null,
        onAction: this.toggleFullscreen,
      });
    }
    for (const c of cfgs) {
      const btn = new ActionButton(
        this.scene,
        this.root,
        {
          id: c.id,
          label: c.label,
          x: 0,
          y: 0,
          w: c.w,
          h: c.h,
          hold: c.hold,
          onAction: c.onAction,
        },
        c.provider,
      );
      this.buttons.push(btn);
      this.buttonById.set(c.id, btn);
    }
  }

  private layout(): void {
    if (!this.enabled) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const inset = readSafeInsets(this.scene);
    const margin = Phaser.Math.Clamp(Math.round(h * 0.02), 10, 18);
    const gap = Phaser.Math.Clamp(Math.round(h * 0.016), 8, 14);

    // Left: joystick (up = jump). Responsive size for small phones/tablets; safe-area aware.
    if (this.joystick) {
      const joyR = Phaser.Math.Clamp(Math.round(h * 0.155), 92, 160);
      // joystick internal base radius is fixed to constructor value; scale the container instead
      const baseR = 216;
      const s = joyR / baseR;
      (this.joystick as unknown as { setDisplayScale?: (v: number) => void }).setDisplayScale?.(s);
      const joyX = margin + inset.left + joyR + 8;
      const joyY = h - margin - inset.bottom - joyR - 6;
      this.joystick.setPosition(joyX, joyY);
    }

    // Right cluster bottom-right: [Slam] [Dash] [Attack] responsive + safe-area.
    const attackBtn = this.buttonById.get('attack');
    const dashBtn = this.buttonById.get('dash');
    const slamBtn = this.buttonById.get('slam');
    if (attackBtn && dashBtn) {
      const ui = Phaser.Math.Clamp(h / 720, 0.72, 1.15);
      const aw = 132 * ui;
      const ah = 132 * ui;
      const dw = 118 * ui;
      const dh = 118 * ui;
      const sw = 96 * ui;
      const sh = 96 * ui;
      attackBtn.setDisplayScale(ui);
      dashBtn.setDisplayScale(ui);
      slamBtn?.setDisplayScale(ui);
      const baseY = h - margin - inset.bottom - ah / 2;
      const attackX = w - margin - inset.right - aw / 2;
      attackBtn.setPosition(attackX, baseY);
      const dashX = attackX - aw / 2 - gap - dw / 2;
      dashBtn.setPosition(dashX, baseY - (ah - dh) / 2);
      if (slamBtn) {
        slamBtn.setPosition(dashX - dw / 2 - gap - sw / 2, baseY - (ah - sh) / 2);
      }
    }

    // Small fullscreen toggle (mobile-only, when API available) top-right, left of PauseButton.
    const fsBtn = this.buttonById.get('fullscreen');
    if (fsBtn) {
      const ui = Phaser.Math.Clamp(h / 720, 0.8, 1.1);
      const fw = 52 * ui;
      const fh = 40 * ui;
      fsBtn.setDisplayScale(ui);
      const pauseW = 44 * ui;
      const fsX = w - margin - inset.right - pauseW - gap - fw / 2;
      fsBtn.setPosition(fsX, Math.max(margin + inset.top + fh / 2, 30));
    }
  }
}
