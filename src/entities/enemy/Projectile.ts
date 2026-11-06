import Phaser from 'phaser';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class Projectile {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private x: number;
  private y: number;
  private lifeMs: number;
  private active = true;
  private hit = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly vx: number,
    private readonly vy: number,
    lifetimeMs: number,
    private readonly size: number,
    private readonly color: string,
    public readonly damage: number,
  ) {
    this.x = x;
    this.y = y;
    this.lifeMs = lifetimeMs;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(11);
    this.render();
  }

  public update(delta: number): void {
    if (!this.active) {
      return;
    }
    const dt = delta / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifeMs -= delta;
    if (this.lifeMs <= 0) {
      this.active = false;
      return;
    }
    this.render();
  }

  public getBounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size,
    );
  }

  public isActive(): boolean {
    return this.active;
  }

  public hasHit(): boolean {
    return this.hit;
  }

  public markHit(): void {
    this.hit = true;
    this.active = false;
  }

  public destroy(): void {
    this.active = false;
    this.graphics.destroy();
  }

  private render(): void {
    this.graphics.clear();
    if (!this.active) {
      return;
    }
    this.graphics.fillStyle(toHex(this.color), 1);
    this.graphics.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    this.graphics.lineStyle(1, toHex('#FFFFFF'), 0.75);
    this.graphics.strokeRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
  }
}
