import { SectorNode, ShopItem, TextEvent, Unit } from '../types';

export class CampaignManager {
  public credits: number = 350;
  public scrap: number = 180;
  public currentSector: number = 1;
  public currentNodeId: string = 'node_0';
  public sectorNodes: Map<string, SectorNode> = new Map();
  public persistentSquad: Unit[] = [];
  public shopCatalog: ShopItem[] = [];

  constructor() {
    this.initDefaultSquad();
    this.generateSectorMap();
    this.initShopCatalog();
  }

  private initDefaultSquad() {
    this.persistentSquad = [
      {
        id: 'p_vanguard',
        name: 'Aegis-01',
        team: 'player',
        unitClass: 'vanguard',
        x: 7,
        y: 13,
        facingAngle: -Math.PI / 2,
        hp: 120,
        maxHp: 120,
        shields: 40,
        maxShields: 40,
        armor: 4,
        ap: 4,
        maxAp: 4,
        moveRange: 1,
        attackRange: 3,
        attackDamage: 28,
        critChance: 15,
        isDead: false,
        level: 1,
        kills: 0,
        upgrades: [],
        statusEffects: [],
        abilities: [
          {
            id: 'shield_fortress',
            name: 'Shield Fortress',
            description: 'Projects a 360° barrier, restoring +35 Shields and granting 50% damage reduction for 1 turn.',
            apCost: 2,
            cooldown: 3,
            currentCooldown: 0,
            range: 0,
            targetType: 'self',
            icon: '🛡️',
          },
          {
            id: 'seismic_slam',
            name: 'Seismic Slam',
            description: 'Ground slam dealing 24 shockwave damage and -1 AP slow to adjacent enemies.',
            apCost: 2,
            cooldown: 2,
            currentCooldown: 0,
            range: 1.5,
            targetType: 'enemy',
            icon: '💥',
          },
        ],
      },
      {
        id: 'p_sniper',
        name: 'Ghost-V',
        team: 'player',
        unitClass: 'sniper',
        x: 6,
        y: 14,
        facingAngle: -Math.PI / 2,
        hp: 75,
        maxHp: 75,
        shields: 20,
        maxShields: 20,
        armor: 1,
        ap: 4,
        maxAp: 4,
        moveRange: 1,
        attackRange: 7,
        attackDamage: 38,
        critChance: 35,
        isDead: false,
        level: 1,
        kills: 0,
        upgrades: [],
        statusEffects: [],
        abilities: [
          {
            id: 'deadeye_shot',
            name: 'Deadeye Protocol',
            description: 'High-precision railgun round with 95% accuracy and +50% critical strike bonus.',
            apCost: 3,
            cooldown: 2,
            currentCooldown: 0,
            range: 8,
            targetType: 'enemy',
            icon: '🎯',
          },
          {
            id: 'overwatch',
            name: 'Overwatch Matrix',
            description: 'Enters defensive stance; automatically fires at the first enemy that moves into line of sight.',
            apCost: 2,
            cooldown: 2,
            currentCooldown: 0,
            range: 7,
            targetType: 'self',
            icon: '👁️',
          },
        ],
      },
      {
        id: 'p_hacker',
        name: 'Cipher-9',
        team: 'player',
        unitClass: 'hacker',
        x: 8,
        y: 14,
        facingAngle: -Math.PI / 2,
        hp: 85,
        maxHp: 85,
        shields: 30,
        maxShields: 30,
        armor: 2,
        ap: 4,
        maxAp: 4,
        moveRange: 1,
        attackRange: 4,
        attackDamage: 22,
        critChance: 15,
        isDead: false,
        level: 1,
        kills: 0,
        upgrades: [],
        statusEffects: [],
        abilities: [
          {
            id: 'emp_overload',
            name: 'EMP Overload',
            description: 'Disables targeted mechanical enemy for 1 turn and strips 30 shield points.',
            apCost: 2,
            cooldown: 3,
            currentCooldown: 0,
            range: 5,
            targetType: 'enemy',
            icon: '⚡',
          },
          {
            id: 'cyber_boost',
            name: 'Combat Overdrive',
            description: 'Overclocks a squadmate, granting +2 AP and +25% attack damage for their next turn.',
            apCost: 2,
            cooldown: 2,
            currentCooldown: 0,
            range: 4,
            targetType: 'ally',
            icon: '📶',
          },
        ],
      },
      {
        id: 'p_medic',
        name: 'Helix-4',
        team: 'player',
        unitClass: 'medic',
        x: 7,
        y: 14,
        facingAngle: -Math.PI / 2,
        hp: 90,
        maxHp: 90,
        shields: 25,
        maxShields: 25,
        armor: 2,
        ap: 4,
        maxAp: 4,
        moveRange: 1,
        attackRange: 4,
        attackDamage: 20,
        critChance: 10,
        isDead: false,
        level: 1,
        kills: 0,
        upgrades: [],
        statusEffects: [],
        abilities: [
          {
            id: 'nanite_heal',
            name: 'Nanite Spray',
            description: 'Sprays medical nanites onto a squadmate, restoring 40 HP and cleansing negative statuses.',
            apCost: 2,
            cooldown: 2,
            currentCooldown: 0,
            range: 3,
            targetType: 'ally',
            icon: '💉',
          },
          {
            id: 'stim_drone',
            name: 'Triage Drone',
            description: 'Deploys a defensive drone granting +20 Shields and +1 AP to target.',
            apCost: 2,
            cooldown: 3,
            currentCooldown: 0,
            range: 4,
            targetType: 'ally',
            icon: '🛸',
          },
        ],
      },
    ];
  }

