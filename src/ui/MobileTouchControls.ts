import Phaser from 'phaser';

export interface TouchIntent {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  attackHeld: boolean;
  dashPressed: boolean;
  /** Pointer IDs currently captured by touch controls (ignore for mouse/aim pointer attack). */
  capturedPointerIds: ReadonlySet<number>;
}

export interface CooldownState {
  remainingMs: number;
  durationMs: number;
}

type AbilityCooldownProvider = () => CooldownState;

interface ButtonConfig {
  id: 'left' | 'right' | 'up' | 'attack' | 'dash';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hold: boolean;
}

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const COLORS = {
  bg: '#18223A',
  bgActive: '#223055',
  border: '#8589E9',
  borderActive: '#FFFFFF',
  text: '#EAF2FF',
  icon: '#EAF2FF',
  cooldown: '#000000',
} as const;

class TouchButton {
  public readonly id: ButtonConfig['id'];
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

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    cfg: ButtonConfig,
    private readonly cooldownProvider: AbilityCooldownProvider | null,
  ) {
    this.id = cfg.id;
    this.hold = cfg.hold;
    this.w = cfg.w;
    this.h = cfg.h;
    this.container = scene.add.container(cfg.x, cfg.y);
    this.bg = scene.add.rectangle(0, 0, cfg.w, cfg.h, toHex(COLORS.bg), 0.42);
    this.bg.setStrokeStyle(2, toHex(COLORS.border), 0.78);
    this.icon = scene.add.graphics();
    this.drawIcon();
    this.label = scene.add
      .text(0, cfg.h * 0.22, cfg.label, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0.9);
    this.cooldownGfx = scene.add.graphics();
    this.cooldownGfx.setVisible(false);
    // Large transparent hit area on top to reliably capture touches.
    this.hit = scene.add.rectangle(0, 0, cfg.w, cfg.h, 0xffffff, 0.001);
    this.hit.setInteractive();
    this.hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onDown(pointer));
    this.hit.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onUp(pointer));
    this.hit.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.onUp(pointer));
    this.hit.on('pointerout', (pointer: Phaser.Input.Pointer) => this.onUp(pointer));
    this.hit.on('pointercancel', (pointer: Phaser.Input.Pointer) => this.onUp(pointer));
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

  public releaseAll(): void {
    this.activePointers.clear();
    this.edgePending = false;
    this.applyVisualState();
  }

  public collectCapturedPointers(out: Set<number>): void {
    for (const id of this.activePointers) out.add(id);
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
    // Darkening recedes top-to-bottom: revealed portion grows from the top, dark remains below.
    const progress = Phaser.Math.Clamp(1 - rem / dur, 0, 1); // 0 at start, 1 when ready
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
    if (this.hit.input) {
      this.hit.input.enabled = enabled;
    } else if (enabled) {
      this.hit.setInteractive();
    }
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.container.visible || this.hit.input?.enabled === false) return;
    if (this.activePointers.has(pointer.id)) return;
    const wasEmpty = this.activePointers.size === 0;
    this.activePointers.add(pointer.id);
    if (!this.hold && wasEmpty) {
      this.edgePending = true;
    }
    this.applyVisualState();
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.activePointers.delete(pointer.id)) return;
    this.applyVisualState();
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

  private drawIcon(): void {
    const g = this.icon;
    g.clear();
    g.fillStyle(toHex(COLORS.icon), 0.95);
    g.lineStyle(2, toHex(COLORS.icon), 0.95);
    const s = 10;
    switch (this.id) {
      case 'left':
        g.fillTriangle(-s * 0.7, 0, s * 0.5, -s, s * 0.5, s);
        break;
      case 'right':
        g.fillTriangle(s * 0.7, 0, -s * 0.5, -s, -s * 0.5, s);
        break;
      case 'up':
        g.fillTriangle(0, -s * 0.9, -s, s * 0.45, s, s * 0.45);
        break;
      case 'attack':
        g.lineBetween(-s, 0, s, 0);
        g.lineBetween(0, -s, 0, s);
        g.strokeCircle(0, 0, s * 0.85);
        break;
      case 'dash':
        g.fillTriangle(s * 0.8, 0, -s * 0.2, -s * 0.75, -s * 0.2, s * 0.75);
        g.fillRect(-s * 0.9, -s * 0.35, s * 0.55, s * 0.7);
        break;
      default:
        break;
    }
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

function readSafeInsets(): { left: number; right: number; bottom: number } {
  if (typeof document === 'undefined' || !document.body) {
    return { left: 0, right: 0, bottom: 0 };
  }
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;' +
    'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const insets = {
    left: px(cs.paddingLeft),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
  };
  el.remove();
  return insets;
}

