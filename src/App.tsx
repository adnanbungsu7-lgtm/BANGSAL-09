import { PointerEvent, useEffect, useRef, useState } from 'react';
import {
  BatteryCharging,
  BookOpen,
  Compass,
  Eye,
  FileText,
  Flashlight,
  Hand,
  Heart,
  Keyboard,
  Map as MapIcon,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldAlert,
  Smartphone,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { HorrorAudio } from './game/audio';
import { GamePhase, HorrorEngine, HudSnapshot } from './game/HorrorEngine';
import {
  BestRecords,
  ControlMode,
  DEFAULT_KEY_BINDINGS,
  DifficultyId,
  KEY_ACTION_LABELS,
  KEY_ACTION_ORDER,
  KeyAction,
  KeyBindings,
  detectDefaultControlMode,
  formatKeyCode,
  loadBestRecords,
  loadBrightness,
  loadKeyBindings,
  loadSensitivity,
  loadVolume,
  recordEscape,
  saveBrightness,
  saveControlMode,
  saveKeyBindings,
  saveSensitivity,
  saveVolume,
} from './game/keybindings';
import { EXIT_GATE_CELL, MAP_COLS, MAP_ROWS, NOTE_SPAWNS, PLAYER_SPAWN, WARD_MAP } from './game/map';

const DIFFICULTY_OPTIONS: Array<{
  id: DifficultyId;
  label: string;
  desc: string;
}> = [
  { id: 'story', label: 'Cerita', desc: 'Senter awet, Bayangan lebih lambat' },
  { id: 'normal', label: 'Normal', desc: 'Tantangan standar Bangsal 09' },
  { id: 'nightmare', label: 'Mimpi Buruk', desc: 'Agresif, baterai cepat habis' },
];

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  difficulty: 'normal',
  fuses: 0,
  totalFuses: 4,
  health: 100,
  battery: 100,
  flashlightOn: true,
  stamina: 100,
  isCrouching: false,
  isHiding: false,
  showMap: false,
  headingDeg: 0,
  playerGridX: PLAYER_SPAWN.gx,
  playerGridZ: PLAYER_SPAWN.gz,
  discoveredCells: Array.from({ length: MAP_ROWS }, () => Array<boolean>(MAP_COLS).fill(false)),
  notesRead: 0,
  totalNotes: NOTE_SPAWNS.length,
  collectedNotes: [],
  interactPrompt: null,
  dangerLevel: 0,
  gateOpen: false,
  pointerLocked: false,
  activeNote: null,
  elapsedSeconds: 0,
  statusBanner: null,
  isJumpscaring: false,
  scareFlashIntensity: 0,
};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getCardinalHeading(deg: number): string {
  const dirs = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

function getEscapeRank(
  seconds: number,
  health: number,
  notesRead: number,
  difficulty: DifficultyId
): 'S' | 'A' | 'B' | 'C' {
  let score = 0;
  if (seconds <= 150) score += 3;
  else if (seconds <= 240) score += 2;
  else score += 1;

  if (health >= 80) score += 2;
  else if (health >= 45) score += 1;

  if (notesRead >= 3) score += 1;
  if (difficulty === 'nightmare') score += 1;

  if (score >= 6) return 'S';
  if (score >= 4) return 'A';
  if (score >= 3) return 'B';
  return 'C';
}

const JOYSTICK_MAX_RADIUS = 44;

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HorrorEngine | null>(null);
  const audioRef = useRef<HorrorAudio | null>(null);
  const winRecordedRef = useRef<boolean>(false);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [controlMode, setControlMode] = useState<ControlMode>(() => detectDefaultControlMode());
  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(() => loadVolume());
  const [brightness, setBrightness] = useState<number>(() => loadBrightness());
  const [keyBindings, setKeyBindings] = useState<KeyBindings>(() => loadKeyBindings());
  const [sensitivity, setSensitivity] = useState<number>(() => loadSensitivity());
  const [bestRecords, setBestRecords] = useState<BestRecords>(() => loadBestRecords());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [listeningAction, setListeningAction] = useState<KeyAction | null>(null);
  const [mapTab, setMapTab] = useState<'map' | 'notes'>('map');

  // Mobile Analog Joystick + Multi-touch Look state
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mobileSprint, setMobileSprint] = useState<boolean>(false);
  const joyStateRef = useRef<{
    pointerId: number | null;
    centerX: number;
    centerY: number;
    vx: number;
    vy: number;
  }>({ pointerId: null, centerX: 0, centerY: 0, vx: 0, vy: 0 });
  const lookPointerRef = useRef<{ pointerId: number | null; x: number; y: number }>({
    pointerId: null,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new HorrorAudio();
    const initialVol = loadVolume();
    audio.setVolume(initialVol);
    audioRef.current = audio;

    const engine = new HorrorEngine(container, audio, (snapshot) => {
      setHud(snapshot);
    });
    engine.setKeyBindings(loadKeyBindings());
    engine.setSensitivity(loadSensitivity());
    engine.setBrightness(loadBrightness());
    engineRef.current = engine;

    return () => {
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud.phase === 'win' && !winRecordedRef.current) {
      winRecordedRef.current = true;
      setBestRecords(recordEscape(hud.difficulty, hud.elapsedSeconds));
    } else if (hud.phase === 'playing') {
      winRecordedRef.current = false;
    }
  }, [hud.phase, hud.difficulty, hud.elapsedSeconds]);

  // Reset mobile joystick when leaving gameplay
  useEffect(() => {
    if (hud.phase !== 'playing' || controlMode !== 'mobile') {
      joyStateRef.current.pointerId = null;
      joyStateRef.current.vx = 0;
      joyStateRef.current.vy = 0;
      setJoyKnob({ x: 0, y: 0 });
      setMobileSprint(false);
      engineRef.current?.setVirtualInput(0, 0, false);
    }
  }, [hud.phase, controlMode]);

  useEffect(() => {
    engineRef.current?.setListeningForKey(listeningAction !== null);
    if (!listeningAction) return;

    const onRebindKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setListeningAction(null);
        return;
      }

      setKeyBindings((prev) => {
        const next: KeyBindings = { ...prev };
        const oldKey = prev[listeningAction];
        for (const act of KEY_ACTION_ORDER) {
          if (act !== listeningAction && next[act] === e.code) {
            next[act] = oldKey;
          }
        }
        next[listeningAction] = e.code;
        saveKeyBindings(next);
        engineRef.current?.setKeyBindings(next);
        return next;
      });
      setListeningAction(null);
    };

    window.addEventListener('keydown', onRebindKey, true);
    return () => {
      window.removeEventListener('keydown', onRebindKey, true);
    };
  }, [listeningAction]);

  const handleControlModeChange = (mode: ControlMode) => {
    setControlMode(mode);
    saveControlMode(mode);
  };

  const handleDifficultyChange = (diff: DifficultyId) => {
    setDifficulty(diff);
    engineRef.current?.setDifficulty(diff);
  };

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val);
    saveSensitivity(val);
    engineRef.current?.setSensitivity(val);
  };

  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    saveBrightness(val);
    engineRef.current?.setBrightness(val);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    saveVolume(val);
    audioRef.current?.setVolume(val);
    if (val > 0 && muted) {
      setMuted(false);
      audioRef.current?.setMuted(false);
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const handleStart = () => {
    winRecordedRef.current = false;
    setShowSettings(false);
    setMapTab('map');
    engineRef.current?.startNewGame(difficulty);
  };

  const handleReturnToTitle = () => {
    setShowSettings(false);
    engineRef.current?.setPhase('title');
  };

  const handlePauseToggle = () => {
    const nextPhase: GamePhase = hud.phase === 'playing' ? 'paused' : 'playing';
    if (nextPhase === 'playing') {
      engineRef.current?.resumeGame();
    } else {
      engineRef.current?.setPhase('paused');
    }
  };

  const handleOpenSettings = () => {
    if (hud.phase === 'playing') {
      engineRef.current?.setPhase('paused');
    }
    setListeningAction(null);
    setShowSettings(true);
  };

  const handleResetBindings = () => {
    const defaults = { ...DEFAULT_KEY_BINDINGS };
    setKeyBindings(defaults);
    saveKeyBindings(defaults);
    engineRef.current?.setKeyBindings(defaults);
    handleSensitivityChange(1.0);
    handleBrightnessChange(1.35);
    handleVolumeChange(0.7);
    setListeningAction(null);
  };

  // Virtual Analog Joystick Handlers (Multi-touch safe via Pointer Capture)
  const updateJoystickFromEvent = (clientX: number, clientY: number, sprintActive: boolean) => {
    const state = joyStateRef.current;
    const dx = clientX - state.centerX;
    const dy = clientY - state.centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0.01 ? Math.cos(angle) * clampedDist : 0;
    const ky = dist > 0.01 ? Math.sin(angle) * clampedDist : 0;

    const vx = kx / JOYSTICK_MAX_RADIUS;
    const vy = -ky / JOYSTICK_MAX_RADIUS;
    state.vx = vx;
    state.vy = vy;
    setJoyKnob({ x: kx, y: ky });
    engineRef.current?.setVirtualInput(vx, vy, sprintActive);
  };

  const handleJoystickDown = (e: PointerEvent<HTMLDivElement>) => {
    if (joyStateRef.current.pointerId !== null) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyStateRef.current.pointerId = e.pointerId;
    joyStateRef.current.centerX = rect.left + rect.width / 2;
    joyStateRef.current.centerY = rect.top + rect.height / 2;
    updateJoystickFromEvent(e.clientX, e.clientY, mobileSprint);
  };

  const handleJoystickMove = (e: PointerEvent<HTMLDivElement>) => {
    if (joyStateRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    updateJoystickFromEvent(e.clientX, e.clientY, mobileSprint);
  };

  const handleJoystickUp = (e: PointerEvent<HTMLDivElement>) => {
    if (joyStateRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    joyStateRef.current.pointerId = null;
    joyStateRef.current.vx = 0;
    joyStateRef.current.vy = 0;
    setJoyKnob({ x: 0, y: 0 });
    engineRef.current?.setVirtualInput(0, 0, false);
  };

  const handleMobileSprintToggle = (active: boolean) => {
    setMobileSprint(active);
    engineRef.current?.setVirtualInput(
      joyStateRef.current.vx,
      joyStateRef.current.vy,
      active
    );
  };

  // Mobile Right-side Look Touch Pad
  const handleLookPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current.pointerId !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const handleLookPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - lookPointerRef.current.x;
    const dy = e.clientY - lookPointerRef.current.y;
    lookPointerRef.current.x = e.clientX;
    lookPointerRef.current.y = e.clientY;
    engineRef.current?.addLookDelta(dx * 1.45, dy * 1.45);
  };

  const handleLookPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current.pointerId !== e.pointerId) return;
    lookPointerRef.current.pointerId = null;
  };

  const dangerVignetteOpacity = Math.min(0.82, 0.16 + hud.dangerLevel * 0.65);
  const currentBestForDifficulty = bestRecords.bestTimeSeconds[difficulty];
  const escapeRank = getEscapeRank(
    hud.elapsedSeconds,
    hud.health,
    hud.notesRead,
    hud.difficulty
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#070a0f] text-[#e5e7eb]">
      {/* Dedicated HD 3D WebGL Mount Container */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* Subtle Horror Danger Vignette (clean without CRT pixel scanlines) */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-150"
        style={{
          opacity: dangerVignetteOpacity,
          background:
            hud.dangerLevel > 0.2
              ? `radial-gradient(circle at center, transparent 48%, rgba(125, 12, 18, ${
                  0.3 + hud.dangerLevel * 0.5
                }) 100%)`
              : 'radial-gradient(circle at center, transparent 62%, rgba(0, 0, 0, 0.52) 100%)',
        }}
      />

      {/* Wounded Edge Vignette */}
      {hud.phase === 'playing' && hud.health <= 50 && !hud.isJumpscaring && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'radial-gradient(circle at center, transparent 58%, rgba(153, 27, 27, 0.42) 100%)',
          }}
        />
      )}

      {/* Locker Hiding Metal Vent Viewport Overlay */}
      {hud.phase === 'playing' && hud.isHiding && !hud.isJumpscaring && (
        <div className="pointer-events-none absolute inset-0 z-15 flex flex-col justify-between bg-black/55">
          <div className="h-[24%] w-full border-b-4 border-[#1b2029] bg-[#07090d]" />
          <div className="flex flex-1 flex-col justify-around px-6 py-4">
            <div className="h-3 w-full bg-[#07090d]/95" />
            <div className="h-3 w-full bg-[#07090d]/95" />
            <div className="h-3 w-full bg-[#07090d]/95" />
          </div>
          <div className="flex h-[24%] w-full items-start justify-center border-t-4 border-[#1b2029] bg-[#07090d] pt-4">
            <span className="font-mono text-xs font-semibold tracking-wider text-emerald-300">
              DI DALAM LOKER BESI · TERSEMBUNYI
            </span>
          </div>
        </div>
      )}

      {/* Hallway Non-Lethal Scare / Slash Flash */}
      {hud.scareFlashIntensity > 0 && !hud.isJumpscaring && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            opacity: hud.scareFlashIntensity * 0.65,
            background:
              'radial-gradient(circle at center, rgba(220, 38, 38, 0.18) 10%, rgba(127, 29, 29, 0.84) 100%)',
          }}
        />
      )}

      {/* Full Jumpscare Strobe Overlay */}
      {hud.isJumpscaring && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-red-950/35">
          <div className="h-full w-full border-8 border-red-600/80 shadow-[inset_0_0_120px_rgba(220,38,38,0.9)]" />
        </div>
      )}

      {/* Gameplay HUD */}
      {hud.phase === 'playing' && (
        <>
          {/* Top-Left: Objective, Notes, Compass & Timer */}
          <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col gap-2">
            <div className="rounded-lg border border-white/15 bg-[#090b10]/88 px-3.5 py-2.5">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 font-mono font-bold text-amber-400 tabular-nums">
                  <Zap className="h-3.5 w-3.5" />
                  <span>
                    SEKRING {hud.fuses}/{hud.totalFuses}
                  </span>
                </div>
                <span className="text-white/25">|</span>
                <div className="flex items-center gap-1 font-mono text-[#d1d5db] tabular-nums">
                  <FileText className="h-3 w-3 text-amber-300" />
                  <span>
                    {hud.notesRead}/{hud.totalNotes}
                  </span>
                </div>
                <span className="text-white/25">|</span>
                <div className="flex items-center gap-1 font-mono text-sky-300 tabular-nums">
                  <Compass className="h-3 w-3" />
                  <span>{getCardinalHeading(hud.headingDeg)}</span>
                </div>
                <span className="text-white/25">|</span>
                <span className="font-mono text-[#9ca3af] tabular-nums">
                  {formatTime(hud.elapsedSeconds)}
                </span>
              </div>
              <div className="mt-1 text-xs text-[#d1d5db]">
                {hud.isHiding
                  ? controlMode === 'mobile'
                    ? 'Bersembunyi di loker — tekan INTERAKSI untuk keluar'
                    : `Bersembunyi di loker — tekan [${formatKeyCode(keyBindings.interact)}] untuk keluar`
                  : hud.gateOpen
                  ? 'Gerbang Utara terbuka — lari keluar!'
                  : hud.fuses >= hud.totalFuses
                  ? 'Kembali ke Gerbang Utara untuk menyalakan panel'
                  : 'Jelajahi ruang barat & timur untuk mencari sekring'}
              </div>
            </div>

            {hud.statusBanner && (
              <div className="rounded-lg border border-amber-500/40 bg-[#171207]/95 px-3.5 py-2 text-xs font-medium text-amber-300">
                {hud.statusBanner}
              </div>
            )}
          </div>

          {/* Top-Right: Health, Battery, Stamina + Clean System Icons */}
          <div className="pointer-events-auto absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2.5 rounded-lg border border-white/15 bg-[#090b10]/88 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Heart
                  className={`h-3.5 w-3.5 ${
                    hud.health <= 50 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                />
                <div className="h-2 w-16 overflow-hidden rounded-sm bg-white/10">
                  <div
                    className={`h-full transition-all duration-100 ${
                      hud.health <= 50 ? 'bg-red-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${hud.health}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[11px] text-[#d1d5db] tabular-nums">
                  {hud.health}%
                </span>
              </div>

              <span className="text-white/20">|</span>

              <div className="flex items-center gap-1.5">
                <Flashlight
                  className={`h-3.5 w-3.5 ${
                    hud.flashlightOn ? 'text-amber-300' : 'text-[#6b7280]'
                  }`}
                />
                <div className="h-2 w-16 overflow-hidden rounded-sm bg-white/10">
                  <div
                    className={`h-full transition-all duration-100 ${
                      hud.battery < 20 ? 'bg-red-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${hud.battery}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[11px] text-[#d1d5db] tabular-nums">
                  {hud.battery}%
                </span>
              </div>

              <span className="text-white/20">|</span>

              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-[#9ca3af]">
                  {hud.isCrouching ? 'TUNDUK' : 'LARI'}
                </span>
                <div className="h-2 w-14 overflow-hidden rounded-sm bg-white/10">
                  <div
                    className="h-full bg-sky-400 transition-all duration-100"
                    style={{ width: `${hud.stamina}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenSettings}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-[#090b10]/88 text-[#d1d5db] hover:text-white"
                aria-label="Pengaturan"
                title="Pengaturan"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-[#090b10]/88 text-[#d1d5db] hover:text-white"
                aria-label={muted ? 'Nyalakan audio' : 'Bisukan audio'}
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={handlePauseToggle}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-[#090b10]/88 text-[#d1d5db] hover:text-white"
                aria-label="Jeda permainan"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Center Crosshair & Text-Only Interact Prompt (Keyboard screen stays clean of buttons) */}
          {!hud.isJumpscaring && !hud.showMap && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
              {hud.interactPrompt && (
                <div className="mt-5 rounded-md border border-amber-400/60 bg-[#090b10]/90 px-3.5 py-1.5 font-mono text-xs font-semibold text-amber-300">
                  {hud.interactPrompt}
                </div>
              )}
            </div>
          )}

          {/* Fog-of-War Ward Map & Lore Journal Overlay */}
          {hud.showMap && !hud.isJumpscaring && (
            <div className="pointer-events-auto absolute inset-0 z-25 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md rounded-xl border border-white/20 bg-[#090b10] p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMapTab('map')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                        mapTab === 'map'
                          ? 'bg-red-700 text-white'
                          : 'border border-white/15 bg-black/40 text-[#9ca3af] hover:text-white'
                      }`}
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                      Denah Bangsal
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapTab('notes')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                        mapTab === 'notes'
                          ? 'bg-amber-600 text-white'
                          : 'border border-white/15 bg-black/40 text-[#9ca3af] hover:text-white'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Jurnal ({hud.notesRead}/{hud.totalNotes})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleMap()}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-[#9ca3af] hover:text-white"
                    aria-label="Tutup denah"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {mapTab === 'map' ? (
                  <>
                    <div
                      className="mx-auto mt-4 grid w-fit gap-0.5 rounded-md border border-white/10 bg-[#040507] p-2"
                      style={{ gridTemplateColumns: `repeat(${MAP_COLS}, minmax(0, 1fr))` }}
                    >
                      {WARD_MAP.map((row, gz) =>
                        row.split('').map((cell, gx) => {
                          const discovered = Boolean(hud.discoveredCells[gz]?.[gx]);
                          const isPlayer = hud.playerGridX === gx && hud.playerGridZ === gz;
                          const isGate = gx === EXIT_GATE_CELL.gx && gz === EXIT_GATE_CELL.gz;

                          let bgClass = 'bg-[#080a0f]';
                          if (discovered) {
                            if (cell === '#') bgClass = 'bg-[#2a303d]';
                            else if (cell === 'B') bgClass = 'bg-[#4f1d24]';
                            else if (isGate) {
                              bgClass = hud.gateOpen ? 'bg-emerald-500' : 'bg-amber-500';
                            } else {
                              bgClass = 'bg-[#141923]';
                            }
                          }

                          return (
                            <div
                              key={`${gx}-${gz}`}
                              className={`flex h-4 w-4 items-center justify-center ${bgClass}`}
                            >
                              {isPlayer && <div className="h-2.5 w-2.5 rounded-sm bg-sky-300" />}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] text-[#9ca3af]">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 bg-sky-300" /> Posisi Anda
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 bg-amber-500" /> Gerbang Utara
                      </span>
                      <button
                        type="button"
                        onClick={() => engineRef.current?.toggleMap()}
                        className="rounded border border-white/15 bg-black/50 px-2.5 py-1 text-white hover:border-amber-400"
                      >
                        Tutup [{formatKeyCode(keyBindings.map)}]
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {hud.collectedNotes.length === 0 ? (
                      <div className="rounded-lg border border-white/10 bg-black/40 p-5 text-center text-xs text-[#9ca3af]">
                        Belum ada catatan yang ditemukan di meja bangsal.
                      </div>
                    ) : (
                      hud.collectedNotes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => engineRef.current?.openCollectedNote(note.id)}
                          className="w-full rounded-lg border border-amber-500/25 bg-black/45 p-3 text-left transition-colors hover:border-amber-400/60"
                        >
                          <div className="font-mono text-[10px] text-amber-400">{note.date}</div>
                          <div className="mt-0.5 text-sm font-semibold text-[#f3ead3]">
                            {note.title}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KEYBOARD MODE: Clean screen with zero movement/flashlight/interact buttons */}
          {controlMode === 'keyboard' && !hud.isJumpscaring && !hud.showMap && (
            <div className="pointer-events-none absolute bottom-3.5 left-1/2 z-20 -translate-x-1/2">
              <div className="rounded-md border border-white/10 bg-[#090b10]/75 px-3.5 py-1 font-mono text-[11px] text-[#9ca3af] whitespace-nowrap">
                {hud.pointerLocked
                  ? `${formatKeyCode(keyBindings.forward)}${formatKeyCode(keyBindings.left)}${formatKeyCode(keyBindings.backward)}${formatKeyCode(keyBindings.right)} Jalan · ${formatKeyCode(keyBindings.flashlight)} Senter · ${formatKeyCode(keyBindings.interact)} Interaksi · ${formatKeyCode(keyBindings.crouch)} Tunduk · ${formatKeyCode(keyBindings.map)} Denah`
                  : 'Klik layar untuk mengunci arah mouse · Esc lepas kursor'}
              </div>
            </div>
          )}

          {/* MOBILE MODE: Virtual Analog Joystick (Left) + Look Zone (Right) + Action Buttons */}
          {controlMode === 'mobile' && !hud.isJumpscaring && !hud.showMap && (
            <>
              {/* Right Half Look Pad */}
              <div
                onPointerDown={handleLookPointerDown}
                onPointerMove={handleLookPointerMove}
                onPointerUp={handleLookPointerUp}
                onPointerCancel={handleLookPointerUp}
                className="absolute inset-y-16 right-0 z-10 w-1/2 touch-none"
              />

              {/* Left Side Virtual Analog Joystick */}
              <div className="pointer-events-auto absolute bottom-6 left-6 z-20 flex flex-col items-center gap-1.5">
                <div
                  onPointerDown={handleJoystickDown}
                  onPointerMove={handleJoystickMove}
                  onPointerUp={handleJoystickUp}
                  onPointerCancel={handleJoystickUp}
                  className="relative flex h-32 w-32 touch-none items-center justify-center rounded-full border-2 border-white/25 bg-[#090b10]/65"
                >
                  <div className="pointer-events-none h-20 w-20 rounded-full border border-white/10" />
                  <div
                    className="pointer-events-none absolute h-12 w-12 rounded-full border-2 border-white/60 bg-white/25"
                    style={{
                      transform: `translate3d(${joyKnob.x}px, ${joyKnob.y}px, 0)`,
                    }}
                  />
                </div>
              </div>

              {/* Bottom-Right Mobile Action Buttons */}
              <div className="pointer-events-auto absolute right-5 bottom-6 z-20 flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleMap()}
                    className="flex h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-[#090b10]/90 px-3 font-mono text-xs font-bold text-[#d1d5db] active:bg-white/15"
                  >
                    <MapIcon className="h-4 w-4" />
                    DENAH
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleCrouch()}
                    className={`flex h-11 items-center justify-center rounded-lg border px-3.5 font-mono text-xs font-bold ${
                      hud.isCrouching
                        ? 'border-sky-400 bg-sky-950/90 text-sky-200'
                        : 'border-white/20 bg-[#090b10]/90 text-[#d1d5db]'
                    }`}
                  >
                    TUNDUK
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={() => handleMobileSprintToggle(true)}
                    onPointerUp={() => handleMobileSprintToggle(false)}
                    onPointerCancel={() => handleMobileSprintToggle(false)}
                    onPointerLeave={() => handleMobileSprintToggle(false)}
                    className={`flex h-12 items-center justify-center rounded-lg border px-4 font-mono text-xs font-bold ${
                      mobileSprint
                        ? 'border-emerald-400 bg-emerald-900/90 text-white'
                        : 'border-emerald-500/40 bg-[#091510]/90 text-emerald-300'
                    }`}
                  >
                    LARI
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleFlashlight()}
                    className={`flex h-12 items-center gap-1.5 rounded-lg border px-3.5 font-mono text-xs font-bold ${
                      hud.flashlightOn
                        ? 'border-amber-400 bg-amber-950/85 text-amber-200'
                        : 'border-white/20 bg-[#090b10]/90 text-[#9ca3af]'
                    }`}
                  >
                    <Flashlight className="h-4 w-4" />
                    SENTER
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.triggerInteract()}
                    className={`flex h-12 items-center gap-1.5 rounded-lg border px-4 font-mono text-xs font-bold ${
                      hud.interactPrompt
                        ? 'border-amber-400 bg-amber-500 text-[#1a1300]'
                        : 'border-white/25 bg-[#12151f]/90 text-white'
                    }`}
                  >
                    <Hand className="h-4 w-4" />
                    INTERAKSI
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Title Screen */}
      {hud.phase === 'title' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/15 bg-[#090b10]/95 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-2 font-mono text-xs text-red-400">
              <div className="flex items-center gap-2">
                <span>FIRST-PERSON 3D SURVIVAL HORROR</span>
              </div>
              {bestRecords.escapes > 0 && (
                <span className="flex items-center gap-1 text-amber-300 tabular-nums">
                  <Trophy className="h-3.5 w-3.5" />
                  {bestRecords.escapes}x Kabur
                </span>
              )}
            </div>

            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
              BANGSAL 09
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-[#9ca3af]">
              Listrik bangsal isolasi padam total. Temukan{' '}
              <span className="font-semibold text-amber-300">4 Sekring Listrik</span> untuk membuka
              Gerbang Utara — matikan senter, menunduk, atau bersembunyi di{' '}
              <span className="font-semibold text-white">Loker Besi</span> saat{' '}
              <span className="font-semibold text-red-400">Bayangan Bangsal</span> mendekat.
            </p>

            {/* Control Mode Switcher: Keyboard vs Mobile Joystick */}
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-2 text-xs text-[#9ca3af]">Mode Kontrol</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleControlModeChange('keyboard')}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    controlMode === 'keyboard'
                      ? 'border-red-500 bg-red-950/60 text-white'
                      : 'border-white/10 bg-black/40 text-[#9ca3af] hover:text-white'
                  }`}
                >
                  <Keyboard className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-mono text-xs font-bold">Keyboard &amp; Mouse</div>
                    <div className="text-[10px] text-[#9ca3af]">Layar bersih tanpa tombol</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleControlModeChange('mobile')}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    controlMode === 'mobile'
                      ? 'border-red-500 bg-red-950/60 text-white'
                      : 'border-white/10 bg-black/40 text-[#9ca3af] hover:text-white'
                  }`}
                >
                  <Smartphone className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-mono text-xs font-bold">Mobile (Joystick)</div>
                    <div className="text-[10px] text-[#9ca3af]">Analog kiri &amp; tombol kanan</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Difficulty Selector */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-[#9ca3af]">
                <span>Tingkat Kesulitan</span>
                {currentBestForDifficulty !== undefined && (
                  <span className="font-mono text-emerald-400 tabular-nums">
                    Rekor: {formatTime(currentBestForDifficulty)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleDifficultyChange(opt.id)}
                    className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                      difficulty === opt.id
                        ? 'border-red-500 bg-red-950/60 text-white'
                        : 'border-white/10 bg-black/40 text-[#9ca3af] hover:text-white'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold">{opt.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-[#9ca3af]">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {controlMode === 'keyboard' && (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-[#d1d5db]">
                <div>
                  {formatKeyCode(keyBindings.forward)}
                  {formatKeyCode(keyBindings.left)}
                  {formatKeyCode(keyBindings.backward)}
                  {formatKeyCode(keyBindings.right)} : Jalan
                </div>
                <div>{formatKeyCode(keyBindings.crouch)} : Menunduk</div>
                <div>{formatKeyCode(keyBindings.sprint)} : Lari</div>
                <div>{formatKeyCode(keyBindings.flashlight)} : Senter On/Off</div>
                <div>{formatKeyCode(keyBindings.interact)} : Ambil / Loker</div>
                <div>{formatKeyCode(keyBindings.map)} : Denah &amp; Jurnal</div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-3 font-display text-sm font-bold tracking-wide text-white transition-colors hover:bg-red-600"
              >
                <Play className="h-4 w-4" />
                MASUK KE BANGSAL 09
              </button>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/40 px-3.5 text-xs font-semibold text-[#d1d5db] hover:text-white whitespace-nowrap"
                title="Pengaturan"
              >
                <Settings className="h-4 w-4" />
                Pengaturan
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-black/40 text-[#d1d5db] hover:text-white"
                aria-label={muted ? 'Nyalakan audio' : 'Bisukan audio'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lore Note Modal */}
      {hud.phase === 'note' && hud.activeNote && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-5">
          <div className="w-full max-w-md rounded-xl border border-amber-500/35 bg-[#12100c] p-6">
            <div className="flex items-center justify-between font-mono text-xs text-amber-400">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>{hud.activeNote.date}</span>
              </div>
              <span className="tabular-nums">
                {hud.notesRead}/{hud.totalNotes}
              </span>
            </div>
            <h2 className="mt-2 font-display text-xl font-bold text-[#f3ead3]">
              {hud.activeNote.title}
            </h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[#d6ccb4]">
              {hud.activeNote.body}
            </p>
            <button
              type="button"
              onClick={() => engineRef.current?.resumeGame()}
              className="mt-6 w-full rounded-lg bg-amber-500 py-2.5 text-xs font-bold text-[#1a1300] transition-colors hover:bg-amber-400"
            >
              Tutup Catatan [{formatKeyCode(keyBindings.interact)} / Esc]
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {hud.phase === 'paused' && !showSettings && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-5">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#090b10] p-6 text-center">
            <h2 className="font-display text-2xl font-bold text-white">PERMAINAN DIJEDA</h2>
            <p className="mt-2 font-mono text-xs text-[#9ca3af] tabular-nums">
              Sekring {hud.fuses}/{hud.totalFuses} · Darah {hud.health}% · Catatan {hud.notesRead}/
              {hud.totalNotes}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.resumeGame()}
                className="w-full rounded-lg bg-red-700 py-2.5 text-sm font-bold text-white hover:bg-red-600"
              >
                Lanjutkan
              </button>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="w-full rounded-lg border border-white/15 bg-black/40 py-2.5 text-sm font-semibold text-[#d1d5db] hover:text-white"
              >
                Pengaturan Kontrol &amp; Audio
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full rounded-lg border border-white/15 bg-black/40 py-2.5 text-sm font-semibold text-[#d1d5db] hover:text-white"
              >
                Ulang Dari Awal
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-lg border border-white/10 bg-black/25 py-2 text-xs font-semibold text-[#9ca3af] hover:text-white"
              >
                Kembali ke Menu Utama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal (Control Mode, Audio, Brightness, Sensitivity & Keybindings) */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#090b10] p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3.5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Pengaturan Permainan</h2>
                <p className="mt-0.5 text-xs text-[#9ca3af]">
                  Pilih mode kontrol, kecerahan, volume suara, dan tombol keyboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setListeningAction(null);
                  setShowSettings(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-[#9ca3af] hover:text-white"
                aria-label="Tutup pengaturan"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Control Mode Switch */}
            <div className="mt-4 border-b border-white/10 pb-4">
              <div className="mb-2 text-xs text-[#d1d5db]">Mode Kontrol</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleControlModeChange('keyboard')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 font-mono text-xs font-bold ${
                    controlMode === 'keyboard'
                      ? 'border-red-500 bg-red-950/60 text-white'
                      : 'border-white/15 bg-black/40 text-[#9ca3af]'
                  }`}
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  Keyboard
                </button>
                <button
                  type="button"
                  onClick={() => handleControlModeChange('mobile')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 font-mono text-xs font-bold ${
                    controlMode === 'mobile'
                      ? 'border-red-500 bg-red-950/60 text-white'
                      : 'border-white/15 bg-black/40 text-[#9ca3af]'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile Joystick
                </button>
              </div>
            </div>

            {/* Sliders: Brightness, Volume, Mouse Sensitivity */}
            <div className="mt-4 space-y-3.5 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#d1d5db]">Kecerahan Ruangan</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {Math.round(brightness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.9}
                  max={2.2}
                  step={0.05}
                  value={brightness}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  className="mt-1.5 h-1.5 w-full cursor-pointer accent-red-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#d1d5db]">Volume Suara &amp; Langkah</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="mt-1.5 h-1.5 w-full cursor-pointer accent-red-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#d1d5db]">Sensitivitas Kamera</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {sensitivity.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={2.2}
                  step={0.1}
                  value={sensitivity}
                  onChange={(e) => handleSensitivityChange(Number(e.target.value))}
                  className="mt-1.5 h-1.5 w-full cursor-pointer accent-red-600"
                />
              </div>
            </div>

            {/* Keyboard Bindings List */}
            <div className="mt-2 divide-y divide-white/10">
              {KEY_ACTION_ORDER.map((action) => {
                const isListening = listeningAction === action;
                return (
                  <div
                    key={action}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <span className="text-[#d1d5db]">{KEY_ACTION_LABELS[action]}</span>
                    <button
                      type="button"
                      onClick={() => setListeningAction(isListening ? null : action)}
                      className={`min-w-[104px] rounded-md border px-3 py-1.5 font-mono text-xs font-bold transition-colors ${
                        isListening
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-white/20 bg-black/50 text-white hover:border-red-500'
                      }`}
                    >
                      {isListening ? 'Tekan tombol...' : formatKeyCode(keyBindings[action])}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={handleResetBindings}
                className="rounded-lg border border-white/15 bg-black/40 px-3.5 py-2 text-xs font-semibold text-[#9ca3af] hover:text-white"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => {
                  setListeningAction(null);
                  setShowSettings(false);
                }}
                className="rounded-lg bg-red-700 px-5 py-2 text-xs font-bold text-white hover:bg-red-600"
              >
                Simpan &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over (Caught by Stalker) */}
      {hud.phase === 'gameover' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#140305]/85 p-5">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[#0b0406] p-7 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/40 bg-red-950/60 text-red-400">
              <Eye className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-red-400">
              KAMU TERTANGKAP
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#d1d5db]">
              Bayangan Bangsal menghabisi langkahmu. Matikan senter, menunduk, atau sembunyi di{' '}
              <span className="font-semibold text-white">Loker Besi</span> saat suara statis &amp;
              detak jantung mengeras.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-[#d1d5db] tabular-nums">
              <div>
                <div className="text-[10px] text-[#9ca3af]">SEKRING</div>
                <div className="mt-0.5 font-bold text-amber-300">
                  {hud.fuses}/{hud.totalFuses}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#9ca3af]">CATATAN</div>
                <div className="mt-0.5 font-bold">
                  {hud.notesRead}/{hud.totalNotes}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#9ca3af]">BERTAHAN</div>
                <div className="mt-0.5 font-bold">{formatTime(hud.elapsedSeconds)}</div>
              </div>
            </div>
            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-xs font-semibold text-[#d1d5db] hover:text-white"
              >
                Menu
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-3 text-sm font-bold text-white hover:bg-red-600"
              >
                <RotateCcw className="h-4 w-4" />
                Coba Lagi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory (Escaped Ward 09) */}
      {hud.phase === 'win' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#03120b]/85 p-5">
          <div className="w-full max-w-md rounded-xl border border-emerald-500/40 bg-[#060f0b] p-7 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-950/60 text-emerald-400">
              {escapeRank === 'S' ? (
                <ShieldAlert className="h-6 w-6 text-amber-300" />
              ) : (
                <BatteryCharging className="h-6 w-6" />
              )}
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold text-emerald-400">
              BERHASIL KABUR!
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#d1d5db]">
              Keempat sekring terpasang dan Anda berhasil keluar dari Bangsal 09 sebelum Bayangan
              menutup jalur evakuasi.
            </p>

            <div className="mt-4 rounded-lg border border-emerald-500/25 bg-black/45 p-3.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="font-mono text-xs text-[#9ca3af]">PERINGKAT EVAKUASI</span>
                <span className="font-display text-2xl font-bold text-amber-300">
                  RANK {escapeRank}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                <div>
                  <div className="text-[10px] text-[#9ca3af]">WAKTU</div>
                  <div className="mt-0.5 font-bold text-white">
                    {formatTime(hud.elapsedSeconds)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9ca3af]">DARAH</div>
                  <div className="mt-0.5 font-bold text-emerald-300">{hud.health}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9ca3af]">CATATAN</div>
                  <div className="mt-0.5 font-bold text-amber-300">
                    {hud.notesRead}/{hud.totalNotes}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-xs font-semibold text-[#d1d5db] hover:text-white"
              >
                Menu
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500"
              >
                <RotateCcw className="h-4 w-4" />
                Main Lagi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