  public generateSectorMap() {
    this.sectorNodes.clear();

    const nodes: SectorNode[] = [
      {
        id: 'node_0',
        col: 0,
        row: 0,
        type: 'skirmish',
        title: 'Sector Dropzone',
        description: 'Landing zone perimeter. Clear light scout drone patrols.',
        completed: false,
        available: true,
        connections: ['node_1a', 'node_1b'],
        creditsReward: 120,
        scrapReward: 60,
      },
      {
        id: 'node_1a',
        col: 1,
        row: 0,
        type: 'terminal_hack',
        title: 'Orbital Uplink',
        description: 'Derelict terminal core. Hack data terminals before security lock down.',
        completed: false,
        available: false,
        connections: ['node_2a', 'node_2b'],
        creditsReward: 160,
        scrapReward: 90,
      },
      {
        id: 'node_1b',
        col: 1,
        row: 1,
        type: 'ambush',
        title: 'Canyon Ambush',
        description: 'Heavy stealth patrols spotted. High risk, high salvage yield.',
        completed: false,
        available: false,
        connections: ['node_2b', 'node_2c'],
        creditsReward: 200,
        scrapReward: 110,
      },
      {
        id: 'node_2a',
        col: 2,
        row: 0,
        type: 'shop',
        title: 'Scrap Outpost',
        description: 'Automated fabrication depot. Purchase weapon attachments and hull upgrades.',
        completed: false,
        available: false,
        connections: ['node_3'],
        creditsReward: 0,
        scrapReward: 0,
      },
      {
        id: 'node_2b',
        col: 2,
        row: 1,
        type: 'event',
        title: 'Derelict Research Pod',
        description: 'Signal from an abandoned laboratory. Investigate for tech or danger.',
        completed: false,
        available: false,
        connections: ['node_3'],
        creditsReward: 80,
        scrapReward: 70,
      },
      {
        id: 'node_2c',
        col: 2,
        row: 2,
        type: 'skirmish',
        title: 'Generator Station',
        description: 'Electrified combat zone. Enforcer mech guarding the reactor.',
        completed: false,
        available: false,
        connections: ['node_3'],
        creditsReward: 180,
        scrapReward: 100,
      },
      {
        id: 'node_3',
        col: 3,
        row: 0,
        type: 'boss',
        title: 'Overseer Titan Citadel',
        description: 'Sector Commander: Overseer Titan Mech. Eliminate the boss to secure orbital control!',
        completed: false,
        available: false,
        connections: [],
        creditsReward: 400,
        scrapReward: 250,
      },
    ];

    nodes.forEach((n) => this.sectorNodes.set(n.id, n));
  }

  public completeCurrentNode(nodeId: string) {
    const node = this.sectorNodes.get(nodeId);
    if (!node) return;

    node.completed = true;
    this.credits += node.creditsReward;
    this.scrap += node.scrapReward;

    // Unlock connected nodes
    for (const nextId of node.connections) {
      const nextNode = this.sectorNodes.get(nextId);
      if (nextNode) {
        nextNode.available = true;
      }
    }
  }

  public repairUnit(unitId: string): { success: boolean; cost: number; message: string } {
    const unit = this.persistentSquad.find((u) => u.id === unitId);
    if (!unit) return { success: false, cost: 0, message: 'Unit not found' };

    const missingHp = unit.maxHp - unit.hp;
    if (missingHp <= 0 && !unit.isDead) {
      return { success: false, cost: 0, message: 'Unit is at full integrity' };
    }

    const scrapCost = unit.isDead ? 80 : Math.ceil(missingHp * 0.75);

    if (this.scrap < scrapCost) {
      return {
        success: false,
        cost: scrapCost,
        message: `Insufficient scrap. Required: ${scrapCost} Scrap`,
      };
    }

    this.scrap -= scrapCost;
    unit.isDead = false;
    unit.hp = unit.maxHp;
    unit.shields = unit.maxShields;

    return {
      success: true,
      cost: scrapCost,
      message: `${unit.name} fully repaired & restored to combat readiness!`,
    };
  }

