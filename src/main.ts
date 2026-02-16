import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

// ---------- Constants / player physics ----------
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const GRAVITY = -30;
const JUMP_SPEED = 12; // stronger jump to allow reliable vaulting onto cars
const STEP_HEIGHT = 0.45; // automatic small-step height for pavements
const STEP_HEIGHT_CAR = 1.2; // allow climbing onto cars automatically (raised slightly)
const BASE_PLAYER_SPEED = 6; // base running speed (increases slightly with score)

// spawn limits
const SPAWN_MIN_DISTANCE = 18; // minimum distance from player
const SPAWN_MAX_DISTANCE = 140; // max spawn distance (keeps spawns in city bounds)

// ---------- Basic scene / camera / renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111218);
// fog to hide far geometry and help performance when city is large
scene.fog = new THREE.Fog(0x111218, 50, 120);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------- Lighting ----------
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 20, 7);
scene.add(dir);

// ---------- Ground ----------
const groundGeo = new THREE.PlaneGeometry(400, 400);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05; // slightly lower to avoid z-fighting with road/sidewalk meshes
ground.receiveShadow = false;
scene.add(ground);

// ---------- Scene helpers: obstacles, cars, buildings ----------
type Obstacle = { mesh: THREE.Mesh; box: THREE.Box3; top: number; isCar?: boolean };
const obstacles: Obstacle[] = [];
function addObstacle(mesh: THREE.Mesh, isCar = false) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  obstacles.push({ mesh, box, top: box.max.y, isCar });
  scene.add(mesh);
}

// ---------- City generation (roads, sidewalks, buildings, streetlamps, cars) ----------
function createCity() {
  // road (X and Z cross)
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b });
  const roadX = new THREE.Mesh(new THREE.BoxGeometry(400, 0.1, 12), roadMat);
  // make the road flush with ground so sidewalks/road are walkable by player & zombies
  roadX.position.set(0, 0, 0);
  addObstacle(roadX, false); // road is walkable area (low top)

  const roadZ = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 400), roadMat);
  roadZ.position.set(0, 0, 0);
  addObstacle(roadZ, false);

  // sidewalks
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
  const sidewalk1 = new THREE.Mesh(new THREE.BoxGeometry(400, 0.05, 6), sideMat);
  sidewalk1.position.set(0, 0.025, 9);
  addObstacle(sidewalk1, false);
  const sidewalk2 = new THREE.Mesh(new THREE.BoxGeometry(400, 0.05, 6), sideMat);
  sidewalk2.position.set(0, 0.025, -9);
  addObstacle(sidewalk2, false);

  // buildings in grid along both sides of roads (expanded city with randomized sparsity)
  const blockSpacing = 30;
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      // leave center roads clear
      const worldX = gx * blockSpacing + (Math.random() - 0.5) * 6;
      const worldZ = gz * blockSpacing + (Math.random() - 0.5) * 6;
      if (Math.abs(worldX) < 18 && Math.abs(worldZ) < 18) continue; // keep center cross clear
      if (Math.random() > 0.5) continue; // sparse out distant blocks for performance (increased from 0.6)

      const w = 8 + Math.random() * 12;
      const d = 8 + Math.random() * 12;
      const h = 6 + Math.random() * 30; // slightly lower max height to reduce overdraw
      const bmat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.6 - Math.random() * 0.1, 0.2, 0.15 + Math.random() * 0.25) });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bmat);
      building.position.set(worldX, h / 2, worldZ);
      addObstacle(building, false);
    }
  }

  // streetlamps along the central X road (fewer, cheaper lights)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (let x = -180; x <= 180; x += 40) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6), lampMat);
    post.position.set(x, 3, 10.5);
    scene.add(post);
    const lamp = new THREE.PointLight(0xfff4cc, 0.45, 10);
    lamp.position.set(x, 6.2, 10.5);
    scene.add(lamp);
    // visible lamp head that glows
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0xfff4cc }));
    head.position.set(x, 6.2, 10.5);
    scene.add(head);

    const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6), lampMat);
    post2.position.set(x, 3, -10.5);
    scene.add(post2);
    const lamp2 = new THREE.PointLight(0xfff4cc, 0.45, 10);
    lamp2.position.set(x, 6.2, -10.5);
    scene.add(lamp2);
    const head2 = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0xfff4cc }));
    head2.position.set(x, 6.2, -10.5);
    scene.add(head2);
  }

  // cars on the road (static obstacles user can jump on)
  const carMat = new THREE.MeshStandardMaterial({ color: 0x3366aa });
  for (let i = 0; i < 8; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 4.2), carMat);

    // try a few positions and reject placements that overlap existing obstacles
    let placed = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const laneZ = Math.random() > 0.5 ? 2.5 : -2.5;
      const x = -160 + Math.random() * 320; // keep cars mostly in city bounds
      car.position.set(x, 0.5, laneZ);
      car.rotation.y = (Math.random() - 0.5) * 0.2;
      car.updateMatrixWorld(true);
      const carBox = new THREE.Box3().setFromObject(car);

      // check overlap with any existing obstacle box
      let overlaps = false;
      for (const o of obstacles) {
        if (carBox.intersectsBox(o.box)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        addObstacle(car, true); // safe placement
        placed = true;
        break;
      }
    }
    if (!placed) {
      // fallback: place anyway (rare) but keep within road center
      car.position.set((Math.random() - 0.5) * 200, 0.5, Math.random() > 0.5 ? 2.5 : -2.5);
      addObstacle(car, true);
    }
  }
}
createCity();

// ---------- Player / controls ----------
// use document.body for pointer-lock target (works reliably across browsers)
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.getObject().position.set(0, PLAYER_EYE_HEIGHT, 0);

// gun (3D, fixed to camera)
let gun: THREE.Group | null = null;
let gunRecoil = 0; // visual recoil on the gun model
function createGun() {
  gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.62), new THREE.MeshStandardMaterial({ color: 0x262626 }));
  body.position.set(0, -0.05, -0.28);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), new THREE.MeshStandardMaterial({ color: 0x444444 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.18, -0.05, -0.62);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.14), new THREE.MeshStandardMaterial({ color: 0x1f1f1f }));
  grip.position.set(-0.08, -0.15, -0.08);
  gun.add(body, barrel, grip);
  camera.add(gun);
  gun.position.set(0.35, -0.45, -0.8);
}
createGun();

const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('startBtn')!;
const scoreEl = document.getElementById('score')!;
const healthEl = document.getElementById('health')!;
let score = 0;
let health = 100;
let nextMilestone = 100;

