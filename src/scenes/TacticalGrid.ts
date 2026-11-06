import * as THREE from 'three';
import { GridCoord, TileData, TileType, Unit } from '../types';

export class TacticalGrid {
  public static readonly TILE_SIZE = 1.0;
  public static readonly GRID_WIDTH = 12;
  public static readonly GRID_DEPTH = 12;

  public group: THREE.Group = new THREE.Group();
  public gridTiles: Map<string, TileData> = new Map();
  public tileMeshes: Map<string, THREE.Mesh> = new Map();
  public interactiveTileMeshes: THREE.Mesh[] = [];
  public coverProps: THREE.Group = new THREE.Group();
  public highlightGroup: THREE.Group = new THREE.Group();
  public effectsGroup: THREE.Group = new THREE.Group();

  public hoverCursor: THREE.Group;
  public pathLine: THREE.Line;
  private pathGeometry: THREE.BufferGeometry;

  constructor() {
    this.group.name = 'TacticalGridArena';
    this.group.add(this.coverProps);
    this.group.add(this.highlightGroup);
    this.group.add(this.effectsGroup);

    // Create Hover Cursor with corner brackets
    this.hoverCursor = this.createHoverCursor();
    this.group.add(this.hoverCursor);

    // Create Path Line
    this.pathGeometry = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4, // Cyber Cyan
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    this.pathLine = new THREE.Line(this.pathGeometry, lineMat);
    this.pathLine.visible = false;
    this.group.add(this.pathLine);
  }

