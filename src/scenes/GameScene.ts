import Phaser from 'phaser';
import { APP_CONFIG } from '../app/AppConfig';
import { AudioManager } from '../audio/AudioManager';
import { applyGameSettings } from '../settings/GameSettings';
import { Arena, isGroundSlamBlockedByPlatforms } from '../entities/arena/Arena';
import { Player } from '../entities/player/Player';
import { PLAYER_BALANCE } from '../data/balance/player.balance';
import { pickRandomUpgrades } from '../data/upgrades/upgrade.catalog';
import type { UpgradeDefinition } from '../data/upgrades/upgrade.types';
import { KeyboardInput, type MovementIntent } from '../input/KeyboardInput';
import { WaveController } from '../systems/WaveController';
import { BossHealthHud } from '../ui/BossHealthHud';
import { DamageVignette } from '../ui/DamageVignette';
import { GameOverUi } from '../ui/GameOverUi';
import { MobileTouchControls } from '../ui/MobileTouchControls';
import { PauseButton } from '../ui/PauseButton';
import { PlayerHealthHud } from '../ui/PlayerHealthHud';
import { UpgradeSelectionUi } from '../ui/UpgradeSelectionUi';
import { WaveAnnouncementBanner } from '../ui/WaveAnnouncementBanner';
import { WaveHud } from '../ui/WaveHud';

export class GameScene extends Phaser.Scene {
  private arena?: Arena;
  private player?: Player;
  private waveController?: WaveController;
  private inputController?: KeyboardInput;
  private hud?: PlayerHealthHud;
  private waveHud?: WaveHud;
  private waveBanner?: WaveAnnouncementBanner;
  private bossHud?: BossHealthHud;
  private vignette?: DamageVignette;
  private upgradeUi?: UpgradeSelectionUi;
  private gameOverUi?: GameOverUi;
  private pauseButton?: PauseButton;
  private touchControls?: MobileTouchControls;
  private upgradeSelectionActive = false;
  private runOver = false;
  private upgradesCollected = 0;
  private pauseKeyEsc?: Phaser.Input.Keyboard.Key;
  private pauseKeyP?: Phaser.Input.Keyboard.Key;
  private lastHudHp = -1;
  private lastHudMaxHp = -1;
  private lastHudWave = -1;
  private lastHudAlive = -1;
  private lastHudPending = -1;
  private lastHudBossWave = false;
  private lastBossHudVisible = false;
  private lastBossHp = -1;
  private lastBossMaxHp = -1;
  private lastGameplayCursorOn = true;

  constructor() {
    super('GameScene');
  }

  public create(): void {
    AudioManager.init(this.sound);
    applyGameSettings(this.sound);
    this.setGameplayCursor(true);
    this.cameras.main.setBackgroundColor(APP_CONFIG.backgroundColor);
    this.physics.world.setBounds(0, 0, APP_CONFIG.width, APP_CONFIG.height);
    this.cameras.main.setBounds(0, 0, APP_CONFIG.width, APP_CONFIG.height);
    this.cameras.main.setScroll(0, 0);

    this.arena = new Arena(this);
    this.player = new Player(this);
    this.inputController = new KeyboardInput(this);
    this.vignette = new DamageVignette(this);
    this.hud = new PlayerHealthHud(this, PLAYER_BALANCE.maxHp);
    this.waveHud = new WaveHud(this);
    this.waveBanner = new WaveAnnouncementBanner(this);
    this.bossHud = new BossHealthHud(this);
    // getCurrentMaxHp provides the actual max HP at offer/refresh time for max_hp card text.
    this.upgradeUi = new UpgradeSelectionUi(
      this,
      (upgrade) => this.onUpgradeSelected(upgrade),
      () => this.player?.getMaxHp() ?? PLAYER_BALANCE.maxHp,
      () => this.player?.getAttackDamage() ?? PLAYER_BALANCE.attackDamage,
    );
    this.gameOverUi = new GameOverUi(this, () => this.restartRun());
    this.pauseButton = new PauseButton(this, () => this.openPauseMenu());
    this.touchControls = new MobileTouchControls(this, {
      // Read real ability cooldown state from the player (no independent timers).
      attackCooldown: () =>
        this.player?.getAttackCooldownState() ?? { remainingMs: 0, durationMs: 1 },
      dashCooldown: () => this.player?.getDashCooldownState() ?? { remainingMs: 0, durationMs: 1 },
      groundSlamCooldown: () =>
        this.player?.getGroundSlamCooldownState() ?? { remainingMs: 0, durationMs: 1 },
    });

    const platforms = this.arena.getPlatformGroup();
    this.physics.add.collider(this.player.getBodyObject(), platforms);
    this.waveController = new WaveController(this, platforms, this.arena.getPlatformBounds());
    this.waveController.start();

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.pauseKeyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.pauseKeyP = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    }

