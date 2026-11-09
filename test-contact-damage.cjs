import { chromium } from 'playwright';

async function runTests() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Capture console messages
  page.on('console', (msg) => console.log(`BROWSER [${msg.type()}]:`, msg.text()));
  page.on('pageerror', (err) => console.log('BROWSER ERROR:', err.message));
  page.on('requestfailed', (req) =>
    console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText),
  );

  await page.goto('http://localhost:5175/BLOOMORIA/');
  await page.waitForLoadState('networkidle');

  // Wait for game to initialize - canvas appears and game is assigned
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      return canvas && (window.game || canvas._phaserGame);
    },
    { timeout: 30000 },
  );

  await page.waitForTimeout(2000);

  // Verify game is accessible
  const gameExists = await page.evaluate(() => !!window.game);
  console.log('window.game exists:', gameExists);

  // Helper to get player state
  async function getPlayerState() {
    return await page.evaluate(() => {
      const game = window.game;
      if (!game || !game.scene || !game.scene.scenes.length) return null;
      const scenes = game.scene.scenes;
      const scene = scenes.find((s) => s.scene.key === 'GameScene');
      if (!scene || !scene.player) return null;
      const player = scene.player;
      const body = player.getBodyObject().body;
      return {
        x: player.getBodyObject().x,
        y: player.getBodyObject().y,
        hp: player.getHp(),
        maxHp: player.getMaxHp(),
        isDashing: player.isDashing(),
        isGroundSlamming: player.isGroundSlamming(),
        wasDashingThisFrame: player.wasDashingThisFrame(),
        wasGroundSlammingThisFrame: player.wasGroundSlammingThisFrame(),
        isInvulnerable: player.isInvulnerable(),
        invulnerabilityRemainingMs: player.invulnerabilityRemainingMs,
        velocityX: body.velocity.x,
        velocityY: body.velocity.y,
        dead: player.isDead(),
      };
    });
  }

  // Helper to get enemy states
  async function getEnemyStates() {
    return await page.evaluate(() => {
      const game = window.game;
      if (!game || !game.scene || !game.scene.scenes.length) return [];
      const scene = game.scene.scenes.find((s) => s.scene.key === 'GameScene');
      if (!scene || !scene.waveController) return [];
      const enemies = scene.waveController.getEnemies();
      return enemies
        .filter((e) => !e.isDead())
        .map((e) => {
          const body = e.getBodyObject().body;
          return {
            archetype: e.getArchetype(),
            x: e.getBodyObject().x,
            y: e.getBodyObject().y,
            hp: e.getHp(),
            maxHp: e.getMaxHp(),
            contactDamage: e.getContactDamage(),
            velocityX: body.velocity.x,
            velocityY: body.velocity.y,
            width: e.getBodyObject().width,
            height: e.getBodyObject().height,
          };
        });
    });
  }

  // Helper to wait for condition
  async function waitForCondition(fn, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await fn();
      if (result) return result;
      await page.waitForTimeout(50);
    }
    return null;
  }

  // Helper to heal player and wait for invulnerability to clear
  async function healPlayerAndWait() {
    await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find((s) => s.scene.key === 'GameScene');
      if (scene?.player) scene.player.restoreFullHealth();
    });
    // Wait for any invulnerability to clear
    await page.waitForTimeout(1000);
  }

  // Helper to get wave number
  async function getWaveNumber() {
    return await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find((s) => s.scene.key === 'GameScene');
      if (!scene || !scene.waveController) return 0;
      return scene.waveController.getState().wave;
    });
  }

  // Helper to find a grunt enemy
  async function findGrunt() {
    const enemyStates = await getEnemyStates();
    return enemyStates.find((e) => e.archetype === 'grunt');
  }

  // Helper to wait until player is not invulnerable
  async function _waitForInvulnerabilityClear() {
    await waitForCondition(async () => {
      const state = await getPlayerState();
      return state && !state.isInvulnerable && state.invulnerabilityRemainingMs === 0;
    }, 5000);
  }

  const results = [];

  console.log('=== Starting Contact Damage & Invulnerability Tests ===\n');

  // Test A: Basic contact damage - walk into grunt
  console.log('Test A: Contact damage on collision');
  await healPlayerAndWait();

  let grunt = await findGrunt();
  if (grunt) {
    const playerStateBefore = await getPlayerState();
    const initialHp = playerStateBefore.hp;
    const contactDmg = grunt.contactDamage;

    // Walk into grunt
    const direction = grunt.x > playerStateBefore.x ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(direction);
    await page.waitForTimeout(2000); // Long enough for multiple hits
    await page.keyboard.up(direction);
    await page.waitForTimeout(500);

    const playerStateAfter = await getPlayerState();
    const hpLost = initialHp - playerStateAfter.hp;
    const blocked = Math.abs(playerStateAfter.velocityX) < 50;
    const tookDamage = hpLost >= contactDmg;

    results.push({
      name: 'Contact damage on collision',
      pass: blocked && tookDamage,
      details: `Blocked: ${blocked}, HP lost: ${hpLost} (expected >=${contactDmg}), Contact damage: ${contactDmg}, Wave: ${await getWaveNumber()}`,
    });
    console.log(
      `  Blocked: ${blocked}, HP lost: ${hpLost} (expected >=${contactDmg}), PASS: ${blocked && tookDamage}`,
    );
  } else {
    results.push({ name: 'Contact damage on collision', pass: false, details: 'No Grunt found' });
    console.log('  FAIL: No Grunt found');
  }

  // Test B: Dash through enemy - no damage during dash
  console.log('\nTest B: Dash through enemy (invulnerable during dash)');
  await healPlayerAndWait();

  grunt = await findGrunt();
  if (grunt) {
    // Position player near enemy (but not touching)
    let playerState = await getPlayerState();
    const direction = grunt.x > playerState.x ? 'ArrowRight' : 'ArrowLeft';

    // Walk close to enemy first
    await page.keyboard.down(direction);
    await page.waitForTimeout(500);
    await page.keyboard.up(direction);
    await page.waitForTimeout(300);

    // Walk TOWARD enemy for a bit more to ensure we'll hit it during dash
    await page.keyboard.down(direction);
    await page.waitForTimeout(200);
    await page.keyboard.up(direction);
    await page.waitForTimeout(100);

    // Capture HP RIGHT BEFORE dash
    playerState = await getPlayerState();
    const initialHp = playerState.hp;

    // Dash through enemy
    await page.keyboard.down(direction);
    await page.waitForTimeout(50); // Small delay to start moving
    await page.keyboard.down('Shift');
    await page.waitForTimeout(400); // Longer than dash duration (200ms)
    await page.keyboard.up('Shift');
    await page.keyboard.up(direction);
    await page.waitForTimeout(500);

    const playerStateAfter = await getPlayerState();
    const hpLost = initialHp - playerStateAfter.hp;
    const movedThrough = Math.abs(playerStateAfter.x - playerState.x) > 100;

    results.push({
      name: 'Dash through enemy',
      pass: movedThrough && hpLost === 0,
      details: `Moved through: ${movedThrough}, HP lost: ${hpLost} (expected 0), Initial X: ${playerState.x}, Final X: ${playerStateAfter.x}`,
    });
    console.log(
      `  Moved through: ${movedThrough}, HP lost: ${hpLost}, PASS: ${movedThrough && hpLost === 0}`,
    );
  } else {
    results.push({ name: 'Dash through enemy', pass: false, details: 'No Grunt found' });
    console.log('  FAIL: No Grunt found');
  }

  // Test C: Ground slam through enemy - no damage during slam
  console.log('\nTest C: Ground slam through enemy (invulnerable during slam)');
  await healPlayerAndWait();

  grunt = await findGrunt();
  if (grunt) {
    // Position player horizontally aligned with enemy
    let playerState = await getPlayerState();
    const direction = grunt.x > playerState.x ? 'ArrowRight' : 'ArrowLeft';

    // Move horizontally to align with enemy
    await page.keyboard.down(direction);
    await page.waitForTimeout(500);
    await page.keyboard.up(direction);
    await page.waitForTimeout(300);

    // Jump
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(600); // Time to reach apex

    // Capture HP RIGHT BEFORE slam
    playerState = await getPlayerState();
    const initialHp = playerState.hp;

    // Slam down (hold down)
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1000); // Time to slam down and land
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(500);

    const playerStateAfter = await getPlayerState();
    const hpLost = initialHp - playerStateAfter.hp;

    results.push({
      name: 'Ground slam through enemy',
      pass: hpLost === 0,
      details: `HP lost: ${hpLost} (expected 0)`,
    });
    console.log(`  HP lost: ${hpLost}, PASS: ${hpLost === 0}`);
  } else {
    results.push({ name: 'Ground slam through enemy', pass: false, details: 'No Grunt found' });
    console.log('  FAIL: No Grunt found');
  }

  // Test D: Dash ends - collision restores
  console.log('\nTest D: Dash ends - collision restores');
  await healPlayerAndWait();

  grunt = await findGrunt();
  if (grunt) {
    let playerState = await getPlayerState();
    const direction = grunt.x > playerState.x ? 'ArrowRight' : 'ArrowLeft';

    // Walk close
    await page.keyboard.down(direction);
    await page.waitForTimeout(500);
    await page.keyboard.up(direction);
    await page.waitForTimeout(300);

    const playerStateBeforeDash = await getPlayerState();
    const initialHp = playerStateBeforeDash.hp;
    const contactDmg = grunt.contactDamage;

    // Dash toward enemy
    await page.keyboard.down(direction);
    await page.waitForTimeout(50);
    await page.keyboard.down('Shift');
    await page.waitForTimeout(300); // Dash duration
    await page.keyboard.up('Shift');
    // Continue walking after dash ends
    await page.waitForTimeout(500);
    await page.keyboard.up(direction);
    await page.waitForTimeout(500);

    const playerStateAfter = await getPlayerState();
    const hpLost = initialHp - playerStateAfter.hp;
    const blocked = Math.abs(playerStateAfter.velocityX) < 50;
    const tookDamage = hpLost >= contactDmg;

    results.push({
      name: 'Dash ends - collision restores',
      pass: blocked && tookDamage,
      details: `Blocked: ${blocked}, HP lost: ${hpLost} (expected ${contactDmg})`,
    });
    console.log(
      `  Blocked: ${blocked}, HP lost: ${hpLost} (expected ${contactDmg}), PASS: ${blocked && tookDamage}`,
    );
  } else {
    results.push({
      name: 'Dash ends - collision restores',
      pass: false,
      details: 'No Grunt found',
    });
    console.log('  FAIL: No Grunt found');
  }

  // Test E: Invulnerability after hit - contact damage respects i-frames
  console.log('\nTest E: Invulnerability after hit (i-frames work)');
  await healPlayerAndWait();

  grunt = await findGrunt();
  if (grunt) {
    const playerStateBefore = await getPlayerState();
    const initialHp = playerStateBefore.hp;
    const contactDmg = grunt.contactDamage;
    const invulnMs = playerStateBefore.invulnerabilityRemainingMs || 900; // Default from balance

    // Walk into grunt and stay there
    const direction = grunt.x > playerStateBefore.x ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(direction);
    await page.waitForTimeout(3000); // 3 seconds - should get ~3 hits max (900ms i-frames)
    await page.keyboard.up(direction);
    await page.waitForTimeout(500);

    const playerStateAfter = await getPlayerState();
    const hpLost = initialHp - playerStateAfter.hp;
    const maxExpectedHits = Math.ceil(3000 / invulnMs) + 1;
    const maxExpectedDmg = maxExpectedHits * contactDmg;

    results.push({
      name: 'Invulnerability after hit',
      pass: hpLost <= maxExpectedDmg,
      details: `HP lost: ${hpLost}, Max expected: ${maxExpectedDmg}, Contact damage: ${contactDmg}, I-frames: ${invulnMs}ms`,
    });
    console.log(
      `  HP lost: ${hpLost}, Max expected: ${maxExpectedDmg}, PASS: ${hpLost <= maxExpectedDmg}`,
    );
  } else {
    results.push({ name: 'Invulnerability after hit', pass: false, details: 'No Grunt found' });
    console.log('  FAIL: No Grunt found');
  }

  // Test F: Low HP death from contact damage
  console.log('\nTest F: Low HP death from contact damage');
  await healPlayerAndWait();

  // Damage player to low HP by walking into enemy multiple times
  grunt = await findGrunt();
  if (grunt) {
    let playerState = await getPlayerState();
    // If HP > 1, damage it down
    let attempts = 0;
    while (playerState.hp > 1 && attempts < 10) {
      const direction = grunt.x > playerState.x ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(direction);
      await page.waitForTimeout(1000);
      await page.keyboard.up(direction);
      await page.waitForTimeout(1000); // Wait for i-frames
      const newState = await getPlayerState();
      if (newState.hp >= playerState.hp) break; // No more damage
      playerState = newState;
      attempts++;
    }

    const lowHpState = await getPlayerState();
    if (lowHpState.hp <= 1) {
      const _initialHp = lowHpState.hp;
      const direction = grunt.x > lowHpState.x ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(direction);
      await page.waitForTimeout(2000);
      await page.keyboard.up(direction);
      await page.waitForTimeout(500);

      const finalState = await getPlayerState();
      const died = finalState.dead;

      results.push({
        name: 'Low HP death from contact damage',
        pass: died,
        details: `Died: ${died}, Final HP: ${finalState.hp}`,
      });
      console.log(`  Died: ${died}, PASS: ${died}`);
    } else {
      results.push({
        name: 'Low HP death from contact damage',
        pass: false,
        details: 'Could not reduce HP to 1',
      });
      console.log('  FAIL: Could not reduce HP to 1');
    }
  } else {
    results.push({
      name: 'Low HP death from contact damage',
      pass: false,
      details: 'No Grunt found',
    });
    console.log('  FAIL: No Grunt found');
  }

  // Summary
  console.log('\n=== TEST SUMMARY ===');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    if (r.pass) passed++;
    else failed++;
    console.log(`  ${status}: ${r.name} - ${r.details}`);
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);

  await browser.close();
  return { passed, failed, results };
}

runTests().catch(console.error);
