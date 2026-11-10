import * as THREE from
'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

import { GLTFLoader } from
'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// Gameplay tuning values for movement, collisions, and interaction ranges.
const COIN_COUNT = 5;
const COIN_PICKUP_DISTANCE = 1.5;
const COIN_COLLISION_RADIUS = 0.75;
const CHARACTER_COLLISION_RADIUS = 1.15;
const PLAYER_SPEED = 5;
const ENEMY_SPEED = 1.8;
const ENEMY_WANDER_RANGE = 9;
const ENEMY_DETECTION_RANGE = 2.5;
const PISTOL_SHOT_RANGE = 20;
const PISTOL_RAY_DURATION = 0.45;
const PISTOL_BULLET_SPEED = 45;
const CHAIR_RAY_LENGTH = 2.5;
const CHAIR_COLLISION_RADIUS = 1.15;
const CHAIR_POSITION = new THREE.Vector3(0, 0, -5);
const SIT_TRANSITION_DURATION = 0.4;
const RAYCAST_DEBUG_LENGTH = 30;
const RAYCAST_MAP_RANGE = 15;
const CENTER_SCREEN = new THREE.Vector2(0, 0);
// [RAYCAST] Shared raycasters for camera debug, chair interaction, detection, and shots.
const debugRaycaster = new THREE.Raycaster();
debugRaycaster.far = RAYCAST_DEBUG_LENGTH;
const chairRaycaster = new THREE.Raycaster();
chairRaycaster.far = CHAIR_RAY_LENGTH;
const enemyRaycaster = new THREE.Raycaster();
enemyRaycaster.far = ENEMY_DETECTION_RANGE;
const pistolRaycaster = new THREE.Raycaster();
pistolRaycaster.far = PISTOL_SHOT_RANGE;

// Shared input state and the objects/actions used throughout the scene.
const coins = [];
const keys = Object.create(null);
const movementKeys = {
    KeyW: "w",
    KeyA: "a",
    KeyS: "s",
    KeyD: "d",
    ArrowUp: "w",
    ArrowLeft: "a",
    ArrowDown: "s",
    ArrowRight: "d",
    Space: " "
};

let scene;
let camera;
let renderer;
let cameraHelper;
let raycastLine;
let chairRayLine;
let enemyRayLine;
let pistolRayLine;
let pistolBullet;
let rayMapContext;
let coinSound;
let walkingSound;
let chair;
let player;
let mixer;
let enemy;
let enemyMixer;
let pistol;
let rightForeArmBone;
let rightHandBone;
let idleAction;
let walkAction;
let pickupAction;
let sitAction;
let sitIdleAction;
let playerShootAction;
let enemyIdleAction;
let enemyWalkAction;
let enemyDeathAction;
let score = 0;
let isWalking = false;
let isEnemyWalking = false;
let isPickingUp = false;
let isSittingDown = false;
let isSitting = false;
let enemyIsDead = false;
let isPistolDrawn = false;
let isAimingAtEnemy = false;
let chairSitCooldown = 0;
let enemyPauseTime = 0;
let pistolRayTime = 0;
let pistolShotPending = false;
let pistolBulletDirection = new THREE.Vector3();
let pistolBulletDistance = 0;
let pistolBulletTravelled = 0;
let pistolBulletImpactTime = 0;
let pendingCoin;
let enemyTarget;
let pickupMidpointReached = false;
let sitStartPosition;
let sitTargetPosition;
let sitStartRotation = 0;
let sitTargetRotation = 0;
let sitTransitionTime = 0;

// Create the world scene and its sky-colored background.
function createScene()
{
    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0x87ceeb);
    return newScene;
}

// Create the perspective camera used to follow the player.
function createCamera()
{
    const newCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    newCamera.position.set(0, 5, 10);
    newCamera.lookAt(0, 0, 0);
    return newCamera;
}

// Create and attach the WebGL canvas, making it focusable for keyboard input.
function createRenderer()
{
    const newRenderer = new THREE.WebGLRenderer();
    newRenderer.setSize(window.innerWidth, window.innerHeight);
    newRenderer.domElement.tabIndex = 0;
    newRenderer.domElement.addEventListener(
        "pointerdown",
        ()=>newRenderer.domElement.focus()
    );
    document.body.appendChild(newRenderer.domElement);
    return newRenderer;
}

// [RAYCAST] Create visible debug lines for camera, chair, enemy, and pistol rays.
function addCameraDebugVisuals()
{
    rayMapContext = document.getElementById("ray-debug").getContext("2d");

    cameraHelper = new THREE.CameraHelper(camera);
    scene.add(cameraHelper);

    raycastLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0xff3300,
            depthTest: false
        })
    );
    raycastLine.frustumCulled = false;
    scene.add(raycastLine);
    
    chairRayLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0x4de1c1,
            depthTest: false
        })
    );
    chairRayLine.frustumCulled = false;
    chairRayLine.visible = false;
    scene.add(chairRayLine);

    enemyRayLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0xff9e35,
            depthTest: false
        })
    );
    enemyRayLine.frustumCulled = false;
    enemyRayLine.visible = false;
    scene.add(enemyRayLine);

    pistolRayLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0xffe45e,
            depthTest: false
        })
    );
    pistolRayLine.frustumCulled = false;
    pistolRayLine.visible = false;
    scene.add(pistolRayLine);

    pistolBullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe45e })
    );
    pistolBullet.visible = false;
    scene.add(pistolBullet);
}