function updateScore(amount: number) {
  score += amount;
  scoreEl.textContent = `Score: ${Math.floor(score)}`;
  while (Math.floor(score) >= nextMilestone) {
    difficultyLevel = Math.floor(Math.floor(score) / 100);
    health += 20;
    healthEl.textContent = `Health: ${health}`;
    spawnInterval = Math.max(0.35, 1.2 - difficultyLevel * 0.15);
    nextMilestone += 100;
  }

  // safehouse: spawn at 1000 points, grow every 1000 thereafter
  if (Math.floor(score) >= safehouseMilestone) {
    const safehouseSize = 8 + (Math.floor(Math.floor(score) / 1000) - 1) * 3;
    createSafehouse(safehouseSize);
    safehouseMilestone += 1000;

    // expand city proportionally when safehouse grows
    if (Math.floor(Math.floor(score) / 1000) > 1) {
      // sparse out buildings slightly to reduce lag when city expands
      // (already sparse, just note for future tune)
    }
  }
} 

startBtn.addEventListener('click', (e) => {
  console.log('startBtn clicked — requesting pointer lock');
  (startBtn as HTMLButtonElement).textContent = 'Locking...';
  // attempt native pointer lock first
  controls.lock();
  // if browser blocks pointer lock, enable the fallback after a short delay
  if (pointerLockFallbackTimer) window.clearTimeout(pointerLockFallbackTimer);
  pointerLockFallbackTimer = window.setTimeout(() => {
    if (!controls.isLocked) enableFakePointerLock();
    pointerLockFallbackTimer = null;
  }, 450);
});

// fallback: allow clicking the overlay background or pressing Enter to start the game
overlay.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  if (t && (t.id === 'startBtn' || t === overlay)) {
    console.log('overlay click -> attempting pointer lock');
    (startBtn as HTMLButtonElement).textContent = 'Locking...';
    controls.lock();
    if (pointerLockFallbackTimer) window.clearTimeout(pointerLockFallbackTimer);
    pointerLockFallbackTimer = window.setTimeout(() => {
      if (!controls.isLocked) enableFakePointerLock();
      pointerLockFallbackTimer = null;
    }, 450);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !controls.isLocked && !fakePointerLocked) {
    console.log('Enter pressed -> attempting pointer lock');
    (startBtn as HTMLButtonElement).textContent = 'Locking...';
    controls.lock();
    if (pointerLockFallbackTimer) window.clearTimeout(pointerLockFallbackTimer);
    pointerLockFallbackTimer = window.setTimeout(() => {
      if (!controls.isLocked) enableFakePointerLock();
      pointerLockFallbackTimer = null;
    }, 450);
  }
});

// show pointer lock lifecycle for debugging and restore button text on error/release
document.addEventListener('pointerlockchange', () => {
  console.log('pointerlockchange — element:', document.pointerLockElement, 'controls.isLocked=', controls.isLocked);
  // clear fallback timer when pointer lock changes
  if (pointerLockFallbackTimer) {
    window.clearTimeout(pointerLockFallbackTimer);
    pointerLockFallbackTimer = null;
  }

  // prefer controls.isLocked (works regardless of which element was used for lock)
  if (controls.isLocked) {
    (startBtn as HTMLButtonElement).textContent = 'Locked';
    // if fake fallback somehow active, turn it off
    if (fakePointerLocked) disableFakePointerLock();
  } else {
    (startBtn as HTMLButtonElement).textContent = 'Click to Play (Pointer Lock)';
  }
});
document.addEventListener('pointerlockerror', () => {
  console.error('pointer lock error');
  (startBtn as HTMLButtonElement).textContent = 'Click to Play (Pointer Lock)';
  if (pointerLockFallbackTimer) {
    window.clearTimeout(pointerLockFallbackTimer);
    pointerLockFallbackTimer = null;
  }
  enableFakePointerLock();
});

controls.addEventListener('lock', () => { overlay.classList.add('hidden'); crosshairEl.style.display = 'block'; stabilizePlayerPosition(); resolvePlayerPenetration(); if (pointerLockFallbackTimer) { window.clearTimeout(pointerLockFallbackTimer); pointerLockFallbackTimer = null; } if (fakePointerLocked) disableFakePointerLock(); });
controls.addEventListener('unlock', () => { overlay.classList.remove('hidden'); crosshairEl.style.display = 'none'; aimDotEl.style.display = 'none'; isFiring = false; fireHoldTime = 0; fireTimer = 0; crosshairEl.classList.remove('small'); if (fakePointerLocked) disableFakePointerLock(); });

// movement state
const move = { forward: false, backward: false, left: false, right: false, jump: false };
window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': move.forward = true; break;
    case 'KeyS': move.backward = true; break;
    case 'KeyA': move.left = true; break;
    case 'KeyD': move.right = true; break;
    case 'Space': move.jump = true; break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': move.forward = false; break;
    case 'KeyS': move.backward = false; break;
    case 'KeyA': move.left = false; break;
    case 'KeyD': move.right = false; break;
    case 'Space': move.jump = false; break;
  }
});

// vertical physics for player
let velocityY = 0;
let onGround = false;
let wasOnGround = true;
let cameraBump = 0;
const cameraBaseY = camera.position.y;
const recoil = new THREE.Vector3();

// initial stabilization (must run after velocityY is declared)
stabilizePlayerPosition();
resolvePlayerPenetration();

// ---------- Zombies (AI + spawning + difficulty scaling) ----------
type Zombie = { mesh: THREE.Mesh; speed: number; alive: boolean; hp: number; baseColor?: number; mutant?: boolean };
const zombies: Zombie[] = [];
const zombieGroup = new THREE.Group();
scene.add(zombieGroup);

type Projectile = { mesh: THREE.Mesh; velocity: THREE.Vector3; ttl: number; target?: THREE.Mesh };
const projectiles: Projectile[] = []; 

// Safehouse system
type Safehouse = { mesh: THREE.Group; size: number; doorOpen: boolean; windowPositions: THREE.Vector3[] };
let safehouse: Safehouse | null = null;
let safehouseMilestone = 1000; // next score threshold for safehouse spawn/grow

