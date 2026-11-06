import Phaser from 'phaser';
import { t } from '../i18n/i18n';
import { AudioManager } from '../audio/AudioManager';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const COLORS = {
  overlay: '#0D1526',
  panel: '#18223A',
  panelHover: '#223055',
  border: '#8589E9',
  borderHover: '#FFFFFF',
  title: '#FF6B7A',
  text: '#EAF2FF',
  sub: '#B1B3FF',
  button: '#24365F',
} as const;

export interface RunStats {
  wave: number;
  kills: number;
  upgrades: number;
}

export class GameOverUi {
  private readonly container: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly upgradesText: Phaser.GameObjects.Text;
  private readonly buttonLabel: Phaser.GameObjects.Text;
  private stats: RunStats = { wave: 0, kills: 0, upgrades: 0 };
  private active = false;

  constructor(scene: Phaser.Scene, onRetry: () => void) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(220);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(w / 2, h / 2, w, h, toHex(COLORS.overlay), 0.78);
    bg.setInteractive();
    this.container.add(bg);

    this.titleText = scene.add.text(w / 2, 185, t('gameOver.title'), {
      fontFamily: 'monospace',
      fontSize: '42px',
      color: COLORS.title,
      fontStyle: 'bold',
    });
    this.titleText.setOrigin(0.5);

    const style = {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: COLORS.text,
    } as const;
    this.waveText = scene.add.text(w / 2, 270, '', style).setOrigin(0.5);
    this.killsText = scene.add.text(w / 2, 304, '', style).setOrigin(0.5);
    this.upgradesText = scene.add.text(w / 2, 338, '', style).setOrigin(0.5);

    const btnW = 260;
    const btnH = 56;
    const btnY = 430;
    const panel = scene.add.rectangle(w / 2, btnY, btnW, btnH, toHex(COLORS.button), 1);
    panel.setStrokeStyle(3, toHex(COLORS.border), 1);
    this.buttonLabel = scene.add.text(w / 2, btnY, t('gameOver.tryAgain'), {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: COLORS.text,
      fontStyle: 'bold',
    });
    this.buttonLabel.setOrigin(0.5);
    const hit = scene.add.rectangle(w / 2, btnY, btnW, btnH, 0xffffff, 0.001);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      if (!this.active) return;
      AudioManager.uiHover();
      panel.setFillStyle(toHex(COLORS.panelHover), 1);
      panel.setStrokeStyle(3, toHex(COLORS.borderHover), 1);
    });
    hit.on('pointerout', () => {
      panel.setFillStyle(toHex(COLORS.button), 1);
      panel.setStrokeStyle(3, toHex(COLORS.border), 1);
    });
    hit.on('pointerdown', () => {
      if (this.active) {
        AudioManager.uiSelect();
        onRetry();
      }
    });

    this.container.add([
      this.titleText,
      this.waveText,
      this.killsText,
      this.upgradesText,
      panel,
      this.buttonLabel,
      hit,
    ]);
  }

  public show(stats: RunStats): void {
    this.active = true;
    this.stats = stats;
    this.refreshText();
    this.container.setVisible(true);
  }

  public refreshText(): void {
    this.titleText.setText(t('gameOver.title'));
    this.waveText.setText(t('gameOver.reachedWave', { wave: this.stats.wave }));
    this.killsText.setText(t('gameOver.kills', { kills: this.stats.kills }));
    this.upgradesText.setText(t('gameOver.upgrades', { upgrades: this.stats.upgrades }));
    this.buttonLabel.setText(t('gameOver.tryAgain'));
  }

  public hide(): void {
    this.active = false;
    this.container.setVisible(false);
  }

  public isActive(): boolean {
    return this.active;
  }

  public destroy(): void {
    this.container.destroy(true);
  }
}
