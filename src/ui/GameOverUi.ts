import Phaser from 'phaser';
import { t } from '../i18n/i18n';
import { AudioManager } from '../audio/AudioManager';
import { readSafeInsets } from './responsive/safeArea';

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
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly killsText: Phaser.GameObjects.Text;
  private readonly upgradesText: Phaser.GameObjects.Text;
  private readonly buttonLabel: Phaser.GameObjects.Text;
  private readonly buttonPanel: Phaser.GameObjects.Rectangle;
  private readonly buttonHit: Phaser.GameObjects.Rectangle;
  private stats: RunStats = { wave: 0, kills: 0, upgrades: 0 };
  private active = false;

  constructor(scene: Phaser.Scene, onRetry: () => void) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(220);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    this.bg = scene.add.rectangle(0, 0, 10, 10, toHex(COLORS.overlay), 0.8);
    this.bg.setInteractive();
    this.container.add(this.bg);

    this.titleText = scene.add
      .text(0, 0, t('gameOver.title'), {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: COLORS.title,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 900 },
      })
      .setOrigin(0.5);

    const style = {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: COLORS.text,
      align: 'center',
      wordWrap: { width: 900 },
    } as const;
    this.waveText = scene.add.text(0, 0, '', style).setOrigin(0.5);
    this.killsText = scene.add.text(0, 0, '', style).setOrigin(0.5);
    this.upgradesText = scene.add.text(0, 0, '', style).setOrigin(0.5);

    this.buttonPanel = scene.add.rectangle(0, 0, 260, 56, toHex(COLORS.button), 1);
    this.buttonPanel.setStrokeStyle(3, toHex(COLORS.border), 1);
    this.buttonLabel = scene.add
      .text(0, 0, t('gameOver.tryAgain'), {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.text,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    this.buttonHit = scene.add.rectangle(0, 0, 260, 56, 0xffffff, 0.001);
    this.buttonHit.setInteractive({ useHandCursor: true });
    this.buttonHit.on('pointerover', () => {
      if (!this.active) return;
      AudioManager.uiHover();
      this.buttonPanel.setFillStyle(toHex(COLORS.panelHover), 1);
      this.buttonPanel.setStrokeStyle(3, toHex(COLORS.borderHover), 1);
    });
    this.buttonHit.on('pointerout', () => {
      this.buttonPanel.setFillStyle(toHex(COLORS.button), 1);
      this.buttonPanel.setStrokeStyle(3, toHex(COLORS.border), 1);
    });
    this.buttonHit.on('pointerdown', () => {
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
      this.buttonPanel,
      this.buttonLabel,
      this.buttonHit,
    ]);
    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout = (): void => {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const inset = readSafeInsets(this.scene);
    const safeW = Math.max(200, w - inset.left - inset.right - 16);
    const cx = inset.left + 8 + safeW / 2;
    const compact = h < 430;
    const ui = Phaser.Math.Clamp(h / 720, 0.62, 1);
    this.bg.setPosition(w / 2, h / 2).setSize(w, h);
    this.titleText
      .setPosition(cx, inset.top + 12 + (compact ? 28 : 56) * ui)
      .setFontSize(Math.round((compact ? 28 : 42) * ui))
      .setWordWrapWidth(safeW - 20);
    const statsY = inset.top + 12 + (compact ? 72 : 130) * ui;
    const line = Math.round((compact ? 24 : 34) * ui);
    const statSize = Math.round((compact ? 15 : 20) * ui);
    for (const [i, txt] of [this.waveText, this.killsText, this.upgradesText].entries()) {
      txt
        .setPosition(cx, statsY + i * line)
        .setFontSize(statSize)
        .setWordWrapWidth(safeW - 20);
    }
    const btnW = Phaser.Math.Clamp(Math.round(260 * ui), 180, Math.min(320, safeW - 20));
    const btnH = Phaser.Math.Clamp(Math.round(56 * ui), 46, 60);
    const btnY = Math.min(
      h - inset.bottom - 14 - btnH / 2,
      statsY + 2 * line + Math.round(52 * ui) + btnH / 2,
    );
    this.buttonPanel.setPosition(cx, btnY).setSize(btnW, btnH);
    this.buttonLabel.setPosition(cx, btnY).setFontSize(Math.round(22 * ui));
    this.buttonHit.setPosition(cx, btnY).setSize(btnW, btnH);
  };

  public show(stats: RunStats): void {
    this.active = true;
    this.stats = stats;
    this.layout();
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
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.container.destroy(true);
  }
}
