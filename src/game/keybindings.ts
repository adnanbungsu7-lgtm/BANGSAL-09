export type KeyAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'flashlight'
  | 'interact'
  | 'map'
  | 'pause';

export type KeyBindings = Record<KeyAction, string>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  flashlight: 'KeyF',
  interact: 'KeyE',
  map: 'KeyM',
  pause: 'KeyP',
};

export const KEY_ACTION_ORDER: KeyAction[] = [
  'forward',
  'backward',
  'left',
  'right',
  'sprint',
  'crouch',
  'flashlight',
  'interact',
  'map',
  'pause',
];

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  forward: 'Jalan Maju',
  backward: 'Jalan Mundur',
  left: 'Geser Kiri',
  right: 'Geser Kanan',
  sprint: 'Lari Cepat (Sprint)',
  crouch: 'Menunduk / Mengendap',
  flashlight: 'Nyalakan / Matikan Senter',
  interact: 'Ambil / Sembunyi / Panel',
  map: 'Buka / Tutup Denah Bangsal',
  pause: 'Jeda Permainan',
};

const STORAGE_KEY = 'bangsal09_keybindings_v2';
const SENSITIVITY_KEY = 'bangsal09_sensitivity_v1';
const BRIGHTNESS_KEY = 'bangsal09_brightness_v1';
const VOLUME_KEY = 'bangsal09_volume_v1';
const CONTROL_MODE_KEY = 'bangsal09_control_mode_v1';
const BEST_RECORDS_KEY = 'bangsal09_records_v1';

export type DifficultyId = 'story' | 'normal' | 'nightmare';
export type ControlMode = 'keyboard' | 'mobile';

export interface BestRecords {
  bestTimeSeconds: Partial<Record<DifficultyId, number>>;
  escapes: number;
}

export function formatKeyCode(code: string): string {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  switch (code) {
    case 'ShiftLeft':
      return 'L-SHIFT';
    case 'ShiftRight':
      return 'R-SHIFT';
    case 'ControlLeft':
      return 'L-CTRL';
    case 'ControlRight':
      return 'R-CTRL';
    case 'AltLeft':
      return 'L-ALT';
    case 'AltRight':
      return 'R-ALT';
    case 'Space':
      return 'SPACE';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'Enter':
      return 'ENTER';
    case 'Tab':
      return 'TAB';
    default:
      return code.toUpperCase();
  }
}

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEY_BINDINGS };
    const parsed = JSON.parse(raw) as Partial<KeyBindings>;
    return { ...DEFAULT_KEY_BINDINGS, ...parsed };
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

export function saveKeyBindings(bindings: KeyBindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSensitivity(): number {
  try {
    const raw = localStorage.getItem(SENSITIVITY_KEY);
    const val = raw ? Number(raw) : 1.0;
    return Number.isFinite(val) && val >= 0.4 && val <= 2.2 ? val : 1.0;
  } catch {
    return 1.0;
  }
}

export function saveSensitivity(val: number): void {
  try {
    localStorage.setItem(SENSITIVITY_KEY, String(val));
  } catch {
    // Ignore
  }
}

export function loadBrightness(): number {
  try {
    const raw = localStorage.getItem(BRIGHTNESS_KEY);
    const val = raw ? Number(raw) : 1.35;
    return Number.isFinite(val) && val >= 0.9 && val <= 2.2 ? val : 1.35;
  } catch {
    return 1.35;
  }
}

export function saveBrightness(val: number): void {
  try {
    localStorage.setItem(BRIGHTNESS_KEY, String(val));
  } catch {
    // Ignore
  }
}

export function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const val = raw ? Number(raw) : 0.7;
    return Number.isFinite(val) && val >= 0 && val <= 1 ? val : 0.7;
  } catch {
    return 0.7;
  }
}

export function saveVolume(val: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(val));
  } catch {
    // Ignore
  }
}

export function detectDefaultControlMode(): ControlMode {
  try {
    const saved = localStorage.getItem(CONTROL_MODE_KEY);
    if (saved === 'keyboard' || saved === 'mobile') return saved;
    const isTouch =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0);
    return isTouch ? 'mobile' : 'keyboard';
  } catch {
    return 'keyboard';
  }
}

export function saveControlMode(mode: ControlMode): void {
  try {
    localStorage.setItem(CONTROL_MODE_KEY, mode);
  } catch {
    // Ignore
  }
}

export function loadBestRecords(): BestRecords {
  try {
    const raw = localStorage.getItem(BEST_RECORDS_KEY);
    if (!raw) return { bestTimeSeconds: {}, escapes: 0 };
    const parsed = JSON.parse(raw) as Partial<BestRecords>;
    return {
      bestTimeSeconds: parsed.bestTimeSeconds || {},
      escapes: typeof parsed.escapes === 'number' ? parsed.escapes : 0,
    };
  } catch {
    return { bestTimeSeconds: {}, escapes: 0 };
  }
}

export function recordEscape(difficulty: DifficultyId, seconds: number): BestRecords {
  const current = loadBestRecords();
  const prevBest = current.bestTimeSeconds[difficulty];
  const updated: BestRecords = {
    escapes: current.escapes + 1,
    bestTimeSeconds: {
      ...current.bestTimeSeconds,
      [difficulty]: prevBest === undefined ? seconds : Math.min(prevBest, seconds),
    },
  };
  try {
    localStorage.setItem(BEST_RECORDS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
  return updated;
}
