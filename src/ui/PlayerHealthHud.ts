import Phaser from 'phaser';
import { PLAYER_VIEW_COLORS } from '../entities/player/PlayerView';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class PlayerHealthHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private maxHp: number;

  constructor(scene: Phaser.Scene, maxHp: number) {
    this.maxHp = maxHp;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);
    this.graphics.setScrollFactor(0);
    this.render(maxHp);
  }

  public render(currentHp: number, maxHp = this.maxHp): void {
    this.maxHp = Math.max(0, maxHp);
    // Display uses integer slots to avoid fractional blocks; gameplay keeps precise HP.
    const maxSlots = Math.max(1, Math.ceil(this.maxHp));
    const hp = Phaser.Math.Clamp(currentHp, 0, this.maxHp);
    const size = 18;
    const gap = 8;
    const margin = 18;
    const startX = margin;
    const y = margin;

    this.graphics.clear();
    for (let i = 0; i < maxSlots; i += 1) {
      const x = startX + i * (size + gap);
      const fill = Phaser.Math.Clamp(hp - i, 0, 1);
      this.graphics.fillStyle(toHex(PLAYER_VIEW_COLORS.body), 1);
      this.graphics.fillRect(x, y, size, size);
      if (fill > 0) {
        this.graphics.fillStyle(toHex(PLAYER_VIEW_COLORS.outline), 1);
        this.graphics.fillRect(x, y, size * fill, size);
      }
      this.graphics.lineStyle(2, toHex('#000000'), 1);
      this.graphics.strokeRect(x, y, size, size);
    }
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
