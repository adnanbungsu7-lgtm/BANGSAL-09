export const CELL_SIZE = 3.0;
export const WALL_HEIGHT = 3.2;

export const WARD_MAP: string[] = [
  '###############',
  '#...#..G..#...#',
  '#.#...#.#...#.#',
  '#.###.....###.#',
  '#.....#.#.....#',
  '##.##.#.#.##.##',
  '#...#.....#...#',
  '#.B...#.#...B.#',
  '#...#.....#...#',
  '##.##.#.#.##.##',
  '#.............#',
  '#.##.##.##.##.#',
  '#.#.........#.#',
  '#...#.....#...#',
  '###############',
];

export const MAP_ROWS = WARD_MAP.length;
export const MAP_COLS = WARD_MAP[0].length;

export interface LoreNoteData {
  id: string;
  gx: number;
  gz: number;
  title: string;
  date: string;
  body: string;
}

export interface ItemSpawn {
  id: string;
  gx: number;
  gz: number;
}

export interface PropSpawn {
  type: 'bed' | 'locker' | 'table';
  gx: number;
  gz: number;
  rotY: number;
}

export const PLAYER_SPAWN = { gx: 7, gz: 13 };
export const EXIT_GATE_CELL = { gx: 7, gz: 1 };
export const STALKER_SPAWN = { gx: 7, gz: 3 };

export const STALKER_WAYPOINTS: Array<{ gx: number; gz: number }> = [
  { gx: 5, gz: 3 },
  { gx: 5, gz: 7 },
  { gx: 9, gz: 7 },
  { gx: 9, gz: 3 },
  { gx: 3, gz: 4 },
  { gx: 11, gz: 4 },
  { gx: 7, gz: 10 },
];

export const FUSE_SPAWNS: ItemSpawn[] = [
  { id: 'fuse-nw', gx: 1, gz: 1 },
  { id: 'fuse-mw', gx: 1, gz: 7 },
  { id: 'fuse-ne', gx: 13, gz: 1 },
  { id: 'fuse-me', gx: 13, gz: 7 },
];

export const BATTERY_SPAWNS: ItemSpawn[] = [
  { id: 'bat-1', gx: 5, gz: 10 },
  { id: 'bat-2', gx: 9, gz: 4 },
  { id: 'bat-3', gx: 13, gz: 13 },
];

export const MEDKIT_SPAWNS: ItemSpawn[] = [
  { id: 'med-1', gx: 1, gz: 12 },
  { id: 'med-2', gx: 9, gz: 8 },
];

export const NOTE_SPAWNS: LoreNoteData[] = [
  {
    id: 'note-1',
    gx: 6,
    gz: 12,
    title: 'Memo Perawat Shift Malam',
    date: '14 November — 02:17 WIB',
    body: 'Listrik Bangsal 09 diputus total. Empat sekring utama dilepas dan disimpan di ruang perawatan Barat dan Timur.\n\nKalau lampu sentermu mulai berkedip dan suara statis terdengar, MATIKAN SENTER [F] atau masuk ke dalam LOKER BESI untuk bersembunyi.',
  },
  {
    id: 'note-2',
    gx: 3,
    gz: 6,
    title: 'Catatan Pasien Kamar 04',
    date: '15 November — 03:40 WIB',
    body: 'Langkah kakinya berat sekali di ubin lorong tengah. Menunduk [C] di sudut gelap membuatnya lebih sulit mencium keberadaanmu, tapi jangan berlari sampai napasmu habis.',
  },
  {
    id: 'note-3',
    gx: 11,
    gz: 3,
    title: 'Laporan Panel Utama',
    date: '16 November — 00:55 WIB',
    body: 'Setelah keempat sekring terkumpul, kembali ke Gerbang Keluar di ujung lorong utara. Panel darurat akan membuka kunci besi begitu sekring terpasang.',
  },
  {
    id: 'note-4',
    gx: 5,
    gz: 1,
    title: 'Catatan Keamanan Sayap Utara',
    date: '16 November — 01:30 WIB',
    body: 'Teknisi listrik meninggalkan kotak P3K di ruang penyimpanan barat daya dan lorong tengah-timur. Jangan hadapi Bayangan tanpa perlindungan—satu cakaran sudah cukup membuatmu pincang.',
  },
  {
    id: 'note-5',
    gx: 11,
    gz: 13,
    title: 'Pesan Terakhir Dokter Jaga',
    date: '16 November — 03:12 WIB',
    body: 'Gunakan denah bangsal [M] untuk menandai ruangan yang sudah kau periksa. Kami mengunci semua pintu luar demi mencegah entitas itu keluar dari Bangsal 09.',
  },
];

