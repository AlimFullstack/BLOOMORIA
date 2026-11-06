import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { t } from '../i18n/i18n';
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
import type { GameScene } from './GameScene';

type PauseView = 'menu' | 'settings' | 'controls';

interface MenuButton {
  key: 'resume' | 'settings' | 'controls' | 'restart';
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  container: Phaser.GameObjects.Container;
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
  private panelGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private menuContainer!: Phaser.GameObjects.Container;
  private settingsContainer!: Phaser.GameObjects.Container;
  private controlsContainer!: Phaser.GameObjects.Container;
  private menuButtons: MenuButton[] = [];
  private escKey?: Phaser.Input.Keyboard.Key;
  private pKey?: Phaser.Input.Keyboard.Key;
  private volumeTrack?: Phaser.GameObjects.Rectangle;
  private volumeFill?: Phaser.GameObjects.Rectangle;
  private volumeValueText?: Phaser.GameObjects.Text;
  private volumeLabelText?: Phaser.GameObjects.Text;
  private musicTrack?: Phaser.GameObjects.Rectangle;
  private musicFill?: Phaser.GameObjects.Rectangle;
  private musicValueText?: Phaser.GameObjects.Text;
  private musicLabelText?: Phaser.GameObjects.Text;
  private sfxTrack?: Phaser.GameObjects.Rectangle;
  private sfxFill?: Phaser.GameObjects.Rectangle;
  private sfxValueText?: Phaser.GameObjects.Text;
  private sfxLabelText?: Phaser.GameObjects.Text;
  private muteRect?: Phaser.GameObjects.Rectangle;
  private muteLabelText?: Phaser.GameObjects.Text;
  private muteStateText?: Phaser.GameObjects.Text;
  private muteHit?: Phaser.GameObjects.Rectangle;
  private langLabelText?: Phaser.GameObjects.Text;
  private langValueText?: Phaser.GameObjects.Text;
  private langRect?: Phaser.GameObjects.Rectangle;
  private langHit?: Phaser.GameObjects.Rectangle;
  private settingsBackText?: Phaser.GameObjects.Text;
  private controlsBackText?: Phaser.GameObjects.Text;
  private audioNoteText?: Phaser.GameObjects.Text;
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
    const w = this.scale.width;
    const h = this.scale.height;

    this.root = this.add.container(0, 0).setDepth(500).setScrollFactor(0);
    const bg = this.add.rectangle(w / 2, h / 2, w, h, toHex(COLORS.overlay), 0.72);
    bg.setInteractive();
    this.root.add(bg);

    this.panelGfx = this.add.graphics();
    this.root.add(this.panelGfx);
    this.titleText = this.add
      .text(w / 2, 140, '', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: COLORS.title,
        fontStyle: 'bold',
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
    this.setView('menu');

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.pKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    }

