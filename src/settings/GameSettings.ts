export type Language = 'en' | 'ru';

export interface GameSettingsData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  language: Language;
}

const DEFAULT_SETTINGS: GameSettingsData = {
  masterVolume: 1,
  musicVolume: 0.55,
  sfxVolume: 1,
  muted: false,
  language: 'ru',
};

let settings: GameSettingsData = { ...DEFAULT_SETTINGS };

export function getGameSettings(): GameSettingsData {
  return settings;
}

export function setMasterVolume(volume: number): void {
  settings = {
    ...settings,
    masterVolume: Math.max(0, Math.min(1, volume)),
  };
}

export function setMusicVolume(volume: number): void {
  settings = {
    ...settings,
    musicVolume: Math.max(0, Math.min(1, volume)),
  };
}

export function setSfxVolume(volume: number): void {
  settings = {
    ...settings,
    sfxVolume: Math.max(0, Math.min(1, volume)),
  };
}

export function setMuted(muted: boolean): void {
  settings = { ...settings, muted };
}

export function setLanguage(language: Language): void {
  settings = { ...settings, language };
}

export function applyGameSettings(
  soundManager: Phaser.Sound.BaseSoundManager | Phaser.Sound.NoAudioSoundManager,
): void {
  soundManager.mute = settings.muted;
  // Master is applied by AudioManager to procedural nodes; keep Phaser volume neutral to avoid double scaling.
  if ('volume' in soundManager) {
    (soundManager as Phaser.Sound.BaseSoundManager).volume = 1;
  }
}
