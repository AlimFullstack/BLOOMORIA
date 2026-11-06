import Phaser from 'phaser';
import { getGameSettings } from '../settings/GameSettings';

type WaveType = OscillatorType;
type Category = 'player' | 'enemy' | 'boss' | 'ui' | 'music';

type Tone = {
  type: WaveType;
  freq: number;
  freqEnd?: number;
  gain: number;
  duration: number;
  delay?: number;
  detune?: number;
  attack?: number;
  release?: number;
  pan?: number;
  filterHz?: number;
  q?: number;
};

type SfxSpec = {
  category: Category;
  tones?: Tone[];
  minIntervalMs: number;
  gainMul?: number;
  panJitter?: number;
  pitchJitter?: number;
};
type MusicState = {
  paused: boolean;
  runOver: boolean;
  upgradeActive: boolean;
  bossActive: boolean;
};

const DEFAULT_MUSIC_STATE: MusicState = {
  paused: false,
  runOver: false,
  upgradeActive: false,
  bossActive: false,
};

const CATEGORY_LIMIT_MS: Record<Category, number> = {
  player: 38,
  enemy: 28,
  boss: 45,
  ui: 35,
  music: 0,
};

const CATEGORY_VOICE_CAP: Record<Category, number> = {
  player: 10,
  enemy: 14,
  boss: 8,
  ui: 6,
  music: 24,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function jitter(base: number, amount: number): number {
  return base * (1 + rand(-amount, amount));
}

class VariationPicker<T> {
  private readonly last = new Map<string, number>();

  public pick(key: string, items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('VariationPicker: empty items');
    }
    if (items.length === 1) return items[0];
    const prev = this.last.get(key);
    let idx = Math.floor(Math.random() * items.length);
    if (prev !== undefined && items.length > 1) {
      let guard = 0;
      while (idx === prev && guard < 8) {
        idx = Math.floor(Math.random() * items.length);
        guard += 1;
      }
      if (idx === prev)
        idx = (prev + 1 + Math.floor(Math.random() * (items.length - 1))) % items.length;
    }
    this.last.set(key, idx);
    return items[idx];
  }
}

class ProceduralAudioEngine {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private musicFilter?: BiquadFilterNode;
  private readonly lastByCategory = new Map<Category, number>();
  private readonly activeVoices = new Map<Category, number>();
  private readonly variations = new VariationPicker<readonly Tone[]>();
  private musicState: MusicState = { ...DEFAULT_MUSIC_STATE };
  private arenaStep = 0;
  private arenaTimerMs = 0;
  private bossTimerMs = 0;
  private arenaLevel = 0;
  private bossLevel = 0;
  private pausedLevel = 1;

  public init(sound?: Phaser.Sound.BaseSoundManager | Phaser.Sound.NoAudioSoundManager): void {
    const ctx = this.resolveContext(sound);
    if (!ctx) {
      this.context = undefined;
      return;
    }
    if (this.context === ctx && this.masterGain && this.musicGain && this.sfxGain) {
      this.applyMix();
      return;
    }
    this.context = ctx;
    this.masterGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 4200;
    this.musicFilter.Q.value = 0.7;
    this.musicGain.connect(this.musicFilter);
    this.musicFilter.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    this.applyMix();
  }

  public isReady(): boolean {
    return !!this.context && !!this.masterGain && !!this.sfxGain && !!this.musicGain;
  }

  public update(deltaMs: number, state: Partial<MusicState>): void {
    this.musicState = { ...this.musicState, ...state };
    if (!this.isReady()) return;
    this.ensureRunning();
    this.applyMix();
    const dt = Math.min(120, Math.max(0, deltaMs));
    const targetPaused = this.musicState.paused || this.musicState.upgradeActive ? 0.38 : 1;
    const targetRunOver = this.musicState.runOver ? 0 : 1;
    const targetBoss = this.musicState.bossActive && !this.musicState.runOver ? 1 : 0;
    const targetArena = this.musicState.runOver ? 0 : 1;
    this.pausedLevel += (targetPaused - this.pausedLevel) * Math.min(1, dt * 0.004);
    this.bossLevel += (targetBoss - this.bossLevel) * Math.min(1, dt * 0.0035);
    this.arenaLevel += (targetArena * targetRunOver - this.arenaLevel) * Math.min(1, dt * 0.003);
    this.updateMusic(dt);
  }

  public playVariation(
    poolKey: string,
    specs: readonly (readonly Tone[])[],
    spec: Omit<SfxSpec, 'tones'>,
  ): void {
    const tones = this.variations.pick(poolKey, specs);
    this.playSpec({ ...spec, tones: (tones as readonly Tone[]).map((t) => ({ ...t })) } as SfxSpec);
  }