// Add ambient and directional light to the scene.
function addLighting()
{
    scene.add(new THREE.AmbientLight(0xffffff, 2));

    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 15, 10);
    scene.add(sun);
}

// Build the ground plane with tiled rock color, normal, and roughness maps.
function addGround()
{
    const textureLoader = new THREE.TextureLoader();
    const loadGroundTexture = path=>
    {
        const texture = textureLoader.load(path);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20);
        return texture;
    };
    const colorMap = loadGroundTexture("textures/RocksColor.jpg");
    colorMap.colorSpace = THREE.SRGBColorSpace;

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({
            map: colorMap,
            normalMap: loadGroundTexture("textures/RocksNormal.jpg"),
            roughnessMap: loadGroundTexture("textures/RocksRough.jpg")
        })
    );

    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
}

// Build the chair and place it at the configured interaction point.
function createChair()
{
    chair = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x80502f });
    const addPart = (width, height, depth, x, y, z)=>
    {
        const part = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            wood
        );
        part.position.set(x, y, z);
        chair.add(part);
    };

    addPart(1.3, 0.15, 1.3, 0, 0.75, 0);

    for(const x of [-0.52, 0.52])
    {
        for(const z of [-0.52, 0.52])
            addPart(0.13, 0.75, 0.13, x, 0.375, z);
    }

    addPart(0.13, 1, 0.13, -0.52, 1.25, -0.55);
    addPart(0.13, 1, 0.13, 0.52, 1.25, -0.55);
    addPart(1.3, 1, 0.15, 0, 1.55, -0.55);

    chair.position.copy(CHAIR_POSITION);
    chair.rotation.y = 0;
    scene.add(chair);
}

// Choose a coin position clear of the player, chair, and other coins.
function getCoinSpawnPosition()
{
    for(let attempt = 0; attempt < 50; attempt++)
    {
        const x = Math.random() * 20 - 10;
        const z = Math.random() * 20 - 10;
        const clearOfPlayer =
            !player || Math.hypot(x - player.position.x, z - player.position.z) > 3;
        const clearOfChair =
            !chair || Math.hypot(x - chair.position.x, z - chair.position.z) > 2.5;
        const clearOfCoins = coins.every(coin=>
            Math.hypot(x - coin.position.x, z - coin.position.z) > 2
        );

        if(clearOfPlayer && clearOfChair && clearOfCoins)
            return new THREE.Vector3(x, 0.12, z);
    }

    return new THREE.Vector3(Math.random() * 20 - 10, 0.12, Math.random() * 20 - 10);
}

// Create one coin mesh and register it with the scene and collision list.
function createCoin()
{
    const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.2, 32),
        new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );

    coin.position.copy(getCoinSpawnPosition());
    scene.add(coin);
    coins.push(coin);
}

// Populate the scene with the configured number of coins.
function createCoins()
{
    for(let index = 0; index < COIN_COUNT; index++)
        createCoin();
}

// [AUDIO] Load the coin chime and looping walking sound on the camera listener.
function setupAudio()
{
    const listener = new THREE.AudioListener();
    camera.add(listener);

    coinSound = new THREE.Audio(listener);
    new THREE.AudioLoader().load("audio/coin.mp3", buffer=>
    {
        coinSound.setBuffer(buffer);
        coinSound.setVolume(0.5);
    });

    walkingSound = new THREE.Audio(listener);
    walkingSound.setLoop(true);
    walkingSound.setVolume(0.35);
    new THREE.AudioLoader().load("audio/walking.mp3", buffer=>
    {
        walkingSound.setBuffer(buffer);
        if(isWalking)
            walkingSound.play();
    });
}

// Display a short gameplay status message.
function setMessage(message)
{
    document.getElementById("message").textContent = message;
}

// Refresh the visible coin score.
function updateScore()
{
    document.getElementById("score").textContent = "Score: " + score;
}

// Start the one-shot animation used when the player reaches for a coin.
function playPickupAnimation()
{
    if(!pickupAction)
        return;

    walkAction?.fadeOut(0.1);
    idleAction?.fadeOut(0.1);
    isWalking = false;
    isPickingUp = true;
    pickupMidpointReached = false;
    pickupAction.reset();
    pickupAction.setLoop(THREE.LoopOnce, 1);
    pickupAction.clampWhenFinished = true;
    pickupAction.fadeIn(0.1).play();
}

// Find and begin collecting a coin within pickup distance.
function collectNearbyCoin()
{
    if(!player || isPickingUp || isSittingDown || isSitting || isPistolDrawn)
        return;

    const coin = coins.find(candidate=>
        Math.hypot(
            player.position.x - candidate.position.x,
            player.position.z - candidate.position.z
        ) <= COIN_PICKUP_DISTANCE
    );

    if(!coin)
    {
        setMessage("Move closer to a coin.");
        return;
    }

    pickupMidpointReached = false;
    playPickupAnimation();
    if(isPickingUp)
    {
        pendingCoin = coin;
        setMessage("Picking up coin...");
        if(coinSound.context.state === "suspended")
            coinSound.context.resume();
    }
    else
    {
        coin.position.copy(getCoinSpawnPosition());
        finishCoinPickup();
    }
}

