import { GridCoord, TileData, Unit } from '../types';

export interface PathNode {
  x: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent?: PathNode;
}

export class Pathfinding {
  public static readonly GRID_WIDTH = 10;
  public static readonly GRID_DEPTH = 10;

  public static isWithinBounds(x: number, z: number): boolean {
    return x >= 0 && x < this.GRID_WIDTH && z >= 0 && z < this.GRID_DEPTH;
  }

  public static getTileCost(tile?: TileData): number {
    if (!tile) return 999;
    switch (tile.type) {
      case 'high_cover':
        return 999; // Impassable
      case 'hazard':
        return 2.0; // Slows movement & damages
      case 'low_cover':
        return 1.2;
      case 'elevation':
        return 1.0;
      default:
        return 1.0;
    }
  }

  public static heuristic(a: GridCoord, b: GridCoord): number {
    // Manhattan distance
    return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
  }

  /**
   * Finds the optimal path from start to goal using A*.
   * If goal is occupied or blocked, returns empty array.
   */
  public static findPath(
    start: GridCoord,
    goal: GridCoord,
    grid: Map<string, TileData>,
    units: Unit[],
    movingUnitId: string
  ): GridCoord[] {
    if (!this.isWithinBounds(goal.x, goal.z)) return [];
    if (start.x === goal.x && start.z === goal.z) return [];

    const goalTile = grid.get(`${goal.x},${goal.z}`);
    if (!goalTile || goalTile.type === 'high_cover') return [];

    // Check if goal is occupied by any living unit
    const isGoalOccupied = units.some(
      (u) => !u.isDead && u.id !== movingUnitId && u.x === goal.x && u.z === goal.z
    );
    if (isGoalOccupied) return [];

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      x: start.x,
      z: start.z,
      g: 0,
      h: this.heuristic(start, goal),
      f: this.heuristic(start, goal),
    };

    openSet.push(startNode);

    const neighbors = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];

    while (openSet.length > 0) {
      // Get lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const key = `${current.x},${current.z}`;

      if (current.x === goal.x && current.z === goal.z) {
        // Reconstruct path
        const path: GridCoord[] = [];
        let curr: PathNode | undefined = current;
        while (curr) {
          path.unshift({ x: curr.x, z: curr.z });
          curr = curr.parent;
        }
        return path;
      }

      closedSet.add(key);

      for (const offset of neighbors) {
        const nx = current.x + offset.x;
        const nz = current.z + offset.z;
        const nKey = `${nx},${nz}`;

        if (!this.isWithinBounds(nx, nz) || closedSet.has(nKey)) continue;

        const tile = grid.get(nKey);
        const cost = this.getTileCost(tile);
        if (cost >= 900) continue; // High cover/wall

        // Impassable if enemy unit occupies the intermediate tile
        const movingUnit = units.find((u) => u.id === movingUnitId);
        const occupiedUnit = units.find(
          (u) => !u.isDead && u.x === nx && u.z === nz && u.id !== movingUnitId
        );

        if (occupiedUnit) {
          // Cannot traverse through enemy units
          if (movingUnit && occupiedUnit.team !== movingUnit.team) continue;
          // If destination tile is occupied by an ally, cannot stop there
          if (nx === goal.x && nz === goal.z) continue;
        }

        const tentativeG = current.g + cost;
        const existingOpen = openSet.find((node) => node.x === nx && node.z === nz);

        if (!existingOpen) {
          const h = this.heuristic({ x: nx, z: nz }, goal);
          const neighborNode: PathNode = {
            x: nx,
            z: nz,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current,
          };
          openSet.push(neighborNode);
        } else if (tentativeG < existingOpen.g) {
          existingOpen.g = tentativeG;
          existingOpen.f = tentativeG + existingOpen.h;
          existingOpen.parent = current;
        }
      }
    }

    return [];
  }

  /**
   * Computes all reachable tiles from a starting coordinate within the given AP budget.
   * Returns a map of tile key ("x,z") -> { coord, apCost, path }.
   */
  public static getReachableTiles(
    start: GridCoord,
    currentAp: number,
    moveRangePerAp: number,
    grid: Map<string, TileData>,
    units: Unit[],
    movingUnitId: string
  ): Map<string, { coord: GridCoord; apCost: number; path: GridCoord[] }> {
    const reachable = new Map<string, { coord: GridCoord; apCost: number; path: GridCoord[] }>();
    if (currentAp <= 0) return reachable;

    const maxMovementUnits = currentAp * moveRangePerAp;
    const distances = new Map<string, number>();
    const parents = new Map<string, GridCoord | null>();
    const queue: GridCoord[] = [{ x: start.x, z: start.z }];

    const startKey = `${start.x},${start.z}`;
    distances.set(startKey, 0);
    parents.set(startKey, null);

    const neighbors = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];

    while (queue.length > 0) {
      queue.sort((a, b) => (distances.get(`${a.x},${a.z}`) ?? 999) - (distances.get(`${b.x},${b.z}`) ?? 999));
      const current = queue.shift()!;
      const currentDist = distances.get(`${current.x},${current.z}`)!;

      for (const offset of neighbors) {
        const nx = current.x + offset.x;
        const nz = current.z + offset.z;
        const nKey = `${nx},${nz}`;

        if (!this.isWithinBounds(nx, nz)) continue;

        const tile = grid.get(nKey);
        const cost = this.getTileCost(tile);
        if (cost >= 900) continue; // Impassable wall

        const movingUnit = units.find((u) => u.id === movingUnitId);
        const occupiedUnit = units.find(
          (u) => !u.isDead && u.x === nx && u.z === nz && u.id !== movingUnitId
        );

        if (occupiedUnit && movingUnit && occupiedUnit.team !== movingUnit.team) {
          continue; // Blocked by enemy
        }

        const newDist = currentDist + cost;
        if (newDist <= maxMovementUnits) {
          const oldDist = distances.get(nKey) ?? 999;
          if (newDist < oldDist) {
            distances.set(nKey, newDist);
            parents.set(nKey, current);
            queue.push({ x: nx, z: nz });

            // Only add to reachable list if not occupied by any living unit
            if (!occupiedUnit) {
              const apCost = Math.ceil(newDist / moveRangePerAp);
              // Reconstruct path
              const path: GridCoord[] = [];
              let curCoord: GridCoord | null = { x: nx, z: nz };
              while (curCoord) {
                path.unshift(curCoord);
                curCoord = parents.get(`${curCoord.x},${curCoord.z}`) ?? null;
              }
              reachable.set(nKey, { coord: { x: nx, z: nz }, apCost, path });
            }
          }
        }
      }
    }

    return reachable;
  }
}
