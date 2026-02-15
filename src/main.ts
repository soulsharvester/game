import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

// ---------- Constants / player physics ----------
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const GRAVITY = -30;
const JUMP_SPEED = 8;
const STEP_HEIGHT = 0.45; // automatic small-step height for pavements
const BASE_PLAYER_SPEED = 6; // base running speed (increases slightly with score)

// ---------- Basic scene / camera / renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111218);
// fog to hide far geometry and help performance when city is large
scene.fog = new THREE.Fog(0x111218, 60, 140);

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
      if (Math.random() > 0.6) continue; // sparse out distant blocks for performance

      const w = 8 + Math.random() * 12;
      const d = 8 + Math.random() * 12;
      const h = 6 + Math.random() * 40; // tall buildings
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
    const laneZ = Math.random() > 0.5 ? 2.5 : -2.5;
    const x = (Math.random() - 0.5) * 300;
    car.position.set(x, 0.5, laneZ);
    car.rotation.y = (Math.random() - 0.5) * 0.2;
    addObstacle(car, true); // mark as car (player may stand on it)
  }
}
createCity();

// ---------- Player / controls ----------
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.getObject().position.set(0, PLAYER_EYE_HEIGHT, 0);

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
} 

startBtn.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

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

// ---------- Zombies (AI + spawning + difficulty scaling) ----------
type Zombie = { mesh: THREE.Mesh; speed: number; alive: boolean; hp: number; baseColor?: number; mutant?: boolean };
const zombies: Zombie[] = [];
const zombieGroup = new THREE.Group();
scene.add(zombieGroup);

type Projectile = { mesh: THREE.Mesh; velocity: THREE.Vector3; ttl: number; target?: THREE.Mesh };
const projectiles: Projectile[] = []; 

let spawnTimer = 0;
let spawnInterval = 1.2; // seconds
let difficultyLevel = 0; // increases every 100 points

function spawnZombie() {
  if (zombies.length > 60) return;
  const isMutant = Math.random() < 0.06; // ~6% chance
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const baseColor = isMutant ? 0x8b2d2d : new THREE.Color().setHSL(0.33 + (Math.random() - 0.5) * 0.08, 0.6, 0.35 + Math.random() * 0.05).getHex();
  const mat = new THREE.MeshStandardMaterial({ color: baseColor });
  const m = new THREE.Mesh(geo, mat);
  if (isMutant) {
    m.scale.set(1.6, 1.6, 1.6);
    (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x330000);
  }
  const r = 20 + Math.random() * 80;
  const a = Math.random() * Math.PI * 2;
  m.position.set(Math.cos(a) * r, 1, Math.sin(a) * r);
  zombieGroup.add(m);
  // base speed (mutants a bit faster and much tougher)
  const base = 1.0 + Math.random() * 0.9;
  const speed = base * (1 + difficultyLevel * 0.2) * (isMutant ? 1.15 : 1);
  const hp = isMutant ? (12 + Math.floor(Math.random() * 8) + difficultyLevel * 3) : (2 + Math.floor(Math.random() * 2) + Math.floor(difficultyLevel * 0.3));
  zombies.push({ mesh: m, speed, alive: true, hp, baseColor, mutant: isMutant });
}  

// ---------- Shooting (raycast) ----------
const raycaster = new THREE.Raycaster();
window.addEventListener('mousedown', () => {
  if (!controls.isLocked) return;
  shoot();
});

function shoot() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = zombies.map(z => z.mesh);
  const hits = raycaster.intersectObjects(targets);
  const playerObj = controls.getObject();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(playerObj.quaternion);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerObj.quaternion);
  const startPos = playerObj.position.clone().addScaledVector(right, 0.45).add(new THREE.Vector3(0, -0.15, 0));

  if (hits.length > 0) {
    const hit = hits[0];
    const targetMesh = hit.object as THREE.Mesh;
    // visible dart from player's right side -> target
    spawnProjectile(startPos, hit.point.clone(), targetMesh);
  } else {
    // shoot into the distance
    const forwardPoint = forward.clone().multiplyScalar(80).add(playerObj.position);
    spawnProjectile(startPos, forwardPoint, undefined);
  }

  // small physical & camera recoil
  recoil.addScaledVector(forward, -0.55);
  cameraBump -= 0.02;
} 

function killZombie(mesh: THREE.Mesh) {
  const idx = zombies.findIndex(z => z.mesh === mesh);
  if (idx === -1) return;
  const z = zombies[idx];
  if (!z.alive) return;
  z.alive = false;
  z.mesh.material = new THREE.MeshStandardMaterial({ color: 0xff5555 });
  updateScore(10);

  setTimeout(() => {
    zombieGroup.remove(z.mesh);
    zombies.splice(idx, 1);
  }, 160);
}

// spawn a visible, fast dart that travels from `from` toward `to` (optional target mesh)
function spawnProjectile(from: THREE.Vector3, to: THREE.Vector3, target?: THREE.Mesh) {
  const dir = to.clone().sub(from).normalize();
  const speed = 80;
  const geom = new THREE.BoxGeometry(0.18, 0.05, 0.05);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffee99, emissive: 0xffee99 });
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(from);
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

