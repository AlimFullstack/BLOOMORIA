import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { FxParticles } from '../../fx/FxParticles';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class HealthCubePickup {
  public readonly bodyObject: Phaser.GameObjects.Rectangle;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly fx: FxParticles;
  private active = true;
  private collected = false;
  private ageMs = 0;
  private bob = Math.random() * Math.PI * 2;

  constructor(
    scene: Phaser.Scene,
    platforms: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    floorY: number,
  ) {
    const size = 18;
    const y = floorY - size / 2 - 2;
    this.bodyObject = scene.add.rectangle(x, y, size, size, toHex('#55FF7A'), 0);
    scene.physics.add.existing(this.bodyObject);
    const body = this.bodyObject.body as Phaser.Physics.Arcade.Body;
    body.setSize(size, size);
    body.setCollideWorldBounds(true);
    body.setBounce(0.18, 0.18);
    body.setDragX(260);
    body.setGravityY(180);
    scene.physics.add.collider(this.bodyObject, platforms);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(12);
    this.fx = new FxParticles(scene, 13, 90);
    this.render();
  }

  public isActive(): boolean {
    return this.active;
  }

  public isCollected(): boolean {
    return this.collected;
  }

  public getBounds(): Phaser.Geom.Rectangle {
    return this.bodyObject.getBounds();
  }

  public collect(): void {
    if (!this.active || this.collected) {
      return;
    }
    this.collected = true;
    this.active = false;
    const body = this.bodyObject.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
    this.graphics.clear();
    this.fx.emitHealPickup(this.bodyObject.x, this.bodyObject.y, '#55FF7A');
    AudioManager.playerPickupHeal();
  }

  public update(deltaMs: number): void {
    if (!this.active) {
      this.fx.update(deltaMs);
      if (this.collected && this.fx.isIdle()) {
        this.destroy();
      }
      return;
    }
    this.ageMs += deltaMs;
    this.bob += deltaMs * 0.008;
    if (this.ageMs > 22000) {
      this.active = false;
      this.destroy();
      return;
    }
    this.render();
  }

  public destroy(): void {
    this.active = false;
    this.graphics.destroy();
    this.fx.destroy();
    if (this.bodyObject.active) {
      this.bodyObject.destroy();
    }
  }

  private render(): void {
    if (!this.bodyObject.active) {
      return;
    }
    this.graphics.clear();
    const x = this.bodyObject.x;
    const y = this.bodyObject.y + Math.sin(this.bob) * 2.5;
    const s = 18;
    const half = s / 2;
    const pulse = 0.88 + Math.sin(this.bob * 1.8) * 0.12;
    this.graphics.fillStyle(toHex('#0D1A12'), 0.22 * pulse);
    this.graphics.fillRect(x - half - 5, y + half + 3, s + 10, 4);
    this.graphics.fillStyle(toHex('#2EDB5B'), 1);
    this.graphics.fillRect(x - half, y - half, s, s);
    this.graphics.fillStyle(toHex('#A8FFBC'), 0.95);
    this.graphics.fillRect(x - half + 2, y - half + 2, s - 8, 4);
    this.graphics.fillStyle(toHex('#FFFFFF'), 1);
    this.graphics.fillRect(x - 2, y - 6, 4, 12);
    this.graphics.fillRect(x - 6, y - 2, 12, 4);
    this.graphics.lineStyle(2, toHex('#FFFFFF'), 0.9 * pulse);
    this.graphics.strokeRect(x - half, y - half, s, s);
  }
}
