import { GridCoord } from '../types';

export class Camera2D {
  public x: number = 0; // World pan offset
  public y: number = 0;
  public zoom: number = 1.0;

  public minZoom: number = 0.55;
  public maxZoom: number = 2.4;

  public viewportWidth: number = window.innerWidth;
  public viewportHeight: number = window.innerHeight;

  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeTimer: number = 0;
  public shakeOffset: { x: number; y: number } = { x: 0, y: 0 };

  // Key movement flags
  public keys: { left: boolean; right: boolean; up: boolean; down: boolean } = {
    left: false,
    right: false,
    up: false,
    down: false,
  };

  public isDragging: boolean = false;
  private lastDragX: number = 0;
  private lastDragY: number = 0;

  constructor() {
    this.updateViewport();
  }

  public updateViewport() {
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
  }

  public centerOn(worldX: number, worldY: number) {
    this.x = this.viewportWidth / 2 - worldX * this.zoom;
    this.y = this.viewportHeight / 2 - worldY * this.zoom;
  }

  public centerOnGrid(gridWidth: number, gridHeight: number, tileSize: number) {
    const totalW = gridWidth * tileSize;
    const totalH = gridHeight * tileSize;
    // Set appropriate default zoom so entire map is comfortably visible
    const availableW = this.viewportWidth * 0.75;
    const availableH = this.viewportHeight * 0.72;
    const scaleW = availableW / totalW;
    const scaleH = availableH / totalH;
    this.zoom = Math.min(1.4, Math.max(0.7, Math.min(scaleW, scaleH)));

    this.centerOn(totalW / 2, totalH / 2);
  }

  public startDrag(screenX: number, screenY: number) {
    this.isDragging = true;
    this.lastDragX = screenX;
    this.lastDragY = screenY;
  }

  public drag(screenX: number, screenY: number) {
    if (!this.isDragging) return;
    const dx = screenX - this.lastDragX;
    const dy = screenY - this.lastDragY;
    this.x += dx;
    this.y += dy;
    this.lastDragX = screenX;
    this.lastDragY = screenY;
  }

  public endDrag() {
    this.isDragging = false;
  }

  public handleZoom(deltaY: number, mouseX: number, mouseY: number) {
    const zoomFactor = deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * zoomFactor));

    // Anchor zoom around cursor position
    const worldXBefore = (mouseX - this.x) / this.zoom;
    const worldYBefore = (mouseY - this.y) / this.zoom;

    this.zoom = newZoom;

    this.x = mouseX - worldXBefore * this.zoom;
    this.y = mouseY - worldYBefore * this.zoom;
  }

  public shake(intensity: number = 10, duration: number = 0.35) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  public update(delta: number) {
    // WASD keyboard panning
    const panSpeed = 650 / this.zoom; // faster when zoomed out
    if (this.keys.left) this.x += panSpeed * delta;
    if (this.keys.right) this.x -= panSpeed * delta;
    if (this.keys.up) this.y += panSpeed * delta;
    if (this.keys.down) this.y -= panSpeed * delta;

    // Update screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      const progress = Math.max(0, this.shakeTimer / this.shakeDuration);
      const currentIntensity = this.shakeIntensity * progress;
      this.shakeOffset.x = (Math.random() * 2 - 1) * currentIntensity;
      this.shakeOffset.y = (Math.random() * 2 - 1) * currentIntensity;
    } else {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
    }
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.x - this.shakeOffset.x) / this.zoom,
      y: (screenY - this.y - this.shakeOffset.y) / this.zoom,
    };
  }

  public screenToGrid(screenX: number, screenY: number, tileSize: number): GridCoord | null {
    const world = this.screenToWorld(screenX, screenY);
    const gx = Math.floor(world.x / tileSize);
    const gy = Math.floor(world.y / tileSize);
    return { x: gx, y: gy };
  }

  public gridToScreen(gridX: number, gridY: number, tileSize: number): { x: number; y: number } {
    const worldX = (gridX + 0.5) * tileSize;
    const worldY = (gridY + 0.5) * tileSize;
    return {
      x: worldX * this.zoom + this.x + this.shakeOffset.x,
      y: worldY * this.zoom + this.y + this.shakeOffset.y,
    };
  }

  public applyTransform(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x + this.shakeOffset.x, this.y + this.shakeOffset.y);
    ctx.scale(this.zoom, this.zoom);
  }

  public restoreTransform(ctx: CanvasRenderingContext2D) {
    ctx.restore();
  }
}
