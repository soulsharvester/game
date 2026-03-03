import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
// ---------- Constants / player physics ----------
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const GRAVITY = -30;
const JUMP_SPEED = 20; // higher jump for smoother feel
const STEP_HEIGHT = 0.45; // automatic small-step height for pavements
const STEP_HEIGHT_CAR = 1.2; // allow climbing onto cars automatically (raised slightly)
const BASE_PLAYER_SPEED = 8; // player is faster relative to zombies
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
const obstacles = [];
function addObstacle(mesh, isCar = false) {
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
    // create building texture (window pattern)
    function createBuildingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        // base color (random concrete/brick)
        const baseHue = 0.05 + Math.random() * 0.15;
        const baseLightness = 0.3 + Math.random() * 0.2;
        ctx.fillStyle = `hsl(${baseHue * 360}, 20%, ${baseLightness * 100}%)`;
        ctx.fillRect(0, 0, 256, 256);
        // draw windows
        ctx.fillStyle = '#1a3a5c';
        const windowSize = 30;
        const windowSpacing = 40;
        for (let x = 20; x < 256; x += windowSpacing) {
            for (let y = 20; y < 256; y += windowSpacing) {
                ctx.fillRect(x, y, windowSize, windowSize);
                // small window reflection
                ctx.fillStyle = '#4a7aac';
                ctx.fillRect(x + 5, y + 5, 8, 8);
                ctx.fillStyle = '#1a3a5c';
            }
        }
        // add some grime
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < 50; i++) {
            ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 20 + 5, Math.random() * 20 + 5);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }
    for (let gx = -5; gx <= 5; gx++) {
        for (let gz = -5; gz <= 5; gz++) {
            // leave center roads clear
            const worldX = gx * blockSpacing + (Math.random() - 0.5) * 6;
            const worldZ = gz * blockSpacing + (Math.random() - 0.5) * 6;
            if (Math.abs(worldX) < 18 && Math.abs(worldZ) < 18)
                continue; // keep center cross clear
            if (Math.random() > 0.5)
                continue; // sparse out distant blocks for performance (increased from 0.6)
            const w = 8 + Math.random() * 12;
            const d = 8 + Math.random() * 12;
            const h = 6 + Math.random() * 30; // slightly lower max height to reduce overdraw
            // use texture instead of flat color
            const buildingTexture = createBuildingTexture();
            const bmat = new THREE.MeshStandardMaterial({
                map: buildingTexture,
                roughness: 0.8,
                metalness: 0.0
            });
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
    // cars removed - platform will be created as safehouse replacement
}
createCity();
// ---------- Player / controls ----------
// use document.body for pointer-lock target (works reliably across browsers)
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.getObject().position.set(0, PLAYER_EYE_HEIGHT, 0);
// gun (3D, fixed to camera)
let gun = null;
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
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
const healthEl = document.getElementById('health');
let score = 0;
let health = 100;
let nextMilestone = 100;
function updateScore(amount) {
    // apply 20% score penalty when player is on platform
    const playerPos = controls.getObject().position;
    const playerOnPlatform = isPlayerInSafehouse(playerPos);
    const finalAmount = playerOnPlatform ? amount * 0.8 : amount;
    score += finalAmount;
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
    startBtn.textContent = 'Locking...';
    // attempt native pointer lock first
    controls.lock();
    // if browser blocks pointer lock, enable the fallback after a short delay
    if (pointerLockFallbackTimer)
        window.clearTimeout(pointerLockFallbackTimer);
    pointerLockFallbackTimer = window.setTimeout(() => {
        if (!controls.isLocked)
            enableFakePointerLock();
        pointerLockFallbackTimer = null;
    }, 450);
});
// fallback: allow clicking the overlay background or pressing Enter to start the game
overlay.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t && (t.id === 'startBtn' || t === overlay)) {
        console.log('overlay click -> attempting pointer lock');
        startBtn.textContent = 'Locking...';
        controls.lock();
        if (pointerLockFallbackTimer)
            window.clearTimeout(pointerLockFallbackTimer);
        pointerLockFallbackTimer = window.setTimeout(() => {
            if (!controls.isLocked)
                enableFakePointerLock();
            pointerLockFallbackTimer = null;
        }, 450);
    }
});
window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && !controls.isLocked && !fakePointerLocked) {
        console.log('Enter pressed -> attempting pointer lock');
        startBtn.textContent = 'Locking...';
        controls.lock();
        if (pointerLockFallbackTimer)
            window.clearTimeout(pointerLockFallbackTimer);
        pointerLockFallbackTimer = window.setTimeout(() => {
            if (!controls.isLocked)
                enableFakePointerLock();
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
        startBtn.textContent = 'Locked';
        // if fake fallback somehow active, turn it off
        if (fakePointerLocked)
            disableFakePointerLock();
    }
    else {
        startBtn.textContent = 'Click to Play (Pointer Lock)';
    }
});
document.addEventListener('pointerlockerror', () => {
    console.error('pointer lock error');
    startBtn.textContent = 'Click to Play (Pointer Lock)';
    if (pointerLockFallbackTimer) {
        window.clearTimeout(pointerLockFallbackTimer);
        pointerLockFallbackTimer = null;
    }
    enableFakePointerLock();
});
controls.addEventListener('lock', () => { overlay.classList.add('hidden'); crosshairEl.style.display = 'block'; stabilizePlayerPosition(); resolvePlayerPenetration(); if (pointerLockFallbackTimer) {
    window.clearTimeout(pointerLockFallbackTimer);
    pointerLockFallbackTimer = null;
} if (fakePointerLocked)
    disableFakePointerLock(); });
