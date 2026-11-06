import * as THREE from 'three';
import { GridCoord, TileData, TileType, Unit } from '../types';

export class TacticalGrid {
  public static readonly TILE_SIZE = 1.0;
  public static readonly GRID_WIDTH = 10;
  public static readonly GRID_DEPTH = 10;

  public group: THREE.Group = new THREE.Group();
  public gridTiles: Map<string, TileData> = new Map();
  public tileMeshes: Map<string, THREE.Mesh> = new Map();
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

    // Create Hover Cursor
    this.hoverCursor = this.createHoverCursor();
    this.group.add(this.hoverCursor);

    // Create Path Line
    this.pathGeometry = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
    });
    this.pathLine = new THREE.Line(this.pathGeometry, lineMat);
    this.pathLine.visible = false;
    this.group.add(this.pathLine);
  }

  /**
   * Initializes a tactical map layout based on mission node type.
   */
  public generateMap(nodeType: string) {
    // Clear existing
    this.gridTiles.clear();
    this.tileMeshes.clear();
    while (this.coverProps.children.length > 0) {
      this.coverProps.remove(this.coverProps.children[0]);
    }
    this.clearHighlights();

    // Create base floor grid
    const floorGeo = new THREE.PlaneGeometry(
      TacticalGrid.GRID_WIDTH * TacticalGrid.TILE_SIZE,
      TacticalGrid.GRID_DEPTH * TacticalGrid.TILE_SIZE,
      TacticalGrid.GRID_WIDTH,
      TacticalGrid.GRID_DEPTH
    );
    floorGeo.rotateX(-Math.PI / 2);

    // Create tile outlines texture
    const gridTexture = this.createGridTexture();
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d1527,
      roughness: 0.6,
      metalness: 0.4,
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

    // Create perimeter boundary barrier
    this.createPerimeterWalls();

    // Populate tile data & props
    for (let x = 0; x < TacticalGrid.GRID_WIDTH; x++) {
      for (let z = 0; z < TacticalGrid.GRID_DEPTH; z++) {
        const key = `${x},${z}`;
        let type: TileType = 'empty';
        let height = 0;

        // Custom obstacles based on layout patterns
        if (nodeType === 'boss') {
          // Boss arena with central open space and outer high cover pillars
          if ((x === 2 || x === 7) && (z === 2 || z === 7)) {
            type = 'high_cover';
          } else if ((x === 4 || x === 5) && (z === 2 || z === 7)) {
            type = 'low_cover';
          } else if (x === 4 && z === 8) {
            type = 'terminal';
          }
        } else if (nodeType === 'terminal_hack') {
          // Objective terminals with defensive barricades
          if ((x === 3 && z === 5) || (x === 7 && z === 3)) {
            type = 'terminal';
          } else if ((x === 2 && z === 5) || (x === 6 && z === 3)) {
            type = 'low_cover';
          } else if (x === 4 && z === 4) {
            type = 'high_cover';
          } else if ((x === 1 && z === 1) || (x === 8 && z === 8)) {
            type = 'elevation';
            height = 0.4;
          }
        } else {
          // Standard skirmish tactical layout
          if ((x === 3 && z === 3) || (x === 6 && z === 6) || (x === 2 && z === 7)) {
            type = 'high_cover';
          } else if (
            (x === 4 && z === 3) ||
            (x === 5 && z === 6) ||
            (x === 3 && z === 7) ||
            (x === 7 && z === 2)
          ) {
            type = 'low_cover';
          } else if ((x === 1 && z === 4) || (x === 8 && z === 5)) {
            type = 'elevation';
            height = 0.4;
          } else if (x === 5 && z === 4) {
            type = 'hazard';
          } else if (x === 8 && z === 2) {
            type = 'terminal';
          }
        }

        const tileData: TileData = { x, z, type, height };
        this.gridTiles.set(key, tileData);

        if (type !== 'empty') {
          this.spawnCoverProp(x, z, type, height);
        }
      }
    }
  }

  private createGridTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0a101d';
    ctx.fillRect(0, 0, size, size);

    // Draw sub-grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 2;
    const step = size / 10;

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

    // Hexagonal / tech corner accents
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 3;
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const cx = x * step;
        const cy = y * step;
        ctx.strokeRect(cx + 4, cy + 4, 6, 6);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private createPerimeterWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x050c18,
      roughness: 0.8,
      metalness: 0.3,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.4,
    });

    const halfW = (TacticalGrid.GRID_WIDTH * TacticalGrid.TILE_SIZE) / 2 - 0.5;
    const halfD = (TacticalGrid.GRID_DEPTH * TacticalGrid.TILE_SIZE) / 2 - 0.5;

    // Corner glowing pylons
    const corners = [
      { x: -0.8, z: -0.8 },
      { x: 9.8, z: -0.8 },
      { x: -0.8, z: 9.8 },
      { x: 9.8, z: 9.8 },
    ];

    corners.forEach((c) => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), wallMat);
      pylon.position.set(c.x, 0.6, c.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 12), glowMat);
      ring.position.set(c.x, 1.1, c.z);
      ring.rotation.x = Math.PI / 2;
      this.group.add(pylon, ring);
    });
  }

  private spawnCoverProp(x: number, z: number, type: TileType, elevationHeight = 0) {
    const wx = x * TacticalGrid.TILE_SIZE;
    const wz = z * TacticalGrid.TILE_SIZE;

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x223048,
      metalness: 0.8,
      roughness: 0.3,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0x553300,
      roughness: 0.4,
    });
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.5,
    });

    if (type === 'low_cover') {
      // Half-cover barricade
      const propGroup = new THREE.Group();
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.4, 0.25), metalMat);
      barrier.position.set(0, 0.2, 0);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.28), hazardMat);
      trim.position.set(0, 0.38, 0);
      propGroup.add(barrier, trim);
      propGroup.position.set(wx, 0, wz);
      this.coverProps.add(propGroup);
    } else if (type === 'high_cover') {
      // Tall power generator / pillar
      const propGroup = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.1, 8), metalMat);
      pillar.position.set(0, 0.55, 0);
      const powerCore = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 8, 16), cyanGlowMat);
      powerCore.rotation.x = Math.PI / 2;
      powerCore.position.set(0, 0.6, 0);
      propGroup.add(pillar, powerCore);
      propGroup.position.set(wx, 0, wz);
      this.coverProps.add(propGroup);
    } else if (type === 'terminal') {
      // Holographic objective console
      const propGroup = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.5, 6), metalMat);
      stand.position.set(0, 0.25, 0);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.04), cyanGlowMat);
      screen.position.set(0, 0.65, 0);
      screen.rotation.x = 0.4;
      propGroup.add(stand, screen);
      propGroup.position.set(wx, 0, wz);
      this.coverProps.add(propGroup);
    } else if (type === 'elevation') {
      // Stepped metal platform
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, elevationHeight, 0.96),
        metalMat
      );
      stepMesh.position.set(wx, elevationHeight / 2, wz);
      this.coverProps.add(stepMesh);
    } else if (type === 'hazard') {
      // Electrified plasma vent
      const hazardPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({
          color: 0xff3366,
          transparent: true,
          opacity: 0.4,
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
    const size = TacticalGrid.TILE_SIZE * 0.96;

    // Glowing border wireframe
    const geo = new THREE.RingGeometry(size * 0.4, size * 0.48, 4);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 4);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.03;
    group.add(mesh);

    group.visible = false;
    return group;
  }

  public setHoverTile(coord: GridCoord | null) {
    if (!coord || coord.x < 0 || coord.x >= TacticalGrid.GRID_WIDTH || coord.z < 0 || coord.z >= TacticalGrid.GRID_DEPTH) {
      this.hoverCursor.visible = false;
      return;
    }
    const tile = this.gridTiles.get(`${coord.x},${coord.z}`);
    const height = tile ? tile.height : 0;

    this.hoverCursor.position.set(
      coord.x * TacticalGrid.TILE_SIZE,
      height + 0.03,
      coord.z * TacticalGrid.TILE_SIZE
    );
    this.hoverCursor.visible = true;
  }

  /**
   * Highlights tiles reachable within movement range (cyan for normal, amber for dash).
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
      const color = item.apCost === 1 ? 0x00f0ff : 0xffaa00;

      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: item.apCost === 1 ? 0.35 : 0.2,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(item.coord.x * TacticalGrid.TILE_SIZE, h + 0.02, item.coord.z * TacticalGrid.TILE_SIZE);
      this.highlightGroup.add(mesh);
    }
  }

  /**
   * Highlights attackable target tiles in crimson.
   */
  public highlightAttackRange(origin: GridCoord, maxRange: number, targetUnits: Unit[]) {
    this.clearHighlights();

    const geo = new THREE.RingGeometry(0.35, 0.45, 16);
    geo.rotateX(-Math.PI / 2);

    for (const target of targetUnits) {
      if (target.isDead) continue;
      const dist = Math.hypot(target.x - origin.x, target.z - origin.z);
      if (dist <= maxRange) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff3366,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          target.x * TacticalGrid.TILE_SIZE,
          0.04,
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

  /**
   * Displays preview path line connecting current unit to hovered destination.
   */
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

  /**
   * Spawns an animated laser / plasma projectile beam between two world points.
   */
  public spawnLaserBeam(from: THREE.Vector3, to: THREE.Vector3, color = 0x00f0ff, duration = 0.25) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();

    const beamGeo = new THREE.CylinderGeometry(0.03, 0.03, len, 8);
    beamGeo.rotateX(Math.PI / 2);

    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
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

  /**
   * Spawns an animated impact spark burst on hit.
   */
  public spawnImpactBurst(pos: THREE.Vector3, color = 0x00f0ff) {
    const count = 12;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 0.4;
      positions[i * 3 + 2] = pos.z;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 2 + 0.5,
          (Math.random() - 0.5) * 2
        )
      );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.08,
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
        velocities[i].y -= 0.08; // Gravity
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
      this.hoverCursor.rotation.y += delta * 1.5;
    }
  }
}