function createSafehouse(size: number) {
  // remove old safehouse if exists
  if (safehouse) scene.remove(safehouse.mesh);

  const group = new THREE.Group();
  group.position.set(0, 0, 0);

  // hollow cube walls (no floor/ceiling inside for performance)
  const wallThickness = 0.2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a }); // dark interior walls

  // 4 outer walls (front, back, left, right)
  const walls = [
    new THREE.Mesh(new THREE.BoxGeometry(size, size, wallThickness), wallMat), // front
    new THREE.Mesh(new THREE.BoxGeometry(size, size, wallThickness), wallMat), // back
    new THREE.Mesh(new THREE.BoxGeometry(wallThickness, size, size), wallMat), // left
    new THREE.Mesh(new THREE.BoxGeometry(wallThickness, size, size), wallMat), // right
  ];
  walls[0].position.z = size / 2;
  walls[1].position.z = -size / 2;
  walls[2].position.x = -size / 2;
  walls[3].position.x = size / 2;
  walls[0].position.y = size / 2;
  walls[1].position.y = size / 2;
  walls[2].position.y = size / 2;
  walls[3].position.y = size / 2;
  walls.forEach(w => group.add(w));

  // door frame and opening on front wall (left side, visible from inside)
  const doorWidth = size * 0.25;
  const doorHeight = size * 0.5;
  const doorDepth = wallThickness * 0.5;
  
  // door frame (visible border around opening)
  const frameThickness = 0.15;
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + frameThickness * 2, frameThickness, doorDepth), wallMat);
  frameTop.position.set(-size * 0.15, size * 0.3 + doorHeight / 2, 0);
  group.add(frameTop);

  const doorLeft = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, doorHeight + frameThickness * 2, doorDepth), wallMat);
  doorLeft.position.set(-size * 0.15 - doorWidth / 2 - frameThickness / 2, size * 0.3, 0);
  group.add(doorLeft);

  const doorRight = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, doorHeight + frameThickness * 2, doorDepth), wallMat);
  doorRight.position.set(-size * 0.15 + doorWidth / 2 + frameThickness / 2, size * 0.3, 0);
  group.add(doorRight);

  const doorBottom = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + frameThickness * 2, frameThickness, doorDepth), wallMat);
  doorBottom.position.set(-size * 0.15, size * 0.3 - doorHeight / 2, 0);
  group.add(doorBottom);

  // windows: place INSIDE the safehouse walls at head level (visible from inside)
  const windowSize = size * 0.22; // larger windows
  const windowSpacing = size / 2.2;
  const windowPositions: THREE.Vector3[] = [];
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x4da6ff, emissive: 0x1a5c99, transparent: true, opacity: 0.7 });

  // front wall windows (deep inside, looking out to zombies)
  for (let i = -1; i <= 1; i++) {
    const wx = i * windowSpacing;
    const wy = 1.6;
    const wz = (size / 2) - 1.5; // much deeper inside the front wall
    const window = new THREE.Mesh(new THREE.BoxGeometry(windowSize, windowSize, 0.1), windowMat);
    window.position.set(wx, wy, wz);
    group.add(window);
    windowPositions.push(new THREE.Vector3(wx, wy, wz));
  }

  // back wall windows (deep inside)
  for (let i = -1; i <= 1; i++) {
    const wx = i * windowSpacing;
    const wy = 1.6;
    const wz = -(size / 2) + 1.5; // much deeper inside the back wall
    const window = new THREE.Mesh(new THREE.BoxGeometry(windowSize, windowSize, 0.1), windowMat);
    window.position.set(wx, wy, wz);
    group.add(window);
    windowPositions.push(new THREE.Vector3(wx, wy, wz));
  }

  // left wall windows (deep inside)
  for (let i = -1; i <= 1; i++) {
    const wx = -(size / 2) + 1.5;
    const wy = 1.6;
    const wz = i * windowSpacing;
    const window = new THREE.Mesh(new THREE.BoxGeometry(windowSize, windowSize, 0.1), windowMat);
    window.position.set(wx, wy, wz);
    group.add(window);
    windowPositions.push(new THREE.Vector3(wx, wy, wz));
  }

  // right wall windows (deep inside)
  for (let i = -1; i <= 1; i++) {
    const wx = (size / 2) - 1.5;
    const wy = 1.6;
    const wz = i * windowSpacing;
    const window = new THREE.Mesh(new THREE.BoxGeometry(windowSize, windowSize, 0.1), windowMat);
    window.position.set(wx, wy, wz);
    group.add(window);
    windowPositions.push(new THREE.Vector3(wx, wy, wz));
  }

  scene.add(group);
  safehouse = { mesh: group, size, doorOpen: true, windowPositions };
}

function isPlayerInSafehouse(playerPos: THREE.Vector3): boolean {
  if (!safehouse) return false;
  const { size } = safehouse;
  return Math.abs(playerPos.x) < size / 2 - 0.5 && Math.abs(playerPos.z) < size / 2 - 0.5 && playerPos.y < size;
}

// Event / spawn control
let spawnTimer = 0;
let spawnInterval = 1.2; // seconds
let difficultyLevel = 0; // increases every 100 points
let spawnFrozenUntil = 0; // timestamp while spawning is frozen (e.g., after events)

// event scheduling (rare - ~5 minutes)
// Set to `true` only during development. For normal gameplay events should be very rare (~5 minutes).
const DEBUG_QUICK_EVENTS = false; // <-- set false so natural disasters are rare in normal play
const DEBUG_EVENT_DELAY = 3000; // first event after 3s when debugging
let nextEventAt = performance.now() + (DEBUG_QUICK_EVENTS ? DEBUG_EVENT_DELAY : 1000 * (300 + Math.random() * 60));
let eventWarningShown = false;
let currentEvent: null | 'meteor' | 'lava' = null;
let eventEndAt = 0;

// meteor & lava storage
const meteors: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; ttl: number; size: number }> = [];
let lavaMesh: THREE.Mesh | null = null;
let lavaLevel = -100;

function spawnZombie() {
  const now = performance.now();
  if (zombies.length > 60) return;
  if (now < spawnFrozenUntil) return; // respect grace period

  const isMutant = Math.random() < 0.06; // ~6% chance
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const baseColor = isMutant ? 0x8b2d2d : new THREE.Color().setHSL(0.33 + (Math.random() - 0.5) * 0.08, 0.6, 0.35 + Math.random() * 0.05).getHex();
  const mat = new THREE.MeshStandardMaterial({ color: baseColor });
  const m = new THREE.Mesh(geo, mat);
  if (isMutant) {
    m.scale.set(1.6, 1.6, 1.6);
    (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x330000);
  }

  // try to pick a spawn position that's not inside obstacles and not near player
  const playerPos = controls.getObject().position;
  let spawnPos: THREE.Vector3 | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const a = Math.random() * Math.PI * 2;
    const r = SPAWN_MIN_DISTANCE + Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // skip if too near player or outside world bounds
    if (playerPos.distanceTo(new THREE.Vector3(x, playerPos.y, z)) < SPAWN_MIN_DISTANCE) continue;
    if (Math.abs(x) > 190 || Math.abs(z) > 190) continue;
    // skip if near safehouse (zombies can approach it naturally)
    if (safehouse && Math.sqrt(x * x + z * z) < 8) continue;
    if (willCollideAt(x, z, 0, 0.6)) continue; // avoid spawning inside obstacles
    spawnPos = new THREE.Vector3(x, 1, z);
    break;
  }
  if (!spawnPos) {
    const a = Math.random() * Math.PI * 2;
    const r = SPAWN_MIN_DISTANCE + Math.random() * 80;
    spawnPos = new THREE.Vector3(Math.cos(a) * r, 1, Math.sin(a) * r);
  }

  m.position.copy(spawnPos);
  zombieGroup.add(m);
  // base speed (mutants a bit faster and much tougher)
  const base = 1.0 + Math.random() * 0.9;
  const speed = base * (1 + difficultyLevel * 0.2) * (isMutant ? 1.15 : 1);
  const hp = isMutant ? (12 + Math.floor(Math.random() * 8) + difficultyLevel * 3) : (2 + Math.floor(Math.random() * 2) + Math.floor(difficultyLevel * 0.3));
  zombies.push({ mesh: m, speed, alive: true, hp, baseColor, mutant: isMutant });
}  