    this.scale.on('resize', this.handleScaleResize, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.onVisibilityOrBlur, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onVisibilityOrBlur, this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityOrBlur);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.onVisibilityOrBlur);
      window.addEventListener('pagehide', this.onVisibilityOrBlur);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  private handleScaleResize(): void {
    // Display/canvas resized (fullscreen/rotation/window). Arena/camera/physics bounds stay at APP_CONFIG.
    // Touch controls re-layout internally; this ensures Phaser scale state stays consistent.
    try {
      this.scale.refresh();
    } catch {
      // ignore
    }
  }

  private onVisibilityOrBlur = (): void => {
    // Prevent stuck movement/attack/joystick after focus loss, tab switch, or app return.
    this.touchControls?.releaseAll();
  };

  public update(_time: number, delta: number): void {
    if (!this.player || !this.inputController || !this.waveController) {
      return;
    }
    this.pauseButton?.setVisible(this.canPause());
    this.updateTouchControlsVisibility();
    this.touchControls?.updateVisuals();
    if (this.shouldHandlePauseToggle()) {
      this.openPauseMenu();
      return;
    }

    if (this.runOver) {
      this.touchControls?.releaseAll();
      this.player.update(
        {
          left: false,
          right: false,
          jumpPressed: false,
          downPressed: false,
          attackHeld: false,
          attackByPointer: false,
          dashPressed: false,
        },
        delta,
        null,
        null,
      );
      this.waveController.halt(delta);
      this.renderHud();
      this.updateVignette(delta, false);
      return;
    }

    const paused = this.upgradeSelectionActive;
    AudioManager.update(delta, {
      paused: this.scene.isPaused() || paused,
      runOver: this.runOver,
      upgradeActive: paused,
      bossActive: !!this.waveController.getActiveBoss(),
    });
    if (paused) {
      this.touchControls?.releaseAll();
      this.player.update(
        {
          left: false,
          right: false,
          jumpPressed: false,
          downPressed: false,
          attackHeld: false,
          attackByPointer: false,
          dashPressed: false,
        },
        delta,
        null,
        null,
      );
    } else {
      const pointer = this.input.activePointer;
      const lookTarget = pointer ? { x: pointer.worldX, y: pointer.worldY } : null;
      const intent = this.readIntent();
      // Mobile attack button (#2): aim at nearest alive enemy when attack is triggered from touch controls.
      const aimTarget =
        intent.attackByTouch && intent.attackHeld ? this.getNearestEnemyTarget() : null;
      this.player.update(intent, delta, lookTarget, aimTarget);
    }

    const target = this.player.getBodyObject();
    const waveCleared = this.waveController.update(
      delta,
      target.x,
      target.y,
      !this.player.isDead(),
      paused,
    );
    this.showPendingWaveAnnouncement();
    if (!paused && !this.player.isDead()) {
      this.resolveCombat();
      this.resolvePickups();
    }
    if (!this.player.isDead() && waveCleared && !this.upgradeSelectionActive && !this.runOver) {
      this.openUpgradeSelection();
    }
    if (this.player.isDead() && !this.runOver) {
      this.triggerGameOver();
    }

    this.renderHud();
    this.updateWaveBanner(delta, paused);
    this.updateVignette(delta, !paused && !this.scene.isPaused());
  }

  private updateTouchControlsVisibility(): void {
    // Touch controls: shown only on touch-capable devices and only during active gameplay.
    // Hidden during pause overlay, upgrade selection, and game over to avoid blocking menus.
    const pauseScene = this.scene.get('PauseScene');
    const pauseActive = pauseScene.scene.isActive();
    const show =
      !this.runOver &&
      !this.upgradeSelectionActive &&
      !pauseActive &&
      !this.player?.isDead() &&
      !this.gameOverUi?.isActive();
    this.touchControls?.setVisible(show);
    this.setGameplayCursor(show);
  }

  private readIntent(): MovementIntent & { attackByTouch: boolean } {
    const touch = this.touchControls?.read();
    const keyboard = this.inputController?.read(touch?.capturedPointerIds);
    return {
      left: !!(touch?.left || keyboard?.left),
      right: !!(touch?.right || keyboard?.right),
      jumpPressed: !!(touch?.jumpPressed || keyboard?.jumpPressed),
      downPressed: !!(touch?.downPressed || keyboard?.downPressed),
      attackHeld: !!(touch?.attackHeld || keyboard?.attackHeld),
      // Pointer-driven aim applies only to real mouse/pointer attack, never to virtual touch buttons.
      attackByPointer: !!keyboard?.attackByPointer,
      dashPressed: !!(touch?.dashPressed || keyboard?.dashPressed),
      // Only mobile Attack button provides touch auto-aim; screen taps never trigger attack (#2, #5).
      attackByTouch: !!touch?.attackByTouch && !!touch?.attackHeld,
    };
  }

  private getNearestEnemyTarget(): { x: number; y: number } | null {
    if (!this.player || !this.waveController) return null;
    const px = this.player.getBodyObject().x;
    const py = this.player.getBodyObject().y;
    let best: { x: number; y: number } | null = null;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (const enemy of this.waveController.getEnemies()) {
      if (enemy.isDead()) continue;
      const ex = enemy.getBodyObject().x;
      const ey = enemy.getBodyObject().y;
      const dx = ex - px;
      const dy = ey - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { x: ex, y: ey };
      }
    }
    return best;
  }

  private updateVignette(delta: number, advanceFlash: boolean): void {
    if (!this.vignette || !this.player) return;
    if (this.player.consumeDamageFlash()) {
      this.vignette.triggerDamageFlash();
    }
    this.vignette.setHpRatio(this.player.getHp(), this.player.getMaxHp());
    if (advanceFlash) {
      this.vignette.update(delta);
    } else {
      this.vignette.renderStatic();
    }
  }

  private resolvePickups(): void {
    const player = this.player;
    const waveController = this.waveController;
    if (!player || !waveController || player.isDead()) {
      return;
    }
    const playerBody = player.getBodyObject().body as Phaser.Physics.Arcade.Body;
    if (!playerBody.enable) {
      return;
    }
    const playerRect = this.toBodyRect(playerBody);
    for (const pickup of waveController.getPickups()) {
      if (!pickup.isActive() || pickup.isCollected()) {
        continue;
      }
      if (!Phaser.Geom.Intersects.RectangleToRectangle(pickup.getBounds(), playerRect)) {
        continue;
      }
      if (player.getHp() >= player.getMaxHp()) {
        continue;
      }
      player.restoreFullHealth();
      pickup.collect();
      break;
    }
  }

  private renderHud(force = false): void {
    if (!this.player || !this.waveController) {
      return;
    }
    // Only redraw HUD elements when state actually changes (big mobile perf win).
    const hp = this.player.getHp();
    const maxHp = this.player.getMaxHp();
    if (force || hp !== this.lastHudHp || maxHp !== this.lastHudMaxHp) {
      this.lastHudHp = hp;
      this.lastHudMaxHp = maxHp;
      this.hud?.render(hp, maxHp);
    }
    const wave = this.waveController.getState();
    if (
      force ||
      wave.wave !== this.lastHudWave ||
      wave.alive !== this.lastHudAlive ||
      wave.pending !== this.lastHudPending ||
      wave.isBossWave !== this.lastHudBossWave
    ) {
      this.lastHudWave = wave.wave;
      this.lastHudAlive = wave.alive;
      this.lastHudPending = wave.pending;
      this.lastHudBossWave = wave.isBossWave;
      this.waveHud?.render(wave.wave, wave.alive, wave.pending, wave.isBossWave);
    }
    this.showPendingWaveAnnouncement();
    const boss = this.waveController.getActiveBoss();
    if (boss) {
      const bhp = boss.getHp();
      const bmax = boss.getMaxHp();
      if (
        force ||
        !this.lastBossHudVisible ||
        bhp !== this.lastBossHp ||
        bmax !== this.lastBossMaxHp
      ) {
        this.lastBossHp = bhp;
        this.lastBossMaxHp = bmax;
        this.bossHud?.show(bhp, bmax);
      }
      this.lastBossHudVisible = true;
    } else if (this.lastBossHudVisible || force) {
      this.lastBossHudVisible = false;
      this.bossHud?.hide();
    }
  }

  private showPendingWaveAnnouncement(): void {
    if (!this.waveController || !this.waveBanner) {
      return;
    }
    const announcement = this.waveController.consumeWaveAnnouncement();
    if (announcement) {
      this.waveBanner.announce(announcement.wave, announcement.isBossWave);
    }
  }

  private updateWaveBanner(delta: number, paused: boolean): void {
    if (paused || this.scene.isPaused() || this.runOver) {
      return;
    }
    this.waveBanner?.update(delta);
  }

  public refreshLocalizedUi(): void {
    this.upgradeUi?.refreshText();
    this.gameOverUi?.refreshText();
    this.waveBanner?.refreshText();
    this.renderHud(true);
  }

  public onResumedFromPause(): void {
    // Wave/banner timing is delta-driven in GameScene.update; it resumes naturally after pause.
    this.setGameplayCursor(true);
  }

  private setGameplayCursor(gameplay: boolean): void {
    if (gameplay === this.lastGameplayCursorOn) return;
    this.lastGameplayCursorOn = gameplay;
    try {
      this.input.setDefaultCursor(gameplay ? 'none' : 'default');
    } catch {
      // Ignore cursor API differences; never block gameplay/UI.
    }
  }

  private openUpgradeSelection(): void {
    if (
      !this.upgradeUi ||
      !this.waveController ||
      !this.player ||
      this.player.isDead() ||
      this.runOver
    ) {
      this.waveController?.beginIntermission();
      return;
    }
    // Fast transition to upgrade selection after wave clear (no extra empty pause).
    this.time.delayedCall(120, () => {
      if (!this.upgradeUi || !this.waveController || !this.player || this.runOver) return;
      if (this.player.isDead() || this.upgradeSelectionActive) return;
      if (this.scene.isPaused()) return;
      const pauseScene = this.scene.get('PauseScene');
      if (pauseScene?.scene?.isActive()) return;
      this.upgradeSelectionActive = true;
      this.setGameplayCursor(false);
      const upgrades = pickRandomUpgrades(3);
      this.upgradeUi.show(upgrades);
    });
  }

  private onUpgradeSelected(upgrade: UpgradeDefinition): void {
    if (!this.upgradeSelectionActive || !this.player || !this.waveController || this.runOver) {
      return;
    }
    this.player.applyUpgrade(upgrade.id);
    this.upgradesCollected += 1;
    this.upgradeUi?.hide();
    this.upgradeSelectionActive = false;
    this.waveController.beginIntermission(650);
  }

  private triggerGameOver(): void {
    if (this.runOver || !this.waveController) {
      return;
    }
    this.runOver = true;
    this.setGameplayCursor(false);
    AudioManager.update(0, { runOver: true, bossActive: false, upgradeActive: false });
    this.upgradeSelectionActive = false;
    this.upgradeUi?.hide();
    const wave = this.waveController.getState();
    this.gameOverUi?.show({
      wave: wave.wave,
      kills: this.waveController.getTotalKills(),
      upgrades: this.upgradesCollected,
    });
  }

  public canPause(): boolean {
    if (!this.player || this.runOver || this.upgradeSelectionActive) {
      return false;
    }
    if (this.player.isDead() || this.gameOverUi?.isActive()) {
      return false;
    }
    const pauseScene = this.scene.get('PauseScene');
    return !pauseScene.scene.isActive();
  }

  public restartFromPause(): void {
    this.restartRun();
  }

  private shouldHandlePauseToggle(): boolean {
    if (!this.canPause()) {
      return false;
    }
    const escPressed = this.pauseKeyEsc ? Phaser.Input.Keyboard.JustDown(this.pauseKeyEsc) : false;
    const pPressed = this.pauseKeyP ? Phaser.Input.Keyboard.JustDown(this.pauseKeyP) : false;
    return escPressed || pPressed;
  }

  private openPauseMenu(): void {
    if (!this.canPause()) {
      return;
    }
    this.touchControls?.releaseAll();
    this.setGameplayCursor(false);
    this.scene.launch('PauseScene');
    this.scene.pause();
  }

  private restartRun(): void {
    if (this.scene.isPaused()) {
      this.scene.resume();
    }
    const pauseScene = this.scene.get('PauseScene');
    if (pauseScene.scene.isActive()) {
      this.scene.stop('PauseScene');
    }
    this.cleanup();
    this.scene.restart();
  }

  private cleanup(): void {
    this.scale.off('resize', this.handleScaleResize, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onVisibilityOrBlur, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.onVisibilityOrBlur, this);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityOrBlur);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.onVisibilityOrBlur);
      window.removeEventListener('pagehide', this.onVisibilityOrBlur);
    }
    this.runOver = false;
    this.upgradeSelectionActive = false;
    this.upgradesCollected = 0;
    this.touchControls?.destroy();
    this.touchControls = undefined;
    this.gameOverUi?.destroy();
    this.gameOverUi = undefined;
    this.upgradeUi?.destroy();
    this.upgradeUi = undefined;
    this.bossHud?.destroy();
    this.bossHud = undefined;
    this.vignette?.destroy();
    this.vignette = undefined;
    this.player?.destroy();
    this.player = undefined;
    this.waveController?.destroy();
    this.waveController = undefined;
    this.inputController = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    this.waveHud?.destroy();
    this.waveHud = undefined;
    this.waveBanner?.destroy();
    this.waveBanner = undefined;
    this.pauseButton?.destroy();
    this.pauseButton = undefined;
    this.arena?.destroy();
    this.arena = undefined;
  }

  private resolveCombat(): void {
    const player = this.player;
    const waveController = this.waveController;
    if (!player || !waveController) {
      return;
    }

    const playerHitbox = player.getAttackHitbox();
    const playerBody = player.getBodyObject().body as Phaser.Physics.Arcade.Body;
    const slamImpact = player.consumeGroundSlamImpact();
    for (const enemy of waveController.getEnemies()) {
      if (enemy.isDead()) {
        continue;
      }
      const enemyBody = enemy.getBodyObject().body as Phaser.Physics.Arcade.Body;
      const enemyRect = enemyBody.enable ? this.toBodyRect(enemyBody) : null;
      if (slamImpact && enemyRect && !player.hasGroundSlamHitTarget(enemy)) {
        const ecx = enemyRect.x + enemyRect.width / 2;
        const ecy = enemyRect.y + enemyRect.height / 2;
        const dx = ecx - slamImpact.x;
        const dy = ecy - slamImpact.bottomY;
        if (dx * dx + dy * dy <= slamImpact.radius * slamImpact.radius) {
          const blocked =
            !!this.arena &&
            isGroundSlamBlockedByPlatforms(
              slamImpact.x,
              slamImpact.bottomY,
              ecx,
              ecy,
              enemyRect.width / 2,
              enemyRect.height / 2,
              this.arena.getPlatformBounds(),
            );
          if (!blocked) {
            player.markGroundSlamHitTarget(enemy);
            if (enemy.takeDamage(slamImpact.damage)) {
              enemy.applyGroundSlamKnockback(
                slamImpact.x,
                slamImpact.bottomY,
                PLAYER_BALANCE.groundSlamKnockbackHorizontal,
                PLAYER_BALANCE.groundSlamKnockbackVertical,
                PLAYER_BALANCE.groundSlamKnockbackDurationMs,
                PLAYER_BALANCE.groundSlamKnockbackMaxSpeed,
              );
            }
          }
        }
      }

      if (playerHitbox && enemyRect && !player.hasHitTarget(enemy)) {
        if (
          Phaser.Geom.Intersects.RectangleToRectangle(playerHitbox, enemyRect) &&
          enemy.takeDamage(player.getAttackDamage())
        ) {
          player.markHitTarget(enemy);
          const hit = this.impactPoint(playerHitbox, enemyRect);
          enemy.emitHitImpact(
            hit.x,
            hit.y,
            enemyRect.x + enemyRect.width / 2 - playerBody.center.x,
            enemyRect.y + enemyRect.height / 2 - playerBody.center.y,
          );
          enemy.applyKnockback(playerBody.x + playerBody.width / 2);
        }
      }

      if (player.isDead() || enemy.isDead()) {
        continue;
      }

      const enemyHitbox = enemy.getAttackHitbox();
      if (enemyHitbox && !enemy.hasHitTarget(player)) {
        if (
          playerBody.enable &&
          Phaser.Geom.Intersects.RectangleToRectangle(enemyHitbox, this.toBodyRect(playerBody)) &&
          player.takeDamage(enemy.getAttackDamage())
        ) {
          enemy.markHitTarget(player);
          const playerRect = this.toBodyRect(playerBody);
          const hit = this.impactPoint(enemyHitbox, playerRect);
          player.emitHitImpact(
            hit.x,
            hit.y,
            playerRect.x + playerRect.width / 2 - (enemyRect?.x ?? hit.x),
            playerRect.y + playerRect.height / 2 - (enemyRect?.y ?? hit.y),
          );
        }
      }
    }

    if (!playerBody.enable || player.isDead()) {
      return;
    }
    for (const projectile of waveController.getProjectiles()) {
      if (!projectile.isActive() || projectile.hasHit()) {
        continue;
      }
      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          projectile.getBounds(),
          this.toBodyRect(playerBody),
        )
      ) {
        projectile.markHit();
        const b = projectile.getBounds();
        player.emitHitImpact(
          b.x + b.width / 2,
          b.y + b.height / 2,
          playerBody.center.x - (b.x + b.width / 2),
          playerBody.center.y - (b.y + b.height / 2),
        );
        player.takeDamage(projectile.damage);
        if (player.isDead()) {
          break;
        }
      }
    }

    for (const shockwave of waveController.getShockwaves()) {
      if (!shockwave.isActive() || shockwave.hasHit()) {
        continue;
      }
      if (
        Phaser.Geom.Intersects.RectangleToRectangle(
          shockwave.getBounds(),
          this.toBodyRect(playerBody),
        )
      ) {
        shockwave.markHit();
        const b = shockwave.getBounds();
        player.emitHitImpact(
          b.x + b.width / 2,
          b.y + b.height / 2,
          playerBody.center.x - (b.x + b.width / 2),
          playerBody.center.y - (b.y + b.height / 2),
        );
        player.takeDamage(shockwave.damage);
        if (player.isDead()) {
          break;
        }
      }
    }
  }

  private toBodyRect(body: Phaser.Physics.Arcade.Body): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
  }

  private impactPoint(
    a: Phaser.Geom.Rectangle,
    b: Phaser.Geom.Rectangle,
  ): { x: number; y: number } {
    const x = Phaser.Math.Clamp((a.x + a.width / 2 + b.x + b.width / 2) / 2, b.x, b.x + b.width);
    const y = Phaser.Math.Clamp((a.y + a.height / 2 + b.y + b.height / 2) / 2, b.y, b.y + b.height);
    return { x, y };
  }
}
