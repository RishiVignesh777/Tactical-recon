import * as THREE from 'three';
import * as xb from 'xrblocks';
import { TacticalGrid } from './scenes/TacticalGrid';
import { CampaignManager } from './systems/CampaignManager';
import { CombatFSM } from './systems/CombatFSM';
import { TacticalHUD } from './ui/TacticalHUD';
import { MechBuilder } from './models/MechBuilder';
import { sound } from './systems/AudioSynth';
import { GridCoord } from './types';

/**
 * Sci-Fi Tactical Recon - WebXR Tactical Rogue-lite Experience
 */
class TacticalReconScene extends xb.Script {
  public grid: TacticalGrid;
  public campaign: CampaignManager;
  public fsm: CombatFSM;
  public hud: TacticalHUD | null = null;
  public unitMeshesGroup: THREE.Group = new THREE.Group();

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointer: THREE.Vector2 = new THREE.Vector2();
  private gridPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hoveredTile: GridCoord | null = null;
  private isTitleScreen: boolean = true;
  private cameraAngle: number = 0;
  private targetCameraAngle: number = 0;

  constructor() {
    super();
    this.grid = new TacticalGrid();
    this.campaign = new CampaignManager();
    this.fsm = new CombatFSM(this.grid);
  }

  public init() {
    // Studio PBR lighting & atmosphere
    this.setupLighting();

    // Add 3D grid and units container
    this.add(this.grid.group);
    this.add(this.unitMeshesGroup);

    // Position tactical arena comfortably in front of user in XR/Desktop
    // In XR, users typically view tabletop content 1.2m high and 1.5m - 2.5m away.
    this.grid.group.position.set(-4.5, 0.7, -4.5);
    this.unitMeshesGroup.position.copy(this.grid.group.position);

    // Initialize HUD overlay
    this.hud = new TacticalHUD(this.fsm, this.campaign, (nodeId) => {
      this.deployMission(nodeId);
    });

    // Start title screen
    this.renderTitleScreen();

    // Mouse and Keyboard input listeners for desktop simulator
    this.setupDesktopControls();
  }

  private setupLighting() {
    // Cool sky/ground ambient fill
    const hemiLight = new THREE.HemisphereLight(0x7090b0, 0x141e30, 2.5);
    this.add(hemiLight);

    // Warm key directional light with soft shadows
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    dirLight.position.set(5, 12, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.bias = -0.0005;
    this.add(dirLight);

    // Neon accent rim light
    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
    rimLight.position.set(-8, 6, -5);
    this.add(rimLight);

    // Horizon fog
    if (xb.core.scene) {
      xb.core.scene.fog = new THREE.FogExp2(0x070b14, 0.04);
    }
  }

  private renderTitleScreen() {
    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-screen-overlay';
    titleContainer.id = 'title-screen';

    titleContainer.innerHTML = `
      <div class="game-logo-lockup">
        <div style="font-family: var(--font-display); font-size: 13px; color: var(--neon-cyan); letter-spacing: 0.4em;">
          // ORBITAL TACTICAL COMMAND //
        </div>
        <div class="game-title-main">SCI-FI TACTICAL RECON</div>
        <div class="game-subtitle">Turn-Based Rogue-Lite Operations</div>
      </div>

      <div class="title-actions-row">
        <button id="btn-deploy-squad" class="hud-btn accent" style="padding: 18px 48px; font-size: 18px;">
          INITIALIZE MISSION ▸
        </button>
      </div>

      <div class="controls-hint-bar">
        <span>🖱️ Click Tile: Move / Target</span>
        <span>•</span>
        <span>Q / E: Rotate Camera View</span>
        <span>•</span>
        <span>Space: End Turn</span>
      </div>

      <div class="xr-preview-banner">
        The XR app is best viewed in an Android XR device like Galaxy XR or XREAL AURA. On desktop, we provide you a simulated environment for previewing the app.
      </div>
    `;

    document.body.appendChild(titleContainer);

    document.getElementById('btn-deploy-squad')?.addEventListener('click', () => {
      sound.playSelect();
      titleContainer.remove();
      this.isTitleScreen = false;
      this.deployMission('node_0');
    });
  }

  public deployMission(nodeId: string) {
    const node = this.campaign.sectorNodes.get(nodeId);
    const nodeType = node ? node.type : 'skirmish';

    // Generate 3D grid layout
    this.grid.generateMap(nodeType);

    // Start combat FSM (populates units list with squad and enemies)
    this.fsm.initMission(this.campaign.persistentSquad, nodeType);

    // Spawn 3D meshes for all units (player squad + enemies)
    this.spawnMissionMeshes();

    // Update HUD
    this.hud?.render();
  }

  private spawnMissionMeshes() {
    // Clear old unit meshes
    while (this.unitMeshesGroup.children.length > 0) {
      this.unitMeshesGroup.remove(this.unitMeshesGroup.children[0]);
    }

    // Create 3D meshes for all units in combat
    this.fsm.units.forEach((u) => {
      const mesh = MechBuilder.buildUnitMesh(u);
      const tile = this.grid.gridTiles.get(`${u.x},${u.z}`);
      const h = tile ? tile.height : 0;
      mesh.position.set(u.x, h, u.z);
      u.mesh = mesh;
      this.unitMeshesGroup.add(mesh);
    });
  }

  private setupDesktopControls() {
    window.addEventListener('pointermove', (event) => {
      this.updatePointerCoords(event);
      this.handleHover();
    });

    window.addEventListener('pointerdown', (event) => {
      // Don't trigger if clicked on HUD
      if ((event.target as HTMLElement).closest('.hud-interactive') || this.isTitleScreen) {
        return;
      }
      this.updatePointerCoords(event);
      this.handleClick();
    });

    window.addEventListener('keydown', (e) => {
      if (this.isTitleScreen) return;

      if (e.key === 'q' || e.key === 'Q') {
        this.targetCameraAngle += Math.PI / 4;
      } else if (e.key === 'e' || e.key === 'E') {
        this.targetCameraAngle -= Math.PI / 4;
      } else if (e.code === 'Space') {
        if (this.fsm.state === 'PLAYER_TURN') {
          void this.fsm.endTurn();
        }
      }
    });
  }

  private updatePointerCoords(event: PointerEvent) {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  private getGridCoordUnderPointer(): GridCoord | null {
    if (!xb.core.camera) return null;

    this.raycaster.setFromCamera(this.pointer, xb.core.camera);

    // Intersect plane at the grid height
    const worldPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.grid.group.position.y),
      worldPoint
    );

    if (!hit) return null;

    // Convert world point to grid local coordinates
    const local = worldPoint.sub(this.grid.group.position);
    const gx = Math.round(local.x / TacticalGrid.TILE_SIZE);
    const gz = Math.round(local.z / TacticalGrid.TILE_SIZE);

    if (gx >= 0 && gx < TacticalGrid.GRID_WIDTH && gz >= 0 && gz < TacticalGrid.GRID_DEPTH) {
      return { x: gx, z: gz };
    }
    return null;
  }