// ---------- Shooting (raycast) ----------
const raycaster = new THREE.Raycaster();

// firing (hold-to-spray) configuration
let isFiring = false;
let fireHoldTime = 0;
let fireTimer = 0;
const FIRE_RATE_START = 2; // shots / sec initially when holding
const FIRE_RATE_MAX = 14; // cap shots / sec when fully ramped

const crosshairEl = document.getElementById('crosshair')!;
const aimDotEl = document.getElementById('aimDot')!;

// pointer-lock fallback state (if browser blocks pointer lock)
let fakePointerLocked = false;
let _fakeYaw = 0;
let _fakePitch = 0;
let pointerLockFallbackTimer: number | null = null;
const FAKE_LOOK_SENS = 0.0022;
function enableFakePointerLock() {
  fakePointerLocked = true;
  _fakeYaw = controls.getObject().rotation.y;
  _fakePitch = camera.rotation.x;
  overlay.classList.add('hidden');
  crosshairEl.style.display = 'block';
  document.addEventListener('mousemove', onFakeMouseMove);
  document.addEventListener('keydown', onFakeKeyDown);
  console.warn('Pointer-lock blocked — using fallback mouse-look');
}
function disableFakePointerLock() {
  fakePointerLocked = false;
  document.removeEventListener('mousemove', onFakeMouseMove);
  document.removeEventListener('keydown', onFakeKeyDown);
  // show overlay only if pointer lock is not active
  if (!controls.isLocked) overlay.classList.remove('hidden');
  crosshairEl.style.display = controls.isLocked ? 'block' : 'none';
}
function onFakeKeyDown(e: KeyboardEvent) {
  if (e.code === 'Escape') {
    disableFakePointerLock();
  }
}
function onFakeMouseMove(e: MouseEvent) {
  if (!fakePointerLocked) return;
  _fakeYaw -= e.movementX * FAKE_LOOK_SENS;
  _fakePitch -= e.movementY * FAKE_LOOK_SENS;
  _fakePitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _fakePitch));
  controls.getObject().rotation.y = _fakeYaw;
  camera.rotation.x = _fakePitch;
}
window.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return;
  if (e.button !== 0) return; // left button only
  isFiring = true;
  fireHoldTime = 0;
  fireTimer = 0; // immediate shot
  shoot();
  crosshairEl.classList.add('small');
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  isFiring = false;
  fireHoldTime = 0;
  fireTimer = 0;
  crosshairEl.classList.remove('small');
});

// stop firing when pointerlock lost
controls.addEventListener('unlock', () => { isFiring = false; fireHoldTime = 0; fireTimer = 0; crosshairEl.classList.remove('small'); });

function shoot() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = zombies.map(z => z.mesh);
  const hits = raycaster.intersectObjects(targets);
  const playerObj = controls.getObject();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(playerObj.quaternion);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerObj.quaternion);

  // start the projectile from the gun world position if available
  const startPos = gun ? gun.getWorldPosition(new THREE.Vector3()) : playerObj.position.clone().addScaledVector(right, 0.45).add(new THREE.Vector3(0, -0.15, 0));

  if (hits.length > 0) {
    const hit = hits[0];
    const targetMesh = hit.object as THREE.Mesh;
    // visible dart from gun -> target
    spawnProjectile(startPos, hit.point.clone(), targetMesh);
  } else {
    // shoot into the distance
    const forwardPoint = forward.clone().multiplyScalar(80).add(playerObj.position);
    spawnProjectile(startPos, forwardPoint, undefined);
  }

  // small physical & camera recoil
  recoil.addScaledVector(forward, -0.55);
  cameraBump -= 0.02;

  // gun visual recoil (visible weapon kick)
  gunRecoil = Math.min(gunRecoil + 0.28, 1.2);
  // animate crosshair briefly
  crosshairEl.classList.add('small');
  setTimeout(() => crosshairEl.classList.remove('small'), 80);
} 

function killZombie(mesh: THREE.Mesh) {
  const idx = zombies.findIndex(z => z.mesh === mesh);
  if (idx === -1) return;
  const z = zombies[idx];
  if (!z.alive) return;
  z.alive = false;
  z.mesh.material = new THREE.MeshStandardMaterial({ color: 0xff5555 });
  updateScore(10);

  // mutant reward: large health bonus
  if (z.mutant) {
    health += 50;
    healthEl.textContent = `Health: ${health}`;
  }

  setTimeout(() => {
    zombieGroup.remove(z.mesh);
    zombies.splice(idx, 1);
  }, 160);
}

// helper: check if a point is inside any obstacle's box
function pointInsideObstacle(pt: THREE.Vector3) {
  for (const o of obstacles) {
    if (o.box.containsPoint(pt)) return true;
  }
  return false;
}

// ensure player spawns/locks on top of the nearest surface (avoid being inside pavement)
function stabilizePlayerPosition() {
  const player = controls.getObject();

  // if horizontally over an obstacle, place the player on top of it immediately
  const inside = getObstacleAt(player.position.x, player.position.z, PLAYER_RADIUS);
  if (inside) {
    player.position.y = inside.top + PLAYER_EYE_HEIGHT + 0.02;
    velocityY = 0;
    return;
  }

  // otherwise snap to the surface below (ground / sidewalk)
  const surface = getSurfaceBelow(player.position, 6);
  if (surface) {
    player.position.y = surface.point.y + PLAYER_EYE_HEIGHT + 0.02;
  } else {
    player.position.y = PLAYER_EYE_HEIGHT + 0.02;
  }
}

// if player is inside an obstacle, attempt to resolve by moving up (if climbable) or nudging away
function resolvePlayerPenetration() {
  const player = controls.getObject();
  const inside = getObstacleAt(player.position.x, player.position.z, PLAYER_RADIUS);
  if (!inside) return;
  const footY = player.position.y - PLAYER_EYE_HEIGHT;

  // If player's feet are below the obstacle top, push them up onto the surface (fix spawn-inside)
  if (footY < inside.top + 0.05) {
    player.position.y = inside.top + PLAYER_EYE_HEIGHT + 0.02;
    velocityY = Math.max(0, velocityY);
    return;
  }

  // small-step handling for climbable surfaces
  if (inside.isCar && inside.top <= footY + STEP_HEIGHT_CAR) {
    player.position.y = inside.top + PLAYER_EYE_HEIGHT + 0.02;
    return;
  }
  if (inside.top <= footY + STEP_HEIGHT) {
    player.position.y = inside.top + PLAYER_EYE_HEIGHT + 0.02;
    return;
  }

  // robust push-out: compute X / Z overlap and move along the shallow axis
  const pxMin = player.position.x - PLAYER_RADIUS;
  const pxMax = player.position.x + PLAYER_RADIUS;
  const pzMin = player.position.z - PLAYER_RADIUS;
  const pzMax = player.position.z + PLAYER_RADIUS;

  const overlapX = Math.max(0, Math.min(pxMax, inside.box.max.x) - Math.max(pxMin, inside.box.min.x));
  const overlapZ = Math.max(0, Math.min(pzMax, inside.box.max.z) - Math.max(pzMin, inside.box.min.z));

  if (overlapX > 0 || overlapZ > 0) {
    if (overlapX <= overlapZ) {
      // push horizontally along X
      const centerX = (inside.box.min.x + inside.box.max.x) * 0.5;
      const dir = player.position.x >= centerX ? 1 : -1;
      player.position.x += dir * (overlapX + PLAYER_RADIUS + 0.08);
    } else {
      // push along Z
      const centerZ = (inside.box.min.z + inside.box.max.z) * 0.5;
      const dir = player.position.z >= centerZ ? 1 : -1;
      player.position.z += dir * (overlapZ + PLAYER_RADIUS + 0.08);
    }
  } else {
    // last-resort nudge
    const centerX = (inside.box.min.x + inside.box.max.x) * 0.5;
    const pushDir = player.position.x >= centerX ? 1 : -1;
    player.position.x += pushDir * (PLAYER_RADIUS + 0.6);
  }
}

