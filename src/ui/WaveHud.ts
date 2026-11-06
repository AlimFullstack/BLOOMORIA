import Phaser from 'phaser';
import { t } from '../i18n/i18n';

export class WaveHud {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(18, 46, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#EAF2FF',
      stroke: '#0D1526',
      strokeThickness: 3,
    });
    this.text.setDepth(100);
    this.text.setScrollFactor(0);
  }

  public render(wave: number, alive: number, pending: number, isBossWave = false): void {
    const waveLabel = isBossWave
      ? `${t('hud.wave', { wave })}  |  ${t('hud.boss')}`
      : t('hud.wave', { wave });
    this.text.setText(
      `${waveLabel}  |  ${t('hud.alive', { alive })}  |  ${t('hud.pending', { pending })}`,
    );
    this.text.setColor(isBossWave ? '#FFD27A' : '#EAF2FF');
  }

  public destroy(): void {
    this.text.destroy();
  }
}
