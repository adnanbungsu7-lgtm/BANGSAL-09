import * as THREE from 'three';
import { HorrorTextureSet } from './textures';

export interface StalkerRig {
  root: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  eyeLight: THREE.PointLight;
}

export interface ExitGateRig {
  root: THREE.Group;
  doorLeaf: THREE.Group;
  leds: THREE.Mesh[];
  statusLight: THREE.PointLight;
}

export function createStalkerEntity(): StalkerRig {
  const root = new THREE.Group();

  const fleshMat = new THREE.MeshStandardMaterial({
    color: 0x1c1b21,
    roughness: 0.85,
    metalness: 0.1,
  });
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0x726d66,
    roughness: 0.65,
    metalness: 0.08,
  });
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0x3b3532,
    roughness: 0.5,
    metalness: 0.25,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff2b2b,
    emissive: 0xff1e1e,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });

  // Legs (grounded at y=0)
  const makeLeg = (xOffset: number) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(xOffset, 0.95, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), fleshMat);
    thigh.position.y = -0.26;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.48, 0.11), boneMat);
    shin.position.y = -0.71;
    legGroup.add(thigh, shin);
    return legGroup;
  };

  const leftLeg = makeLeg(-0.17);
  const rightLeg = makeLeg(0.17);
  root.add(leftLeg, rightLeg);

  // Pelvis & Torso
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.26), fleshMat);
  pelvis.position.y = 1.02;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.78, 0.28), fleshMat);
  torso.position.y = 1.48;
  root.add(pelvis, torso);

  // Exposed rib plates + spine ridges
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.31), ribMat);
    rib.position.y = 1.32 + i * 0.16;
    root.add(rib);
  }
  const shoulderBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.26), fleshMat);
  shoulderBar.position.y = 1.88;
  root.add(shoulderBar);

  // Long spindly arms
  const makeArm = (xOffset: number) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(xOffset, 1.86, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), fleshMat);
    upper.position.y = -0.3;
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.68, 0.09), boneMat);
    forearm.position.set(0, -0.92, 0.06);
    forearm.rotation.x = -0.22;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 12), ribMat);
    claw.position.set(0, -1.32, 0.14);
    claw.rotation.x = Math.PI - 0.2;
    armGroup.add(upper, forearm, claw);
    return armGroup;
  };

  const leftArm = makeArm(-0.38);
  const rightArm = makeArm(0.38);
  root.add(leftArm, rightArm);

  // Uncanny tilted head
  const head = new THREE.Group();
  head.position.set(0, 1.98, 0.04);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 14), fleshMat);
  neck.position.y = 0.07;
  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.32), boneMat);
  cranium.position.y = 0.28;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.24), ribMat);
  jaw.position.set(0, 0.11, 0.03);

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), eyeMat);
  eyeL.position.set(-0.07, 0.31, 0.16);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), eyeMat);
  eyeR.position.set(0.07, 0.31, 0.16);

  head.add(neck, cranium, jaw, eyeL, eyeR);
  root.add(head);

  const eyeLight = new THREE.PointLight(0xff2222, 1.5, 5.5, 1.6);
  eyeLight.position.set(0, 2.25, 0.3);
  root.add(eyeLight);

  return { root, head, leftArm, rightArm, leftLeg, rightLeg, eyeLight };
}

export function createFuseModel(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0x92400e,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    metalness: 0.2,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.25,
    metalness: 0.85,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.7,
    metalness: 0.4,
  });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.24), baseMat);
  plinth.position.y = 0.04;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 18), bodyMat);
  tube.rotation.z = Math.PI / 2;
  tube.position.y = 0.16;
  const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 18), capMat);
  capL.rotation.z = Math.PI / 2;
  capL.position.set(-0.17, 0.16, 0);
  const capR = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 18), capMat);
  capR.rotation.z = Math.PI / 2;
  capR.position.set(0.17, 0.16, 0);

  group.add(plinth, tube, capL, capR);
  return group;
}

export function createBatteryModel(): THREE.Group {
  const group = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x164e63,
    roughness: 0.4,
    metalness: 0.3,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0891b2,
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.2,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.2,
    metalness: 0.9,
  });

  const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 18), shellMat);
  cell.position.y = 0.13;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.08, 18), bandMat);
  band.position.y = 0.19;
  const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 14), tipMat);
  nub.position.y = 0.28;

  group.add(cell, band, nub);
  return group;
}

export function createMedkitModel(): THREE.Group {
  const group = new THREE.Group();

  const caseMat = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.45,
    metalness: 0.15,
  });
  const crossMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x374151,
    roughness: 0.5,
    metalness: 0.7,
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), caseMat);
  box.position.y = 0.06;
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.16), crossMat);
  crossV.position.y = 0.125;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.06), crossMat);
  crossH.position.y = 0.125;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), handleMat);
  handle.position.set(0, 0.06, 0.14);

  group.add(box, crossV, crossH, handle);
  return group;
}

