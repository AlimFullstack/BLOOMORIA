import Phaser from 'phaser';
import { APP_CONFIG } from '../../app/AppConfig';

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
} as const;

// Phase 11.13: exactly 3 platforms (2 lower, 1 central).
// Widths = previous corresponding widths / 1.5; uniform thickness for all bodies/visuals.
// Floor uses full-arena visual/physics width (1280) as base => 853; others derive from old defs.
export const ARENA_PLATFORM_THICKNESS = 24;
const OLD = {
  low: 250,
  mid: 320,
  high: 190,
  floor: APP_CONFIG.width, // 1280
} as const;
const W = {
  low: Math.round(OLD.low / 1.5), // 167
  mid: Math.round(OLD.mid / 1.5), // 213
  floor: Math.round(OLD.floor / 1.5), // 853
} as const;
const H = ARENA_PLATFORM_THICKNESS;
const CX = APP_CONFIG.width / 2;
const X_LOW_L = 320;
const X_LOW_R = 960;
const Y_LOW = 580; // Phase 11.15: lowered from 560 (was 520s region); still above physical floor (top 698)
const Y_MID = 470; // central unchanged (Phase 11.15)

export const ARENA_PLATFORM_DEFS: ReadonlyArray<
  Readonly<ArenaPlatformBounds & { accent: string }>
> = [
  { x: X_LOW_L, y: Y_LOW, width: W.low, height: H, accent: ARENA_COLORS.midAccent },
  { x: X_LOW_R, y: Y_LOW, width: W.low, height: H, accent: ARENA_COLORS.midAccent },
  { x: CX, y: Y_MID, width: W.mid, height: H, accent: ARENA_COLORS.midAccent },
] as const;

export function isSegmentBlockedByPlatform(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  platform: ArenaPlatformBounds,
  targetHalfW = 0,
  targetHalfH = 0,
): boolean {
  // Slight inset avoids treating edge-touch as a hard block (target standing on open side).
  const inset = 0.75;
  const left = platform.x - platform.width / 2 + inset;
  const top = platform.y - platform.height / 2 + inset;
  const right = platform.x + platform.width / 2 - inset;
  const bottom = platform.y + platform.height / 2 - inset;
  if (right <= left || bottom <= top) return false;
  // Quick reject by combined bounds (include target extent).
  const minX = Math.min(x1, x2) - targetHalfW;
  const maxX = Math.max(x1, x2) + targetHalfW;
  const minY = Math.min(y1, y2) - targetHalfH;
  const maxY = Math.max(y1, y2) + targetHalfH;
  if (right < minX || left > maxX || bottom < minY || top > maxY) return false;
  const line = new Phaser.Geom.Line(x1, y1, x2, y2);
  const rect = new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  if (!Phaser.Geom.Intersects.LineToRectangle(line, rect)) return false;
  // Block only when the platform is actually between source and target (not just near target).
  const t = segmentRectHitT(x1, y1, x2, y2, rect);
  if (t == null) return false;
  // Allow if intersection is extremely close to target endpoint (open side / grazing).
  return t < 0.985;
}

function segmentRectHitT(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Phaser.Geom.Rectangle,
): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.left, rect.right - x1, y1 - rect.top, rect.bottom - y1];
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i];
    const qi = q[i];
    if (Math.abs(pi) < 1e-8) {
      if (qi < 0) return null;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > tmax) return null;
        if (t > tmin) tmin = t;
      } else {
        if (t < tmin) return null;
        if (t < tmax) tmax = t;
      }
    }
  }
  return tmin <= tmax ? Math.max(0, tmin) : null;
}

export function isGroundSlamBlockedByPlatforms(
  originX: number,
  originBottomY: number,
  targetX: number,
  targetY: number,
  targetHalfW: number,
  targetHalfH: number,
  platforms: readonly ArenaPlatformBounds[],
): boolean {
  for (const p of platforms) {
    if (
      isSegmentBlockedByPlatform(
        originX,
        originBottomY,
        targetX,
        targetY,
        p,
        targetHalfW,
        targetHalfH,
      )
    ) {
      return true;
    }
  }
  return false;
}

export class Arena {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly platforms: Phaser.Physics.Arcade.StaticGroup;
  private readonly platformDefinitions: PlatformDefinition[] = ARENA_PLATFORM_DEFS.map((p) => ({
    ...p,
  }));
  private readonly floorBound: ArenaPlatformBounds;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = this.scene.add.graphics();
    this.platforms = this.scene.physics.add.staticGroup();
    const { width, height } = this.scene.scale;
    const floorH = 22;
    this.floorBound = { x: width / 2, y: height - floorH / 2, width, height: floorH };
    this.createVisualBase();
    this.createPlatforms();
  }

  public getPlatformGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.platforms;
  }

  public getPlatformBounds(): readonly ArenaPlatformBounds[] {
    // Includes 5 platforms + physical floor surface for AI/FX/GS/occlusion checks.
    return [...this.platformDefinitions, this.floorBound];
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

    // Phase 11.15: visual floor matches physical static body bounds (single surface, no duplicate body).
    const floorH = 22;
    const floorY = height - floorH;
    this.graphics.fillStyle(toHex(ARENA_COLORS.platformBase), 1);
    this.graphics.fillRect(0, floorY, width, floorH);
    this.graphics.fillStyle(toHex(ARENA_COLORS.floorAccent), 0.38);
    this.graphics.fillRect(0, floorY, width, Math.max(3, floorH * 0.35));
    this.graphics.lineStyle(2, toHex(ARENA_COLORS.platformStroke), 0.55);
    this.graphics.strokeRect(0, floorY, width, floorH);

    this.graphics.lineStyle(1, toHex(ARENA_COLORS.grid), 0.22);
    for (let x = 80; x < width; x += 80) {
      this.graphics.lineBetween(x, 20, x, floorY - 8);
    }
  }

  private createPlatforms(): void {
    for (const platform of this.platformDefinitions) {
      this.drawPlatform(platform);
      this.createPlatformBody(platform);
    }
    // Phase 11.15: physical arena floor (Arcade static) — same collision group as platforms (player/enemies/boss).
    // Matches visual floor bounds exactly. Single body, created once; does not count as one of the 5 platforms.
    this.createPlatformBody({ ...this.floorBound, accent: ARENA_COLORS.floorAccent });
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
    // Physics body matches visual geometry exactly (same x/y/width/height).
    const zone = this.scene.add.zone(platform.x, platform.y, platform.width, platform.height);
    this.scene.physics.add.existing(zone, true);
    this.platforms.add(zone);
  }
}