  /**
   * Generates a 12x12 tactical combat zone with procedural cover, elevations, hazards, and terminals.
   */
  public generateMap(nodeType: string) {
    this.gridTiles.clear();
    this.tileMeshes.clear();
    this.interactiveTileMeshes = [];

    while (this.coverProps.children.length > 0) {
      this.coverProps.remove(this.coverProps.children[0]);
    }
    this.clearHighlights();

    // 1. Procedural Sci-Fi Grid Canvas Texture
    const gridTexture = this.createGridTexture();

    // 2. Base Floor Mesh
    const floorGeo = new THREE.PlaneGeometry(
      TacticalGrid.GRID_WIDTH * TacticalGrid.TILE_SIZE,
      TacticalGrid.GRID_DEPTH * TacticalGrid.TILE_SIZE
    );
    floorGeo.rotateX(-Math.PI / 2);

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f19, // Dark Obsidian
      roughness: 0.5,
      metalness: 0.6,
      map: gridTexture,
    });

    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    floorMesh.position.set(
      (TacticalGrid.GRID_WIDTH * TacticalGrid.TILE_SIZE) / 2 - 0.5,
      0,
      (TacticalGrid.GRID_DEPTH * TacticalGrid.TILE_SIZE) / 2 - 0.5
    );
    this.group.add(floorMesh);

    // 3. Create interactive raycast tiles
    const tilePlaneGeo = new THREE.PlaneGeometry(0.98, 0.98);
    tilePlaneGeo.rotateX(-Math.PI / 2);
    const invisibleMat = new THREE.MeshBasicMaterial({
      visible: false,
    });

    // 4. Perimeter defense pylons
    this.createPerimeterWalls();

    // 5. Procedurally generate tactical map tiles
    for (let x = 0; x < TacticalGrid.GRID_WIDTH; x++) {
      for (let z = 0; z < TacticalGrid.GRID_DEPTH; z++) {
        const key = `${x},${z}`;
        let type: TileType = 'empty';
        let height = 0;

        // Custom obstacles based on layout patterns
        if (nodeType === 'boss') {
          // Boss Citadel: Central arena, 4 massive high-cover pillars, 2 terminal nodes
          if (
            (x === 3 && z === 3) ||
            (x === 8 && z === 3) ||
            (x === 3 && z === 8) ||
            (x === 8 && z === 8)
          ) {
            type = 'high_cover';
          } else if (
            (x === 5 && z === 4) ||
            (x === 6 && z === 4) ||
            (x === 5 && z === 7) ||
            (x === 6 && z === 7)
          ) {
            type = 'low_cover';
          } else if ((x === 2 && z === 5) || (x === 9 && z === 6)) {
            type = 'elevation';
            height = 0.45;
          } else if (x === 5 && z === 10) {
            type = 'terminal';
          }
        } else if (nodeType === 'terminal_hack') {
          // Infiltration: 2 Data Terminals with choke barriers and sniper elevation platforms
          if ((x === 3 && z === 4) || (x === 8 && z === 4)) {
            type = 'terminal';
          } else if (
            (x === 2 && z === 4) ||
            (x === 4 && z === 4) ||
            (x === 7 && z === 4) ||
            (x === 9 && z === 4) ||
            (x === 5 && z === 7) ||
            (x === 6 && z === 7)
          ) {
            type = 'low_cover';
          } else if ((x === 5 && z === 5) || (x === 6 && z === 5)) {
            type = 'high_cover';
          } else if ((x === 1 && z === 8) || (x === 10 && z === 8)) {
            type = 'elevation';
            height = 0.5;
          } else if (x === 5 && z === 2) {
            type = 'hazard';
          }
        } else {
          // Standard Skirmish / Ambush tactical map
          if (
            (x === 3 && z === 4) ||
            (x === 8 && z === 4) ||
            (x === 4 && z === 8) ||
            (x === 7 && z === 8)
          ) {
            type = 'high_cover';
          } else if (
            (x === 4 && z === 4) ||
            (x === 7 && z === 4) ||
            (x === 3 && z === 7) ||
            (x === 8 && z === 7) ||
            (x === 5 && z === 6) ||
            (x === 6 && z === 6)
          ) {
            type = 'low_cover';
          } else if ((x === 1 && z === 5) || (x === 10 && z === 6)) {
            type = 'elevation';
            height = 0.45;
          } else if ((x === 5 && z === 3) || (x === 6 && z === 8)) {
            type = 'hazard';
          } else if (x === 10 && z === 3) {
            type = 'terminal';
          }
        }

        const tileData: TileData = { x, z, type, height };
        this.gridTiles.set(key, tileData);

        // Spawn clickable tile raycast mesh
        const raycastMesh = new THREE.Mesh(tilePlaneGeo, invisibleMat);
        raycastMesh.position.set(x * TacticalGrid.TILE_SIZE, height + 0.01, z * TacticalGrid.TILE_SIZE);
        raycastMesh.userData = { gridX: x, gridZ: z };
        this.group.add(raycastMesh);
        this.interactiveTileMeshes.push(raycastMesh);
        this.tileMeshes.set(key, raycastMesh);

        if (type !== 'empty') {
          this.spawnCoverProp(x, z, type, height);
        }
      }
    }
  }

  private createGridTexture(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Background dark obsidian
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, size, size);

    const step = size / TacticalGrid.GRID_WIDTH;

    // Draw main tactical grid lines (Emerald #10b981 & Cyber Cyan #06b6d4)
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.18)'; // Cyber Cyan
    ctx.lineWidth = 2;

    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // Hexagonal / tech brackets in tile corners
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)'; // Emerald
    ctx.lineWidth = 3;
    for (let x = 0; x < TacticalGrid.GRID_WIDTH; x++) {
      for (let y = 0; y < TacticalGrid.GRID_DEPTH; y++) {
        const cx = x * step;
        const cy = y * step;
        const pad = 6;
        const len = 10;

        // Top-left bracket
        ctx.beginPath();
        ctx.moveTo(cx + pad, cy + pad + len);
        ctx.lineTo(cx + pad, cy + pad);
        ctx.lineTo(cx + pad + len, cy + pad);
        ctx.stroke();

        // Bottom-right bracket
        ctx.beginPath();
        ctx.moveTo(cx + step - pad - len, cy + step - pad);
        ctx.lineTo(cx + step - pad, cy + step - pad);
        ctx.lineTo(cx + step - pad, cy + step - pad - len);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createPerimeterWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.7,
      metalness: 0.5,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Neon Emerald
      transparent: true,
      opacity: 0.6,
    });

    const maxW = TacticalGrid.GRID_WIDTH * TacticalGrid.TILE_SIZE;
    const maxD = TacticalGrid.GRID_DEPTH * TacticalGrid.TILE_SIZE;

    // 4 Corner holographic pylons
    const corners = [
      { x: -0.7, z: -0.7 },
      { x: maxW - 0.3, z: -0.7 },
      { x: -0.7, z: maxD - 0.3 },
      { x: maxW - 0.3, z: maxD - 0.3 },
    ];

    corners.forEach((c) => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.4, 8), wallMat);
      pylon.position.set(c.x, 0.7, c.z);
      const beacon = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 16), glowMat);
      beacon.rotation.x = Math.PI / 2;
      beacon.position.set(c.x, 1.3, c.z);
      this.group.add(pylon, beacon);
    });
  }

  private spawnCoverProp(x: number, z: number, type: TileType, elevationHeight = 0) {
    const wx = x * TacticalGrid.TILE_SIZE;
    const wz = z * TacticalGrid.TILE_SIZE;

    const charcoalMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const amberGlow = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.6,
      roughness: 0.1,
    });
    const cyanGlow = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });
    const emeraldGlow = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });

    if (type === 'low_cover') {
      // Half-cover tactical barricade
      const propGroup = new THREE.Group();
      const barricade = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.28), charcoalMat);
      barricade.position.set(0, 0.21, 0);
      const neonStripe = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.04, 0.3), amberGlow);
      neonStripe.position.set(0, 0.41, 0);
      propGroup.add(barricade, neonStripe);
      propGroup.position.set(wx, 0, wz);
      this.coverProps.add(propGroup);
    } else if (type === 'high_cover') {
      // Full-cover heavy power pillar (Blocks LoS)
      const propGroup = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.25, 8), charcoalMat);
      pillar.position.set(0, 0.625, 0);
      const energyCoil = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 8, 16), cyanGlow);
      energyCoil.rotation.x = Math.PI / 2;
      energyCoil.position.set(0, 0.7, 0);
      propGroup.add(pillar, energyCoil);
      propGroup.position.set(wx, 0, wz);
      this.coverProps.add(propGroup);
    } else if (type === 'terminal') {
      // Objective Data Console
      const propGroup = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.55, 6), charcoalMat);
      stand.position.set(0, 0.275, 0);
      const display = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.05), emeraldGlow);
      display.position.set(0, 0.7, 0);
      display.rotation.x = 0.4;
      propGroup.add(stand, display);
      propGroup.position.set(wx, 0, wz);
      this.coverProps.add(propGroup);
    } else if (type === 'elevation') {
      // Elevated tactical sniper platform
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, elevationHeight, 0.96),
        charcoalMat
      );
      step.position.set(wx, elevationHeight / 2, wz);
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(0.38, 0.44, 4),
        cyanGlow
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(wx, elevationHeight + 0.01, wz);
      this.coverProps.add(step, rim);
    } else if (type === 'hazard') {
      // Plasma vent hazard
      const hazardPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.92),
        new THREE.MeshBasicMaterial({
          color: 0xef4444, // Warning Crimson
          transparent: true,
          opacity: 0.45,
          wireframe: true,
        })
      );
      hazardPlane.rotation.x = -Math.PI / 2;
      hazardPlane.position.set(wx, 0.02, wz);
      this.coverProps.add(hazardPlane);
    }
  }

  private createHoverCursor(): THREE.Group {
    const group = new THREE.Group();
    const size = TacticalGrid.TILE_SIZE * 0.95;

    // Glowing corner brackets
    const bracketGeo = new THREE.RingGeometry(size * 0.38, size * 0.46, 4);
    bracketGeo.rotateX(-Math.PI / 2);
    bracketGeo.rotateY(Math.PI / 4);

    const bracketMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Cyber Cyan
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(bracketGeo, bracketMat);
    mesh.position.y = 0.04;
    group.add(mesh);

    group.visible = false;
    return group;
  }

  public setHoverTile(coord: GridCoord | null) {
    if (
      !coord ||
      coord.x < 0 ||
      coord.x >= TacticalGrid.GRID_WIDTH ||
      coord.z < 0 ||
      coord.z >= TacticalGrid.GRID_DEPTH
    ) {
      this.hoverCursor.visible = false;
      return;
    }
    const tile = this.gridTiles.get(`${coord.x},${coord.z}`);
    const height = tile ? tile.height : 0;

    this.hoverCursor.position.set(
      coord.x * TacticalGrid.TILE_SIZE,
      height + 0.04,
      coord.z * TacticalGrid.TILE_SIZE
    );
    this.hoverCursor.visible = true;
  }

  /**
   * Highlights tiles reachable within movement range (blue/cyan for 1 AP, amber for dash).
   */
  public highlightMovementRange(
    reachableMap: Map<string, { coord: GridCoord; apCost: number; path: GridCoord[] }>
  ) {
    this.clearHighlights();

    const geo = new THREE.PlaneGeometry(0.92, 0.92);
    geo.rotateX(-Math.PI / 2);

    for (const [, item] of reachableMap.entries()) {
      const tile = this.gridTiles.get(`${item.coord.x},${item.coord.z}`);
      const h = tile ? tile.height : 0;
      const color = item.apCost === 1 ? 0x06b6d4 : 0xf59e0b; // Cyan vs Amber

      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: item.apCost === 1 ? 0.38 : 0.22,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        item.coord.x * TacticalGrid.TILE_SIZE,
        h + 0.02,
        item.coord.z * TacticalGrid.TILE_SIZE
      );
      this.highlightGroup.add(mesh);
    }
  }

  /**
   * Highlights attackable target tiles in glowing red.
   */
  public highlightAttackRange(origin: GridCoord, maxRange: number, targetUnits: Unit[]) {
    this.clearHighlights();

    const geo = new THREE.RingGeometry(0.35, 0.46, 16);
    geo.rotateX(-Math.PI / 2);

    for (const target of targetUnits) {
      if (target.isDead) continue;
      const dist = Math.hypot(target.x - origin.x, target.z - origin.z);
      if (dist <= maxRange) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xef4444, // Crimson Red
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          target.x * TacticalGrid.TILE_SIZE,
          0.05,
          target.z * TacticalGrid.TILE_SIZE
        );
        this.highlightGroup.add(mesh);
      }
    }
  }

  public clearHighlights() {
    while (this.highlightGroup.children.length > 0) {
      this.highlightGroup.remove(this.highlightGroup.children[0]);
    }
    this.pathLine.visible = false;
  }

  public drawPathPreview(path: GridCoord[]) {
    if (path.length <= 1) {
      this.pathLine.visible = false;
      return;
    }

    const points = path.map((c) => {
      const tile = this.gridTiles.get(`${c.x},${c.z}`);
      const h = tile ? tile.height : 0;
      return new THREE.Vector3(c.x * TacticalGrid.TILE_SIZE, h + 0.06, c.z * TacticalGrid.TILE_SIZE);
    });

    this.pathGeometry.setFromPoints(points);
    this.pathLine.visible = true;
  }

  public spawnLaserBeam(from: THREE.Vector3, to: THREE.Vector3, color = 0x06b6d4, duration = 0.25) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();

    const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, len, 8);
    beamGeo.rotateX(Math.PI / 2);

    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(from).addScaledVector(dir, 0.5);
    beam.lookAt(to);

    this.effectsGroup.add(beam);

    setTimeout(() => {
      this.effectsGroup.remove(beam);
      beamGeo.dispose();
      beamMat.dispose();
    }, duration * 1000);
  }

  public spawnImpactBurst(pos: THREE.Vector3, color = 0x06b6d4) {
    const count = 16;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 0.45;
      positions[i * 3 + 2] = pos.z;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2.5,
          Math.random() * 2.5 + 0.5,
          (Math.random() - 0.5) * 2.5
        )
      );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.1,
      transparent: true,
      opacity: 1,
    });

    const particles = new THREE.Points(geo, mat);
    this.effectsGroup.add(particles);

    let life = 0;
    const interval = setInterval(() => {
      life += 0.03;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        arr[i * 3] += velocities[i].x * 0.03;
        arr[i * 3 + 1] += velocities[i].y * 0.03;
        arr[i * 3 + 2] += velocities[i].z * 0.03;
        velocities[i].y -= 0.09;
      }
      attr.needsUpdate = true;
      mat.opacity = 1 - life / 0.35;

      if (life >= 0.35) {
        clearInterval(interval);
        this.effectsGroup.remove(particles);
        geo.dispose();
        mat.dispose();
      }
    }, 30);
  }

  public update(delta: number) {
    if (this.hoverCursor.visible) {
      this.hoverCursor.rotation.y += delta * 1.8;
    }
  }
}