// spawn a visible, fast dart that travels from `from` toward `to` (optional target mesh)
function spawnProjectile(from: THREE.Vector3, to: THREE.Vector3, target?: THREE.Mesh) {
  const dir = to.clone().sub(from).normalize();
  const speed = 80;
  const geom = new THREE.BoxGeometry(0.18, 0.05, 0.05);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffee99, emissive: 0xffee99 });
  const m = new THREE.Mesh(geom, mat);

  // ensure projectile doesn't start buried inside geometry (nudge forward)
  const start = from.clone();
  if (pointInsideObstacle(start)) {
    const nudge = dir.clone().multiplyScalar(0.6);
    start.add(nudge);
  }

  m.position.copy(start);
  scene.add(m);
  projectiles.push({ mesh: m, velocity: dir.multiplyScalar(speed), ttl: 2.0, target });
}

// decrement zombie HP; call kill when HP <= 0
function damageZombie(mesh: THREE.Mesh, amount = 1) {
  const idx = zombies.findIndex(z => z.mesh === mesh);
  if (idx === -1) return;
  const z = zombies[idx];
  if (!z.alive) return;
  z.hp -= amount;
  // brief hit flash
  (z.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xff9955);
  setTimeout(() => {
    (z.mesh.material as THREE.MeshStandardMaterial).color.setHex(z.baseColor || 0x6abf6b);
  }, 120);
  if (z.hp <= 0) {
    killZombie(mesh);
  }
}


// ---------- Collision helpers ----------
function pointWithinBoxXZ(x: number, z: number, box: THREE.Box3, radius = 0) {
  return (x + radius) >= box.min.x && (x - radius) <= box.max.x && (z + radius) >= box.min.z && (z - radius) <= box.max.z;
}

function willCollideAt(x: number, z: number, footY: number, radius = PLAYER_RADIUS) {
  for (const o of obstacles) {
    if (!pointWithinBoxXZ(x, z, o.box, radius)) continue;
    // allow tiny obstacles (pavements) to be stepped onto automatically
    if (o.top <= footY + STEP_HEIGHT) continue;
    return true;
  }
  return false;
}

// return the obstacle at XZ (if any)
function getObstacleAt(x: number, z: number, radius = PLAYER_RADIUS) {
  for (const o of obstacles) {
    if (pointWithinBoxXZ(x, z, o.box, radius)) return o;
  }
  return undefined;
}

// return the highest obstacle top (or ground.y) at the given XZ
function getHighestSurfaceYAt(x: number, z: number) {
  let topY = ground.position.y;
  for (const o of obstacles) {
    if (pointWithinBoxXZ(x, z, o.box, 0)) {
      topY = Math.max(topY, o.top);
    }
  }
  return topY;
}

// get surface under player (ground or top of obstacle)
const downRay = new THREE.Raycaster();
function getSurfaceBelow(position: THREE.Vector3, maxDistance = 3) {
  // cast downward from slightly above the camera to avoid 'inside-mesh' misses
  const origin = position.clone().add(new THREE.Vector3(0, 0.06, 0));
  downRay.set(origin, new THREE.Vector3(0, -1, 0));
  const meshes = [ground, ...obstacles.map(o => o.mesh)];
  const hits = downRay.intersectObjects(meshes, true);
  if (hits.length === 0) return null;
  if (hits[0].distance > maxDistance) return null;
  return hits[0];
}

// ---- Event helpers ----
function scheduleNextEvent() {
  const now = performance.now();
  if (DEBUG_QUICK_EVENTS) {
    // short, repeatable interval for development/testing
    nextEventAt = now + 8000 + Math.random() * 8000; // 8-16s
  } else {
    // rare: ~5 minutes ± 60s
    nextEventAt = now + 1000 * (300 + Math.random() * 60);
  }
  eventWarningShown = false;
  currentEvent = null;
}

function startMeteorEvent() {
  // spawn a burst of meteors falling from the sky
  const count = 20 + Math.floor(Math.random() * 20);
  for (let i = 0; i < count; i++) {
    const size = 0.6 + Math.random() * 1.4;
    const geom = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({ color: 0x442222, emissive: 0x993322 });
    const mesh = new THREE.Mesh(geom, mat);
    const x = (Math.random() - 0.5) * 300;
    const z = (Math.random() - 0.5) * 300;
    const y = 60 + Math.random() * 80;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const vx = (Math.random() - 0.5) * 6;
    const vz = (Math.random() - 0.5) * 6;
    const vy = - (20 + Math.random() * 40);
    meteors.push({ mesh, velocity: new THREE.Vector3(vx, vy, vz), ttl: 8.0, size });
  }
}

function updateMeteorEvent(delta: number) {
  const player = controls.getObject();
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.mesh.position.addScaledVector(m.velocity, delta);
    m.ttl -= delta;

    // in-flight collisions (meteor can hit zombies/player before ground impact)
    for (let j = zombies.length - 1; j >= 0; j--) {
      const z = zombies[j];
      const dist = z.mesh.position.distanceTo(m.mesh.position);
      if (dist < (m.size * 0.9 + 0.9)) {
        z.alive = false;
        zombieGroup.remove(z.mesh);
        zombies.splice(j, 1);
        updateScore(5);
      }
    }
    if (player.position.distanceTo(m.mesh.position) < (m.size + 0.9)) {
      health = 0;
      healthEl.textContent = `Health: ${health}`;
      gameOver();
      // remove meteor on player-hit
      scene.remove(m.mesh);
      meteors.splice(i, 1);
      continue;
    }

    // hit ground / TTL expiry -> explosion effect
    if (m.mesh.position.y <= 0.5 || m.ttl <= 0) {
      const pos = m.mesh.position.clone();
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (z.mesh.position.distanceTo(pos) < 4.0) {
          z.alive = false;
          zombieGroup.remove(z.mesh);
          zombies.splice(j, 1);
          updateScore(5);
        }
      }
      if (player.position.distanceTo(pos) < 2.0) {
        health = 0;
        healthEl.textContent = `Health: ${health}`;
        gameOver();
      }
      scene.remove(m.mesh);
      meteors.splice(i, 1);
    }
  }

  // finish event after meteors cleared or when timer expires
  if (meteors.length === 0 && performance.now() >= eventEndAt) {
    endEvent();
  }
}

