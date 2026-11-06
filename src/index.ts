import * as THREE from 'three';
import * as xb from 'xrblocks';
import { TacticalGrid } from './scenes/TacticalGrid';
import { CampaignManager } from './systems/CampaignManager';
import { CombatFSM } from './systems/CombatFSM';
import { TacticalHUD } from './ui/TacticalHUD';
import { MechBuilder } from './models/MechBuilder';
import { Pathfinding } from './systems/Pathfinding';
import { FreeCameraController } from './systems/FreeCameraController';
import { sound } from './systems/AudioSynth';
import { GridCoord } from './types';

/**
 * Sci-Fi Tactical Recon - WebXR Tactical Rogue-lite Experience
 * Supports 6-DOF Free Camera WASD flight and smooth mouse-look blended into the screen.
 */
class TacticalReconScene extends xb.Script {
  public grid: TacticalGrid;
  public campaign: CampaignManager;
  public fsm: CombatFSM;
  public hud: TacticalHUD | null = null;
  public freeCam: FreeCameraController;
  public unitMeshesGroup: THREE.Group = new THREE.Group();

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointer: THREE.Vector2 = new THREE.Vector2();
  private isTitleScreen: boolean = true;

  constructor() {
    super();
    this.grid = new TacticalGrid();
    this.campaign = new CampaignManager();
    this.fsm = new CombatFSM(this.grid);
    this.freeCam = new FreeCameraController();
  }

  public init() {
    // Studio PBR lighting & atmosphere
    this.setupLighting();

    // Add 3D grid and units container
    this.add(this.grid.group);
    this.add(this.unitMeshesGroup);

    // Center 12x12 arena at (0, 0, 0) in 3D world space
    const centerOffset = (TacticalGrid.GRID_WIDTH * TacticalGrid.TILE_SIZE) / 2 - 0.5;
    this.grid.group.position.set(-centerOffset, 0, -centerOffset);
    this.unitMeshesGroup.position.copy(this.grid.group.position);

    // Initialize HUD overlay
    this.hud = new TacticalHUD(this.fsm, this.campaign, (nodeId) => {
      this.deployMission(nodeId);
    });

    // Wire up Free Cam button in HUD
    this.hud.onToggleCam = () => {
      this.freeCam.toggleLock();
    };

    // Initialize free camera controller once camera is available
    if (xb.core.camera) {
      this.freeCam.init(xb.core.camera, document.body);
    }

    // Start title screen
    this.renderTitleScreen();

    // Desktop mouse, wheel, keyboard, and action hotkeys
    this.setupDesktopControls();
  }

