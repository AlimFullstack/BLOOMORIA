import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { t, type TranslationKey } from '../i18n/i18n';
import { KEYBINDINGS } from '../input/KeyboardInput';
import {
  applyGameSettings,
  getGameSettings,
  setLanguage,
  setMasterVolume,
  setMusicVolume,
  setMuted,
  setSfxVolume,
  type Language,
} from '../settings/GameSettings';
import { readSafeInsets } from '../ui/responsive/safeArea';
import type { GameScene } from './GameScene';

type PauseView = 'menu' | 'settings' | 'controls';

interface MenuButton {
  key: 'resume' | 'settings' | 'controls' | 'restart';
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  container: Phaser.GameObjects.Container;
}

interface SliderUi {
  kind: 'master' | 'music' | 'sfx';
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  track: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  hit: Phaser.GameObjects.Rectangle;
  onChange: (v: number) => void;
}

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const COLORS = {
  overlay: '#0D1526',
  panel: '#18223A',
  panelHover: '#223055',
  border: '#8589E9',
  borderHover: '#FFFFFF',
  title: '#FFFFFF',
  text: '#EAF2FF',
  sub: '#B1B3FF',
  muted: '#8FA0C2',
  accent: '#8589E9',
  track: '#24365F',
} as const;

export class PauseScene extends Phaser.Scene {
  private view: PauseView = 'menu';
  private root!: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Rectangle;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private menuContainer!: Phaser.GameObjects.Container;
  private settingsContainer!: Phaser.GameObjects.Container;
  private controlsContainer!: Phaser.GameObjects.Container;
  private menuButtons: MenuButton[] = [];
  private sliders: SliderUi[] = [];
  private escKey?: Phaser.Input.Keyboard.Key;
  private pKey?: Phaser.Input.Keyboard.Key;
  private muteRect!: Phaser.GameObjects.Rectangle;
  private muteLabelText!: Phaser.GameObjects.Text;
  private muteStateText!: Phaser.GameObjects.Text;
  private muteHit!: Phaser.GameObjects.Rectangle;
  private langLabelText!: Phaser.GameObjects.Text;
  private langValueText!: Phaser.GameObjects.Text;
  private langRect!: Phaser.GameObjects.Rectangle;
  private langHit!: Phaser.GameObjects.Rectangle;
  private settingsBack!: {
    container: Phaser.GameObjects.Container;
    rect: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
    hit: Phaser.GameObjects.Rectangle;
  };
  private controlsBack!: {
    container: Phaser.GameObjects.Container;
    rect: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
    hit: Phaser.GameObjects.Rectangle;
  };
  private audioNoteText!: Phaser.GameObjects.Text;
  private controlLines: Phaser.GameObjects.Text[] = [];
  private draggingVolume: 'master' | 'music' | 'sfx' | null = null;

  constructor() {
    super('PauseScene');
  }