// get surface under player (ground or top of obstacle)
const downRay = new THREE.Raycaster();
function getSurfaceBelow(position: THREE.Vector3, maxDistance = 3) {
  downRay.set(position, new THREE.Vector3(0, -1, 0));
  const meshes = [ground, ...obstacles.map(o => o.mesh)];
  const hits = downRay.intersectObjects(meshes, true);
  if (hits.length === 0) return null;
  return hits[0];
}

// ---------- Game loop ----------
let prevTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const time = performance.now();
  const delta = Math.min(0.05, (time - prevTime) / 1000);

  // passive score: +5 points per second
  updateScore(5 * delta);

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

  // per-axis collision handling (XZ)
  const playerObj = controls.getObject();
  const newPosX = playerObj.position.x + desired.x;
  const newPosZ = playerObj.position.z + desired.z;
  const footY = playerObj.position.y - PLAYER_EYE_HEIGHT; // player's feet y

  // X-axis test with automatic small-step
  const obsX = getObstacleAt(newPosX, playerObj.position.z, PLAYER_RADIUS);
  if (!obsX) {
    playerObj.position.x = newPosX;
  } else if (obsX.top <= footY + STEP_HEIGHT) {
    // step up onto low obstacle (pavement)
    playerObj.position.x = newPosX;
    playerObj.position.y = Math.max(playerObj.position.y, obsX.top + PLAYER_EYE_HEIGHT);
  }
  // Z-axis test with automatic small-step
  const obsZ = getObstacleAt(playerObj.position.x, newPosZ, PLAYER_RADIUS);
  if (!obsZ) {
    playerObj.position.z = newPosZ;
  } else if (obsZ.top <= footY + STEP_HEIGHT) {
    playerObj.position.z = newPosZ;
    playerObj.position.y = Math.max(playerObj.position.y, obsZ.top + PLAYER_EYE_HEIGHT);
  }

  // ----- vertical (jump + gravity) -----
  const surface = getSurfaceBelow(playerObj.position, 3);
  const clientFeetY = playerObj.position.y - PLAYER_EYE_HEIGHT;
  if (surface && surface.point.y + 0.01 >= clientFeetY - 0.01) {
    // on ground or on top of object
    onGround = true;
    velocityY = Math.max(0, velocityY);
    // snap to surface top
    playerObj.position.y = surface.point.y + PLAYER_EYE_HEIGHT;
  } else {
    onGround = false;
  }

  // landing camera punch
  if (!wasOnGround && onGround) {
    cameraBump = -0.14;
  }
  wasOnGround = onGround; 

  if (move.jump && onGround) {
    velocityY = JUMP_SPEED;
    onGround = false;
    cameraBump = 0.12; // small lift on jump
  }

  // apply gravity
  velocityY += GRAVITY * delta;
  playerObj.position.y += velocityY * delta;

  // prevent falling below ground
  if (playerObj.position.y < PLAYER_EYE_HEIGHT) {
    playerObj.position.y = PLAYER_EYE_HEIGHT;
    velocityY = 0;
    onGround = true;
  }

  // ----- zombies update (movement + collisions + attacks) -----
  const playerPos = playerObj.position.clone();
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z.alive) continue;
    const pos = z.mesh.position;
    const dir = new THREE.Vector3(playerPos.x - pos.x, 0, playerPos.z - pos.z);
    const dist = dir.length();
    if (dist > 0.001) dir.normalize();

    // attempt movement with collision blocking
    const desiredZPos = pos.clone().addScaledVector(dir, z.speed * delta * 2);
    // per-axis check for zombie (foot at y=0)
    if (!willCollideAt(desiredZPos.x, pos.z, 0, 0.5)) pos.x = desiredZPos.x;
    if (!willCollideAt(pos.x, desiredZPos.z, 0, 0.5)) pos.z = desiredZPos.z;

    z.mesh.lookAt(playerPos.x, z.mesh.position.y, playerPos.z);

    // attack when close
    if (dist < 1.6) {
      // damage scales with difficulty (stronger initially); mutants hurt a lot more
      let dmg = 12 + difficultyLevel * 6;
      if ((z as any).mutant) dmg = Math.floor(dmg * 2.2);
      health -= dmg;
      healthEl.textContent = `Health: ${health}`;

      // push player back (stronger with difficulty)
      const pushForce = 1 + difficultyLevel * 0.6 + ((z as any).mutant ? 1.2 : 0);
      const push = new THREE.Vector3().subVectors(playerPos, pos).setY(0).normalize().multiplyScalar(pushForce);
      // move player and ensure not colliding into obstacles
      const attemptedX = playerObj.position.x + push.x;
      const attemptedZ = playerObj.position.z + push.z;
      const attemptedFootY = playerObj.position.y - PLAYER_EYE_HEIGHT;
      if (!willCollideAt(attemptedX, playerObj.position.z, attemptedFootY)) playerObj.position.x = attemptedX;
      if (!willCollideAt(playerObj.position.x, attemptedZ, attemptedFootY)) playerObj.position.z = attemptedZ;

      // remove zombie after hitting
      z.alive = false;
      zombieGroup.remove(z.mesh);
      zombies.splice(i, 1);

      if (health <= 0) {
        gameOver();
      }
    }
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
