import * as THREE from 'three';
import { Terrain } from '../entities/Terrain.js';
import { Soldier } from '../entities/Soldier.js';
import { InputSystem } from '../systems/InputSystem.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { TreeSystem } from '../systems/TreeSystem.js';
import { WreckSystem } from '../systems/WreckSystem.js';
import { HUD } from '../ui/HUD.js';
import { KillFeed } from '../ui/KillFeed.js';
import { MatchOverlay } from '../ui/MatchOverlay.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { LoadoutScreen } from '../ui/LoadoutScreen.js';
import { ShopMenu } from '../ui/ShopMenu.js';
import { CameraController } from '../systems/CameraController.js';
import { TeamManager } from './TeamManager.js';
import { PlayerController } from './PlayerController.js';
import { AIController } from '../systems/AIController.js';
import { MatchManager } from './MatchManager.js';
import { StatsTracker } from '../systems/StatsTracker.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { LeagueSystem } from '../systems/LeagueSystem.js';
import { LeagueDisplay } from '../ui/LeagueDisplay.js';
import { getLeagueDef } from '../data/LeagueDefs.js';
import { AbilitySystem } from '../systems/AbilitySystem.js';
import { getTankDef } from '../data/TankDefs.js';
import { GunDefs, MeleeDefs } from '../data/WeaponDefs.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.score = 0;
    this.isRunning = false;

    /** @type {{tank: string, gun: string, melee: string}|null} */
    this.currentLoadout = null;

    this._initRenderer();
    this._initScene();
    this._initSystems();

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 80, 200);

    // Lighting
    const ambient = new THREE.AmbientLight(0x6688cc, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

    // Terrain (rocks only — trees managed by TreeSystem)
    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);

    // TeamManager creates all 12 tanks and places them on the field.
    // this.player is a convenience alias to teams[0].slots[0].tank.
    this.teams = new TeamManager(this.scene, this.terrain);
    this.player = this.teams.player;

    // PlayerController manages tank vs. on-foot soldier mode for the human player.
    // It exposes a `mesh` getter so CameraController always follows the active entity.
    this.playerController = new PlayerController({
      tank:    this.player,
      scene:   this.scene,
      terrain: this.terrain,
    });

    // t029 — Register / unregister the player's soldier with TeamManager so the
    // round-end check waits for the soldier before declaring the team eliminated.
    // onSoldierSpawned fires from _spawnSoldierAt() (both voluntary exit and bail-out).
    // onSoldierReentered fires from tryEnterTank() before the soldier is removed.
    this.playerController
      .onSoldierSpawned((soldier) => {
        this.teams.registerSoldier(soldier, 0);
      })
      .onSoldierReentered((soldier) => {
        this.teams.unregisterSoldier(soldier);
      });
  }

  _initSystems() {
    this.input = new InputSystem(this.canvas);
    // CameraController uses target.mesh; PlayerController exposes that getter
    // so the camera follows whichever entity the player is currently controlling.
    this.cameraController = new CameraController(this.camera, this.playerController);
    this.projectiles = new ProjectileSystem(this.scene);
    this.particles = new ParticleSystem(this.scene);
    // TreeSystem spawns tree entities with HP; CollisionSystem handles shell hits
    this.trees = new TreeSystem(this.scene, this.terrain);
    // WreckSystem — demolished tanks become cover props on the field.
    // spawnInitial places pre-placed wreck props at map start (t051); these
    // persist across round resets.  Dynamic wrecks (from kills) are added via
    // add() and cleared between rounds.
    this.wrecks = new WreckSystem(this.scene);
    this.wrecks.spawnInitial(this.terrain);

    // Dust-emission timers
    this._playerDustTimer = 0;
    this._enemyDustTimer = 0;

    /**
     * CollisionSystem compatibility adapter.
     * CollisionSystem expects enemies.active (Tank[]) and enemies.remove(j).
     * We delegate to TeamManager so kills are tracked correctly.
     */
    const teams = this.teams;
    this._enemiesAdapter = {
      get active() { return teams.getEnemyTanks(); },
      remove: (j) => {
        const living = teams.getEnemyTanks();
        if (living[j]) {
          teams.killTank(living[j]);
        }
      },
    };

    this.collision = new CollisionSystem({
      terrain: this.terrain,
      player: this.player,
      enemies: this._enemiesAdapter,
      projectiles: this.projectiles,
      treeSystem: this.trees,
      wrecks: this.wrecks,
    });

    this.collision
      .onScoreAdd(pts => { this.score += pts; })
      .onPlayerDeath(() => this._onPlayerTankDestroyed())
      .onHit((pos) => {
        this.particles.emitExplosion(pos, { count: 15, speed: 6, lifetime: 0.6 });
      })
      .onKill((pos, owner, tankData) => {
        this.particles.emitExplosion(pos, { count: 35, speed: 10 });
        // Leave a wreck at the tank's last position as indestructible cover
        if (tankData) {
          this.wrecks.add(tankData.position, tankData.rotationY);
        }
      })
      .onTreeHit((pos) => {
        // Small impact burst to show the tree was hit
        this.particles.emitExplosion(pos, { count: 8, speed: 4, lifetime: 0.4 });
      })
      .onTreeDestroy((pos) => {
        // Full debris burst when tree is felled
        this.particles.emitTreeDebris(pos);
      })
      .onDamageDealt((tank, amount) => {
        this.stats.recordPlayerDamage(tank, amount);
      })
      .onTankKilled((tank, byPlayer) => {
        this.stats.recordTankKilled(tank, byPlayer);
        // Bail the destroyed enemy tank's crew as an AI soldier (t028).
        // The bail is captured BEFORE enemies.remove() strips the mesh, so
        // tank.mesh.position is still valid here.
        this._bailAITankAsSoldier(
          tank.mesh.position.clone(),
          tank.mesh.rotation.y,
          1  // team 1 — only enemy tanks feed CollisionSystem's enemies adapter
        );
      })
      .onKillFeed((killer, victim) => {
        this.killFeed.addMessage(killer, victim);
      })
      .onExplosion((pos, splashRadius) => {
        // Explosive weapons produce a larger, multi-burst particle effect. (t032)
        // Particle count scales with splash radius so bigger weapons feel bigger.
        const count = Math.round(25 + splashRadius * 3);
        this.particles.emitExplosion(pos, { count, speed: 10, lifetime: 1.0 });
      });

    // SaveSystem: load persisted player profile from localStorage (t015).
    // Must initialise before EconomySystem so we can seed the correct balance.
    this.save = new SaveSystem();
    this.save.load();

    // LeagueSystem: tracks LP and current league in memory (t020).
    // Seeded from the saved profile so progression carries over between sessions.
    const savedProfile = this.save.getProfile();
    this.league = new LeagueSystem({
      leagueId: savedProfile.leagueId,
      lp: savedProfile.leaguePoints,
    });

    // LeagueDisplay: badge + LP bar overlay shown at match end (t023).
    this.leagueDisplay = new LeagueDisplay();
    this.leagueDisplay.update(this.league.leagueId, this.league.lp);

    // StatsTracker: per-round damage dealt, kills, assists, survival (t010)
    this.stats = new StatsTracker();
    this.stats.startRound();

    // EconomySystem: persistent money balance + match reward calculation (t014).
    // Seeded from the saved profile so balance carries over between sessions.
    this.economy = new EconomySystem({ startingBalance: this.save.getProfile().money });

    // MatchManager drives the best-of-3 state machine.
    // It registers its own onTeamEliminated hook with TeamManager internally.
    this.match = new MatchManager(this.teams);
    this.match
      .onRoundStart(() => {
        // Begin a fresh round of stat accumulation.
        this.stats.startRound();
      })
      .onRoundEnd((roundWinnerId) => {
        // Finalise stats while team alive-state still reflects the round outcome.
        // The player "survived" if their tank slot is still alive OR they are
        // actively on foot as a soldier (t029: tank slot is now properly killed
        // on tank destruction, so a live soldier counts as survival too).
        const playerTankAlive   = this.teams.teams[0].slots[0].alive;
        const playerSoldierAlive = this.playerController.mode === 'soldier' &&
                                   this.playerController.soldier !== null;
        const playerAlive = playerTankAlive || playerSoldierAlive;
        const result = this.stats.endRound(playerAlive);
        console.info(
          `[StatsTracker] Round ${this.match.roundNumber} ended — ` +
          `player ${playerAlive ? 'survived' : 'destroyed'}. ` +
          `Damage: ${result.damageDealt}, K: ${result.kills}, A: ${result.assists}`
        );
      })
      .onRoundReset(() => {
        // Clear mid-round objects between rounds.
        this.projectiles.reset();
        this.particles.reset();
        this.wrecks.reset();
        // Respawn the destructible tree set so the field is full again next round.
        this.trees.reset();
        // Clear per-tank AI reaction timers so enemies don't carry over mid-fire
        // state from the previous round.
        this.aiController.reset();
        // Reset PlayerController to tank mode (removes any active soldier mesh).
        this.playerController.reset();
        // Reset ability cooldowns so both slots are ready at round start (t042).
        this.abilitySystem.reset();
        this._playerDustTimer = 0;
        this._enemyDustTimer = 0;
      })
      .onMatchEnd((winnerId) => {
        const playerWon = winnerId === 0;
        const matchStats = this.stats.getMatchStats();
        console.info(
          `[Game] Match over — ${playerWon ? 'Player' : 'Enemy'} team wins! ` +
          `Match totals — Damage: ${matchStats.totals.damageDealt}, ` +
          `K: ${matchStats.totals.kills}, A: ${matchStats.totals.assists}, ` +
          `Rounds survived: ${matchStats.totals.roundsSurvived}`
        );

        // Calculate and award match rewards via EconomySystem (t014).
        const { breakdowns, grandTotal } = this.economy.calculateFullMatchRewards({
          matchStats,
          roundWins: [...this.match.roundWins],
          wonMatch: playerWon,
        });
        breakdowns.forEach(bd => this.economy.earnReward(bd));
        console.info(
          `[EconomySystem] Match rewards awarded: $${grandTotal}. ` +
          `New balance: $${this.economy.balance}`
        );

        // Apply LP change based on match score (t020/t023).
        // roundWins = [team0Wins, team1Wins]; team 0 = player.
        const [pw, ew] = this.match.roundWins;
        const leagueResult = this.league.applyMatchResult({ playerWins: pw, enemyWins: ew });
        this.save.updateLeague(this.league.leagueId, this.league.lp);

        // Persist updated balance to localStorage via SaveSystem (t015).
        this.save.updateMoney(this.economy.balance);
        this.save.save();

        // Show league display and animate the LP change (t023).
        this.leagueDisplay.show();
        // Brief delay lets the MATCH_END overlay render first.
        setTimeout(() => this.leagueDisplay.animateChange(leagueResult), 600);
      });

    // Resolve the player's current league def from the save profile.
    // Falls back to 'bronze' if the stored id is invalid (e.g. corrupt save).
    const profileLeagueId = this.save.getProfile().leagueId || 'bronze';
    let currentLeagueDef;
    try {
      currentLeagueDef = getLeagueDef(profileLeagueId);
    } catch (_) {
      currentLeagueDef = getLeagueDef('bronze');
    }

    // AIController drives all 10 AI tanks (team 0 slots 1-5 as allies, team 1 all 6 as enemies).
    // Passes the league def so enemy AI uses the correct difficulty multipliers.
    this.aiController = new AIController(
      this.teams,
      this.projectiles,
      this.particles,
      this.terrain,
      currentLeagueDef
    );

    // Apply HP and damage multipliers to the enemy team (team 1) based on league.
    // Ally team (team 0, starting at slot 1) is NOT HP/damage scaled — only enemies scale.
    // applyLeagueScalingToTeam() must be called once here; values persist through
    // round resets because Tank.reset() restores health to the (already-scaled) maxHealth.
    this.aiController.applyLeagueScalingToTeam(1, 0);

    // AbilitySystem: cooldown-based Q-key ability framework (t042).
    // Slots are configured from the player's loadout when a match starts.
    this.abilitySystem = new AbilitySystem();

    this.hud = new HUD();
    this.killFeed = new KillFeed();
    this.scoreboard = new Scoreboard(this.teams);

    // MatchOverlay binds to DOM overlays in index.html.
    this.matchOverlay = new MatchOverlay(this);
    this.match.onUIUpdate(ui => this.matchOverlay.update(ui));

    // LoadoutScreen (t018): pre-match tank + weapon selection.
    // Uses SaveSystem for owned items and equipped loadout persistence.
    this.loadoutScreen = new LoadoutScreen(this.save);

    // ShopMenu (t022): between-match shop with 4 tabs + league gating.
    // Passes LeagueSystem so the shop can lock items by league and enforce upgrade tier caps.
    this.shopMenu = new ShopMenu(this.save, this.economy, this.league);
    this.shopMenu.onClose(() => {
      // When the player closes the shop, show the loadout screen for the next match.
      this.isRunning = false;
    });
  }

  /**
   * Show the LoadoutScreen, then begin the game loop once the player deploys.
   * Call this on fresh game start.
   */
  start() {
    this.loadoutScreen.show((selection) => {
      this.currentLoadout = selection;
      // Persist the selection so it survives a page reload.
      this.save.setLoadout(selection.tank, selection.gun, selection.melee);
      this.save.save();
      console.info(
        `[Game] Loadout selected — tank:${selection.tank} ` +
        `gun:${selection.gun} melee:${selection.melee}`
      );
      // Apply selected tank class stats to the player tank (t037).
      // applyClass re-reads TankDefs[selection.tank] so HP, speed, armor, etc.
      // all reflect the chosen class before the first round starts.
      this.player.applyClass(selection.tank);
      // Apply on-foot gun and melee selections so soldiers spawn with chosen weapons (t031/t034).
      this.playerController.soldierGunId   = selection.gun;
      this.playerController.soldierMeleeId = selection.melee;
      // Configure AbilitySystem slots from the chosen loadout (t042).
      this._applyLoadoutToAbilitySystem(selection);
      this._startImmediately();
    });
  }

  /** @private Start the render loop without showing the loadout screen. */
  _startImmediately() {
    this.isRunning = true;
    this.clock.start();
    this._loop();
  }

  _loop() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // MatchManager drives PRE_ROUND countdowns and ROUND_END timers.
    // Must run every frame regardless of combat state.
    this.match.update(dt);

    // Snapshot input once per frame — getState() resets one-shot flags (fire).
    const input = this.input.getState();

    // Gate all combat logic on an active round.
    if (this.match.isActive()) {
      // Player input — PlayerController delegates to tank or soldier depending on mode.
      this._updatePlayer(input, dt);

      // Check for soldier taking enemy projectile damage (when player is on foot).
      if (this.playerController.mode === 'soldier' && this.playerController.soldier) {
        this._checkSoldierHit();
      }

      // AIController: drives all ally (team 0, slots 1-5) and enemy AI tanks
      this.aiController.update(dt);

      // AI soldier behavior (t028): bailed enemy crew advance, take cover, shoot
      const playerSoldier = this.playerController.mode === 'soldier'
        ? this.playerController.soldier
        : null;
      this.aiController.updateSoldiers(dt, this._getCoverPositions(), playerSoldier);

      // Check AI soldier hits from player projectiles (t028)
      this._checkAISoldierHits();

      // Clean up AI soldiers whose HP reached 0 this frame
      this._cleanupDeadAISoldiers();

      // Update each alive tank's fire cooldown
      for (const tank of this.teams.getAllLivingTanks()) {
        tank.update(dt);
      }

      // Collision and projectile systems
      this.projectiles.update(dt);
      this.collision.update();

      // Dust trails for living enemy tanks
      this._enemyDustTimer -= dt;
      if (this._enemyDustTimer <= 0) {
        this._enemyDustTimer = 0.15;
        for (const tank of this.teams.getEnemyTanks()) {
          this.particles.emitDust(tank.mesh.position);
        }
      }

      // AbilitySystem: advance cooldown timers (t042).
      this.abilitySystem.update(dt);

      // StatsTracker: advance survival timer only during active round
      this.stats.update(dt);
    }

    // Particles and camera update every frame (explosions fade out during overlays).
    this.particles.update(dt);
    this.cameraController.update(dt);

    // HUD — pass live round stats for the counters.
    // Use playerController so values reflect the active entity (tank or soldier).
    // maxHealth is passed so the bar fills to 100 % at full soldier HP (30), not 30 %.
    const roundStats = this.stats.getCurrentRoundStats();
    this.hud.update({
      score:             this.score,
      health:            this.playerController.health,
      maxHealth:         this.playerController.maxHealth,
      ammo:              this.playerController.ammo,
      stats:             roundStats,
      // Weapon slot display (t034): only relevant in soldier mode.
      soldierMode:       this.playerController.mode === 'soldier',
      activeWeaponSlot:  this.playerController.activeWeaponSlot,
      soldierGunId:      this.playerController.soldierGunId,
      soldierMeleeId:    this.playerController.soldierMeleeId,
    });

    // Scoreboard: show when Tab is held
    this.scoreboard.update(input.tabHeld);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Delegate player input to PlayerController, which handles movement,
   * mode switching (E key), and firing for whichever entity is active.
   *
   * @param {ReturnType<import('../systems/InputSystem.js').InputSystem['getState']>} input
   * @param {number} dt
   */
  _updatePlayer(input, dt) {
    const { newProjectiles, isMoving } = this.playerController.update(input, dt);

    // Emit muzzle flash once per shot (using the first projectile for position/direction).
    // Shotgun fires 8 pellets simultaneously — a single flash for the burst is correct.
    if (newProjectiles.length > 0) {
      const first = newProjectiles[0];
      this.particles.emitMuzzleFlash(
        first.mesh.position.clone(),
        first.velocity.clone().normalize()
      );
      for (const proj of newProjectiles) {
        this.projectiles.add(proj);
      }
    }

    // ---- On-foot soldier melee (t026/t034) ----
    // Melee swings are triggered by:
    //   a) F key / middle-click (input.melee) — always swings regardless of active slot.
    //   b) Fire button (input.fire) when the melee slot is active (activeWeaponSlot === 'melee').
    // Case (b): PlayerController._updateSoldierMode suppresses gun fire in melee slot,
    // but hit detection needs the full target list so it is resolved here in Game.js.
    const activeSoldier = this.playerController.soldier;
    const meleeSlotFire = this.playerController.mode === 'soldier' &&
      this.playerController.activeWeaponSlot === 'melee' &&
      input.fire;
    if (activeSoldier && (input.melee || meleeSlotFire)) {
      // Melee targets: living enemy tanks + living AI enemy soldiers (t028)
      const aiSoldiers = this.aiController.getActiveSoldiers()
        .filter(s => s.teamId === 1 && s.health > 0);
      const meleeTargets = [...this.teams.getEnemyTanks(), ...aiSoldiers];
      const hits = activeSoldier.melee(meleeTargets);
      this._processMeleeHits(activeSoldier, hits);
    }

    // ---- Melee weapon ability — Dash Strike (t033) ----
    // Q key activates the equipped melee weapon's special ability.
    if (activeSoldier && input.ability && activeSoldier.canActivateMeleeAbility()) {
      // Include AI soldiers as ability targets (same set as regular melee).
      const aiSoldiersAbility = this.aiController.getActiveSoldiers()
        .filter(s => s.teamId === 1 && s.health > 0);
      const abilityTargets = [...this.teams.getEnemyTanks(), ...aiSoldiersAbility];
      const abilityHits = activeSoldier.activateMeleeAbility(abilityTargets);

      // Snap the soldier's Y to terrain after the lunge repositions them.
      const soldierPos = activeSoldier.mesh.position;
      soldierPos.y = this.terrain.getHeightAt(soldierPos.x, soldierPos.z);

      this._processMeleeHits(activeSoldier, abilityHits);

      // Particle burst at landing position to signal the ability fired.
      if (abilityHits.length === 0) {
        this.particles.emitExplosion(soldierPos.clone(), { count: 12, speed: 6, lifetime: 0.4 });
      }
    }

    // ---- Ability activation — Q key (t042) ----
    // Tank mode  → try tank ability slot.
    // Soldier mode → try weapon ability slot.
    // Actual gameplay effects are implemented by t043 (tank) and t044 (weapon);
    // for now the activation is logged so the framework is verifiable end-to-end.
    if (input.ability) {
      if (this.playerController.mode === 'tank') {
        const activated = this.abilitySystem.tryActivateTankAbility();
        if (activated) {
          // Placeholder VFX: emit a burst at the tank's position.
          // t043 will replace this with the real ability effect.
          this.particles.emitExplosion(
            this.player.mesh.position.clone(),
            { count: 20, speed: 8, lifetime: 0.8 }
          );
        }
      } else if (this.playerController.soldier) {
        const activated = this.abilitySystem.tryActivateWeaponAbility();
        if (activated) {
          // Placeholder VFX: emit a burst at the soldier's position.
          // t044 will replace this with the real weapon ability effect.
          this.particles.emitExplosion(
            this.playerController.soldier.mesh.position.clone(),
            { count: 15, speed: 6, lifetime: 0.6 }
          );
        }
      }
    }

    // Dust trail while the active entity is moving
    this._playerDustTimer -= dt;
    if (this._playerDustTimer <= 0 && isMoving) {
      this._playerDustTimer = 0.15;
      this.particles.emitDust(this.playerController.mesh.position);
    }
  }

  // ---------------------------------------------------------------------------
  // On-foot AI helpers (t028)
  // ---------------------------------------------------------------------------

  /**
   * Spawn an AI soldier at the given world position when an AI tank is destroyed.
   * The soldier is registered with AIController and added to the scene.
   * The tank slot is already marked dead (teams.killTank was called by CollisionSystem);
   * the soldier fights on independently — its death is tracked separately.
   *
   * @param {THREE.Vector3} pos    — tank's last world position (cloned before mesh removal)
   * @param {number}        rotY   — tank's Y rotation at death
   * @param {number}        teamId — 0 = ally, 1 = enemy
   */
  _bailAITankAsSoldier(pos, rotY, teamId) {
    const y = this.terrain.getHeightAt(pos.x, pos.z);
    const soldier = new Soldier({
      isPlayer: false,
      teamId,
      name: teamId === 1 ? 'Enemy Crew' : 'Ally Crew',
    });
    soldier.mesh.position.set(pos.x, y, pos.z);
    soldier.mesh.rotation.y = rotY;
    this.scene.add(soldier.mesh);

    // Register with TeamManager BEFORE the tank slot is killed (killTank fires
    // after onTankKilled returns).  This prevents a false team-elimination signal
    // if this was the last tank: isTeamEliminated() will find the live soldier and
    // correctly defer the elimination callback until the soldier also dies (t029).
    this.teams.registerSoldier(soldier, teamId);

    this.aiController.addSoldier(soldier, teamId, this.scene);
    console.info(`[Game] AI tank destroyed — crew bailed as soldier (team ${teamId}).`);
  }

  /**
   * Build a flat list of cover obstacle positions from wrecks and living trees.
   * Passed to AIController.updateSoldiers() each frame so soldiers can seek cover.
   *
   * @returns {Array<{x: number, z: number}>}
   */
  _getCoverPositions() {
    // Wrecks (static + dynamic)
    const positions = this.wrecks.obstacles.map(o => ({ x: o.x, z: o.z }));

    // Living trees also provide cover (they can be destroyed, but until then they block)
    for (const tree of this.trees.trees) {
      if (tree.alive && tree.group) {
        positions.push({ x: tree.group.position.x, z: tree.group.position.z });
      }
    }

    return positions;
  }

  /**
   * Check whether any player-owned projectile has hit an AI soldier this frame.
   * Mirrors _checkSoldierHit() but operates on AI-controlled soldiers.
   * Hit radius is tighter than tanks to reflect the capsule silhouette.
   */
  _checkAISoldierHits() {
    const aiSoldiers = this.aiController.getActiveSoldiers();
    if (aiSoldiers.length === 0) return;

    const projectiles = this.projectiles.active;
    const HIT_RADIUS = 1.2;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.isPlayerOwned) continue; // only player bullets hit AI soldiers here

      for (let si = aiSoldiers.length - 1; si >= 0; si--) {
        const soldier = aiSoldiers[si];
        if (soldier.health <= 0) continue; // already dead this frame

        const dist = p.mesh.position.distanceTo(soldier.mesh.position);
        if (dist < HIT_RADIUS) {
          const hitPos = p.mesh.position.clone();
          const actualDamage = Math.min(p.damage, soldier.health);
          if (p.ownerTank) p.ownerTank.recordDamage(actualDamage);
          soldier.takeDamage(p.damage);
          this.projectiles.remove(i);
          this.particles.emitExplosion(hitPos, { count: 6, speed: 3, lifetime: 0.3 });

          if (soldier.health <= 0) {
            // Soldier is dead — cleanup handled in _cleanupDeadAISoldiers()
            const killerName = p.ownerTank ? (p.ownerTank.name || 'Player') : 'Player';
            this.killFeed.addMessage(killerName, soldier.name || 'Enemy Crew');
          }
          break; // projectile consumed
        }
      }
    }
  }

  /**
   * Remove any AI soldiers whose HP reached 0 this frame.
   * Called once per game-loop tick after updateSoldiers() and _checkAISoldierHits().
   * Removes mesh from scene and unregisters the soldier from AIController.
   */
  _cleanupDeadAISoldiers() {
    const aiSoldiers = this.aiController.getActiveSoldiers();
    for (let i = aiSoldiers.length - 1; i >= 0; i--) {
      const soldier = aiSoldiers[i];
      if (soldier.health <= 0) {
        const deathPos = soldier.mesh.position.clone();
        // teams.killSoldier handles mesh removal and fires the team-elimination
        // check (t029).  It must be called before aiController.removeSoldier so
        // the round-end callback fires while the soldier is still in the AIController
        // list (removeSoldier is purely internal bookkeeping).
        this.teams.killSoldier(soldier);
        this.aiController.removeSoldier(soldier);
        this.particles.emitExplosion(deathPos, { count: 10, speed: 5, lifetime: 0.5 });
        console.info('[Game] AI soldier destroyed.');
      }
    }
  }

  /**
   * Apply a batch of melee hit results: record stats, emit particles, kill targets.
   * Shared by the regular melee swing and the Dash Strike ability (t033).
   * Handles both Tank kills and Soldier kills (t028 AI soldiers).
   *
   * @param {import('../entities/Soldier.js').Soldier} attacker
   * @param {Array<{target: object, damage: number}>} hits
   * @private
   */
  _processMeleeHits(attacker, hits) {
    for (const { target, damage } of hits) {
      this.stats.recordPlayerDamage(target, damage);
      const hitPos = target.mesh.position.clone();
      if (target.health <= 0) {
        this.killFeed.addMessage(
          attacker.name || 'Player',
          target.name || 'Enemy'
        );
        if (target instanceof Soldier) {
          // Melee killed an AI soldier — use killSoldier for mesh removal and
          // round-end check; remove from AIController tracking too.
          this.teams.killSoldier(target);
          this.aiController.removeSoldier(target);
        } else {
          // Melee killed a tank.
          this.stats.recordTankKilled(target, true);
          this.teams.killTank(target);
        }
        this.particles.emitExplosion(hitPos, { count: 25, speed: 8 });
      } else {
        // Small impact burst for a non-lethal hit.
        this.particles.emitExplosion(hitPos, { count: 8, speed: 4, lifetime: 0.3 });
      }
    }
  }

  /**
   * Called by CollisionSystem when the player's tank HP reaches 0.
   *
   * If the player is still in the tank (tank mode):
   *   - Remove tank mesh, spawn wreck.
   *   - bailOut() spawns a soldier and fires onSoldierSpawned → registerSoldier.
   *   - Then killTank() marks the player slot dead; isTeamEliminated() now sees
   *     the live soldier and will NOT fire the team-eliminated callback yet.
   *
   * If the player already exited the tank voluntarily (soldier mode):
   *   - The idle tank was destroyed by enemies — remove it and spawn a wreck.
   *   - killTank() marks the player's tank slot dead.  The soldier is already
   *     registered so isTeamEliminated() still returns false while it lives.
   *   - Player continues on foot; re-entry is no longer possible.
   */
  _onPlayerTankDestroyed() {
    // Capture last-known position and rotation before removing the mesh.
    const tankPos  = this.player.mesh.position.clone();
    const tankRotY = this.player.mesh.rotation.y;

    // Remove tank mesh from the scene and leave a wreck prop in its place.
    // killTank() would also call scene.remove(); calling it first is safe
    // because Three.js scene.remove() is idempotent.
    this.scene.remove(this.player.mesh);
    this.wrecks.add(tankPos, tankRotY);

    if (this.playerController.mode === 'soldier') {
      // Player was already on foot — idle tank destroyed by enemies.
      // Update PlayerController so the re-entry prompt is hidden.
      this.playerController.notifyTankDestroyedWhileIdle();
      // Mark the tank slot dead.  The soldier is already registered with
      // TeamManager (registered when the player first exited), so
      // isTeamEliminated(0) will return false while the soldier is alive.
      this.teams.killTank(this.player);
      console.info('[Game] Idle player tank destroyed; player continues on foot.');
    } else {
      // Player was in the tank — auto-bail.
      this.stats.recordPlayerDeath();
      // bailOut() spawns a Soldier and fires onSoldierSpawned → registerSoldier().
      // Soldier must be registered BEFORE killTank() so isTeamEliminated() sees
      // the live soldier and does not fire team elimination prematurely.
      this.playerController.bailOut(tankPos);
      this.teams.killTank(this.player);
      console.info('[Game] Player tank destroyed — auto-bailed as soldier.');
    }
  }

  /**
   * Called when the player's on-foot soldier HP reaches 0.
   * Captures the soldier reference, emits death particles, clears the soldier
   * from PlayerController, then calls TeamManager.killSoldier() which handles
   * the final elimination check (t029).
   */
  _onPlayerSoldierDestroyed() {
    // Capture soldier before clearSoldier() nulls the reference.
    const soldier    = this.playerController.soldier;
    const soldierPos = soldier.mesh.position.clone();
    this.particles.emitExplosion(soldierPos, { count: 10, speed: 5, lifetime: 0.5 });
    // Remove the soldier mesh from the scene via PlayerController.
    this.playerController.clearSoldier();
    // killSoldier() marks the entry dead in TeamManager and checks whether
    // the team is now fully eliminated (all tanks + all soldiers dead).
    this.teams.killSoldier(soldier);
    console.info('[Game] Player soldier destroyed — player is out for this round.');
  }

  /**
   * Check whether any enemy projectile has hit the player's on-foot soldier.
   * Called each frame while playerController.mode === 'soldier'.
   *
   * Hit radius (1.2 units) is tighter than the tank radius (2.5 units) to
   * reflect the soldier's smaller capsule silhouette.
   */
  _checkSoldierHit() {
    const soldier = this.playerController.soldier;
    const projectiles = this.projectiles.active;
    const HIT_RADIUS = 1.2;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.isPlayerOwned) continue; // friendly bullets skip the player

      const dist = p.mesh.position.distanceTo(soldier.mesh.position);
      if (dist < HIT_RADIUS) {
        const hitPos = p.mesh.position.clone();
        const actualDamage = Math.min(p.damage, soldier.health);
        if (p.ownerTank) p.ownerTank.recordDamage(actualDamage);
        soldier.takeDamage(p.damage);
        this.projectiles.remove(i);
        this.particles.emitExplosion(hitPos, { count: 6, speed: 3, lifetime: 0.3 });

        if (soldier.health <= 0) {
          this._onPlayerSoldierDestroyed();
          break; // soldier removed; stop checking more projectiles this frame
        }
      }
    }
  }

  /**
   * Open the between-match shop (t017).
   * Called from the "Shop" button in MatchOverlay.
   * Pauses the game loop until the player closes the shop.
   */
  openShop() {
    this.isRunning = false;
    this.shopMenu.open();
  }

  /**
   * Full match restart — shows the LoadoutScreen, then resets and relaunches.
   * Called by the "Play Again" button in MatchOverlay.
   */
  restart() {
    // Hide league display overlay before returning to play.
    this.leagueDisplay.hide();
    // Pause the game loop while the loadout screen is shown.
    this.isRunning = false;

    this.loadoutScreen.show((selection) => {
      this.currentLoadout = selection;
      this.save.setLoadout(selection.tank, selection.gun, selection.melee);
      this.save.save();
      console.info(
        `[Game] Loadout updated — tank:${selection.tank} ` +
        `gun:${selection.gun} melee:${selection.melee}`
      );
      // Re-apply selected tank class stats to the player tank (t037).
      this.player.applyClass(selection.tank);
      // Apply on-foot gun and melee selections so soldiers spawn with chosen weapons (t031/t034).
      this.playerController.soldierGunId   = selection.gun;
      this.playerController.soldierMeleeId = selection.melee;
      // Reconfigure AbilitySystem for the new loadout (t042).
      this._applyLoadoutToAbilitySystem(selection);

      this.score = 0;
      // Reset match state machine first (no team events should fire during reset)
      this.match.reset();
      // Reset StatsTracker for the new match
      this.stats.reset();
      // Reset PlayerController to tank mode (clears any active soldier mesh)
      this.playerController.reset();
      // Reset field entities
      this.teams.reset();
      this.projectiles.reset();
      this.particles.reset();
      this.trees.reset();
      this.wrecks.reset();
      this._playerDustTimer = 0;
      this._enemyDustTimer = 0;
      this.hud.hideGameOver();
      this.killFeed.clear();

      this._startImmediately();
    });
  }

  /**
   * Configure AbilitySystem slots from the selected loadout (t042).
   *
   * Tank slot   — from TankDefs entry for the chosen tank class.
   * Weapon slot — from the on-foot weapon that has an ability.  Gun ability
   *               takes priority; if the gun has no ability the melee weapon
   *               is checked as a fallback (e.g. Energy Blade → dashStrike).
   *
   * @param {{ tank: string, gun: string, melee: string }} selection
   * @private
   */
  _applyLoadoutToAbilitySystem(selection) {
    const tankDef  = getTankDef(selection.tank);
    const gunDef   = GunDefs[selection.gun];
    const meleeDef = MeleeDefs[selection.melee];

    this.abilitySystem.setTankDef(tankDef);

    // Prefer gun ability; fall back to melee ability if gun has none.
    const weaponDef = (gunDef && gunDef.ability) ? gunDef : (meleeDef || gunDef);
    if (weaponDef) {
      this.abilitySystem.setWeaponDef(weaponDef);
    }

    console.info(
      `[AbilitySystem] Loadout applied — ` +
      `tank ability: ${tankDef.ability || 'none'}, ` +
      `weapon ability: ${this.abilitySystem.weaponAbilityId || 'none'}`
    );
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
