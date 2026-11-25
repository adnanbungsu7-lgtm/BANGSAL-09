import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorrorAudio } from './audio';
import {
  DEFAULT_KEY_BINDINGS,
  DifficultyId,
  KeyBindings,
  formatKeyCode,
} from './keybindings';
import {
  BATTERY_SPAWNS,
  CELL_SIZE,
  EXIT_GATE_CELL,
  FUSE_SPAWNS,
  LoreNoteData,
  MAP_COLS,
  MAP_ROWS,
  MEDKIT_SPAWNS,
  NOTE_SPAWNS,
  PLAYER_SPAWN,
  PROP_SPAWNS,
  STALKER_SPAWN,
  STALKER_WAYPOINTS,
  WALL_HEIGHT,
  WARD_MAP,
  gridToWorld,
  hasLineOfSight,
  resolveCircleGridCollision,
} from './map';
import {
  ExitGateRig,
  StalkerRig,
  createBatteryModel,
  createDeskTable,
  createExitGateModel,
  createFuseModel,
  createHospitalBed,
  createMedkitModel,
  createMetalLocker,
  createNoteModel,
  createStalkerEntity,
} from './models';
import { HorrorTextureSet, createHorrorTextures } from './textures';

export type GamePhase = 'title' | 'playing' | 'note' | 'paused' | 'gameover' | 'win';

export interface HudSnapshot {
  phase: GamePhase;
  difficulty: DifficultyId;
  fuses: number;
  totalFuses: number;
  health: number;
  battery: number;
  flashlightOn: boolean;
  stamina: number;
  isCrouching: boolean;
  isHiding: boolean;
  showMap: boolean;
  headingDeg: number;
  playerGridX: number;
  playerGridZ: number;
  discoveredCells: boolean[][];
  notesRead: number;
  totalNotes: number;
  collectedNotes: LoreNoteData[];
  interactPrompt: string | null;
  dangerLevel: number;
  gateOpen: boolean;
  pointerLocked: boolean;
  activeNote: LoreNoteData | null;
  elapsedSeconds: number;
  statusBanner: string | null;
  isJumpscaring: boolean;
  scareFlashIntensity: number;
}

interface CollectibleEntry {
  id: string;
  kind: 'fuse' | 'battery' | 'medkit' | 'note';
  mesh: THREE.Group;
  light?: THREE.PointLight;
  x: number;
  z: number;
  collected: boolean;
  noteData?: LoreNoteData;
}

interface LockerSpot {
  id: string;
  x: number;
  z: number;
  rotY: number;
}

interface CeilingLampEntry {
  light: THREE.PointLight;
  bulbMat: THREE.MeshStandardMaterial;
  coneMat: THREE.MeshBasicMaterial;
  base: number;
  seed: number;
  flicker: boolean;
}

// Pre-allocated scratch vectors to avoid per-frame GC
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _flashlightNormalColor = new THREE.Color(0xfff1d6);
const _flashlightWarmDimColor = new THREE.Color(0xffb56b);
const _flashlightColdGlitchColor = new THREE.Color(0xd2e8ff);