controls.addEventListener('unlock', () => { overlay.classList.remove('hidden'); crosshairEl.style.display = 'none'; aimDotEl.style.display = 'none'; isFiring = false; fireHoldTime = 0; fireTimer = 0; crosshairEl.classList.remove('small'); if (fakePointerLocked)
    disableFakePointerLock(); });
// movement state
const move = { forward: false, backward: false, left: false, right: false, jump: false };
window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW':
            move.forward = true;
            break;
        case 'KeyS':
            move.backward = true;
            break;
        case 'KeyA':
            move.left = true;
            break;
        case 'KeyD':
            move.right = true;
            break;
        case 'Space':
            move.jump = true;
            break;
    }
});
window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW':
            move.forward = false;
            break;
        case 'KeyS':
            move.backward = false;
            break;
        case 'KeyA':
            move.left = false;
            break;
        case 'KeyD':
            move.right = false;
            break;
        case 'Space':
            move.jump = false;
            break;
    }
});
// vertical physics for player
let velocityY = 0;
let onGround = false;
let wasOnGround = true;
let cameraBump = 0;
const cameraBaseY = camera.position.y;
const recoil = new THREE.Vector3();
let wasPlayerOnPlatform = false; // tracks if player was on platform last frame
// initial stabilization (must run after velocityY is declared)
stabilizePlayerPosition();
resolvePlayerPenetration();
const zombies = [];
const zombieGroup = new THREE.Group();
scene.add(zombieGroup);
const projectiles = [];
let safehouse = null;
let safehouseMilestone = 1000; // next score threshold for safehouse spawn/grow
function createSafehouse(size) {
    // remove old safehouse if exists
    if (safehouse)
        scene.remove(safehouse.mesh);
    // remove old platform obstacle if exists
    const existingPlatformIdx = obstacles.findIndex(o => o.isPlatform);
    if (existingPlatformIdx >= 0) {
        obstacles.splice(existingPlatformIdx, 1);
    }
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    // create a simple grey platform with red/white striped border
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const platform = new THREE.Mesh(new THREE.BoxGeometry(size * 1.5, 0.3, size * 1.5), platformMat);
    platform.position.set(0, 0.15, 0);
    group.add(platform);
    // add platform to obstacles so player can stand on it
    platform.updateMatrixWorld(true);
    const platformBox = new THREE.Box3().setFromObject(platform);
    const platformObstacle = {
        mesh: platform,
        box: platformBox,
        top: platformBox.max.y,
        isPlatform: true
    };
    obstacles.push(platformObstacle);
    // red and white striped border around platform perimeter
    const borderHeight = 0.15;
    const borderThickness = 0.2;
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const platformHalfSizeX = (size * 1.5) / 2;
    const platformHalfSizeZ = (size * 1.5) / 2;
    const stripeWidth = 0.5;
    const stripePairs = Math.floor((platformHalfSizeX * 2) / stripeWidth);
    // front and back borders with alternating red/white stripes
    for (let i = 0; i < stripePairs; i++) {
        const xPos = -platformHalfSizeX + i * stripeWidth;
        const isFront = i % 2 === 0;
        const mat = isFront ? redMat : whiteMat;
        // front border
        const frontBorder = new THREE.Mesh(new THREE.BoxGeometry(stripeWidth, borderHeight, borderThickness), mat);
        frontBorder.position.set(xPos, 0.2, platformHalfSizeZ);
        group.add(frontBorder);
        // back border
        const backBorder = new THREE.Mesh(new THREE.BoxGeometry(stripeWidth, borderHeight, borderThickness), mat);
        backBorder.position.set(xPos, 0.2, -platformHalfSizeZ);
        group.add(backBorder);
    }
    // left and right borders with alternating red/white stripes
    for (let i = 0; i < stripePairs; i++) {
        const zPos = -platformHalfSizeZ + i * stripeWidth;
        const isFront = i % 2 === 0;
        const mat = isFront ? redMat : whiteMat;
        // left border
        const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, borderHeight, stripeWidth), mat);
        leftBorder.position.set(-platformHalfSizeX, 0.2, zPos);
        group.add(leftBorder);
        // right border
        const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, borderHeight, stripeWidth), mat);
        rightBorder.position.set(platformHalfSizeX, 0.2, zPos);
        group.add(rightBorder);
    }
    scene.add(group);
    safehouse = { mesh: group, size, doorOpen: true, windowPositions: [] };
}
function isPlayerInSafehouse(playerPos) {
    if (!safehouse)
        return false;
    const { size } = safehouse;
    // check if player is inside the platform bounds (on top of platform)
    const platformSize = size * 1.5;
    const isOnPlatform = Math.abs(playerPos.x) < platformSize / 2 && Math.abs(playerPos.z) < platformSize / 2 && playerPos.y > 0.2 && playerPos.y < 2.0;
    return isOnPlatform;
}
// Event / spawn control
let spawnTimer = 0;
let spawnInterval = 1.2; // seconds
let difficultyLevel = 0; // increases every 100 points
let spawnFrozenUntil = 0; // timestamp while spawning is frozen (e.g., after events)
// event scheduling (slightly more frequent - ~3-4 minutes)
// Set to `true` only during development. For normal gameplay events should be rare (~3-4 minutes).
const DEBUG_QUICK_EVENTS = false; // <-- set false so natural disasters are rare in normal play
const DEBUG_EVENT_DELAY = 3000; // first event after 3s when debugging
let nextEventAt = performance.now() + (DEBUG_QUICK_EVENTS ? DEBUG_EVENT_DELAY : 1000 * (180 + Math.random() * 60));
let eventWarningShown = false;
let nextEventWarningAt = 0; // when to show next event warning (5 seconds before event)
let currentEvent = null;
let eventEndAt = 0;
let lastPlatformLeftAt = 0; // when player left platform
const PLATFORM_GRACE_PERIOD = 5000; // 5 seconds of zombie disengagement
// meteor & lava storage
const meteors = [];
let lavaMesh = null;
let lavaLevel = -100;
// acid rain / hail / landslide storage
const acidRainDrops = [];
const hailStones = [];
let landslideActive = false;
let landslideTimer = 0;
// giant mutant tracking (spawns ~once every 15 minutes)
let lastGiantMutantAt = 0;
const GIANT_MUTANT_INTERVAL = 900000; // 15 minutes in ms
function spawnZombie() {
    const now = performance.now();
    if (zombies.length > 60)
        return;
    if (now < spawnFrozenUntil)
        return; // respect grace period
    // check for giant mutant spawn (very rare - ~once every 15 minutes)
    if (now - lastGiantMutantAt > GIANT_MUTANT_INTERVAL && Math.random() < 0.01) {
        lastGiantMutantAt = now;
        spawnGiantMutant();
    }
    const isMutant = Math.random() < 0.06; // ~6% chance for regular mutants
    const geo = new THREE.BoxGeometry(1, 2, 1);
    const baseColor = isMutant ? 0x8b2d2d : new THREE.Color().setHSL(0.33 + (Math.random() - 0.5) * 0.08, 0.6, 0.35 + Math.random() * 0.05).getHex();
    const mat = new THREE.MeshStandardMaterial({ color: baseColor });
    const m = new THREE.Mesh(geo, mat);
    if (isMutant) {
        m.scale.set(1.6, 1.6, 1.6);
        mat.emissive = new THREE.Color(0x330000);
    }
    // try to pick a spawn position that's not inside obstacles and not near player
    const playerPos = controls.getObject().position;
    let spawnPos = null;
    for (let attempt = 0; attempt < 12; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = SPAWN_MIN_DISTANCE + Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // skip if too near player or outside world bounds
        if (playerPos.distanceTo(new THREE.Vector3(x, playerPos.y, z)) < SPAWN_MIN_DISTANCE)
            continue;
        if (Math.abs(x) > 190 || Math.abs(z) > 190)
            continue;
        // skip if near safehouse (zombies can approach it naturally)
        if (safehouse && Math.sqrt(x * x + z * z) < 8)
            continue;
        if (willCollideAt(x, z, 0, 0.6))
            continue; // avoid spawning inside obstacles
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
    // base speed (mutants considerably slower than regular zombies)
    const base = 1.0 + Math.random() * 0.9;
    const speed = base * (1 + difficultyLevel * 0.2) * (isMutant ? 0.5 : 1); // mutants are 50% speed of regular
    const hp = isMutant ? (12 + Math.floor(Math.random() * 8) + difficultyLevel * 3) : (2 + Math.floor(Math.random() * 2) + Math.floor(difficultyLevel * 0.3));
    zombies.push({ mesh: m, speed, alive: true, hp, baseColor, mutant: isMutant });
}
function spawnGiantMutant() {
    // spawn a massive, extremely slow mutant with reasonable health
    const geo = new THREE.BoxGeometry(1, 2, 1);
    const baseColor = 0x4d1a1a; // darker red
    const mat = new THREE.MeshStandardMaterial({ color: baseColor });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(3.5, 3.5, 3.5); // massive scale
    mat.emissive = new THREE.Color(0x660000);
    mat.metalness = 0.3;
    mat.roughness = 0.7;
    // spawn in distance similar to regular zombies
    const playerPos = controls.getObject().position;
    let spawnPos = null;
    for (let attempt = 0; attempt < 12; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = SPAWN_MIN_DISTANCE + Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (playerPos.distanceTo(new THREE.Vector3(x, playerPos.y, z)) < SPAWN_MIN_DISTANCE)
            continue;
        if (Math.abs(x) > 190 || Math.abs(z) > 190)
            continue;
        if (willCollideAt(x, z, 0, 1.0))
            continue;
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
    // extremely slow speed (0.3x of regular zombies)
    const speed = 0.3 * (1 + difficultyLevel * 0.1);
    // reasonable health for its size
    const hp = 35 + Math.floor(Math.random() * 15) + difficultyLevel * 4;
    const giantMutantData = { mesh: m, speed, alive: true, hp, baseColor, mutant: true, isGiant: true };
    zombies.push(giantMutantData);
}
// ---------- Shooting (raycast) ----------
const raycaster = new THREE.Raycaster();
// firing (hold-to-spray) configuration
let isFiring = false;
let fireHoldTime = 0;
let fireTimer = 0;
const FIRE_RATE_START = 2; // shots / sec initially when holding
const FIRE_RATE_MAX = 14; // cap shots / sec when fully ramped
const crosshairEl = document.getElementById('crosshair');
const aimDotEl = document.getElementById('aimDot');
// pointer-lock fallback state (if browser blocks pointer lock)
let fakePointerLocked = false;
let _fakeYaw = 0;
let _fakePitch = 0;
let pointerLockFallbackTimer = null;
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
    if (!controls.isLocked)
        overlay.classList.remove('hidden');
    crosshairEl.style.display = controls.isLocked ? 'block' : 'none';
}
function onFakeKeyDown(e) {
    if (e.code === 'Escape') {
        disableFakePointerLock();
    }
}
function onFakeMouseMove(e) {
    if (!fakePointerLocked)
        return;
    _fakeYaw -= e.movementX * FAKE_LOOK_SENS;
    _fakePitch -= e.movementY * FAKE_LOOK_SENS;
    _fakePitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _fakePitch));
    controls.getObject().rotation.y = _fakeYaw;
    camera.rotation.x = _fakePitch;
}
window.addEventListener('mousedown', (e) => {
    if (!controls.isLocked)
        return;
    if (e.button !== 0)
        return; // left button only
    isFiring = true;
    fireHoldTime = 0;
    fireTimer = 0; // immediate shot
    shoot();
    crosshairEl.classList.add('small');
});
window.addEventListener('mouseup', (e) => {
    if (e.button !== 0)
        return;
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
        const targetMesh = hit.object;
        // visible dart from gun -> target
        spawnProjectile(startPos, hit.point.clone(), targetMesh);
    }
    else {
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
    // resolve any penetration that recoil may cause
    resolvePlayerPenetration();
}
function killZombie(mesh) {
    const idx = zombies.findIndex(z => z.mesh === mesh);
    if (idx === -1)
        return;
    const z = zombies[idx];
    if (!z.alive)
        return;
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
function pointInsideObstacle(pt) {
    for (const o of obstacles) {
        if (o.box.containsPoint(pt))
            return true;
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
    }
    else {
        player.position.y = PLAYER_EYE_HEIGHT + 0.02;
    }
}
// if player is inside an obstacle, attempt to resolve by moving up (if climbable) or nudging away
function resolvePlayerPenetration() {
    const player = controls.getObject();
    const inside = getObstacleAt(player.position.x, player.position.z, PLAYER_RADIUS);
    if (!inside)
        return;
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
        }
        else {
            // push along Z
            const centerZ = (inside.box.min.z + inside.box.max.z) * 0.5;
            const dir = player.position.z >= centerZ ? 1 : -1;
            player.position.z += dir * (overlapZ + PLAYER_RADIUS + 0.08);
        }
    }
    else {
        // last-resort nudge
        const centerX = (inside.box.min.x + inside.box.max.x) * 0.5;
        const pushDir = player.position.x >= centerX ? 1 : -1;
        player.position.x += pushDir * (PLAYER_RADIUS + 0.6);
    }
}
// spawn a visible, fast dart that travels from `from` toward `to` (optional target mesh)
function spawnProjectile(from, to, target) {
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
function damageZombie(mesh, amount = 1) {
    const idx = zombies.findIndex(z => z.mesh === mesh);
    if (idx === -1)
        return;
    const z = zombies[idx];
    if (!z.alive)
        return;
    z.hp -= amount;
    // brief hit flash
    z.mesh.material.color.setHex(0xff9955);
    setTimeout(() => {
        z.mesh.material.color.setHex(z.baseColor || 0x6abf6b);
    }, 120);
    if (z.hp <= 0) {
        killZombie(mesh);
    }
}
// ---------- Collision helpers ----------
function pointWithinBoxXZ(x, z, box, radius = 0) {
    return (x + radius) >= box.min.x && (x - radius) <= box.max.x && (z + radius) >= box.min.z && (z - radius) <= box.max.z;
}
function willCollideAt(x, z, footY, radius = PLAYER_RADIUS) {
    for (const o of obstacles) {
        if (!pointWithinBoxXZ(x, z, o.box, radius))
            continue;
        // allow tiny obstacles (pavements) to be stepped onto automatically
        if (o.top <= footY + STEP_HEIGHT)
            continue;
        return true;
    }
    return false;
}
// return the obstacle at XZ (if any)
function getObstacleAt(x, z, radius = PLAYER_RADIUS) {
    for (const o of obstacles) {
        if (pointWithinBoxXZ(x, z, o.box, radius))
            return o;
    }
    return undefined;
}
// return the highest obstacle top (or ground.y) at the given XZ
function getHighestSurfaceYAt(x, z) {
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
function getSurfaceBelow(position, maxDistance = 3) {
    // cast downward from slightly above the camera to avoid 'inside-mesh' misses
    const origin = position.clone().add(new THREE.Vector3(0, 0.06, 0));
    downRay.set(origin, new THREE.Vector3(0, -1, 0));
    const meshes = [ground, ...obstacles.map(o => o.mesh)];
    const hits = downRay.intersectObjects(meshes, true);
    if (hits.length === 0)
        return null;
    if (hits[0].distance > maxDistance)
        return null;
    return hits[0];
}
// ---- Event helpers ----
function scheduleNextEvent() {
    const now = performance.now();
    if (DEBUG_QUICK_EVENTS) {
        // short, repeatable interval for development/testing
        nextEventAt = now + 8000 + Math.random() * 8000; // 8-16s
    }
    else {
        // slightly more frequent: ~3-4 minutes ± 60s
        nextEventAt = now + 1000 * (180 + Math.random() * 60);
    }
    eventWarningShown = false;
    nextEventWarningAt = nextEventAt - 5000; // warn 5 seconds before
    currentEvent = null;
}
function showEventWarning(message) {
    const eventMsg = document.getElementById('eventMsg');
    eventMsg.textContent = message;
    eventMsg.style.display = 'block';
    eventMsg.style.color = '#ffaa00';
}
function showEventStarted(message) {
    const eventMsg = document.getElementById('eventMsg');
    eventMsg.textContent = message;
    eventMsg.style.display = 'block';
    eventMsg.style.color = '#ff3333';
}
function hideEventMsg() {
    const eventMsg = document.getElementById('eventMsg');
    eventMsg.style.display = 'none';
}
function startAcidRainEvent() {
    // spawn acid rain drops from sky
    const count = 80;
    for (let i = 0; i < count; i++) {
        const geom = new THREE.SphereGeometry(0.2, 6, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x88ff00, emissive: 0x88ff00, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(geom, mat);
        const x = (Math.random() - 0.5) * 300;
        const z = (Math.random() - 0.5) * 300;
        const y = 60 + Math.random() * 40;
        mesh.position.set(x, y, z);
        scene.add(mesh);
        const vy = -(15 + Math.random() * 30);
        acidRainDrops.push({ mesh, velocity: new THREE.Vector3(0, vy, 0), ttl: 10 });
    }
    showEventStarted('⚠️ ACID RAIN INCOMING! ⚠️');
}
function updateAcidRainEvent(delta) {
    const player = controls.getObject();
    const playerOnPlatform = isPlayerInSafehouse(player.position);
    const now = performance.now();
    const eventProgress = Math.max(0, Math.min(1, (now - (eventEndAt - 10000)) / 10000)); // 0 to 1 over 10 seconds
    for (let i = acidRainDrops.length - 1; i >= 0; i--) {
        const d = acidRainDrops[i];
        d.mesh.position.addScaledVector(d.velocity, delta);
        d.ttl -= delta;
        // kill zombies (except in safe areas)
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            if (d.mesh.position.distanceTo(z.mesh.position) < 1.2) {
                z.alive = false;
                zombieGroup.remove(z.mesh);
                zombies.splice(j, 1);
                updateScore(3);
            }
        }
        // player damage if not on platform
        if (!playerOnPlatform && d.mesh.position.distanceTo(player.position) < 1.5) {
            health -= (100 * delta); // acid rain damage over 10 seconds = ~100 damage
            healthEl.textContent = `Health: ${health}`;
            if (health <= 0) {
                gameOver();
            }
        }
        if (d.ttl <= 0 || d.mesh.position.y <= -10) {
            scene.remove(d.mesh);
            acidRainDrops.splice(i, 1);
        }
    }
    if (acidRainDrops.length === 0 && now >= eventEndAt) {
        endEvent();
    }
}
function startHailEvent() {
    // spawn large hailstones
    const count = 60;
    for (let i = 0; i < count; i++) {
        const geom = new THREE.IcosahedronGeometry(0.35, 3);
        const mat = new THREE.MeshStandardMaterial({ color: 0xccccff, emissive: 0x6666ff, metalness: 0.3 });
        const mesh = new THREE.Mesh(geom, mat);
        const x = (Math.random() - 0.5) * 300;
        const z = (Math.random() - 0.5) * 300;
        const y = 80 + Math.random() * 60;
        mesh.position.set(x, y, z);
        scene.add(mesh);
        const vy = -(30 + Math.random() * 50);
        hailStones.push({ mesh, velocity: new THREE.Vector3(0, vy, 0), ttl: 10 });
    }
    showEventStarted('❄️ HAILSTORM! ❄️');
}
function updateHailEvent(delta) {
    const player = controls.getObject();
    const playerOnPlatform = isPlayerInSafehouse(player.position);
    const now = performance.now();
    for (let i = hailStones.length - 1; i >= 0; i--) {
        const h = hailStones[i];
        h.mesh.position.addScaledVector(h.velocity, delta);
        h.ttl -= delta;
        // kill zombies
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            if (h.mesh.position.distanceTo(z.mesh.position) < 1.5) {
                z.alive = false;
                zombieGroup.remove(z.mesh);
                zombies.splice(j, 1);
                updateScore(3);
            }
        }
        // player damage if not on platform
        if (!playerOnPlatform && h.mesh.position.distanceTo(player.position) < 1.8) {
            health -= (120 * delta); // hail damage over 10 seconds
            healthEl.textContent = `Health: ${health}`;
            if (health <= 0) {
                gameOver();
            }
        }
        if (h.ttl <= 0 || h.mesh.position.y <= -10) {
            scene.remove(h.mesh);
            hailStones.splice(i, 1);
        }
    }
    if (hailStones.length === 0 && now >= eventEndAt) {
        endEvent();
    }
}
function startLandslideEvent() {
    landslideActive = true;
    landslideTimer = 10; // 10 seconds
    showEventStarted('🏔️ LANDSLIDE! RUN! 🏔️');
}
function updateLandslideEvent(delta) {
    const player = controls.getObject();
    const playerOnPlatform = isPlayerInSafehouse(player.position);
    landslideTimer -= delta;
    const progress = 1 - (landslideTimer / 10); // 0 to 1
    // progressive landslide damage - ground rises and crushes everything
    const landslideHeight = -50 + progress * 80; // rises from -50 to 30
    // kill zombies as ground crushes them
    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        if (z.mesh.position.y <= landslideHeight + 2) {
            z.alive = false;
            zombieGroup.remove(z.mesh);
            zombies.splice(i, 1);
            updateScore(3);
        }
    }
    // player damage if not on platform
    if (!playerOnPlatform && player.position.y <= landslideHeight + 2) {
        health = 0;
        healthEl.textContent = `Health: ${health}`;
        gameOver();
    }
    if (landslideTimer <= 0) {
        landslideActive = false;
        endEvent();
    }
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
        const vy = -(20 + Math.random() * 40);
        meteors.push({ mesh, velocity: new THREE.Vector3(vx, vy, vz), ttl: 8.0, size });
    }
    showEventStarted('☄️ METEOR SHOWER! ☄️');
}
function startLavaEvent() {
    // create a lava mesh that will rise from below
    if (lavaMesh)
        scene.remove(lavaMesh);
    const geom = new THREE.PlaneGeometry(500, 500);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcc4400, emissive: 0xff6600, metalness: 0.2, roughness: 0.4 });
    lavaMesh = new THREE.Mesh(geom, mat);
    lavaMesh.rotation.x = -Math.PI / 2;
    lavaMesh.position.y = -50;
    scene.add(lavaMesh);
    lavaMesh.userData.targetY = 15; // rises to this level
    lavaLevel = -50;
    showEventStarted('🔥 LAVA ERUPTION! 🔥');
}
function updateMeteorEvent(delta) {
    const player = controls.getObject();
    const playerOnPlatform = isPlayerInSafehouse(player.position);
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
        if (!playerOnPlatform && player.position.distanceTo(m.mesh.position) < (m.size + 0.9)) {
            health = 0;
            healthEl.textContent = `Health: ${health}`;
            gameOver();
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
            if (!playerOnPlatform && player.position.distanceTo(pos) < 2.0) {
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
function updateLavaEvent(delta) {
    if (!lavaMesh)
        return;
    const targetY = lavaMesh.userData.targetY;
    const player = controls.getObject();
    const playerOnPlatform = isPlayerInSafehouse(player.position);
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
    // player touch check (feet) - only if not on platform
    const feetY = player.position.y - PLAYER_EYE_HEIGHT;
    if (!playerOnPlatform && feetY <= lavaLevel + 0.15) {
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
    // clear all event elements
    meteors.forEach(m => scene.remove(m.mesh));
    meteors.length = 0;
    acidRainDrops.forEach(d => scene.remove(d.mesh));
    acidRainDrops.length = 0;
    hailStones.forEach(h => scene.remove(h.mesh));
    hailStones.length = 0;
    if (lavaMesh)
        scene.remove(lavaMesh);
    lavaMesh = null;
    lavaLevel = -100;
    landslideActive = false;
    landslideTimer = 0;
    // set 5s grace period for spawns
    spawnFrozenUntil = performance.now() + 5000;
    // schedule next event
    scheduleNextEvent();
    currentEvent = null;
    hideEventMsg();
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
        document.getElementById('eventMsg').textContent = `${evt === 'meteor' ? 'Meteor shower' : 'Lava eruption'} incoming in 10s — find shelter!`;
        document.getElementById('eventMsg').classList.add('warn');
        document.getElementById('eventMsg').style.display = 'block';
        setTimeout(() => {
            document.getElementById('eventMsg').style.display = 'none';
        }, 9000);
    }
    // start event if it's time
    if (!currentEvent && time >= nextEventAt) {
        // pick random event from all 5 types
        const eventTypes = ['meteor', 'lava', 'acidRain', 'hail', 'landslide'];
        currentEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        eventEndAt = time + 10000; // events last ~10s active phase
        eventWarningShown = false;
        // freeze zombie spawning for the duration + a 5s grace period after
        spawnFrozenUntil = eventEndAt + 5000;
        const eventNames = {
            meteor: 'Meteor shower',
            lava: 'Lava eruption',
            acidRain: 'Acid rain',
            hail: 'Hailstorm',
            landslide: 'Landslide'
        };
        if (currentEvent) {
            document.getElementById('eventMsg').textContent = `${eventNames[currentEvent]} — active!`;
            document.getElementById('eventMsg').classList.remove('warn');
            document.getElementById('eventMsg').style.display = 'block';
        }
        if (currentEvent === 'meteor')
            startMeteorEvent();
        else if (currentEvent === 'lava')
            startLavaEvent();
        else if (currentEvent === 'acidRain')
            startAcidRainEvent();
        else if (currentEvent === 'hail')
            startHailEvent();
        else if (currentEvent === 'landslide')
            startLandslideEvent();
    }
    // handle active event updates
    if (currentEvent === 'meteor')
        updateMeteorEvent(delta);
    else if (currentEvent === 'lava')
        updateLavaEvent(delta);
    else if (currentEvent === 'acidRain')
        updateAcidRainEvent(delta);
    else if (currentEvent === 'hail')
        updateHailEvent(delta);
    else if (currentEvent === 'landslide')
        updateLandslideEvent(delta);
    // check if event should end
    if (currentEvent && time >= eventEndAt) {
        endEvent();
    }
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
    }
    else {
        aimDotEl.style.display = 'none';
    }
    // update projectiles (move, check hits)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.mesh.position.addScaledVector(p.velocity, delta);
        p.ttl -= delta;
        let hit = false;
        if (p.target) {
            if (p.target.parent && p.mesh.position.distanceTo(p.target.position) < 1.5) {
                damageZombie(p.target, 1);
                hit = true;
            }
        }
        else {
            for (const z of zombies) {
                if (!z.alive)
                    continue;
                if (p.mesh.position.distanceTo(z.mesh.position) < 1.5) {
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
    if (move.forward)
        moveZ += playerSpeed; // FIXED: W moves forward
    if (move.backward)
        moveZ -= playerSpeed;
    if (move.left)
        moveX -= playerSpeed;
    if (move.right)
        moveX += playerSpeed;
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
    }
    else if (obsX.isCar && obsX.top <= footY + STEP_HEIGHT_CAR) {
        // step up onto car
        playerObj.position.x = newPosX;
        playerObj.position.y = Math.max(playerObj.position.y, obsX.top + PLAYER_EYE_HEIGHT);
    }
    else if (obsX.top <= footY + STEP_HEIGHT) {
        // step up onto low obstacle (pavement)
        playerObj.position.x = newPosX;
        playerObj.position.y = Math.max(playerObj.position.y, obsX.top + PLAYER_EYE_HEIGHT);
    }
    // Z-axis test with automatic small-step and car special-case
    const obsZ = getObstacleAt(playerObj.position.x, newPosZ, PLAYER_RADIUS);
    if (!obsZ) {
        playerObj.position.z = newPosZ;
    }
    else if (obsZ.isCar && obsZ.top <= footY + STEP_HEIGHT_CAR) {
        playerObj.position.z = newPosZ;
        playerObj.position.y = Math.max(playerObj.position.y, obsZ.top + PLAYER_EYE_HEIGHT);
    }
    else if (obsZ.top <= footY + STEP_HEIGHT) {
        playerObj.position.z = newPosZ;
        playerObj.position.y = Math.max(playerObj.position.y, obsZ.top + PLAYER_EYE_HEIGHT);
    }
    // fail-safe: robust AABB overlap test to prevent walking *through* obstacles (cars/buildings)
    // build a small player AABB (feet -> slightly above eye) and test against obstacle boxes
    const playerBox = new THREE.Box3(new THREE.Vector3(playerObj.position.x - PLAYER_RADIUS, playerObj.position.y - PLAYER_EYE_HEIGHT - 0.1, playerObj.position.z - PLAYER_RADIUS), new THREE.Vector3(playerObj.position.x + PLAYER_RADIUS, playerObj.position.y - PLAYER_EYE_HEIGHT + (PLAYER_EYE_HEIGHT * 0.6), playerObj.position.z + PLAYER_RADIUS));
    let collided = false;
    for (const o of obstacles) {
        if (playerBox.intersectsBox(o.box)) {
            collided = true;
            // if climbable (pavement or car), push player up onto the surface
            if (o.isCar && o.top <= footY + STEP_HEIGHT_CAR + 0.05) {
                playerObj.position.y = Math.max(playerObj.position.y, o.top + PLAYER_EYE_HEIGHT + 0.02);
                velocityY = Math.max(0, velocityY);
            }
            else if (o.top <= footY + STEP_HEIGHT + 0.05) {
                playerObj.position.y = Math.max(playerObj.position.y, o.top + PLAYER_EYE_HEIGHT + 0.02);
                velocityY = Math.max(0, velocityY);
            }
            else {
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
    const raySurface = getSurfaceBelow(playerObj.position, 4);
    const rayY = raySurface ? raySurface.point.y : -Infinity;
    const boxY = getHighestSurfaceYAt(playerObj.position.x, playerObj.position.z);
    const surfaceY = Math.max(rayY, boxY);
    const clientFeetY = playerObj.position.y - PLAYER_EYE_HEIGHT;
    // if player's feet are near or below the detected surface, snap to it (handles stepping back up reliably)
    const SNAP_THRESHOLD = 0.5; // increased tolerance for ground detection
    if (surfaceY !== -Infinity && clientFeetY <= surfaceY + SNAP_THRESHOLD) {
        onGround = true;
        // only kill downward velocity when landing, not when we're stepping up
        if (velocityY < 0)
            velocityY = 0;
        playerObj.position.y = surfaceY + PLAYER_EYE_HEIGHT;
    }
    else {
        onGround = false;
    }
    // landing camera punch
    if (!wasOnGround && onGround) {
        cameraBump = -0.14;
    }
    wasOnGround = onGround;
    // allow jump if on ground or *very close* to a surface (helps responsiveness when stepping/jumping)
    if (move.jump && onGround) {
        // normal jump impulse
        velocityY = JUMP_SPEED;
        onGround = false;
        cameraBump = 0.12; // small lift on jump
        // auto-jump: if there's a small obstacle ahead, automatically vault over it (auto-climb onto platform)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controls.getObject().quaternion).setY(0).normalize();
        const probe = controls.getObject().position.clone().addScaledVector(forward, 1.2);
        const obstacleAhead = getObstacleAt(probe.x, probe.z, PLAYER_RADIUS + 0.5);
        if (obstacleAhead) {
            const feetY = controls.getObject().position.y - PLAYER_EYE_HEIGHT;
            const autoJumpReach = 1.8; // can auto-jump onto objects up to this height
            if (obstacleAhead.top <= feetY + autoJumpReach && obstacleAhead.top > feetY + 0.1) {
                // extra upward boost for auto-jump to ensure we clear the obstacle
                velocityY = Math.max(velocityY, 15);
                cameraBump = 0.08;
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
    // track when player leaves the platform (start grace period)
    const playerCurrentlyOnPlatform = isPlayerInSafehouse(playerPos);
    let playerJustLeftPlatform = false;
    if (wasPlayerOnPlatform && !playerCurrentlyOnPlatform) {
        playerJustLeftPlatform = true;
        lastPlatformLeftAt = performance.now();
        // apply grace period to all current zombies
        for (const z of zombies) {
            z.graceUntil = performance.now() + PLATFORM_GRACE_PERIOD;
        }
    }
    wasPlayerOnPlatform = playerCurrentlyOnPlatform;
    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];
        if (!z.alive)
            continue;
        const pos = z.mesh.position;
        // check if zombie is in grace period (acts normal, not aggressive)
        const inGracePeriod = z.graceUntil && performance.now() < z.graceUntil;
        let target = playerPos.clone();
        let targetDist = playerPos.distanceTo(pos);
        if (inGracePeriod) {
            // during grace period: move randomly, don't target player
            if (!z.randomWalkDir) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.5 + Math.random() * 0.5;
                z.randomWalkDir = new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
                z.randomWalkTimeout = 2 + Math.random() * 3; // walk in this direction for 2-5 seconds
            }
            if (z.randomWalkTimeout !== undefined) {
                z.randomWalkTimeout -= delta;
                if (z.randomWalkTimeout <= 0) {
                    // pick new random direction
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 0.5 + Math.random() * 0.5;
                    if (z.randomWalkDir) {
                        z.randomWalkDir.set(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
                    }
                    z.randomWalkTimeout = 2 + Math.random() * 3;
                }
            }
            const desiredZPos = pos.clone().addScaledVector(z.randomWalkDir, z.speed * delta * 0.7);
            if (!willCollideAt(desiredZPos.x, pos.z, 0, 0.5))
                pos.x = desiredZPos.x;
            if (!willCollideAt(pos.x, desiredZPos.z, 0, 0.5))
                pos.z = desiredZPos.z;
            // look in direction of movement (not at player)
            const lookDir = z.randomWalkDir.clone().normalize();
            z.mesh.lookAt(pos.x + lookDir.x, z.mesh.position.y, pos.z + lookDir.z);
        }
        else {
            // normal: target player aggressively
            const dir = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
            if (dir.length() > 0.001)
                dir.normalize();
            // attempt movement with collision blocking including platform blocking
            const desiredZPos = pos.clone().addScaledVector(dir, z.speed * delta * 2);
            // per-axis check for zombie (foot at y=0)
            if (!willCollideAt(desiredZPos.x, pos.z, 0, 0.5))
                pos.x = desiredZPos.x;
            if (!willCollideAt(pos.x, desiredZPos.z, 0, 0.5))
                pos.z = desiredZPos.z;
            z.mesh.lookAt(target.x, z.mesh.position.y, target.z);
        }
        // prevent zombies from going on the platform by checking if they're on it and pushing them off
        if (safehouse) {
            const platformSize = safehouse.size * 1.5;
            if (Math.abs(pos.x) < platformSize / 2 && Math.abs(pos.z) < platformSize / 2 && pos.y > 0.2) {
                // zombie is on platform - push them off
                let centerDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
                if (centerDist < 0.1)
                    centerDist = 0.1;
                const pushOut = platformSize / 2 + 1;
                const angle = Math.atan2(pos.z, pos.x);
                pos.x = Math.cos(angle) * pushOut;
                pos.z = Math.sin(angle) * pushOut;
            }
        }
        // attack only if close enough (and not in grace period, grace zombies won't attack)
        if (!inGracePeriod && targetDist < 1.6) {
            let dmg = 12 + difficultyLevel * 6;
            if (z.mutant)
                dmg = Math.floor(dmg * 2.2);
            health -= dmg;
            healthEl.textContent = `Health: ${health}`;
            const pushForce = 1 + difficultyLevel * 0.6 + (z.mutant ? 1.2 : 0);
            const push = new THREE.Vector3().subVectors(playerPos, pos).setY(0).normalize().multiplyScalar(pushForce);
            const attemptedX = playerObj.position.x + push.x;
            const attemptedZ = playerObj.position.z + push.z;
            const attemptedFootY = playerObj.position.y - PLAYER_EYE_HEIGHT;
            if (!willCollideAt(attemptedX, playerObj.position.z, attemptedFootY))
                playerObj.position.x = attemptedX;
            if (!willCollideAt(playerObj.position.x, attemptedZ, attemptedFootY))
                playerObj.position.z = attemptedZ;
            z.alive = false;
            zombieGroup.remove(z.mesh);
            zombies.splice(i, 1);
            if (health <= 0) {
                gameOver();
            }
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
    overlay.querySelector('#title').textContent = 'Game Over';
    startBtn.textContent = 'Restart';
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
        overlay.querySelector('#title').textContent = 'FPS Zombie';
        startBtn.textContent = 'Click to Play (Pointer Lock)';
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
//# sourceMappingURL=main.js.map