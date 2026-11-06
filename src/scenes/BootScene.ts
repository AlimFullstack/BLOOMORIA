import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  public create(): void {
    this.scene.start('GameScene');
  }
}
