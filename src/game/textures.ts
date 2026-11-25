import * as THREE from 'three';

export interface HorrorTextureSet {
  wall: THREE.CanvasTexture;
  wallBlood: THREE.CanvasTexture;
  floor: THREE.CanvasTexture;
  ceiling: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  paper: THREE.CanvasTexture;
  dispose: () => void;
}

function makeSmoothCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  return [canvas, ctx];
}

function finalizeSmoothTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function hash2d(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function createHorrorTextures(maxAnisotropy = 4): HorrorTextureSet {
  // 1. Hospital Wall (256x256 smooth plaster + ceramic lower dado tiles)
  const [wallCanvas, wallCtx] = makeSmoothCanvas(256);
  const plasterGrad = wallCtx.createLinearGradient(0, 0, 0, 170);
  plasterGrad.addColorStop(0, '#4f5756');
  plasterGrad.addColorStop(0.65, '#626b68');
  plasterGrad.addColorStop(1, '#4b5451');
  wallCtx.fillStyle = plasterGrad;
  wallCtx.fillRect(0, 0, 256, 170);

  // Subtle damp/peeling patches on upper wall
  for (let i = 0; i < 180; i++) {
    const px = hash2d(i, 1, 31) * 256;
    const py = hash2d(i, 2, 37) * 165;
    const r = 6 + hash2d(i, 3, 41) * 22;
    const alpha = 0.03 + hash2d(i, 4, 43) * 0.06;
    wallCtx.fillStyle = hash2d(i, 5, 47) > 0.5 ? `rgba(25, 30, 28, ${alpha})` : `rgba(180, 192, 185, ${alpha * 0.7})`;
    wallCtx.beginPath();
    wallCtx.arc(px, py, r, 0, Math.PI * 2);
    wallCtx.fill();
  }

  // Dark chair-rail trim
  wallCtx.fillStyle = '#252b33';
  wallCtx.fillRect(0, 168, 256, 8);
  wallCtx.fillStyle = '#38414b';
  wallCtx.fillRect(0, 168, 256, 2);

  // Lower ceramic hospital tiles (176..256)
  wallCtx.fillStyle = '#2b3b3a';
  wallCtx.fillRect(0, 176, 256, 80);
  const tileSize = 32;
  for (let ty = 176; ty < 256; ty += tileSize) {
    for (let tx = 0; tx < 256; tx += tileSize) {
      const shade = Math.floor((hash2d(tx, ty, 202) - 0.5) * 10);
      wallCtx.fillStyle = `rgb(${44 + shade}, ${62 + shade}, ${59 + shade})`;
      wallCtx.fillRect(tx + 1, ty + 1, tileSize - 2, tileSize - 2);
      wallCtx.fillStyle = 'rgba(255,255,255,0.06)';
      wallCtx.fillRect(tx + 1, ty + 1, tileSize - 2, 2);
    }
  }
  // Subtle vertical rust/water stains
  for (let i = 0; i < 10; i++) {
    const dx = hash2d(i, 7, 404) * 246 + 5;
    const len = 32 + hash2d(i, 11, 505) * 110;
    const dripGrad = wallCtx.createLinearGradient(dx, 0, dx, len);
    dripGrad.addColorStop(0, 'rgba(32, 24, 18, 0.42)');
    dripGrad.addColorStop(1, 'rgba(32, 24, 18, 0)');
    wallCtx.fillStyle = dripGrad;
    wallCtx.fillRect(dx, 0, 3, len);
  }
  const wall = finalizeSmoothTexture(wallCanvas, 1, 1, maxAnisotropy);

  // 2. Blood-stained wall (256x256)
  const [wbCanvas, wbCtx] = makeSmoothCanvas(256);
  wbCtx.drawImage(wallCanvas, 0, 0);
  const splatters = [
    [96, 88, 28],
    [122, 108, 19],
    [144, 96, 22],
    [168, 118, 14],
  ];
  splatters.forEach(([sx, sy, sr], idx) => {
    const g = wbCtx.createRadialGradient(sx, sy, 2, sx, sy, sr);
    g.addColorStop(0, 'rgba(118, 12, 14, 0.9)');
    g.addColorStop(0.65, 'rgba(84, 9, 11, 0.72)');
    g.addColorStop(1, 'rgba(55, 6, 8, 0)');
    wbCtx.fillStyle = g;
    wbCtx.beginPath();
    wbCtx.arc(sx, sy, sr, 0, Math.PI * 2);
    wbCtx.fill();

    // Vertical drips
    for (let d = 0; d < 3; d++) {
      const rx = sx - sr * 0.4 + d * (sr * 0.4);
      const rlen = 35 + hash2d(idx, d, 909) * 55;
      const dg = wbCtx.createLinearGradient(rx, sy, rx, sy + rlen);
      dg.addColorStop(0, 'rgba(98, 10, 12, 0.85)');
      dg.addColorStop(1, 'rgba(55, 6, 8, 0)');
      wbCtx.fillStyle = dg;
      wbCtx.fillRect(rx, sy, 3.5, rlen);
    }
  });
  const wallBlood = finalizeSmoothTexture(wbCanvas, 1, 1, maxAnisotropy);

  // 3. Floor (256x256 smooth hospital linoleum tiles)
  const [floorCanvas, floorCtx] = makeSmoothCanvas(256);
  floorCtx.fillStyle = '#20242a';
  floorCtx.fillRect(0, 0, 256, 256);
  const fTile = 64;
  for (let y = 0; y < 256; y += fTile) {
    for (let x = 0; x < 256; x += fTile) {
      const checker = (x / fTile + y / fTile) % 2 === 0;
      const base = checker ? 64 : 49;
      const jitter = Math.floor((hash2d(x, y, 606) - 0.5) * 6);
      floorCtx.fillStyle = `rgb(${base + jitter}, ${base + 3 + jitter}, ${base + 5 + jitter})`;
      floorCtx.fillRect(x + 2, y + 2, fTile - 4, fTile - 4);
      // Soft specular scuff streaks
      floorCtx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      floorCtx.fillRect(x + 4, y + 4, fTile - 8, 3);
    }
  }
  for (let i = 0; i < 120; i++) {
    const sx = hash2d(i, 1, 707) * 256;
    const sy = hash2d(i, 2, 709) * 256;
    floorCtx.fillStyle = 'rgba(10, 12, 16, 0.14)';
    floorCtx.beginPath();
    floorCtx.arc(sx, sy, 4 + hash2d(i, 3, 719) * 14, 0, Math.PI * 2);
    floorCtx.fill();
  }
  const floor = finalizeSmoothTexture(floorCanvas, 19, 19, maxAnisotropy);

  // 4. Ceiling (128x128 acoustic ceiling panels)
  const [ceilCanvas, ceilCtx] = makeSmoothCanvas(128);
  ceilCtx.fillStyle = '#1c2026';
  ceilCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 64) {
    for (let x = 0; x < 128; x += 64) {
      ceilCtx.fillStyle = '#2c323b';
      ceilCtx.fillRect(x + 2, y + 2, 60, 60);
      for (let i = 0; i < 40; i++) {
        const dx = x + 6 + hash2d(x + i, y, 808) * 52;
        const dy = y + 6 + hash2d(x, y + i, 809) * 52;
        ceilCtx.fillStyle = 'rgba(15, 18, 22, 0.35)';
        ceilCtx.fillRect(dx, dy, 1.5, 1.5);
      }
    }
  }
  const ceiling = finalizeSmoothTexture(ceilCanvas, 19, 19, maxAnisotropy);

  // 5. Brushed / Aged Metal (128x128)
  const [metalCanvas, metalCtx] = makeSmoothCanvas(128);
  const metalGrad = metalCtx.createLinearGradient(0, 0, 128, 128);
  metalGrad.addColorStop(0, '#444d58');
  metalGrad.addColorStop(0.5, '#555f6b');
  metalGrad.addColorStop(1, '#39414a');
  metalCtx.fillStyle = metalGrad;
  metalCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    const a = 0.03 + hash2d(y, 1, 1111) * 0.05;
    metalCtx.fillStyle = y % 4 === 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    metalCtx.fillRect(0, y, 128, 1);
  }
  for (let i = 0; i < 16; i++) {
    const rx = hash2d(i, 1, 1212) * 120;
    const ry = hash2d(i, 2, 1213) * 120;
    const rg = metalCtx.createRadialGradient(rx, ry, 1, rx, ry, 16);
    rg.addColorStop(0, 'rgba(92, 46, 26, 0.38)');
    rg.addColorStop(1, 'rgba(92, 46, 26, 0)');
    metalCtx.fillStyle = rg;
    metalCtx.beginPath();
    metalCtx.arc(rx, ry, 16, 0, Math.PI * 2);
    metalCtx.fill();
  }
  const metal = finalizeSmoothTexture(metalCanvas, 1, 1, maxAnisotropy);

  // 6. Smooth Aged Wood (128x128)
  const [woodCanvas, woodCtx] = makeSmoothCanvas(128);
  woodCtx.fillStyle = '#4a3121';
  woodCtx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 32) {
    woodCtx.fillStyle = 'rgba(22, 13, 8, 0.65)';
    woodCtx.fillRect(x, 0, 2, 128);
  }
  for (let i = 0; i < 90; i++) {
    const gx = hash2d(i, 1, 1313) * 128;
    const gw = 1 + hash2d(i, 2, 1314) * 2;
    woodCtx.fillStyle = hash2d(i, 3, 1315) > 0.5 ? 'rgba(28, 16, 10, 0.25)' : 'rgba(110, 74, 48, 0.16)';
    woodCtx.fillRect(gx, 0, gw, 128);
  }
  const wood = finalizeSmoothTexture(woodCanvas, 1, 1, maxAnisotropy);

  // 7. Smooth Note Paper (128x128)
  const [paperCanvas, paperCtx] = makeSmoothCanvas(128);
  paperCtx.fillStyle = '#ddd3b6';
  paperCtx.fillRect(0, 0, 128, 128);
  paperCtx.fillStyle = 'rgba(85, 68, 45, 0.22)';
  for (let y = 18; y < 114; y += 10) {
    paperCtx.fillRect(10, y, 108, 1);
  }
  paperCtx.fillStyle = '#33291e';
  for (let y = 24; y < 104; y += 12) {
    const w = 68 + Math.floor(hash2d(y, 1, 1414) * 32);
    paperCtx.fillRect(14, y, w, 2.5);
  }
  const bloodMark = paperCtx.createRadialGradient(96, 98, 2, 96, 98, 18);
  bloodMark.addColorStop(0, 'rgba(115, 16, 16, 0.75)');
  bloodMark.addColorStop(1, 'rgba(115, 16, 16, 0)');
  paperCtx.fillStyle = bloodMark;
  paperCtx.beginPath();
  paperCtx.arc(96, 98, 18, 0, Math.PI * 2);
  paperCtx.fill();
  const paper = finalizeSmoothTexture(paperCanvas, 1, 1, maxAnisotropy);

  return {
    wall,
    wallBlood,
    floor,
    ceiling,
    metal,
    wood,
    paper,
    dispose: () => {
      wall.dispose();
      wallBlood.dispose();
      floor.dispose();
      ceiling.dispose();
      metal.dispose();
      wood.dispose();
      paper.dispose();
    },
  };
}
