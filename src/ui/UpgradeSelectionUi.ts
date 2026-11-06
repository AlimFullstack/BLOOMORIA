import Phaser from 'phaser';
import type { UpgradeDefinition } from '../data/upgrades/upgrade.types';
import { t, type TranslationKey } from '../i18n/i18n';
import { AudioManager } from '../audio/AudioManager';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const COLORS = {
  overlay: '#0D1526',
  panel: '#18223A',
  panelHover: '#223055',
  border: '#8589E9',
  borderHover: '#FFFFFF',
  title: '#FFFFFF',
  subtitle: '#B1B3FF',
  name: '#EAF2FF',
  desc: '#D4E6F8',
} as const;

export class UpgradeSelectionUi {
  private readonly container: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly cards: Phaser.GameObjects.Container[] = [];
  private readonly hitAreas: Phaser.GameObjects.Rectangle[] = [];
  private active = false;

  constructor(
    private readonly scene: Phaser.Scene,
    onSelect: (upgrade: UpgradeDefinition) => void,
  ) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(200);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    const bg = scene.add.rectangle(w / 2, h / 2, w, h, toHex(COLORS.overlay), 0.72);
    bg.setInteractive();
    this.container.add(bg);

    this.titleText = scene.add.text(w / 2, 150, t('upgrade.waveCleared'), {
      fontFamily: 'monospace',
      fontSize: '34px',
      color: COLORS.title,
      fontStyle: 'bold',
    });
    this.titleText.setOrigin(0.5);
    this.subtitleText = scene.add.text(w / 2, 194, t('upgrade.chooseOne'), {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: COLORS.subtitle,
    });
    this.subtitleText.setOrigin(0.5);
    this.container.add([this.titleText, this.subtitleText]);

    const cardW = 240;
    const cardH = 170;
    const gap = 26;
    const startX = w / 2 - (cardW * 3 + gap * 2) / 2 + cardW / 2;
    const y = 360;
    for (let i = 0; i < 3; i += 1) {
      const cx = startX + i * (cardW + gap);
      const card = this.createCard(cx, y, cardW, cardH, onSelect);
      this.cards.push(card.container);
      this.hitAreas.push(card.hit);
      this.container.add(card.container);
    }
  }

  public show(upgrades: readonly UpgradeDefinition[]): void {
    this.active = true;
    this.refreshText();
    AudioManager.uiUpgradeAppear();
    this.container.setVisible(true);
    for (let i = 0; i < 3; i += 1) {
      const upgrade = upgrades[i];
      const card = this.cards[i];
      const hit = this.hitAreas[i];
      if (!upgrade || !card || !hit) {
        continue;
      }
      hit.setData('upgrade', upgrade);
      card.setData('upgrade', upgrade);
      const name = card.getByName('name') as Phaser.GameObjects.Text | null;
      const desc = card.getByName('desc') as Phaser.GameObjects.Text | null;
      name?.setText(t(`upgrade.${upgrade.id}.name` as TranslationKey));
      desc?.setText(t(`upgrade.${upgrade.id}.desc` as TranslationKey));
      this.setCardHover(card, false);
    }
  }

  public refreshText(): void {
    this.titleText.setText(t('upgrade.waveCleared'));
    this.subtitleText.setText(t('upgrade.chooseOne'));
    for (const card of this.cards) {
      const upgrade = card.getData('upgrade') as UpgradeDefinition | undefined;
      if (!upgrade) continue;
      const name = card.getByName('name') as Phaser.GameObjects.Text | null;
      const desc = card.getByName('desc') as Phaser.GameObjects.Text | null;
      name?.setText(t(`upgrade.${upgrade.id}.name` as TranslationKey));
      desc?.setText(t(`upgrade.${upgrade.id}.desc` as TranslationKey));
    }
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
    this.cards.length = 0;
    this.hitAreas.length = 0;
  }

  private createCard(
    x: number,
    y: number,
    w: number,
    h: number,
    onSelect: (upgrade: UpgradeDefinition) => void,
  ): { container: Phaser.GameObjects.Container; hit: Phaser.GameObjects.Rectangle } {
    const container = this.scene.add.container(x, y);
    const panel = this.scene.add.rectangle(0, 0, w, h, toHex(COLORS.panel), 1);
    panel.setName('panel');
    panel.setStrokeStyle(3, toHex(COLORS.border), 1);

    const name = this.scene.add.text(0, -36, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: COLORS.name,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: w - 28 },
    });
    name.setName('name');
    name.setOrigin(0.5);

    const desc = this.scene.add.text(0, 18, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: COLORS.desc,
      align: 'center',
      wordWrap: { width: w - 28 },
    });
    desc.setName('desc');
    desc.setOrigin(0.5);

    const hit = this.scene.add.rectangle(0, 0, w, h, 0xffffff, 0.001);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      if (this.active) {
        AudioManager.uiUpgradeHover();
        this.setCardHover(container, true);
      }
    });
    hit.on('pointerout', () => this.setCardHover(container, false));
    hit.on('pointerdown', () => {
      if (!this.active) {
        return;
      }
      const upgrade = hit.getData('upgrade') as UpgradeDefinition | undefined;
      if (upgrade) {
        AudioManager.uiUpgradeSelect();
        onSelect(upgrade);
      }
    });

    container.add([panel, name, desc, hit]);
    return { container, hit };
  }

  private setCardHover(card: Phaser.GameObjects.Container, hover: boolean): void {
    const panel = card.getByName('panel') as Phaser.GameObjects.Rectangle | null;
    if (!panel) {
      return;
    }
    panel.setFillStyle(toHex(hover ? COLORS.panelHover : COLORS.panel), 1);
    panel.setStrokeStyle(3, toHex(hover ? COLORS.borderHover : COLORS.border), 1);
  }
}
