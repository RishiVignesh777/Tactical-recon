import * as THREE from 'three';
import { CombatHitEvaluation, LineOfSight } from './LineOfSight';
import { Pathfinding } from './Pathfinding';
import { sound } from './AudioSynth';
import { TacticalGrid } from '../scenes/TacticalGrid';
import { MechBuilder } from '../models/MechBuilder';
import {
  CombatLogEntry,
  CombatState,
  GridCoord,
  SelectedAction,
  TileData,
  Unit,
  UnitClass,
} from '../types';

export class CombatFSM {
  public state: CombatState = 'INIT';
  public roundNumber: number = 1;
  public units: Unit[] = [];
  public selectedUnitId: string | null = null;
  public targetUnitId: string | null = null;
  public currentAction: SelectedAction = null;
  public combatLogs: CombatLogEntry[] = [];
  public grid: TacticalGrid;
  public nodeType: string = 'skirmish';
  public terminalsHackedCount: number = 0;
  public totalTerminalsCount: number = 0;

  // Animation queue
  public isBusyAnimating: boolean = false;

  // Callbacks for UI updates
  public onStateChanged?: (state: CombatState) => void;
  public onUnitSelected?: (unit: Unit | null) => void;
  public onLogsUpdated?: (logs: CombatLogEntry[]) => void;
  public onFloatingText?: (text: string, color: string, worldPos: THREE.Vector3) => void;

  constructor(grid: TacticalGrid) {
    this.grid = grid;
  }

  public initMission(playerSquad: Unit[], nodeType: string) {
    this.nodeType = nodeType;
    this.roundNumber = 1;
    this.terminalsHackedCount = 0;
    this.totalTerminalsCount = 0;
    this.combatLogs = [];
    this.isBusyAnimating = false;

    // Reset player squad AP and positions
    const livingPlayers = playerSquad.filter((p) => !p.isDead);
    const startPositions = [
      { x: 2, z: 8 },
      { x: 3, z: 9 },
      { x: 4, z: 8 },
      { x: 5, z: 9 },
    ];

    livingPlayers.forEach((u, i) => {
      const pos = startPositions[i % startPositions.length];
      u.x = pos.x;
      u.z = pos.z;
      u.ap = u.maxAp;
      u.statusEffects = [];
      u.abilities.forEach((a) => (a.currentCooldown = 0));
    });

    // Spawn enemies based on node type
    const enemies = this.spawnEnemiesForNode(nodeType);

    this.units = [...livingPlayers, ...enemies];

    // Count terminals in grid
    for (const [, tile] of this.grid.gridTiles.entries()) {
      if (tile.type === 'terminal') {
        this.totalTerminalsCount++;
      }
    }

    // Select first living player unit
    this.selectedUnitId = livingPlayers.length > 0 ? livingPlayers[0].id : null;
    this.currentAction = null;

    this.addLog('Mission initialized. Tactical Recon squads deployed.', 'info');
    sound.playTurnStart(true);
    this.setState('PLAYER_TURN');
  }

