import Phaser from 'phaser';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export interface ArenaPlatformBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlatformDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  accent?: string;
}

const ARENA_COLORS = {
  bgTop: '#151B2C',
  bgBottom: '#202842',
  border: '#33415F',
  grid: '#2A3550',
  platformBase: '#202A40',
  platformStroke: '#93AFD3',
  floorAccent: '#4E6B8F',
  midAccent: '#60789A',
  highAccent: '#6D86A8',
} as const;

export class Arena {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly platforms: Phaser.Physics.Arcade.StaticGroup;
  private readonly platformDefinitions: PlatformDefinition[] = [
    { x: 640, y: 690, width: 1280, height: 56, accent: ARENA_COLORS.floorAccent },
    { x: 260, y: 520, width: 250, height: 24, accent: ARENA_COLORS.midAccent },
    { x: 640, y: 430, width: 320, height: 24, accent: ARENA_COLORS.midAccent },
    { x: 1020, y: 520, width: 250, height: 24, accent: ARENA_COLORS.midAccent },
    { x: 430, y: 300, width: 190, height: 20, accent: ARENA_COLORS.highAccent },
    { x: 850, y: 300, width: 190, height: 20, accent: ARENA_COLORS.highAccent },
  ];

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = this.scene.add.graphics();
    this.platforms = this.scene.physics.add.staticGroup();
    this.createVisualBase();
    this.createPlatforms();
  }

  public getPlatformGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.platforms;
  }

  public getPlatformBounds(): readonly ArenaPlatformBounds[] {
    return this.platformDefinitions;
  }

  public destroy(): void {
    this.platforms.clear(true, true);
    this.graphics.destroy();
  }

  private createVisualBase(): void {
    const { width, height } = this.scene.scale;
    this.graphics.fillGradientStyle(
      toHex(ARENA_COLORS.bgTop),
      toHex(ARENA_COLORS.bgTop),
      toHex(ARENA_COLORS.bgBottom),
      toHex(ARENA_COLORS.bgBottom),
      1,
    );
    this.graphics.fillRect(0, 0, width, height);

    this.graphics.lineStyle(1, toHex(ARENA_COLORS.grid), 0.22);
    for (let x = 80; x < width; x += 80) {
      this.graphics.lineBetween(x, 20, x, height - 70);
    }
  }

  private createPlatforms(): void {
    for (const platform of this.platformDefinitions) {
      this.drawPlatform(platform);
      this.createPlatformBody(platform);
    }
  }

  private drawPlatform(platform: PlatformDefinition): void {
    const left = platform.x - platform.width / 2;
    const top = platform.y - platform.height / 2;
    const baseColor = platform.accent ?? ARENA_COLORS.midAccent;

    this.graphics.fillStyle(toHex(ARENA_COLORS.platformBase), 1);
    this.graphics.fillRect(left, top, platform.width, platform.height);

    this.graphics.fillStyle(toHex(baseColor), 0.28);
    this.graphics.fillRect(
      left + 2,
      top + 2,
      platform.width - 4,
      Math.max(2, platform.height * 0.35),
    );

    this.graphics.lineStyle(2, toHex(ARENA_COLORS.platformStroke), 0.55);
    this.graphics.strokeRect(left, top, platform.width, platform.height);
  }

  private createPlatformBody(platform: PlatformDefinition): void {
    const zone = this.scene.add.zone(platform.x, platform.y, platform.width, platform.height);
    this.scene.physics.add.existing(zone, true);
    this.platforms.add(zone);
  }
}
