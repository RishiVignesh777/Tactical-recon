import * as THREE from 'three';
import { Unit, UnitClass } from '../types';

export class MechBuilder {
  // Pre-allocated shared materials & geometries for optimal WebGL performance
  private static materials: Map<string, THREE.Material> = new Map();

  private static getMaterial(name: string, creator: () => THREE.Material): THREE.Material {
    let mat = this.materials.get(name);
    if (!mat) {
      mat = creator();
      this.materials.set(name, mat);
    }
    return mat;
  }

  // Create a procedural radial contact shadow plane
  public static createContactShadow(radius = 0.45): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.renderOrder = 2;
    return mesh;
  }

  /**
   * Builds a composite 3-12 part procedural 3D mech for a unit.
   */
  public static buildUnitMesh(unit: Unit): THREE.Group {
    const group = new THREE.Group();
    group.name = `Unit_${unit.id}`;

    // Base colors based on team
    const isPlayer = unit.team === 'player';
    const primaryColor = isPlayer ? 0x0f223d : 0x2d1118; // dark titanium / dark obsidian
    const secondaryColor = isPlayer ? 0x1a4575 : 0x5a1825; // secondary armor plating
    const accentColor = isPlayer ? 0x00f0ff : 0xff3366; // glowing cyan or crimson

    // Add contact shadow
    const shadow = this.createContactShadow(unit.unitClass === 'boss' ? 0.9 : 0.4);
    group.add(shadow);

    switch (unit.unitClass) {
      case 'vanguard':
        this.assembleVanguard(group, primaryColor, secondaryColor, accentColor);
        break;
      case 'sniper':
        this.assembleSniper(group, primaryColor, secondaryColor, accentColor);
        break;
      case 'hacker':
        this.assembleHacker(group, primaryColor, secondaryColor, 0xffaa00);
        break;
      case 'medic':
        this.assembleMedic(group, primaryColor, secondaryColor, 0x00ff88);
        break;
      case 'drone':
        this.assembleDrone(group, 0x222222, 0x441111, 0xff3366);
        break;
      case 'turret':
        this.assembleTurret(group, 0x252830, 0x4a1820, 0xffaa00);
        break;
      case 'infiltrator':
        this.assembleInfiltrator(group, 0x111622, 0x331122, 0xff00ff);
        break;
      case 'enforcer':
        this.assembleEnforcer(group, 0x1c1e24, 0x44161a, 0xff3344);
        break;
      case 'boss':
        this.assembleOverseerTitan(group, 0x141820, 0x44181e, 0xffaa00);
        break;
      default:
        this.assembleVanguard(group, primaryColor, secondaryColor, accentColor);
        break;
    }

    // Floating 3D Health & AP holographic display
    const vitalsGroup = this.buildVitalsDisplay(unit);
    vitalsGroup.name = 'VitalsDisplay';
    vitalsGroup.position.y = unit.unitClass === 'boss' ? 1.6 : 1.1;
    group.add(vitalsGroup);
    unit.healthBarGroup = vitalsGroup;

    // Shield bubble container (hidden until shielded)
    const shieldGeo = new THREE.SphereGeometry(unit.unitClass === 'boss' ? 1.0 : 0.55, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: isPlayer ? 0x00f0ff : 0xff3366,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
      depthWrite: false,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.name = 'ShieldBubble';
    shieldMesh.position.y = unit.unitClass === 'boss' ? 0.75 : 0.45;
    shieldMesh.visible = unit.shields > 0;
    group.add(shieldMesh);

    return group;
  }

  // Vanguard Heavy Mech
  private static assembleVanguard(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.85, roughness: 0.25 });
    const armorMat = new THREE.MeshStandardMaterial({ color: sec, metalness: 0.6, roughness: 0.35 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.5, roughness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.15 });

    // 1. Treads / Legs base
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.18), darkMat);
    legL.position.set(-0.16, 0.15, 0);
    const legR = legL.clone();
    legR.position.x = 0.16;

    // 2. Hip joint
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), chromeMat);
    hip.rotation.z = Math.PI / 2;
    hip.position.y = 0.3;

    // 3. Torso Hull
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.28), armorMat);
    torso.position.y = 0.48;

    // 4. Chest armor plate
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.06), darkMat);
    chestPlate.position.set(0, 0.5, 0.15);

    // 5. Visor (Glow)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), glowMat);
    visor.position.set(0, 0.66, 0.12);

    // 6. Pauldrons
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.2), darkMat);
    pauldronL.position.set(-0.25, 0.56, 0);
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.25;

    // 7. Left Arm: Massive Riot Shield
    const shieldArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.28), armorMat);
    shieldArm.position.set(-0.3, 0.35, 0.1);
    const shieldGlow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.2), glowMat);
    shieldGlow.position.set(-0.35, 0.35, 0.1);

    // 8. Right Arm: Rotary Plasma Cannon
    const cannonArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 8), chromeMat);
    cannonArm.rotation.x = Math.PI / 2;
    cannonArm.position.set(0.28, 0.42, 0.2);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), glowMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0.28, 0.42, 0.38);

    group.add(legL, legR, hip, torso, chestPlate, visor, pauldronL, pauldronR, shieldArm, shieldGlow, cannonArm, muzzle);
  }

  // Sniper Scout Mech
  private static assembleSniper(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.9, roughness: 0.2 });
    const armorMat = new THREE.MeshStandardMaterial({ color: sec, metalness: 0.7, roughness: 0.3 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.8, roughness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.95, roughness: 0.1 });

    // Slender bipod legs
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.38, 8), chromeMat);
    legL.position.set(-0.12, 0.19, 0);
    const legR = legL.clone();
    legR.position.x = 0.12;

    // Aerodynamic chassis
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), armorMat);
    body.rotation.x = Math.PI;
    body.position.y = 0.48;

    // Dual-optic rangefinder head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.16), darkMat);
    head.position.set(0, 0.7, 0);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), glowMat);
    eyeL.position.set(-0.04, 0.7, 0.08);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.04;

    // Hyper-velocity Railgun (Elongated)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.65, 8), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.18, 0.5, 0.26);

    const coils = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 12), glowMat);
    coils.position.set(0.18, 0.5, 0.32);

    // Antenna on back
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 6), chromeMat);
    antenna.position.set(-0.06, 0.8, -0.06);

    group.add(legL, legR, body, head, eyeL, eyeR, barrel, coils, antenna);
  }

  // Hacker Cyber-Chassis
  private static assembleHacker(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.8, roughness: 0.25 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.5, roughness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.2 });

    // 4 spider legs
    const legAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    legAngles.forEach((angle) => {
      const legUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), darkMat);
      legUpper.rotation.z = 0.5;
      legUpper.rotation.y = angle;
      legUpper.position.set(Math.cos(angle) * 0.18, 0.16, Math.sin(angle) * 0.18);
      group.add(legUpper);
    });

    // Central orb core
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), darkMat);
    core.position.y = 0.34;

    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 16), glowMat);
    coreRing.position.y = 0.34;

    // Holographic radar dish
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.02, 0.04, 12), chromeMat);
    dish.rotation.x = 0.4;
    dish.position.set(0, 0.52, -0.05);

    // EMP arc projector
    const emitter = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), glowMat);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0.34, 0.22);

    group.add(core, coreRing, dish, emitter);
  }

  // Medic Nanite Specialist
  private static assembleMedic(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.8, roughness: 0.25 });
    const armorMat = new THREE.MeshStandardMaterial({ color: sec, metalness: 0.6, roughness: 0.3 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.6, roughness: 0.1 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.14), darkMat);
    legL.position.set(-0.13, 0.14, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.22), whiteMat);
    torso.position.y = 0.42;

    // Medical cross on chest
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.02), glowMat);
    crossH.position.set(0, 0.44, 0.12);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.02), glowMat);
    crossV.position.set(0, 0.44, 0.12);

    // Head
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 10), armorMat);
    head.position.y = 0.62;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), glowMat);
    visor.position.set(0, 0.62, 0.08);

    // Nanite canister backpack
    const canisterL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), glowMat);
    canisterL.position.set(-0.1, 0.46, -0.14);
    const canisterR = canisterL.clone();
    canisterR.position.x = 0.1;

    // Mini Triage Drone hovering on shoulder
    const drone = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), glowMat);
    drone.position.set(0.24, 0.72, 0.08);

    group.add(legL, legR, torso, crossH, crossV, head, visor, canisterL, canisterR, drone);
  }

  // Corrupted Drone Swarmer
  private static assembleDrone(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.9, roughness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 2.0, roughness: 0.1 });

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), darkMat);
    core.position.y = 0.35;

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), glowMat);
    eye.position.set(0, 0.35, 0.12);

    // 3 rotor fins
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.06), darkMat);
      blade.position.set(Math.cos(angle) * 0.2, 0.38, Math.sin(angle) * 0.2);
      blade.rotation.y = angle;
      group.add(blade);
    }

    // Plasma stinger
    const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 6), glowMat);
    stinger.rotation.x = Math.PI / 2;
    stinger.position.set(0, 0.24, 0.18);

    group.add(core, eye, stinger);
  }

  // Automated Defense Turret
  private static assembleTurret(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.85, roughness: 0.3 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.5, roughness: 0.1 });

    // Hexagonal armored bunker base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.24, 6), darkMat);
    base.position.y = 0.12;

    // Turret rotating head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.28), darkMat);
    head.position.y = 0.34;

    // Dual barrels
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), darkMat);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(-0.07, 0.34, 0.24);

    const b2 = b1.clone();
    b2.position.x = 0.07;

    const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.03), glowMat);
    sensor.position.set(0, 0.42, 0.14);

    group.add(base, head, b1, b2, sensor);
  }

  // Stealth Infiltrator
  private static assembleInfiltrator(group: THREE.Group, pri: number, sec: number, acc: number) {
    const stealthMat = new THREE.MeshStandardMaterial({
      color: pri,
      metalness: 0.95,
      roughness: 0.15,
      transparent: true,
      opacity: 0.85,
    });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.8, roughness: 0.1 });

    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.32, 6), stealthMat);
    legs.position.y = 0.16;

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 5), stealthMat);
    body.rotation.x = Math.PI;
    body.position.y = 0.44;

    const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.05), glowMat);
    bladeL.position.set(-0.2, 0.38, 0.12);
    bladeL.rotation.x = 0.3;

    const bladeR = bladeL.clone();
    bladeR.position.x = 0.2;

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.05), glowMat);
    visor.position.set(0, 0.58, 0.08);

    group.add(legs, body, bladeL, bladeR, visor);
  }

  // Heavy Enforcer Siege Mech
  private static assembleEnforcer(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.85, roughness: 0.3 });
    const armorMat = new THREE.MeshStandardMaterial({ color: sec, metalness: 0.7, roughness: 0.35 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.5, roughness: 0.1 });

    // Heavy biped legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.24), darkMat);
    legL.position.set(-0.22, 0.18, 0);
    const legR = legL.clone();
    legR.position.x = 0.22;

    // Armored bulk torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.36), armorMat);
    torso.position.y = 0.54;

    // Mortar pod on left shoulder
    const mortar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.25, 8), darkMat);
    mortar.position.set(-0.24, 0.8, -0.06);
    mortar.rotation.x = -0.4;

    // Heavy siege cannon on right arm
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.45, 8), darkMat);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0.32, 0.5, 0.25);

    const eyeVisor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.04), glowMat);
    eyeVisor.position.set(0, 0.62, 0.19);

    group.add(legL, legR, torso, mortar, cannon, eyeVisor);
  }

  // Overseer Titan Boss Mech
  private static assembleOverseerTitan(group: THREE.Group, pri: number, sec: number, acc: number) {
    const darkMat = new THREE.MeshStandardMaterial({ color: pri, metalness: 0.9, roughness: 0.2 });
    const armorMat = new THREE.MeshStandardMaterial({ color: sec, metalness: 0.75, roughness: 0.25 });
    const glowMat = new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 2.2, roughness: 0.1 });

    // 4 massive pillar legs
    const legPositions = [
      { x: -0.35, z: -0.25 },
      { x: 0.35, z: -0.25 },
      { x: -0.4, z: 0.25 },
      { x: 0.4, z: 0.25 },
    ];
    legPositions.forEach((pos) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.22), darkMat);
      leg.position.set(pos.x, 0.225, pos.z);
      group.add(leg);
    });

    // Colossal Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.55), armorMat);
    torso.position.y = 0.7;

    // Boss Core Eye
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), glowMat);
    eye.position.set(0, 0.72, 0.28);

    // Dual Missile Pods
    const podL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.3), darkMat);
    podL.position.set(-0.46, 1.05, 0);
    const podR = podL.clone();
    podR.position.x = 0.46;

    // Twin Plasma Siege Arrays
    const cannonL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 8), darkMat);
    cannonL.rotation.x = Math.PI / 2;
    cannonL.position.set(-0.35, 0.65, 0.4);

    const cannonR = cannonL.clone();
    cannonR.position.x = 0.35;

    // Head Crown
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.2, 4), glowMat);
    crown.position.set(0, 1.05, 0);

    group.add(torso, eye, podL, podR, cannonL, cannonR, crown);
  }

  /**
   * Builds the 3D in-world health and AP holographic bars floating above each unit.
   */
  public static buildVitalsDisplay(unit: Unit): THREE.Group {
    const group = new THREE.Group();

    // Background bar
    const barWidth = 0.5;
    const barHeight = 0.05;

    const bgMat = new THREE.MeshBasicMaterial({ color: 0x111622, depthTest: false });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(barWidth, barHeight * 2), bgMat);
    bgMesh.renderOrder = 99;

    // Health bar fill
    const hpRatio = Math.max(0, unit.hp / unit.maxHp);
    const hpColor = unit.team === 'player' ? 0x00ff88 : 0xff3366;
    const hpMat = new THREE.MeshBasicMaterial({ color: hpColor, depthTest: false });
    const hpMesh = new THREE.Mesh(new THREE.PlaneGeometry(barWidth * hpRatio, barHeight), hpMat);
    hpMesh.name = 'HpBarFill';
    hpMesh.position.set((-barWidth * (1 - hpRatio)) / 2, barHeight / 2, 0.001);
    hpMesh.renderOrder = 100;

    // Shield bar fill (if applicable)
    const shieldRatio = unit.maxShields > 0 ? Math.max(0, unit.shields / unit.maxShields) : 0;
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, depthTest: false });
    const shieldMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(barWidth * Math.max(0.001, shieldRatio), barHeight),
      shieldMat
    );
    shieldMesh.name = 'ShieldBarFill';
    shieldMesh.position.set((-barWidth * (1 - shieldRatio)) / 2, -barHeight / 2, 0.001);
    shieldMesh.renderOrder = 100;
    shieldMesh.visible = unit.maxShields > 0;

    group.add(bgMesh, hpMesh, shieldMesh);
    return group;
  }

  /**
   * Updates the floating vitals bar when HP or shields change.
   */
  public static updateVitals(unit: Unit) {
    if (!unit.healthBarGroup || !unit.mesh) return;

    const hpBar = unit.healthBarGroup.getObjectByName('HpBarFill') as THREE.Mesh;
    const shieldBar = unit.healthBarGroup.getObjectByName('ShieldBarFill') as THREE.Mesh;
    const shieldBubble = unit.mesh.getObjectByName('ShieldBubble') as THREE.Mesh;

    const barWidth = 0.5;
    const barHeight = 0.05;

    if (hpBar) {
      const hpRatio = Math.max(0.001, unit.hp / unit.maxHp);
      hpBar.scale.x = hpRatio;
      hpBar.position.x = (-barWidth * (1 - hpRatio)) / 2;
    }

    if (shieldBar) {
      if (unit.maxShields > 0) {
        const shieldRatio = Math.max(0.001, unit.shields / unit.maxShields);
        shieldBar.scale.x = shieldRatio;
        shieldBar.position.x = (-barWidth * (1 - shieldRatio)) / 2;
        shieldBar.visible = unit.shields > 0;
      } else {
        shieldBar.visible = false;
      }
    }

    if (shieldBubble) {
      shieldBubble.visible = unit.shields > 0;
    }
  }
}
