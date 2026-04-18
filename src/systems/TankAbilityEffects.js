/**
 * TankAbilityEffects.js — Gameplay effects for the six tank abilities (t043).
 *
 * AbilitySystem (t042) manages cooldowns and emits ability IDs when the player
 * presses Q.  This module converts those IDs into actual game-state changes:
 * damage bursts, timed invincibility, parabolic jumps, fire-rate boosts, etc.
 *
 * Architecture
 * ────────────
 *  Game.js creates ONE TankAbilityEffects instance and calls:
 *    effects.execute(abilityId, playerTank, allLivingTanks)   — on Q press
 *    effects.update(dt, allLivingTanks)                       — every game frame
 *    effects.reset()                                           — on round reset
 *
 * Tank-level flags written by this system (initialised on Tank, see Tank.js):
 *   tank.shielded             {boolean} — takeDamage() absorbs all hits
 *   tank.isJumping            {boolean} — PlayerController/AIController skip
 *                                         terrain-follow while this is set
 *   tank.isLockedDown         {boolean} — movement suppressed for lockdown duration
 *   tank._jumpBaseY           {number}  — ground Y at jump origin (internal)
 *   tank._preLockdownFireRate {number}  — saved fireRate (internal, restored on end)
 *   tank.reactiveArmorCharges {number}  — hits remaining at half damage
 *
 * Ability specs (VISION.md §"Abilities"):
 *   infernoBurst  — 360° flame ring, ≤40 dmg to all enemies within 15 units
 *   energyShield  — absorb ALL incoming damage for 5 s
 *   rocketJump    — parabolic arc 12 units tall over 2 s; AoE 60 dmg / 12-unit splash on land
 *   lockdownMode  — stationary 8 s, fireRate doubled while active
 *   barrage       — 5 shells 0.2 s apart, bypasses normal fire cooldown
 *   reactiveArmor — next 3 hits deal 50 % reduced damage
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Ability tuning constants
// ---------------------------------------------------------------------------

const INFERNO_BURST_RADIUS  = 15;   // world units, enemy tanks caught in ring
const INFERNO_BURST_DAMAGE  = 40;   // max damage (falls off linearly toward edge)

const ENERGY_SHIELD_DURATION = 5;   // seconds

const ROCKET_JUMP_HEIGHT     = 12;  // peak altitude above launch point (world units)
const ROCKET_JUMP_DURATION   = 2.0; // total flight time (seconds)
const ROCKET_JUMP_SPLASH     = 12;  // AoE radius on landing (world units)
const ROCKET_JUMP_DAMAGE     = 60;  // max landing damage (falls off toward edge)

const LOCKDOWN_DURATION        = 8;   // seconds locked in place
const LOCKDOWN_FIRE_RATE_MULT  = 2;   // fire rate multiplier (higher = faster cadence)

const BARRAGE_SHOTS    = 5;
const BARRAGE_INTERVAL = 0.2;   // seconds between consecutive barrage shells

export const REACTIVE_ARMOR_CHARGES   = 3;    // hit-reduction charges granted
export const REACTIVE_ARMOR_REDUCTION = 0.50; // 50 % of incoming damage is absorbed

// ---------------------------------------------------------------------------
// TankAbilityEffects
// ---------------------------------------------------------------------------

export class TankAbilityEffects {
  /**
   * @param {object} opts
   * @param {import('../entities/Terrain.js').Terrain}             opts.terrain
   * @param {import('./ParticleSystem.js').ParticleSystem}         opts.particles
   * @param {import('./ProjectileSystem.js').ProjectileSystem}     opts.projectileSystem
   */
  constructor({ terrain, particles, projectileSystem }) {
    this.terrain          = terrain;
    this.particles        = particles;
    this.projectileSystem = projectileSystem;

    /**
     * Timed effects in flight: energyShield, lockdownMode, rocketJump.
     * @type {Array<{type: string, tank: object, timeLeft: number, maxTime?: number}>}
     */
    this._activeEffects = [];

    /**
     * Queued barrage shots waiting to fire.
     * @type {Array<{tank: object, shotsLeft: number, timer: number}>}
     */
    this._barrageQueues = [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute the named ability for the given tank.
   * Called by Game.js immediately after AbilitySystem.tryActivateTankAbility()
   * returns a non-null ID.
   *
   * @param {string}   abilityId  — ability identifier from TankDefs.ability
   * @param {object}   tank       — the activating player Tank instance
   * @param {object[]} allTanks   — all LIVING Tank instances (both teams)
   * @returns {boolean} true if the effect was successfully started
   */
  execute(abilityId, tank, allTanks) {
    switch (abilityId) {
      case 'infernoBurst':  return this._infernoBurst(tank, allTanks);
      case 'energyShield':  return this._energyShield(tank);
      case 'rocketJump':    return this._rocketJump(tank);
      case 'lockdownMode':  return this._lockdownMode(tank);
      case 'barrage':       return this._barrage(tank);
      case 'reactiveArmor': return this._reactiveArmor(tank);
      default:
        console.warn(`[TankAbilityEffects] Unknown ability: "${abilityId}"`);
        return false;
    }
  }

  /**
   * Per-frame update: advance timed effects and flush barrage queues.
   *
   * @param {number}   dt       — seconds since last frame
   * @param {object[]} allTanks — all living tanks (for AoE resolution)
   */
  update(dt, allTanks) {
    // Advance timed effects (iterate backward so splice is safe)
    for (let i = this._activeEffects.length - 1; i >= 0; i--) {
      const effect = this._activeEffects[i];
      effect.timeLeft -= dt;

      if (effect.type === 'rocketJump') {
        this._tickRocketJump(effect, dt);
      }

      if (effect.timeLeft <= 0) {
        this._endEffect(effect, allTanks);
        this._activeEffects.splice(i, 1);
      }
    }

    // Flush barrage shot queues
    for (let i = this._barrageQueues.length - 1; i >= 0; i--) {
      const q = this._barrageQueues[i];
      q.timer -= dt;
      if (q.timer <= 0 && q.shotsLeft > 0) {
        this._fireBarrageShot(q.tank);
        q.shotsLeft--;
        q.timer = BARRAGE_INTERVAL;
      }
      if (q.shotsLeft <= 0) {
        this._barrageQueues.splice(i, 1);
      }
    }
  }

  /**
   * Cancel all active effects and clear queues.
   * Call at round reset; Tank.reset() clears the flag fields independently.
   */
  reset() {
    for (const effect of this._activeEffects) {
      this._cancelEffect(effect);
    }
    this._activeEffects.length = 0;
    this._barrageQueues.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Ability implementations
  // ---------------------------------------------------------------------------

  /**
   * Inferno Burst (Flame Tank)
   *
   * 360° flame ring radiating outward from the tank hull.  Damage falls off
   * linearly: full INFERNO_BURST_DAMAGE at the tank's position, half at the
   * edge of INFERNO_BURST_RADIUS.  Friendly fire disabled.
   * @private
   */
  _infernoBurst(tank, allTanks) {
    const pos = tank.mesh.position.clone();

    // Ring-of-fire VFX: 16 bursts evenly spaced around the hull
    const STEPS = 16;
    for (let step = 0; step < STEPS; step++) {
      const angle = (step / STEPS) * Math.PI * 2;
      const offset = new THREE.Vector3(
        Math.cos(angle) * 3, 0.5, Math.sin(angle) * 3
      );
      this.particles.emitExplosion(pos.clone().add(offset), {
        count:    6,
        speed:    5,
        lifetime: 0.8,
      });
    }

    // Central burst
    this.particles.emitExplosion(pos, { count: 20, speed: 8, lifetime: 1.0 });

    // Damage all enemies in radius (linear falloff)
    let hitCount = 0;
    for (const target of allTanks) {
      if (target === tank || target.teamId === tank.teamId) continue;
      const dist = target.mesh.position.distanceTo(pos);
      if (dist <= INFERNO_BURST_RADIUS) {
        const falloff = 1 - dist / INFERNO_BURST_RADIUS;
        const dmg = Math.round(INFERNO_BURST_DAMAGE * (0.5 + 0.5 * falloff));
        target.takeDamage(dmg);
        hitCount++;
      }
    }

    console.info(`[TankAbilityEffects] infernoBurst — ${hitCount} targets hit.`);
    return true;
  }

  /**
   * Energy Shield (Shield Tank)
   *
   * Sets tank.shielded = true.  Tank.takeDamage() returns 0 while this flag is
   * set.  Clears automatically after ENERGY_SHIELD_DURATION seconds.
   * Does NOT stack: a second activation while the shield is already up fails.
   * @private
   */
  _energyShield(tank) {
    if (tank.shielded) return false;

    tank.shielded = true;

    // Blue-tinted activation burst (white particles simulate glow)
    this.particles.emitExplosion(tank.mesh.position.clone(), {
      count: 20, speed: 3, lifetime: 0.5,
    });

    this._activeEffects.push({
      type: 'energyShield',
      tank,
      timeLeft: ENERGY_SHIELD_DURATION,
    });

    console.info(`[TankAbilityEffects] energyShield active (${ENERGY_SHIELD_DURATION}s).`);
    return true;
  }

  /**
   * Rocket Jump (Jump Tank)
   *
   * Tank follows a parabolic arc peaking at ROCKET_JUMP_HEIGHT above ground.
   * Sets tank.isJumping = true so PlayerController/_driveTankTowardTarget skip
   * terrain-follow — TankAbilityEffects drives the Y position directly.
   * On landing, AoE damage is applied to all enemies within ROCKET_JUMP_SPLASH.
   * Cannot activate while already jumping or during lockdown.
   * @private
   */
  _rocketJump(tank) {
    if (tank.isJumping || tank.isLockedDown) return false;

    tank.isJumping = true;
    tank._jumpBaseY = this.terrain.getHeightAt(
      tank.mesh.position.x,
      tank.mesh.position.z
    );

    this._activeEffects.push({
      type:     'rocketJump',
      tank,
      timeLeft: ROCKET_JUMP_DURATION,
      maxTime:  ROCKET_JUMP_DURATION,
    });

    // Launch thrust burst
    this.particles.emitExplosion(tank.mesh.position.clone(), {
      count: 15, speed: 6, lifetime: 0.5,
    });

    console.info('[TankAbilityEffects] rocketJump launched.');
    return true;
  }

  /**
   * Tick rocket-jump physics for one frame.
   * h(t) = 4 * PEAK * t * (1 - t)  where t ∈ [0, 1] = lifecycle fraction.
   * @private
   */
  _tickRocketJump(effect, _dt) {
    const { tank, timeLeft, maxTime } = effect;
    const t = 1 - timeLeft / maxTime; // 0 = launch, 1 = just before land

    tank.mesh.position.y =
      tank._jumpBaseY + 4 * ROCKET_JUMP_HEIGHT * t * (1 - t);

    // Thrust dust during ascent phase
    if (t < 0.5) {
      this.particles.emitDust(tank.mesh.position.clone());
    }
  }

  /**
   * Lockdown Mode (Siege Tank)
   *
   * Prevents all hull movement for LOCKDOWN_DURATION seconds while doubling
   * the fire rate (halving seconds-per-shot).  Sets tank.isLockedDown so
   * PlayerController and AIController skip movement updates.
   * Does NOT stack.
   * @private
   */
  _lockdownMode(tank) {
    if (tank.isLockedDown) return false;

    tank.isLockedDown = true;
    tank._preLockdownFireRate = tank.fireRate;
    tank.fireRate = tank.fireRate / LOCKDOWN_FIRE_RATE_MULT; // shorter cooldown = faster fire

    this.particles.emitExplosion(tank.mesh.position.clone(), {
      count: 12, speed: 4, lifetime: 0.5,
    });

    this._activeEffects.push({
      type: 'lockdownMode',
      tank,
      timeLeft: LOCKDOWN_DURATION,
    });

    console.info(`[TankAbilityEffects] lockdownMode active (${LOCKDOWN_DURATION}s, 2× fire rate).`);
    return true;
  }

  /**
   * Barrage (Artillery)
   *
   * Fires BARRAGE_SHOTS shells in rapid succession at BARRAGE_INTERVAL second
   * intervals.  The first shell fires immediately; the rest are queued.
   * Bypasses the normal fire cooldown and does not consume the player's ammo.
   * @private
   */
  _barrage(tank) {
    this._fireBarrageShot(tank);

    this._barrageQueues.push({
      tank,
      shotsLeft: BARRAGE_SHOTS - 1,
      timer:     BARRAGE_INTERVAL,
    });

    console.info('[TankAbilityEffects] barrage — 5-shot sequence started.');
    return true;
  }

  /**
   * Fire one barrage shell, bypassing the normal fire cooldown.
   * Restores fireCooldown after so normal cadence is unaffected between shots.
   * @private
   */
  _fireBarrageShot(tank) {
    const savedCooldown = tank.fireCooldown;
    const savedAmmo     = tank.ammo;

    tank.fireCooldown = 0;
    if (tank.isPlayer) tank.ammo = Math.max(1, tank.ammo); // ensure canFire() passes

    const proj = tank.fire();
    if (proj) {
      this.projectileSystem.add(proj);
      this.particles.emitMuzzleFlash(
        proj.mesh.position.clone(),
        proj.velocity.clone().normalize()
      );
    }

    // Restore state so barrage shots don't interfere with normal firing rhythm
    tank.fireCooldown = savedCooldown;
    if (tank.isPlayer) tank.ammo = savedAmmo;
  }

  /**
   * Reactive Armor (Heavy)
   *
   * Grants REACTIVE_ARMOR_CHARGES hit-reduction charges.  For each incoming
   * hit while charges > 0, Tank.takeDamage() applies 50 % damage instead of
   * full damage and decrements the counter.  Refreshes on repeat activation.
   * @private
   */
  _reactiveArmor(tank) {
    tank.reactiveArmorCharges = REACTIVE_ARMOR_CHARGES;

    this.particles.emitExplosion(tank.mesh.position.clone(), {
      count: 10, speed: 3, lifetime: 0.4,
    });

    console.info(
      `[TankAbilityEffects] reactiveArmor — ${REACTIVE_ARMOR_CHARGES} charges.`
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Effect lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Called when a timed effect expires (timeLeft reaches 0).
   * @private
   */
  _endEffect(effect, allTanks) {
    switch (effect.type) {
      case 'energyShield':
        effect.tank.shielded = false;
        console.info('[TankAbilityEffects] energyShield expired.');
        break;

      case 'rocketJump':
        this._landRocketJump(effect.tank, allTanks);
        break;

      case 'lockdownMode':
        this._endLockdown(effect.tank);
        break;

      default:
        break;
    }
  }

  /**
   * Called on round reset to cancel any mid-flight effect without triggering
   * its normal completion logic (e.g. no AoE damage from a cancelled jump).
   * @private
   */
  _cancelEffect(effect) {
    switch (effect.type) {
      case 'energyShield':
        effect.tank.shielded = false;
        break;

      case 'rocketJump':
        effect.tank.isJumping = false;
        // Snap tank back to ground level so it doesn't float between rounds
        effect.tank.mesh.position.y = this.terrain.getHeightAt(
          effect.tank.mesh.position.x,
          effect.tank.mesh.position.z
        );
        break;

      case 'lockdownMode':
        this._endLockdown(effect.tank);
        break;

      default:
        break;
    }
  }

  /**
   * Apply rocket-jump landing: snap to terrain + AoE damage.
   * @private
   */
  _landRocketJump(tank, allTanks) {
    const landPos = tank.mesh.position.clone();
    landPos.y = this.terrain.getHeightAt(landPos.x, landPos.z);
    tank.mesh.position.y = landPos.y;
    tank.isJumping = false;

    // Large landing explosion
    this.particles.emitExplosion(landPos, {
      count: 40, speed: 12, lifetime: 1.0,
    });

    // AoE damage to enemies in splash radius (linear falloff)
    let hitCount = 0;
    for (const target of allTanks) {
      if (target === tank || target.teamId === tank.teamId) continue;
      const dist = target.mesh.position.distanceTo(landPos);
      if (dist <= ROCKET_JUMP_SPLASH) {
        const falloff = 1 - dist / ROCKET_JUMP_SPLASH;
        const dmg = Math.round(ROCKET_JUMP_DAMAGE * (0.4 + 0.6 * falloff));
        target.takeDamage(dmg);
        hitCount++;
      }
    }

    console.info(`[TankAbilityEffects] rocketJump landed — ${hitCount} targets hit.`);
  }

  /**
   * Restore fireRate when Lockdown Mode expires or is cancelled.
   * @private
   */
  _endLockdown(tank) {
    tank.isLockedDown = false;
    if (tank._preLockdownFireRate !== undefined) {
      tank.fireRate = tank._preLockdownFireRate;
      delete tank._preLockdownFireRate;
    }
    console.info('[TankAbilityEffects] lockdownMode expired.');
  }
}
