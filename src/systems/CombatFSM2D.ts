import { Ability, CombatLogEntry, CombatState, CoverType, GridCoord, SectorNodeType, SelectedAction, Unit } from '../types';
import { TacticalGrid2D } from '../scenes/TacticalGrid2D';
import { Pathfinding2D } from './Pathfinding2D';
import { LineOfSight2D } from './LineOfSight2D';
import { Renderer2D } from '../scenes/Renderer2D';
import { Camera2D } from './Camera2D';
import { sound } from './AudioSynth';

export class CombatFSM2D {
  public state: CombatState = 'INIT';
  public roundNumber: number = 1;
  public grid: TacticalGrid2D;
  public renderer: Renderer2D | null = null;
  public camera: Camera2D | null = null;

  public units: Unit[] = [];
  public selectedUnitId: string | null = null;
  public targetUnitId: string | null = null;
  public currentAction: SelectedAction = null;

  public logs: CombatLogEntry[] = [];
  public get combatLogs(): CombatLogEntry[] {
    return this.logs;
  }
  public nodeType: SectorNodeType = 'skirmish';
  public terminalsHackedCount: number = 0;
  public totalTerminalsCount: number = 0;

  public isBusyAnimating: boolean = false;
  private isProcessingTurn: boolean = false;

  // Event callbacks
  public onStateChanged?: () => void;
  public onUnitSelected?: () => void;
  public onLogsUpdated?: (logs: CombatLogEntry[]) => void;
  public onMissionFinished?: (victory: boolean) => void;

  constructor(grid: TacticalGrid2D) {
    this.grid = grid;
  }

  public setRendererAndCamera(renderer: Renderer2D, camera: Camera2D) {
    this.renderer = renderer;
    this.camera = camera;
  }

  public initMission(squad: Unit[], nodeType: SectorNodeType) {
    this.nodeType = nodeType;
    this.state = 'INIT';
    this.roundNumber = 1;
    this.logs = [];
    this.selectedUnitId = null;
    this.currentAction = 'MOVE';
    this.isBusyAnimating = false;
    this.isProcessingTurn = false;
    this.terminalsHackedCount = 0;

    // Reset squad members
    this.units = squad.map((u, i) => ({
      ...u,
      x: 6 + (i % 3),
      y: 13 + Math.floor(i / 3),
      facingAngle: -Math.PI / 2, // Facing North
      ap: u.maxAp,
      hp: u.hp,
      shields: u.shields,
      isDead: false,
      statusEffects: [],
      animPos: undefined,
      abilities: u.abilities.map((a) => ({ ...a, currentCooldown: 0 })),
    }));

    // Spawn Enemy Bots based on node type
    this.spawnEnemyBots(nodeType);

    // Count terminals if terminal_hack
    if (nodeType === 'terminal_hack') {
      let count = 0;
      for (let y = 0; y < TacticalGrid2D.GRID_HEIGHT; y++) {
        for (let x = 0; x < TacticalGrid2D.GRID_WIDTH; x++) {
          if (this.grid.grid[y][x].type === 'terminal') count++;
        }
      }
      this.totalTerminalsCount = count;
    }

    // Auto-select first alive squad member
    const firstAlive = this.units.find((u) => u.team === 'player' && !u.isDead);
    if (firstAlive) {
      this.selectUnit(firstAlive.id);
    }

    const firstEnemy = this.units.find((u) => u.team === 'enemy' && !u.isDead);
    if (firstEnemy) {
      this.targetUnitId = firstEnemy.id;
    }

    this.addLog('Mission initialized. Tactical Recon squads deployed.', 'info');
    this.setState('PLAYER_TURN');
  }