  private spawnEnemiesForNode(nodeType: string): Unit[] {
    const enemies: Unit[] = [];

    if (nodeType === 'boss') {
      // Overseer Titan Boss + 2 Drones
      enemies.push({
        id: 'e_boss',
        name: 'Overseer Titan',
        team: 'enemy',
        unitClass: 'boss',
        x: 4,
        z: 1,
        hp: 240,
        maxHp: 240,
        shields: 80,
        maxShields: 80,
        armor: 5,
        ap: 5,
        maxAp: 5,
        moveRange: 1,
        attackRange: 6,
        attackDamage: 34,
        critChance: 25,
        isDead: false,
        level: 3,
        kills: 0,
        upgrades: [],
        statusEffects: [],
        abilities: [
          {
            id: 'orbital_barrage',
            name: 'Orbital Barrage',
            description: 'Deals 35 heavy blast damage to target area.',
            apCost: 3,
            cooldown: 2,
            currentCooldown: 0,
            range: 7,
            targetType: 'enemy',
            icon: '🚀',
          },
        ],
      });

      enemies.push(
        this.createEnemy('e_drone1', 'Corrupted Drone Alpha', 'drone', 2, 2, 45, 16, 5),
        this.createEnemy('e_drone2', 'Corrupted Drone Beta', 'drone', 7, 2, 45, 16, 5)
      );
    } else if (nodeType === 'terminal_hack') {
      // Turret + 2 Infiltrators + 1 Drone
      enemies.push(
        this.createEnemy('e_turret', 'Auto-Turret 01', 'turret', 5, 2, 80, 26, 6),
        this.createEnemy('e_infil1', 'Spectre Infiltrator', 'infiltrator', 2, 3, 60, 24, 4),
        this.createEnemy('e_drone1', 'Scout Drone', 'drone', 8, 3, 40, 15, 5)
      );
    } else if (nodeType === 'ambush') {
      // Enforcer + 2 Infiltrators
      enemies.push(
        this.createEnemy('e_enforce', 'Siege Enforcer', 'enforcer', 4, 2, 130, 30, 5),
        this.createEnemy('e_infil1', 'Spectre Infiltrator A', 'infiltrator', 1, 2, 60, 24, 4),
        this.createEnemy('e_infil2', 'Spectre Infiltrator B', 'infiltrator', 7, 2, 60, 24, 4)
      );
    } else {
      // Standard Skirmish: 1 Enforcer, 1 Turret, 1 Drone
      enemies.push(
        this.createEnemy('e_enforce', 'Mech Enforcer', 'enforcer', 5, 2, 100, 25, 4),
        this.createEnemy('e_drone1', 'Recon Drone A', 'drone', 2, 2, 45, 16, 5),
        this.createEnemy('e_drone2', 'Recon Drone B', 'drone', 8, 3, 45, 16, 5)
      );
    }

    return enemies;
  }

  private createEnemy(
    id: string,
    name: string,
    cls: UnitClass,
    x: number,
    z: number,
    hp: number,
    dmg: number,
    range: number
  ): Unit {
    return {
      id,
      name,
      team: 'enemy',
      unitClass: cls,
      x,
      z,
      hp,
      maxHp: hp,
      shields: cls === 'enforcer' ? 30 : 0,
      maxShields: cls === 'enforcer' ? 30 : 0,
      armor: cls === 'enforcer' ? 3 : cls === 'turret' ? 4 : 1,
      ap: 4,
      maxAp: 4,
      moveRange: cls === 'turret' ? 0 : 1,
      attackRange: range,
      attackDamage: dmg,
      critChance: 15,
      isDead: false,
      level: 1,
      kills: 0,
      upgrades: [],
      statusEffects: [],
      abilities: [],
    };
  }

  public setState(newState: CombatState) {
    this.state = newState;
    this.onStateChanged?.(newState);

    if (newState === 'PLAYER_TURN') {
      this.refreshActionHighlights();
    } else {
      this.grid.clearHighlights();
    }
  }

  public getSelectedUnit(): Unit | null {
    return this.units.find((u) => u.id === this.selectedUnitId) ?? null;
  }

  public selectUnit(unitId: string) {
    if (this.state !== 'PLAYER_TURN' || this.isBusyAnimating) return;

    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || unit.isDead) return;

