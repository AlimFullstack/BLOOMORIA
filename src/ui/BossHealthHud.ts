import Phaser from 'phaser';
import { t } from '../i18n/i18n';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class BossHealthHud {
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly hpText: Phaser.GameObjects.Text;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.nameText = scene.add
      .text(0, 0, t('boss.colossus'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#F6F0D8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    this.hpText = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#D3D9E8',
      })
      .setOrigin(0.5, 0);
    this.container = scene.add.container(scene.scale.width / 2, 18, [
      this.graphics,
      this.nameText,
      this.hpText,
    ]);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);
  }

  public show(currentHp: number, maxHp: number): void {
    this.visible = true;
    this.container.setVisible(true);
    this.render(currentHp, maxHp);
  }

  public hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  public render(currentHp: number, maxHp: number): void {
    if (!this.visible) {
      return;
    }
    this.nameText.setText(t('boss.colossus'));
    const hp = Phaser.Math.Clamp(currentHp, 0, maxHp);
    const width = 420;
    const height = 16;
    const left = -width / 2;
    const top = 28;
    const ratio = maxHp > 0 ? hp / maxHp : 0;

    this.nameText.setPosition(0, 0);
    this.hpText.setPosition(0, top + 20);
    this.hpText.setText(`${Math.ceil(hp)} / ${maxHp}`);

    this.graphics.clear();
    this.graphics.fillStyle(toHex('#1A2133'), 0.92);
    this.graphics.fillRoundedRect(left - 10, -6, width + 20, 68, 8);
    this.graphics.lineStyle(2, toHex('#6A748C'), 0.9);
    this.graphics.strokeRoundedRect(left - 10, -6, width + 20, 68, 8);

    this.graphics.fillStyle(toHex('#2B3040'), 1);
    this.graphics.fillRect(left, top, width, height);
    this.graphics.fillStyle(toHex('#FFB347'), 1);
    this.graphics.fillRect(left, top, width * ratio, height);
    this.graphics.lineStyle(2, toHex('#F6F0D8'), 0.8);
    this.graphics.strokeRect(left, top, width, height);
  }

  public destroy(): void {
    this.container.destroy(true);
  }
}
