import * as THREE from 'three';

export type Team = 'player' | 'enemy';

export type UnitClass =
  | 'vanguard'
  | 'sniper'
  | 'hacker'
  | 'medic'
  | 'drone'
  | 'turret'
  | 'infiltrator'
  | 'enforcer'
  | 'boss';

export type TileType =
  | 'empty'
  | 'low_cover'
  | 'high_cover'
  | 'hazard'
  | 'terminal'
  | 'elevation'
  | 'extraction';

export interface GridCoord {
  x: number;
  z: number;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  apCost: number;
  cooldown: number;
  currentCooldown: number;
  range: number;
  targetType: 'enemy' | 'ally' | 'self' | 'tile';
  icon: string;
}

export interface UnitStatus {
  name: string;
  duration: number; // turns
  effectType: 'stunned' | 'overwatch' | 'shielded' | 'boosted' | 'cloaked' | 'hazard_burn';
  value?: number;
}

export interface Unit {
  id: string;
  name: string;
  team: Team;
  unitClass: UnitClass;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  shields: number;
  maxShields: number;
  armor: number; // flat damage reduction
  ap: number;
  maxAp: number;
  moveRange: number; // tiles per AP
  attackRange: number;
  attackDamage: number;
  critChance: number;
  abilities: Ability[];
  statusEffects: UnitStatus[];
  mesh?: THREE.Group;
  healthBarGroup?: THREE.Group;
  isDead: boolean;
  level: number;
  kills: number;
  upgrades: string[];
}

export interface TileData {
  x: number;
  z: number;
  type: TileType;
  height: number;
  occupiedBy?: string; // unit id
  hacked?: boolean;
}

export interface CombatLogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'damage' | 'heal' | 'shield' | 'hack' | 'info' | 'warn';
}

export type CombatState =
  | 'INIT'
  | 'PLAYER_TURN'
  | 'ACTION_ANIMATING'
  | 'ENEMY_TURN'
  | 'EVALUATING'
  | 'VICTORY'
  | 'DEFEAT';

export type SelectedAction =
  | 'MOVE'
  | 'ATTACK'
  | 'ABILITY_1'
  | 'ABILITY_2'
  | 'OVERWATCH'
  | null;

export type SectorNodeType =
  | 'skirmish'
  | 'terminal_hack'
  | 'ambush'
  | 'event'
  | 'shop'
  | 'boss';

export interface SectorNode {
  id: string;
  col: number;
  row: number;
  type: SectorNodeType;
  title: string;
  description: string;
  completed: boolean;
  available: boolean;
  connections: string[]; // next node ids
  creditsReward: number;
  scrapReward: number;
}

export interface TextEventChoice {
  text: string;
  outcomeText: string;
  scrapChange: number;
  creditsChange: number;
  hpChangePercent: number;
}

export interface TextEvent {
  title: string;
  scenario: string;
  choices: TextEventChoice[];
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  currency: 'credits' | 'scrap';
  appliedToClass?: UnitClass | 'all';
  effect: {
    stat: 'maxHp' | 'maxShields' | 'armor' | 'maxAp' | 'attackDamage' | 'critChance';
    bonus: number;
  };
  purchased?: boolean;
}
