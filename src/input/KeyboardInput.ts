import Phaser from 'phaser';

export interface MovementIntent {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  attackHeld: boolean;
  attackByPointer: boolean;
  dashPressed: boolean;
}

export class KeyboardInput {
  private readonly keys: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    leftAlt: Phaser.Input.Keyboard.Key;
    rightAlt: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    jumpW: Phaser.Input.Keyboard.Key;
    jumpUp: Phaser.Input.Keyboard.Key;
    attackJ: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
  };

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available.');
    }

    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      leftAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      rightAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      jump: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      jumpW: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      jumpUp: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      attackJ: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      dash: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };
  }

  public read(ignoredPointerIds?: ReadonlySet<number>): MovementIntent {
    const active = this.scene.input.activePointer;
    const pointerDown = active.isDown && !(ignoredPointerIds?.has(active.id) ?? false);
    const attackHeld = pointerDown || this.keys.attackJ.isDown;

    return {
      left: this.keys.left.isDown || this.keys.leftAlt.isDown,
      right: this.keys.right.isDown || this.keys.rightAlt.isDown,
      jumpPressed:
        Phaser.Input.Keyboard.JustDown(this.keys.jump) ||
        Phaser.Input.Keyboard.JustDown(this.keys.jumpW) ||
        Phaser.Input.Keyboard.JustDown(this.keys.jumpUp),
      attackHeld,
      attackByPointer: pointerDown,
      dashPressed: Phaser.Input.Keyboard.JustDown(this.keys.dash),
    };
  }
}
