import Phaser from 'phaser';
import { PLAYER_VIEW_COLORS } from '../entities/player/PlayerView';
import { readSafeInsets } from './responsive/safeArea';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class PlayerHealthHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private maxHp: number;
  private lastCurrentHp = 0;

  constructor(scene: Phaser.Scene, maxHp: number) {
    this.scene = scene;
    this.maxHp = maxHp;
    this.lastCurrentHp = maxHp;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);
    this.graphics.setScrollFactor(0);
    this.render(maxHp);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize = (): void => {
    this.render(this.lastCurrentHp, this.maxHp);
  };

  public render(currentHp: number, maxHp = this.maxHp): void {
    this.maxHp = Math.max(0, maxHp);
    this.lastCurrentHp = currentHp;
    // Display uses integer slots to avoid fractional blocks; gameplay keeps precise HP.
    const maxSlots = Math.max(1, Math.ceil(this.maxHp));
    const hp = Phaser.Math.Clamp(currentHp, 0, this.maxHp);
    const inset = readSafeInsets(this.scene);
    const h = this.scene.scale.height;
    const compact = h < 420;
    const size = compact ? 13 : 18;
    const gap = compact ? 5 : 8;
    const marginX = 12 + inset.left;
    const y = 12 + inset.top;
    const startX = marginX;

    this.graphics.clear();
    const strokeW = compact ? 1.5 : 2;
    for (let i = 0; i < maxSlots; i += 1) {
      const x = startX + i * (size + gap);
      const fill = Phaser.Math.Clamp(hp - i, 0, 1);
      this.graphics.fillStyle(toHex(PLAYER_VIEW_COLORS.body), 1);
      this.graphics.fillRect(x, y, size, size);
      if (fill > 0) {
        this.graphics.fillStyle(toHex(PLAYER_VIEW_COLORS.outline), 1);
        this.graphics.fillRect(x, y, size * fill, size);
      }
      this.graphics.lineStyle(strokeW, toHex('#000000'), 1);
      this.graphics.strokeRect(x, y, size, size);
    }
  }

  public destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.graphics.destroy();
  }
}
