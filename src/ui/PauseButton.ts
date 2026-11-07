import Phaser from 'phaser';
import { readSafeInsets } from './responsive/safeArea';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class PauseButton {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly rect: Phaser.GameObjects.Rectangle;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly hit: Phaser.GameObjects.Rectangle;
  private hover = false;

  constructor(
    scene: Phaser.Scene,
    private readonly onClick: () => void,
  ) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(160).setScrollFactor(0);
    this.rect = scene.add.rectangle(0, 0, 44, 36, toHex('#18223A'), 0.96);
    this.rect.setStrokeStyle(2, toHex('#8589E9'), 1);
    this.icon = scene.add.graphics();
    this.drawIcon();
    this.hit = scene.add.rectangle(0, 0, 44, 36, 0xffffff, 0.001);
    this.hit.setInteractive({ useHandCursor: true });
    this.hit.on('pointerover', () => this.setHover(true));
    this.hit.on('pointerout', () => this.setHover(false));
    this.hit.on('pointerdown', () => {
      if (this.container.visible) this.onClick();
    });
    this.container.add([this.rect, this.icon, this.hit]);
    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout = (): void => {
    const inset = readSafeInsets(this.scene);
    const compact = this.scene.scale.height < 460;
    const bw = compact ? 48 : 44;
    const bh = compact ? 40 : 36;
    const x = this.scene.scale.width - 12 - inset.right - bw / 2;
    const y = 12 + inset.top + bh / 2;
    this.container.setPosition(x, y);
    this.rect.setSize(bw, bh);
    this.hit.setSize(bw, bh);
  };

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.destroy(true);
  }

  private setHover(hover: boolean): void {
    this.hover = hover;
    this.rect.setFillStyle(toHex(hover ? '#223055' : '#18223A'), 0.96);
    this.rect.setStrokeStyle(2, toHex(hover ? '#FFFFFF' : '#8589E9'), 1);
  }

  private drawIcon(): void {
    this.icon.clear();
    const c = toHex(this.hover ? '#FFFFFF' : '#EAF2FF');
    this.icon.fillStyle(c, 1);
    this.icon.fillRect(-8, -8, 5, 16);
    this.icon.fillRect(3, -8, 5, 16);
  }
}
