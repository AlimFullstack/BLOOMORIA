import Phaser from 'phaser';
import type { UpgradeDefinition } from '../data/upgrades/upgrade.types';
import { t, type TranslationKey } from '../i18n/i18n';
import {
  getDamageUpgradeBonus,
  getHealAmountTenPercent,
  getHealthUpgradeBonusHp,
} from '../data/upgrades/healthUpgrade';
import { AudioManager } from '../audio/AudioManager';
import { readSafeInsets } from './responsive/safeArea';

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
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly cards: Phaser.GameObjects.Container[] = [];
  private readonly hitAreas: Phaser.GameObjects.Rectangle[] = [];
  private active = false;
  private lastOffers: readonly UpgradeDefinition[] = [];
  private readonly onSelect: (upgrade: UpgradeDefinition) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    onSelect: (upgrade: UpgradeDefinition) => void,
    private readonly getCurrentMaxHp: () => number,
    private readonly getCurrentAttackDamage: () => number,
  ) {
    this.onSelect = onSelect;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(200);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    this.bg = scene.add.rectangle(0, 0, 10, 10, toHex(COLORS.overlay), 0.78);
    this.bg.setInteractive();
    this.container.add(this.bg);

    this.titleText = scene.add.text(0, 0, t('upgrade.waveCleared'), {
      fontFamily: 'monospace',
      fontSize: '34px',
      color: COLORS.title,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 900 },
    });
    this.titleText.setOrigin(0.5);
    this.subtitleText = scene.add.text(0, 0, t('upgrade.chooseOne'), {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: COLORS.subtitle,
      align: 'center',
      wordWrap: { width: 900 },
    });
    this.subtitleText.setOrigin(0.5);
    this.container.add([this.titleText, this.subtitleText]);

    for (let i = 0; i < 3; i += 1) {
      const card = this.createCard();
      this.cards.push(card.container);
      this.hitAreas.push(card.hit);
      this.container.add(card.container);
    }
    this.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout = (): void => {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const inset = readSafeInsets(this.scene);
    const safeW = Math.max(200, w - inset.left - inset.right - 16);
    const safeH = Math.max(180, h - inset.top - inset.bottom - 16);
    const cx = inset.left + 8 + safeW / 2;
    this.bg.setPosition(w / 2, h / 2).setSize(w, h);

    const compactH = h < 430;
    const veryTight = w < 560 || h < 350;
    const titleSize = compactH ? 22 : 34;
    const subSize = compactH ? 14 : 18;
    const titleY = inset.top + 8 + (compactH ? 18 : 34);
    this.titleText
      .setPosition(cx, titleY)
      .setFontSize(titleSize)
      .setWordWrapWidth(safeW - 20);
    this.subtitleText
      .setPosition(cx, titleY + (compactH ? 24 : 40))
      .setFontSize(subSize)
      .setWordWrapWidth(safeW - 20);

    const gap = compactH ? 8 : 16;
    const cardW = veryTight
      ? Math.min(safeW - 8, Math.max(150, Math.floor((safeW - gap * 2) / 3)))
      : Phaser.Math.Clamp(Math.floor((safeW - gap * 2) / 3), 150, 240);
    const topArea = titleY + (compactH ? 42 : 62);
    const availableH = inset.top + 8 + safeH - topArea - 8;
    const cardH = Phaser.Math.Clamp(Math.floor(availableH), veryTight ? 120 : 130, 190);
    const totalW = cardW * 3 + gap * 2;
    const startX = cx - totalW / 2 + cardW / 2;
    const cardY = topArea + cardH / 2 + 4;

    // Vertically center the whole block (title/subtitle + cards) in the safe area.
    const blockTop = titleY - titleSize * 0.65;
    const blockBottom = cardY + cardH / 2;
    const blockH = blockBottom - blockTop;
    const safeTop = inset.top + 8;
    const centerOffset = safeTop + safeH / 2 - (blockTop + blockH / 2);
    const maxDown = Math.max(0, safeTop + safeH - blockBottom - 4);
    const maxUp = Math.max(0, blockTop - safeTop - 4);
    const offsetY = Phaser.Math.Clamp(centerOffset, -maxUp, maxDown);

    this.titleText
      .setPosition(cx, titleY + offsetY)
      .setFontSize(titleSize)
      .setWordWrapWidth(safeW - 20);
    this.subtitleText
      .setPosition(cx, titleY + (compactH ? 24 : 40) + offsetY)
      .setFontSize(subSize)
      .setWordWrapWidth(safeW - 20);

    for (let i = 0; i < this.cards.length; i += 1) {
      const card = this.cards[i];
      const hit = this.hitAreas[i];
      const x = startX + i * (cardW + gap);
      card.setPosition(x, cardY + offsetY);
      const panel = card.getByName('panel') as Phaser.GameObjects.Rectangle | null;
      panel?.setSize(cardW, cardH);
      hit.setSize(cardW, cardH);
      const name = card.getByName('name') as Phaser.GameObjects.Text | null;
      const desc = card.getByName('desc') as Phaser.GameObjects.Text | null;
      const nameSize = cardH < 145 ? 14 : 19;
      const descSize = cardH < 145 ? 11 : 13;
      name
        ?.setPosition(0, -cardH * 0.24)
        .setFontSize(nameSize)
        .setWordWrapWidth(cardW - 16);
      desc
        ?.setPosition(0, cardH * 0.08)
        .setFontSize(descSize)
        .setWordWrapWidth(cardW - 16);
    }
  };

  public show(upgrades: readonly UpgradeDefinition[]): void {
    this.active = true;
    this.lastOffers = upgrades;
    this.layout();
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
      desc?.setText(this.getUpgradeDescription(upgrade, this.getCurrentMaxHp()));
      this.setCardHover(card, false);
    }
  }

  public refreshText(): void {
    this.titleText.setText(t('upgrade.waveCleared'));
    this.subtitleText.setText(t('upgrade.chooseOne'));
    const currentMaxHp = this.getCurrentMaxHp();
    for (let i = 0; i < this.cards.length; i += 1) {
      const card = this.cards[i];
      const upgrade =
        (card.getData('upgrade') as UpgradeDefinition | undefined) ?? this.lastOffers[i];
      if (!upgrade) continue;
      const name = card.getByName('name') as Phaser.GameObjects.Text | null;
      const desc = card.getByName('desc') as Phaser.GameObjects.Text | null;
      name?.setText(t(`upgrade.${upgrade.id}.name` as TranslationKey));
      desc?.setText(this.getUpgradeDescription(upgrade, currentMaxHp));
    }
  }

  private getUpgradeDescription(
    upgrade: UpgradeDefinition,
    currentMaxHp = this.getCurrentMaxHp(),
    currentAttackDamage = this.getCurrentAttackDamage(),
  ): string {
    if (upgrade.id === 'max_hp') {
      const bonusHp = getHealthUpgradeBonusHp(currentMaxHp);
      return t('upgrade.max_hp.desc', { bonus: bonusHp });
    }
    if (upgrade.id === 'damage') {
      const bonus = getDamageUpgradeBonus(currentAttackDamage);
      return t('upgrade.damage.desc', { bonus });
    }
    if (upgrade.id === 'heal') {
      const amount = getHealAmountTenPercent(currentMaxHp);
      return t('upgrade.heal.desc', { amount });
    }
    return t(`upgrade.${upgrade.id}.desc` as TranslationKey);
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
    this.cards.length = 0;
    this.hitAreas.length = 0;
  }

  private createCard(): {
    container: Phaser.GameObjects.Container;
    hit: Phaser.GameObjects.Rectangle;
  } {
    const container = this.scene.add.container(0, 0);
    const panel = this.scene.add.rectangle(0, 0, 200, 150, toHex(COLORS.panel), 1);
    panel.setName('panel');
    panel.setStrokeStyle(3, toHex(COLORS.border), 1);

    const name = this.scene.add.text(0, -36, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: COLORS.name,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 180 },
    });
    name.setName('name');
    name.setOrigin(0.5);

    const desc = this.scene.add.text(0, 18, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: COLORS.desc,
      align: 'center',
      wordWrap: { width: 180 },
    });
    desc.setName('desc');
    desc.setOrigin(0.5);

    const hit = this.scene.add.rectangle(0, 0, 200, 150, 0xffffff, 0.001);
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
        this.onSelect(upgrade);
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
