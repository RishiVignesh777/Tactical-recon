import { Camera2D } from '../systems/Camera2D';
import { TacticalGrid2D } from './TacticalGrid2D';
import { FloatingNumberFX, GridCoord, LaserFX, ParticleFX, TileData, Unit } from '../types';

export class Renderer2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera2D;
  private grid: TacticalGrid2D;

  // Active visual effects
  public lasers: LaserFX[] = [];
  public floatingNumbers: FloatingNumberFX[] = [];
  public particles: ParticleFX[] = [];

  // Animation pulse clock
  private animTime: number = 0;

  constructor(canvas: HTMLCanvasElement, camera: Camera2D, grid: TacticalGrid2D) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
    this.grid = grid;
  }

  public addLaser(startX: number, startY: number, targetX: number, targetY: number, color: string = '#06b6d4', width: number = 4) {
    this.lasers.push({
      id: Math.random().toString(),
      startX,
      startY,
      targetX,
      targetY,
      color,
      width,
      alpha: 1.0,
      duration: 0.28,
      maxDuration: 0.28,
    });
  }

  public addFloatingNumber(gridX: number, gridY: number, text: string, color: string = '#f87171', fontSize: number = 18) {
    const tileSize = TacticalGrid2D.TILE_SIZE;
    this.floatingNumbers.push({
      id: Math.random().toString(),
      x: (gridX + 0.5) * tileSize,
      y: (gridY + 0.2) * tileSize,
      text,
      color,
      fontSize,
      alpha: 1.0,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  public addParticles(worldX: number, worldY: number, count: number = 14, color: string = '#06b6d4') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x: worldX,
        y: worldY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 3.5,
        alpha: 1.0,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
      });
    }
  }

  public updateFX(delta: number) {
    this.animTime += delta;

    // Update lasers
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.duration -= delta;
      l.alpha = Math.max(0, l.duration / l.maxDuration);
      if (l.duration <= 0) {
        this.lasers.splice(i, 1);
      }
    }

    // Update floating combat texts
    for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
      const fn = this.floatingNumbers[i];
      fn.life -= delta;
      fn.y -= 38 * delta; // float upward
      fn.alpha = Math.max(0, fn.life / fn.maxLife);
      if (fn.life <= 0) {
        this.floatingNumbers.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  public render(units: Unit[], selectedUnit: Unit | null) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // 1. Clear viewport with deep sci-fi canvas background (#090d16)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw animated cyber background grid in screen space
    this.drawBackgroundGrid(w, h);

    // 3. Apply Camera 2D transform (Pan, Zoom, Screen Shake)
    this.camera.applyTransform(ctx);

    const tileSize = TacticalGrid2D.TILE_SIZE;

    // 4. Render Grid Tiles
    this.drawTilemap(tileSize);

    // 5. Render Interactive Overlays (Movement, Attack Range, Hover, Path Preview)
    this.drawInteractiveOverlays(tileSize);

    // 6. Render Units (Mechs & Bots)
    this.drawUnits(units, selectedUnit, tileSize);

    // 7. Render Combat Visual FX (Lasers, Particles, Floating Numbers)
    this.drawVisualFX();

    // 8. Restore Camera Transform
    this.camera.restoreTransform(ctx);
  }

  private drawBackgroundGrid(w: number, h: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.035)';
    ctx.lineWidth = 1;

    const bgStep = 48;
    const offsetX = (this.camera.x * 0.25) % bgStep;
    const offsetY = (this.camera.y * 0.25) % bgStep;

    ctx.beginPath();
    for (let x = offsetX; x < w; x += bgStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = offsetY; y < h; y += bgStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Subtle radial glow at center
    const grad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.6);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.05)');
    grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.02)');
    grad.addColorStop(1, 'rgba(9, 13, 22, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  private drawTilemap(tileSize: number) {
    const { ctx } = this;
    const grid = this.grid.grid;

    // Grid outer border shadow
    const totalW = TacticalGrid2D.GRID_WIDTH * tileSize;
    const totalH = TacticalGrid2D.GRID_HEIGHT * tileSize;

    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-2, -2, totalW + 4, totalH + 4);
    ctx.restore();

    for (let y = 0; y < TacticalGrid2D.GRID_HEIGHT; y++) {
      for (let x = 0; x < TacticalGrid2D.GRID_WIDTH; x++) {
        const tile = grid[y][x];
        const px = x * tileSize;
        const py = y * tileSize;

        this.drawSingleTile(tile, px, py, tileSize);
      }
    }
  }

  private drawSingleTile(tile: TileData, px: number, py: number, size: number) {
    const { ctx } = this;

    // Base floor tile: dark metallic panel (#131c2e)
    const isEven = (tile.x + tile.y) % 2 === 0;
    ctx.fillStyle = isEven ? '#121b2d' : '#0f1726';
    ctx.fillRect(px, py, size, size);

    // Subtle inner tile bevel seam
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

    // Tech corner markers
    ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
    ctx.fillRect(px + 2, py + 2, 2, 2);
    ctx.fillRect(px + size - 4, py + 2, 2, 2);

    // Specific Tile Features
    if (tile.type === 'low_cover') {
      // Half-Cover: Reinforced Tactical Crate / Low Barricade
      this.drawLowCover(px, py, size);
    } else if (tile.type === 'high_cover') {
      // Full-Cover: High-Tech Energy Pillar / Fusion Generator (LoS Blocker)
      this.drawHighCover(px, py, size);
    } else if (tile.type === 'terminal') {
      // Hackable Data Terminal
      this.drawTerminal(tile, px, py, size);
    } else if (tile.type === 'hazard') {
      // Plasma Hazard Conduit
      this.drawHazard(px, py, size);
    }
  }

  private drawLowCover(px: number, py: number, size: number) {
    const { ctx } = this;
    const margin = 8;
    const w = size - margin * 2;
    const h = size - margin * 2;

    ctx.save();
    // Crate base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + margin, py + margin, w, h);

    // Tech cyan borders & chevron
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + margin, py + margin, w, h);

    // Diagonal reinforced struts
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.beginPath();
    ctx.moveTo(px + margin, py + margin);
    ctx.lineTo(px + margin + w, py + margin + h);
    ctx.moveTo(px + margin + w, py + margin);
    ctx.lineTo(px + margin, py + margin + h);
    ctx.stroke();

    // Shield badge icon
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛊', px + size / 2, py + size / 2);

    ctx.restore();
  }

  private drawHighCover(px: number, py: number, size: number) {
    const { ctx } = this;
    const margin = 5;
    const w = size - margin * 2;
    const h = size - margin * 2;

    ctx.save();
    // Solid pillar structure
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + margin, py + margin, w, h);

    // Glowing amber/crimson energy core
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 3);
    ctx.strokeStyle = `rgba(245, 158, 11, ${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + margin, py + margin, w, h);

    // Inner generator core
    ctx.fillStyle = `rgba(245, 158, 11, ${0.15 + pulse * 0.2})`;
    ctx.fillRect(px + margin + 4, py + margin + 4, w - 8, h - 8);

    // LoS Blocker indicator
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLOCK', px + size / 2, py + size / 2);

    ctx.restore();
  }

  private drawTerminal(tile: TileData, px: number, py: number, size: number) {
    const { ctx } = this;
    const cx = px + size / 2;
    const cy = py + size / 2;

    ctx.save();
    const isHacked = tile.hacked;
    const pulse = Math.sin(this.animTime * 4);

    // Pulsing data holographic rings
    ctx.strokeStyle = isHacked ? '#10b981' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isHacked ? 'rgba(16, 185, 129, 0.25)' : 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isHacked ? '#10b981' : '#38bdf8';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isHacked ? '✓' : '💾', cx, cy);

    ctx.restore();
  }

  private drawHazard(px: number, py: number, size: number) {
    const { ctx } = this;
    const margin = 4;
    ctx.save();

    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 5);
    ctx.fillStyle = `rgba(236, 72, 153, ${0.18 + pulse * 0.15})`;
    ctx.fillRect(px + margin, py + margin, size - margin * 2, size - margin * 2);

    ctx.strokeStyle = `rgba(244, 114, 182, ${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(px + margin, py + margin, size - margin * 2, size - margin * 2);

    ctx.fillStyle = '#f472b6';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', px + size / 2, py + size / 2);

    ctx.restore();
  }

  private drawInteractiveOverlays(tileSize: number) {
    const { ctx } = this;

    // 1. Attack Range Overlay (Red semi-transparent)
    if (this.grid.attackRangeTiles.size > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
      ctx.lineWidth = 1.5;

      for (const key of this.grid.attackRangeTiles) {
        const [x, y] = key.split(',').map(Number);
        const px = x * tileSize;
        const py = y * tileSize;

        ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
        ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
      }
      ctx.restore();
    }

    // 2. Movement Range Overlay (Cyan semi-transparent)
    if (this.grid.reachableTiles.size > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)';
      ctx.lineWidth = 1.5;

      for (const [key] of this.grid.reachableTiles) {
        const [x, y] = key.split(',').map(Number);
        const px = x * tileSize;
        const py = y * tileSize;

        ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
        ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
      }
      ctx.restore();
    }

    // 3. Animated Path Preview Vector (Dotted glowing line with step markers)
    if (this.grid.previewPath.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -this.animTime * 35; // marching ants animation

      ctx.beginPath();
      for (let i = 0; i < this.grid.previewPath.length; i++) {
        const p = this.grid.previewPath[i];
        const px = (p.x + 0.5) * tileSize;
        const py = (p.y + 0.5) * tileSize;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Destination target reticle
      const dest = this.grid.previewPath[this.grid.previewPath.length - 1];
      const dpx = (dest.x + 0.5) * tileSize;
      const dpy = (dest.y + 0.5) * tileSize;

      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(dpx, dpy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 4. Hover Highlight Box with Coordinates Display
    if (this.grid.hoverTile && this.grid.isValid(this.grid.hoverTile.x, this.grid.hoverTile.y)) {
      const hx = this.grid.hoverTile.x * tileSize;
      const hy = this.grid.hoverTile.y * tileSize;

      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx, hy, tileSize, tileSize);

      // Corner brackets
      ctx.fillStyle = '#22d3ee';
      const bLen = 6;
      ctx.fillRect(hx, hy, bLen, 2);
      ctx.fillRect(hx, hy, 2, bLen);
      ctx.fillRect(hx + tileSize - bLen, hy, bLen, 2);
      ctx.fillRect(hx + tileSize - 2, hy, 2, bLen);
      ctx.fillRect(hx, hy + tileSize - 2, bLen, 2);
      ctx.fillRect(hx, hy + tileSize - bLen, 2, bLen);
      ctx.fillRect(hx + tileSize - bLen, hy + tileSize - 2, bLen, 2);
      ctx.fillRect(hx + tileSize - 2, hy + tileSize - bLen, 2, bLen);

      // Coordinates tooltip pill at bottom of hover tile
      ctx.fillStyle = 'rgba(7, 12, 22, 0.88)';
      ctx.fillRect(hx + 2, hy + tileSize - 14, 48, 12);
      ctx.fillStyle = '#67e8f9';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this.grid.hoverTile.x},${this.grid.hoverTile.y}`, hx + 26, hy + tileSize - 8);

      ctx.restore();
    }
  }

  private drawUnits(units: Unit[], selectedUnit: Unit | null, tileSize: number) {
    const { ctx } = this;

    // Sort units by y so lower units overlap top units naturally
    const sorted = [...units].sort((a, b) => a.y - b.y);

    for (const unit of sorted) {
      if (unit.isDead) continue;

      // Use animated position if animating, otherwise grid position
      const renderX = unit.animPos ? unit.animPos.x : (unit.x + 0.5) * tileSize;
      const renderY = unit.animPos ? unit.animPos.y : (unit.y + 0.5) * tileSize;

      const isSelected = selectedUnit?.id === unit.id;

      ctx.save();
      ctx.translate(renderX, renderY);

      // 1. Selection aura / ring
      if (isSelected) {
        const pulse = 1 + 0.1 * Math.sin(this.animTime * 6);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, (tileSize * 0.44) * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, tileSize * 0.44, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Unit Direction Facing Pointer
      ctx.save();
      ctx.rotate(unit.facingAngle);
      ctx.fillStyle = unit.team === 'player' ? '#06b6d4' : '#ef4444';
      ctx.beginPath();
      ctx.moveTo(tileSize * 0.38, 0);
      ctx.lineTo(tileSize * 0.24, -4);
      ctx.lineTo(tileSize * 0.24, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 3. Render 2D Vector Sprite based on unit class
      this.drawUnitSprite(unit, tileSize);

      // 4. Over-head Vitals (HP bar, Shields, AP pips)
      this.drawUnitVitals(unit, tileSize);

      ctx.restore();
    }
  }

  private drawUnitSprite(unit: Unit, tileSize: number) {
    const { ctx } = this;
    const isPlayer = unit.team === 'player';
    const radius = tileSize * 0.32;

    // Unit Base Chassis
    ctx.fillStyle = isPlayer ? '#0e263d' : '#331018';
    ctx.strokeStyle = isPlayer ? '#0284c7' : '#dc2626';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Specific Class Emblems
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (unit.unitClass === 'vanguard') {
      // Vanguard: Heavy Shield Emblem & Cyan Chevrons
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px Chakra Petch';
      ctx.fillText('🛡️', 0, 0);
    } else if (unit.unitClass === 'sniper') {
      // Sniper: Precision Target Crosshair
      ctx.fillStyle = '#67e8f9';
      ctx.font = 'bold 16px Chakra Petch';
      ctx.fillText('🎯', 0, 0);
    } else if (unit.unitClass === 'hacker') {
      // Hacker: Hexagonal Electronic Warfare Node
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 16px Chakra Petch';
      ctx.fillText('⚡', 0, 0);
    } else if (unit.unitClass === 'medic') {
      // Medic: Medical Cross
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 16px Chakra Petch';
      ctx.fillText('💉', 0, 0);
    } else if (unit.unitClass === 'boss') {
      // Boss: Sector Overseer Titan
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 20px Chakra Petch';
      ctx.fillText('👑', 0, 0);

      // Rotating threat ring around boss
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = this.animTime * 20;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (unit.unitClass === 'drone') {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 15px Chakra Petch';
      ctx.fillText('🛸', 0, 0);
    } else {
      // Enforcer / Infiltrator bot
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 16px Chakra Petch';
      ctx.fillText('🤖', 0, 0);
    }
  }

  private drawUnitVitals(unit: Unit, tileSize: number) {
    const { ctx } = this;
    const barW = tileSize * 0.75;
    const barH = 4;
    const topY = -tileSize * 0.44;

    // Health Bar
    const hpPct = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(-barW / 2, topY, barW, barH);

    ctx.fillStyle = hpPct > 0.5 ? '#10b981' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(-barW / 2, topY, barW * hpPct, barH);

    // Shield Bar (if unit has shield capacity)
    if (unit.maxShields > 0) {
      const shieldPct = Math.max(0, Math.min(1, unit.shields / unit.maxShields));
      const shieldY = topY - barH - 1;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(-barW / 2, shieldY, barW, barH - 1);

      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(-barW / 2, shieldY, barW * shieldPct, barH - 1);
    }

    // Action Points (AP) pips beneath unit
    if (unit.team === 'player') {
      const apY = tileSize * 0.38;
      const pipSize = 4;
      const gap = 3;
      const totalPipsW = unit.maxAp * (pipSize + gap) - gap;
      let startPipX = -totalPipsW / 2;

      for (let i = 0; i < unit.maxAp; i++) {
        ctx.fillStyle = i < unit.ap ? '#22d3ee' : 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(startPipX, apY, pipSize, pipSize);
        startPipX += pipSize + gap;
      }
    }
  }

  private drawVisualFX() {
    const { ctx } = this;

    // 1. Lasers
    for (const l of this.lasers) {
      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.lineCap = 'round';

      // Outer neon glow
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(l.startX, l.startY);
      ctx.lineTo(l.targetX, l.targetY);
      ctx.stroke();

      // White inner core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = l.width * 0.45;
      ctx.stroke();

      ctx.restore();
    }

    // 2. Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Floating Combat Damage Numbers
    for (const fn of this.floatingNumbers) {
      ctx.save();
      ctx.globalAlpha = fn.alpha;
      ctx.fillStyle = fn.color;
      ctx.font = `bold ${fn.fontSize}px Chakra Petch, Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Dark text outline for high readability
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(fn.text, fn.x, fn.y);
      ctx.fillText(fn.text, fn.x, fn.y);

      ctx.restore();
    }
  }
}