// [AUDIO] Award the coin and play its pickup effect exactly once.
function finishCoinPickup()
{
    if(pickupMidpointReached)
        return;

    pickupMidpointReached = true;
    if(pendingCoin)
        pendingCoin.visible = false;

    score++;
    updateScore();
    setMessage("Coin collected!");

    // Play the coin effect when the pickup is registered.
    if(coinSound.buffer)
        coinSound.play();
}

// Register a pickup at the midpoint of its reach animation.
function updatePickupProgress()
{
    if(!isPickingUp || !pickupAction || pickupMidpointReached)
        return;

    const midpoint = pickupAction.getClip().duration / 2;
    if(pickupAction.time >= midpoint)
        finishCoinPickup();
}

// Restore the idle pose and respawn the coin when pickup animation ends.
function finishPickupAnimation(event)
{
    if(event.action !== pickupAction)
        return;

    finishCoinPickup();
    isPickingUp = false;
    pickupAction.stop();
    if(pendingCoin)
    {
        pendingCoin.position.copy(getCoinSpawnPosition());
        pendingCoin.visible = true;
    }
    pendingCoin = undefined;
    idleAction?.reset().fadeIn(0.15).play();
}

// Set up an eased approach and turn from the chair's front or side.
function startSitting()
{
    if(!player || !chair || !sitAction || isSittingDown || isSitting || isPickingUp || isPistolDrawn)
        return;

    if(!isInChairSittingZone())
        return;

    isSittingDown = true;
    isWalking = false;
    walkAction?.fadeOut(0.15);
    idleAction?.fadeOut(0.15);

    const seatOffset = new THREE.Vector3(0, 0, 0.72)
        .applyQuaternion(chair.quaternion);
    sitStartPosition = player.position.clone();
    sitTargetPosition = chair.position.clone().add(seatOffset);
    sitStartRotation = player.rotation.y;
    sitTargetRotation = chair.rotation.y;
    sitTransitionTime = 0;

    sitAction.reset();
    sitAction.setLoop(THREE.LoopOnce, 1);
    sitAction.clampWhenFinished = true;
    sitAction.fadeIn(0.15).play();
    setMessage("Sitting down...");
}

// Test whether the player is beside the chair on its sit-accessible side.
function isInChairSittingZone()
{
    chair.updateMatrixWorld(true);
    const localPlayerPosition = chair.worldToLocal(player.position.clone());
    return localPlayerPosition.z >= 0
        && localPlayerPosition.z <= 1.8
        && Math.abs(localPlayerPosition.x) <= 1.8;
}

// Interpolate the player's position and rotation into the seat.
function updateSitTransition(delta)
{
    if(!isSittingDown)
        return;

    sitTransitionTime = Math.min(
        sitTransitionTime + delta,
        SIT_TRANSITION_DURATION
    );
    const linearProgress = sitTransitionTime / SIT_TRANSITION_DURATION;
    const easedProgress = linearProgress * linearProgress * (3 - 2 * linearProgress);
    const rotationDelta = THREE.MathUtils.euclideanModulo(
        sitTargetRotation - sitStartRotation + Math.PI,
        Math.PI * 2
    ) - Math.PI;

    player.position.lerpVectors(sitStartPosition, sitTargetPosition, easedProgress);
    player.rotation.y = sitStartRotation + rotationDelta * easedProgress;
}

// Lock the final seat pose after the sit-down clip finishes.
function finishSitDownAnimation(event)
{
    if(event.action !== sitAction)
        return;

    player.position.copy(sitTargetPosition);
    player.rotation.y = sitTargetRotation;
    isSittingDown = false;
    isSitting = true;
    sitAction.stop();
    sitIdleAction?.reset().play();
    setMessage("Press a movement key to stand.");
}

// Stop seated actions and let the next movement input stand the player up.
function standFromChair()
{
    if(!isSittingDown && !isSitting)
        return;

    isSittingDown = false;
    isSitting = false;
    chairSitCooldown = 0.75;
    sitAction?.stop();
    sitIdleAction?.stop();
    idleAction?.reset().fadeIn(0.15).play();
}

// Identify animation tracks that move the pistol arm.
function isRightArmTrack(track)
{
    return /Right(Shoulder|Arm|ForeArm|Hand)\.(quaternion|position)$/.test(track.name);
}

// Keep locomotion clips from pulling the gun arm away from its shooting pose.
function createLocomotionClipWithoutGunArm(clip)
{
    const bodyTracks = clip.tracks.filter(track=>!isRightArmTrack(track));
    return new THREE.AnimationClip(
        clip.name + "WithoutRightArm",
        clip.duration,
        bodyTracks
    );
}

