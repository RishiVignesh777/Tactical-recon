import { GridCoord, TileData, Unit } from '../types';

export type CoverType = 'none' | 'low' | 'high';

export interface CombatHitEvaluation {
  hitChance: number; // 0 to 100
  coverType: CoverType;
  coverDamageReduction: number; // 0, 0.25, 0.50
  isFlanked: boolean;
  hasLineOfSight: boolean;
  isElevated: boolean;
  critChance: number;
  baseDamage: number;
  distance: number;
}

export class LineOfSight {
  /**
   * Raycasts between two grid coordinates using Bresenham's supercover algorithm.
   * Checks if any intermediate tile has high cover / wall that blocks sight.
   */
  public static hasLineOfSight(
    from: GridCoord,
    to: GridCoord,
    grid: Map<string, TileData>
  ): boolean {
    if (from.x === to.x && from.z === to.z) return true;

    const points = this.getRaycastTiles(from, to);
    // Ignore start and end tiles
    for (let i = 1; i < points.length - 1; i++) {
      const tile = grid.get(`${points[i].x},${points[i].z}`);
      if (tile && tile.type === 'high_cover') {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns all grid tiles intersected by a 2D line from start to end.
   */
  public static getRaycastTiles(from: GridCoord, to: GridCoord): GridCoord[] {
    const tiles: GridCoord[] = [];
    let x0 = from.x;
    let z0 = from.z;
    const x1 = to.x;
    const z1 = to.z;

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    while (true) {
      tiles.push({ x: x0, z: z0 });
      if (x0 === x1 && z0 === z1) break;

      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        z0 += sz;
      }
    }

    return tiles;
  }

  /**
   * Evaluates the tactical cover of a target with respect to the attacker.
   * Checks adjacent tiles to target that lie along the incoming fire vector.
   */
  public static evaluateCover(
    attacker: GridCoord,
    target: GridCoord,
    grid: Map<string, TileData>
  ): { cover: CoverType; reduction: number; flanked: boolean } {
    const dx = attacker.x - target.x;
    const dz = attacker.z - target.z;

    // Determine primary incoming direction
    const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const stepZ = dz === 0 ? 0 : dz > 0 ? 1 : -1;

    // Check adjacent tiles in direction of incoming attack
    const testCoords: GridCoord[] = [];
    if (stepX !== 0) testCoords.push({ x: target.x + stepX, z: target.z });
    if (stepZ !== 0) testCoords.push({ x: target.x, z: target.z + stepZ });
    if (stepX !== 0 && stepZ !== 0) {
      testCoords.push({ x: target.x + stepX, z: target.z + stepZ });
    }

    let highestCover: CoverType = 'none';
    for (const coord of testCoords) {
      const tile = grid.get(`${coord.x},${coord.z}`);
      if (!tile) continue;

      if (tile.type === 'high_cover') {
        highestCover = 'high';
        break;
      } else if (tile.type === 'low_cover') {
        highestCover = 'low';
      }
    }

    if (highestCover === 'high') {
      return { cover: 'high', reduction: 0.5, flanked: false };
    }
    if (highestCover === 'low') {
      return { cover: 'low', reduction: 0.25, flanked: false };
    }
    return { cover: 'none', reduction: 0.0, flanked: true };
  }

  /**
   * Computes comprehensive hit chance, cover mitigation, distance, and critical potential.
   */
  public static evaluateCombat(
    attacker: Unit,
    target: Unit,
    grid: Map<string, TileData>
  ): CombatHitEvaluation {
    const from = { x: attacker.x, z: attacker.z };
    const to = { x: target.x, z: target.z };
    const hasLoS = this.hasLineOfSight(from, to, grid);

    const distance = Math.hypot(target.x - attacker.x, target.z - attacker.z);
    const attackerTile = grid.get(`${attacker.x},${attacker.z}`);
    const targetTile = grid.get(`${target.x},${target.z}`);

    const isElevated = Boolean(
      attackerTile?.type === 'elevation' && targetTile?.type !== 'elevation'
    );

    const { cover, reduction, flanked } = this.evaluateCover(from, to, grid);

    // Base accuracy
    let hitChance = 85;

    // Distance modifier
    if (attacker.unitClass === 'sniper') {
      // Sniper excels at range
      if (distance >= 4) hitChance += 10;
      else if (distance <= 2) hitChance -= 10;
    } else if (attacker.unitClass === 'vanguard') {
      // Vanguard excels close-up
      if (distance <= 2) hitChance += 15;
      else if (distance > 4) hitChance -= 15;
    }

    // Height bonus
    if (isElevated) {
      hitChance += 15;
    }

    // Cover penalty to hit
    if (cover === 'high') {
      hitChance -= 40;
    } else if (cover === 'low') {
      hitChance -= 20;
    }

    // Flank bonus
    if (flanked && distance <= 4) {
      hitChance += 10;
    }

    // Check if target is cloaked or in smoke
    if (target.statusEffects.some((s) => s.effectType === 'cloaked')) {
      hitChance -= 30;
    }

    hitChance = Math.max(15, Math.min(95, hitChance));

    // Crit chance calculation
    let critChance = attacker.critChance;
    if (isElevated) critChance += 20;
    if (flanked) critChance += 15;
    critChance = Math.min(80, critChance);

    return {
      hitChance: hasLoS ? hitChance : 0,
      coverType: cover,
      coverDamageReduction: reduction,
      isFlanked: flanked,
      hasLineOfSight: hasLoS,
      isElevated,
      critChance,
      baseDamage: attacker.attackDamage,
      distance,
    };
  }

  /**
   * Computes the Set of all visible tiles for a squad using field of vision.
   */
  public static computeFogOfWar(
    squad: Unit[],
    grid: Map<string, TileData>,
    sightRadius = 6
  ): Set<string> {
    const visible = new Set<string>();

    for (const unit of squad) {
      if (unit.isDead) continue;
      const uCoord = { x: unit.x, z: unit.z };

      for (let dx = -sightRadius; dx <= sightRadius; dx++) {
        for (let dz = -sightRadius; dz <= sightRadius; dz++) {
          const tx = unit.x + dx;
          const tz = unit.z + dz;
          if (tx < 0 || tx >= 12 || tz < 0 || tz >= 12) continue;

          const dist = Math.hypot(dx, dz);
          if (dist <= sightRadius) {
            const targetCoord = { x: tx, z: tz };
            if (this.hasLineOfSight(uCoord, targetCoord, grid)) {
              visible.add(`${tx},${tz}`);
            }
          }
        }
      }
    }

    return visible;
  }
}
