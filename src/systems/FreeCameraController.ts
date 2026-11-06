import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * FreeCameraController
 * Provides 6-DOF tactical free flight with WASD keyboard movement
 * and smooth mouse-look blended into the screen (Pointer Lock + Screen-Centered Reticle).
 */
export class FreeCameraController {
  public camera: THREE.Camera | null = null;
  public domElement: HTMLElement | null = null;

  // Orientation in radians
  public yaw: number = 0;
  public pitch: number = -0.48; // Look ~27.5 degrees downward at battlefield

  // Movement physics
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public moveSpeed: number = 8.0; // Normal fly speed (m/s)
  public sprintSpeed: number = 20.0; // Sprint boost speed (m/s)
  public lookSensitivity: number = 0.0022; // Mouse look sensitivity

  // Input states
  public keys: Record<string, boolean> = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    sprint: false,
  };

  public isPointerLocked: boolean = false;
  private isRightMouseDown: boolean = false;
  private isMiddleMouseDown: boolean = false;

  // Crosshair & Status UI Elements
  private crosshairElement: HTMLElement | null = null;
  private crosshairReadout: HTMLElement | null = null;
  private statusBadge: HTMLElement | null = null;

  // Raycast center constant (pointer locked coordinate)
  public static readonly CENTER_POINTER = new THREE.Vector2(0, 0);

  // Callbacks
  public onLockChange?: (locked: boolean) => void;
  public onTileClickFromCrosshair?: () => void;

  constructor() {
    this.createCrosshairUI();
    this.createStatusBadgeUI();
  }

  public init(camera: THREE.Camera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Set initial tactical vantage position overlooking the grid center
    this.camera.position.set(0, 4.5, 6.5);
    this.updateCameraRotation();

    this.bindEvents();
  }

  private updateCameraRotation() {
    if (!this.camera) return;
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  private bindEvents() {
    // Pointer Lock state change listener
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement !== null;
      this.updateUIState();
      this.onLockChange?.(this.isPointerLocked);
    });

    // Mouse movement
    window.addEventListener('mousemove', (e: MouseEvent) => {
      // Rotate when pointer is locked (blended into screen) OR when holding right/middle click
      if (this.isPointerLocked || this.isRightMouseDown || this.isMiddleMouseDown) {
        this.yaw -= e.movementX * this.lookSensitivity;
        this.pitch -= e.movementY * this.lookSensitivity;

        // Clamp vertical pitch to avoid gimbal flip (-88° to +88°)
        const maxPitch = (Math.PI / 2) - 0.03;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

        this.updateCameraRotation();
      }
    });

    // Mouse down / up for drag look and click-to-lock
    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 2) this.isRightMouseDown = true;
      if (e.button === 1) this.isMiddleMouseDown = true;

      // Left click on canvas (outside interactive HUD) to lock pointer if unlocked
      if (e.button === 0 && !this.isPointerLocked) {
        const target = e.target as HTMLElement;
        if (!target.closest('.hud-interactive') && !target.closest('.title-screen-overlay')) {
          this.requestLock();
        }
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 2) this.isRightMouseDown = false;
      if (e.button === 1) this.isMiddleMouseDown = false;
    });

    // Prevent default context menu on right click so right-drag look is fluid
    window.addEventListener('contextmenu', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.hud-interactive')) {
        e.preventDefault();
      }
    });

    // Keyboard controls for WASD 6-DOF tactical flight
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Don't trigger movement if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'Space':
        case 'KeyE':
          this.keys.up = true;
          // Prevent spacebar scrolling page
          e.preventDefault();
          break;
        case 'KeyC':
        case 'KeyQ':
          this.keys.down = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        case 'KeyF':
          // Toggle mouse look lock on 'F' key
          this.toggleLock();
          break;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'Space':
        case 'KeyE':
          this.keys.up = false;
          break;
        case 'KeyC':
        case 'KeyQ':
          this.keys.down = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
      }
    });
  }

  public requestLock() {
    try {
      const canvas = document.querySelector('canvas') || this.domElement || document.body;
      const promise = canvas.requestPointerLock?.();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {});
      }
    } catch {
      // Pointer lock request ignored if not user-initiated
    }
  }

  public exitLock() {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    } catch {}
  }

  public toggleLock() {
    if (this.isPointerLocked) {
      this.exitLock();
    } else {
      this.requestLock();
    }
  }

  public update(delta: number) {
    if (!this.camera) return;

    // 1. Calculate direction vectors based on camera yaw
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
    const up = new THREE.Vector3(0, 1, 0);

    // 2. Build target movement direction
    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.add(forward);
    if (this.keys.backward) moveDir.sub(forward);
    if (this.keys.right) moveDir.add(right);
    if (this.keys.left) moveDir.sub(right);
    if (this.keys.up) moveDir.add(up);
    if (this.keys.down) moveDir.sub(up);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    // 3. Apply speed & sprint boost
    const currentSpeed = this.keys.sprint ? this.sprintSpeed : this.moveSpeed;
    const targetVelocity = moveDir.multiplyScalar(currentSpeed);

    // 4. Smooth inertia damping
    this.velocity.lerp(targetVelocity, Math.min(1, delta * 14));

    // 5. Apply displacement to camera
    this.camera.position.addScaledVector(this.velocity, delta);

    // Keep camera above ground level (prevent clipping below ground)
    if (this.camera.position.y < 0.6) {
      this.camera.position.y = 0.6;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
  }

  public setCrosshairTargetText(text: string | null) {
    if (!this.crosshairReadout) return;
    if (text) {
      this.crosshairReadout.textContent = text;
      this.crosshairReadout.style.display = 'block';
    } else {
      this.crosshairReadout.style.display = 'none';
    }
  }

  private createCrosshairUI() {
    const crosshair = document.createElement('div');
    crosshair.id = 'tactical-crosshair';
    crosshair.className = 'tactical-crosshair hidden';

    crosshair.innerHTML = `
      <div class="crosshair-ring"></div>
      <div class="crosshair-center-dot"></div>
      <div class="crosshair-bracket top-left"></div>
      <div class="crosshair-bracket top-right"></div>
      <div class="crosshair-bracket bottom-left"></div>
      <div class="crosshair-bracket bottom-right"></div>
      <div id="crosshair-readout" class="crosshair-readout" style="display: none;"></div>
    `;

    document.body.appendChild(crosshair);
    this.crosshairElement = crosshair;
    this.crosshairReadout = document.getElementById('crosshair-readout');
  }

  private createStatusBadgeUI() {
    const badge = document.createElement('div');
    badge.id = 'mouselook-status-badge';
    badge.className = 'mouselook-status-badge unlocked hud-interactive';

    badge.innerHTML = `
      <span class="indicator-dot"></span>
      <span id="mouselook-label">MOUSE LOOK: CLICK CANVAS TO BLEND [F]</span>
    `;

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLock();
    });

    document.body.appendChild(badge);
    this.statusBadge = badge;
  }

  private updateUIState() {
    if (this.isPointerLocked) {
      this.crosshairElement?.classList.remove('hidden');
      if (this.statusBadge) {
        this.statusBadge.classList.remove('unlocked');
        this.statusBadge.innerHTML = `
          <span class="indicator-dot"></span>
          <span>MOUSE BLENDED [ACTIVE] • WASD: FLY • ESC: UNLOCK CURSOR</span>
        `;
      }
    } else {
      this.crosshairElement?.classList.add('hidden');
      if (this.statusBadge) {
        this.statusBadge.classList.add('unlocked');
        this.statusBadge.innerHTML = `
          <span class="indicator-dot"></span>
          <span>CURSOR FREE • CLICK CANVAS OR PRESS [F] TO BLEND MOUSE</span>
        `;
      }
    }
  }

  public setVisible(visible: boolean) {
    if (this.statusBadge) {
      this.statusBadge.style.display = visible ? 'flex' : 'none';
    }
    if (!visible) {
      this.crosshairElement?.classList.add('hidden');
    }
  }
}