// Create the player's idle, walk, pickup, sit, and arm-only shooting actions.
function setupPlayerAnimations(animations)
{
    const idleClip = animations.find(clip=>
        /idle/i.test(clip.name) && !/sit/i.test(clip.name)
    );
    const walkClip = animations.find(clip=>
        /walk/i.test(clip.name)
    ) || animations.find(clip=>
        /run/i.test(clip.name)
    );
    const pickupClip = animations.find(clip=>
        /pickup|pick.?up/i.test(clip.name)
    );
    const sitClip = animations.find(clip=>
        /sit.*down|sitting/i.test(clip.name) && !/idle/i.test(clip.name)
    );
    const sitIdleClip = animations.find(clip=>
        /sit.*idle/i.test(clip.name)
    );
    const shootClip = animations.find(clip=>
        /punch/i.test(clip.name)
    );
    if(idleClip)
    {
        idleAction = mixer.clipAction(createLocomotionClipWithoutGunArm(idleClip));
        idleAction.play();
    }

    if(walkClip)
        walkAction = mixer.clipAction(createLocomotionClipWithoutGunArm(walkClip));

    if(pickupClip)
        pickupAction = mixer.clipAction(pickupClip);

    if(sitClip)
        sitAction = mixer.clipAction(sitClip);

    if(sitIdleClip)
        sitIdleAction = mixer.clipAction(sitIdleClip);

    if(shootClip)
    {
        const rightArmTracks = shootClip.tracks.filter(isRightArmTrack);
        if(rightArmTracks.length > 0)
        {
            const armShootClip = new THREE.AnimationClip(
                "RightArmShoot",
                shootClip.duration,
                rightArmTracks
            );
            playerShootAction = mixer.clipAction(armShootClip);
        }
    }

    mixer.addEventListener("finished", finishPickupAnimation);
    mixer.addEventListener("finished", finishSitDownAnimation);
}

// Add the female model, initialize its animation mixer, and attach the pistol.
function onPlayerLoaded(gltf)
{
    player = gltf.scene;
    player.scale.set(1, 1, 1);
    scene.add(player);

    mixer = new THREE.AnimationMixer(player);
    setupPlayerAnimations(gltf.animations);
    setMessage("Move toward the chair to sit. Press a movement key to stand; Space collects nearby coins.");
    attachPistolToPlayer();
}

// Load the female character asset.
function loadPlayer()
{
    const loader = new GLTFLoader();
    loader.load(
        "models/female.glb",
        onPlayerLoaded,
        undefined,
        ()=>setMessage("The character model could not load. Check models/female.glb and the browser console.")
    );
}

// Attach the pistol to the right hand and align it with the arm.
function attachPistolToPlayer()
{
    if(!player || !pistol)
        return;

    rightHandBone = player.getObjectByName("RightHand");
    rightForeArmBone = player.getObjectByName("RightForeArm");
    if(!rightHandBone || !rightForeArmBone)
    {
        setMessage("The pistol could not attach because the right arm bones were not found.");
        return;
    }

    rightHandBone.add(pistol);
    pistol.position.set(0, 0.1, 0.1);
    pistol.scale.setScalar(0.28);
    pistol.visible = true;
    alignPistolWithArm();
    completePendingPistolShot();
}

// Align the barrel to the forearm's horizontal direction and the grip downward.
function alignPistolWithArm()
{
    if(!pistol || !rightForeArmBone || !rightHandBone)
        return;

    player.updateMatrixWorld(true);
    const foreArmPosition = rightForeArmBone.getWorldPosition(new THREE.Vector3());
    const handPosition = rightHandBone.getWorldPosition(new THREE.Vector3());
    const worldBarrelDirection = handPosition.sub(foreArmPosition);
    worldBarrelDirection.y = 0;
    if(worldBarrelDirection.lengthSq() < 0.0001)
    {
        worldBarrelDirection.set(0, 0, 1)
            .applyQuaternion(player.getWorldQuaternion(new THREE.Quaternion()));
        worldBarrelDirection.y = 0;
    }
    worldBarrelDirection.normalize();
    const handWorldRotation = rightHandBone.getWorldQuaternion(new THREE.Quaternion());
    const worldToHand = handWorldRotation.invert();
    const barrelAxis = worldBarrelDirection.applyQuaternion(worldToHand).normalize();
    const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(worldToHand);
    upAxis.addScaledVector(barrelAxis, -upAxis.dot(barrelAxis));

    if(upAxis.lengthSq() < 0.0001)
        upAxis.set(0, 0, 1).addScaledVector(barrelAxis, -barrelAxis.z);

    upAxis.normalize();
    const sideAxis = barrelAxis.clone().cross(upAxis).normalize();
    const handLocalOrientation = new THREE.Matrix4().makeBasis(
        barrelAxis,
        upAxis,
        sideAxis
    );
    pistol.quaternion.setFromRotationMatrix(handLocalOrientation);
}

// Load the pistol asset; attachment completes once both models are ready.
function loadPistol()
{
    const loader = new GLTFLoader();
    loader.load(
        "models/pistol.glb",
        gltf=>
        {
            pistol = gltf.scene;
            attachPistolToPlayer();
        },
        undefined,
        ()=>setMessage("The pistol model could not load. Check models/pistol.glb and the browser console.")
    );
}

// Create the enemy's idle, walk, and death animation actions.
function setupEnemyAnimations(animations)
{
    const idleClip = animations.find(clip=>
        /idle/i.test(clip.name)
    );
    const walkClip = animations.find(clip=>
        /walk/i.test(clip.name)
    ) || animations.find(clip=>
        /run/i.test(clip.name)
    );
    const deathClip = animations.find(clip=>
        /death|die/i.test(clip.name)
    );

    if(idleClip)
    {
        enemyIdleAction = enemyMixer.clipAction(idleClip);
        enemyIdleAction.play();
    }

    if(walkClip)
        enemyWalkAction = enemyMixer.clipAction(walkClip);

    if(deathClip)
        enemyDeathAction = enemyMixer.clipAction(deathClip);
}