export class MobileTouchControls {
  private readonly root: Phaser.GameObjects.Container;
  private readonly buttons: TouchButton[] = [];
  private readonly buttonById = new Map<ButtonConfig['id'], TouchButton>();
  private readonly capturedPointerIds = new Set<number>();
  private readonly enabled: boolean;
  private visible = false;
  private readonly onResize: () => void;
  private readonly onBlur: () => void;
  private readonly onVisibility: () => void;
  private readonly onGlobalUp: (e: Event) => void;
  private readonly preventContextMenu: (e: Event) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    providers: {
      attackCooldown: AbilityCooldownProvider;
      dashCooldown: AbilityCooldownProvider;
    },
  ) {
    this.enabled = isTouchDevice(scene);
    this.root = scene.add.container(0, 0);
    // Above HUD/PauseButton (160), below upgrade (200), game-over (220), and PauseScene (separate, 500).
    this.root.setDepth(150);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);

    if (this.enabled) {
      this.buildButtons(providers);
      this.layout();
      this.attachSafetyHandlers();
    }

    this.onResize = () => this.layout();
    this.onBlur = () => this.releaseAll();
    this.onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) this.releaseAll();
    };
    this.onGlobalUp = () => this.releaseAll();
    this.preventContextMenu = (e: Event) => {
      if (this.enabled && this.visible) e.preventDefault();
    };
    scene.scale.on('resize', this.onResize);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onBlur);
      window.addEventListener('pointerup', this.onGlobalUp);
      window.addEventListener('pointercancel', this.onGlobalUp);
      window.addEventListener('contextmenu', this.preventContextMenu);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  public read(): TouchIntent {
    this.capturedPointerIds.clear();
    if (!this.enabled || !this.visible) {
      return {
        left: false,
        right: false,
        jumpPressed: false,
        attackHeld: false,
        dashPressed: false,
        capturedPointerIds: this.capturedPointerIds,
      };
    }
    for (const b of this.buttons) b.collectCapturedPointers(this.capturedPointerIds);
    return {
      left: this.buttonById.get('left')?.isHeld ?? false,
      right: this.buttonById.get('right')?.isHeld ?? false,
      jumpPressed: this.buttonById.get('up')?.consumeEdge() ?? false,
      attackHeld: this.buttonById.get('attack')?.isHeld ?? false,
      dashPressed: this.buttonById.get('dash')?.consumeEdge() ?? false,
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
    for (const b of this.buttons) b.setInputEnabled(visible);
    if (!visible) this.releaseAll();
  }

  public releaseAll(): void {
    for (const b of this.buttons) b.releaseAll();
    this.capturedPointerIds.clear();
  }

  public destroy(): void {
    this.releaseAll();
    this.scene.scale.off('resize', this.onResize);
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('pointerup', this.onGlobalUp);
      window.removeEventListener('pointercancel', this.onGlobalUp);
      window.removeEventListener('contextmenu', this.preventContextMenu);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.root.destroy(true);
    this.buttons.length = 0;
    this.buttonById.clear();
  }

  private attachSafetyHandlers(): void {
    // Release controls if the pointer system reports an interruption.
    this.scene.input.on('gameout', () => this.releaseAll());
  }

  private buildButtons(providers: {
    attackCooldown: AbilityCooldownProvider;
    dashCooldown: AbilityCooldownProvider;
  }): void {
    // Initial positions; layout() places them with safe-area awareness.
    const cfgs: ButtonConfig[] = [
      { id: 'left', label: 'LEFT', x: 0, y: 0, w: 78, h: 78, hold: true },
      { id: 'right', label: 'RIGHT', x: 0, y: 0, w: 78, h: 78, hold: true },
      { id: 'up', label: 'JUMP', x: 0, y: 0, w: 78, h: 78, hold: false },
      {
        id: 'attack',
        label: 'ATK',
        x: 0,
        y: 0,
        w: 88,
        h: 88,
        hold: true,
      },
      { id: 'dash', label: 'DASH', x: 0, y: 0, w: 88, h: 88, hold: false },
    ];
    for (const cfg of cfgs) {
      const provider =
        cfg.id === 'attack'
          ? providers.attackCooldown
          : cfg.id === 'dash'
            ? providers.dashCooldown
            : null;
      const btn = new TouchButton(this.scene, this.root, cfg, provider);
      this.buttons.push(btn);
      this.buttonById.set(cfg.id, btn);
    }
  }

  private layout(): void {
    if (!this.enabled) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const inset = readSafeInsets();
    const margin = 16;
    const gap = 10;
    // Left cluster bottom-left: [Left][Right] with [Jump] above (easy thumb reach).
    const leftBtn = this.buttonById.get('left');
    const rightBtn = this.buttonById.get('right');
    const upBtn = this.buttonById.get('up');
    if (leftBtn && rightBtn && upBtn) {
      const bw = 78;
      const bh = 78;
      const baseY = h - margin - inset.bottom - bh / 2;
      const leftX = margin + inset.left + bw / 2;
      leftBtn.setPosition(leftX, baseY);
      rightBtn.setPosition(leftX + bw + gap, baseY);
      // Jump above the gap between left/right for comfortable access.
      upBtn.setPosition(leftX + (bw + gap) / 2, baseY - bh - gap);
    }
    // Right cluster bottom-right: [Dash] [Attack] (Attack primary/larger feel area on edge).
    const attackBtn = this.buttonById.get('attack');
    const dashBtn = this.buttonById.get('dash');
    if (attackBtn && dashBtn) {
      const aw = 88;
      const ah = 88;
      const dw = 88;
      const dh = 88;
      const baseY = h - margin - inset.bottom - ah / 2;
      const attackX = w - margin - inset.right - aw / 2;
      attackBtn.setPosition(attackX, baseY);
      dashBtn.setPosition(attackX - aw / 2 - gap - dw / 2, baseY - (ah - dh) / 2);
    }
  }
}
