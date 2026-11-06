import type { Language } from '../settings/GameSettings';

export type TranslationKey = keyof typeof en;

const en = {
  'hud.wave': 'Wave {wave}',
  'hud.boss': 'BOSS',
  'hud.alive': 'Alive: {alive}',
  'hud.pending': 'Pending: {pending}',
  'banner.wave': 'Wave {wave}',
  'banner.bossWave': 'Boss Wave',
  'boss.colossus': 'THE COLOSSUS',
  'pause.title': 'PAUSED',
  'pause.resume': 'RESUME',
  'pause.settings': 'SETTINGS',
  'pause.controls': 'CONTROLS',
  'pause.restartRun': 'RESTART RUN',
  'settings.title': 'SETTINGS',
  'settings.masterVolume': 'Master Volume',
  'settings.musicVolume': 'Music Volume',
  'settings.sfxVolume': 'SFX Volume',
  'settings.mute': 'Mute',
  'settings.language': 'Language',
  'settings.on': 'ON',
  'settings.off': 'OFF',
  'settings.back': 'BACK',
  'settings.audioNote':
    'Procedural audio: normalized mix, varied SFX, and seamless arena music (no external assets).',
  'controls.title': 'CONTROLS',
  'controls.move': 'Move: A / D or Arrow Left / Arrow Right',
  'controls.jump': 'Jump: Space / W / Arrow Up',
  'controls.attack': 'Attack: J or Left Mouse Button (hold)',
  'controls.pause': 'Pause: Esc / P or Pause button',
  'controls.back': 'BACK',
  'upgrade.waveCleared': 'WAVE CLEARED',
  'upgrade.chooseOne': 'CHOOSE ONE UPGRADE',
  'gameOver.title': 'GAME OVER',
  'gameOver.reachedWave': 'Reached wave: {wave}',
  'gameOver.kills': 'Enemies killed: {kills}',
  'gameOver.upgrades': 'Upgrades collected: {upgrades}',
  'gameOver.tryAgain': 'TRY AGAIN',
  'upgrade.max_hp.name': 'Vital Core',
  'upgrade.max_hp.desc': '+10% Max HP and restore 10% HP',
  'upgrade.damage.name': 'Sharp Edge',
  'upgrade.damage.desc': '+10% Attack Damage',
  'upgrade.move_speed.name': 'Swift Step',
  'upgrade.move_speed.desc': '+10% Move Speed',
  'upgrade.attack_speed.name': 'Quick Strike',
  'upgrade.attack_speed.desc': '+10% Attack Speed',
  'upgrade.heal.name': 'Mend',
  'upgrade.heal.desc': 'Restore 10% HP (up to max)',
} as const;

const ru: Record<TranslationKey, string> = {
  'hud.wave': 'Волна {wave}',
  'hud.boss': 'БОСС',
  'hud.alive': 'Живы: {alive}',
  'hud.pending': 'Осталось: {pending}',
  'banner.wave': 'Волна {wave}',
  'banner.bossWave': 'Волна Босса',
  'boss.colossus': 'КОЛОСС',
  'pause.title': 'ПАУЗА',
  'pause.resume': 'ПРОДОЛЖИТЬ',
  'pause.settings': 'НАСТРОЙКИ',
  'pause.controls': 'УПРАВЛЕНИЕ',
  'pause.restartRun': 'НАЧАТЬ ЗАНОВО',
  'settings.title': 'НАСТРОЙКИ',
  'settings.masterVolume': 'Общая громкость',
  'settings.musicVolume': 'Громкость музыки',
  'settings.sfxVolume': 'Громкость эффектов',
  'settings.mute': 'Без звука',
  'settings.language': 'Язык',
  'settings.on': 'ВКЛ',
  'settings.off': 'ВЫКЛ',
  'settings.back': 'НАЗАД',
  'settings.audioNote':
    'Процедурный звук: нормализованный микс, вариативные SFX и зацикленная музыка арены (без внешних ассетов).',
  'controls.title': 'УПРАВЛЕНИЕ',
  'controls.move': 'Движение: A / D или Стрелки влево / вправо',
  'controls.jump': 'Прыжок: Пробел / W / Стрелка вверх',
  'controls.attack': 'Атака: J или ЛКМ (удержание)',
  'controls.pause': 'Пауза: Esc / P или кнопка паузы',
  'controls.back': 'НАЗАД',
  'upgrade.waveCleared': 'ВОЛНА ЗАЧИЩЕНА',
  'upgrade.chooseOne': 'ВЫБЕРИТЕ УЛУЧШЕНИЕ',
  'gameOver.title': 'ИГРА ОКОНЧЕНА',
  'gameOver.reachedWave': 'Достигнута волна: {wave}',
  'gameOver.kills': 'Уничтожено врагов: {kills}',
  'gameOver.upgrades': 'Получено улучшений: {upgrades}',
  'gameOver.tryAgain': 'ЕЩЁ РАЗ',
  'upgrade.max_hp.name': 'Живое ядро',
  'upgrade.max_hp.desc': '+10% к макс. ОЗ и восстановить 10% ОЗ',
  'upgrade.damage.name': 'Острое лезвие',
  'upgrade.damage.desc': '+10% к урону атаки',
  'upgrade.move_speed.name': 'Быстрый шаг',
  'upgrade.move_speed.desc': '+10% к скорости движения',
  'upgrade.attack_speed.name': 'Быстрый удар',
  'upgrade.attack_speed.desc': '+10% к скорости атаки',
  'upgrade.heal.name': 'Исцеление',
  'upgrade.heal.desc': 'Восстановить 10% ОЗ (до максимума)',
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, ru };

export function translate(
  language: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = dictionaries[language] ?? en;
  let text = dict[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