// Add the enemy model and begin its random patrol.
function onEnemyLoaded(gltf)
{
    enemy = gltf.scene;
    enemy.position.set(-7, 0, 7);
    scene.add(enemy);

    enemyMixer = new THREE.AnimationMixer(enemy);
    setupEnemyAnimations(gltf.animations);
    chooseEnemyDestination();
    completePendingPistolShot();
}

// Load the roaming bad guy model.
function loadEnemy()
{
    const loader = new GLTFLoader();
    loader.load(
        "models/badguy.glb",
        onEnemyLoaded,
        undefined,
        ()=>setMessage("The bad guy model could not load. Check models/badguy.glb and the browser console.")
    );
}

// Select a random patrol destination that avoids the chair.
function chooseEnemyDestination()
{
    for(let attempt = 0; attempt < 20; attempt++)
    {
        const x = Math.random() * ENEMY_WANDER_RANGE * 2 - ENEMY_WANDER_RANGE;
        const z = Math.random() * ENEMY_WANDER_RANGE * 2 - ENEMY_WANDER_RANGE;
        const clearOfChair = !chair || Math.hypot(
            x - chair.position.x,
            z - chair.position.z
        ) > 2.5;

        if(clearOfChair)
            return new THREE.Vector3(x, 0, z);
    }

    return new THREE.Vector3(ENEMY_WANDER_RANGE, 0, ENEMY_WANDER_RANGE);
}

// Switch between the enemy's idle and patrol animations.
function setEnemyWalking(walking)
{
    if(isEnemyWalking === walking)
        return;

    if(walking)
    {
        enemyIdleAction?.fadeOut(0.15);
        enemyWalkAction?.reset().fadeIn(0.15).play();
    }
    else
    {
        enemyWalkAction?.fadeOut(0.15);
        enemyIdleAction?.reset().fadeIn(0.15).play();
    }

    isEnemyWalking = walking;
}

// [RAYCAST] Cast from the enemy to detect the player and trigger the pistol draw.
function updateEnemyDetectionRay()
{
    if(!enemy || enemyIsDead)
    {
        if(enemyRayLine)
            enemyRayLine.visible = false;
        return false;
    }

    enemy.updateMatrixWorld(true);
    const origin = enemy.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    const direction = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(enemy.quaternion)
        .normalize();
    let distanceToPlayer = Infinity;

    if(player)
    {
        player.updateMatrixWorld(true);
        const target = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        const toPlayer = target.sub(origin);
        distanceToPlayer = toPlayer.length();
        if(distanceToPlayer > 0)
            direction.copy(toPlayer).normalize();
    }

    enemyRaycaster.set(origin, direction);
    const rayEnd = enemyRaycaster.ray.at(
        ENEMY_DETECTION_RANGE,
        new THREE.Vector3()
    );
    enemyRayLine.geometry.setFromPoints([origin, rayEnd]);
    enemyRayLine.visible = true;

    const hits = player
        ? enemyRaycaster.intersectObject(player, true)
        : [];
    const detected = distanceToPlayer <= ENEMY_DETECTION_RANGE
        && hits.length > 0
        && hits[0].distance <= distanceToPlayer + 0.1;
    enemyRayLine.material.color.setHex(detected ? 0x52e878 : 0xff9e35);
    return detected;
}

// Equip the visible pistol and aim at the nearby enemy.
function drawPistol()
{
    if(isPistolDrawn || enemyIsDead)
        return;

    isPistolDrawn = true;
    clearPressedKeys();
    walkingSound?.stop();
    walkAction?.fadeOut(0.1);
    if(player)
        idleAction?.reset().fadeIn(0.1).play();
    isWalking = false;
    aimPistolAtEnemy();
    if(pistol)
        pistol.visible = true;
    setMessage("Pistol ready. Press F to fire.");
}

// Rotate the player toward the enemy before a shot.
function aimPistolAtEnemy()
{
    if(!enemy || !player || enemyIsDead)
        return;

    const directionX = enemy.position.x - player.position.x;
    const directionZ = enemy.position.z - player.position.z;
    player.rotation.y = Math.atan2(directionX, directionZ);
    isAimingAtEnemy = true;
}

// Stop the enemy and play its death animation after a confirmed ray hit.
function handlePistolHit()
{
    if(enemyIsDead)
        return;

    enemyIsDead = true;
    enemyTarget = undefined;
    setEnemyWalking(false);
    enemyWalkAction?.stop();
    enemyIdleAction?.fadeOut(0.1);

    if(enemyDeathAction)
    {
        enemyDeathAction.reset();
        enemyDeathAction.setLoop(THREE.LoopOnce, 1);
        enemyDeathAction.clampWhenFinished = true;
        enemyDeathAction.fadeIn(0.1).play();
    }

    setMessage("The shot hit the bad guy.");
}

