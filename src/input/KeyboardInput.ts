import Phaser from 'phaser';

export interface MovementIntent {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  downPressed: boolean;
  attackHeld: boolean;
  attackByPointer: boolean;
  dashPressed: boolean;
}

export const KEYBINDINGS = [
  { key: 'controls.moveLeft', binding: 'A / Arrow Left' },
  { key: 'controls.moveRight', binding: 'D / Arrow Right' },
  { key: 'controls.jump', binding: 'W / Arrow Up' },
  { key: 'controls.attack', binding: 'Space / J / Left Mouse Button' },
  { key: 'controls.dash', binding: 'Shift' },
  { key: 'controls.groundSlam', binding: 'S / Arrow Down / Mobile DOWN' },
  { key: 'controls.pause', binding: 'Esc / P' },
] as const;

export class KeyboardInput {
  private readonly keys: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    leftAlt: Phaser.Input.Keyboard.Key;
    rightAlt: Phaser.Input.Keyboard.Key;
    jumpW: Phaser.Input.Keyboard.Key;
    jumpUp: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    downAlt: Phaser.Input.Keyboard.Key;
    attackSpace: Phaser.Input.Keyboard.Key;
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
      jumpW: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      jumpUp: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      downAlt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      attackSpace: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      attackJ: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      dash: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };
  }

  public read(ignoredPointerIds?: ReadonlySet<number>): MovementIntent {
    // Ignore virtual/mobile control pointers. On touch devices, screen taps must NOT trigger attack (#5);
    // only the Attack control/button (or keyboard Space/J) may trigger attacks. Mouse pointer attack remains for PC.
    const active = this.scene.input.activePointer;
    const ignored = ignoredPointerIds?.has(active.id) ?? false;
    const isTouchPointer = !!(active as Phaser.Input.Pointer & { wasTouch?: boolean }).wasTouch;
    const pointerDown = active.isDown && !ignored && !isTouchPointer;
    // Space and J are separate bindings; holding both must not create double attacks (cooldown/duration guard in Player).
    const attackHeld = pointerDown || this.keys.attackSpace.isDown || this.keys.attackJ.isDown;

    return {
      left: this.keys.left.isDown || this.keys.leftAlt.isDown,
      right: this.keys.right.isDown || this.keys.rightAlt.isDown,
      // Jump: W / ArrowUp only. Space is attack (Phase 11.12 keybinding audit).
      jumpPressed:
        Phaser.Input.Keyboard.JustDown(this.keys.jumpW) ||
        Phaser.Input.Keyboard.JustDown(this.keys.jumpUp),
      // Ground Slam: edge on DOWN press (S / ArrowDown). Holding must not retrigger (JustDown).
      downPressed:
        Phaser.Input.Keyboard.JustDown(this.keys.down) ||
        Phaser.Input.Keyboard.JustDown(this.keys.downAlt),
      attackHeld,
      attackByPointer: pointerDown,
      dashPressed: Phaser.Input.Keyboard.JustDown(this.keys.dash),
    };
  }
}