    this.input.on('pointerup', () => {
      this.draggingVolume = null;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.draggingVolume && this.view === 'settings') {
        this.updateVolumeFromPointer(this.draggingVolume, pointer.x);
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  public update(): void {
    const escPressed = this.escKey ? Phaser.Input.Keyboard.JustDown(this.escKey) : false;
    const pPressed = this.pKey ? Phaser.Input.Keyboard.JustDown(this.pKey) : false;
    if (escPressed || pPressed) {
      if (this.view === 'menu') {
        this.resumeGame();
      } else {
        this.setView('menu');
      }
    }
  }

  private getGameScene(): GameScene | undefined {
    return this.scene.get('GameScene') as GameScene | undefined;
  }

  private resumeGame(): void {
    AudioManager.uiSelect();
    const gameScene = this.getGameScene();
    this.scene.stop();
    if (gameScene?.scene.isPaused()) {
      this.scene.resume('GameScene');
    }
    gameScene?.onResumedFromPause();
  }

  private restartRun(): void {
    AudioManager.uiSelect();
    const gameScene = this.getGameScene();
    this.scene.stop('PauseScene');
    if (gameScene?.scene.isPaused()) {
      this.scene.resume('GameScene');
    }
    gameScene?.restartFromPause();
  }

  private setView(view: PauseView): void {
    if (view !== this.view) AudioManager.uiOpen();
    this.view = view;
    this.menuContainer.setVisible(view === 'menu');
    this.settingsContainer.setVisible(view === 'settings');
    this.controlsContainer.setVisible(view === 'controls');
    this.refreshTexts();
    this.drawPanel(view);
    if (view === 'settings') {
      this.refreshSettingsUi();
    }
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
    this.volumeLabelText?.setText(t('settings.masterVolume'));
    this.musicLabelText?.setText(t('settings.musicVolume'));
    this.sfxLabelText?.setText(t('settings.sfxVolume'));
    this.muteLabelText?.setText(t('settings.mute'));
    this.langLabelText?.setText(t('settings.language'));
    this.settingsBackText?.setText(t('settings.back'));
    this.controlsBackText?.setText(t('controls.back'));
    this.audioNoteText?.setText(t('settings.audioNote'));
    const controlKeys = [
      t('controls.move'),
      t('controls.jump'),
      t('controls.attack'),
      t('controls.pause'),
    ];
    this.controlLines.forEach((line, i) => line.setText(controlKeys[i] ?? ''));
  }

  private drawPanel(view: PauseView): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const pw = view === 'menu' ? 420 : view === 'settings' ? 620 : 720;
    const ph = view === 'menu' ? 360 : view === 'settings' ? 470 : 300;
    const x = (w - pw) / 2;
    const y = (h - ph) / 2 + 10;
    this.panelGfx.clear();
    this.panelGfx.fillStyle(toHex(COLORS.panel), 0.98);
    this.panelGfx.fillRoundedRect(x, y, pw, ph, 10);
    this.panelGfx.lineStyle(3, toHex(COLORS.border), 1);
    this.panelGfx.strokeRoundedRect(x, y, pw, ph, 10);
  }

  private buildMenu(): void {
    this.menuButtons.forEach((b) => b.container.destroy(true));
    this.menuButtons = [];
    const items: Array<{ key: MenuButton['key']; action: () => void }> = [
      { key: 'resume', action: () => this.resumeGame() },
      { key: 'settings', action: () => this.setView('settings') },
      { key: 'controls', action: () => this.setView('controls') },
      { key: 'restart', action: () => this.restartRun() },
    ];
    const w = this.scale.width;
    const startY = 245;
    const gap = 58;
    items.forEach((item, i) => {
      this.menuButtons.push(
        this.createButton(w / 2, startY + i * gap, 300, 46, item.key, item.action),
      );
    });
    this.menuButtons.forEach((b) => this.menuContainer.add(b.container));
  }

  private createButton(
    x: number,
    y: number,
    bw: number,
    bh: number,
    key: MenuButton['key'],
    action: () => void,
  ): MenuButton {
    const container = this.add.container(x, y);
    const rect = this.add.rectangle(0, 0, bw, bh, toHex(COLORS.track), 1);
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
      .rectangle(0, 0, bw, bh, 0xffffff, 0.001)
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

  private buildSettings(): void {
    const w = this.scale.width;
    const trackW = 250;
    const trackH = 14;
    const trackX = w / 2 + 10;
    const leftX = w / 2 - 230;

    const makeSlider = (
      y: number,
      kind: 'master' | 'music' | 'sfx',
      onChange: (v: number) => void,
    ): {
      label: Phaser.GameObjects.Text;
      value: Phaser.GameObjects.Text;
      track: Phaser.GameObjects.Rectangle;
      fill: Phaser.GameObjects.Rectangle;
      hit: Phaser.GameObjects.Rectangle;
    } => {
      const label = this.add
        .text(leftX, y, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
        .setOrigin(0, 0.5);
      const value = this.add
        .text(w / 2 + 230, y, '100%', {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: COLORS.sub,
        })
        .setOrigin(1, 0.5);
      const track = this.add.rectangle(trackX, y, trackW, trackH, toHex(COLORS.track), 1);
      track.setStrokeStyle(2, toHex(COLORS.border), 1);
      const fill = this.add.rectangle(
        trackX - trackW / 2,
        y,
        trackW,
        trackH,
        toHex(COLORS.accent),
        1,
      );
      fill.setOrigin(0, 0.5);
      const hit = this.add.rectangle(trackX, y, trackW + 20, 30, 0xffffff, 0.001);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.draggingVolume = kind;
        this.updateSlider(kind, pointer.x, onChange);
        AudioManager.uiSelect();
      });
      return { label, value, track, fill, hit };
    };

    const masterY = 214;
    const master = makeSlider(masterY, 'master', (v) => {
      setMasterVolume(v);
      applyGameSettings(this.sound);
    });
    this.volumeLabelText = master.label;
    this.volumeValueText = master.value;
    this.volumeTrack = master.track;
    this.volumeFill = master.fill;

    const music = makeSlider(masterY + 42, 'music', (v) => {
      setMusicVolume(v);
      applyGameSettings(this.sound);
    });
    this.musicLabelText = music.label;
    this.musicValueText = music.value;
    this.musicTrack = music.track;
    this.musicFill = music.fill;

    const sfx = makeSlider(masterY + 84, 'sfx', (v) => {
      setSfxVolume(v);
      applyGameSettings(this.sound);
    });
    this.sfxLabelText = sfx.label;
    this.sfxValueText = sfx.value;
    this.sfxTrack = sfx.track;
    this.sfxFill = sfx.fill;

    const muteY = masterY + 132;
    this.muteLabelText = this.add
      .text(leftX, muteY, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);
    this.muteRect = this.add.rectangle(w / 2 + 170, muteY, 120, 36, toHex(COLORS.track), 1);
    this.muteRect.setStrokeStyle(2, toHex(COLORS.border), 1);
    this.muteStateText = this.add
      .text(w / 2 + 170, muteY, 'OFF', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setName('muteLabel');
    this.muteHit = this.add.rectangle(w / 2 + 170, muteY, 120, 36, 0xffffff, 0.001);
    this.muteHit.setInteractive({ useHandCursor: true });
    this.muteHit.on('pointerover', () => {
      AudioManager.uiHover();
      this.muteRect?.setStrokeStyle(2, toHex(COLORS.borderHover), 1);
    });
    this.muteHit.on('pointerdown', () => {
      setMuted(!getGameSettings().muted);
      applyGameSettings(this.sound);
      AudioManager.uiSelect();
      this.refreshSettingsUi();
    });
    this.muteHit.on('pointerout', () => this.muteRect?.setStrokeStyle(2, toHex(COLORS.border), 1));

    const langY = muteY + 48;
    this.langLabelText = this.add
      .text(leftX, langY, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);
    this.langRect = this.add.rectangle(w / 2 + 170, langY, 160, 36, toHex(COLORS.track), 1);
    this.langRect.setStrokeStyle(2, toHex(COLORS.border), 1);
    this.langValueText = this.add
      .text(w / 2 + 170, langY, 'English', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.langHit = this.add.rectangle(w / 2 + 170, langY, 160, 36, 0xffffff, 0.001);
    this.langHit.setInteractive({ useHandCursor: true });
    this.langHit.on('pointerover', () => {
      AudioManager.uiHover();
      this.langRect?.setStrokeStyle(2, toHex(COLORS.borderHover), 1);
    });
    this.langHit.on('pointerout', () => this.langRect?.setStrokeStyle(2, toHex(COLORS.border), 1));
    this.langHit.on('pointerdown', () => {
      const next: Language = getGameSettings().language === 'en' ? 'ru' : 'en';
      setLanguage(next);
      AudioManager.uiSelect();
      this.getGameScene()?.refreshLocalizedUi();
      this.refreshTexts();
      this.refreshSettingsUi();
      this.drawPanel(this.view);
    });

    this.audioNoteText = this.add
      .text(w / 2, langY + 48, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5);

    const back = this.createSimpleButton(w / 2, 530, 180, 42, () => this.setView('menu'));
    this.settingsBackText = back.text;
    this.settingsContainer.add([
      master.label,
      master.value,
      master.track,
      master.fill,
      master.hit,
      music.label,
      music.value,
      music.track,
      music.fill,
      music.hit,
      sfx.label,
      sfx.value,
      sfx.track,
      sfx.fill,
      sfx.hit,
      this.muteLabelText,
      this.muteRect,
      this.muteStateText,
      this.muteHit,
      this.langLabelText,
      this.langRect,
      this.langValueText,
      this.langHit,
      this.audioNoteText,
      back.container,
    ]);
  }

  private buildControls(): void {
    const w = this.scale.width;
    this.controlLines = [0, 1, 2, 3].map((i) =>
      this.add
        .text(w / 2, 228 + i * 34, '', {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: COLORS.text,
          align: 'center',
          wordWrap: { width: 680 },
        })
        .setOrigin(0.5),
    );
    const back = this.createSimpleButton(w / 2, 430, 180, 42, () => this.setView('menu'));
    this.controlsBackText = back.text;
    this.controlsContainer.add([...this.controlLines, back.container]);
  }

  private createSimpleButton(
    x: number,
    y: number,
    bw: number,
    bh: number,
    action: () => void,
  ): { container: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text } {
    const container = this.add.container(x, y);
    const rect = this.add.rectangle(0, 0, bw, bh, toHex(COLORS.track), 1);
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
      .rectangle(0, 0, bw, bh, 0xffffff, 0.001)
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
    return { container, text };
  }

  private updateSlider(
    kind: 'master' | 'music' | 'sfx',
    pointerX: number,
    onChange: (v: number) => void,
  ): void {
    const track =
      kind === 'master' ? this.volumeTrack : kind === 'music' ? this.musicTrack : this.sfxTrack;
    if (!track) return;
    const left = track.x - track.width / 2;
    const ratio = Phaser.Math.Clamp((pointerX - left) / track.width, 0, 1);
    onChange(ratio);
    this.refreshSettingsUi();
  }

  private updateVolumeFromPointer(kind: 'master' | 'music' | 'sfx', pointerX: number): void {
    if (kind === 'master') this.updateSlider('master', pointerX, (v) => setMasterVolume(v));
    else if (kind === 'music') this.updateSlider('music', pointerX, (v) => setMusicVolume(v));
    else this.updateSlider('sfx', pointerX, (v) => setSfxVolume(v));
    applyGameSettings(this.sound);
  }

  private refreshSettingsUi(): void {
    const settings = getGameSettings();
    const paint = (
      track: Phaser.GameObjects.Rectangle | undefined,
      fill: Phaser.GameObjects.Rectangle | undefined,
      value: number,
      label: Phaser.GameObjects.Text | undefined,
    ): void => {
      if (!track || !fill) return;
      fill.width = track.width * value;
      fill.x = track.x - track.width / 2;
      label?.setText(`${Math.round(value * 100)}%`);
    };
    paint(this.volumeTrack, this.volumeFill, settings.masterVolume, this.volumeValueText);
    paint(this.musicTrack, this.musicFill, settings.musicVolume, this.musicValueText);
    paint(this.sfxTrack, this.sfxFill, settings.sfxVolume, this.sfxValueText);
    this.muteStateText?.setText(settings.muted ? t('settings.on') : t('settings.off'));
    this.muteRect?.setFillStyle(toHex(settings.muted ? COLORS.accent : COLORS.track), 1);
    this.langValueText?.setText(settings.language === 'ru' ? 'Русский' : 'English');
  }

  private cleanup(): void {
    this.draggingVolume = null;
    this.input.off('pointerup');
    this.input.off('pointermove');
  }
}
