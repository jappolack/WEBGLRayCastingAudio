import * as THREE from
'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

import { GLTFLoader } from
'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const COIN_COUNT = 5;
const COIN_PICKUP_DISTANCE = 1.5;
const PLAYER_SPEED = 5;
const CHAIR_RAY_LENGTH = 2.5;
const CHAIR_POSITION = new THREE.Vector3(0, 0, -5);
const RAYCAST_DEBUG_LENGTH = 30;
const RAYCAST_MAP_RANGE = 15;
const CENTER_SCREEN = new THREE.Vector2(0, 0);
const debugRaycaster = new THREE.Raycaster();
debugRaycaster.far = RAYCAST_DEBUG_LENGTH;
const chairRaycaster = new THREE.Raycaster();
chairRaycaster.far = CHAIR_RAY_LENGTH;

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
let rayMapContext;
let coinSound;
let chair;
let player;
let mixer;
let idleAction;
let walkAction;
let pickupAction;
let sitAction;
let sitIdleAction;
let score = 0;
let isWalking = false;
let isPickingUp = false;
let isSittingDown = false;
let isSitting = false;
let chairSitCooldown = 0;
let pendingCoin;
let pickupMidpointReached = false;

function createScene()
{
    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0x87ceeb);
    return newScene;
}

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
}

function addLighting()
{
    scene.add(new THREE.AmbientLight(0xffffff, 2));

    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 15, 10);
    scene.add(sun);
}

function addGround()
{
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x55aa55 })
    );

    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
}

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
    chair.rotation.y = Math.PI;
    scene.add(chair);
}

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

function createCoins()
{
    for(let index = 0; index < COIN_COUNT; index++)
        createCoin();
}

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
}

function setMessage(message)
{
    document.getElementById("message").textContent = message;
}

function updateScore()
{
    document.getElementById("score").textContent = "Score: " + score;
}

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

function collectNearbyCoin()
{
    if(!player || isPickingUp || isSittingDown || isSitting)
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

    if(coinSound.buffer)
        coinSound.play();
}

function updatePickupProgress()
{
    if(!isPickingUp || !pickupAction || pickupMidpointReached)
        return;

    const midpoint = pickupAction.getClip().duration / 2;
    if(pickupAction.time >= midpoint)
        finishCoinPickup();
}

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

function startSitting()
{
    if(!sitAction || isSittingDown || isSitting || isPickingUp)
        return;

    isSittingDown = true;
    isWalking = false;
    walkAction?.fadeOut(0.15);
    idleAction?.fadeOut(0.15);

    const seatOffset = new THREE.Vector3(0, 0, -0.25)
        .applyQuaternion(chair.quaternion);
    player.position.copy(chair.position).add(seatOffset);
    player.rotation.y = chair.rotation.y;

    sitAction.reset();
    sitAction.setLoop(THREE.LoopOnce, 1);
    sitAction.clampWhenFinished = true;
    sitAction.fadeIn(0.15).play();
    setMessage("Sitting down...");
}

function finishSitDownAnimation(event)
{
    if(event.action !== sitAction)
        return;

    isSittingDown = false;
    isSitting = true;
    sitAction.stop();
    sitIdleAction?.reset().play();
    setMessage("Press a movement key to stand.");
}

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

    if(idleClip)
    {
        idleAction = mixer.clipAction(idleClip);
        idleAction.play();
    }

    if(walkClip)
        walkAction = mixer.clipAction(walkClip);

    if(pickupClip)
        pickupAction = mixer.clipAction(pickupClip);

    if(sitClip)
        sitAction = mixer.clipAction(sitClip);

    if(sitIdleClip)
        sitIdleAction = mixer.clipAction(sitIdleClip);

    mixer.addEventListener("finished", finishPickupAnimation);
    mixer.addEventListener("finished", finishSitDownAnimation);
}

function onPlayerLoaded(gltf)
{
    player = gltf.scene;
    player.scale.set(1, 1, 1);
    scene.add(player);

    mixer = new THREE.AnimationMixer(player);
    setupPlayerAnimations(gltf.animations);
    setMessage("Move toward the chair to sit. Press a movement key to stand; Space collects nearby coins.");
}

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

function getInputKey(event)
{
    return movementKeys[event.code] || event.key.toLowerCase();
}

function onKeyDown(event)
{
    const key = getInputKey(event);

    if(["w", "a", "s", "d", " "].includes(key))
        event.preventDefault();

    keys[key] = true;

    if(["w", "a", "s", "d"].includes(key))
        standFromChair();

    if(event.code === "Space" && !event.repeat)
        collectNearbyCoin();
}

function onKeyUp(event)
{
    keys[getInputKey(event)] = false;
}

function clearPressedKeys()
{
    for(const key of Object.keys(keys))
        keys[key] = false;
}

function setupKeyboardControls()
{
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearPressedKeys);
}

function getMovement()
{
    const x = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const z = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const length = Math.hypot(x, z);

    return { x, z, length, moving: length > 0 };
}

function updateMovementAnimation(moving)
{
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

function updatePlayerPosition(delta, movement)
{
    if(!movement.moving || isPickingUp || isSittingDown || isSitting)
        return;

    player.position.x += movement.x / movement.length * PLAYER_SPEED * delta;
    player.position.z += movement.z / movement.length * PLAYER_SPEED * delta;
    player.rotation.y = Math.atan2(movement.x, movement.z);
}

function updateCamera()
{
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position);
}

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

    drawRaycastMap(rayEnd);
}

function drawRaycastMap(rayEnd)
{
    const context = rayMapContext;
    const { width, height } = context.canvas;
    const scale = Math.min(width, height) / (RAYCAST_MAP_RANGE * 2);
    const toMap = (x, z)=>({
        x: width / 2 + x * scale,
        y: height / 2 + z * scale
    });
    const chairRay = updateChairInteraction();
    drawRaycastMap(rayEnd, chairRay);
}

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

        if(hits.length > 0 && chairSitCooldown <= 0)
            startSitting();

        return { origin, end };
    }

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
            context.lineWidth = 2;
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

function initialize()
{
    scene = createScene();
    camera = createCamera();
    renderer = createRenderer();

    addLighting();
    addGround();
    createCoins();
    addCameraDebugVisuals();
    setupAudio();
    setupKeyboardControls();
    loadPlayer();

    clock = new THREE.Clock();
    window.addEventListener("resize", handleResize);
    animate();
}

let clock;
initialize();