    if (unit.team === 'player') {
      this.selectedUnitId = unit.id;
      this.currentAction = null;
      sound.playSelect();
      this.onUnitSelected?.(unit);
      this.refreshActionHighlights();
    } else {
      // Clicked enemy: target inspector
      this.targetUnitId = unit.id;
      sound.playSelect();
    }
  }

  public setAction(action: SelectedAction) {
    if (this.state !== 'PLAYER_TURN' || this.isBusyAnimating) return;

    const unit = this.getSelectedUnit();
    if (!unit || unit.ap <= 0) return;

    // If ability is self-targeted, execute immediately on the unit
    if (action === 'ABILITY_1' || action === 'ABILITY_2') {
      const abIndex = action === 'ABILITY_1' ? 0 : 1;
      const ability = unit.abilities[abIndex];
      if (ability && ability.targetType === 'self') {
        void this.executeAbilityAction(unit, ability, unit);
        return;
      }
    }

    this.currentAction = action;
    sound.playSelect();
    this.refreshActionHighlights();
  }

  public refreshActionHighlights() {
    this.grid.clearHighlights();
    const unit = this.getSelectedUnit();
    if (!unit || this.state !== 'PLAYER_TURN') return;

    if (this.currentAction === 'MOVE') {
      const reachable = Pathfinding.getReachableTiles(
        { x: unit.x, z: unit.z },
        unit.ap,
        unit.moveRange,
        this.grid.gridTiles,
        this.units,
        unit.id
      );
      this.grid.highlightMovementRange(reachable);
    } else if (this.currentAction === 'ATTACK') {
      const enemies = this.units.filter((u) => u.team === 'enemy' && !u.isDead);
      this.grid.highlightAttackRange({ x: unit.x, z: unit.z }, unit.attackRange, enemies);
    } else if (this.currentAction === 'ABILITY_1' || this.currentAction === 'ABILITY_2') {
      const abIndex = this.currentAction === 'ABILITY_1' ? 0 : 1;
      const ability = unit.abilities[abIndex];
      if (ability) {
        if (ability.targetType === 'enemy') {
          const enemies = this.units.filter((u) => u.team === 'enemy' && !u.isDead);
          this.grid.highlightAttackRange({ x: unit.x, z: unit.z }, ability.range, enemies);
        } else if (ability.targetType === 'ally') {
          const allies = this.units.filter((u) => u.team === 'player' && !u.isDead);
          this.grid.highlightAttackRange({ x: unit.x, z: unit.z }, ability.range, allies);
        }
      }
    }
  }

  /**
   * Handles user interaction clicking on a grid coordinate.
   */
  public async handleTileClick(coord: GridCoord) {
    if (this.state !== 'PLAYER_TURN' || this.isBusyAnimating) return;

    const unit = this.getSelectedUnit();
    if (!unit) return;

    // Check if clicked tile contains a unit
    const clickedUnit = this.units.find(
      (u) => !u.isDead && u.x === coord.x && u.z === coord.z
    );

    if (clickedUnit) {
      if (clickedUnit.team === 'player') {
        // Switch active unit
        this.selectUnit(clickedUnit.id);
        return;
      }
    }

    // Process action based on current mode
    if (this.currentAction === 'MOVE') {
      await this.executeMoveAction(unit, coord);
    } else if (this.currentAction === 'ATTACK' && clickedUnit && clickedUnit.team === 'enemy') {
      await this.executeAttackAction(unit, clickedUnit);
    } else if (
      (this.currentAction === 'ABILITY_1' || this.currentAction === 'ABILITY_2') &&
      clickedUnit
    ) {
      const abIndex = this.currentAction === 'ABILITY_1' ? 0 : 1;
      await this.executeAbilityAction(unit, unit.abilities[abIndex], clickedUnit);
    }
  }

  /**
   * Moves a unit along the computed A* path with smooth interpolation.
   */
  public async executeMoveAction(unit: Unit, dest: GridCoord) {
    const reachable = Pathfinding.getReachableTiles(
      { x: unit.x, z: unit.z },
      unit.ap,
      unit.moveRange,
      this.grid.gridTiles,
      this.units,
      unit.id
    );

    const targetInfo = reachable.get(`${dest.x},${dest.z}`);
    if (!targetInfo) return; // Unreachable or insufficient AP

    this.isBusyAnimating = true;
    this.setState('ACTION_ANIMATING');

    const path = targetInfo.path;
    unit.ap -= targetInfo.apCost;

    // Smoothly animate unit mesh along path points
    for (let i = 1; i < path.length; i++) {
      const nextStep = path[i];
      sound.playMove();
      await this.animateUnitStep(unit, nextStep);
      unit.x = nextStep.x;
      unit.z = nextStep.z;

      // Check hazard damage on hazard tiles
      const tile = this.grid.gridTiles.get(`${nextStep.x},${nextStep.z}`);
      if (tile && tile.type === 'hazard') {
        this.applyDamage(unit, 12, 'hazard');
        this.addLog(`${unit.name} triggered plasma hazard! (-12 HP)`, 'warn');
      }

      // Check enemy overwatch triggers
      const triggeredOverwatch = this.checkOverwatchTriggers(unit);
      if (triggeredOverwatch) {
        break; // Interrupted by overwatch fire!
      }
    }

    this.isBusyAnimating = false;
    this.currentAction = null;
    this.setState('PLAYER_TURN');
    this.refreshActionHighlights();
    this.onUnitSelected?.(unit);
  }

  private animateUnitStep(unit: Unit, targetCoord: GridCoord): Promise<void> {
    return new Promise((resolve) => {
      if (!unit.mesh) {
        resolve();
        return;
      }

      const startPos = unit.mesh.position.clone();
      const targetTile = this.grid.gridTiles.get(`${targetCoord.x},${targetCoord.z}`);
      const h = targetTile ? targetTile.height : 0;
      const endPos = new THREE.Vector3(targetCoord.x, h, targetCoord.z);

      // Face direction of movement
      unit.mesh.lookAt(endPos.x, unit.mesh.position.y, endPos.z);

      const duration = 200; // ms
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        // Ease-out
        const t = 1 - Math.pow(1 - progress, 2);

        unit.mesh!.position.lerpVectors(startPos, endPos, t);
        // Subtle bounce
        unit.mesh!.position.y = h + Math.sin(progress * Math.PI) * 0.1;

        if (progress < 1.0) {
          requestAnimationFrame(animate);
        } else {
          unit.mesh!.position.copy(endPos);
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * Executes a primary attack against an enemy.
   */
  public async executeAttackAction(attacker: Unit, target: Unit) {
    if (attacker.ap < 2) {
      this.addLog('Insufficient AP for attack (Requires 2 AP)', 'warn');
      return;
    }

    const dist = Math.hypot(target.x - attacker.x, target.z - attacker.z);
    if (dist > attacker.attackRange) {
      this.addLog('Target is out of weapon range', 'warn');
      return;
    }

    attacker.ap -= 2;
    this.isBusyAnimating = true;
    this.setState('ACTION_ANIMATING');

    // Face target
    attacker.mesh?.lookAt(target.x, attacker.mesh.position.y, target.z);

    // Evaluate combat
    const evalResult = LineOfSight.evaluateCombat(attacker, target, this.grid.gridTiles);

    if (!evalResult.hasLineOfSight) {
      this.addLog(`Line of sight to ${target.name} is blocked by heavy cover!`, 'warn');
      this.isBusyAnimating = false;
      this.setState('PLAYER_TURN');
      return;
    }

    // Play weapon sound & spawn laser beam
    const fromPos = attacker.mesh?.position.clone().add(new THREE.Vector3(0, 0.45, 0)) ?? new THREE.Vector3(attacker.x, 0.5, attacker.z);
    const toPos = target.mesh?.position.clone().add(new THREE.Vector3(0, 0.45, 0)) ?? new THREE.Vector3(target.x, 0.5, target.z);

    if (attacker.unitClass === 'sniper') {
      sound.playRailgun();
      this.grid.spawnLaserBeam(fromPos, toPos, 0x00f0ff, 0.35);
    } else {
      sound.playLaser();
      this.grid.spawnLaserBeam(fromPos, toPos, attacker.team === 'player' ? 0x00f0ff : 0xff3366, 0.2);
    }

    await new Promise((r) => setTimeout(r, 220));

    // Roll hit
    const roll = Math.random() * 100;
    if (roll <= evalResult.hitChance) {
      // Hit! Roll crit
      const isCrit = Math.random() * 100 <= evalResult.critChance;
      let damage = evalResult.baseDamage;
      if (isCrit) damage = Math.round(damage * 1.6);

      // Cover mitigation
      damage = Math.round(damage * (1 - evalResult.coverDamageReduction));

      // Armor reduction
      damage = Math.max(4, damage - target.armor);

      this.applyDamage(target, damage, 'attack');
      this.grid.spawnImpactBurst(toPos, isCrit ? 0xffaa00 : 0x00f0ff);

      const logMsg = `${attacker.name} attacked ${target.name} for ${damage} DMG! ${
        isCrit ? '★ CRITICAL HIT!' : ''
      } ${evalResult.coverType !== 'none' ? `[Cover Reduced: ${evalResult.coverType.toUpperCase()}]` : ''}`;
      this.addLog(logMsg, 'damage');

      if (this.onFloatingText) {
        this.onFloatingText(
          `${isCrit ? 'CRIT! ' : ''}-${damage}`,
          isCrit ? '#ffaa00' : '#ff3366',
          toPos
        );
      }
    } else {
      // Missed / Deflected
      sound.playShield();
      this.addLog(`${attacker.name}'s shot missed ${target.name}! (${evalResult.hitChance}% chance)`, 'warn');
      if (this.onFloatingText) {
        this.onFloatingText('MISS / DEFLECTED', '#94a3b8', toPos);
      }
    }

    this.isBusyAnimating = false;
    this.currentAction = null;
    this.checkVictoryOrDefeat();

    if (this.state === 'ACTION_ANIMATING') {
      this.setState('PLAYER_TURN');
      this.refreshActionHighlights();
      this.onUnitSelected?.(attacker);
    }
  }

  /**
   * Applies damage to a unit (depleting shields first, then health).
   */
  public applyDamage(unit: Unit, amount: number, source: string) {
    if (unit.isDead) return;

    if (unit.shields > 0) {
      const absorbed = Math.min(unit.shields, amount);
      unit.shields -= absorbed;
      amount -= absorbed;
      sound.playShield();
      if (absorbed > 0) {
        this.addLog(`${unit.name}'s shield absorbed ${absorbed} damage.`, 'shield');
      }
    }

    if (amount > 0) {
      unit.hp -= amount;
      sound.playExplosion();
    }

    MechBuilder.updateVitals(unit);

    if (unit.hp <= 0) {
      unit.hp = 0;
      unit.isDead = true;
      this.addLog(`${unit.name} was destroyed!`, 'damage');
      if (unit.mesh) {
        // Dramatic death collapse
        unit.mesh.rotation.x = Math.PI / 2;
        unit.mesh.position.y = 0.05;
      }
      this.checkVictoryOrDefeat();
    }
  }

  /**
   * Executes a class ability.
   */
  public async executeAbilityAction(user: Unit, ability: any, target: Unit) {
    if (!ability || user.ap < ability.apCost) {
      this.addLog(`Insufficient AP for ${ability.name}`, 'warn');
      return;
    }

    user.ap -= ability.apCost;
    ability.currentCooldown = ability.cooldown;
    this.isBusyAnimating = true;
    this.setState('ACTION_ANIMATING');

    const toPos = target.mesh?.position.clone().add(new THREE.Vector3(0, 0.45, 0)) ?? new THREE.Vector3(target.x, 0.5, target.z);

    if (ability.id === 'shield_fortress') {
      // Vanguard Fortress
      sound.playShield();
      user.shields = Math.min(user.maxShields, user.shields + 35);
      user.statusEffects.push({ name: 'Shield Fortress', duration: 1, effectType: 'shielded' });
      MechBuilder.updateVitals(user);
      this.addLog(`${user.name} activated Shield Fortress! (+35 Shields)`, 'shield');
      if (this.onFloatingText) this.onFloatingText('+35 SHIELD', '#00f0ff', toPos);
    } else if (ability.id === 'seismic_slam') {
      // Vanguard Slam
      sound.playExplosion();
      this.applyDamage(target, 26, 'ability');
      target.ap = Math.max(0, target.ap - 1);
      this.addLog(`${user.name} used Seismic Slam on ${target.name}! (-26 HP, -1 AP)`, 'damage');
      if (this.onFloatingText) this.onFloatingText('-26 SLAM!', '#ffaa00', toPos);
    } else if (ability.id === 'nanite_heal') {
      // Medic Heal
      sound.playHeal();
      target.hp = Math.min(target.maxHp, target.hp + 45);
      target.statusEffects = target.statusEffects.filter((s) => s.effectType !== 'hazard_burn');
      MechBuilder.updateVitals(target);
      this.addLog(`${user.name} deployed Nanite Spray on ${target.name}! (+45 HP)`, 'heal');
      if (this.onFloatingText) this.onFloatingText('+45 HP', '#00ff88', toPos);
    } else if (ability.id === 'emp_overload') {
      // Hacker EMP
      sound.playHack();
      target.shields = Math.max(0, target.shields - 30);
      target.statusEffects.push({ name: 'EMP Stun', duration: 1, effectType: 'stunned' });
      target.ap = 0;
      MechBuilder.updateVitals(target);
      this.addLog(`${user.name} overloaded ${target.name}'s systems! (-30 Shields, STUNNED)`, 'hack');
      if (this.onFloatingText) this.onFloatingText('EMP STUNNED!', '#ffaa00', toPos);
    } else if (ability.id === 'cyber_boost') {
      // Hacker Overdrive
      sound.playHack();
      target.ap += 2;
      target.statusEffects.push({ name: 'Overdrive', duration: 1, effectType: 'boosted' });
      this.addLog(`${user.name} overclocks ${target.name} with Combat Overdrive! (+2 AP)`, 'hack');
      if (this.onFloatingText) this.onFloatingText('+2 AP BOOST', '#00f0ff', toPos);
    } else if (ability.id === 'deadeye_shot') {
      // Sniper Deadeye
      sound.playRailgun();
      const dmg = Math.round(user.attackDamage * 1.5);
      this.applyDamage(target, dmg, 'ability');
      this.addLog(`${user.name} fired Deadeye Protocol at ${target.name}! (${dmg} DMG)`, 'damage');
      if (this.onFloatingText) this.onFloatingText(`DEADEYE! -${dmg}`, '#00f0ff', toPos);
    } else if (ability.id === 'overwatch') {
      // Sniper Overwatch
      sound.playSelect();
      user.statusEffects.push({ name: 'Overwatch', duration: 1, effectType: 'overwatch' });
      this.addLog(`${user.name} set up an Overwatch Matrix.`, 'info');
      if (this.onFloatingText) this.onFloatingText('OVERWATCH READY', '#00f0ff', toPos);
    }

    await new Promise((r) => setTimeout(r, 400));
    this.isBusyAnimating = false;
    this.currentAction = null;
    this.checkVictoryOrDefeat();

    if (this.state === 'ACTION_ANIMATING') {
      this.setState('PLAYER_TURN');
      this.refreshActionHighlights();
      this.onUnitSelected?.(user);
    }
  }

  /**
   * Objective Action: Hack Terminal.
   * Player units adjacent to a data terminal can spend 2 AP to capture it.
   */
  public async executeHackTerminal(): Promise<boolean> {
    const unit = this.getSelectedUnit();
    if (!unit || unit.ap < 2) {
      this.addLog('Requires 2 AP to hack terminal', 'warn');
      return false;
    }

    // Check adjacent tiles for terminal
    const neighbors = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];

    let targetTerminal: TileData | null = null;
    for (const offset of neighbors) {
      const tile = this.grid.gridTiles.get(`${unit.x + offset.x},${unit.z + offset.z}`);
      if (tile && tile.type === 'terminal' && !tile.hacked) {
        targetTerminal = tile;
        break;
      }
    }

    if (!targetTerminal) {
      this.addLog('No unhacked Data Terminal within reach!', 'warn');
      return false;
    }

    unit.ap -= 2;
    targetTerminal.hacked = true;
    this.terminalsHackedCount++;
    sound.playHack();
    this.addLog(`★ Data Terminal secured by ${unit.name}! (${this.terminalsHackedCount}/${this.totalTerminalsCount})`, 'hack');

    if (this.onFloatingText) {
      this.onFloatingText('DATA EXTRACTED!', '#00ff88', new THREE.Vector3(targetTerminal.x, 0.8, targetTerminal.z));
    }

    this.checkVictoryOrDefeat();
    this.refreshActionHighlights();
    this.onUnitSelected?.(unit);
    return true;
  }

  private checkOverwatchTriggers(movingUnit: Unit): boolean {
    const watchers = this.units.filter(
      (u) =>
        !u.isDead &&
        u.team !== movingUnit.team &&
        u.statusEffects.some((s) => s.effectType === 'overwatch')
    );

    for (const watcher of watchers) {
      const dist = Math.hypot(movingUnit.x - watcher.x, movingUnit.z - watcher.z);
      if (dist <= watcher.attackRange) {
        const hasLoS = LineOfSight.hasLineOfSight(
          { x: watcher.x, z: watcher.z },
          { x: movingUnit.x, z: movingUnit.z },
          this.grid.gridTiles
        );
        if (hasLoS) {
          // Trigger Overwatch!
          watcher.statusEffects = watcher.statusEffects.filter((s) => s.effectType !== 'overwatch');
          this.addLog(`⚡ ${watcher.name}'s Overwatch triggered by ${movingUnit.name}!`, 'warn');
          sound.playRailgun();
          this.applyDamage(movingUnit, watcher.attackDamage, 'overwatch');
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Ends player turn and transfers control to AI Enemy Turn.
   */
  public async endTurn() {
    if (this.state !== 'PLAYER_TURN' || this.isBusyAnimating) return;

    this.setState('ENEMY_TURN');
    sound.playTurnStart(false);
    this.addLog('Enemy Turn Initiated...', 'warn');

    await new Promise((r) => setTimeout(r, 600));

    // Reset enemy AP and tick cooldowns
    const livingEnemies = this.units.filter((u) => u.team === 'enemy' && !u.isDead);
    for (const enemy of livingEnemies) {
      enemy.ap = enemy.maxAp;
      // Stun check
      if (enemy.statusEffects.some((s) => s.effectType === 'stunned')) {
        this.addLog(`${enemy.name} is recovering from EMP stun.`, 'info');
        enemy.statusEffects = enemy.statusEffects.filter((s) => s.effectType !== 'stunned');
        continue;
      }

      await this.runEnemyAI(enemy);
      await new Promise((r) => setTimeout(r, 400));
    }

    // Start New Round for Player
    this.roundNumber++;
    const livingPlayers = this.units.filter((u) => u.team === 'player' && !u.isDead);
    livingPlayers.forEach((p) => {
      p.ap = p.maxAp;
      // Reduce cooldowns
      p.abilities.forEach((a) => {
        if (a.currentCooldown > 0) a.currentCooldown--;
      });
      // Clear 1-turn buffs
      p.statusEffects = p.statusEffects.filter((s) => s.duration > 1);
    });

    this.checkVictoryOrDefeat();

    const curState = this.state as CombatState;
    if (curState !== 'VICTORY' && curState !== 'DEFEAT') {
      sound.playTurnStart(true);
      this.addLog(`--- Round ${this.roundNumber}: Player Squad Turn ---`, 'info');
      this.setState('PLAYER_TURN');
      const firstLiving = livingPlayers[0];
      if (firstLiving) {
        this.selectUnit(firstLiving.id);
      }
    }
  }

  /**
   * Smart AI logic for enemies: target prioritization, pathfinding to cover, attacking.
   */
  private async runEnemyAI(enemy: Unit) {
    if (enemy.isDead || enemy.ap <= 0) return;

    const livingPlayers = this.units.filter((u) => u.team === 'player' && !u.isDead);
    if (livingPlayers.length === 0) return;

    // 1. Find closest player unit
    livingPlayers.sort((a, b) => {
      const distA = Math.hypot(a.x - enemy.x, a.z - enemy.z);
      const distB = Math.hypot(b.x - enemy.x, b.z - enemy.z);
      return distA - distB;
    });

    const target = livingPlayers[0];
    const dist = Math.hypot(target.x - enemy.x, target.z - enemy.z);

    // 2. If out of attack range and can move, pathfind towards target
    if (dist > enemy.attackRange && enemy.moveRange > 0 && enemy.ap >= 2) {
      const path = Pathfinding.findPath(
        { x: enemy.x, z: enemy.z },
        { x: target.x, z: target.z },
        this.grid.gridTiles,
        this.units,
        enemy.id
      );

      if (path.length > 2) {
        // Move towards target by up to AP steps
        const steps = Math.min(enemy.ap, path.length - 2);
        for (let i = 1; i <= steps; i++) {
          sound.playMove();
          await this.animateUnitStep(enemy, path[i]);
          enemy.x = path[i].x;
          enemy.z = path[i].z;
          enemy.ap -= 1;
        }
      }
    }

    // 3. Attack if in range and AP >= 2
    const newDist = Math.hypot(target.x - enemy.x, target.z - enemy.z);
    if (newDist <= enemy.attackRange && enemy.ap >= 2) {
      await this.executeAttackAction(enemy, target);
    }
  }

  public checkVictoryOrDefeat() {
    const livingPlayers = this.units.filter((u) => u.team === 'player' && !u.isDead);
    const livingEnemies = this.units.filter((u) => u.team === 'enemy' && !u.isDead);

    if (livingPlayers.length === 0) {
      this.setState('DEFEAT');
      sound.playDefeat();
      this.addLog('CRITICAL FAILURE: Squad eliminated in combat.', 'damage');
      return;
    }

    if (livingEnemies.length === 0) {
      this.setState('VICTORY');
      sound.playVictory();
      this.addLog('MISSION COMPLETE: All hostile forces neutralized!', 'heal');
      return;
    }

    // If terminal objective and all terminals hacked
    if (this.totalTerminalsCount > 0 && this.terminalsHackedCount >= this.totalTerminalsCount) {
      this.setState('VICTORY');
      sound.playVictory();
      this.addLog('MISSION COMPLETE: All mission terminals secured!', 'heal');
      return;
    }
  }

  public addLog(text: string, type: CombatLogEntry['type'] = 'info') {
    const now = new Date();
    const timeStr = `${now.getMinutes().toString().padStart(2, '0')}:${now
      .getSeconds()
      .toString()
      .padStart(2, '0')}`;
    const entry: CombatLogEntry = {
      id: Math.random().toString(),
      timestamp: timeStr,
      text,
      type,
    };
    this.combatLogs.push(entry);
    this.onLogsUpdated?.(this.combatLogs);
  }
}