  public playSpec(spec: SfxSpec): void {
    if (!spec.tones || spec.tones.length === 0) return;
    const ctx = this.context;
    const master = this.masterGain;
    const sfx = this.sfxGain;
    const music = this.musicGain;
    if (!ctx || !master || !sfx || !music) return;
    const settings = getGameSettings();
    if (settings.muted) return;
    const nowMs = performance.now();
    const catLast = this.lastByCategory.get(spec.category) ?? -Infinity;
    if (nowMs - catLast < (CATEGORY_LIMIT_MS[spec.category] ?? 0)) return;
    this.lastByCategory.set(spec.category, nowMs);
    this.ensureRunning();
    const route = spec.category === 'music' ? music : sfx;
    const t0 = ctx.currentTime;
    const pitchJitter = spec.pitchJitter ?? 0.03;
    const panJitter = spec.panJitter ?? 0.12;
    const pitchMul = jitter(1, pitchJitter);
    const gainMul = (spec.gainMul ?? 1) * jitter(1, 0.06);

    for (const tone of spec.tones) {
      if (!this.acquireVoice(spec.category)) continue;
      const start = t0 + (tone.delay ?? 0);
      const attack = Math.max(0.003, tone.attack ?? 0.008);
      const rel = Math.max(0.02, tone.release ?? tone.duration);
      const stopAt = start + Math.max(tone.duration, rel) + 0.03;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tone.type;
      const f0 = Math.max(28, tone.freq * pitchMul);
      osc.frequency.setValueAtTime(f0, start);
      if (tone.freqEnd !== undefined) {
        const f1 = Math.max(28, tone.freqEnd * pitchMul);
        try {
          osc.frequency.exponentialRampToValueAtTime(f1, start + tone.duration);
        } catch {
          osc.frequency.linearRampToValueAtTime(f1, start + tone.duration);
        }
      }
      if (tone.detune) osc.detune.setValueAtTime(jitter(tone.detune, 0.05), start);

      let out: AudioNode = g;
      if (tone.filterHz && Number.isFinite(tone.filterHz)) {
        const bi = ctx.createBiquadFilter();
        bi.type = 'lowpass';
        bi.frequency.setValueAtTime(Math.max(80, tone.filterHz), start);
        bi.Q.setValueAtTime(tone.q ?? 0.8, start);
        g.connect(bi);
        out = bi;
      }
      const panner = this.createPanner(
        ctx,
        clampPan((tone.pan ?? 0) + rand(-panJitter, panJitter)),
      );
      out.connect(panner);
      panner.connect(route);

      const peak = Math.max(0.0001, Math.min(0.22, tone.gain * gainMul));
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(peak, start + attack);
      const tail = start + tone.duration;
      g.gain.setValueAtTime(Math.max(0.0001, peak * 0.92), Math.max(start + attack, tail - 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, tail + Math.max(0.015, tone.duration * 0.35));
      osc.onended = () => this.releaseVoice(spec.category);
      osc.connect(g);
      try {
        osc.start(start);
        osc.stop(stopAt);
      } catch {
        this.releaseVoice(spec.category);
      }
    }
  }

  private updateMusic(dt: number): void {
    const ctx = this.context;
    if (!ctx || !this.musicGain || !this.musicFilter) return;
    const active = !this.musicState.runOver;
    if (!active) return;
    const bossMul = this.bossLevel;
    const arenaMul = this.arenaLevel * (1 - bossMul * 0.72) * this.pausedLevel;
    const bossLayerMul = bossMul * this.arenaLevel * this.pausedLevel;

    if (this.musicFilter) {
      const targetHz = this.musicState.paused || this.musicState.upgradeActive ? 1800 : 5200;
      this.musicFilter.frequency.setTargetAtTime(targetHz, ctx.currentTime, 0.08);
    }

    this.arenaTimerMs -= dt;
    if (this.arenaTimerMs <= 0) {
      this.arenaTimerMs = 520; // ~115 BPM eighth-note feel, seamless loop by deterministic sequence
      this.playArenaStep(this.arenaStep, arenaMul);
      this.arenaStep = (this.arenaStep + 1) % 16;
    }

    this.bossTimerMs -= dt;
    if (this.bossTimerMs <= 0) {
      this.bossTimerMs = 390;
      if (bossLayerMul > 0.01) this.playBossStep(this.arenaStep, bossLayerMul);
    }
  }

  private playArenaStep(step: number, level: number): void {
    if (level <= 0.001) return;
    const root = 146.83; // D3
    const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const melody = [0, 2, 3, 2, 4, 3, 2, 1, 0, 2, 4, 5, 4, 3, 2, 0];
    const bass = [0, 0, 3, 3, 5, 5, 3, 3, 0, 0, 7, 7, 5, 5, 3, 2];
    const mSemi = scale[melody[step % melody.length] % scale.length];
    const bSemi = scale[bass[step % bass.length] % scale.length] - 12;
    const t = this.context?.currentTime ?? 0;
    if (step % 4 === 0) {
      this.playMusicTone(
        {
          type: 'triangle',
          freq: root * Math.pow(2, bSemi / 12),
          gain: 0.028 * level,
          duration: 0.42,
          attack: 0.012,
          filterHz: 520,
          pan: -0.08,
        },
        t,
      );
    }
    if (step % 2 === 0) {
      this.playMusicTone(
        {
          type: 'sine',
          freq: root * Math.pow(2, mSemi / 12),
          freqEnd: root * Math.pow(2, (mSemi + (step % 8 === 6 ? 2 : 0)) / 12),
          gain: 0.0125 * level,
          duration: 0.2,
          attack: 0.01,
          filterHz: 2200,
          pan: 0.12,
          detune: rand(-4, 4),
        },
        t,
      );
    }
    if (step % 8 === 0) {
      this.playMusicTone(
        {
          type: 'sine',
          freq: root * 2,
          gain: 0.007 * level,
          duration: 1.6,
          attack: 0.25,
          release: 1.2,
          filterHz: 1200,
          pan: 0,
        },
        t,
      );
      this.playMusicTone(
        {
          type: 'triangle',
          freq: root * 3,
          gain: 0.0035 * level,
          duration: 1.4,
          attack: 0.3,
          filterHz: 1400,
          pan: 0.04,
        },
        t,
      );
    }
  }

  private playBossStep(step: number, level: number): void {
    if (level <= 0.001) return;
    const root = 73.42; // D2
    const pulse = step % 4;
    if (pulse === 0 || pulse === 2) {
      this.playMusicTone(
        {
          type: 'sawtooth',
          freq: root * (pulse === 0 ? 1 : 1.122),
          freqEnd: root * 0.98,
          gain: 0.018 * level,
          duration: 0.18,
          attack: 0.006,
          filterHz: 900,
          pan: -0.05,
        },
        this.context?.currentTime ?? 0,
      );
    }
    if (step % 8 === 4) {
      this.playMusicTone(
        {
          type: 'triangle',
          freq: root * 2,
          gain: 0.009 * level,
          duration: 0.22,
          attack: 0.01,
          filterHz: 1500,
          pan: 0.08,
          detune: -8,
        },
        this.context?.currentTime ?? 0,
      );
    }
  }

  private playMusicTone(tone: Tone, t0: number): void {
    const ctx = this.context;
    const music = this.musicGain;
    if (!ctx || !music) return;
    if (!this.acquireVoice('music')) return;
    const start = t0 + (tone.delay ?? 0);
    const attack = Math.max(0.004, tone.attack ?? 0.01);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(Math.max(28, tone.freq), start);
    if (tone.freqEnd !== undefined) {
      try {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(28, tone.freqEnd),
          start + tone.duration,
        );
      } catch {
        osc.frequency.linearRampToValueAtTime(Math.max(28, tone.freqEnd), start + tone.duration);
      }
    }
    if (tone.detune) osc.detune.value = tone.detune;
    let out: AudioNode = g;
    if (tone.filterHz) {
      const bi = ctx.createBiquadFilter();
      bi.type = 'lowpass';
      bi.frequency.value = tone.filterHz;
      bi.Q.value = tone.q ?? 0.6;
      g.connect(bi);
      out = bi;
    }
    const panner = this.createPanner(ctx, tone.pan ?? 0);
    out.connect(panner);
    panner.connect(music);
    const peak = Math.max(0.0001, Math.min(0.05, tone.gain));
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.onended = () => this.releaseVoice('music');
    osc.connect(g);
    try {
      osc.start(start);
      osc.stop(start + tone.duration + 0.05);
    } catch {
      this.releaseVoice('music');
    }
  }

