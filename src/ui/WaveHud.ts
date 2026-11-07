import Phaser from 'phaser';
import { t } from '../i18n/i18n';
import { readSafeInsets } from './responsive/safeArea';

export class WaveHud {
  private readonly text: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
  private last = { wave: 1, alive: 0, pending: 0, isBossWave: false };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.text = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#EAF2FF',
      stroke: '#0D1526',
      strokeThickness: 3,
      wordWrap: { width: Math.max(180, scene.scale.width * 0.55) },
    });
    this.text.setDepth(100);
    this.text.setScrollFactor(0);
    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize = (): void => {
    this.layout();
    this.render(this.last.wave, this.last.alive, this.last.pending, this.last.isBossWave);
  };

  private layout(): void {
    const inset = readSafeInsets(this.scene);
    const compact = this.scene.scale.height < 420;
    this.text.setPosition(12 + inset.left, (compact ? 30 : 40) + inset.top);
    this.text.setFontSize(compact ? '12px' : '14px');
    this.text.setWordWrapWidth(
      Math.max(160, this.scene.scale.width - 140 - inset.left - inset.right),
    );
  }

  public render(wave: number, alive: number, pending: number, isBossWave = false): void {
    this.last = { wave, alive, pending, isBossWave };
    const waveLabel = isBossWave
      ? `${t('hud.wave', { wave })}  |  ${t('hud.boss')}`
      : t('hud.wave', { wave });
    this.text.setText(
      `${waveLabel}  |  ${t('hud.alive', { alive })}  |  ${t('hud.pending', { pending })}`,
    );
    this.text.setColor(isBossWave ? '#FFD27A' : '#EAF2FF');
  }

  public destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.text.destroy();
  }
}
