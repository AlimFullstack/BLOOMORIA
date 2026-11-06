import { getGameSettings } from '../settings/GameSettings';
import { translate, type TranslationKey } from './translations';

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(getGameSettings().language, key, params);
}

export type { TranslationKey };
