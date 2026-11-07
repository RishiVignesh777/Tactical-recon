import { TacticalGrid2D } from './scenes/TacticalGrid2D';
import { Camera2D } from './systems/Camera2D';
import { Renderer2D } from './scenes/Renderer2D';
import { CombatFSM2D } from './systems/CombatFSM2D';
import { CampaignManager } from './systems/CampaignManager';
import { TacticalHUD } from './ui/TacticalHUD';
import { Pathfinding2D } from './systems/Pathfinding2D';
import { sound } from './systems/AudioSynth';
import { GridCoord } from './types';

/**
 * Sci-Fi Tactical Recon - 2D Top-Down Tactical Strategy Engine
 * Deterministic HTML5 Canvas 2D rendering pipeline with procedural vector graphics,
 * 2D orthographic camera, Bresenham LoS, and A* pathfinding.
 */
class TacticalReconGame {
  private canvas: HTMLCanvasElement;
  public camera: Camera2D;
  public grid: TacticalGrid2D;
  public renderer: Renderer2D;
  public fsm: CombatFSM2D;
  public campaign: CampaignManager;
  public hud: TacticalHUD | null = null;

  private isTitleScreen: boolean = true;
  private lastTime: number = performance.now();

  // Mouse interaction state
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private isPointerDown: boolean = false;
  private isMouseDragging: boolean = false;

  constructor() {
    const container = document.getElementById('game-container')!;
    container.innerHTML = '';

    // Create primary 2D canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'tactical-canvas';
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '1';
    container.appendChild(this.canvas);

    this.resizeCanvas();

    // Initialize core subsystems
    this.camera = new Camera2D();
    this.grid = new TacticalGrid2D();
    this.renderer = new Renderer2D(this.canvas, this.camera, this.grid);
    this.campaign = new CampaignManager();
    this.fsm = new CombatFSM2D(this.grid);

    this.fsm.setRendererAndCamera(this.renderer, this.camera);

    // Initialize Tactical HUD
    this.hud = new TacticalHUD(this.fsm, this.campaign, (nodeId) => {
      this.deployMission(nodeId);
    });

    this.hud.onToggleCam = () => {
      // Recenter camera on selected unit or grid
      const u = this.fsm.getSelectedUnit();
      if (u) {
        this.camera.centerOn((u.x + 0.5) * TacticalGrid2D.TILE_SIZE, (u.y + 0.5) * TacticalGrid2D.TILE_SIZE);
      } else {
        this.camera.centerOnGrid(TacticalGrid2D.GRID_WIDTH, TacticalGrid2D.GRID_HEIGHT, TacticalGrid2D.TILE_SIZE);
      }
    };

    // Center camera on grid initially
    this.camera.centerOnGrid(TacticalGrid2D.GRID_WIDTH, TacticalGrid2D.GRID_HEIGHT, TacticalGrid2D.TILE_SIZE);

    (window as unknown as { game: TacticalReconGame }).game = this;

    // Bind inputs
    this.bindEvents();

    // Show Title Screen
    this.renderTitleScreen();

    // Start 60 FPS Game Loop
    requestAnimationFrame((now) => this.gameLoop(now));
  }

  private resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
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
        <div class="game-title-main">SCI-FI TACTICAL RECON 2D</div>
        <div class="game-subtitle">Turn-Based Tactical Grid Operations</div>
      </div>

      <div class="title-actions-row">
        <button id="btn-deploy-squad" class="hud-btn accent" style="padding: 18px 48px; font-size: 18px;">
          INITIALIZE MISSION ▸
        </button>
      </div>

      <div class="controls-hint-bar" style="flex-wrap: wrap; justify-content: center;">
        <span>🖱️ Click: Select Unit / Move / Attack</span>
        <span>•</span>
        <span>🖱️ Drag / WASD: Pan Camera</span>
        <span>•</span>
        <span>Wheel: Zoom Viewport</span>
        <span>•</span>
        <span>Space: End Turn</span>
        <span>•</span>
        <span>1-4: Action Hotkeys</span>
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

    // 1. Generate 2D grid matrix
    this.grid.generateMap(nodeType);

    // 2. Initialize combat state machine
    this.fsm.initMission(this.campaign.persistentSquad, nodeType);

    // 3. Center camera on squad
    this.camera.centerOnGrid(TacticalGrid2D.GRID_WIDTH, TacticalGrid2D.GRID_HEIGHT, TacticalGrid2D.TILE_SIZE);