  private applyMix(): void {
    const ctx = this.context;
    const master = this.masterGain;
    const music = this.musicGain;
    const sfx = this.sfxGain;
    if (!ctx || !master || !music || !sfx) return;
    const settings = getGameSettings();
    const masterVol = settings.muted ? 0 : clamp01(settings.masterVolume);
    // Design targets (approximate, procedural/WebAudio): ordinary SFX peaks ~ -18..-14 LUFS short-term feel via conservative gains;
    // loud impacts reserved headroom; master bus prevents clipping; true LUFS/TP not measurable in-browser without offline analysis.
    master.gain.setTargetAtTime(masterVol * 0.9, ctx.currentTime, 0.03);
    music.gain.setTargetAtTime(clamp01(settings.musicVolume) * 0.7, ctx.currentTime, 0.05);
    sfx.gain.setTargetAtTime(clamp01(settings.sfxVolume), ctx.currentTime, 0.03);
  }

  private acquireVoice(category: Category): boolean {
    const n = this.activeVoices.get(category) ?? 0;
    const cap = CATEGORY_VOICE_CAP[category] ?? 8;
    if (n >= cap) return false;
    this.activeVoices.set(category, n + 1);
    return true;
  }

  private releaseVoice(category: Category): void {
    const n = this.activeVoices.get(category) ?? 0;
    this.activeVoices.set(category, Math.max(0, n - 1));
  }

  private ensureRunning(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'suspended') return;
    void ctx.resume().catch(() => undefined);
  }

  private resolveContext(
    sound: Phaser.Sound.BaseSoundManager | Phaser.Sound.NoAudioSoundManager | undefined,
  ): AudioContext | undefined {
    if (!sound || !('context' in sound)) return undefined;
    const ctx = (sound as Phaser.Sound.WebAudioSoundManager).context;
    return ctx instanceof AudioContext ? ctx : undefined;
  }

  private createPanner(ctx: AudioContext, pan: number): StereoPannerNode | GainNode {
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clampPan(pan);
      return p;
    }
    return ctx.createGain();
  }
}
function clampPan(p: number): number {
  return Math.max(-1, Math.min(1, p));
}

const engine = new ProceduralAudioEngine();
let enemyGlobalLastMs = -Infinity;

function enemyCap(ms: number): boolean {
  const now = performance.now();
  if (now - enemyGlobalLastMs < ms) return false;
  enemyGlobalLastMs = now;
  return true;
}

function keyFromEnemy(key: string): 'grunt' | 'brute' | 'ranger' | 'boss' {
  if (key.startsWith('colossus') || key.startsWith('boss')) return 'boss';
  if (key.startsWith('brute')) return 'brute';
  if (key.startsWith('ranger')) return 'ranger';
  return 'grunt';
}

export type MusicModeState = Partial<MusicState>;