  private spawnEnemyBots(nodeType: SectorNodeType) {
    if (nodeType === 'boss') {
      // Sector Overseer Titan Boss + 2 Escort Enforcers
      this.units.push({
        id: 'e_boss_titan',
        name: 'Sector Overseer Titan',
        team: 'enemy',
        unitClass: 'boss',
        x: 7,
        y: 3,
        facingAngle: Math.PI / 2, // Facing South
        hp: 260,
        maxHp: 260,
        shields: 80,
        maxShields: 80,
        armor: 5,
        ap: 4,
        maxAp: 4,
        moveRange: 1,
        attackRange: 6,
        attackDamage: 36,
        critChance: 25,
        isDead: false,
        level: 3,
        kills: 0,
        upgrades: [],
        statusEffects: [],
        abilities: [
          {
            id: 'orbital_cannon',
            name: 'Orbital Bombardment',
            description: 'Devastating plasma strike dealing 45 damage in a radius.',
            apCost: 3,
            cooldown: 2,
            currentCooldown: 0,
            range: 7,
            targetType: 'enemy',
            icon: '☄️',
          },
        ],
      });

      this.units.push(
        this.createEnemyUnit('e_enforcer_1', 'Titan Guard A', 'enforcer', 4, 4, 100, 30, 24, 4),
        this.createEnemyUnit('e_enforcer_2', 'Titan Guard B', 'enforcer', 10, 4, 100, 30, 24, 4)
      );
    } else if (nodeType === 'ambush') {
      // Rapid strike squad with 2 Drones and 2 Infiltrators
      this.units.push(
        this.createEnemyUnit('e_drone_1', 'Combat Drone Alpha', 'drone', 5, 2, 50, 0, 18, 5),
        this.createEnemyUnit('e_drone_2', 'Combat Drone Beta', 'drone', 10, 2, 50, 0, 18, 5),
        this.createEnemyUnit('e_infil_1', 'Stalker 01', 'infiltrator', 3, 5, 70, 20, 26, 3),
        this.createEnemyUnit('e_infil_2', 'Stalker 02', 'infiltrator', 12, 5, 70, 20, 26, 3)
      );
    } else {
      // Standard Skirmish / Terminal Hack: 1 Enforcer + 2 Recon Drones
      this.units.push(
        this.createEnemyUnit('e_enforcer', 'Mech Enforcer', 'enforcer', 7, 2, 110, 35, 26, 4),
        this.createEnemyUnit('e_drone_1', 'Recon Drone A', 'drone', 4, 3, 48, 0, 16, 5),
        this.createEnemyUnit('e_drone_2', 'Recon Drone B', 'drone', 11, 3, 48, 0, 16, 5)
      );
    }
  }

