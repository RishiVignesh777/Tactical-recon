import { CoverType, GridCoord, SectorNodeType, TileData, TileType } from '../types';

export class TacticalGrid2D {
  public static readonly GRID_WIDTH = 16;
  public static readonly GRID_HEIGHT = 16;
  public static readonly TILE_SIZE = 56; // pixels per tile

  public grid: TileData[][] = [];
  public hoverTile: GridCoord | null = null;
  public reachableTiles: Map<string, { path: GridCoord[]; cost: number }> = new Map();
  public attackRangeTiles: Set<string> = new Set();
  public previewPath: GridCoord[] = [];

  constructor() {
    this.initEmptyGrid();
  }

  private initEmptyGrid() {
    this.grid = [];
    for (let y = 0; y < TacticalGrid2D.GRID_HEIGHT; y++) {
      const row: TileData[] = [];
      for (let x = 0; x < TacticalGrid2D.GRID_WIDTH; x++) {
        row.push({
          x,
          y,
          type: 'empty',
          isBlocked: false,
          coverType: 'none',
        });
      }
      this.grid.push(row);
    }
  }

  public isValid(x: number, y: number): boolean {
    return x >= 0 && x < TacticalGrid2D.GRID_WIDTH && y >= 0 && y < TacticalGrid2D.GRID_HEIGHT;
  }

  public getTile(x: number, y: number): TileData | null {
    if (!this.isValid(x, y)) return null;
    return this.grid[y][x];
  }

  public setOccupied(x: number, y: number, unitId?: string) {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.occupiedBy = unitId;
    }
  }

  public setHoverTile(coord: GridCoord | null) {
    this.hoverTile = coord;
  }

  public setReachableTiles(reachable: Map<string, { path: GridCoord[]; cost: number }>) {
    this.reachableTiles = reachable;
  }

  public clearReachableTiles() {
    this.reachableTiles.clear();
    this.previewPath = [];
  }

  public setAttackRangeTiles(tiles: Set<string>) {
    this.attackRangeTiles = tiles;
  }

  public clearAttackRangeTiles() {
    this.attackRangeTiles.clear();
  }

  public setPreviewPath(path: GridCoord[]) {
    this.previewPath = path;
  }

  public clearPreviewPath() {
    this.previewPath = [];
  }

  public generateMap(nodeType: SectorNodeType) {
    this.initEmptyGrid();
    this.reachableTiles.clear();
    this.attackRangeTiles.clear();
    this.previewPath = [];

    // Deterministic procedural generation based on node type
    switch (nodeType) {
      case 'terminal_hack':
        this.generateTerminalInfiltrationMap();
        break;
      case 'ambush':
        this.generateAmbushChokepointMap();
        break;
      case 'boss':
        this.generateBossCitadelMap();
        break;
      case 'skirmish':
      default:
        this.generateStandardSkirmishMap();
        break;
    }
  }

  private setTile(x: number, y: number, type: TileType, coverType: CoverType, isBlocked: boolean) {
    if (!this.isValid(x, y)) return;
    this.grid[y][x].type = type;
    this.grid[y][x].coverType = coverType;
    this.grid[y][x].isBlocked = isBlocked;
  }

  private generateStandardSkirmishMap() {
    // Center bunker structure with high-tech energy pillars and low cover barricades
    const centerObstacles = [
      // High Cover (Energy Pillars - blocks LoS)
      { x: 5, y: 5, type: 'high_cover' as TileType, cover: 'full' as CoverType, block: true },
      { x: 10, y: 5, type: 'high_cover' as TileType, cover: 'full' as CoverType, block: true },
      { x: 5, y: 10, type: 'high_cover' as TileType, cover: 'full' as CoverType, block: true },
      { x: 10, y: 10, type: 'high_cover' as TileType, cover: 'full' as CoverType, block: true },
      { x: 7, y: 7, type: 'high_cover' as TileType, cover: 'full' as CoverType, block: true },
      { x: 8, y: 8, type: 'high_cover' as TileType, cover: 'full' as CoverType, block: true },

      // Low Cover (Barricades / Crates - grant 50% defense)
      { x: 4, y: 7, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 4, y: 8, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 11, y: 7, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 11, y: 8, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 7, y: 4, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 8, y: 4, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 7, y: 11, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 8, y: 11, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },

      // Flank barricades
      { x: 2, y: 4, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 2, y: 11, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 13, y: 4, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },
      { x: 13, y: 11, type: 'low_cover' as TileType, cover: 'half' as CoverType, block: false },

      // Hazards (plasma conduit leaks)
      { x: 7, y: 9, type: 'hazard' as TileType, cover: 'none' as CoverType, block: false },
      { x: 8, y: 6, type: 'hazard' as TileType, cover: 'none' as CoverType, block: false },
    ];

    centerObstacles.forEach((o) => this.setTile(o.x, o.y, o.type, o.cover, o.block));
  }

  private generateTerminalInfiltrationMap() {
    this.generateStandardSkirmishMap();

    // Add 2 Hackable Data Terminals
    this.setTile(4, 5, 'terminal', 'none', false);
    this.setTile(11, 10, 'terminal', 'none', false);

    // Guard barricades near terminals
    this.setTile(3, 5, 'low_cover', 'half', false);
    this.setTile(12, 10, 'low_cover', 'half', false);
  }

  private generateAmbushChokepointMap() {
    // Narrow canyon with central barrier dividing upper and lower flanking paths
    for (let x = 3; x <= 12; x++) {
      if (x !== 7 && x !== 8) {
        this.setTile(x, 7, 'high_cover', 'full', true);
        this.setTile(x, 8, 'high_cover', 'full', true);
      } else {
        this.setTile(x, 7, 'low_cover', 'half', false);
        this.setTile(x, 8, 'low_cover', 'half', false);
      }
    }

    // Flank barricades
    this.setTile(2, 3, 'low_cover', 'half', false);
    this.setTile(13, 3, 'low_cover', 'half', false);
    this.setTile(2, 12, 'low_cover', 'half', false);
    this.setTile(13, 12, 'low_cover', 'half', false);

    // Hazardous plasma vent in the central chokepoint
    this.setTile(7, 6, 'hazard', 'none', false);
    this.setTile(8, 9, 'hazard', 'none', false);
  }

  private generateBossCitadelMap() {
    // High-tech fortified throne room for the Sector Titan Boss
    // Boss arena in top center (x: 6-9, y: 2-5)
    // Pillar ring protecting the boss
    const pillars = [
      { x: 3, y: 3 },
      { x: 12, y: 3 },
      { x: 3, y: 9 },
      { x: 12, y: 9 },
      { x: 5, y: 6 },
      { x: 10, y: 6 },
      { x: 6, y: 11 },
      { x: 9, y: 11 },
    ];
    pillars.forEach((p) => this.setTile(p.x, p.y, 'high_cover', 'full', true));

    // Heavy barricades
    const barricades = [
      { x: 5, y: 8 },
      { x: 10, y: 8 },
      { x: 7, y: 10 },
      { x: 8, y: 10 },
      { x: 4, y: 5 },
      { x: 11, y: 5 },
    ];
    barricades.forEach((b) => this.setTile(b.x, b.y, 'low_cover', 'half', false));

    // Overcharge plasma conduits
    this.setTile(4, 9, 'hazard', 'none', false);
    this.setTile(11, 9, 'hazard', 'none', false);
  }
}