function startLavaEvent() {
  // create lava plane and start rising
  const geom = new THREE.PlaneGeometry(1000, 1000);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff4a33, emissive: 0xff5533, transparent: true, opacity: 0.85 });
  lavaMesh = new THREE.Mesh(geom, mat);
  lavaMesh.rotation.x = -Math.PI / 2;
  lavaMesh.position.set(0, -50, 0);
  scene.add(lavaMesh);
  lavaLevel = -50;
  // target is the maximum car top (if any) else 0.9
  const carTops = obstacles.filter(o => o.isCar).map(o => o.top);
  const maxCarTop = carTops.length ? Math.max(...carTops) : 1.0;
  (lavaMesh.userData as any).targetY = Math.max(maxCarTop - 0.05, 0.9);
}

function updateLavaEvent(delta: number) {
  if (!lavaMesh) return;
  const targetY = (lavaMesh.userData as any).targetY as number;
  // rise speed
  lavaLevel = THREE.MathUtils.lerp(lavaLevel, targetY, Math.min(1, delta * 0.35 * 10));
  lavaMesh.position.y = lavaLevel;

  // kill zombies standing in the lava
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.mesh.position.y <= lavaLevel + 0.15) {
      z.alive = false;
      zombieGroup.remove(z.mesh);
      zombies.splice(i, 1);
      updateScore(3);
    }
  }

  // player touch check (feet)
  const player = controls.getObject();
  const feetY = player.position.y - PLAYER_EYE_HEIGHT;
  if (feetY <= lavaLevel + 0.15) {
    health = 0;
    healthEl.textContent = `Health: ${health}`;
    gameOver();
  }

  // after event end, remove lava
  if (performance.now() >= eventEndAt) {
    endEvent();
  }
}

function endEvent() {
  // clear meteors
  meteors.forEach(m => scene.remove(m.mesh));
  meteors.length = 0;
  // remove lava
  if (lavaMesh) scene.remove(lavaMesh);
  lavaMesh = null;
  lavaLevel = -100;

  // set 5s grace period for spawns
  spawnFrozenUntil = performance.now() + 5000;
  // schedule next event
  scheduleNextEvent();
  currentEvent = null;
  (document.getElementById('eventMsg') as HTMLElement).style.display = 'none';
}