  private createEnemyUnit(
    id: string,
    name: string,
    unitClass: Unit['unitClass'],
    x: number,
    y: number,
    hp: number,
    shields: number,
    attackDamage: number,
    attackRange: number
  ): Unit {
    return {
      id,
      name,
      team: 'enemy',
      unitClass,
      x,
      y,
      facingAngle: Math.PI / 2, // Facing South towards players
      hp,
      maxHp: hp,
      shields,
      maxShields: shields,
      armor: unitClass === 'enforcer' ? 3 : 1,
      ap: 3,
      maxAp: 3,
      moveRange: unitClass === 'drone' ? 2 : 1,
      attackRange,
      attackDamage,
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
    this.updateMovementAndAttackOverlays();
    this.onStateChanged?.();
  }

  public getSelectedUnit(): Unit | null {
    if (!this.selectedUnitId) return null;
    return this.units.find((u) => u.id === this.selectedUnitId && !u.isDead) || null;
  }

  public selectUnit(unitId: string | null) {
    this.selectedUnitId = unitId;
    this.updateMovementAndAttackOverlays();
    this.onUnitSelected?.();
  }

  public setAction(action: SelectedAction) {
    this.currentAction = action;
    this.updateMovementAndAttackOverlays();
    this.onStateChanged?.();
  }

  public updateMovementAndAttackOverlays() {
    this.grid.clearReachableTiles();
    this.grid.clearAttackRangeTiles();

    if (this.state !== 'PLAYER_TURN') return;

    const unit = this.getSelectedUnit();
    if (!unit || unit.team !== 'player' || unit.ap <= 0) return;

    if (this.currentAction === 'MOVE') {
      const reachable = Pathfinding2D.getReachableTiles(
        { x: unit.x, y: unit.y },
        unit.ap,
        unit.moveRange,
        this.grid.grid,
        this.units,
        unit.id
      );
      this.grid.setReachableTiles(reachable);
    } else if (this.currentAction === 'ATTACK' || this.currentAction === 'ABILITY_1' || this.currentAction === 'ABILITY_2') {
      const range = this.currentAction === 'ATTACK'
        ? unit.attackRange
        : this.currentAction === 'ABILITY_1' && unit.abilities[0]
          ? unit.abilities[0].range
          : this.currentAction === 'ABILITY_2' && unit.abilities[1]
            ? unit.abilities[1].range
            : unit.attackRange;

      const attackTiles = new Set<string>();
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const nx = unit.x + dx;
          const ny = unit.y + dy;
          if (this.grid.isValid(nx, ny) && Math.max(Math.abs(dx), Math.abs(dy)) <= range) {
            attackTiles.add(`${nx},${ny}`);
          }
        }
      }
      this.grid.setAttackRangeTiles(attackTiles);
    }
  }

  /**
   * Primary entry point for tile click interactions on the 2D grid
   */
  public async handleTileClick(coord: GridCoord) {
    if (this.isBusyAnimating || this.state !== 'PLAYER_TURN') return;

    const clickedUnit = this.units.find((u) => u.x === coord.x && u.y === coord.y && !u.isDead);

    // 1. If clicked on a friendly player unit, select them
    if (clickedUnit && clickedUnit.team === 'player') {
      sound.playSelect();
      this.selectUnit(clickedUnit.id);
      return;
    }

    const activeUnit = this.getSelectedUnit();
    if (!activeUnit || activeUnit.team !== 'player' || activeUnit.ap <= 0) return;

    // 2. Action: MOVE
    if (this.currentAction === 'MOVE') {
      const key = `${coord.x},${coord.y}`;
      const reachableInfo = this.grid.reachableTiles.get(key);

      if (reachableInfo && reachableInfo.path.length > 0) {
        await this.executeUnitMove(activeUnit, reachableInfo.path, reachableInfo.cost);
      }
      return;
    }

    // If clicked on an enemy unit, target them in inspector
    if (clickedUnit && clickedUnit.team === 'enemy') {
      sound.playSelect();
      this.targetUnitId = clickedUnit.id;
      if (this.currentAction === 'ATTACK') {
        await this.executeAttack(activeUnit, clickedUnit);
      } else {
        this.onStateChanged?.();
      }
      return;
    }

    // 4. Action: ABILITY
    if (this.currentAction === 'ABILITY_1' && activeUnit.abilities[0]) {
      await this.executeAbility(activeUnit, activeUnit.abilities[0], clickedUnit || null, coord);
      return;
    }

    if (this.currentAction === 'ABILITY_2' && activeUnit.abilities[1]) {
      await this.executeAbility(activeUnit, activeUnit.abilities[1], clickedUnit || null, coord);
      return;
    }
  }

  /**
   * Executes smooth step-by-step movement animation along the 2D A* path
   */
  public async executeUnitMove(unit: Unit, path: GridCoord[], apCost: number): Promise<void> {
    if (path.length === 0 || this.isBusyAnimating) return;

    this.isBusyAnimating = true;
    this.setState('ACTION_ANIMATING');
    this.grid.clearReachableTiles();

    const tileSize = TacticalGrid2D.TILE_SIZE;

    for (const step of path) {
      // Calculate facing angle
      const dx = step.x - unit.x;
      const dy = step.y - unit.y;
      unit.facingAngle = Math.atan2(dy, dx);

      // Animate smoothly between current tile and next tile (160ms)
      const startX = (unit.x + 0.5) * tileSize;
      const startY = (unit.y + 0.5) * tileSize;
      const endX = (step.x + 0.5) * tileSize;
      const endY = (step.y + 0.5) * tileSize;

      const duration = 160;
      const startTime = performance.now();

      sound.playMove();

      await new Promise<void>((resolve) => {
        let isDone = false;
        const timer = setTimeout(() => {
          if (!isDone) {
            isDone = true;
            resolve();
          }
        }, duration + 60);

        const animStep = (now: number) => {
          if (isDone) return;
          const elapsed = now - startTime;
          const t = Math.min(1, elapsed / duration);

          unit.animPos = {
            x: startX + (endX - startX) * t,
            y: startY + (endY - startY) * t,
          };

          if (t < 1) {
            requestAnimationFrame(animStep);
          } else {
            isDone = true;
            clearTimeout(timer);
            resolve();
          }
        };
        requestAnimationFrame(animStep);
      });

      // Update grid position
      unit.x = step.x;
      unit.y = step.y;
      unit.animPos = undefined;

      // Check for Hazard tile damage
      const currentTile = this.grid.getTile(unit.x, unit.y);
      if (currentTile && currentTile.type === 'hazard') {
        const hazardDmg = 12;
        unit.hp = Math.max(0, unit.hp - hazardDmg);
        this.renderer?.addFloatingNumber(unit.x, unit.y, `-${hazardDmg} HAZARD!`, '#ec4899');
        this.addLog(`${unit.name} triggered plasma hazard for ${hazardDmg} burn damage!`, 'warn');
        sound.playPlasma();
      }

      // Check if stepped adjacent to an unhacked terminal
      if (this.nodeType === 'terminal_hack') {
        this.checkTerminalHacking(unit);
      }
    }

    unit.ap = Math.max(0, unit.ap - apCost);
    this.isBusyAnimating = false;

    if (unit.team === 'player') {
      this.setState('PLAYER_TURN');
      this.evaluateRules();
    } else {
      this.setState('ENEMY_TURN');
    }
  }

  private checkTerminalHacking(unit: Unit) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = unit.x + dx;
        const ty = unit.y + dy;
        const tile = this.grid.getTile(tx, ty);
        if (tile && tile.type === 'terminal' && !tile.hacked) {
          tile.hacked = true;
          this.terminalsHackedCount++;
          sound.playShield();
          this.renderer?.addFloatingNumber(tx, ty, 'DATA LINK SECURED!', '#10b981', 14);
          this.addLog(`Data Terminal at [${tx}, ${ty}] decrypted by ${unit.name}! (${this.terminalsHackedCount}/${this.totalTerminalsCount})`, 'hack');
        }
      }
    }
  }

  /**
   * Executes combat attack action with 2D Bresenham line-of-sight and cover mitigation
   */
  public async executeAttack(attacker: Unit, target: Unit): Promise<void> {
    if (attacker.ap < 2 || this.isBusyAnimating) return;

    this.isBusyAnimating = true;
    this.setState('ACTION_ANIMATING');

    attacker.ap -= 2;

    // Face target
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    attacker.facingAngle = Math.atan2(dy, dx);

    const tileSize = TacticalGrid2D.TILE_SIZE;
    const startX = (attacker.x + 0.5) * tileSize;
    const startY = (attacker.y + 0.5) * tileSize;
    const targetX = (target.x + 0.5) * tileSize;
    const targetY = (target.y + 0.5) * tileSize;

    // Line of Sight & Cover calculation
    const los = LineOfSight2D.checkLoS(
      { x: attacker.x, y: attacker.y },
      { x: target.x, y: target.y },
      this.grid.grid
    );

    // Laser beam visual
    const beamColor = attacker.team === 'player' ? '#06b6d4' : '#ef4444';
    this.renderer?.addLaser(startX, startY, targetX, targetY, beamColor, 4.5);
    sound.playLaser();

    await new Promise((r) => setTimeout(r, 260));

    // Handle full cover LoS block
    if (!los.hasLoS) {
      this.renderer?.addFloatingNumber(target.x, target.y, 'BLOCKED! (FULL COVER)', '#94a3b8');
      this.addLog(`${attacker.name}'s shot was completely blocked by high cover energy pylon!`, 'warn');
      this.isBusyAnimating = false;
      this.finishAction(attacker);
      return;
    }

    // Hit accuracy roll
    const baseHitChance = 85;
    const finalHitChance = Math.max(15, baseHitChance + los.hitChanceModifier);
    const hitRoll = Math.random() * 100;

    if (hitRoll > finalHitChance) {
      this.renderer?.addFloatingNumber(target.x, target.y, 'MISSED!', '#94a3b8');
      this.addLog(`${attacker.name}'s attack missed ${target.name}! (${finalHitChance}% hit chance)`, 'info');
      this.isBusyAnimating = false;
      this.finishAction(attacker);
      return;
    }

    // Critical roll
    const isCrit = Math.random() * 100 <= attacker.critChance;
    const rawDamage = Math.round(attacker.attackDamage * (isCrit ? 1.5 : 1.0));

    // Apply 2D Cover Mitigation (Half-cover = 50% damage reduction)
    let netDamage = Math.round(rawDamage * los.damageMultiplier);
    netDamage = Math.max(1, netDamage - target.armor);

    // Damage shields first, then hull
    let shieldDmg = 0;
    let hullDmg = 0;

    if (target.shields > 0) {
      shieldDmg = Math.min(target.shields, netDamage);
      target.shields -= shieldDmg;
      netDamage -= shieldDmg;
    }

    if (netDamage > 0) {
      hullDmg = netDamage;
      target.hp = Math.max(0, target.hp - hullDmg);
    }

    // Impact FX
    this.renderer?.addParticles(targetX, targetY, 18, isCrit ? '#f59e0b' : '#ef4444');
    if (isCrit || hullDmg > 30) {
      this.camera?.shake(9, 0.3);
    }

    const floatText = isCrit ? `CRIT! -${shieldDmg + hullDmg}` : `-${shieldDmg + hullDmg}`;
    this.renderer?.addFloatingNumber(target.x, target.y, floatText, isCrit ? '#f59e0b' : '#f87171', isCrit ? 20 : 16);

    const coverInfo = los.cover === 'half' ? ' [Cover: 50% REDUCED]' : '';
    this.addLog(
      `${attacker.name} attacked ${target.name} for ${shieldDmg + hullDmg} DMG!${isCrit ? ' (CRITICAL)' : ''}${coverInfo}`,
      'damage'
    );

    // Check target destruction
    if (target.hp <= 0) {
      target.isDead = true;
      attacker.kills++;
      sound.playExplosion();
      this.renderer?.addParticles(targetX, targetY, 32, '#ef4444');
      this.renderer?.addFloatingNumber(target.x, target.y, 'DESTROYED', '#ef4444', 18);
      this.addLog(`Hostile ${target.name} was neutralized!`, 'info');
    }

    this.isBusyAnimating = false;
    this.finishAction(attacker);
  }

  private finishAction(attacker: Unit) {
    if (attacker.team === 'player') {
      this.setState('PLAYER_TURN');
      this.evaluateRules();
    } else {
      this.setState('ENEMY_TURN');
    }
  }

  /**
   * Executes class abilities
   */
  public async executeAbility(user: Unit, ability: Ability, target: Unit | null, coord: GridCoord) {
    if (user.ap < ability.apCost || ability.currentCooldown > 0 || this.isBusyAnimating) return;

    this.isBusyAnimating = true;
    this.setState('ACTION_ANIMATING');

    user.ap -= ability.apCost;
    ability.currentCooldown = ability.cooldown;

    const tileSize = TacticalGrid2D.TILE_SIZE;

    if (ability.id === 'shield_fortress') {
      // Vanguard self barrier
      user.shields = Math.min(user.maxShields, user.shields + 35);
      sound.playShield();
      this.renderer?.addFloatingNumber(user.x, user.y, '+35 SHIELD RECHARGE!', '#06b6d4');
      this.addLog(`${user.name} activated Shield Fortress!`, 'shield');
    } else if (ability.id === 'seismic_slam') {
      // Vanguard AoE
      sound.playRailgun();
      this.camera?.shake(12, 0.4);
      for (const u of this.units) {
        if (!u.isDead && u.team !== user.team && Math.max(Math.abs(u.x - user.x), Math.abs(u.y - user.y)) <= 1.5) {
          u.hp = Math.max(0, u.hp - 24);
          this.renderer?.addFloatingNumber(u.x, u.y, '-24 SLAM!', '#f59e0b');
          if (u.hp <= 0) u.isDead = true;
        }
      }
      this.addLog(`${user.name} unleashed Seismic Slam!`, 'damage');
    } else if (ability.id === 'deadeye_shot' && target) {
      // Sniper Deadeye
      sound.playRailgun();
      const startX = (user.x + 0.5) * tileSize;
      const startY = (user.y + 0.5) * tileSize;
      const targetX = (target.x + 0.5) * tileSize;
      const targetY = (target.y + 0.5) * tileSize;
      this.renderer?.addLaser(startX, startY, targetX, targetY, '#67e8f9', 7);
      target.hp = Math.max(0, target.hp - 55);
      this.renderer?.addFloatingNumber(target.x, target.y, 'CRITICAL 55!', '#67e8f9', 20);
      if (target.hp <= 0) target.isDead = true;
      this.addLog(`${user.name} fired Deadeye Protocol at ${target.name} for 55 DMG!`, 'damage');
    } else if (ability.id === 'nanite_heal' && target) {
      // Medic Heal
      target.hp = Math.min(target.maxHp, target.hp + 45);
      sound.playHeal();
      this.renderer?.addParticles((target.x + 0.5) * tileSize, (target.y + 0.5) * tileSize, 20, '#10b981');
      this.renderer?.addFloatingNumber(target.x, target.y, '+45 HP REPAIR', '#10b981');
      this.addLog(`${user.name} repaired ${target.name} for +45 HP!`, 'heal');
    } else if (ability.id === 'emp_overload' && target) {
      // Hacker EMP
      sound.playEMP();
      target.shields = 0;
      target.ap = Math.max(0, target.ap - 2);
      this.renderer?.addFloatingNumber(target.x, target.y, 'EMP STRIPPED!', '#a855f7');
      this.addLog(`${user.name} overloaded ${target.name}'s systems!`, 'hack');
    } else if (ability.id === 'cyber_boost' && target) {
      // Hacker Boost
      target.ap += 2;
      sound.playShield();
      this.renderer?.addFloatingNumber(target.x, target.y, '+2 AP BOOST', '#22d3ee');
      this.addLog(`${user.name} overclocked ${target.name} with Combat Overdrive!`, 'shield');
    }

    await new Promise((r) => setTimeout(r, 300));
    this.isBusyAnimating = false;
    this.finishAction(user);
  }

  /**
   * End player turn and initiate sequential Enemy AI loop
   */
  public async endTurn(): Promise<void> {
    if (this.state !== 'PLAYER_TURN' || this.isProcessingTurn) return;

    this.isProcessingTurn = true;
    this.setState('ENEMY_TURN');
    this.addLog(`--- Round ${this.roundNumber}: Enemy Turn Initiated ---`, 'info');

    try {
      await this.runEnemyAILoop();
    } finally {
      this.isProcessingTurn = false;
      this.isBusyAnimating = false;

      // Start new player round
      this.roundNumber++;
      this.units.forEach((u) => {
        if (!u.isDead) {
          u.ap = u.maxAp;
          // Cooldown reduction
          u.abilities.forEach((a) => {
            if (a.currentCooldown > 0) a.currentCooldown--;
          });
        }
      });

      this.addLog(`--- Round ${this.roundNumber}: Player Squad Turn ---`, 'info');
      const firstAlivePlayer = this.units.find((u) => u.team === 'player' && !u.isDead);
      if (firstAlivePlayer) {
        this.selectUnit(firstAlivePlayer.id);
      }
      sound.playTurnStart(true);
      this.setState('PLAYER_TURN');
      this.evaluateRules();
    }
  }

  /**
   * Zero-Lock Guarantee:
   * Non-blocking sequential bot action loop using async/await and step timers.
   */
  private async runEnemyAILoop(): Promise<void> {
    const livingBots = this.units.filter((u) => u.team === 'enemy' && !u.isDead);

    for (const bot of livingBots) {
      if (bot.isDead) continue;

      try {
        // Highlight current acting bot in UI
        this.selectUnit(bot.id);
        await new Promise((r) => setTimeout(r, 150));

        // 1. Locate best player target: lowest HP or nearest
        const livingPlayers = this.units.filter((u) => u.team === 'player' && !u.isDead);
        if (livingPlayers.length === 0) break;

        let bestTarget = livingPlayers[0];
        let shortestDist = Pathfinding2D.chebyshev({ x: bot.x, y: bot.y }, { x: bestTarget.x, y: bestTarget.y });

        for (const p of livingPlayers) {
          const d = Pathfinding2D.chebyshev({ x: bot.x, y: bot.y }, { x: p.x, y: p.y });
          // Prioritize target in line of sight or closer
          const los = LineOfSight2D.checkLoS({ x: bot.x, y: bot.y }, { x: p.x, y: p.y }, this.grid.grid);
          if (los.hasLoS && d <= bot.attackRange) {
            bestTarget = p;
            break;
          }
          if (d < shortestDist) {
            shortestDist = d;
            bestTarget = p;
          }
        }

        // 2. Path towards target if out of range or LoS is blocked
        const losToTarget = LineOfSight2D.checkLoS({ x: bot.x, y: bot.y }, { x: bestTarget.x, y: bestTarget.y }, this.grid.grid);
        const inRange = shortestDist <= bot.attackRange;

        if ((!inRange || !losToTarget.hasLoS) && bot.ap > 0) {
          const path = Pathfinding2D.findPathTowardsTarget(
            { x: bot.x, y: bot.y },
            { x: bestTarget.x, y: bestTarget.y },
            this.grid.grid,
            this.units,
            bot.id,
            bot.attackRange
          );

          if (path.length > 0) {
            const maxSteps = Math.min(path.length, bot.ap * bot.moveRange);
            const stepsToTake = path.slice(0, maxSteps);
            const apCost = Math.ceil(stepsToTake.length / bot.moveRange);
            await this.executeUnitMove(bot, stepsToTake, apCost);
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        // 3. Attack target if in range and LoS clear
        if (!bot.isDead && bot.ap >= 2 && !bestTarget.isDead) {
          const targetDist = Pathfinding2D.chebyshev({ x: bot.x, y: bot.y }, { x: bestTarget.x, y: bestTarget.y });
          const canHit = targetDist <= bot.attackRange;
          const los = LineOfSight2D.checkLoS({ x: bot.x, y: bot.y }, { x: bestTarget.x, y: bestTarget.y }, this.grid.grid);

          if (canHit && los.hasLoS) {
            await this.executeAttack(bot, bestTarget);
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      } catch (err) {
        console.warn('Bot action failed:', err);
      } finally {
        bot.ap = 0;
        this.isBusyAnimating = false;
        await new Promise((r) => setTimeout(r, 80));
      }
    }
  }

  public evaluateRules() {
    const livingPlayers = this.units.filter((u) => u.team === 'player' && !u.isDead);
    const livingEnemies = this.units.filter((u) => u.team === 'enemy' && !u.isDead);

    // Defeat
    if (livingPlayers.length === 0) {
      this.setState('DEFEAT');
      this.addLog('CRITICAL FAILURE: All squad units neutralized.', 'warn');
      sound.playAlarm();
      this.onMissionFinished?.(false);
      return;
    }

    // Victory: All enemies destroyed OR terminals hacked
    const terminalsDone = this.nodeType === 'terminal_hack' && this.terminalsHackedCount >= this.totalTerminalsCount && this.totalTerminalsCount > 0;
    const enemiesDone = livingEnemies.length === 0;

    if (enemiesDone || terminalsDone) {
      this.setState('VICTORY');
      this.addLog('MISSION ACCOMPLISHED: Sector objectives secured!', 'info');
      sound.playVictory();
      this.onMissionFinished?.(true);
      return;
    }
  }

  public async executeAttackAction(attacker: Unit, target: Unit): Promise<void> {
    return this.executeAttack(attacker, target);
  }

  public async executeHackTerminal(): Promise<void> {
    const activeUnit = this.getSelectedUnit();
    if (!activeUnit || activeUnit.team !== 'player' || activeUnit.ap < 1 || this.isBusyAnimating) return;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = activeUnit.x + dx;
        const ty = activeUnit.y + dy;
        const tile = this.grid.getTile(tx, ty);
        if (tile && tile.type === 'terminal' && !tile.hacked) {
          tile.hacked = true;
          this.terminalsHackedCount++;
          activeUnit.ap -= 1;
          sound.playShield();
          this.renderer?.addFloatingNumber(tx, ty, 'DATA LINK SECURED!', '#10b981', 14);
          this.addLog(`Data Terminal at [${tx}, ${ty}] decrypted by ${activeUnit.name}! (${this.terminalsHackedCount}/${this.totalTerminalsCount})`, 'hack');
          this.onStateChanged?.();
          this.evaluateRules();
          return;
        }
      }
    }
  }

  public addLog(text: string, type: CombatLogEntry['type']) {
    const now = new Date();
    const timestamp = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const entry: CombatLogEntry = {
      id: Math.random().toString(),
      timestamp,
      text,
      type,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 50) this.logs.pop();
    this.onLogsUpdated?.(this.logs);
  }
}