export class HorrorEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudSnapshot) => void;
  private audio: HorrorAudio;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private textures!: HorrorTextureSet;
  private pmremEnv: THREE.Texture | null = null;
  private isSoftwareGl = false;

  private flashlight!: THREE.SpotLight;
  private flashlightTarget!: THREE.Object3D;
  private playerFillLight!: THREE.PointLight;
  private ceilingLamps: CeilingLampEntry[] = [];
  private dustPoints: THREE.Points | null = null;

  private stalker!: StalkerRig;
  private exitGate!: ExitGateRig;
  private collectibles: CollectibleEntry[] = [];
  private lockerSpots: LockerSpot[] = [];

  private phase: GamePhase = 'title';
  private difficulty: DifficultyId = 'normal';
  private brightness = 1.35;

  // Player state
  private playerX = 0;
  private playerZ = 0;
  private yaw = 0;
  private pitch = 0;
  private eyeHeight = 1.62;
  private bobTimer = 0;
  private stepTimer = 0;
  private breathCooldown = 0;
  private ambientCreakTimer = 14;
  private health = 100;
  private invulnTimer = 0;
  private battery = 100;
  private flashlightOn = true;
  private flashlightSputterTimer = 0;
  private flashlightNextSputter = 5.5;
  private flashlightFlickerMult = 1;
  private flashlightFlickerSoundCd = 0;
  private stamina = 100;
  private isCrouching = false;
  private isHiding = false;
  private preHideX = 0;
  private preHideZ = 0;
  private showMap = false;
  private discoveredCells: boolean[][] = [];
  private readNoteIds = new Set<string>();
  private fuses = 0;
  private gateOpen = false;
  private gateOpenProgress = 0;
  private activeNote: LoreNoteData | null = null;
  private statusBanner: string | null = null;
  private statusBannerTimer = 0;
  private elapsedSeconds = 0;

  // Stalker AI state
  private stalkerX = 0;
  private stalkerZ = 0;
  private stalkerYaw = 0;
  private stalkerWaypointIdx = 0;
  private stalkerChasing = false;
  private stalkerChaseTimer = 0;
  private stalkerStepTimer = 0;
  private heartbeatTimer = 0;
  private jumpscareTimer = 0;
  private jumpscareActive = false;
  private scareFlashTimer = 0;
  private ambientScareCooldown = 14;
  private stalkerStuckTimer = 0;
  private lastStalkerX = 0;
  private lastStalkerZ = 0;

  // Input state
  private bindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  private sensitivity = 1.0;
  private listeningForKey = false;
  private keys: Record<string, boolean> = {};
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private virtualSprint = false;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerLocked = false;

  private frameId = 0;
  private clock = new THREE.Clock();
  private hudThrottle = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    audio: HorrorAudio,
    onHudUpdate: (hud: HudSnapshot) => void
  ) {
    this.container = container;
    this.audio = audio;
    this.onHudUpdate = onHudUpdate;

    this.initRenderer();
    this.initScene();
    this.bindEvents();
    this.resetWorldState('title');
    this.startLoop();
  }

  private detectSoftwareGl(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private initRenderer() {
    this.isSoftwareGl = this.detectSoftwareGl();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.brightness;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.className = 'w-full h-full block cursor-crosshair';
    this.container.appendChild(canvas);

    this.applyResolution();
  }

  private applyResolution() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || window.innerWidth));
    const h = Math.max(240, Math.round(rect.height || window.innerHeight));
    const aspect = w / h;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f17);
    this.scene.fog = new THREE.FogExp2(0x0a0f17, 0.058);

    const rect = this.container.getBoundingClientRect();
    const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 55);
    this.scene.add(this.camera);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremEnv = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.pmremEnv;
    this.scene.environmentIntensity = 0.52;
    pmremGenerator.dispose();

    const maxAniso = this.isSoftwareGl
      ? 1
      : Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = createHorrorTextures(maxAniso);

    // Balanced ambient hemisphere light so corridors remain legible without losing tension
    const hemi = new THREE.HemisphereLight(0x6885ad, 0x1b222e, 0.72);
    this.scene.add(hemi);

    // Player Flashlight (crisp wider cone illuminating ahead)
    this.flashlight = new THREE.SpotLight(0xfff4de, 8.2, 28, Math.PI / 4.0, 0.62, 1.15);
    this.flashlight.castShadow = !this.isSoftwareGl;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0004;

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Subtle close-range player fill light so pitch darkness isn't blinding when flashlight is off
    this.playerFillLight = new THREE.PointLight(0xdbeafe, 0.75, 5.5, 1.5);
    this.scene.add(this.playerFillLight);

    this.buildWardGeometry();
    this.buildCollectibles();
    this.buildDustParticles();

    this.stalker = createStalkerEntity();
    this.scene.add(this.stalker.root);
  }

  private buildDustParticles() {
    const count = 240;
    const positions = new Float32Array(count * 3);
    const spanX = MAP_COLS * CELL_SIZE * 0.9;
    const spanZ = MAP_ROWS * CELL_SIZE * 0.9;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spanX;
      positions[i * 3 + 1] = 0.25 + Math.random() * (WALL_HEIGHT - 0.5);
      positions[i * 3 + 2] = (Math.random() - 0.5) * spanZ;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xdbeafe,
      size: 0.045,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  private buildWardGeometry() {
    const worldW = MAP_COLS * CELL_SIZE;
    const worldD = MAP_ROWS * CELL_SIZE;

    const floorGeo = new THREE.PlaneGeometry(worldW, worldD);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.floor,
      roughness: 0.78,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceilMat = new THREE.MeshStandardMaterial({
      map: this.textures.ceiling,
      roughness: 0.92,
      metalness: 0.04,
    });
    const ceiling = new THREE.Mesh(floorGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    this.scene.add(ceiling);

    // Wall blocks
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.textures.wall,
      roughness: 0.85,
      metalness: 0.05,
    });
    const wallBloodMat = new THREE.MeshStandardMaterial({
      map: this.textures.wallBlood,
      roughness: 0.82,
      metalness: 0.06,
    });

    for (let gz = 0; gz < MAP_ROWS; gz++) {
      for (let gx = 0; gx < MAP_COLS; gx++) {
        const ch = WARD_MAP[gz][gx];
        if (ch === '#' || ch === 'B') {
          const pos = gridToWorld(gx, gz);
          const wall = new THREE.Mesh(wallGeo, ch === 'B' ? wallBloodMat : wallMat);
          wall.position.set(pos.x, WALL_HEIGHT / 2, pos.z);
          wall.castShadow = !this.isSoftwareGl;
          wall.receiveShadow = true;
          this.scene.add(wall);
        }
      }
    }

    // Exit Gate
    this.exitGate = createExitGateModel(this.textures);
    const gatePos = gridToWorld(EXIT_GATE_CELL.gx, EXIT_GATE_CELL.gz);
    this.exitGate.root.position.set(gatePos.x, 0, gatePos.z);
    this.scene.add(this.exitGate.root);

    const exitBeacon = new THREE.PointLight(0x34d399, 2.2, 9, 1.4);
    exitBeacon.position.set(gatePos.x, 2.3, gatePos.z - 1.5);
    this.scene.add(exitBeacon);

    // Props (beds, lockers, tables)
    PROP_SPAWNS.forEach((p, idx) => {
      const pos = gridToWorld(p.gx, p.gz);
      let mesh: THREE.Group;
      if (p.type === 'bed') mesh = createHospitalBed(this.textures);
      else if (p.type === 'locker') {
        mesh = createMetalLocker(this.textures);
        this.lockerSpots.push({
          id: `locker-${idx}`,
          x: pos.x,
          z: pos.z,
          rotY: p.rotY,
        });
      } else mesh = createDeskTable(this.textures);
      mesh.position.set(pos.x, 0, pos.z);
      mesh.rotation.y = p.rotY;
      this.scene.add(mesh);
    });

    // Illuminated corridor ceiling fixtures with visible downward light beams
    const lampSpots = [
      { gx: 7, gz: 12, color: 0xd4e8ff, base: 5.8, flicker: false },
      { gx: 7, gz: 8, color: 0xffe4b8, base: 5.2, flicker: true },
      { gx: 7, gz: 4, color: 0xd0e4ff, base: 5.2, flicker: true },
      { gx: 7, gz: 1, color: 0xb7f7d4, base: 4.8, flicker: false },
      { gx: 3, gz: 10, color: 0xdcebff, base: 4.9, flicker: false },
      { gx: 11, gz: 10, color: 0xdcebff, base: 4.9, flicker: false },
      { gx: 2, gz: 7, color: 0xffd0c2, base: 4.8, flicker: true },
      { gx: 12, gz: 7, color: 0xd4e8ff, base: 4.9, flicker: false },
      { gx: 3, gz: 2, color: 0xdcebff, base: 4.6, flicker: false },
      { gx: 11, gz: 2, color: 0xdcebff, base: 4.6, flicker: false },
    ];
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.6,
      metalness: 0.7,
    });
    const housingGeo = new THREE.BoxGeometry(1.06, 0.06, 0.32);
    const bulbGeo = new THREE.BoxGeometry(0.92, 0.06, 0.2);
    const coneHeight = WALL_HEIGHT - 0.14;
    const coneGeo = new THREE.ConeGeometry(2.15, coneHeight, 24, 1, true);

    lampSpots.forEach((spot, idx) => {
      const pos = gridToWorld(spot.gx, spot.gz);

      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.set(pos.x, WALL_HEIGHT - 0.03, pos.z);
      this.scene.add(housing);

      const bulbMat = new THREE.MeshStandardMaterial({
        color: spot.color,
        emissive: spot.color,
        emissiveIntensity: 2.4,
        roughness: 0.2,
      });
      const fixture = new THREE.Mesh(bulbGeo, bulbMat);
      fixture.position.set(pos.x, WALL_HEIGHT - 0.06, pos.z);
      this.scene.add(fixture);

      // Visible soft downward light ray cone from the ceiling fixture
      const coneMat = new THREE.MeshBasicMaterial({
        color: spot.color,
        transparent: true,
        opacity: 0.068,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const lightCone = new THREE.Mesh(coneGeo, coneMat);
      lightCone.position.set(pos.x, coneHeight / 2, pos.z);
      this.scene.add(lightCone);

      const light = new THREE.PointLight(spot.color, spot.base, 15.5, 1.2);
      light.position.set(pos.x, WALL_HEIGHT - 0.42, pos.z);
      this.scene.add(light);

      this.ceilingLamps.push({
        light,
        bulbMat,
        coneMat,
        base: spot.base,
        seed: idx * 3.7 + 1.1,
        flicker: spot.flicker,
      });
    });
  }

  private buildCollectibles() {
    FUSE_SPAWNS.forEach((f) => {
      const pos = gridToWorld(f.gx, f.gz);
      const mesh = createFuseModel();
      mesh.position.set(pos.x, 0.55, pos.z);
      const light = new THREE.PointLight(0xf59e0b, 0.7, 3.6, 2);
      light.position.set(pos.x, 0.95, pos.z);
      this.scene.add(mesh, light);
      this.collectibles.push({
        id: f.id,
        kind: 'fuse',
        mesh,
        light,
        x: pos.x,
        z: pos.z,
        collected: false,
      });
    });

    BATTERY_SPAWNS.forEach((b) => {
      const pos = gridToWorld(b.gx, b.gz);
      const mesh = createBatteryModel();
      mesh.position.set(pos.x, 0.55, pos.z);
      const light = new THREE.PointLight(0x22d3ee, 0.65, 3.2, 2);
      light.position.set(pos.x, 0.95, pos.z);
      this.scene.add(mesh, light);
      this.collectibles.push({
        id: b.id,
        kind: 'battery',
        mesh,
        light,
        x: pos.x,
        z: pos.z,
        collected: false,
      });
    });

    MEDKIT_SPAWNS.forEach((m) => {
      const pos = gridToWorld(m.gx, m.gz);
      const mesh = createMedkitModel();
      mesh.position.set(pos.x, 0.45, pos.z);
      const light = new THREE.PointLight(0xef4444, 0.55, 2.8, 2);
      light.position.set(pos.x, 0.85, pos.z);
      this.scene.add(mesh, light);
      this.collectibles.push({
        id: m.id,
        kind: 'medkit',
        mesh,
        light,
        x: pos.x,
        z: pos.z,
        collected: false,
      });
    });

    NOTE_SPAWNS.forEach((n) => {
      const pos = gridToWorld(n.gx, n.gz);
      const mesh = createNoteModel(this.textures);
      // Place directly on top of the wooden desk table (height 0.78)
      mesh.position.set(pos.x, 0.78, pos.z);
      this.scene.add(mesh);
      this.collectibles.push({
        id: n.id,
        kind: 'note',
        mesh,
        x: pos.x,
        z: pos.z,
        collected: false,
        noteData: n,
      });
    });
  }

  public resetWorldState(targetPhase: GamePhase) {
    const spawn = gridToWorld(PLAYER_SPAWN.gx, PLAYER_SPAWN.gz);
    this.playerX = spawn.x;
    this.playerZ = spawn.z;
    this.yaw = 0; // Looking North (-Z)
    this.pitch = 0;
    this.eyeHeight = 1.62;
    this.bobTimer = 0;
    this.stepTimer = 0;
    this.health = 100;
    this.invulnTimer = 0;
    this.battery = 100;
    this.flashlightOn = true;
    this.stamina = 100;
    this.isCrouching = false;
    this.isHiding = false;
    this.showMap = false;
    this.discoveredCells = Array.from({ length: MAP_ROWS }, () =>
      Array<boolean>(MAP_COLS).fill(false)
    );
    this.revealAroundPlayer();
    this.readNoteIds.clear();
    this.fuses = 0;
    this.gateOpen = false;
    this.gateOpenProgress = 0;
    this.activeNote = null;
    this.elapsedSeconds = 0;
    this.statusBanner = targetPhase === 'playing' ? 'Cari 4 Sekring untuk menyalakan Gerbang Utara' : null;
    this.statusBannerTimer = targetPhase === 'playing' ? 4.5 : 0;

    // Reset collectibles
    this.collectibles.forEach((c) => {
      c.collected = false;
      c.mesh.visible = true;
      if (c.light) {
        c.light.intensity = c.kind === 'fuse' ? 0.7 : c.kind === 'medkit' ? 0.55 : 0.65;
      }
    });

    // Reset gate LEDs and door leaf
    this.exitGate.doorLeaf.position.x = 0;
    this.exitGate.statusLight.color.setHex(0xdc2626);
    this.exitGate.leds.forEach((led) => {
      const mat = led.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xdc2626);
      mat.emissive.setHex(0xdc2626);
    });

    // Reset Stalker
    const sSpawn = gridToWorld(STALKER_SPAWN.gx, STALKER_SPAWN.gz);
    this.stalkerX = sSpawn.x;
    this.stalkerZ = sSpawn.z;
    this.lastStalkerX = sSpawn.x;
    this.lastStalkerZ = sSpawn.z;
    this.stalkerYaw = Math.PI;
    this.stalkerWaypointIdx = 0;
    this.stalkerChasing = false;
    this.stalkerChaseTimer = 0;
    this.stalkerStuckTimer = 0;
    this.jumpscareActive = false;
    this.jumpscareTimer = 0;
    this.scareFlashTimer = 0;
    this.ambientScareCooldown = 12;
    this.flashlightSputterTimer = 0;
    this.flashlightNextSputter = 4.5 + Math.random() * 4.5;
    this.flashlightFlickerMult = 1;
    this.flashlightFlickerSoundCd = 0;
    this.flashlight.color.copy(_flashlightNormalColor);
    this.flashlight.angle = Math.PI / 4.6;
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.stalker.eyeLight.intensity = 1.1;
    this.stalker.root.position.set(this.stalkerX, 0, this.stalkerZ);
    this.audio.setProximityStatic(0);

    this.phase = targetPhase;
    this.syncCameraAndFlashlight(0, 0, 0);
    this.emitHud();
  }

  public startNewGame(difficulty?: DifficultyId) {
    if (difficulty) {
      this.difficulty = difficulty;
    }
    this.audio.init();
    this.resetWorldState('playing');
    this.requestPointerLockSafe();
  }

  public setDifficulty(difficulty: DifficultyId) {
    this.difficulty = difficulty;
    this.emitHud();
  }

  public setSensitivity(val: number) {
    this.sensitivity = THREE.MathUtils.clamp(val, 0.4, 2.2);
  }

  public setBrightness(val: number) {
    this.brightness = THREE.MathUtils.clamp(val, 0.9, 2.2);
    if (this.renderer) {
      this.renderer.toneMappingExposure = this.brightness;
    }
  }

  public openCollectedNote(noteId: string) {
    const found = NOTE_SPAWNS.find((n) => n.id === noteId);
    if (!found || !this.readNoteIds.has(noteId)) return;
    this.audio.playNoteRustle();
    this.activeNote = found;
    this.showMap = false;
    this.phase = 'note';
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public toggleCrouch() {
    if (this.phase !== 'playing' || this.isHiding || this.jumpscareActive) return;
    this.isCrouching = !this.isCrouching;
    this.emitHud();
  }

  public toggleMap() {
    if (this.phase !== 'playing' || this.jumpscareActive) return;
    this.showMap = !this.showMap;
    this.audio.playNoteRustle();
    this.emitHud();
  }

  public resumeGame() {
    this.audio.init();
    this.activeNote = null;
    this.phase = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public setPhase(phase: GamePhase) {
    this.phase = phase;
    if (phase !== 'playing') {
      this.audio.setProximityStatic(0);
    }
    this.emitHud();
  }

  public setKeyBindings(next: KeyBindings) {
    this.bindings = { ...next };
    this.emitHud();
  }

  public setListeningForKey(listening: boolean) {
    this.listeningForKey = listening;
    if (listening) {
      this.keys = {};
    }
  }

  public toggleFlashlight() {
    if (this.phase !== 'playing' || this.isHiding) return;
    if (!this.flashlightOn && this.battery <= 0.5) {
      this.showBanner('Baterai senter habis!');
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.audio.playFlashlightClick();
    this.emitHud();
  }

  public setVirtualInput(moveX: number, moveY: number, sprint: boolean) {
    this.virtualMoveX = moveX;
    this.virtualMoveY = moveY;
    this.virtualSprint = sprint;
  }

  public addLookDelta(dx: number, dy: number) {
    if (this.phase !== 'playing' || this.jumpscareActive) return;
    this.yaw -= dx * 0.0032 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * 0.0026 * this.sensitivity,
      -1.1,
      1.1
    );
  }

  public triggerInteract() {
    if (this.phase === 'note') {
      this.resumeGame();
      return;
    }
    if (this.phase !== 'playing' || this.jumpscareActive) return;

    if (this.isHiding) {
      this.isHiding = false;
      this.playerX = this.preHideX;
      this.playerZ = this.preHideZ;
      this.audio.playLockerDoor();
      this.showBanner('Keluar dari loker');
      this.emitHud();
      return;
    }

    const target = this.findNearestInteractable();
    if (!target) return;

    if (target.kind === 'locker') {
      this.preHideX = this.playerX;
      this.preHideZ = this.playerZ;
      this.isHiding = true;
      this.isCrouching = false;
      this.flashlightOn = false;
      // Place camera slightly inside the locker facing out along rotY
      this.playerX = target.locker.x + Math.sin(target.locker.rotY) * 0.12;
      this.playerZ = target.locker.z + Math.cos(target.locker.rotY) * 0.12;
      this.yaw = target.locker.rotY + Math.PI;
      this.pitch = 0;
      this.audio.playLockerDoor();
      this.showBanner('Bersembunyi di dalam loker — tahan napas');
      this.emitHud();
      return;
    }

    if (target.kind === 'gate') {
      if (this.gateOpen) return;
      if (this.fuses >= FUSE_SPAWNS.length) {
        this.gateOpen = true;
        this.audio.playUnlockPower();
        this.audio.playGateSlide();
        this.exitGate.statusLight.color.setHex(0x10b981);
        this.showBanner('Daya menyala! Terobos Gerbang Utara sekarang!');
        this.emitHud();
      } else {
        this.audio.playFlashlightClick();
        this.showBanner(
          `Panel butuh ${FUSE_SPAWNS.length - this.fuses} sekring lagi.`
        );
      }
      return;
    }

    const entry = target.entry;
    if (!entry) return;

    if (entry.kind === 'fuse') {
      entry.collected = true;
      entry.mesh.visible = false;
      if (entry.light) entry.light.intensity = 0;
      this.fuses += 1;
      this.audio.playPickup(false);
      const led = this.exitGate.leds[this.fuses - 1];
      if (led) {
        const mat = led.material as THREE.MeshStandardMaterial;
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x10b981);
      }
      this.showBanner(
        this.fuses >= FUSE_SPAWNS.length
          ? 'Semua 4 sekring terkumpul! Kembali ke Gerbang Utara!'
          : `Sekring ditemukan (${this.fuses}/${FUSE_SPAWNS.length})`
      );
      if (this.fuses === 2 || this.fuses === 3) {
        this.triggerHallwayScare();
      }
      this.emitHud();
    } else if (entry.kind === 'battery') {
      entry.collected = true;
      entry.mesh.visible = false;
      if (entry.light) entry.light.intensity = 0;
      this.battery = Math.min(100, this.battery + 45);
      this.audio.playPickup(true);
      this.showBanner('Baterai senter terisi +45%');
      this.emitHud();
    } else if (entry.kind === 'medkit') {
      if (this.health >= 100) {
        this.showBanner('Kesehatan sudah penuh (100%)');
        this.emitHud();
        return;
      }
      entry.collected = true;
      entry.mesh.visible = false;
      if (entry.light) entry.light.intensity = 0;
      this.health = Math.min(100, this.health + 55);
      this.audio.playHeal();
      this.showBanner('Menggunakan Kotak P3K — Kesehatan pulih');
      this.emitHud();
    } else if (entry.kind === 'note' && entry.noteData) {
      this.audio.playNoteRustle();
      this.readNoteIds.add(entry.noteData.id);
      this.activeNote = entry.noteData;
      this.phase = 'note';
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.emitHud();
    }
  }

  private showBanner(msg: string) {
    this.statusBanner = msg;
    this.statusBannerTimer = 3.6;
  }

  private triggerHallwayScare() {
    this.scareFlashTimer = 0.55;
    this.audio.playScareSting();
    this.emitHud(0.85);
  }

  private findNearestInteractable():
    | { kind: 'gate'; prompt: string }
    | { kind: 'locker'; prompt: string; locker: LockerSpot }
    | { kind: 'item'; prompt: string; entry: CollectibleEntry }
    | null {
    const keyLabel = formatKeyCode(this.bindings.interact);
    if (this.isHiding) {
      return { kind: 'gate', prompt: `[${keyLabel}] Keluar dari Loker` };
    }

    for (const c of this.collectibles) {
      if (c.collected) continue;
      const d = Math.hypot(c.x - this.playerX, c.z - this.playerZ);
      if (d < 2.2) {
        if (c.kind === 'fuse') {
          return { kind: 'item', prompt: `[${keyLabel}] Ambil Sekring Listrik`, entry: c };
        }
        if (c.kind === 'battery') {
          return { kind: 'item', prompt: `[${keyLabel}] Ambil Baterai Senter`, entry: c };
        }
        if (c.kind === 'medkit') {
          return { kind: 'item', prompt: `[${keyLabel}] Pakai Kotak P3K`, entry: c };
        }
        if (c.kind === 'note') {
          return { kind: 'item', prompt: `[${keyLabel}] Baca Catatan`, entry: c };
        }
      }
    }

    for (const locker of this.lockerSpots) {
      const d = Math.hypot(locker.x - this.playerX, locker.z - this.playerZ);
      if (d < 1.85) {
        return {
          kind: 'locker',
          prompt: `[${keyLabel}] Sembunyi di Loker`,
          locker,
        };
      }
    }

    const gatePos = gridToWorld(EXIT_GATE_CELL.gx, EXIT_GATE_CELL.gz);
    const gateDist = Math.hypot(gatePos.x - this.playerX, gatePos.z - this.playerZ);
    if (gateDist < 2.7 && !this.gateOpen) {
      return {
        kind: 'gate',
        prompt:
          this.fuses >= FUSE_SPAWNS.length
            ? `[${keyLabel}] Pasang Sekring & Buka Gerbang`
            : `[${keyLabel}] Panel Gerbang (${this.fuses}/${FUSE_SPAWNS.length} Sekring)`,
      };
    }

    return null;
  }

  private revealAroundPlayer() {
    const pgx = Math.floor(this.playerX / CELL_SIZE + MAP_COLS / 2);
    const pgz = Math.floor(this.playerZ / CELL_SIZE + MAP_ROWS / 2);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = pgx + dx;
        const nz = pgz + dz;
        if (nz >= 0 && nz < MAP_ROWS && nx >= 0 && nx < MAP_COLS) {
          this.discoveredCells[nz][nx] = true;
        }
      }
    }
  }

  private requestPointerLockSafe() {
    try {
      const canvas = this.renderer.domElement;
      if (canvas.requestPointerLock) {
        const res = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Fallback drag-look stays active if pointer lock is restricted
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.listeningForKey) return;
    this.keys[e.code] = true;
    if (e.code === this.bindings.flashlight) {
      this.toggleFlashlight();
    } else if (e.code === this.bindings.interact) {
      this.triggerInteract();
    } else if (e.code === this.bindings.crouch) {
      this.toggleCrouch();
    } else if (e.code === this.bindings.map) {
      this.toggleMap();
    } else if (e.code === 'Escape' && this.phase === 'note') {
      this.resumeGame();
    } else if (
      e.code === this.bindings.pause &&
      (this.phase === 'playing' || this.phase === 'paused')
    ) {
      this.setPhase(this.phase === 'playing' ? 'paused' : 'playing');
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    this.audio.init();
    if (!this.pointerLocked) {
      this.requestPointerLockSafe();
      this.isDraggingLook = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onMouseUp = () => {
    this.isDraggingLook = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing' || this.jumpscareActive) return;
    if (this.pointerLocked) {
      this.yaw -= e.movementX * 0.0024 * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * 0.002 * this.sensitivity,
        -1.1,
        1.1
      );
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.addLookDelta(dx, dy);
    }
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onResize = () => {
    this.applyResolution();
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  private startLoop() {
    this.clock.start();
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.08);
      const elapsed = this.clock.getElapsedTime();

      this.update(dt, elapsed);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };
    tick();
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private update(dt: number, elapsed: number) {
    // Animate subtle collectible hover & ceiling lamp flicker even on title screen
    this.collectibles.forEach((c, idx) => {
      if (!c.collected && c.kind !== 'note') {
        c.mesh.rotation.y = elapsed * 1.4 + idx;
        c.mesh.position.y = 0.52 + Math.sin(elapsed * 2.5 + idx) * 0.06;
      }
    });

    this.ceilingLamps.forEach((item) => {
      if (item.flicker) {
        const wave = Math.sin(elapsed * 9 + item.seed) * Math.sin(elapsed * 23 + item.seed);
        const mult = wave > 0.78 ? 0.45 : wave < -0.75 ? 0.72 : 1.0;
        item.light.intensity = item.base * mult;
        item.bulbMat.emissiveIntensity = 2.4 * mult;
        item.coneMat.opacity = 0.068 * mult;
      } else {
        item.light.intensity = item.base;
        item.bulbMat.emissiveIntensity = 2.4;
        item.coneMat.opacity = 0.068;
      }
    });

    if (this.dustPoints) {
      this.dustPoints.rotation.y = elapsed * 0.015;
      this.dustPoints.position.y = Math.sin(elapsed * 0.6) * 0.08;
    }

    // Gate slide animation
    if (this.gateOpen && this.gateOpenProgress < 1) {
      this.gateOpenProgress = Math.min(1, this.gateOpenProgress + dt * 1.1);
      this.exitGate.doorLeaf.position.x = -this.gateOpenProgress * 2.35;
    }

    if (this.phase === 'title') {
      // Gentle atmospheric camera sway at spawn on title backdrop
      this.yaw = Math.sin(elapsed * 0.25) * 0.35;
      this.pitch = 0.02 + Math.sin(elapsed * 0.4) * 0.03;
      this.syncCameraAndFlashlight(elapsed, 0, dt);
      return;
    }

    if (this.phase !== 'playing') {
      return;
    }

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer -= dt;
      if (this.statusBannerTimer <= 0) {
        this.statusBanner = null;
      }
    }

    if (this.scareFlashTimer > 0) {
      this.scareFlashTimer = Math.max(0, this.scareFlashTimer - dt);
    }
    if (this.ambientScareCooldown > 0) {
      this.ambientScareCooldown -= dt;
    }

    // Jumpscare sequence before Game Over screen
    if (this.jumpscareActive) {
      this.jumpscareTimer -= dt;
      const dirX = -Math.sin(this.yaw);
      const dirZ = -Math.cos(this.yaw);
      // Lock Stalker directly 0.68m in front of camera face
      this.stalker.root.position.set(
        this.playerX + dirX * 0.68,
        0.04,
        this.playerZ + dirZ * 0.68
      );
      this.stalker.root.rotation.y = this.yaw;
      this.stalker.head.rotation.z = Math.sin(elapsed * 48) * 0.32;
      this.stalker.leftArm.rotation.x = -1.65;
      this.stalker.rightArm.rotation.x = -1.65;
      this.stalker.eyeLight.intensity = Math.sin(elapsed * 60) > 0 ? 18 : 3;

      if (this.camera.fov !== 48) {
        this.camera.fov = 48;
        this.camera.updateProjectionMatrix();
      }
      const shakeX = (Math.random() - 0.5) * 0.16;
      const shakeY = (Math.random() - 0.5) * 0.16;
      this.camera.position.set(
        this.playerX + shakeX,
        1.78 + shakeY,
        this.playerZ
      );
      _lookTarget.set(
        this.playerX + dirX * 0.68,
        2.12 + (Math.random() - 0.5) * 0.08,
        this.playerZ + dirZ * 0.68
      );
      this.camera.lookAt(_lookTarget);
      this.flashlight.position.copy(this.camera.position);
      this.flashlightTarget.position.copy(_lookTarget);
      this.flashlight.intensity = Math.sin(elapsed * 55) > 0 ? 11 : 1.5;

      if (this.jumpscareTimer <= 0) {
        this.jumpscareActive = false;
        this.camera.fov = 68;
        this.camera.updateProjectionMatrix();
        this.audio.setProximityStatic(0);
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        this.phase = 'gameover';
        this.emitHud();
      }
      return;
    }

    this.elapsedSeconds += dt;
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }

    // 1. Player Movement (customizable keybindings + arrow fallback when default)
    const isPressed = (action: keyof KeyBindings, fallbackArrow?: string) =>
      Boolean(
        this.keys[this.bindings[action]] ||
          (fallbackArrow &&
            this.bindings[action] === DEFAULT_KEY_BINDINGS[action] &&
            this.keys[fallbackArrow])
      );

    const moveFwd =
      (isPressed('forward', 'ArrowUp') ? 1 : 0) -
      (isPressed('backward', 'ArrowDown') ? 1 : 0) +
      this.virtualMoveY;
    const moveSide =
      (isPressed('right', 'ArrowRight') ? 1 : 0) -
      (isPressed('left', 'ArrowLeft') ? 1 : 0) +
      this.virtualMoveX;

    const wantsMove = Math.abs(moveFwd) > 0.05 || Math.abs(moveSide) > 0.05;
    const wantsSprint =
      !this.isHiding &&
      (isPressed('sprint', 'ShiftRight') || this.virtualSprint) &&
      wantsMove;

    if (wantsSprint && this.stamina > 2 && this.isCrouching) {
      this.isCrouching = false;
    }

    const isSprinting = wantsSprint && this.stamina > 2;
    if (isSprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 26);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * (this.isHiding ? 18 : 15));
    }

    if (this.breathCooldown > 0) this.breathCooldown -= dt;
    if (this.stamina < 12 && this.breathCooldown <= 0) {
      this.audio.playHeavyBreath();
      this.breathCooldown = 2.4;
    }

    this.ambientCreakTimer -= dt;
    if (this.ambientCreakTimer <= 0) {
      this.audio.playAmbientCreak();
      this.ambientCreakTimer = 14 + Math.random() * 14;
    }

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _move.set(0, 0, 0).addScaledVector(_forward, moveFwd).addScaledVector(_right, moveSide);

    const moving = !this.isHiding && _move.lengthSq() > 0.001;
    if (moving) {
      _move.normalize();
      const speed = isSprinting ? 5.25 : this.isCrouching ? 2.15 : 3.2;
      const nextX = this.playerX + _move.x * speed * dt;
      const nextZ = this.playerZ + _move.z * speed * dt;
      const resolved = resolveCircleGridCollision(nextX, nextZ, 0.42, this.gateOpen);
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
      this.revealAroundPlayer();

      this.bobTimer += dt * (isSprinting ? 13 : this.isCrouching ? 6 : 8.5);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.playFootstep(isSprinting ? 'sprint' : this.isCrouching ? 'crouch' : 'walk');
        this.stepTimer = isSprinting ? 0.31 : this.isCrouching ? 0.58 : 0.46;
      }
    } else {
      this.stepTimer = 0.05;
    }

    // Check Win Condition (escaped north through opened exit gate)
    const gatePos = gridToWorld(EXIT_GATE_CELL.gx, EXIT_GATE_CELL.gz);
    if (this.gateOpen && this.playerZ < gatePos.z - 0.85 && Math.abs(this.playerX - gatePos.x) < 1.5) {
      this.audio.setProximityStatic(0);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.phase = 'win';
      this.emitHud();
      return;
    }

    // 2. Flashlight Battery Drain (scaled by difficulty)
    if (this.flashlightOn) {
      const drainRate =
        this.difficulty === 'story' ? 0.85 : this.difficulty === 'nightmare' ? 1.95 : 1.45;
      this.battery = Math.max(0, this.battery - dt * drainRate);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        this.audio.playFlashlightClick();
        this.showBanner('Baterai senter habis! Cari baterai di ruangan.');
      }
    }

    // 3. Stalker AI & Proximity Horror Effects
    this.updateStalker(dt, elapsed);

    const distToStalker = Math.hypot(this.stalkerX - this.playerX, this.stalkerZ - this.playerZ);
    let danger = THREE.MathUtils.clamp(1 - (distToStalker - 1.5) / 11.5, 0, 1);
    if (this.isHiding) {
      danger *= 0.65;
    }

    this.audio.setProximityStatic(danger);
    if (danger > 0.15) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.audio.playHeartbeat(danger);
        this.heartbeatTimer = THREE.MathUtils.lerp(1.05, 0.42, danger);
      }
    }

    this.syncCameraAndFlashlight(elapsed, danger, dt);

    this.hudThrottle -= dt;
    if (this.hudThrottle <= 0) {
      this.hudThrottle = 0.08;
      this.emitHud(danger);
    }
  }

  private updateStalker(dt: number, elapsed: number) {
    const dx = this.playerX - this.stalkerX;
    const dz = this.playerZ - this.stalkerZ;
    const dist = Math.hypot(dx, dz);

    const litRadius =
      this.difficulty === 'story' ? 10.0 : this.difficulty === 'nightmare' ? 16.5 : 14.0;
    const baseDarkRadius =
      this.difficulty === 'story' ? 3.8 : this.difficulty === 'nightmare' ? 6.2 : 5.2;
    const darkRadius = this.isCrouching ? baseDarkRadius * 0.55 : baseDarkRadius;
    const detectRadius = this.flashlightOn ? litRadius : darkRadius;

    const canSeePlayer =
      !this.isHiding &&
      dist < detectRadius &&
      hasLineOfSight(this.stalkerX, this.stalkerZ, this.playerX, this.playerZ);

    if (canSeePlayer && !this.stalkerChasing && this.ambientScareCooldown <= 0 && dist > 3.2) {
      this.ambientScareCooldown = 26;
      this.triggerHallwayScare();
    }

    if (canSeePlayer) {
      if (!this.stalkerChasing) {
        this.audio.playMonsterAlert();
      }
      this.stalkerChasing = true;
      this.stalkerChaseTimer = this.difficulty === 'nightmare' ? 6.2 : 5.0;
    } else if (this.stalkerChasing) {
      this.stalkerChaseTimer -= dt * (this.isHiding && dist > 2.4 ? 1.8 : 1.0);
      if (this.stalkerChaseTimer <= 0) {
        this.stalkerChasing = false;
      }
    }

    // Catch check -> Non-lethal slash on first hit, Full Close-up Jumpscare on second hit
    if (dist < 1.38 && !this.isHiding && this.invulnTimer <= 0) {
      if (this.health > 50) {
        this.health = 45;
        this.invulnTimer = 2.6;
        this.scareFlashTimer = 0.7;
        this.stamina = Math.min(100, this.stamina + 45);
        this.stalkerChasing = false;
        this.stalkerWaypointIdx = (this.stalkerWaypointIdx + 1) % STALKER_WAYPOINTS.length;
        this.audio.playHurtSlash();
        this.showBanner('Kamu terluka! Lari atau sembunyi di loker!');
        this.emitHud(1);
      } else {
        this.jumpscareActive = true;
        this.jumpscareTimer = 0.95;
        this.audio.playJumpscare();
        this.emitHud(1);
        return;
      }
    }

    let targetX = this.playerX;
    let targetZ = this.playerZ;
    if (!this.stalkerChasing) {
      const wp = STALKER_WAYPOINTS[this.stalkerWaypointIdx];
      const wpWorld = gridToWorld(wp.gx, wp.gz);
      targetX = wpWorld.x;
      targetZ = wpWorld.z;
      if (Math.hypot(targetX - this.stalkerX, targetZ - this.stalkerZ) < 1.1) {
        this.stalkerWaypointIdx = (this.stalkerWaypointIdx + 1) % STALKER_WAYPOINTS.length;
      }
    }

    const tx = targetX - this.stalkerX;
    const tz = targetZ - this.stalkerZ;
    const tDist = Math.hypot(tx, tz);
    if (tDist > 0.05) {
      const chaseSpeed =
        this.difficulty === 'story' ? 2.65 : this.difficulty === 'nightmare' ? 4.05 : 3.45;
      const patrolSpeed =
        this.difficulty === 'story' ? 1.55 : this.difficulty === 'nightmare' ? 2.35 : 1.95;
      const speed = this.stalkerChasing ? chaseSpeed : patrolSpeed;
      const stepX = (tx / tDist) * speed * dt;
      const stepZ = (tz / tDist) * speed * dt;
      const resolved = resolveCircleGridCollision(
        this.stalkerX + stepX,
        this.stalkerZ + stepZ,
        0.45,
        false
      );
      this.stalkerX = resolved.x;
      this.stalkerZ = resolved.z;

      const desiredYaw = Math.atan2(tx, tz);
      const diff = Math.atan2(
        Math.sin(desiredYaw - this.stalkerYaw),
        Math.cos(desiredYaw - this.stalkerYaw)
      );
      this.stalkerYaw += diff * Math.min(1, dt * 6);
    }

    // If stuck against a wall during patrol or chase, rotate waypoint so it never freezes
    const moved = Math.hypot(this.stalkerX - this.lastStalkerX, this.stalkerZ - this.lastStalkerZ);
    if (moved < 0.015 * dt * 60 * 0.2) {
      this.stalkerStuckTimer += dt;
      if (this.stalkerStuckTimer > 1.4) {
        this.stalkerStuckTimer = 0;
        this.stalkerChasing = false;
        this.stalkerWaypointIdx = (this.stalkerWaypointIdx + 1) % STALKER_WAYPOINTS.length;
      }
    } else {
      this.stalkerStuckTimer = 0;
    }
    this.lastStalkerX = this.stalkerX;
    this.lastStalkerZ = this.stalkerZ;

    // Animate Stalker limbs & eerie head twitch
    const walkFreq = this.stalkerChasing ? 10 : 5.5;
    const swing = Math.sin(elapsed * walkFreq) * 0.55;
    this.stalker.leftLeg.rotation.x = swing;
    this.stalker.rightLeg.rotation.x = -swing;
    this.stalker.leftArm.rotation.x = -swing * 0.7 - (this.stalkerChasing ? 0.85 : 0.15);
    this.stalker.rightArm.rotation.x = swing * 0.7 - (this.stalkerChasing ? 0.85 : 0.15);
    this.stalker.head.rotation.z = Math.sin(elapsed * 3.1) * 0.18 + (Math.random() > 0.97 ? 0.25 : 0);

    this.stalker.root.position.set(this.stalkerX, 0, this.stalkerZ);
    this.stalker.root.rotation.y = this.stalkerYaw;

    // Spatialized monster footsteps
    this.stalkerStepTimer -= dt;
    if (this.stalkerStepTimer <= 0) {
      const prox = THREE.MathUtils.clamp(1 - dist / 15, 0, 1);
      this.audio.playMonsterStep(prox);
      this.stalkerStepTimer = this.stalkerChasing ? 0.38 : 0.65;
    }
  }

  private syncCameraAndFlashlight(elapsed: number, danger: number, dt: number) {
    const targetEye = this.isHiding ? 1.52 : this.isCrouching ? 1.08 : 1.62;
    this.eyeHeight = THREE.MathUtils.lerp(
      this.eyeHeight,
      targetEye,
      Math.min(1, dt * 10 + (dt === 0 ? 1 : 0))
    );
    const bobAmp = this.isHiding ? 0 : this.isCrouching ? 0.02 : 0.045;
    const bobOffset = Math.sin(this.bobTimer) * bobAmp;
    const eyeY = this.eyeHeight + bobOffset;
    this.camera.position.set(this.playerX, eyeY, this.playerZ);

    const cosP = Math.cos(this.pitch);
    const dirX = -Math.sin(this.yaw) * cosP;
    const dirY = Math.sin(this.pitch);
    const dirZ = -Math.cos(this.yaw) * cosP;

    _lookTarget.set(this.playerX + dirX, eyeY + dirY, this.playerZ + dirZ);
    this.camera.lookAt(_lookTarget);

    if (this.playerFillLight) {
      this.playerFillLight.position.set(this.playerX, eyeY + 0.15, this.playerZ);
    }

    // Subtle hand sway for flashlight beam so shadows shift unsettlingly
    const handSwayX = Math.sin(elapsed * 2.3) * 0.08 + Math.cos(elapsed * 5.7) * 0.025;
    const handSwayY = Math.cos(elapsed * 1.9) * 0.06;

    this.flashlight.position.set(
      this.playerX + Math.cos(this.yaw) * 0.14,
      eyeY - 0.1,
      this.playerZ - Math.sin(this.yaw) * 0.14
    );
    this.flashlightTarget.position.set(
      this.playerX + dirX * 5 + handSwayX,
      eyeY + dirY * 5 + handSwayY,
      this.playerZ + dirZ * 5
    );

    if (!this.flashlightOn || this.battery <= 0) {
      this.flashlight.intensity = 0;
      return;
    }

    if (this.flashlightFlickerSoundCd > 0) {
      this.flashlightFlickerSoundCd -= dt;
    }

    // Trigger periodic random electrical sputter bursts (more frequent as battery drains or danger rises)
    if (this.phase === 'playing' || this.phase === 'title') {
      if (this.flashlightSputterTimer > 0) {
        this.flashlightSputterTimer -= dt;
      } else {
        this.flashlightNextSputter -= dt * (1 + danger * 2.2 + (this.battery < 35 ? 0.9 : 0));
        if (this.flashlightNextSputter <= 0) {
          this.flashlightSputterTimer = 0.28 + Math.random() * 0.52;
          this.flashlightNextSputter = 4.5 + Math.random() * 7.5;
          if (this.phase === 'playing' && this.flashlightFlickerSoundCd <= 0) {
            this.audio.playFlashlightFlicker(0.55 + danger * 0.45);
            this.flashlightFlickerSoundCd = 0.35;
          }
        }
      }
    }

    // 1. Organic filament micro-tremor (non-repeating layered waves)
    const microTremor =
      0.96 +
      0.04 * Math.sin(elapsed * 17.3) * Math.cos(elapsed * 29.1) +
      0.03 * Math.sin(elapsed * 47.0);

    // 2. Active sputter burst (sharp erratic dropouts & half-dim brownouts)
    let sputterMult = 1;
    if (this.flashlightSputterTimer > 0) {
      const stutterWave = Math.sin(elapsed * 64) * Math.cos(elapsed * 37);
      if (stutterWave > 0.32) {
        sputterMult = 0.04;
      } else if (stutterWave < -0.25) {
        sputterMult = 0.32;
      } else {
        sputterMult = 0.85;
      }
    }

    // 3. Stalker proximity interference (violent multi-pulse flicker & cold color shift)
    let dangerMult = 1;
    if (danger > 0.15) {
      const interference = Math.sin(elapsed * (34 + danger * 42)) * Math.sin(elapsed * 19.7);
      const threshold = THREE.MathUtils.lerp(0.75, 0.05, danger);
      if (interference > threshold) {
        dangerMult = 0.06;
        if (this.phase === 'playing' && this.flashlightFlickerSoundCd <= 0) {
          this.audio.playFlashlightFlicker(danger);
          this.flashlightFlickerSoundCd = 0.22;
        }
      } else if (interference < -threshold * 0.9) {
        dangerMult = 0.45;
      }
    }

    // 4. Low battery degradation & scare blackout
    const batteryScale = this.battery < 28 ? THREE.MathUtils.lerp(0.58, 1.0, this.battery / 28) : 1.0;
    const lowBatStutter =
      this.battery < 20 && Math.sin(elapsed * 31) * Math.cos(elapsed * 13) > 0.35 ? 0.18 : 1;
    const scareBlackout = this.scareFlashTimer > 0.18 ? 0.04 : 1;

    const targetMult =
      microTremor * sputterMult * dangerMult * batteryScale * lowBatStutter * scareBlackout;

    // Fast response with slight filament inertia (near-instant snap down, slight recovery lag)
    const lerpRate = targetMult < this.flashlightFlickerMult ? 38 : 18;
    this.flashlightFlickerMult = THREE.MathUtils.lerp(
      this.flashlightFlickerMult,
      targetMult,
      Math.min(1, dt * lerpRate + (dt === 0 ? 1 : 0))
    );

    this.flashlight.intensity = 8.2 * this.flashlightFlickerMult;

    // Dynamic beam cone & color temperature shift during instability
    const instability = Math.max(0, 1 - this.flashlightFlickerMult);
    this.flashlight.angle = Math.PI / 4.0 - instability * 0.06;
    if (danger > 0.35 && instability > 0.25) {
      this.flashlight.color.copy(_flashlightNormalColor).lerp(_flashlightColdGlitchColor, danger * 0.75);
    } else if (this.battery < 25 || sputterMult < 0.6) {
      this.flashlight.color.copy(_flashlightNormalColor).lerp(_flashlightWarmDimColor, instability * 0.85);
    } else {
      this.flashlight.color.copy(_flashlightNormalColor);
    }
  }

  private emitHud(danger = 0) {
    const interact = this.phase === 'playing' ? this.findNearestInteractable() : null;
    const playerGridX = THREE.MathUtils.clamp(
      Math.floor(this.playerX / CELL_SIZE + MAP_COLS / 2),
      0,
      MAP_COLS - 1
    );
    const playerGridZ = THREE.MathUtils.clamp(
      Math.floor(this.playerZ / CELL_SIZE + MAP_ROWS / 2),
      0,
      MAP_ROWS - 1
    );
    const rawDeg = ((-this.yaw * 180) / Math.PI) % 360;
    const headingDeg = (rawDeg + 360) % 360;
    const collectedNotes = NOTE_SPAWNS.filter((n) => this.readNoteIds.has(n.id));

    this.onHudUpdate({
      phase: this.phase,
      difficulty: this.difficulty,
      fuses: this.fuses,
      totalFuses: FUSE_SPAWNS.length,
      health: Math.round(this.health),
      battery: Math.round(this.battery),
      flashlightOn: this.flashlightOn,
      stamina: Math.round(this.stamina),
      isCrouching: this.isCrouching,
      isHiding: this.isHiding,
      showMap: this.showMap,
      headingDeg,
      playerGridX,
      playerGridZ,
      discoveredCells: this.discoveredCells.map((row) => [...row]),
      notesRead: this.readNoteIds.size,
      totalNotes: NOTE_SPAWNS.length,
      collectedNotes,
      interactPrompt: interact ? interact.prompt : null,
      dangerLevel: danger,
      gateOpen: this.gateOpen,
      pointerLocked: this.pointerLocked,
      activeNote: this.activeNote,
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      statusBanner: this.statusBanner,
      isJumpscaring: this.jumpscareActive,
      scareFlashIntensity: this.scareFlashTimer > 0 ? Math.min(1, this.scareFlashTimer / 0.55) : 0,
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });

    this.textures.dispose();
    this.pmremEnv?.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
