import Phaser from 'phaser';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class Shockwave {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private x: number;
  private readonly y: number;
  private lifeMs: number;
  private active = true;
  private hit = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    floorY: number,
    private readonly dirX: -1 | 1,
    private readonly speed: number,
    lifetimeMs: number,
    private readonly width: number,
    private readonly height: number,
    private readonly color: string,
    public readonly damage: number,
  ) {
    this.x = x;
    this.y = floorY - this.height / 2;
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
    this.x += this.dirX * this.speed * dt;
    this.lifeMs -= delta;
    if (this.lifeMs <= 0) {
      this.active = false;
      return;
    }
    this.render();
  }

  public getBounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.x - this.width / 2,
      this.y - this.height / 2,
      this.width,
      this.height,
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
    this.graphics.fillStyle(toHex(this.color), 0.95);
    this.graphics.fillRect(
      this.x - this.width / 2,
      this.y - this.height / 2,
      this.width,
      this.height,
    );
    this.graphics.lineStyle(2, toHex('#FFFFFF'), 0.7);
    this.graphics.strokeRect(
      this.x - this.width / 2,
      this.y - this.height / 2,
      this.width,
      this.height,
    );
    this.graphics.fillStyle(toHex(this.color), 0.35);
    this.graphics.fillRect(
      this.x - this.width * 0.8 * this.dirX - 4,
      this.y - this.height * 0.2,
      8,
      this.height * 0.4,
    );
  }
}