    // 4. Update HUD
    this.hud?.render();
  }

  private bindEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.camera.updateViewport();
    });

    // Mouse Pointer Events
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.isTitleScreen) return;

      this.isPointerDown = true;
      this.isMouseDragging = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      // Start drag panning on right-click or middle-click immediately
      if (e.button === 1 || e.button === 2) {
        this.camera.startDrag(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.isTitleScreen) return;

      if (this.isPointerDown) {
        const dx = Math.abs(e.clientX - this.dragStartX);
        const dy = Math.abs(e.clientY - this.dragStartY);
        if (dx > 5 || dy > 5) {
          this.isMouseDragging = true;
          if (!this.camera.isDragging) {
            this.camera.startDrag(e.clientX, e.clientY);
          }
        }
      }

      if (this.camera.isDragging) {
        this.camera.drag(e.clientX, e.clientY);
      } else {
        // Tile hover detection
        const coord = this.camera.screenToGrid(e.clientX, e.clientY, TacticalGrid2D.TILE_SIZE);
        this.grid.setHoverTile(coord);

        // Update path preview if in MOVE mode
        const activeUnit = this.fsm.getSelectedUnit();
        if (activeUnit && this.fsm.currentAction === 'MOVE' && coord && this.grid.isValid(coord.x, coord.y)) {
          const key = `${coord.x},${coord.y}`;
          const pathInfo = this.grid.reachableTiles.get(key);
          if (pathInfo) {
            this.grid.setPreviewPath(pathInfo.path);
          } else {
            this.grid.clearPreviewPath();
          }
        } else {
          this.grid.clearPreviewPath();
        }
      }
    });

    window.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.isTitleScreen) return;

      if (this.camera.isDragging) {
        this.camera.endDrag();
      }

      // If clicked without dragging and not clicking on HUD element, handle tile click
      if (this.isPointerDown && !this.isMouseDragging && e.button === 0) {
        const target = e.target as HTMLElement;
        if (!target.closest('.hud-interactive')) {
          const coord = this.camera.screenToGrid(e.clientX, e.clientY, TacticalGrid2D.TILE_SIZE);
          if (coord && this.grid.isValid(coord.x, coord.y)) {
            void this.fsm.handleTileClick(coord);
          }
        }
      }

      this.isPointerDown = false;
      this.isMouseDragging = false;
    });

    // Zoom on wheel
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (this.isTitleScreen) return;
      e.preventDefault();
      this.camera.handleZoom(e.deltaY, e.clientX, e.clientY);
    }, { passive: false });

    // Prevent context menu on right click to allow smooth right-click drag
    this.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });

    // Keyboard WASD / Action hotkeys
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.isTitleScreen) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // WASD / Arrow camera panning
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.camera.keys.up = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.camera.keys.down = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.camera.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.camera.keys.right = true;
          break;
        case 'Digit1':
          this.fsm.setAction('MOVE');
          this.hud?.render();
          break;
        case 'Digit2':
          this.fsm.setAction('ATTACK');
          this.hud?.render();
          break;
        case 'Digit3': {
          const u = this.fsm.getSelectedUnit();
          if (u?.abilities[0]) {
            if (u.abilities[0].targetType === 'self') {
              void this.fsm.executeAbility(u, u.abilities[0], null, { x: u.x, y: u.y });
            } else {
              this.fsm.setAction('ABILITY_1');
              this.hud?.render();
            }
          }
          break;
        }
        case 'Digit4': {
          const u = this.fsm.getSelectedUnit();
          if (u?.abilities[1]) {
            if (u.abilities[1].targetType === 'self') {
              void this.fsm.executeAbility(u, u.abilities[1], null, { x: u.x, y: u.y });
            } else {
              this.fsm.setAction('ABILITY_2');
              this.hud?.render();
            }
          }
          break;
        }
        case 'KeyH':
          void this.fsm.executeHackTerminal();
          break;
        case 'Space':
        case 'Enter':
          e.preventDefault();
          if (this.fsm.state === 'PLAYER_TURN') {
            void this.fsm.endTurn();
          }
          break;
        case 'KeyR':
        case 'Home':
          this.camera.centerOnGrid(TacticalGrid2D.GRID_WIDTH, TacticalGrid2D.GRID_HEIGHT, TacticalGrid2D.TILE_SIZE);
          break;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.camera.keys.up = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.camera.keys.down = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.camera.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.camera.keys.right = false;
          break;
      }
    });
  }

  private gameLoop(now: number) {
    const delta = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // 1. Update camera movement
    this.camera.update(delta);

    // 2. Update visual effects
    this.renderer.updateFX(delta);

    // 3. Render 2D Frame
    this.renderer.render(this.fsm.units, this.fsm.getSelectedUnit());

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Launch Game on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  new TacticalReconGame();
});