// [RAYCAST] Cast from the pistol barrel; only an enemy mesh hit counts as a shot hit.
function firePistol()
{
    if(!isPistolDrawn)
        drawPistol();

    if(enemyIsDead)
        return;

    if(!pistol || !player || !enemy)
    {
        pistolShotPending = true;
        setMessage("Pistol loading...");
        return;
    }

    pistolShotPending = false;

    aimPistolAtEnemy();
    playPistolShootAnimation();
    player.updateMatrixWorld(true);
    alignPistolWithArm();
    pistol.updateWorldMatrix(true, true);

    const origin = pistol.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(pistol.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
    origin.addScaledVector(direction, 0.28);

    pistolRaycaster.set(origin, direction);
    enemy.updateMatrixWorld(true);
    const hits = pistolRaycaster.intersectObject(enemy, true);
    const hit = hits[0];
    const rayEnd = hit
        ? hit.point
        : pistolRaycaster.ray.at(PISTOL_SHOT_RANGE, new THREE.Vector3());

    pistolRayLine.geometry.setFromPoints([origin, rayEnd]);
    pistolRayLine.material.color.setHex(hit ? 0x52e878 : 0xffe45e);
    pistolRayLine.visible = true;
    pistolRayTime = PISTOL_RAY_DURATION;
    pistolBullet.position.copy(origin);
    pistolBulletDirection.copy(direction);
    pistolBulletDistance = origin.distanceTo(rayEnd);
    pistolBulletTravelled = 0;
    pistolBulletImpactTime = 0;
    pistolBullet.visible = true;

    if(hit)
        handlePistolHit();
    else
        setMessage("The shot missed.");
}

// Play the right-arm portion of the punch clip as a shooting pose.
function playPistolShootAnimation()
{
    if(!playerShootAction)
        return;

    playerShootAction.reset();
    playerShootAction.setLoop(THREE.LoopOnce, 1);
    playerShootAction.clampWhenFinished = false;
    playerShootAction.setEffectiveWeight(1);
    playerShootAction.time = Math.min(
        0.25,
        playerShootAction.getClip().duration * 0.35
    );
    playerShootAction.play();
    mixer.update(0);
    alignPistolWithArm();
}

// Fire a queued shot once the pistol, player, and enemy assets are loaded.
function completePendingPistolShot()
{
    if(pistolShotPending && pistol && player && enemy && !enemyIsDead)
        firePistol();
}

// Advance the visible bullet and briefly retain the shot's tracer.
function updatePistolShotRay(delta)
{
    if(pistolRayTime > 0)
    {
        pistolRayTime = Math.max(0, pistolRayTime - delta);
        if(pistolRayTime === 0)
            pistolRayLine.visible = false;
    }

    if(!pistolBullet.visible)
        return;

    const remainingDistance = pistolBulletDistance - pistolBulletTravelled;
    if(remainingDistance > 0)
    {
        const distanceThisFrame = Math.min(
            PISTOL_BULLET_SPEED * delta,
            remainingDistance
        );
        pistolBullet.position.addScaledVector(
            pistolBulletDirection,
            distanceThisFrame
        );
        pistolBulletTravelled += distanceThisFrame;
        if(pistolBulletTravelled >= pistolBulletDistance)
            pistolBulletImpactTime = 0.16;
    }
    else
    {
        pistolBulletImpactTime -= delta;
        if(pistolBulletImpactTime <= 0)
            pistolBullet.visible = false;
    }
}

// Patrol the enemy, test proximity by raycast, and react when the player is detected.
function updateEnemy(delta)
{
    const playerDetected = updateEnemyDetectionRay();
    if(!enemy || enemyIsDead)
        return;

    if(playerDetected && !isPickingUp && !isSittingDown && !isSitting)
        drawPistol();

    if(enemyPauseTime > 0)
    {
        enemyPauseTime = Math.max(0, enemyPauseTime - delta);
        setEnemyWalking(false);
        return;
    }

    if(!enemyTarget)
        enemyTarget = chooseEnemyDestination();

    const offsetX = enemyTarget.x - enemy.position.x;
    const offsetZ = enemyTarget.z - enemy.position.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if(distance < 0.15)
    {
        enemyTarget = undefined;
        enemyPauseTime = 0.3 + Math.random() * 0.8;
        setEnemyWalking(false);
        return;
    }

    const step = Math.min(ENEMY_SPEED * delta, distance);
    let nextPosition = {
        x: enemy.position.x + offsetX / distance * step,
        z: enemy.position.z + offsetZ / distance * step
    };
    nextPosition = resolvePlayerCollision(
        resolveCoinCollisions(resolveChairCollision(nextPosition))
    );

    if(Math.hypot(
        nextPosition.x - enemy.position.x,
        nextPosition.z - enemy.position.z
    ) < 0.001)
    {
        enemyTarget = undefined;
        setEnemyWalking(false);
        return;
    }

    enemy.position.x = nextPosition.x;
    enemy.position.z = nextPosition.z;
    enemy.rotation.y = Math.atan2(offsetX, offsetZ);
    setEnemyWalking(true);
}

// Convert keyboard codes and letter keys into common control names.
function getInputKey(event)
{
    return movementKeys[event.code] || event.key.toLowerCase();
}

// Track pressed keys and dispatch one-shot actions such as coin pickup and firing.
function onKeyDown(event)
{
    const key = getInputKey(event);

    if(["w", "a", "s", "d", " "].includes(key))
        event.preventDefault();

    keys[key] = true;

    if(["w", "a", "s", "d"].includes(key))
    {
        standFromChair();
        if(walkingSound?.context.state === "suspended")
            walkingSound.context.resume();
    }

    if(event.code === "Space" && !event.repeat)
        collectNearbyCoin();

    if(key === "f" && !event.repeat)
        firePistol();
}

// Clear the released key from movement state.
function onKeyUp(event)
{
    keys[getInputKey(event)] = false;
}

// Reset all held input, such as when a modal action starts.
function clearPressedKeys()
{
    for(const key of Object.keys(keys))
        keys[key] = false;
}

// Register the movement and window-focus keyboard handlers.
function setupKeyboardControls()
{
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearPressedKeys);
}