export const PROP_SPAWNS: PropSpawn[] = [
  { type: 'bed', gx: 3, gz: 1, rotY: Math.PI / 2 },
  { type: 'bed', gx: 3, gz: 8, rotY: -Math.PI / 2 },
  { type: 'bed', gx: 11, gz: 8, rotY: Math.PI / 2 },
  { type: 'locker', gx: 1, gz: 13, rotY: Math.PI },
  { type: 'locker', gx: 13, gz: 12, rotY: 0 },
  { type: 'locker', gx: 9, gz: 1, rotY: 0 },
  { type: 'locker', gx: 3, gz: 7, rotY: -Math.PI / 2 },
  { type: 'table', gx: 6, gz: 12, rotY: 0 },
  { type: 'table', gx: 3, gz: 6, rotY: Math.PI / 2 },
  { type: 'table', gx: 11, gz: 3, rotY: 0 },
  { type: 'table', gx: 5, gz: 1, rotY: Math.PI / 2 },
  { type: 'table', gx: 11, gz: 13, rotY: 0 },
];

export function gridToWorld(gx: number, gz: number): { x: number; z: number } {
  return {
    x: (gx - MAP_COLS / 2 + 0.5) * CELL_SIZE,
    z: (gz - MAP_ROWS / 2 + 0.5) * CELL_SIZE,
  };
}

export function isWallCell(gx: number, gz: number): boolean {
  if (gx < 0 || gz < 0 || gx >= MAP_COLS || gz >= MAP_ROWS) return true;
  const ch = WARD_MAP[gz][gx];
  return ch === '#' || ch === 'B';
}

export function isBlockedCell(gx: number, gz: number, gateOpen: boolean): boolean {
  if (isWallCell(gx, gz)) return true;
  if (!gateOpen && WARD_MAP[gz][gx] === 'G') return true;
  return false;
}

export function resolveCircleGridCollision(
  x: number,
  z: number,
  radius: number,
  gateOpen: boolean
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  const minGx = Math.floor(nx / CELL_SIZE + MAP_COLS / 2 - 1);
  const maxGx = Math.floor(nx / CELL_SIZE + MAP_COLS / 2 + 1);
  const minGz = Math.floor(nz / CELL_SIZE + MAP_ROWS / 2 - 1);
  const maxGz = Math.floor(nz / CELL_SIZE + MAP_ROWS / 2 + 1);

  for (let gz = minGz; gz <= maxGz; gz++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (!isBlockedCell(gx, gz, gateOpen)) continue;

      const center = gridToWorld(gx, gz);
      const half = CELL_SIZE * 0.5;
      const closestX = Math.max(center.x - half, Math.min(nx, center.x + half));
      const closestZ = Math.max(center.z - half, Math.min(nz, center.z + half));

      const dx = nx - closestX;
      const dz = nz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = radius - dist;
          nx += (dx / dist) * push;
          nz += (dz / dist) * push;
        } else {
          nx += radius;
        }
      }
    }
  }

  return { x: nx, z: nz };
}

export function hasLineOfSight(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.2) return true;
  const steps = Math.ceil(dist / 0.45);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const pz = z1 + dz * t;
    const gx = Math.floor(px / CELL_SIZE + MAP_COLS / 2);
    const gz = Math.floor(pz / CELL_SIZE + MAP_ROWS / 2);
    if (isWallCell(gx, gz)) {
      return false;
    }
  }
  return true;
}
