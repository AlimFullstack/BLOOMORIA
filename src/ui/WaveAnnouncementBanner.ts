import Phaser from 'phaser';
import { t } from '../i18n/i18n';
import { readSafeInsets } from './responsive/safeArea';

type BannerPhase = 'idle' | 'in' | 'hold' | 'out';

interface Announcement {
  wave: number;
  isBossWave: boolean;
}

const VIEWPORT_Y_RATIO = 0.275;
const IN_MS = 220;
const HOLD_MS = 1750;
const OUT_MS = 260;
const DEPTH = 150;

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class WaveAnnouncementBanner {
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly baseY: () => number;
  private phase: BannerPhase = 'idle';
  private phaseMs = 0;
  private current: Announcement | null = null;
  private queued: Announcement | null = null;
  private lastShownWave = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.baseY = (): number => {
      const inset = readSafeInsets(this.scene);
      return Math.round(
        inset.top + (this.scene.scale.height - inset.top - inset.bottom) * VIEWPORT_Y_RATIO,
      );
    };
    const x = this.scene.scale.width / 2;
    this.container = scene.add.container(x, this.baseY());
    this.container.setDepth(DEPTH);
    this.container.setScrollFactor(0);
    this.container.setAlpha(0);
    this.container.setVisible(false);

    this.background = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#FFFFFF',
        align: 'center',
        stroke: '#0D1526',
        strokeThickness: 5,
        wordWrap: { width: Math.max(180, scene.scale.width - 40) },
      })
      .setOrigin(0.5);

    this.container.add([this.background, this.text]);
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
  }

  public announce(wave: number, isBossWave: boolean): void {
    if (wave <= 0 || wave === this.lastShownWave) {
      return;
    }
    const next: Announcement = { wave, isBossWave };
    if (this.phase === 'idle') {
      this.start(next);
      return;
    }
    // Never overlap: keep the latest pending announcement until the current one finishes.
    if (!this.queued || this.queued.wave !== next.wave) {
      this.queued = next;
    }
  }

  public update(delta: number): void {
    if (this.phase === 'idle' || !this.current) {
      return;
    }
    this.phaseMs += Math.max(0, delta);
    if (this.phase === 'in') {
      const t = Phaser.Math.Clamp(this.phaseMs / IN_MS, 0, 1);
      const eased = Phaser.Math.Easing.Cubic.Out(t);
      this.container.setAlpha(eased);
      this.container.setScale(0.86 + 0.14 * eased);
      this.container.y = this.baseY() + (1 - eased) * 10;
      if (t >= 1) {
        this.phase = 'hold';
        this.phaseMs = 0;
      }
      return;
    }
    if (this.phase === 'hold') {
      this.container.setAlpha(1);
      this.container.setScale(1);
      this.container.y = this.baseY();
      if (this.phaseMs >= HOLD_MS) {
        this.phase = 'out';
        this.phaseMs = 0;
      }
      return;
    }
    if (this.phase === 'out') {
      const t = Phaser.Math.Clamp(this.phaseMs / OUT_MS, 0, 1);
      const eased = Phaser.Math.Easing.Cubic.In(t);
      this.container.setAlpha(1 - eased);
      this.container.setScale(1 - 0.04 * eased);
      this.container.y = this.baseY() - eased * 8;
      if (t >= 1) {
        this.finish();
      }
    }
  }

  public refreshText(): void {
    if (!this.current) {
      return;
    }
    this.applyCurrentText(this.current);
  }

  public resize(): void {
    this.container.x = this.scene.scale.width / 2;
    if (this.phase === 'idle') {
      this.container.y = this.baseY();
    } else if (this.phase === 'hold') {
      this.container.y = this.baseY();
    }
    if (this.current) {
      this.drawBackground(this.current.isBossWave);
    }
  }

  public destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.container.destroy(true);
    this.current = null;
    this.queued = null;
    this.phase = 'idle';
  }

  private start(announcement: Announcement): void {
    this.current = announcement;
    this.lastShownWave = announcement.wave;
    this.queued = this.queued?.wave === announcement.wave ? null : this.queued;
    this.phase = 'in';
    this.phaseMs = 0;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.container.setScale(0.86);
    this.container.y = this.baseY() + 10;
    this.applyCurrentText(announcement);
  }

  private finish(): void {
    this.container.setVisible(false);
    this.container.setAlpha(0);
    this.container.setScale(1);
    this.container.y = this.baseY();
    this.phase = 'idle';
    this.phaseMs = 0;
    this.current = null;
    if (this.queued) {
      const next = this.queued;
      this.queued = null;
      if (next.wave !== this.lastShownWave) {
        this.start(next);
      }
    }
  }

  private applyCurrentText(announcement: Announcement): void {
    const inset = readSafeInsets(this.scene);
    const safeW = Math.max(160, this.scene.scale.width - inset.left - inset.right - 24);
    const compact = this.scene.scale.height < 430;
    const label = announcement.isBossWave
      ? t('banner.bossWave')
      : t('banner.wave', { wave: announcement.wave });
    this.text.setText(label);
    this.text.setWordWrapWidth(safeW - 32);
    this.text.setFontSize(
      announcement.isBossWave ? (compact ? '26px' : '40px') : compact ? '22px' : '34px',
    );
    this.text.setColor(announcement.isBossWave ? '#FFF3C8' : '#F4F8FF');
    this.text.setStroke(announcement.isBossWave ? '#3A2210' : '#0D1526', compact ? 4 : 5);
    this.drawBackground(announcement.isBossWave);
  }

  private drawBackground(isBossWave: boolean): void {
    const padX = isBossWave ? 34 : 28;
    const padY = isBossWave ? 16 : 14;
    const width = Math.max(220, Math.ceil(this.text.width + padX * 2));
    const height = Math.max(54, Math.ceil(this.text.height + padY * 2));
    const x = -width / 2;
    const y = -height / 2;
    this.background.clear();

    if (isBossWave) {
      this.background.fillStyle(toHex('#2A1A12'), 0.92);
      this.background.fillRoundedRect(x, y, width, height, 10);
      this.background.lineStyle(3, toHex('#FFB347'), 1);
      this.background.strokeRoundedRect(x, y, width, height, 10);
      this.background.lineStyle(1, toHex('#FFF0C2'), 0.55);
      this.background.strokeRoundedRect(x + 4, y + 4, width - 8, height - 8, 8);
    } else {
      this.background.fillStyle(toHex('#18223A'), 0.9);
      this.background.fillRoundedRect(x, y, width, height, 8);
      this.background.lineStyle(2, toHex('#8589E9'), 1);
      this.background.strokeRoundedRect(x, y, width, height, 8);
      this.background.lineStyle(1, toHex('#C9D7FF'), 0.3);
      this.background.strokeRoundedRect(x + 3, y + 3, width - 6, height - 6, 6);
    }
  }
}