// Return normalized movement intent based on the currently held keys.
function getMovement()
{
    const x = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const z = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const length = Math.hypot(x, z);

    return { x, z, length, moving: length > 0 };
}

// [AUDIO] Sync the walking loop with movement while switching idle and walk clips.
function updateMovementAnimation(moving)
{
    const canWalk = moving
        && !isPickingUp
        && !isSittingDown
        && !isSitting;
    // Footsteps loop only while movement is allowed.
    if(canWalk && walkingSound?.buffer && !walkingSound.isPlaying)
        walkingSound.play();
    else if(!canWalk && walkingSound?.isPlaying)
        walkingSound.stop();

    if(isPickingUp || isSittingDown || isSitting)
        return;

    if(moving && walkAction && !isWalking)
    {
        idleAction?.fadeOut(0.15);
        walkAction.reset().fadeIn(0.15).play();
        isWalking = true;
    }
    else if(!moving && isWalking)
    {
        walkAction?.fadeOut(0.15);
        idleAction?.reset().fadeIn(0.15).play();
        isWalking = false;
    }
}

// Apply player movement, then clamp the proposed position against obstacles.
function updatePlayerPosition(delta, movement)
{
    if(!movement.moving || isPickingUp || isSittingDown || isSitting)
        return;

    const proposedPosition = {
        x: player.position.x + movement.x / movement.length * PLAYER_SPEED * delta,
        z: player.position.z + movement.z / movement.length * PLAYER_SPEED * delta
    };
    const resolvedPosition = resolvePlayerCollisions(proposedPosition);

    player.position.x = resolvedPosition.x;
    player.position.z = resolvedPosition.z;
    player.rotation.y = Math.atan2(movement.x, movement.z);
}

// Resolve player collisions in chair, coin, then enemy order.
function resolvePlayerCollisions(position)
{
    const positionWithChairCollision = resolveChairCollision(position);
    const positionWithCoinCollision = resolveCoinCollisions(positionWithChairCollision);
    return resolveEnemyCollision(positionWithCoinCollision);
}

// Keep the player outside the chair's collision radius.
function resolveChairCollision(position)
{
    if(!chair)
        return position;

    return resolveCircularCollision(
        position,
        chair.position.x,
        chair.position.z,
        CHAIR_COLLISION_RADIUS
    );
}

// Keep the player outside each visible coin's collision radius.
function resolveCoinCollisions(position)
{
    let resolvedPosition = position;
    for(const coin of coins)
    {
        if(!coin.visible)
            continue;

        resolvedPosition = resolveCircularCollision(
            resolvedPosition,
            coin.position.x,
            coin.position.z,
            COIN_COLLISION_RADIUS
        );
    }

    return resolvedPosition;
}

// Keep the player outside the living enemy's collision radius.
function resolveEnemyCollision(position)
{
    if(!enemy || enemyIsDead)
        return position;

    return resolveCircularCollision(
        position,
        enemy.position.x,
        enemy.position.z,
        CHARACTER_COLLISION_RADIUS
    );
}

// Keep the enemy outside the player's collision radius.
function resolvePlayerCollision(position)
{
    if(!player)
        return position;

    return resolveCircularCollision(
        position,
        player.position.x,
        player.position.z,
        CHARACTER_COLLISION_RADIUS
    );
}

// Push a proposed position onto the edge of a circular obstacle.
function resolveCircularCollision(position, obstacleX, obstacleZ, radius)
{
    const offsetX = position.x - obstacleX;
    const offsetZ = position.z - obstacleZ;
    const distance = Math.hypot(offsetX, offsetZ);

    if(distance >= radius)
        return position;

    const directionX = distance > 0 ? offsetX / distance : 0;
    const directionZ = distance > 0 ? offsetZ / distance : 1;
    return {
        x: obstacleX + directionX * radius,
        z: obstacleZ + directionZ * radius
    };
}

// Keep the camera centered over the player's current position.
function updateCamera()
{
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position);
}

// [RAYCAST] Cast from screen center to show camera aim and coin intersections.
function updateCameraDebugVisuals()
{
    camera.updateMatrixWorld(true);
    cameraHelper.update();
    debugRaycaster.setFromCamera(CENTER_SCREEN, camera);

    const coinHits = debugRaycaster.intersectObjects(
        coins.filter(coin=>coin.visible),
        false
    );
    const rayEnd = coinHits.length > 0
        ? coinHits[0].point
        : debugRaycaster.ray.at(RAYCAST_DEBUG_LENGTH, new THREE.Vector3());

    raycastLine.geometry.setFromPoints([
        debugRaycaster.ray.origin,
        rayEnd
    ]);

    const chairRay = updateChairInteraction();
    drawRaycastMap(rayEnd, chairRay);
}