  private handleHover() {
    if (this.isTitleScreen || this.fsm.state !== 'PLAYER_TURN') return;

    const coord = this.getGridCoordUnderPointer();
    this.hoveredTile = coord;
    this.grid.setHoverTile(coord);

    const activeUnit = this.fsm.getSelectedUnit();
    if (activeUnit && this.fsm.currentAction === 'MOVE' && coord) {
      const reachable = this.fsm.grid.gridTiles.get(`${coord.x},${coord.z}`);
      if (reachable && reachable.type !== 'high_cover') {
        // Draw path preview line
        const path = this.fsm.grid.gridTiles;
        const computedPath = [
          { x: activeUnit.x, z: activeUnit.z },
          { x: coord.x, z: coord.z },
        ];
        this.grid.drawPathPreview(computedPath);
      } else {
        this.grid.pathLine.visible = false;
      }
    } else {
      this.grid.pathLine.visible = false;
    }
  }

  private handleClick() {
    if (this.isTitleScreen) return;
    const coord = this.getGridCoordUnderPointer();
    if (coord) {
      void this.fsm.handleTileClick(coord);
    }
  }

  // WebXR Controller / Hand Interactivity
  public onSelectStart(event: xb.SelectEvent) {
    if (this.isTitleScreen) return;
    const controller = event.source.controller;
    if (!controller) return;

    // Raycast from controller forward vector
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion);

    this.raycaster.set(controllerPos, forward);
    const worldPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.grid.group.position.y),
      worldPoint
    );

    if (hit) {
      const local = worldPoint.sub(this.grid.group.position);
      const gx = Math.round(local.x / TacticalGrid.TILE_SIZE);
      const gz = Math.round(local.z / TacticalGrid.TILE_SIZE);

      if (gx >= 0 && gx < TacticalGrid.GRID_WIDTH && gz >= 0 && gz < TacticalGrid.GRID_DEPTH) {
        void this.fsm.handleTileClick({ x: gx, z: gz });
      }
    }
  }

  public update() {
    const delta = xb.getDeltaTime?.() ?? 0.016;

    // Update grid animations
    this.grid.update(delta);

    // Smooth camera orbital rotation easing
    this.cameraAngle = THREE.MathUtils.damp(this.cameraAngle, this.targetCameraAngle, 5, delta);
    if (this.grid.group && !xb.core.renderer.xr.isPresenting) {
      this.grid.group.rotation.y = this.cameraAngle;
      this.unitMeshesGroup.rotation.y = this.cameraAngle;
    }

    // Keep floating vitals billboarded facing camera
    if (xb.core.camera) {
      this.fsm.units.forEach((u) => {
        if (u.healthBarGroup && !u.isDead) {
          u.healthBarGroup.quaternion.copy(xb.core.camera.quaternion);
        }
      });
    }
  }
}

// Start application
document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.setAppTitle('Sci-Fi Tactical Recon');
  options.setAppDescription(
    'Turn-based tactical rogue-lite featuring mechs, A* pathfinding, line-of-sight raycasting, and sector campaign traversal in XR.'
  );

  xb.add(new TacticalReconScene());
  xb.init(options);
});