  public create(): void {
    AudioManager.init(this.sound);
    applyGameSettings(this.sound);
    AudioManager.update(0, { paused: true, upgradeActive: false });
    AudioManager.uiOpen();

    this.root = this.add.container(0, 0).setDepth(500).setScrollFactor(0);
    this.bg = this.add.rectangle(0, 0, 10, 10, toHex(COLORS.overlay), 0.76);
    this.bg.setInteractive();
    this.root.add(this.bg);

    this.panelGfx = this.add.graphics();
    this.root.add(this.panelGfx);
    this.titleText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: COLORS.title,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 900 },
      })
      .setOrigin(0.5);
    this.root.add(this.titleText);

    this.menuContainer = this.add.container(0, 0);
    this.settingsContainer = this.add.container(0, 0);
    this.controlsContainer = this.add.container(0, 0);
    this.root.add([this.menuContainer, this.settingsContainer, this.controlsContainer]);

    this.buildMenu();
    this.buildSettings();
    this.buildControls();
    this.layout();
    this.setView('menu');

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.pKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    }

    this.input.on('pointerup', () => {
      this.draggingVolume = null;
    });
    this.input.on('pointerupoutside', () => {
      this.draggingVolume = null;
    });
    this.input.on('gameout', () => {
      this.draggingVolume = null;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.draggingVolume && this.view === 'settings' && pointer.isDown) {
        this.updateVolumeFromPointer(this.draggingVolume, pointer.x);
      }
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  public update(): void {
    const escPressed = this.escKey ? Phaser.Input.Keyboard.JustDown(this.escKey) : false;
    const pPressed = this.pKey ? Phaser.Input.Keyboard.JustDown(this.pKey) : false;
    if (escPressed || pPressed) {
      if (this.view === 'menu') this.resumeGame();
      else this.setView('menu');
    }
  }

  private layout = (): void => {
    const w = this.scale.width;
    const h = this.scale.height;
    const inset = readSafeInsets(this);
    const ui = Phaser.Math.Clamp(h / 720, 0.62, 1);
    const compact = h < 430;
    const cx = w / 2;
    const safeW = Math.max(220, w - inset.left - inset.right - 12);
    const safeH = Math.max(180, h - inset.top - inset.bottom - 12);
    this.bg.setPosition(w / 2, h / 2).setSize(w, h);

    const panelW =
      this.view === 'menu'
        ? Math.min(420 * ui, safeW)
        : this.view === 'settings'
          ? Math.min(640 * ui, safeW)
          : Math.min(720 * ui, safeW);
    const panelH =
      this.view === 'menu'
        ? Math.min(360 * ui, safeH)
        : this.view === 'settings'
          ? Math.min(Math.max(320, 430 * ui), safeH)
          : Math.min(
              Math.max(260, 150 * ui + KEYBINDINGS.length * (compact ? 22 : 28) + 70 * ui),
              safeH,
            );
    const px = cx - panelW / 2;
    const py = inset.top + 6 + (safeH - panelH) / 2;
    this.panelGfx.clear();
    this.panelGfx.fillStyle(toHex(COLORS.panel), 0.98);
    this.panelGfx.fillRoundedRect(px, py, panelW, panelH, 10);
    this.panelGfx.lineStyle(3, toHex(COLORS.border), 1);
    this.panelGfx.strokeRoundedRect(px, py, panelW, panelH, 10);

    const titleSize = Math.round((compact ? 24 : 38) * ui);
    this.titleText
      .setPosition(cx, py + (compact ? 22 : 36))
      .setFontSize(titleSize)
      .setWordWrapWidth(panelW - 20);

    this.layoutMenu(cx, py, panelW, panelH, ui, compact);
    this.layoutSettings(cx, py, panelW, panelH, ui, compact);
    this.layoutControls(cx, py, panelW, panelH, ui, compact);
  };

  private layoutMenu(
    cx: number,
    py: number,
    pw: number,
    _ph: number,
    ui: number,
    compact: boolean,
  ): void {
    const bw = Math.min(Math.round(300 * ui), pw - 32);
    const bh = Math.max(44, Math.round(46 * ui));
    const gap = Math.max(48, Math.round(58 * ui));
    const startY = py + (compact ? 54 : 78);
    this.menuButtons.forEach((b, i) => {
      b.container.setPosition(cx, startY + i * gap);
      b.rect.setSize(bw, bh);
      b.hit.setSize(bw, bh);
      b.text.setFontSize(Math.round(20 * ui));
    });
  }

  private layoutSettings(
    cx: number,
    py: number,
    pw: number,
    ph: number,
    ui: number,
    compact: boolean,
  ): void {
    const leftX = cx - pw / 2 + 18;
    const rightX = cx + pw / 2 - 18;
    const trackW = Math.max(120, Math.min(pw * 0.36, 250 * ui));
    const trackX = rightX - 46 - trackW / 2;
    const labelSize = Math.max(13, Math.round(17 * ui));
    const valSize = Math.max(12, Math.round(15 * ui));
    const top = py + (compact ? 50 : 68);
    const row = Math.max(40, Math.round(44 * ui));
    this.sliders.forEach((s, i) => {
      const y = top + i * row;
      s.label
        .setPosition(leftX, y)
        .setOrigin(0, 0.5)
        .setFontSize(labelSize)
        .setWordWrapWidth(trackX - trackW / 2 - leftX - 8);
      s.value.setPosition(rightX, y).setOrigin(1, 0.5).setFontSize(valSize);
      s.track.setPosition(trackX, y).setSize(trackW, Math.max(12, Math.round(14 * ui)));
      s.fill
        .setPosition(trackX - trackW / 2, y)
        .setSize(s.track.width * this.getSliderValue(s.kind), s.track.height);
      s.hit.setPosition(trackX, y).setSize(trackW + 20, Math.max(44, Math.round(34 * ui)));
    });
    const toggleW = Math.min(Math.max(120, Math.round(140 * ui)), Math.round(pw * 0.34));
    const toggleH = Math.max(44, Math.round(40 * ui));
    const toggleX = rightX - toggleW / 2;
    const muteY = top + this.sliders.length * row + Math.round(6 * ui);
    this.muteLabelText.setPosition(leftX, muteY).setOrigin(0, 0.5).setFontSize(labelSize);
    this.muteRect.setPosition(toggleX, muteY).setSize(toggleW, toggleH);
    this.muteStateText.setPosition(toggleX, muteY).setFontSize(valSize);
    this.muteHit.setPosition(toggleX, muteY).setSize(toggleW, toggleH);

    const langY = muteY + Math.max(48, Math.round(50 * ui));
    this.langLabelText.setPosition(leftX, langY).setOrigin(0, 0.5).setFontSize(labelSize);
    this.langRect.setPosition(toggleX, langY).setSize(toggleW, toggleH);
    this.langValueText.setPosition(toggleX, langY).setFontSize(Math.max(12, Math.round(14 * ui)));
    this.langHit.setPosition(toggleX, langY).setSize(toggleW, toggleH);

    this.audioNoteText
      .setPosition(cx, langY + Math.max(34, Math.round(38 * ui)))
      .setFontSize(Math.max(11, Math.round(12 * ui)))
      .setWordWrapWidth(pw - 32);

    this.placeSimpleButton(
      this.settingsBack,
      cx,
      Math.min(py + ph - 26, langY + Math.max(64, Math.round(72 * ui))),
      Math.min(Math.round(180 * ui), pw - 32),
      Math.max(44, Math.round(42 * ui)),
      Math.round(17 * ui),
    );
    this.refreshSettingsUi();
  }

  private layoutControls(
    cx: number,
    py: number,
    pw: number,
    ph: number,
    ui: number,
    compact: boolean,
  ): void {
    const lineH = Math.max(20, Math.round((compact ? 22 : 27) * ui));
    const fs = Math.max(12, Math.round((compact ? 13 : 16) * ui));
    const startY = py + (compact ? 48 : 66);
    this.controlLines.forEach((line, i) => {
      line
        .setPosition(cx, startY + i * lineH)
        .setFontSize(fs)
        .setWordWrapWidth(pw - 28);
    });
    const backY = Math.min(
      py + ph - 24,
      startY + this.controlLines.length * lineH + Math.max(22, 26 * ui),
    );
    this.placeSimpleButton(
      this.controlsBack,
      cx,
      backY,
      Math.min(Math.round(180 * ui), pw - 32),
      Math.max(44, Math.round(42 * ui)),
      Math.round(17 * ui),
    );
  }

  private placeSimpleButton(
    b: {
      container: Phaser.GameObjects.Container;
      rect: Phaser.GameObjects.Rectangle;
      text: Phaser.GameObjects.Text;
      hit: Phaser.GameObjects.Rectangle;
    },
    x: number,
    y: number,
    bw: number,
    bh: number,
    fs: number,
  ): void {
    b.container.setPosition(x, y);
    b.rect.setSize(bw, bh);
    b.hit.setSize(bw, bh);
    b.text.setFontSize(fs);
  }

  private getGameScene(): GameScene | undefined {
    return this.scene.get('GameScene') as GameScene | undefined;
  }

  private resumeGame(): void {
    AudioManager.uiSelect();
    const gameScene = this.getGameScene();
    this.scene.stop();
    if (gameScene?.scene.isPaused()) this.scene.resume('GameScene');
    gameScene?.onResumedFromPause();
  }

  private restartRun(): void {
    AudioManager.uiSelect();
    const gameScene = this.getGameScene();
    this.scene.stop('PauseScene');
    if (gameScene?.scene.isPaused()) this.scene.resume('GameScene');
    gameScene?.restartFromPause();
  }

  private setView(view: PauseView): void {
    if (view !== this.view) AudioManager.uiOpen();
    this.view = view;
    this.menuContainer.setVisible(view === 'menu');
    this.settingsContainer.setVisible(view === 'settings');
    this.controlsContainer.setVisible(view === 'controls');
    this.refreshTexts();
    this.layout();
    if (view === 'settings') this.refreshSettingsUi();
  }

  private refreshTexts(): void {
    this.titleText.setText(
      this.view === 'menu'
        ? t('pause.title')
        : this.view === 'settings'
          ? t('settings.title')
          : t('controls.title'),
    );
    const labels: Record<MenuButton['key'], string> = {
      resume: t('pause.resume'),
      settings: t('pause.settings'),
      controls: t('pause.controls'),
      restart: t('pause.restartRun'),
    };
    for (const b of this.menuButtons) b.text.setText(labels[b.key]);
    this.sliders.find((s) => s.kind === 'master')!.label.setText(t('settings.masterVolume'));
    this.sliders.find((s) => s.kind === 'music')!.label.setText(t('settings.musicVolume'));
    this.sliders.find((s) => s.kind === 'sfx')!.label.setText(t('settings.sfxVolume'));
    this.muteLabelText.setText(t('settings.mute'));
    this.langLabelText.setText(t('settings.language'));
    this.settingsBack.text.setText(t('settings.back'));
    this.controlsBack.text.setText(t('controls.back'));
    this.audioNoteText.setText(t('settings.audioNote'));
    this.controlLines.forEach((line, i) => {
      const kb = KEYBINDINGS[i];
      if (!kb) return;
      line.setText(t(kb.key as TranslationKey, { key: kb.binding }));
    });
  }

  private buildMenu(): void {
    const items: Array<{ key: MenuButton['key']; action: () => void }> = [
      { key: 'resume', action: () => this.resumeGame() },
      { key: 'settings', action: () => this.setView('settings') },
      { key: 'controls', action: () => this.setView('controls') },
      { key: 'restart', action: () => this.restartRun() },
    ];
    this.menuButtons = items.map((item) => this.createMenuButton(item.key, item.action));
    this.menuButtons.forEach((b) => this.menuContainer.add(b.container));
  }

  private createMenuButton(key: MenuButton['key'], action: () => void): MenuButton {
    const container = this.add.container(0, 0);
    const rect = this.add.rectangle(0, 0, 300, 46, toHex(COLORS.track), 1);
    rect.setStrokeStyle(2, toHex(COLORS.border), 1);
    const text = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, 300, 46, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      AudioManager.uiHover();
      rect.setFillStyle(toHex(COLORS.panelHover), 1);
      rect.setStrokeStyle(2, toHex(COLORS.borderHover), 1);
    });
    hit.on('pointerout', () => {
      rect.setFillStyle(toHex(COLORS.track), 1);
      rect.setStrokeStyle(2, toHex(COLORS.border), 1);
    });
    hit.on('pointerdown', action);
    container.add([rect, text, hit]);
    return { key, rect, text, hit, container };
  }

  private makeSlider(kind: 'master' | 'music' | 'sfx', onChange: (v: number) => void): SliderUi {
    const label = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);
    const value = this.add
      .text(0, 0, '100%', { fontFamily: 'monospace', fontSize: '16px', color: COLORS.sub })
      .setOrigin(1, 0.5);
    const track = this.add.rectangle(0, 0, 250, 14, toHex(COLORS.track), 1);
    track.setStrokeStyle(2, toHex(COLORS.border), 1);
    const fill = this.add.rectangle(0, 0, 250, 14, toHex(COLORS.accent), 1);
    fill.setOrigin(0, 0.5);
    const hit = this.add
      .rectangle(0, 0, 270, 34, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.draggingVolume = kind;
      this.updateSlider(kind, pointer.x, onChange);
      AudioManager.uiSelect();
    });
    return { kind, label, value, track, fill, hit, onChange };
  }

  private buildSettings(): void {
    this.sliders = [
      this.makeSlider('master', (v) => {
        setMasterVolume(v);
        applyGameSettings(this.sound);
      }),
      this.makeSlider('music', (v) => {
        setMusicVolume(v);
        applyGameSettings(this.sound);
      }),
      this.makeSlider('sfx', (v) => {
        setSfxVolume(v);
        applyGameSettings(this.sound);
      }),
    ];

    this.muteLabelText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);
    this.muteRect = this.add.rectangle(0, 0, 120, 40, toHex(COLORS.track), 1);
    this.muteRect.setStrokeStyle(2, toHex(COLORS.border), 1);
    this.muteStateText = this.add
      .text(0, 0, 'OFF', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.muteHit = this.add.rectangle(0, 0, 120, 44, 0xffffff, 0.001);
    this.muteHit.setInteractive({ useHandCursor: true });
    this.muteHit.on('pointerover', () => {
      AudioManager.uiHover();
      this.muteRect.setStrokeStyle(2, toHex(COLORS.borderHover), 1);
    });
    this.muteHit.on('pointerout', () => this.muteRect.setStrokeStyle(2, toHex(COLORS.border), 1));
    this.muteHit.on('pointerdown', () => {
      setMuted(!getGameSettings().muted);
      applyGameSettings(this.sound);
      AudioManager.uiSelect();
      this.refreshSettingsUi();
    });

    this.langLabelText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);
    this.langRect = this.add.rectangle(0, 0, 140, 40, toHex(COLORS.track), 1);
    this.langRect.setStrokeStyle(2, toHex(COLORS.border), 1);
    this.langValueText = this.add
      .text(0, 0, 'English', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.langHit = this.add.rectangle(0, 0, 140, 44, 0xffffff, 0.001);
    this.langHit.setInteractive({ useHandCursor: true });
    this.langHit.on('pointerover', () => {
      AudioManager.uiHover();
      this.langRect.setStrokeStyle(2, toHex(COLORS.borderHover), 1);
    });
    this.langHit.on('pointerout', () => this.langRect.setStrokeStyle(2, toHex(COLORS.border), 1));
    this.langHit.on('pointerdown', () => {
      const next: Language = getGameSettings().language === 'en' ? 'ru' : 'en';
      setLanguage(next);
      AudioManager.uiSelect();
      this.getGameScene()?.refreshLocalizedUi();
      this.refreshTexts();
      this.refreshSettingsUi();
      this.layout();
    });

    this.audioNoteText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5);
    this.settingsBack = this.createSimpleButton(() => this.setView('menu'));

    this.settingsContainer.add([
      ...this.sliders.flatMap((s) => [s.label, s.value, s.track, s.fill, s.hit]),
      this.muteLabelText,
      this.muteRect,
      this.muteStateText,
      this.muteHit,
      this.langLabelText,
      this.langRect,
      this.langValueText,
      this.langHit,
      this.audioNoteText,
      this.settingsBack.container,
    ]);
  }

  private buildControls(): void {
    this.controlLines = KEYBINDINGS.map(() =>
      this.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: COLORS.text,
          align: 'center',
          wordWrap: { width: 680 },
        })
        .setOrigin(0.5),
    );
    this.controlsBack = this.createSimpleButton(() => this.setView('menu'));
    this.controlsContainer.add([...this.controlLines, this.controlsBack.container]);
  }

  private createSimpleButton(action: () => void): {
    container: Phaser.GameObjects.Container;
    rect: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
    hit: Phaser.GameObjects.Rectangle;
  } {
    const container = this.add.container(0, 0);
    const rect = this.add.rectangle(0, 0, 180, 44, toHex(COLORS.track), 1);
    rect.setStrokeStyle(2, toHex(COLORS.border), 1);
    const text = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, 180, 44, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      AudioManager.uiHover();
      rect.setFillStyle(toHex(COLORS.panelHover), 1);
      rect.setStrokeStyle(2, toHex(COLORS.borderHover), 1);
    });
    hit.on('pointerout', () => {
      rect.setFillStyle(toHex(COLORS.track), 1);
      rect.setStrokeStyle(2, toHex(COLORS.border), 1);
    });
    hit.on('pointerdown', () => {
      AudioManager.uiSelect();
      action();
    });
    container.add([rect, text, hit]);
    return { container, rect, text, hit };
  }

  private getSliderValue(kind: 'master' | 'music' | 'sfx'): number {
    const s = getGameSettings();
    return kind === 'master' ? s.masterVolume : kind === 'music' ? s.musicVolume : s.sfxVolume;
  }

  private updateSlider(
    kind: 'master' | 'music' | 'sfx',
    pointerX: number,
    onChange: (v: number) => void,
  ): void {
    const slider = this.sliders.find((s) => s.kind === kind);
    if (!slider) return;
    const left = slider.track.x - slider.track.width / 2;
    const ratio = Phaser.Math.Clamp((pointerX - left) / slider.track.width, 0, 1);
    onChange(ratio);
    this.refreshSettingsUi();
  }

  private updateVolumeFromPointer(kind: 'master' | 'music' | 'sfx', pointerX: number): void {
    const slider = this.sliders.find((s) => s.kind === kind);
    if (!slider) return;
    this.updateSlider(kind, pointerX, slider.onChange);
    applyGameSettings(this.sound);
  }

  private refreshSettingsUi(): void {
    const settings = getGameSettings();
    for (const s of this.sliders) {
      const v = this.getSliderValue(s.kind);
      s.fill.width = s.track.width * v;
      s.fill.x = s.track.x - s.track.width / 2;
      s.value.setText(`${Math.round(v * 100)}%`);
    }
    this.muteStateText.setText(settings.muted ? t('settings.on') : t('settings.off'));
    this.muteRect.setFillStyle(toHex(settings.muted ? COLORS.accent : COLORS.track), 1);
    this.langValueText.setText(settings.language === 'ru' ? 'Русский' : 'English');
  }

  private cleanup(): void {
    this.draggingVolume = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.off('pointerup');
    this.input.off('pointerupoutside');
    this.input.off('gameout');
    this.input.off('pointermove');
  }
}
