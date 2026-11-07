import Phaser from 'phaser';

export const APP_CONFIG = {
  width: 1280,
  height: 720,
  backgroundColor: '#141826',
  parent: 'game-root',
  renderType: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
    expandParent: false,
  },
  physics: {
    default: 'arcade' as const,
    arcade: {
      gravity: { x: 0, y: 1400 },
      debug: false,
    },
  },
  debug: false,
} as const;

export type AppConfig = typeof APP_CONFIG;