export const AudioManager = {
  init(sound?: Phaser.Sound.BaseSoundManager | Phaser.Sound.NoAudioSoundManager): void {
    engine.init(sound);
  },

  update(deltaMs: number, state: MusicModeState = {}): void {
    engine.update(deltaMs, state);
  },

  playerFootstep(): void {
    engine.playVariation(
      'p.step',
      [
        [{ type: 'triangle', freq: 118, freqEnd: 62, gain: 0.012, duration: 0.042, filterHz: 900 }],
        [
          {
            type: 'triangle',
            freq: 132,
            freqEnd: 74,
            gain: 0.011,
            duration: 0.038,
            filterHz: 980,
            detune: 6,
          },
        ],
        [{ type: 'sine', freq: 108, freqEnd: 58, gain: 0.01, duration: 0.046, filterHz: 760 }],
        [
          {
            type: 'triangle',
            freq: 126,
            freqEnd: 66,
            gain: 0.0115,
            duration: 0.04,
            filterHz: 840,
            pan: 0.04,
          },
        ],
      ],
      { category: 'player', minIntervalMs: 220, pitchJitter: 0.05, panJitter: 0.08 },
    );
  },

  playerJump(): void {
    engine.playVariation(
      'p.jump',
      [
        [
          { type: 'sine', freq: 210, freqEnd: 540, gain: 0.02, duration: 0.12, attack: 0.006 },
          {
            type: 'triangle',
            freq: 420,
            freqEnd: 760,
            gain: 0.006,
            duration: 0.08,
            delay: 0.01,
            filterHz: 2200,
          },
        ],
        [
          { type: 'sine', freq: 230, freqEnd: 590, gain: 0.019, duration: 0.115 },
          { type: 'sine', freq: 470, freqEnd: 820, gain: 0.0055, duration: 0.075, delay: 0.012 },
        ],
        [
          {
            type: 'triangle',
            freq: 195,
            freqEnd: 520,
            gain: 0.022,
            duration: 0.125,
            filterHz: 1800,
          },
        ],
      ],
      { category: 'player', minIntervalMs: 90, pitchJitter: 0.045, panJitter: 0.1 },
    );
  },

  playerLand(): void {
    engine.playVariation(
      'p.land',
      [
        [
          { type: 'triangle', freq: 150, freqEnd: 58, gain: 0.022, duration: 0.095, filterHz: 700 },
          { type: 'sine', freq: 92, freqEnd: 46, gain: 0.008, duration: 0.11, delay: 0.008 },
        ],
        [{ type: 'triangle', freq: 138, freqEnd: 54, gain: 0.021, duration: 0.1, filterHz: 640 }],
        [
          {
            type: 'square',
            freq: 110,
            freqEnd: 62,
            gain: 0.006,
            duration: 0.035,
            filterHz: 520,
            delay: 0.002,
          },
          { type: 'triangle', freq: 160, freqEnd: 60, gain: 0.018, duration: 0.09 },
        ],
      ],
      { category: 'player', minIntervalMs: 120, pitchJitter: 0.05 },
    );
  },

  playerDash(): void {
    engine.playVariation(
      'player.dash',
      [
        [
          {
            type: 'triangle',
            freq: 180,
            freqEnd: 520,
            gain: 0.022,
            duration: 0.11,
            filterHz: 1600,
          },
          {
            type: 'sawtooth',
            freq: 120,
            freqEnd: 260,
            gain: 0.012,
            duration: 0.085,
            delay: 0.005,
            filterHz: 1200,
          },
          { type: 'sine', freq: 420, freqEnd: 760, gain: 0.008, duration: 0.08, delay: 0.01 },
        ],
        [
          { type: 'sawtooth', freq: 160, freqEnd: 460, gain: 0.016, duration: 0.1, filterHz: 1500 },
          {
            type: 'triangle',
            freq: 110,
            freqEnd: 240,
            gain: 0.011,
            duration: 0.08,
            delay: 0.004,
            filterHz: 1100,
          },
          { type: 'triangle', freq: 380, freqEnd: 680, gain: 0.007, duration: 0.075, delay: 0.012 },
        ],
        [
          {
            type: 'triangle',
            freq: 210,
            freqEnd: 560,
            gain: 0.02,
            duration: 0.105,
            filterHz: 1700,
          },
          {
            type: 'sawtooth',
            freq: 130,
            freqEnd: 280,
            gain: 0.01,
            duration: 0.082,
            delay: 0.006,
            filterHz: 1300,
          },
        ],
      ],
      { category: 'player', minIntervalMs: 120, pitchJitter: 0.05, gainMul: 1.05 },
    );
  },

  playerAttack(): void {
    engine.playVariation(
      'p.atk',
      [
        [
          {
            type: 'sawtooth',
            freq: 620,
            freqEnd: 240,
            gain: 0.017,
            duration: 0.065,
            filterHz: 3200,
            attack: 0.003,
          },
          {
            type: 'triangle',
            freq: 1180,
            freqEnd: 420,
            gain: 0.009,
            duration: 0.04,
            delay: 0.006,
            filterHz: 5200,
          },
          { type: 'sine', freq: 180, freqEnd: 120, gain: 0.005, duration: 0.05, delay: 0.004 },
        ],
        [
          {
            type: 'square',
            freq: 540,
            freqEnd: 220,
            gain: 0.012,
            duration: 0.055,
            filterHz: 2600,
            attack: 0.002,
          },
          {
            type: 'triangle',
            freq: 980,
            freqEnd: 360,
            gain: 0.01,
            duration: 0.045,
            delay: 0.008,
            filterHz: 4200,
          },
        ],
        [
          {
            type: 'sawtooth',
            freq: 700,
            freqEnd: 260,
            gain: 0.015,
            duration: 0.06,
            filterHz: 3600,
            detune: -8,
          },
          { type: 'sine', freq: 1320, freqEnd: 520, gain: 0.007, duration: 0.035, delay: 0.005 },
        ],
        [
          {
            type: 'triangle',
            freq: 580,
            freqEnd: 210,
            gain: 0.016,
            duration: 0.068,
            filterHz: 2800,
          },
          {
            type: 'square',
            freq: 1040,
            freqEnd: 380,
            gain: 0.006,
            duration: 0.032,
            delay: 0.01,
            filterHz: 4600,
          },
        ],
      ],
      { category: 'player', minIntervalMs: 70, pitchJitter: 0.055, panJitter: 0.14 },
    );
  },

  playerDamage(): void {
    engine.playVariation(
      'p.dmg',
      [
        [
          { type: 'square', freq: 190, freqEnd: 95, gain: 0.02, duration: 0.11, filterHz: 900 },
          { type: 'triangle', freq: 120, freqEnd: 60, gain: 0.011, duration: 0.12, delay: 0.01 },
        ],
        [
          { type: 'sawtooth', freq: 220, freqEnd: 110, gain: 0.016, duration: 0.1, filterHz: 1100 },
          { type: 'sine', freq: 88, freqEnd: 52, gain: 0.01, duration: 0.13, delay: 0.008 },
        ],
        [
          {
            type: 'square',
            freq: 170,
            freqEnd: 80,
            gain: 0.021,
            duration: 0.115,
            filterHz: 760,
            detune: -10,
          },
        ],
      ],
      { category: 'player', minIntervalMs: 130, pitchJitter: 0.04 },
    );
  },

  playerDeath(): void {
    engine.playVariation(
      'p.death',
      [
        [
          { type: 'sawtooth', freq: 260, freqEnd: 55, gain: 0.03, duration: 0.48, filterHz: 1400 },
          { type: 'triangle', freq: 180, freqEnd: 42, gain: 0.018, duration: 0.42, delay: 0.03 },
          { type: 'sine', freq: 520, freqEnd: 90, gain: 0.008, duration: 0.35, delay: 0.01 },
        ],
        [
          { type: 'triangle', freq: 240, freqEnd: 48, gain: 0.028, duration: 0.5, filterHz: 1200 },
          {
            type: 'sawtooth',
            freq: 140,
            freqEnd: 38,
            gain: 0.014,
            duration: 0.44,
            delay: 0.04,
            filterHz: 700,
          },
        ],
      ],
      { category: 'player', minIntervalMs: 999999, gainMul: 1 },
    );
  },

  enemyFootstep(key: string): void {
    if (!enemyCap(42)) return;
    const k = keyFromEnemy(key);
    const isHeavy = k === 'brute' || k === 'boss';
    const pools: readonly (readonly Tone[])[] = isHeavy
      ? [
          [{ type: 'triangle', freq: 68, freqEnd: 34, gain: 0.011, duration: 0.07, filterHz: 320 }],
          [{ type: 'sine', freq: 74, freqEnd: 36, gain: 0.01, duration: 0.075, filterHz: 280 }],
          [
            {
              type: 'triangle',
              freq: 62,
              freqEnd: 32,
              gain: 0.012,
              duration: 0.068,
              filterHz: 300,
            },
          ],
          [
            {
              type: 'square',
              freq: 58,
              freqEnd: 34,
              gain: 0.005,
              duration: 0.03,
              filterHz: 220,
              delay: 0.002,
            },
            { type: 'triangle', freq: 70, freqEnd: 35, gain: 0.009, duration: 0.065 },
          ],
        ]
      : [
          [
            {
              type: 'triangle',
              freq: 102,
              freqEnd: 52,
              gain: 0.007,
              duration: 0.045,
              filterHz: 760,
            },
          ],
          [{ type: 'sine', freq: 112, freqEnd: 58, gain: 0.0065, duration: 0.042, filterHz: 820 }],
          [
            {
              type: 'triangle',
              freq: 96,
              freqEnd: 48,
              gain: 0.0075,
              duration: 0.048,
              filterHz: 700,
            },
          ],
          [
            {
              type: 'triangle',
              freq: 108,
              freqEnd: 54,
              gain: 0.0068,
              duration: 0.044,
              filterHz: 780,
            },
          ],
        ];
    engine.playVariation(`e.step.${k}`, pools, {
      category: k === 'boss' ? 'boss' : 'enemy',
      minIntervalMs: isHeavy ? 320 : 230,
      pitchJitter: 0.11,
      panJitter: 0.18,
      gainMul: k === 'boss' ? 1.15 : 1,
    });
  },

  enemyJump(key: string): void {
    if (!enemyCap(60)) return;
    const k = keyFromEnemy(key);
    const heavy = k === 'brute' || k === 'boss';
    engine.playVariation(
      `e.jump.${k}`,
      [
        [
          {
            type: 'sine',
            freq: heavy ? 120 : 165,
            freqEnd: heavy ? 250 : 360,
            gain: heavy ? 0.013 : 0.01,
            duration: 0.1,
            filterHz: heavy ? 700 : 1400,
          },
        ],
        [
          {
            type: 'triangle',
            freq: heavy ? 110 : 175,
            freqEnd: heavy ? 230 : 340,
            gain: heavy ? 0.012 : 0.0095,
            duration: 0.095,
          },
        ],
        [
          {
            type: 'sine',
            freq: heavy ? 128 : 155,
            freqEnd: heavy ? 260 : 380,
            gain: heavy ? 0.0115 : 0.0105,
            duration: 0.105,
            filterHz: 1200,
          },
        ],
      ],
      { category: k === 'boss' ? 'boss' : 'enemy', minIntervalMs: 220, pitchJitter: 0.09 },
    );
  },

  enemyLand(key: string): void {
    if (!enemyCap(60)) return;
    const k = keyFromEnemy(key);
    const heavy = k === 'brute' || k === 'boss';
    engine.playVariation(
      `e.land.${k}`,
      [
        [
          {
            type: 'triangle',
            freq: heavy ? 78 : 115,
            freqEnd: heavy ? 34 : 52,
            gain: heavy ? 0.016 : 0.011,
            duration: 0.1,
            filterHz: heavy ? 360 : 700,
          },
          {
            type: 'sine',
            freq: heavy ? 48 : 80,
            freqEnd: heavy ? 28 : 44,
            gain: heavy ? 0.008 : 0.005,
            duration: 0.12,
            delay: 0.01,
          },
        ],
        [
          {
            type: 'triangle',
            freq: heavy ? 84 : 122,
            freqEnd: heavy ? 36 : 56,
            gain: heavy ? 0.015 : 0.0105,
            duration: 0.095,
            filterHz: 620,
          },
        ],
        [
          {
            type: 'square',
            freq: heavy ? 64 : 96,
            freqEnd: heavy ? 40 : 58,
            gain: heavy ? 0.0045 : 0.003,
            duration: 0.03,
            filterHz: 320,
            delay: 0.002,
          },
          {
            type: 'triangle',
            freq: heavy ? 72 : 108,
            freqEnd: heavy ? 32 : 50,
            gain: heavy ? 0.014 : 0.009,
            duration: 0.09,
          },
        ],
      ],
      { category: k === 'boss' ? 'boss' : 'enemy', minIntervalMs: 200, pitchJitter: 0.1 },
    );
  },

  enemyAttack(kind: 'grunt' | 'brute' | 'ranger' | 'boss', key: string): void {
    if (!enemyCap(50)) return;
    const k = kind === 'boss' ? 'boss' : keyFromEnemy(key);
    if (kind === 'ranger') {
      engine.playVariation(
        'e.atk.ranger',
        [
          [
            { type: 'sine', freq: 760, freqEnd: 360, gain: 0.011, duration: 0.09, filterHz: 4200 },
            { type: 'triangle', freq: 520, freqEnd: 280, gain: 0.006, duration: 0.07, delay: 0.01 },
          ],
          [
            {
              type: 'sine',
              freq: 840,
              freqEnd: 420,
              gain: 0.0105,
              duration: 0.085,
              filterHz: 4600,
              detune: 8,
            },
          ],
          [
            {
              type: 'triangle',
              freq: 700,
              freqEnd: 340,
              gain: 0.009,
              duration: 0.08,
              filterHz: 3800,
            },
            { type: 'sine', freq: 980, freqEnd: 520, gain: 0.0045, duration: 0.045, delay: 0.012 },
          ],
        ],
        { category: 'enemy', minIntervalMs: 110, pitchJitter: 0.07, panJitter: 0.2 },
      );
      return;
    }
    if (kind === 'boss') {
      engine.playVariation(
        'e.atk.boss',
        [
          [
            {
              type: 'sawtooth',
              freq: 150,
              freqEnd: 70,
              gain: 0.022,
              duration: 0.18,
              filterHz: 900,
            },
            {
              type: 'triangle',
              freq: 72,
              freqEnd: 38,
              gain: 0.016,
              duration: 0.22,
              delay: 0.02,
              filterHz: 260,
            },
            { type: 'sine', freq: 280, freqEnd: 120, gain: 0.006, duration: 0.12, delay: 0.01 },
          ],
          [
            { type: 'square', freq: 130, freqEnd: 62, gain: 0.014, duration: 0.14, filterHz: 700 },
            {
              type: 'triangle',
              freq: 66,
              freqEnd: 34,
              gain: 0.018,
              duration: 0.24,
              delay: 0.015,
              filterHz: 220,
            },
          ],
          [
            {
              type: 'sawtooth',
              freq: 165,
              freqEnd: 78,
              gain: 0.02,
              duration: 0.17,
              filterHz: 1000,
            },
            { type: 'sine', freq: 58, freqEnd: 32, gain: 0.017, duration: 0.2, delay: 0.025 },
          ],
        ],
        { category: 'boss', minIntervalMs: 120, pitchJitter: 0.05, gainMul: 1.05 },
      );
      return;
    }
    if (kind === 'brute') {
      engine.playVariation(
        'e.atk.brute',
        [
          [
            { type: 'sawtooth', freq: 210, freqEnd: 95, gain: 0.015, duration: 0.1, filterHz: 900 },
            { type: 'triangle', freq: 92, freqEnd: 48, gain: 0.008, duration: 0.12, delay: 0.01 },
          ],
          [{ type: 'square', freq: 185, freqEnd: 88, gain: 0.012, duration: 0.095, filterHz: 760 }],
          [
            {
              type: 'sawtooth',
              freq: 230,
              freqEnd: 105,
              gain: 0.014,
              duration: 0.105,
              filterHz: 980,
            },
            { type: 'sine', freq: 78, freqEnd: 42, gain: 0.007, duration: 0.11, delay: 0.012 },
          ],
        ],
        { category: 'enemy', minIntervalMs: 130, pitchJitter: 0.08 },
      );
      return;
    }
    engine.playVariation(
      'e.atk.grunt',
      [
        [
          {
            type: 'sawtooth',
            freq: 330,
            freqEnd: 160,
            gain: 0.011,
            duration: 0.075,
            filterHz: 1600,
          },
        ],
        [
          { type: 'triangle', freq: 360, freqEnd: 180, gain: 0.01, duration: 0.07, filterHz: 1800 },
          { type: 'sine', freq: 220, freqEnd: 130, gain: 0.004, duration: 0.055, delay: 0.008 },
        ],
        [
          {
            type: 'square',
            freq: 300,
            freqEnd: 150,
            gain: 0.0085,
            duration: 0.065,
            filterHz: 1400,
          },
        ],
      ],
      { category: 'enemy', minIntervalMs: 120, pitchJitter: 0.09, panJitter: 0.16 },
    );
    void k;
  },

  bossSlam(_key?: string): void {
    engine.playVariation(
      'b.slam',
      [
        [
          {
            type: 'triangle',
            freq: 88,
            freqEnd: 28,
            gain: 0.034,
            duration: 0.34,
            filterHz: 260,
            attack: 0.004,
          },
          {
            type: 'sine',
            freq: 52,
            freqEnd: 24,
            gain: 0.022,
            duration: 0.3,
            delay: 0.015,
            filterHz: 180,
          },
          {
            type: 'sawtooth',
            freq: 140,
            freqEnd: 50,
            gain: 0.01,
            duration: 0.18,
            delay: 0.01,
            filterHz: 520,
          },
        ],
        [
          { type: 'triangle', freq: 96, freqEnd: 30, gain: 0.032, duration: 0.32, filterHz: 280 },
          {
            type: 'sine',
            freq: 46,
            freqEnd: 22,
            gain: 0.024,
            duration: 0.34,
            delay: 0.02,
            filterHz: 160,
          },
        ],
        [
          {
            type: 'square',
            freq: 70,
            freqEnd: 34,
            gain: 0.012,
            duration: 0.12,
            filterHz: 220,
            attack: 0.002,
          },
          {
            type: 'triangle',
            freq: 82,
            freqEnd: 26,
            gain: 0.03,
            duration: 0.33,
            delay: 0.012,
            filterHz: 240,
          },
          { type: 'sine', freq: 120, freqEnd: 40, gain: 0.008, duration: 0.2, delay: 0.02 },
        ],
      ],
      { category: 'boss', minIntervalMs: 180, pitchJitter: 0.04, gainMul: 1 },
    );
  },

  enemyDamage(key: string, heavy = false): void {
    if (!enemyCap(35)) return;
    const k = keyFromEnemy(key);
    const isBoss = k === 'boss' || heavy;
    engine.playVariation(
      `e.dmg.${isBoss ? 'heavy' : 'light'}`,
      [
        [
          {
            type: 'square',
            freq: isBoss ? 150 : 230,
            freqEnd: isBoss ? 75 : 120,
            gain: isBoss ? 0.013 : 0.009,
            duration: 0.075,
            filterHz: 1200,
          },
        ],
        [
          {
            type: 'sawtooth',
            freq: isBoss ? 135 : 210,
            freqEnd: isBoss ? 70 : 110,
            gain: isBoss ? 0.011 : 0.008,
            duration: 0.07,
            filterHz: 1100,
          },
          {
            type: 'triangle',
            freq: isBoss ? 90 : 150,
            freqEnd: 70,
            gain: 0.004,
            duration: 0.06,
            delay: 0.008,
          },
        ],
        [
          {
            type: 'triangle',
            freq: isBoss ? 165 : 245,
            freqEnd: isBoss ? 82 : 130,
            gain: isBoss ? 0.012 : 0.0085,
            duration: 0.072,
          },
        ],
      ],
      { category: isBoss ? 'boss' : 'enemy', minIntervalMs: 90, pitchJitter: 0.1, panJitter: 0.18 },
    );
  },

  enemyDeath(kind: 'grunt' | 'brute' | 'ranger' | 'boss', key: string): void {
    const heavy = kind === 'brute' || kind === 'boss';
    const k = keyFromEnemy(key);
    engine.playVariation(
      `e.death.${heavy ? 'heavy' : 'light'}`,
      [
        [
          {
            type: 'sawtooth',
            freq: heavy ? 170 : 250,
            freqEnd: 45,
            gain: heavy ? 0.02 : 0.013,
            duration: heavy ? 0.28 : 0.18,
            filterHz: heavy ? 900 : 1400,
          },
          {
            type: 'triangle',
            freq: heavy ? 90 : 140,
            freqEnd: 38,
            gain: heavy ? 0.012 : 0.007,
            duration: heavy ? 0.26 : 0.16,
            delay: 0.02,
          },
        ],
        [
          {
            type: 'triangle',
            freq: heavy ? 155 : 230,
            freqEnd: 42,
            gain: heavy ? 0.019 : 0.0125,
            duration: heavy ? 0.3 : 0.19,
          },
          {
            type: 'sine',
            freq: heavy ? 70 : 110,
            freqEnd: 34,
            gain: heavy ? 0.01 : 0.006,
            duration: heavy ? 0.24 : 0.15,
            delay: 0.03,
            filterHz: 500,
          },
        ],
      ],
      { category: kind === 'boss' ? 'boss' : 'enemy', minIntervalMs: 220, pitchJitter: 0.08 },
    );
    void k;
  },

  uiHover(): void {
    engine.playVariation(
      'ui.hover',
      [
        [{ type: 'sine', freq: 520, freqEnd: 640, gain: 0.0065, duration: 0.032, filterHz: 3000 }],
        [{ type: 'triangle', freq: 560, freqEnd: 700, gain: 0.006, duration: 0.03 }],
      ],
      { category: 'ui', minIntervalMs: 45, pitchJitter: 0.03 },
    );
  },

  uiSelect(): void {
    engine.playVariation(
      'ui.select',
      [
        [
          { type: 'sine', freq: 420, freqEnd: 760, gain: 0.012, duration: 0.085, filterHz: 3200 },
          { type: 'triangle', freq: 640, freqEnd: 980, gain: 0.006, duration: 0.065, delay: 0.012 },
        ],
        [
          { type: 'triangle', freq: 460, freqEnd: 820, gain: 0.011, duration: 0.08 },
          { type: 'sine', freq: 700, freqEnd: 1040, gain: 0.005, duration: 0.055, delay: 0.015 },
        ],
      ],
      { category: 'ui', minIntervalMs: 80, pitchJitter: 0.03 },
    );
  },

  uiOpen(): void {
    engine.playVariation(
      'ui.open',
      [
        [
          {
            type: 'triangle',
            freq: 260,
            freqEnd: 460,
            gain: 0.009,
            duration: 0.09,
            filterHz: 2200,
          },
        ],
        [
          { type: 'sine', freq: 240, freqEnd: 420, gain: 0.0085, duration: 0.095 },
          { type: 'triangle', freq: 380, freqEnd: 560, gain: 0.0035, duration: 0.06, delay: 0.02 },
        ],
      ],
      { category: 'ui', minIntervalMs: 110, pitchJitter: 0.02 },
    );
  },

  uiUpgradeAppear(): void {
    engine.playVariation(
      'ui.up.appear',
      [
        [
          { type: 'sine', freq: 330, freqEnd: 660, gain: 0.01, duration: 0.18, filterHz: 2600 },
          { type: 'triangle', freq: 495, freqEnd: 990, gain: 0.006, duration: 0.16, delay: 0.03 },
          { type: 'sine', freq: 660, freqEnd: 1320, gain: 0.0035, duration: 0.12, delay: 0.07 },
        ],
        [
          { type: 'triangle', freq: 392, freqEnd: 784, gain: 0.0095, duration: 0.17 },
          { type: 'sine', freq: 588, freqEnd: 1176, gain: 0.005, duration: 0.14, delay: 0.04 },
        ],
      ],
      { category: 'ui', minIntervalMs: 180, pitchJitter: 0.015 },
    );
  },

  uiUpgradeHover(): void {
    engine.playVariation(
      'ui.up.hover',
      [
        [{ type: 'sine', freq: 740, freqEnd: 880, gain: 0.0055, duration: 0.04, filterHz: 3600 }],
        [{ type: 'triangle', freq: 700, freqEnd: 920, gain: 0.005, duration: 0.038 }],
        [{ type: 'sine', freq: 784, freqEnd: 988, gain: 0.0052, duration: 0.042 }],
      ],
      { category: 'ui', minIntervalMs: 55, pitchJitter: 0.02 },
    );
  },

  playerPickupHeal(): void {
    engine.playVariation(
      'player.pickup.heal',
      [
        [
          { type: 'sine', freq: 520, freqEnd: 880, gain: 0.02, duration: 0.12, filterHz: 2200 },
          {
            type: 'triangle',
            freq: 660,
            freqEnd: 990,
            gain: 0.012,
            duration: 0.1,
            delay: 0.03,
            filterHz: 2600,
          },
          { type: 'sine', freq: 980, freqEnd: 1320, gain: 0.008, duration: 0.08, delay: 0.07 },
        ],
        [
          {
            type: 'triangle',
            freq: 560,
            freqEnd: 920,
            gain: 0.018,
            duration: 0.11,
            filterHz: 2100,
          },
          { type: 'sine', freq: 740, freqEnd: 1100, gain: 0.01, duration: 0.09, delay: 0.035 },
          {
            type: 'triangle',
            freq: 1040,
            freqEnd: 1380,
            gain: 0.007,
            duration: 0.075,
            delay: 0.065,
          },
        ],
      ],
      { category: 'ui', minIntervalMs: 80, pitchJitter: 0.04, gainMul: 1.05 },
    );
  },

  uiUpgradeSelect(): void {
    engine.playVariation(
      'ui.up.select',
      [
        [
          { type: 'sine', freq: 523, freqEnd: 1046, gain: 0.014, duration: 0.14, filterHz: 3400 },
          { type: 'triangle', freq: 784, freqEnd: 1568, gain: 0.008, duration: 0.12, delay: 0.02 },
          { type: 'sine', freq: 1046, freqEnd: 2093, gain: 0.004, duration: 0.09, delay: 0.05 },
          { type: 'triangle', freq: 262, freqEnd: 523, gain: 0.005, duration: 0.16, delay: 0.01 },
        ],
        [
          { type: 'triangle', freq: 440, freqEnd: 880, gain: 0.013, duration: 0.15 },
          { type: 'sine', freq: 660, freqEnd: 1320, gain: 0.0075, duration: 0.13, delay: 0.025 },
          { type: 'sine', freq: 880, freqEnd: 1760, gain: 0.0045, duration: 0.1, delay: 0.06 },
        ],
        [
          { type: 'sine', freq: 587, freqEnd: 1175, gain: 0.0135, duration: 0.145, filterHz: 3600 },
          { type: 'triangle', freq: 880, freqEnd: 1760, gain: 0.007, duration: 0.11, delay: 0.03 },
          { type: 'sine', freq: 330, freqEnd: 659, gain: 0.0045, duration: 0.14, delay: 0.015 },
        ],
      ],
      { category: 'ui', minIntervalMs: 120, pitchJitter: 0.015, gainMul: 1.02 },
    );
  },
};