// ---------- Game loop ----------
let prevTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const time = performance.now();
  const delta = Math.min(0.05, (time - prevTime) / 1000);

  // check for upcoming event warning
  if (!eventWarningShown && time >= nextEventAt - 10000) {
    // show 10s warning
    eventWarningShown = true;
    const evt = Math.random() < 0.5 ? 'meteor' : 'lava';
    (document.getElementById('eventMsg') as HTMLElement).textContent = `${evt === 'meteor' ? 'Meteor shower' : 'Lava eruption'} incoming in 10s — find shelter!`;
    (document.getElementById('eventMsg') as HTMLElement).classList.add('warn');
    (document.getElementById('eventMsg') as HTMLElement).style.display = 'block';
    setTimeout(() => {
      (document.getElementById('eventMsg') as HTMLElement).style.display = 'none';
    }, 9000);
  }

  // start event if it's time
  if (!currentEvent && time >= nextEventAt) {
    // pick event
    currentEvent = Math.random() < 0.5 ? 'meteor' : 'lava';
    eventEndAt = time + 10000; // events last ~10s active phase (meteors rain / lava rise)
    eventWarningShown = false;
    // freeze zombie spawning for the duration + a 5s grace period after
    spawnFrozenUntil = eventEndAt + 5000;

    (document.getElementById('eventMsg') as HTMLElement).textContent = `${currentEvent === 'meteor' ? 'Meteor shower' : 'Lava eruption'} — active!`;
    (document.getElementById('eventMsg') as HTMLElement).classList.remove('warn');
    (document.getElementById('eventMsg') as HTMLElement).style.display = 'block';

    if (currentEvent === 'meteor') startMeteorEvent();
    else startLavaEvent();
  }

  // handle active event updates
  if (currentEvent === 'meteor') updateMeteorEvent(delta);
  if (currentEvent === 'lava') updateLavaEvent(delta);

  // passive score: +5 points per second
  updateScore(5 * delta);

  // handle hold-to-fire (spray) while mouse is held
  if (isFiring && controls.isLocked) {
    fireHoldTime += delta;
    const shotsPerSec = Math.min(FIRE_RATE_START + fireHoldTime * 3.5, FIRE_RATE_MAX);
    fireTimer -= delta;
    if (fireTimer <= 0) {
      shoot();
      fireTimer = 1 / shotsPerSec;
    }
  }

  // update aim-dot (predict where center ray will hit)
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const aimHits = raycaster.intersectObjects([...zombies.map(z => z.mesh), ...obstacles.map(o => o.mesh), ground], true);
  if (aimHits.length > 0) {
    const hitPoint = aimHits[0].point.clone().project(camera);
    const sx = (hitPoint.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-hitPoint.y * 0.5 + 0.5) * window.innerHeight;
    aimDotEl.style.left = `${sx}px`;
    aimDotEl.style.top = `${sy}px`;
    aimDotEl.style.display = 'block';
    const isEnemy = zombies.some(z => z.mesh === aimHits[0].object);
    aimDotEl.classList.toggle('enemy', isEnemy);
  } else {
    aimDotEl.style.display = 'none';
  }

  // update projectiles (move, check hits)
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.ttl -= delta;
    let hit = false;
    if (p.target) {
      if (p.target.parent && p.mesh.position.distanceTo(p.target.position) < 1.0) {
        damageZombie(p.target, 1);
        hit = true;
      }
    } else {
      for (const z of zombies) {
        if (!z.alive) continue;
        if (p.mesh.position.distanceTo(z.mesh.position) < 0.9) {
          damageZombie(z.mesh, 1);
          hit = true;
          break;
        }
      }
    }
    if (hit || p.ttl <= 0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }

  // spawn timer
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnZombie();
    spawnTimer = spawnInterval * (0.6 + Math.random() * 0.8);
  }

  // ----- player horizontal movement with collision -----
  const playerSpeed = BASE_PLAYER_SPEED * (1 + difficultyLevel * 0.06); // player gets slightly faster per milestone
  let moveX = 0, moveZ = 0;
  if (move.forward) moveZ += playerSpeed; // FIXED: W moves forward
  if (move.backward) moveZ -= playerSpeed;
  if (move.left) moveX -= playerSpeed;
  if (move.right) moveX += playerSpeed;

  // compute desired displacement in world space
  const euler = controls.getObject().quaternion;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(euler);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(euler);
  const desired = new THREE.Vector3();
  desired.addScaledVector(forward, moveZ * delta);
  desired.addScaledVector(right, moveX * delta);

  // per-axis collision handling (XZ) with safety fallback to avoid tunneling
  const playerObj = controls.getObject();
  const prevPos = playerObj.position.clone();
  const newPosX = playerObj.position.x + desired.x;
  const newPosZ = playerObj.position.z + desired.z;
  const footY = playerObj.position.y - PLAYER_EYE_HEIGHT; // player's feet y

  // X-axis test with automatic small-step and car special-case
  const obsX = getObstacleAt(newPosX, playerObj.position.z, PLAYER_RADIUS);
  if (!obsX) {
    playerObj.position.x = newPosX;
  } else if (obsX.isCar && obsX.top <= footY + STEP_HEIGHT_CAR) {
    // step up onto car
    playerObj.position.x = newPosX;
    playerObj.position.y = Math.max(playerObj.position.y, obsX.top + PLAYER_EYE_HEIGHT);
  } else if (obsX.top <= footY + STEP_HEIGHT) {
    // step up onto low obstacle (pavement)
    playerObj.position.x = newPosX;
    playerObj.position.y = Math.max(playerObj.position.y, obsX.top + PLAYER_EYE_HEIGHT);
  }
  // Z-axis test with automatic small-step and car special-case
  const obsZ = getObstacleAt(playerObj.position.x, newPosZ, PLAYER_RADIUS);
  if (!obsZ) {
    playerObj.position.z = newPosZ;
  } else if (obsZ.isCar && obsZ.top <= footY + STEP_HEIGHT_CAR) {
    playerObj.position.z = newPosZ;
    playerObj.position.y = Math.max(playerObj.position.y, obsZ.top + PLAYER_EYE_HEIGHT);
  } else if (obsZ.top <= footY + STEP_HEIGHT) {
    playerObj.position.z = newPosZ;
    playerObj.position.y = Math.max(playerObj.position.y, obsZ.top + PLAYER_EYE_HEIGHT);
  }

  // fail-safe: robust AABB overlap test to prevent walking *through* obstacles (cars/buildings)
  // build a small player AABB (feet -> slightly above eye) and test against obstacle boxes
  const playerBox = new THREE.Box3(
    new THREE.Vector3(playerObj.position.x - PLAYER_RADIUS, playerObj.position.y - PLAYER_EYE_HEIGHT - 0.1, playerObj.position.z - PLAYER_RADIUS),
    new THREE.Vector3(playerObj.position.x + PLAYER_RADIUS, playerObj.position.y - PLAYER_EYE_HEIGHT + (PLAYER_EYE_HEIGHT * 0.6), playerObj.position.z + PLAYER_RADIUS)
  );

  let collided = false;
  for (const o of obstacles) {
    if (playerBox.intersectsBox(o.box)) {
      collided = true;
      // if climbable (pavement or car), push player up onto the surface
      if (o.isCar && o.top <= footY + STEP_HEIGHT_CAR + 0.05) {
        playerObj.position.y = Math.max(playerObj.position.y, o.top + PLAYER_EYE_HEIGHT + 0.02);
        velocityY = Math.max(0, velocityY);
      } else if (o.top <= footY + STEP_HEIGHT + 0.05) {
        playerObj.position.y = Math.max(playerObj.position.y, o.top + PLAYER_EYE_HEIGHT + 0.02);
        velocityY = Math.max(0, velocityY);
      } else {
        // un-climbable obstacle: revert to previous safe position
        playerObj.position.copy(prevPos);
      }
      break; // we resolved the collision for this frame
    }
  }

  // if no AABB collision found, keep previous behavior check (legacy catch-all)
  if (!collided) {
    const inside = getObstacleAt(playerObj.position.x, playerObj.position.z, PLAYER_RADIUS);
    if (inside && !(inside.top <= footY + STEP_HEIGHT || (inside.isCar && inside.top <= footY + STEP_HEIGHT_CAR))) {
      playerObj.position.copy(prevPos);
    }
  }

  // ensure we haven't ended up intersecting any obstacle — try to resolve penetration immediately
  resolvePlayerPenetration();

  // ----- vertical (jump + gravity) -----
  // determine the highest surface under the player using both raycast *and* obstacle boxes
  const raySurface = getSurfaceBelow(playerObj.position, 3);
  const rayY = raySurface ? raySurface.point.y : -Infinity;
  const boxY = getHighestSurfaceYAt(playerObj.position.x, playerObj.position.z);
  const surfaceY = Math.max(rayY, boxY);

  const clientFeetY = playerObj.position.y - PLAYER_EYE_HEIGHT;

  // if player's feet are near or below the detected surface, snap to it (handles stepping back up reliably)
  const SNAP_THRESHOLD = 0.22; // tolerate small gaps when stepping up
  if (surfaceY !== -Infinity && clientFeetY <= surfaceY + SNAP_THRESHOLD) {
    onGround = true;
    velocityY = Math.max(0, velocityY);
    playerObj.position.y = surfaceY + PLAYER_EYE_HEIGHT;
  } else {
    onGround = false;
  }

  // landing camera punch
  if (!wasOnGround && onGround) {
    cameraBump = -0.14;
  }
  wasOnGround = onGround; 

  // allow jump if on ground or *very close* to a surface (helps responsiveness when stepping/jumping)
  if (move.jump && (onGround || (raySurface && raySurface.distance <= 0.18))) {
    // normal jump impulse
    velocityY = JUMP_SPEED;
    onGround = false;
    cameraBump = 0.12; // small lift on jump

    // immediate vault attempt: if there's a climbable obstacle just ahead and within vault reach,
    // snap up onto it so jumping onto car roofs is reliable even on low-frame/TCP input.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controls.getObject().quaternion).setY(0).normalize();
    const probe = controls.getObject().position.clone().addScaledVector(forward, 0.9);
    const obstacleAhead = getObstacleAt(probe.x, probe.z, PLAYER_RADIUS + 0.4);
    if (obstacleAhead) {
      const feetY = controls.getObject().position.y - PLAYER_EYE_HEIGHT;
      const vaultReach = 1.6; // slightly more forgiving vault reach for immediate snap
      if (obstacleAhead.top <= feetY + vaultReach) {
        // place player cleanly on top and cancel upward jitter
        controls.getObject().position.y = obstacleAhead.top + PLAYER_EYE_HEIGHT + 0.02;
        velocityY = 0.8; // small upward remainder for natural arc
        onGround = true;
        // ensure we don't immediately fall through or get stuck
        resolvePlayerPenetration();
        stabilizePlayerPosition();
        // short visual feedback
        cameraBump = -0.06;
      }
    }
  }

  // apply gravity
  velocityY += GRAVITY * delta;
  playerObj.position.y += velocityY * delta;

  // vault-on-jump: if player is ascending and there is a climbable obstacle directly ahead,
  // allow the jump to vault the player up onto the obstacle top (helpful for car roofs)
  if (velocityY > 0.6) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controls.getObject().quaternion).setY(0).normalize();
    const probe = playerObj.position.clone().addScaledVector(forward, 0.9);
    const obstacleAhead = getObstacleAt(probe.x, probe.z, PLAYER_RADIUS + 0.3);
    if (obstacleAhead) {
      const feetAfterJump = playerObj.position.y - PLAYER_EYE_HEIGHT;
      const vaultReach = 1.4; // how high we can vault onto
      if (obstacleAhead.top <= feetAfterJump + vaultReach) {
        // snap player onto obstacle top and reduce vertical jitter so they land cleanly
        playerObj.position.y = Math.max(playerObj.position.y, obstacleAhead.top + PLAYER_EYE_HEIGHT + 0.02);
        velocityY = Math.min(velocityY, 1.2);
        onGround = true;
      }
    }
  }

  // prevent falling below ground
  if (playerObj.position.y < PLAYER_EYE_HEIGHT) {
    playerObj.position.y = PLAYER_EYE_HEIGHT;
    velocityY = 0;
    onGround = true;
  }

  // ----- zombies update (movement + collisions + attacks) -----
  const playerPos = playerObj.position.clone();
  const playerInSafehouse = safehouse ? isPlayerInSafehouse(playerPos) : false;

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z.alive) continue;
    const pos = z.mesh.position;

    // determine target: player always prioritized, but safehouse also targeted if player inside
    let target = playerPos.clone();
    let targetDist = playerPos.distanceTo(pos);
    let targetType: 'player' | 'safehouse' = 'player';

    // only attract to safehouse if player is inside it (not just existing)
    if (playerInSafehouse && safehouse) {
      const safehouseTarget = safehouse.mesh.position.clone();
      const safehouseDist = safehouseTarget.distanceTo(pos);
      const keepoutDistance = safehouse.size * 0.7; // stay back at reasonable distance
      
      // if closer than keepout zone, zombies stop moving toward it
      if (safehouseDist > keepoutDistance) {
        // still outside keepout: move toward safehouse
        target = safehouseTarget;
        targetDist = safehouseDist;
        targetType = 'safehouse';
      } else {
        // inside keepout zone: stay still (stop attacking/moving)
        targetDist = 0;
        targetType = 'safehouse';
      }
    }

    const dir = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
    if (dir.length() > 0.001) dir.normalize();

    // slowdown near safehouse only when player is inside
    let speedMult = 1.0;
    if (playerInSafehouse && targetType === 'safehouse' && safehouse) {
      const distToSafehouse = safehouse.mesh.position.distanceTo(pos);
      const slowdownRange = safehouse.size * 1.5;
      if (distToSafehouse < slowdownRange) {
        // approach slowly, exponential slowdown
        speedMult = Math.max(0.05, Math.pow(distToSafehouse / slowdownRange, 2));
      }
    }

    // attempt movement with collision blocking
    const desiredZPos = pos.clone().addScaledVector(dir, z.speed * speedMult * delta * 2);
    // per-axis check for zombie (foot at y=0)
    if (!willCollideAt(desiredZPos.x, pos.z, 0, 0.5)) pos.x = desiredZPos.x;
    if (!willCollideAt(pos.x, desiredZPos.z, 0, 0.5)) pos.z = desiredZPos.z;

    z.mesh.lookAt(target.x, z.mesh.position.y, target.z);

    // attack only if targeting player and close enough
    if (targetType === 'player' && targetDist < 1.6) {
      let dmg = 12 + difficultyLevel * 6;
      if ((z as any).mutant) dmg = Math.floor(dmg * 2.2);
      health -= dmg;
      healthEl.textContent = `Health: ${health}`;

      const pushForce = 1 + difficultyLevel * 0.6 + ((z as any).mutant ? 1.2 : 0);
      const push = new THREE.Vector3().subVectors(playerPos, pos).setY(0).normalize().multiplyScalar(pushForce);
      const attemptedX = playerObj.position.x + push.x;
      const attemptedZ = playerObj.position.z + push.z;
      const attemptedFootY = playerObj.position.y - PLAYER_EYE_HEIGHT;
      if (!willCollideAt(attemptedX, playerObj.position.z, attemptedFootY)) playerObj.position.x = attemptedX;
      if (!willCollideAt(playerObj.position.x, attemptedZ, attemptedFootY)) playerObj.position.z = attemptedZ;

      z.alive = false;
      zombieGroup.remove(z.mesh);
      zombies.splice(i, 1);

      if (health <= 0) {
        gameOver();
      }
    }

    // prevent zombies from entering safehouse
    if (safehouse && isPlayerInSafehouse(playerPos) !== isPlayerInSafehouse(pos)) {
      let centerDist = new THREE.Vector3(pos.x, 0, pos.z).length();
      if (centerDist < 0.1) centerDist = 0.1;
      const pushOut = safehouse.size + 1;
      const angle = Math.atan2(pos.z, pos.x);
      pos.x = Math.cos(angle) * pushOut;
      pos.z = Math.sin(angle) * pushOut;
    }
  }

  // camera bump & recoil decay (visuals)
  camera.position.y = cameraBaseY + cameraBump;
  cameraBump = THREE.MathUtils.lerp(cameraBump, 0, delta * 6);
  if (recoil.lengthSq() > 1e-6) {
    controls.getObject().position.addScaledVector(recoil, delta);
    recoil.multiplyScalar(Math.max(0, 1 - delta * 8));
  }
  // gun recoil animation
  if (gun) {
    gunRecoil = THREE.MathUtils.lerp(gunRecoil, 0, delta * 8);
    gun.position.z = THREE.MathUtils.lerp(gun.position.z, -0.8 + gunRecoil, delta * 12);
    gun.position.x = THREE.MathUtils.lerp(gun.position.x, 0.35, delta * 10);
  }

  prevTime = time;
  renderer.render(scene, camera);
}

function gameOver() {
  overlay.classList.remove('hidden');
  (overlay.querySelector('#title') as HTMLElement).textContent = 'Game Over';
  (startBtn as HTMLButtonElement).textContent = 'Restart';
  controls.unlock();
  startBtn.onclick = () => {
    // cleanup
    zombies.forEach(z => zombieGroup.remove(z.mesh));
    zombies.length = 0;
    score = 0;
    health = 100;
    difficultyLevel = 0;
    spawnInterval = 1.2;
    nextMilestone = 100;
    scoreEl.textContent = `Score: ${score}`;
    healthEl.textContent = `Health: ${health}`;
    (overlay.querySelector('#title') as HTMLElement).textContent = 'FPS Zombie';
    (startBtn as HTMLButtonElement).textContent = 'Click to Play (Pointer Lock)';
    // reset player position and make sure we are not inside geometry
    controls.getObject().position.set(0, PLAYER_EYE_HEIGHT, 0);
    velocityY = 0;
    stabilizePlayerPosition();
    resolvePlayerPenetration();

    startBtn.onclick = () => controls.lock();
  };
}

// ----- resize -----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// start loop
animate();