  private setupLighting() {
    // Cool sky/ground ambient fill
    const hemiLight = new THREE.HemisphereLight(0x7090b0, 0x0b0f19, 2.5);
    this.add(hemiLight);

    // Key directional light with soft shadows
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 2.4);
    dirLight.position.set(6, 14, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.bias = -0.0005;
    this.add(dirLight);

    // Neon Emerald & Cyan Rim Lights
    const cyanRim = new THREE.DirectionalLight(0x06b6d4, 1.4);
    cyanRim.position.set(-9, 7, -6);
    this.add(cyanRim);

    const emeraldRim = new THREE.DirectionalLight(0x10b981, 1.0);
    emeraldRim.position.set(9, 5, -6);
    this.add(emeraldRim);

    // Horizon fog
    if (xb.core.scene) {
      xb.core.scene.fog = new THREE.FogExp2(0x070b14, 0.035);
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

      <div class="controls-hint-bar" style="flex-wrap: wrap; justify-content: center;">
        <span>🖱️ Mouse: Move Directions / Aim</span>
        <span>•</span>
        <span>⌨️ WASD: Fly & Move Freely</span>
        <span>•</span>
        <span>Shift: Sprint Boost</span>
        <span>•</span>
        <span>Space/C: Ascend/Descend</span>
        <span>•</span>
        <span>F: Toggle Mouse Lock</span>
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

      // Auto-request pointer lock for blended mouse look experience
      setTimeout(() => {
        this.freeCam.requestLock();
      }, 300);
    });
  }

  public deployMission(nodeId: string) {
    const node = this.campaign.sectorNodes.get(nodeId);
    const nodeType = node ? node.type : 'skirmish';

    // 1. Generate 3D grid layout
    this.grid.generateMap(nodeType);

    // 2. Start combat FSM (populates units list with squad and enemies)
    this.fsm.initMission(this.campaign.persistentSquad, nodeType);

    // 3. Spawn 3D meshes for all units (player squad + enemies)
    this.spawnMissionMeshes();

    // 4. Update HUD
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
      mesh.userData = { unitId: u.id };
      const tile = this.grid.gridTiles.get(`${u.x},${u.z}`);
      const h = tile ? tile.height : 0;
      mesh.position.set(u.x * TacticalGrid.TILE_SIZE, h, u.z * TacticalGrid.TILE_SIZE);
      u.mesh = mesh;
      this.unitMeshesGroup.add(mesh);
    });
  }

  private setupDesktopControls() {
    window.addEventListener('pointermove', (event) => {
      if (!this.freeCam.isPointerLocked) {
        this.updatePointerCoords(event);
      }
      this.handleHover();
    });

    window.addEventListener('pointerdown', (event) => {
      // Don't trigger if clicked on HUD
      if ((event.target as HTMLElement).closest('.hud-interactive') || this.isTitleScreen) {
        return;
      }

      if (!this.freeCam.isPointerLocked) {
        this.updatePointerCoords(event);
      }
      this.handleClick();
    });

    // Hotkeys for rapid tactical command
    window.addEventListener('keydown', (e) => {
      if (this.isTitleScreen) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      const activeUnit = this.fsm.getSelectedUnit();

      // Action Hotkeys: 1 = Move, 2 = Fire/Attack, 3/4 = Skills, Enter = End Turn
      if (e.code === 'Digit1') {
        this.fsm.setAction('MOVE');
        this.hud?.render();
      } else if (e.code === 'Digit2') {
        this.fsm.setAction('ATTACK');
        this.hud?.render();
      } else if (e.code === 'Digit3' && activeUnit?.abilities[0]) {
        this.fsm.setAction('ABILITY_1');
        this.hud?.render();
      } else if (e.code === 'Digit4' && activeUnit?.abilities[1]) {
        this.fsm.setAction('ABILITY_2');
        this.hud?.render();
      } else if (e.code === 'Enter') {
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

  /**
   * Performs direct raycast against interactive tile meshes and unit meshes.
   * When pointer lock is active, aims straight down the center reticle.
   */
  private getGridCoordUnderPointer(): GridCoord | null {
    if (!xb.core.camera || this.grid.interactiveTileMeshes.length === 0) return null;

    // In pointer lock mode, raycast from the exact center (crosshair)
    const raycastPointer = this.freeCam.isPointerLocked
      ? FreeCameraController.CENTER_POINTER
      : this.pointer;

    this.raycaster.setFromCamera(raycastPointer, xb.core.camera);

    // First check if an interactive tile mesh was hit
    const intersects = this.raycaster.intersectObjects(this.grid.interactiveTileMeshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const gx = hit.object.userData.gridX;
      const gz = hit.object.userData.gridZ;
      if (typeof gx === 'number' && typeof gz === 'number') {
        return { x: gx, z: gz };
      }
    }

    // Fallback: check unit mesh hits
    const unitIntersects = this.raycaster.intersectObjects(this.unitMeshesGroup.children, true);
    if (unitIntersects.length > 0) {
      let obj: THREE.Object3D | null = unitIntersects[0].object;
      while (obj && obj !== this.unitMeshesGroup) {
        if (obj.userData?.unitId) {
          const unit = this.fsm.units.find((u) => u.id === obj!.userData.unitId);
          if (unit) return { x: unit.x, z: unit.z };
        }
        obj = obj.parent;
      }
    }

    return null;
  }

  private handleHover() {
    if (this.isTitleScreen || this.fsm.state !== 'PLAYER_TURN') return;

    const coord = this.getGridCoordUnderPointer();
    this.grid.setHoverTile(coord);

    // Update crosshair telemetry readout if in mouse-look mode
    if (this.freeCam.isPointerLocked) {
      if (coord) {
        const unitAtTile = this.fsm.units.find((u) => u.x === coord.x && u.z === coord.z && !u.isDead);
        if (unitAtTile) {
          const teamLabel = unitAtTile.team === 'enemy' ? 'HOSTILE' : 'SQUAD';
          this.freeCam.setCrosshairTargetText(
            `[${teamLabel}: ${unitAtTile.name.toUpperCase()} | HP: ${unitAtTile.hp}/${unitAtTile.maxHp}]`
          );
        } else {
          const tile = this.grid.gridTiles.get(`${coord.x},${coord.z}`);
          const typeLabel = tile ? tile.type.toUpperCase() : 'SECTOR';
          this.freeCam.setCrosshairTargetText(`[TILE: ${coord.x},${coord.z} // ${typeLabel}]`);
        }
      } else {
        this.freeCam.setCrosshairTargetText(null);
      }
    }

    const activeUnit = this.fsm.getSelectedUnit();
    if (activeUnit && this.fsm.currentAction === 'MOVE' && coord) {
      const reachable = Pathfinding.getReachableTiles(
        { x: activeUnit.x, z: activeUnit.z },
        activeUnit.ap,
        activeUnit.moveRange,
        this.fsm.grid.gridTiles,
        this.fsm.units,
        activeUnit.id
      );

      const targetPath = reachable.get(`${coord.x},${coord.z}`);
      if (targetPath) {
        this.grid.drawPathPreview(targetPath.path);
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

    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion);

    this.raycaster.set(controllerPos, forward);
    const intersects = this.raycaster.intersectObjects(this.grid.interactiveTileMeshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const gx = hit.object.userData.gridX;
      const gz = hit.object.userData.gridZ;
      if (typeof gx === 'number' && typeof gz === 'number') {
        void this.fsm.handleTileClick({ x: gx, z: gz });
      }
    }
  }

  public update() {
    const delta = xb.getDeltaTime?.() ?? 0.016;

    // Update 6-DOF free tactical camera position & orientation
    if (!xb.core.renderer.xr.isPresenting) {
      this.freeCam.update(delta);

      // If mouse look is locked, continuously update hover as camera turns
      if (this.freeCam.isPointerLocked) {
        this.handleHover();
      }
    }

    // Update grid animations
    this.grid.update(delta);

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
document.addEventListener('DOMContentLoaded', async () => {
  const options = new xb.Options();
  options.setAppTitle('Sci-Fi Tactical Recon');
  options.setAppDescription(
    'Turn-based tactical rogue-lite featuring mechs, A* pathfinding, line-of-sight raycasting, and sector campaign traversal in XR.'
  );

  const scene = new TacticalReconScene();
  xb.add(scene);
  await xb.init(options);

  // Disconnect simulator default controls so FreeCameraController has exclusive, seamless control
  if (xb.core.simulator?.controls) {
    xb.core.simulator.controls.disconnect();
  }
});