// [RAYCAST] Cast forward from the player to show chair interaction distance.
function updateChairInteraction()
{
    if(!player || !chair)
    {
        chairRayLine.visible = false;
        return null;
    }

    const origin = player.position.clone().add(new THREE.Vector3(0, 0.78, 0));
    const direction = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(player.quaternion)
        .normalize();

    chair.updateMatrixWorld(true);
    chairRaycaster.set(origin, direction);
    const hits = chairRaycaster.intersectObject(chair, true);
    const end = hits.length > 0
        ? hits[0].point
        : chairRaycaster.ray.at(CHAIR_RAY_LENGTH, new THREE.Vector3());

    chairRayLine.visible = true;
    chairRayLine.geometry.setFromPoints([origin, end]);

    if(chairSitCooldown <= 0 && isInChairSittingZone())
        startSitting();

    return { origin, end };
}

// Draw a top-down map of camera, chair, player, and coin positions.
function drawRaycastMap(rayEnd, chairRay)
{
    const context = rayMapContext;
    const { width, height } = context.canvas;
    const scale = Math.min(width, height) / (RAYCAST_MAP_RANGE * 2);
    const toMap = (x, z)=>({
        x: width / 2 + x * scale,
        y: height / 2 + z * scale
    });

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#111820";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#34434d";
    context.lineWidth = 1;

    for(let grid = -RAYCAST_MAP_RANGE; grid <= RAYCAST_MAP_RANGE; grid += 5)
    {
        const vertical = toMap(grid, 0).x;
        const horizontal = toMap(0, grid).y;

        context.beginPath();
        context.moveTo(vertical, 0);
        context.lineTo(vertical, height);
        context.moveTo(0, horizontal);
        context.lineTo(width, horizontal);
        context.stroke();
    }

    context.fillStyle = "#f2f5f7";
    context.font = "11px sans-serif";
    context.fillText("CAMERA: RED  CHAIR: TEAL", 8, 14);

    const cameraPoint = toMap(camera.position.x, camera.position.z);
    const cameraRayPoint = toMap(rayEnd.x, rayEnd.z);
    context.strokeStyle = "#ff3b30";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cameraPoint.x, cameraPoint.y);
    context.lineTo(cameraRayPoint.x, cameraRayPoint.y);
    context.stroke();

    if(chairRay)
    {
        const chairOrigin = toMap(chairRay.origin.x, chairRay.origin.z);
        const chairEnd = toMap(chairRay.end.x, chairRay.end.z);
        context.strokeStyle = "#4de1c1";
        context.beginPath();
        context.moveTo(chairOrigin.x, chairOrigin.y);
        context.lineTo(chairEnd.x, chairEnd.y);
        context.stroke();
    }

    for(const coin of coins)
    {
        if(!coin.visible)
            continue;

        const point = toMap(coin.position.x, coin.position.z);
        context.fillStyle = "#ffd83d";
        context.beginPath();
        context.arc(point.x, point.y, 3, 0, Math.PI * 2);
        context.fill();
    }

    if(player)
    {
        const point = toMap(player.position.x, player.position.z);
        context.fillStyle = "#f2f5f7";
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
    }

    const direction = camera.getWorldDirection(new THREE.Vector3());
    context.save();
    context.translate(cameraPoint.x, cameraPoint.y);
    context.rotate(Math.atan2(direction.z, direction.x));
    context.fillStyle = "#4de1c1";
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
}

// Update player position and movement animation for this frame.
function updatePlayer(delta)
{
    if(!player)
        return;

    const movement = getMovement();
    updatePlayerPosition(delta, movement);
    updateMovementAnimation(movement.moving);
}

// Face the movement direction, or preserve aim while standing still.
function updatePlayerFacing(movement)
{
    if(!player)
        return;

    if(movement.moving && !isPickingUp && !isSittingDown && !isSitting)
    {
        player.rotation.y = Math.atan2(movement.x, movement.z);
        isAimingAtEnemy = false;
    }
    else if(isAimingAtEnemy)
    {
        aimPistolAtEnemy();
    }
}

// Run all per-frame updates, then render the current scene.
function animate()
{
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    chairSitCooldown = Math.max(0, chairSitCooldown - delta);
    updatePlayer(delta);
    updateEnemy(delta);

    if(mixer)
    {
        mixer.update(delta);
        updatePickupProgress();
    }
    if(enemyMixer)
        enemyMixer.update(delta);

    updatePlayerFacing(getMovement());
    alignPistolWithArm();
    updateSitTransition(delta);
    updatePistolShotRay(delta);
    if(player)
        updateCamera();
    updateCameraDebugVisuals();

    renderer.render(scene, camera);
}

// Keep the camera projection and renderer in sync with viewport size.
function handleResize()
{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Create the scene, load game assets, and start the render loop.
function initialize()
{
    scene = createScene();
    camera = createCamera();
    renderer = createRenderer();

    addLighting();
    addGround();
    createChair();
    createCoins();
    addCameraDebugVisuals();
    setupAudio();
    setupKeyboardControls();
    loadPlayer();
    loadEnemy();
    loadPistol();

    clock = new THREE.Clock();
    window.addEventListener("resize", handleResize);
    animate();
}

let clock;
initialize();