import * as THREE from 'three';
import { CampaignManager } from '../systems/CampaignManager';
import { CombatFSM } from '../systems/CombatFSM';
import { sound } from '../systems/AudioSynth';
import { CombatLogEntry, SelectedAction, Unit } from '../types';

export class TacticalHUD {
  private container: HTMLElement;
  private fsm: CombatFSM;
  private campaign: CampaignManager;
  private isDockCollapsed: boolean = false;
  private onDeployMission?: (nodeId: string) => void;

  constructor(fsm: CombatFSM, campaign: CampaignManager, onDeployMission?: (nodeId: string) => void) {
    this.fsm = fsm;
    this.campaign = campaign;
    this.onDeployMission = onDeployMission;
    this.container = document.getElementById('tactical-hud')!;

    this.setupListeners();
    this.render();
  }

  private setupListeners() {
    this.fsm.onStateChanged = () => this.render();
    this.fsm.onUnitSelected = () => this.render();
    this.fsm.onLogsUpdated = (logs) => this.updateCombatLogs(logs);
    this.fsm.onFloatingText = (text, color, pos) => this.showFloatingText(text, color, pos);
  }

  public render() {
    if (!this.container) return;

    // Check if in Victory or Defeat
    if (this.fsm.state === 'VICTORY') {
      this.container.innerHTML = this.renderVictoryModal();
      this.attachModalHandlers();
      return;
    }

    if (this.fsm.state === 'DEFEAT') {
      this.container.innerHTML = this.renderDefeatModal();
      this.attachModalHandlers();
      return;
    }

    const selectedUnit = this.fsm.getSelectedUnit();

    this.container.innerHTML = `
      <!-- Top HUD Header -->
      <div class="top-hud-bar hud-interactive">
        <div class="mission-objective-cluster">
          <div class="sector-badge">SECTOR ${this.campaign.currentSector} // ${this.campaign.currentNodeId.toUpperCase()}</div>
          <div class="objective-text">
            <span class="objective-indicator"></span>
            ${
              this.fsm.nodeType === 'terminal_hack'
                ? `SECURE TERMINALS (${this.fsm.terminalsHackedCount}/${this.fsm.totalTerminalsCount})`
                : this.fsm.nodeType === 'boss'
                  ? 'ELIMINATE SECTOR TITAN'
                  : 'NEUTRALIZE ALL HOSTILE UNITS'
            }
          </div>
        </div>

        <div class="turn-banner">
          <div class="turn-text ${this.fsm.state === 'PLAYER_TURN' ? 'turn-player' : 'turn-enemy'}">
            ${this.fsm.state === 'PLAYER_TURN' ? 'PLAYER PHASE' : 'ENEMY PHASE'}
          </div>
          <div class="turn-round-counter">ROUND ${this.fsm.roundNumber}</div>
        </div>

        <div class="top-resources-cluster">
          <div class="resource-chip credits" title="Credits: Used for armory upgrades">
            <span>🪙 CREDITS</span>
            <strong>${this.campaign.credits}</strong>
          </div>
          <div class="resource-chip scrap" title="Scrap: Used for field repairs">
            <span>⚙️ SCRAP</span>
            <strong>${this.campaign.scrap}</strong>
          </div>
          <button id="btn-open-map" class="hud-btn secondary" title="View Sector Route">🗺️ MAP</button>
          <button id="btn-open-squad" class="hud-btn secondary" title="Squad Management & Repairs">👥 SQUAD</button>
          <button id="btn-toggle-sound" class="hud-btn secondary" title="Toggle Audio">${sound.isMuted ? '🔇' : '🔊'}</button>
        </div>
      </div>

      <!-- Left Flank: Unit Initiative List -->
      <div class="left-flank-queue hud-interactive">
        ${this.renderUnitQueue()}
      </div>

      <!-- Right Flank: Combat Log & Target Inspector -->
      <div class="right-flank-cluster hud-interactive">
        <div class="tech-card battle-log-card">
          <div class="card-title">
            <span>TACTICAL LOG</span>
            <span style="font-size: 10px; color: #64748b;">LIVE</span>
          </div>
          <div id="combat-log-feed" class="log-scroll-area">
            ${this.renderLogEntries(this.fsm.combatLogs)}
          </div>
        </div>

        ${this.renderTargetInspector()}
      </div>

      <!-- Bottom Command Dock (Collapsible) -->
      <div class="bottom-dock-container hud-interactive" style="${
        this.isDockCollapsed ? 'transform: translateY(calc(100% - 24px));' : ''
      }">
        <button id="btn-toggle-dock" class="dock-collapse-toggle">
          ${this.isDockCollapsed ? '▴ SHOW COMMANDS' : '▾ HIDE COMMANDS'}
        </button>

        <div class="bottom-tactical-dock tech-card">
          <!-- Selected Unit Profile -->
          ${this.renderSelectedUnitProfile(selectedUnit)}

          <!-- Action Buttons -->
          ${this.renderActionButtons(selectedUnit)}

          <!-- End Turn Cluster -->
          <div class="end-turn-cluster">
            <button id="btn-end-turn" class="hud-btn end-turn-btn" ${
              this.fsm.state !== 'PLAYER_TURN' ? 'disabled' : ''
            }>
              END TURN ▸
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachDomHandlers();
  }

  private renderUnitQueue(): string {
    return this.fsm.units
      .filter((u) => !u.isDead)
      .map((u) => {
        const isActive = u.id === this.fsm.selectedUnitId;
        const hpPercent = Math.round((u.hp / u.maxHp) * 100);
        const shieldPercent = u.maxShields > 0 ? Math.round((u.shields / u.maxShields) * 100) : 0;
        const icon =
          u.unitClass === 'vanguard'
            ? '🛡️'
            : u.unitClass === 'sniper'
              ? '🎯'
              : u.unitClass === 'hacker'
                ? '⚡'
                : u.unitClass === 'medic'
                  ? '💉'
                  : u.unitClass === 'boss'
                    ? '👑'
                    : '🤖';

        return `
          <div class="unit-queue-pill ${u.team} ${isActive ? 'active' : ''}" data-unit-id="${u.id}">
            <div class="unit-queue-icon">${icon}</div>
            <div class="unit-queue-info">
              <div class="unit-queue-name">${u.name}</div>
              <div class="unit-queue-bars">
                <div class="bar-track"><div class="bar-fill-hp" style="width: ${hpPercent}%"></div></div>
                ${
                  u.maxShields > 0
                    ? `<div class="bar-track"><div class="bar-fill-shield" style="width: ${shieldPercent}%"></div></div>`
                    : ''
                }
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private renderTargetInspector(): string {
    const target = this.fsm.units.find((u) => u.id === this.fsm.targetUnitId && !u.isDead);
    if (!target) return '';

    const selected = this.fsm.getSelectedUnit();
    let hitChanceStr = '--';
    let coverStr = 'None';

    if (selected) {
      const dist = Math.hypot(target.x - selected.x, target.z - selected.z);
      if (dist <= selected.attackRange) {
        hitChanceStr = '75%';
      }
    }

    return `
      <div class="tech-card target-inspector-card">
        <div class="card-title">
          <span>TARGET LOCK</span>
          <span style="color: var(--neon-crimson);">${target.unitClass.toUpperCase()}</span>
        </div>
        <div style="font-weight: 700; color: #fff; font-size: 14px;">${target.name}</div>
        <div class="inspector-stats-row">
          <span>INTEGRITY:</span>
          <strong>${target.hp} / ${target.maxHp} HP</strong>
        </div>
        <div class="inspector-stats-row">
          <span>SHIELDS:</span>
          <strong>${target.shields} / ${target.maxShields}</strong>
        </div>
        <div class="inspector-stats-row">
          <span>ARMOR / COVER:</span>
          <strong>${target.armor} DEF // ${coverStr}</strong>
        </div>
      </div>
    `;
  }

  private renderSelectedUnitProfile(unit: Unit | null): string {
    if (!unit) {
      return `
        <div class="selected-unit-cluster">
          <div class="unit-vitals">
            <div class="unit-name">NO UNIT SELECTED</div>
            <div style="font-size: 12px; color: #64748b;">Click on a squad member to issue orders.</div>
          </div>
        </div>
      `;
    }

    const hpPercent = Math.round((unit.hp / unit.maxHp) * 100);
    const shieldPercent = unit.maxShields > 0 ? Math.round((unit.shields / unit.maxShields) * 100) : 0;
    const icon =
      unit.unitClass === 'vanguard'
        ? '🛡️'
        : unit.unitClass === 'sniper'
          ? '🎯'
          : unit.unitClass === 'hacker'
            ? '⚡'
            : '💉';

    return `
      <div class="selected-unit-cluster">
        <div class="unit-avatar-frame">${icon}</div>
        <div class="unit-vitals">
          <div class="unit-title-row">
            <span class="unit-name">${unit.name}</span>
            <span class="unit-class-badge">${unit.unitClass.toUpperCase()}</span>
          </div>

          <!-- HP & Shield Bars -->
          <div class="vital-bar-group">
            <div class="vital-labels">
              <span>HULL</span>
              <span>${unit.hp} / ${unit.maxHp}</span>
            </div>
            <div class="vital-bar-frame">
              <div class="bar-fill-hp" style="width: ${hpPercent}%;"></div>
            </div>

            <div class="vital-labels" style="margin-top: 2px;">
              <span>SHIELD</span>
              <span>${unit.shields} / ${unit.maxShields}</span>
            </div>
            <div class="vital-bar-frame">
              <div class="bar-fill-shield" style="width: ${shieldPercent}%;"></div>
            </div>
          </div>

          <!-- AP Pips -->
          <div class="ap-pips-row">
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--neon-amber); margin-right: 4px;">AP:</span>
            ${Array.from({ length: unit.maxAp })
              .map((_, i) => `<div class="ap-pip ${i < unit.ap ? 'filled' : ''}"></div>`)
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderActionButtons(unit: Unit | null): string {
    if (!unit || this.fsm.state !== 'PLAYER_TURN') {
      return `<div class="action-buttons-cluster" style="opacity: 0.5;">Awaiting Turn...</div>`;
    }

    const isMove = this.fsm.currentAction === 'MOVE';
    const isAttack = this.fsm.currentAction === 'ATTACK';
    const isAb1 = this.fsm.currentAction === 'ABILITY_1';
    const isAb2 = this.fsm.currentAction === 'ABILITY_2';

    const ab1 = unit.abilities[0];
    const ab2 = unit.abilities[1];

    // Check if near terminal
    const canHack = this.isNearTerminal(unit);

    return `
      <div class="action-buttons-cluster">
        <button id="act-move" class="action-btn ${isMove ? 'active' : ''}" ${
          unit.ap < 1 ? 'disabled' : ''
        }>
          <span class="btn-cost">1 AP</span>
          <span class="btn-icon">👣</span>
          <span class="btn-label">MOVE</span>
        </button>

        <button id="act-attack" class="action-btn ${isAttack ? 'active' : ''}" ${
          unit.ap < 2 ? 'disabled' : ''
        }>
          <span class="btn-cost">2 AP</span>
          <span class="btn-icon">💥</span>
          <span class="btn-label">FIRE</span>
        </button>

        ${
          ab1
            ? `
          <button id="act-ab1" class="action-btn ${isAb1 ? 'active' : ''}" ${
            unit.ap < ab1.apCost || ab1.currentCooldown > 0 ? 'disabled' : ''
          } title="${ab1.description}">
            <span class="btn-cost">${ab1.apCost} AP</span>
            <span class="btn-icon">${ab1.icon}</span>
            <span class="btn-label">${ab1.name}</span>
          </button>
        `
            : ''
        }

        ${
          ab2
            ? `
          <button id="act-ab2" class="action-btn ${isAb2 ? 'active' : ''}" ${
            unit.ap < ab2.apCost || ab2.currentCooldown > 0 ? 'disabled' : ''
          } title="${ab2.description}">
            <span class="btn-cost">${ab2.apCost} AP</span>
            <span class="btn-icon">${ab2.icon}</span>
            <span class="btn-label">${ab2.name}</span>
          </button>
        `
            : ''
        }

        ${
          canHack
            ? `
          <button id="act-hack" class="action-btn" ${unit.ap < 2 ? 'disabled' : ''} style="border-color: var(--neon-emerald); color: var(--neon-emerald);">
            <span class="btn-cost">2 AP</span>
            <span class="btn-icon">💾</span>
            <span class="btn-label">HACK TERMINAL</span>
          </button>
        `
            : ''
        }
      </div>
    `;
  }

  private isNearTerminal(unit: Unit): boolean {
    const offsets = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];
    return offsets.some((off) => {
      const tile = this.fsm.grid.gridTiles.get(`${unit.x + off.x},${unit.z + off.z}`);
      return tile && tile.type === 'terminal' && !tile.hacked;
    });
  }

  private renderLogEntries(logs: CombatLogEntry[]): string {
    return logs
      .map(
        (log) => `
        <div class="log-entry ${log.type}">
          <span style="opacity: 0.5;">[${log.timestamp}]</span> ${log.text}
        </div>
      `
      )
      .join('');
  }

  private updateCombatLogs(logs: CombatLogEntry[]) {
    const feed = document.getElementById('combat-log-feed');
    if (feed) {
      feed.innerHTML = this.renderLogEntries(logs);
      feed.scrollTop = feed.scrollHeight;
    }
  }

  private showFloatingText(text: string, color: string, worldPos: THREE.Vector3) {
    const el = document.createElement('div');
    el.className = 'combat-floating-indicator';
    el.innerText = text;
    el.style.color = color;
    el.style.left = '50%';
    el.style.top = '40%';

    this.container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -90px)';
      el.style.opacity = '0';
    });

    setTimeout(() => el.remove(), 850);
  }

  private attachDomHandlers() {
    // Action Buttons
    document.getElementById('act-move')?.addEventListener('click', () => {
      this.fsm.setAction(this.fsm.currentAction === 'MOVE' ? null : 'MOVE');
      this.render();
    });

    document.getElementById('act-attack')?.addEventListener('click', () => {
      this.fsm.setAction(this.fsm.currentAction === 'ATTACK' ? null : 'ATTACK');
      this.render();
    });

    document.getElementById('act-ab1')?.addEventListener('click', () => {
      this.fsm.setAction(this.fsm.currentAction === 'ABILITY_1' ? null : 'ABILITY_1');
      this.render();
    });

    document.getElementById('act-ab2')?.addEventListener('click', () => {
      this.fsm.setAction(this.fsm.currentAction === 'ABILITY_2' ? null : 'ABILITY_2');
      this.render();
    });

    document.getElementById('act-hack')?.addEventListener('click', () => {
      void this.fsm.executeHackTerminal();
    });

    // End Turn
    document.getElementById('btn-end-turn')?.addEventListener('click', () => {
      void this.fsm.endTurn();
    });

    // Unit Queue click
    document.querySelectorAll('.unit-queue-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.unitId;
        if (id) this.fsm.selectUnit(id);
      });
    });

    // Dock Collapse Toggle
    document.getElementById('btn-toggle-dock')?.addEventListener('click', () => {
      this.isDockCollapsed = !this.isDockCollapsed;
      this.render();
    });

    // Sound toggle
    document.getElementById('btn-toggle-sound')?.addEventListener('click', () => {
      sound.toggleMute();
      this.render();
    });

    // Sector Map Modal
    document.getElementById('btn-open-map')?.addEventListener('click', () => {
      this.showSectorMapModal();
    });

    // Squad Roster Modal
    document.getElementById('btn-open-squad')?.addEventListener('click', () => {
      this.showSquadModal();
    });
  }

  // --- MODALS ---

  public showSectorMapModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'active-modal';

    const nodesList = Array.from(this.campaign.sectorNodes.values());
    // Group by column
    const cols = [0, 1, 2, 3];

    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">ORBITAL SECTOR MAP // ROUTE SELECTION</div>
          <button id="modal-close-btn" class="hud-btn secondary">✕ CLOSE</button>
        </div>

        <p style="color: #94a3b8; font-size: 14px; margin-top: 0;">
          Select your tactical vector through sector nodes. Nodes feature skirmishes, terminal infiltrations, tech events, and armory supply depots.
        </p>

        <div class="node-map-tree">
          ${cols
            .map((col) => {
              const colNodes = nodesList.filter((n) => n.col === col);
              return `
              <div class="node-column">
                ${colNodes
                  .map((n) => {
                    const statusClass = n.completed ? 'completed' : n.available ? 'available' : 'locked';
                    const icon =
                      n.type === 'boss'
                        ? '👑'
                        : n.type === 'shop'
                          ? '🛒'
                          : n.type === 'event'
                            ? '📡'
                            : n.type === 'terminal_hack'
                              ? '💾'
                              : '⚔️';
                    return `
                      <button class="sector-node-btn ${statusClass}" data-node-id="${n.id}" ${
                        !n.available || n.completed ? 'disabled' : ''
                      }>
                        <span class="node-icon">${icon}</span>
                        <span class="node-name">${n.title}</span>
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            `;
            })
            .join('')}
        </div>

        <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
          <button id="modal-close-bottom" class="hud-btn">RETURN TO TACTICAL VIEW</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#modal-close-bottom')?.addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.sector-node-btn.available').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const nodeId = (e.currentTarget as HTMLElement).dataset.nodeId;
        if (nodeId) {
          modal.remove();
          this.handleNodeSelected(nodeId);
        }
      });
    });
  }

  private handleNodeSelected(nodeId: string) {
    const node = this.campaign.sectorNodes.get(nodeId);
    if (!node) return;

    this.campaign.currentNodeId = nodeId;

    if (node.type === 'event') {
      this.showTextEventModal(this.campaign.getRandomTextEvent(), nodeId);
    } else if (node.type === 'shop') {
      this.showShopModal(nodeId);
    } else {
      // Tactical Mission
      this.onDeployMission?.(nodeId);
    }
  }

  public showShopModal(nodeId: string) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'active-modal';

    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">ARMORY OUTPOST // SUPPLY DEPOT</div>
          <button id="modal-close-btn" class="hud-btn secondary">✕ CLOSE</button>
        </div>

        <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 12px;">
          <div class="resource-chip credits">🪙 CREDITS: <strong>${this.campaign.credits}</strong></div>
          <div class="resource-chip scrap">⚙️ SCRAP: <strong>${this.campaign.scrap}</strong></div>
        </div>

        <div class="shop-grid">
          ${this.campaign.shopCatalog
            .map(
              (item) => `
            <div class="shop-item-card">
              <div class="shop-item-name">${item.name}</div>
              <div class="shop-item-desc">${item.description}</div>
              <div class="shop-item-price">
                <span>COST: ${item.cost} CREDITS</span>
                <button class="hud-btn accent buy-item-btn" data-item-id="${item.id}" ${
                  item.purchased || this.campaign.credits < item.cost ? 'disabled' : ''
                }>
                  ${item.purchased ? 'INSTALLED' : 'BUY'}
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
          <button id="shop-proceed-btn" class="hud-btn">PROCEED TO NEXT NODE ▸</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#shop-proceed-btn')?.addEventListener('click', () => {
      modal.remove();
      this.campaign.completeCurrentNode(nodeId);
      this.showSectorMapModal();
    });

    modal.querySelectorAll('.buy-item-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = (e.currentTarget as HTMLElement).dataset.itemId;
        if (itemId) {
          const res = this.campaign.purchaseItem(itemId);
          if (res.success) {
            sound.playSelect();
            modal.remove();
            this.showShopModal(nodeId);
          }
        }
      });
    });
  }

  public showTextEventModal(event: any, nodeId: string) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'active-modal';

    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">TACTICAL EVENT // ${event.title.toUpperCase()}</div>
        </div>

        <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
          ${event.scenario}
        </p>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${event.choices
            .map(
              (choice: any, index: number) => `
            <button class="hud-btn secondary event-choice-btn" data-choice-index="${index}" style="text-align: left; padding: 14px 20px;">
              <strong>[OPTION ${index + 1}]</strong> ${choice.text}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    modal.querySelectorAll('.event-choice-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = Number((e.currentTarget as HTMLElement).dataset.choiceIndex);
        const choice = event.choices[idx];
        this.campaign.credits += choice.creditsChange;
        this.campaign.scrap += choice.scrapChange;

        // Apply health change
        if (choice.hpChangePercent !== 0) {
          this.campaign.persistentSquad.forEach((u) => {
            u.hp = Math.min(u.maxHp, Math.max(10, Math.round(u.hp * (1 + choice.hpChangePercent))));
          });
        }

        modal.innerHTML = `
          <div class="modal-dialog">
            <div class="modal-header">
              <div class="modal-title">EVENT OUTCOME</div>
            </div>
            <p style="font-size: 16px; color: #fff; line-height: 1.6; margin-bottom: 24px;">
              ${choice.outcomeText}
            </p>
            <div style="display: flex; gap: 20px; margin-bottom: 24px;">
              ${choice.creditsChange !== 0 ? `<div class="resource-chip credits">+${choice.creditsChange} CREDITS</div>` : ''}
              ${choice.scrapChange !== 0 ? `<div class="resource-chip scrap">+${choice.scrapChange} SCRAP</div>` : ''}
            </div>
            <button id="event-continue-btn" class="hud-btn accent">CONTINUE ▸</button>
          </div>
        `;

        modal.querySelector('#event-continue-btn')?.addEventListener('click', () => {
          modal.remove();
          this.campaign.completeCurrentNode(nodeId);
          this.showSectorMapModal();
        });
      });
    });
  }

  public showSquadModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'active-modal';

    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">SQUAD ROSTER & FIELD REPAIRS</div>
          <button id="modal-close-btn" class="hud-btn secondary">✕ CLOSE</button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 14px; color: #94a3b8;">
            Spend scrap to repair damaged armor and revive fallen squad members.
          </div>
          <div class="resource-chip scrap">⚙️ SCRAP: <strong>${this.campaign.scrap}</strong></div>
        </div>

        <div class="squad-roster-grid">
          ${this.campaign.persistentSquad
            .map((u) => {
              const repairCost = u.isDead ? 80 : Math.ceil((u.maxHp - u.hp) * 0.75);
              return `
              <div class="squad-member-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 700; font-size: 16px; color: #fff;">${u.name}</span>
                  <span class="unit-class-badge">${u.unitClass.toUpperCase()}</span>
                </div>
                <div style="font-size: 13px; color: ${u.isDead ? 'var(--neon-crimson)' : '#94a3b8'};">
                  STATUS: <strong>${u.isDead ? 'DESTROYED (NEEDS REBUILD)' : `${u.hp} / ${u.maxHp} HP`}</strong>
                </div>
                <div style="font-size: 12px; color: #64748b;">
                  SHIELDS: ${u.shields}/${u.maxShields} | ARMOR: ${u.armor} | DAMAGE: ${u.attackDamage}
                </div>
                <button class="hud-btn repair-unit-btn" data-unit-id="${u.id}" ${
                  repairCost === 0 || this.campaign.scrap < repairCost ? 'disabled' : ''
                }>
                  ${repairCost === 0 ? 'FULLY REPAIRED' : `REPAIR (${repairCost} SCRAP)`}
                </button>
              </div>
            `;
            })
            .join('')}
        </div>

        <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
          <button id="modal-close-bottom" class="hud-btn">RETURN TO MISSION</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#modal-close-bottom')?.addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.repair-unit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const uid = (e.currentTarget as HTMLElement).dataset.unitId;
        if (uid) {
          const res = this.campaign.repairUnit(uid);
          if (res.success) {
            sound.playHeal();
            modal.remove();
            this.showSquadModal();
            this.render();
          }
        }
      });
    });
  }

  private renderVictoryModal(): string {
    const node = this.campaign.sectorNodes.get(this.campaign.currentNodeId);
    const credits = node ? node.creditsReward : 150;
    const scrap = node ? node.scrapReward : 80;

    return `
      <div class="modal-overlay">
        <div class="modal-dialog" style="text-align: center; align-items: center; gap: 16px;">
          <div style="font-size: 42px;">🏆</div>
          <div class="modal-title" style="color: var(--neon-emerald); font-size: 32px;">
            OBJECTIVE SECURED
          </div>
          <p style="font-size: 16px; color: #cbd5e1; max-width: 500px;">
            Hostile signatures purged from this orbital node. Salvage extraction teams have gathered local resources.
          </p>

          <div style="display: flex; gap: 24px; margin: 12px 0;">
            <div class="resource-chip credits">+${credits} CREDITS EARNED</div>
            <div class="resource-chip scrap">+${scrap} SCRAP SALVAGED</div>
          </div>

          <button id="btn-victory-continue" class="hud-btn accent" style="padding: 14px 32px; font-size: 16px;">
            ADVANCE TO SECTOR MAP ▸
          </button>
        </div>
      </div>
    `;
  }

  private renderDefeatModal(): string {
    return `
      <div class="modal-overlay">
        <div class="modal-dialog" style="text-align: center; align-items: center; gap: 16px;">
          <div style="font-size: 42px;">💀</div>
          <div class="modal-title" style="color: var(--neon-crimson); font-size: 32px;">
            MISSION FAILED: SQUAD ELIMINATED
          </div>
          <p style="font-size: 16px; color: #cbd5e1; max-width: 500px;">
            All squad mechs suffered catastrophic reactor breaches. Emergency backup reboot protocols available.
          </p>

          <button id="btn-defeat-restart" class="hud-btn danger" style="padding: 14px 32px; font-size: 16px;">
            REINITIALIZE SQUAD & RETRY SECTOR
          </button>
        </div>
      </div>
    `;
  }

  private attachModalHandlers() {
    document.getElementById('btn-victory-continue')?.addEventListener('click', () => {
      this.campaign.completeCurrentNode(this.campaign.currentNodeId);
      this.showSectorMapModal();
    });

    document.getElementById('btn-defeat-restart')?.addEventListener('click', () => {
      // Restore squad and retry node
      this.campaign.persistentSquad.forEach((u) => {
        u.isDead = false;
        u.hp = u.maxHp;
        u.shields = u.maxShields;
      });
      this.onDeployMission?.(this.campaign.currentNodeId);
    });
  }
}