export function createNoteModel(tex: HorrorTextureSet): THREE.Group {
  const group = new THREE.Group();

  const boardMat = new THREE.MeshStandardMaterial({
    map: tex.wood,
    roughness: 0.8,
    metalness: 0.05,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    map: tex.paper,
    emissive: 0x3b321d,
    emissiveIntensity: 0.45,
    roughness: 0.9,
  });
  const clipMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.3,
    metalness: 0.85,
  });

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.42), boardMat);
  board.position.y = 0.015;
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.01, 0.34), paperMat);
  sheet.position.y = 0.035;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.05), clipMat);
  clip.position.set(0, 0.045, -0.17);

  group.add(board, sheet, clip);
  return group;
}

export function createExitGateModel(tex: HorrorTextureSet): ExitGateRig {
  const root = new THREE.Group();

  const ironMat = new THREE.MeshStandardMaterial({
    map: tex.metal,
    roughness: 0.55,
    metalness: 0.78,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x181c24,
    roughness: 0.6,
    metalness: 0.5,
  });

  // Outer Frame
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.1, 0.24), ironMat);
  postL.position.set(-1.35, 1.55, 0);
  const postR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.1, 0.24), ironMat);
  postR.position.set(1.35, 1.55, 0);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.92, 0.28, 0.28), ironMat);
  lintel.position.set(0, 3.02, 0);
  root.add(postL, postR, lintel);

  // Sliding Bars Leaf
  const doorLeaf = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.85, 6), ironMat);
    bar.position.set(i * 0.48, 1.425, 0);
    doorLeaf.add(bar);
  }
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), ironMat);
  cross1.position.set(0, 0.9, 0);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), ironMat);
  cross2.position.set(0, 2.1, 0);
  doorLeaf.add(cross1, cross2);
  root.add(doorLeaf);

  // Breaker Box on right post
  const breaker = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.16), panelMat);
  breaker.position.set(1.32, 1.45, 0.2);
  root.add(breaker);

  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xdc2626,
      emissiveIntensity: 1.6,
      roughness: 0.25,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), ledMat);
    led.position.set(1.19 + i * 0.085, 1.52, 0.28);
    leds.push(led);
    root.add(led);
  }

  const statusLight = new THREE.PointLight(0xdc2626, 1.4, 6.0, 2);
  statusLight.position.set(1.32, 1.85, 0.5);
  root.add(statusLight);

  return { root, doorLeaf, leds, statusLight };
}

export function createHospitalBed(tex: HorrorTextureSet): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({
    map: tex.metal,
    roughness: 0.45,
    metalness: 0.8,
  });
  const mattressMat = new THREE.MeshStandardMaterial({
    color: 0x6b6f63,
    roughness: 0.92,
    metalness: 0.02,
  });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 2.05), metalMat);
  frame.position.y = 0.42;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 1.92), mattressMat);
  mattress.position.y = 0.56;
  const headBoard = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.85, 0.08), metalMat);
  headBoard.position.set(0, 0.62, -0.98);
  const footBoard = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.08), metalMat);
  footBoard.position.set(0, 0.47, 0.98);

  const legPositions = [
    [-0.46, -0.94],
    [0.46, -0.94],
    [-0.46, 0.94],
    [0.46, 0.94],
  ];
  legPositions.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), metalMat);
    leg.position.set(lx, 0.21, lz);
    group.add(leg);
  });

  group.add(frame, mattress, headBoard, footBoard);
  return group;
}

export function createMetalLocker(tex: HorrorTextureSet): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({
    map: tex.metal,
    roughness: 0.5,
    metalness: 0.72,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x0f1115,
    roughness: 0.9,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.05, 0.58), metalMat);
  body.position.y = 1.025;
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.07, 0.62), metalMat);
  topTrim.position.y = 2.08;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.06), darkMat);
  handle.position.set(0.28, 1.08, 0.3);

  for (let i = 0; i < 3; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.02), darkMat);
    vent.position.set(0, 1.72 - i * 0.09, 0.295);
    group.add(vent);
  }

  group.add(body, topTrim, handle);
  return group;
}

export function createDeskTable(tex: HorrorTextureSet): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    map: tex.wood,
    roughness: 0.85,
    metalness: 0.05,
  });
  const legMat = new THREE.MeshStandardMaterial({
    map: tex.metal,
    roughness: 0.5,
    metalness: 0.7,
  });

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.75), woodMat);
  top.position.y = 0.74;
  group.add(top);

  [
    [-0.55, -0.31],
    [0.55, -0.31],
    [-0.55, 0.31],
    [0.55, 0.31],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.74, 0.07), legMat);
    leg.position.set(lx, 0.37, lz);
    group.add(leg);
  });

  return group;
}
