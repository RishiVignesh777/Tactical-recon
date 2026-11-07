import { GridCoord, TileData, Unit } from '../types';

interface AStarNode {
  coord: GridCoord;
  gCost: number;
  hCost: number;
  fCost: number;
  parent: AStarNode | null;
}

export class Pathfinding2D {
  private static readonly CARDINAL_DIRS: GridCoord[] = [
    { x: 0, y: -1 }, // North
    { x: 1, y: 0 },  // East
    { x: 0, y: 1 },  // South
    { x: -1, y: 0 }, // West
  ];

  /**
   * Calculates all reachable tiles from a starting point within available Action Points (AP).
   */
  public static getReachableTiles(
    start: GridCoord,
    ap: number,
    moveRange: number,
    grid: TileData[][],
    units: Unit[],
    movingUnitId: string
  ): Map<string, { path: GridCoord[]; cost: number }> {
    const reachable = new Map<string, { path: GridCoord[]; cost: number }>();
    if (ap <= 0) return reachable;

    const maxTiles = ap * moveRange;
    const height = grid.length;
    const width = grid[0].length;

    // Build occupied lookup (excluding the moving unit itself)
    const occupied = new Set<string>();
    units.forEach((u) => {
      if (!u.isDead && u.id !== movingUnitId) {
        occupied.add(`${u.x},${u.y}`);
      }
    });

    const queue: { coord: GridCoord; path: GridCoord[]; cost: number }[] = [];
    const visitedCosts = new Map<string, number>();

    const startKey = `${start.x},${start.y}`;
    visitedCosts.set(startKey, 0);
    queue.push({ coord: start, path: [start], cost: 0 });

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const dir of Pathfinding2D.CARDINAL_DIRS) {
        const nx = current.coord.x + dir.x;
        const ny = current.coord.y + dir.y;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const tile = grid[ny][nx];
        if (tile.isBlocked) continue; // High-cover or impassable wall

        const nKey = `${nx},${ny}`;
        // Units cannot step into occupied tiles
        const isOccupied = occupied.has(nKey);

        const newCost = current.cost + 1;
        if (newCost > maxTiles) continue;

        if (!visitedCosts.has(nKey) || newCost < visitedCosts.get(nKey)!) {
          visitedCosts.set(nKey, newCost);
          const newPath = [...current.path, { x: nx, y: ny }];

          if (!isOccupied) {
            reachable.set(nKey, {
              path: newPath.slice(1), // exclude starting tile
              cost: Math.ceil(newCost / moveRange),
            });
            queue.push({ coord: { x: nx, y: ny }, path: newPath, cost: newCost });
          }
        }
      }
    }

    return reachable;
  }

  /**
   * Computes the shortest A* path from start to goal.
   */
  public static findPath(
    start: GridCoord,
    goal: GridCoord,
    grid: TileData[][],
    units: Unit[],
    movingUnitId: string
  ): GridCoord[] {
    const height = grid.length;
    const width = grid[0].length;

    if (start.x === goal.x && start.y === goal.y) return [];
    if (goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height) return [];

    const goalTile = grid[goal.y][goal.x];
    if (goalTile.isBlocked) return [];

    // Occupied set
    const occupied = new Set<string>();
    units.forEach((u) => {
      if (!u.isDead && u.id !== movingUnitId) {
        occupied.add(`${u.x},${u.y}`);
      }
    });

    if (occupied.has(`${goal.x},${goal.y}`)) return [];

    const openList: AStarNode[] = [];
    const closedSet = new Set<string>();

    const startNode: AStarNode = {
      coord: start,
      gCost: 0,
      hCost: Pathfinding2D.manhattan(start, goal),
      fCost: Pathfinding2D.manhattan(start, goal),
      parent: null,
    };
    openList.push(startNode);

    while (openList.length > 0) {
      // Find lowest fCost node
      let lowestIndex = 0;
      for (let i = 1; i < openList.length; i++) {
        if (
          openList[i].fCost < openList[lowestIndex].fCost ||
          (openList[i].fCost === openList[lowestIndex].fCost && openList[i].hCost < openList[lowestIndex].hCost)
        ) {
          lowestIndex = i;
        }
      }

      const current = openList.splice(lowestIndex, 1)[0];
      const curKey = `${current.coord.x},${current.coord.y}`;
      closedSet.add(curKey);

      // Reached goal
      if (current.coord.x === goal.x && current.coord.y === goal.y) {
        const path: GridCoord[] = [];
        let curr: AStarNode | null = current;
        while (curr && curr.parent) {
          path.unshift(curr.coord);
          curr = curr.parent;
        }
        return path;
      }

      // Check neighbors
      for (const dir of Pathfinding2D.CARDINAL_DIRS) {
        const nx = current.coord.x + dir.x;
        const ny = current.coord.y + dir.y;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const tile = grid[ny][nx];
        if (tile.isBlocked) continue;

        const nKey = `${nx},${ny}`;
        if (closedSet.has(nKey)) continue;

        // Cannot pass through occupied tile unless it is the goal
        if (occupied.has(nKey) && !(nx === goal.x && ny === goal.y)) continue;

        const gCost = current.gCost + 1;
        const hCost = Pathfinding2D.manhattan({ x: nx, y: ny }, goal);
        const fCost = gCost + hCost;

        const existingOpen = openList.find((n) => n.coord.x === nx && n.coord.y === ny);
        if (existingOpen) {
          if (gCost < existingOpen.gCost) {
            existingOpen.gCost = gCost;
            existingOpen.fCost = fCost;
            existingOpen.parent = current;
          }
        } else {
          openList.push({
            coord: { x: nx, y: ny },
            gCost,
            hCost,
            fCost,
            parent: current,
          });
        }
      }
    }

    return [];
  }

  /**
   * For AI bots targeting an occupied player tile:
   * Finds the best path towards a tile adjacent to or within attack range of the target.
   */
  public static findPathTowardsTarget(
    start: GridCoord,
    target: GridCoord,
    grid: TileData[][],
    units: Unit[],
    movingUnitId: string,
    desiredRange: number = 1
  ): GridCoord[] {
    const height = grid.length;
    const width = grid[0].length;

    // Check if already in desired range
    const curDist = Pathfinding2D.chebyshev(start, target);
    if (curDist <= desiredRange) {
      return [];
    }

    // Candidate landing tiles surrounding target within desired range
    const candidates: { coord: GridCoord; distToStart: number }[] = [];

    for (let dy = -desiredRange; dy <= desiredRange; dy++) {
      for (let dx = -desiredRange; dx <= desiredRange; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = target.x + dx;
        const ny = target.y + dy;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const tile = grid[ny][nx];
        if (tile.isBlocked) continue;

        // Cannot be occupied by another unit
        const isOccupied = units.some((u) => !u.isDead && u.id !== movingUnitId && u.x === nx && u.y === ny);
        if (isOccupied) continue;

        const d = Pathfinding2D.manhattan(start, { x: nx, y: ny });
        candidates.push({ coord: { x: nx, y: ny }, distToStart: d });
      }
    }

    // Sort candidates closest to start
    candidates.sort((a, b) => a.distToStart - b.distToStart);

    for (const cand of candidates) {
      const path = Pathfinding2D.findPath(start, cand.coord, grid, units, movingUnitId);
      if (path.length > 0) {
        return path;
      }
    }

    return [];
  }

  public static manhattan(a: GridCoord, b: GridCoord): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  public static chebyshev(a: GridCoord, b: GridCoord): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  public static euclidean(a: GridCoord, b: GridCoord): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