  private initShopCatalog() {
    this.shopCatalog = [
      {
        id: 'shop_1',
        name: 'Overclocked Actuator',
        description: 'High-torque servomotors granting +1 Max Action Point (AP) to all squad members.',
        cost: 220,
        currency: 'credits',
        appliedToClass: 'all',
        effect: { stat: 'maxAp', bonus: 1 },
      },
      {
        id: 'shop_2',
        name: 'Nanofiber Reactive Plating',
        description: 'Reinforced hull plating giving +30 Max HP and +2 Armor.',
        cost: 160,
        currency: 'credits',
        appliedToClass: 'all',
        effect: { stat: 'maxHp', bonus: 30 },
      },
      {
        id: 'shop_3',
        name: 'Harmonic Shield Inverter',
        description: 'Advanced magnetic matrix adding +25 Max Shield capacity.',
        cost: 140,
        currency: 'credits',
        appliedToClass: 'all',
        effect: { stat: 'maxShields', bonus: 25 },
      },
      {
        id: 'shop_4',
        name: 'Hyper-Velocity Barrel Kit',
        description: 'Tungsten-carbide rifling boosting attack damage by +8.',
        cost: 180,
        currency: 'credits',
        appliedToClass: 'all',
        effect: { stat: 'attackDamage', bonus: 8 },
      },
      {
        id: 'shop_5',
        name: 'Thermal Precision Optics',
        description: 'Multi-spectrum targeting array granting +15% Critical Strike chance.',
        cost: 150,
        currency: 'credits',
        appliedToClass: 'all',
        effect: { stat: 'critChance', bonus: 15 },
      },
    ];
  }

  public purchaseItem(itemId: string): { success: boolean; message: string } {
    const item = this.shopCatalog.find((i) => i.id === itemId);
    if (!item) return { success: false, message: 'Item not found' };
    if (item.purchased) return { success: false, message: 'Item already purchased' };

    if (this.credits < item.cost) {
      return { success: false, message: `Insufficient credits. Need ${item.cost} credits.` };
    }

    this.credits -= item.cost;
    item.purchased = true;

    // Apply upgrade to squad
    for (const unit of this.persistentSquad) {
      if (item.appliedToClass === 'all' || unit.unitClass === item.appliedToClass) {
        if (item.effect.stat === 'maxAp') {
          unit.maxAp += item.effect.bonus;
          unit.ap = unit.maxAp;
        } else if (item.effect.stat === 'maxHp') {
          unit.maxHp += item.effect.bonus;
          unit.hp += item.effect.bonus;
        } else if (item.effect.stat === 'maxShields') {
          unit.maxShields += item.effect.bonus;
          unit.shields += item.effect.bonus;
        } else if (item.effect.stat === 'attackDamage') {
          unit.attackDamage += item.effect.bonus;
        } else if (item.effect.stat === 'critChance') {
          unit.critChance += item.effect.bonus;
        }
        unit.upgrades.push(item.name);
      }
    }

    return {
      success: true,
      message: `Purchased ${item.name}! Upgrades applied to squad.`,
    };
  }

  public getRandomTextEvent(): TextEvent {
    const events: TextEvent[] = [
      {
        title: 'Derelict Cargo Pod',
        scenario:
          'Your scanners identify a sealed orbital container floating amid station wreckage. Internal radiation leaks suggest an active power cell inside.',
        choices: [
          {
            text: 'Force open the sealed hatch with heavy cutters (-10 HP to squad, +110 Scrap)',
            outcomeText: 'A burst of superheated steam damages your mechs, but you retrieve dense titanium components!',
            scrapChange: 110,
            creditsChange: 0,
            hpChangePercent: -0.1,
          },
          {
            text: 'Deploy Hacker to bypass magnetic locks cleanly (+70 Credits, +40 Scrap)',
            outcomeText: 'Cipher-9 bypasses the lock cleanly. The container yields intact orbital trade tokens and clean scrap.',
            scrapChange: 40,
            creditsChange: 70,
            hpChangePercent: 0,
          },
          {
            text: 'Safely bypass and tag for orbital recovery (+30 Credits)',
            outcomeText: 'You log the location with orbital command and receive a discovery finder bounty.',
            scrapChange: 0,
            creditsChange: 30,
            hpChangePercent: 0,
          },
        ],
      },
      {
        title: 'Distress Beacon: Automated Fabrication Drone',
        scenario:
          'A damaged maintenance drone flashes an encrypted SOS sequence. Its logic core is looping in an emergency repair state.',
        choices: [
          {
            text: 'Extract nanite reservoirs into Medic supplies (+35 HP heal to squad)',
            outcomeText: 'Helix-4 successfully harvests high-grade repair nanites and patches all squad battle damage.',
            scrapChange: 0,
            creditsChange: 0,
            hpChangePercent: 0.35,
          },
          {
            text: 'Dismantle chassis for raw structural scrap (+95 Scrap)',
            outcomeText: 'You strip the chassis for valuable hardened plating and micro-servos.',
            scrapChange: 95,
            creditsChange: 0,
            hpChangePercent: 0,
          },
        ],
      },
    ];

    return events[Math.floor(Math.random() * events.length)];
  }
}
