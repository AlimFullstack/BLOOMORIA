import Phaser from 'phaser';
import { APP_CONFIG } from './AppConfig';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { PauseScene } from '../scenes/PauseScene';

export function createPhaserGame(): Phaser.Game {
  return new Phaser.Game({
    type: APP_CONFIG.renderType,
    width: APP_CONFIG.width,
    height: APP_CONFIG.height,
    parent: APP_CONFIG.parent,
    backgroundColor: APP_CONFIG.backgroundColor,
    scale: {
      mode: APP_CONFIG.scale.mode,
      autoCenter: APP_CONFIG.scale.autoCenter,
      width: APP_CONFIG.scale.width,
      height: APP_CONFIG.scale.height,
    },
    physics: APP_CONFIG.physics,
    scene: [BootScene, GameScene, PauseScene],
  });
}
