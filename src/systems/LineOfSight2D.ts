import { CoverType, GridCoord, TileData } from '../types';

export interface LoSResult {
  hasLoS: boolean;
  cover: CoverType;
  distance: number;
  damageMultiplier: number; // 1.0 = none, 0.5 = half cover, 0.0 = full cover blocked
  hitChanceModifier: number; // e.g. -25% for half cover
  rayCells: GridCoord[];
}

export class LineOfSight2D {
  /**
   * Evaluates Line of Sight and Cover between two points on the 2D grid
   * using Bresenham's Line Algorithm.
   */
  public static checkLoS(
    from: GridCoord,
    to: GridCoord,
    grid: TileData[][]
  ): LoSResult {
    const rayCells = LineOfSight2D.bresenhamLine(from.x, from.y, to.x, to.y);
    const distance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));

    // Intermediate cells between source and destination (excluding source and target)
    for (let i = 1; i < rayCells.length - 1; i++) {
      const cell = rayCells[i];
      const tile = grid[cell.y]?.[cell.x];
      if (!tile) continue;

      // Full cover (energy pillars/walls) blocks Line of Sight completely
      if (tile.isBlocked || tile.coverType === 'full') {
        return {
          hasLoS: false,
          cover: 'full',
          distance,
          damageMultiplier: 0,
          hitChanceModifier: -100,
          rayCells,
        };
      }
    }

    // Check if target is behind or occupying cover
    const targetTile = grid[to.y]?.[to.x];
    let cover: CoverType = 'none';

    if (targetTile && targetTile.coverType === 'half') {
      cover = 'half';
    } else {
      // Check if immediate adjacent cell in direction of incoming fire provides cover
      if (rayCells.length >= 2) {
        const adjacentToTarget = rayCells[rayCells.length - 2];
        const adjTile = grid[adjacentToTarget.y]?.[adjacentToTarget.x];
        if (adjTile && adjTile.coverType === 'half') {
          cover = 'half';
        }
      }
    }

    const damageMultiplier = cover === 'half' ? 0.5 : 1.0;
    const hitChanceModifier = cover === 'half' ? -25 : 0;

    return {
      hasLoS: true,
      cover,
      distance,
      damageMultiplier,
      hitChanceModifier,
      rayCells,
    };
  }

  /**
   * Bresenham's integer line algorithm generating all grid cells intersected by the line.
   */
  public static bresenhamLine(x0: number, y0: number, x1: number, y1: number): GridCoord[] {
    const points: GridCoord[] = [];

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let curX = x0;
    let curY = y0;

    while (true) {
      points.push({ x: curX, y: curY });

      if (curX === x1 && curY === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        curX += sx;
      }
      if (e2 < dx) {
        err += dx;
        curY += sy;
      }
    }

    return points;
  }
}
