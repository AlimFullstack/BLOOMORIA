import Phaser from 'phaser';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const clamp01 = (v: number): number => Phaser.Math.Clamp(v, 0, 1);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export class DamageVignette {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private alpha = 0;
  private flashAlpha = 0;
  private targetHpAlpha = 0;
  private width: number;
  private height: number;
  private readonly maxIntensity = 0.3;

  constructor(private readonly scene: Phaser.Scene) {
    this.width = scene.scale.width;
    this.height = scene.scale.height;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(90);
    this.graphics.setScrollFactor(0);
    this.graphics.setBlendMode(Phaser.BlendModes.NORMAL);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  public triggerDamageFlash(intensity = 0.3): void {
    this.flashAlpha = Math.min(
      this.maxIntensity,
      Math.max(this.flashAlpha, Phaser.Math.Clamp(intensity, 0, this.maxIntensity)),
    );
  }

  public setHpRatio(hp: number, maxHp: number): void {
    if (maxHp <= 0 || hp >= maxHp) {
      this.targetHpAlpha = 0;
      return;
    }
    const missing = clamp01(1 - hp / maxHp);
    // Progressive: ~0 at 100%, subtle around 75%, clear at 50%, strong at 25%, max at 1 HP.
    const curve = smoothstep(missing);
    const intensity = Phaser.Math.Linear(0.015, this.maxIntensity, Math.pow(curve, 0.92));
    this.targetHpAlpha = Phaser.Math.Clamp(intensity, 0, this.maxIntensity);
  }

  public update(deltaMs: number): void {
    this.flashAlpha = Math.max(0, this.flashAlpha - deltaMs * 0.0011);
    const target = Phaser.Math.Clamp(this.targetHpAlpha + this.flashAlpha, 0, this.maxIntensity);
    const rate = target > this.alpha ? 0.014 : 0.0055;
    this.alpha = Phaser.Math.Linear(this.alpha, target, 1 - Math.exp(-rate * deltaMs));
    if (this.alpha < 0.0015 && target <= 0) {
      this.alpha = 0;
      this.flashAlpha = 0;
      this.graphics.clear();
      return;
    }
    this.draw(Phaser.Math.Clamp(this.alpha, 0, this.maxIntensity));
  }

  public renderStatic(): void {
    this.draw(Phaser.Math.Clamp(this.alpha, 0, this.maxIntensity));
  }

  public hide(): void {
    this.alpha = 0;
    this.flashAlpha = 0;
    this.graphics.clear();
  }

  public destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.graphics.destroy();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.width = gameSize.width;
    this.height = gameSize.height;
    this.draw(this.alpha);
  }

  private draw(intensity: number): void {
    this.graphics.clear();
    if (intensity <= 0.001) {
      return;
    }
    const w = this.width;
    const h = this.height;
    const minDim = Math.min(w, h);
    // Wider coverage at low HP, but keep a clear central gameplay area.
    const hpT = Phaser.Math.Clamp(intensity / this.maxIntensity, 0, 1);
    const edge = minDim * Phaser.Math.Linear(0.18, 0.34, Math.pow(hpT, 0.85));
    const color = toHex('#FF1020');
    const glow = toHex('#B30012');
    const steps = 12;
    for (let i = 0; i < steps; i += 1) {
      const t = 1 - i / steps;
      const inset = (edge * i) / steps;
      const falloff = t * t * t;
      const a = Phaser.Math.Clamp(intensity * falloff * 0.62, 0, this.maxIntensity);
      this.graphics.lineStyle(edge / steps + 1.2, color, a);
      this.graphics.strokeRect(
        inset + 0.5,
        inset + 0.5,
        Math.max(1, w - inset * 2 - 1),
        Math.max(1, h - inset * 2 - 1),
      );
    }
    const corner = edge * Phaser.Math.Linear(1.05, 1.55, hpT);
    const cornerA = Phaser.Math.Clamp(intensity * 0.46, 0, this.maxIntensity);
    this.graphics.fillStyle(glow, cornerA);
    this.graphics.fillTriangle(0, 0, corner, 0, 0, corner);
    this.graphics.fillTriangle(w, 0, w - corner, 0, w, corner);
    this.graphics.fillTriangle(0, h, corner, h, 0, h - corner);
    this.graphics.fillTriangle(w, h, w - corner, h, w, h - corner);
    this.graphics.fillStyle(color, Phaser.Math.Clamp(intensity * 0.22, 0, this.maxIntensity));
    this.graphics.fillTriangle(0, 0, corner * 0.62, 0, 0, corner * 0.62);
    this.graphics.fillTriangle(w, 0, w - corner * 0.62, 0, w, corner * 0.62);
    this.graphics.fillTriangle(0, h, corner * 0.62, h, 0, h - corner * 0.62);
    this.graphics.fillTriangle(w, h, w - corner * 0.62, h, w, h - corner * 0.62);
  }
}
