const PointerLockControls = THREE.PointerLockControls;

let camera, scene, renderer, controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let socket;
const players = new Map();
let playerHealth = 100;
const BULLET_SPEED = 70;
const DAMAGE_PER_HIT = 5;
const bullets = [];
const RESPAWN_TIME = 3; // seconds to wait before respawning
let isDead = false;
let respawnCountdown = 0;
let playerName = "";

const healthDisplay = document.getElementById("health");

// Add HUD constants near the top with other constants
const HUD_CONFIG = {
  HEALTH_COLOR: {
    HIGH: "#00ff00",
    MEDIUM: "#ffff00",
    LOW: "#ff4500",
  },
  WEAPON: {
    NAME: "Laser Pistol",
    DAMAGE: DAMAGE_PER_HIT,
    FIRE_RATE: "Medium",
  },
};

// Create bullet geometry and material (will be reused for all bullets)
const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
const bulletMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });

// Add a death overlay to the HTML
const deathOverlay = document.createElement("div");
deathOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 0, 0, 0.3);
    display: none;
    justify-content: center;
    align-items: center;
    font-family: Arial, sans-serif;
    font-size: 32px;
    color: white;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    z-index: 1000;
`;
document.body.appendChild(deathOverlay);

// Add login overlay
const loginOverlay = document.createElement("div");
loginOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
`;

const loginForm = document.createElement("div");
loginForm.style.cssText = `
    background: rgba(255, 255, 255, 0.1);
    padding: 30px;
    border-radius: 10px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    text-align: center;
`;

loginForm.innerHTML = `
    <h2 style="color: white; margin-bottom: 20px; font-family: Arial;">Enter Your Name</h2>
    <input type="text" id="playerNameInput" style="
        padding: 10px;
        font-size: 16px;
        width: 200px;
        margin-bottom: 15px;
        background: rgba(255, 255, 255, 0.9);
        border: none;
        border-radius: 5px;
    " placeholder="Your Name">
    <br>
    <button id="startButton" style="
        padding: 10px 20px;
        font-size: 16px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.3s;
    ">Start Game</button>
`;

loginOverlay.appendChild(loginForm);
document.body.appendChild(loginOverlay);

class HealthBar {
  constructor(name) {
    const geometry = new THREE.BoxGeometry(1, 0.1, 0.1);
    // Brighter colors for better visibility
    this.healthMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.backgroundMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    // Background (red) part of health bar
    this.backgroundMesh = new THREE.Mesh(geometry, this.backgroundMaterial);

    // Foreground (green) part of health bar
    this.healthMesh = new THREE.Mesh(geometry, this.healthMaterial);

    // Create a container for the health bar
    this.container = new THREE.Group();
    this.container.add(this.backgroundMesh);
    this.container.add(this.healthMesh);

    // Add player name
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 64;
    context.font = "bold 32px Arial";
    context.fillStyle = "white";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    const nameTexture = new THREE.CanvasTexture(canvas);
    const nameMaterial = new THREE.SpriteMaterial({
      map: nameTexture,
      transparent: true,
    });
    this.nameSprite = new THREE.Sprite(nameMaterial);
    this.nameSprite.scale.set(2, 0.5, 1);
    this.nameSprite.position.y = 0.5; // Position above health bar

    this.container.add(this.nameSprite);
    this.container.rotation.x = -Math.PI / 6;

    // Add an outline to make the health bar more visible
    const outlineGeometry = new THREE.BoxGeometry(1.05, 0.15, 0.15);
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
    });
    this.outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
    this.container.add(this.outline);
  }

  setHealth(health) {
    // Scale the green bar based on health percentage
    const healthPercent = Math.max(0, health) / 100;
    this.healthMesh.scale.x = healthPercent;
    this.healthMesh.position.x = -(1 - healthPercent) / 2;

    // Change color based on health level
    if (health > 60) {
      this.healthMaterial.color.setHex(0x00ff00); // Green
    } else if (health > 30) {
      this.healthMaterial.color.setHex(0xffff00); // Yellow
    } else {
      this.healthMaterial.color.setHex(0xff4500); // Orange-Red
    }

    // Add a quick scale animation when taking damage
    this.container.scale.y = 1.5;
    setTimeout(() => {
      this.container.scale.y = 1;
    }, 100);
  }

  setPosition(x, y, z) {
    this.container.position.set(x, y + 2.5, z); // Position above player
  }
}

class Bullet {
  constructor(position, direction) {
    this.mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
    this.mesh.position.copy(position);
    this.direction = direction.normalize();
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.timeAlive = 0;
    this.maxLifetime = 3; // Seconds before bullet is removed
  }

  update(delta) {
    this.timeAlive += delta;
    if (this.timeAlive > this.maxLifetime) {
      return false; // Bullet should be removed
    }

    // Move bullet
    this.mesh.position.add(this.direction.multiplyScalar(BULLET_SPEED * delta));

    // Check for collisions with players
    for (const [playerId, player] of players) {
      const bulletPos = this.mesh.position;
      const playerPos = player.mesh.position;
      const distance = bulletPos.distanceTo(playerPos);

      if (distance < 1.5) {
        // Hit detection radius
        socket.emit("playerHit", {
          hitPlayerId: playerId,
          damage: DAMAGE_PER_HIT,
        });
        return false; // Bullet hit something, should be removed
      }
    }

    return true; // Bullet should continue existing
  }

  remove() {
    scene.remove(this.mesh);
  }
}

// Add functions to create environmental objects
function createTree(x, z) {
  const treeGroup = new THREE.Group();

  // Create tree trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
  const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x4a2f00 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1;
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  // Create tree leaves
  const leavesGeometry = new THREE.ConeGeometry(1.5, 3, 8);
  const leavesMaterial = new THREE.MeshPhongMaterial({ color: 0x0f5f00 });
  const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
  leaves.position.y = 3.5;
  leaves.castShadow = true;
  leaves.receiveShadow = true;

  treeGroup.add(trunk);
  treeGroup.add(leaves);
  treeGroup.position.set(x, 0, z);

  return treeGroup;
}

function createBuilding(x, z, width, height, depth) {
  const buildingGroup = new THREE.Group();

  // Main building structure
  const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
  const buildingMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });
  const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
  building.position.y = height / 2;
  building.castShadow = true;
  building.receiveShadow = true;

  // Add windows
  const windowMaterial = new THREE.MeshPhongMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.7,
  });
  const windowSize = 0.5;
  const windowSpacing = 1.5;

  for (let y = 1; y < height - 1; y += windowSpacing) {
    for (let x = -width / 2 + 1; x < width / 2; x += windowSpacing) {
      const windowGeometry = new THREE.BoxGeometry(windowSize, windowSize, 0.1);
      const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
      windowMesh.position.set(x, y, depth / 2 + 0.1);
      buildingGroup.add(windowMesh);

      // Add windows to the back side
      const backWindow = windowMesh.clone();
      backWindow.position.z = -depth / 2 - 0.1;
      buildingGroup.add(backWindow);
    }
  }

  // Add a roof
  const roofGeometry = new THREE.ConeGeometry(
    Math.max(width, depth) / 1.5,
    height / 4,
    4
  );
  const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x502020 });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = height + height / 8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.receiveShadow = true;

  buildingGroup.add(building);
  buildingGroup.add(roof);
  buildingGroup.position.set(x, 0, z);

  return buildingGroup;
}

function createBarrier(x, z, width, height) {
  const barrierGeometry = new THREE.BoxGeometry(width, height, 0.3);
  const barrierMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
  const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
  barrier.position.set(x, height / 2, z);
  barrier.castShadow = true;
  barrier.receiveShadow = true;
  return barrier;
}

function createEnvironment() {
  // Add trees (more trees for larger map)
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 160 - 80; // Doubled the area
    const z = Math.random() * 160 - 80;
    if (Math.abs(x) > 15 || Math.abs(z) > 15) {
      // Larger spawn area
      scene.add(createTree(x, z));
    }
  }

  // Add buildings (spread out more)
  scene.add(createBuilding(-30, -30, 12, 18, 12));
  scene.add(createBuilding(30, -30, 10, 15, 10));
  scene.add(createBuilding(30, 30, 15, 20, 15));
  scene.add(createBuilding(-30, 30, 12, 16, 12));

  // Add more buildings for larger map
  scene.add(createBuilding(0, -50, 10, 14, 10));
  scene.add(createBuilding(-50, 0, 12, 16, 12));
  scene.add(createBuilding(50, 0, 14, 18, 14));
  scene.add(createBuilding(0, 50, 11, 15, 11));

  // Add barriers for cover (spread out more)
  scene.add(createBarrier(0, 20, 6, 2.5));
  scene.add(createBarrier(20, 0, 6, 2.5));
  scene.add(createBarrier(-20, 0, 6, 2.5));
  scene.add(createBarrier(0, -20, 6, 2.5));

  // Add more random barriers
  for (let i = 0; i < 16; i++) {
    // Doubled the number of barriers
    const x = Math.random() * 100 - 50;
    const z = Math.random() * 100 - 50;
    if (Math.abs(x) > 10 || Math.abs(z) > 10) {
      // Keep spawn area clear
      scene.add(createBarrier(x, z, 4, 2));
    }
  }
}

// Create HUD elements
const hudContainer = document.createElement("div");
hudContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    color: white;
    font-family: 'Arial', sans-serif;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    user-select: none;
`;

const healthBar = document.createElement("div");
healthBar.style.cssText = `
    width: 200px;
    height: 20px;
    background: rgba(255, 0, 0, 0.3);
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 10px;
`;

const healthFill = document.createElement("div");
healthFill.style.cssText = `
    width: 100%;
    height: 100%;
    background: ${HUD_CONFIG.HEALTH_COLOR.HIGH};
    transition: width 0.3s ease, background-color 0.3s ease;
`;
healthBar.appendChild(healthFill);

const healthText = document.createElement("div");
healthText.style.cssText = `
    position: absolute;
    top: 0;
    left: 10px;
    line-height: 20px;
    font-weight: bold;
`;
healthBar.appendChild(healthText);

const weaponInfo = document.createElement("div");
weaponInfo.style.cssText = `
    background: rgba(0, 0, 0, 0.5);
    padding: 10px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.3);
`;

hudContainer.appendChild(healthBar);
hudContainer.appendChild(weaponInfo);
document.body.appendChild(hudContainer);

// Add updateHUD function
function updateHUD() {
  // Update health bar
  const healthPercent = Math.max(0, playerHealth) / 100;
  healthFill.style.width = `${healthPercent * 100}%`;
  healthText.textContent = `Health: ${Math.max(0, playerHealth)}`;

  // Update health bar color based on health level
  if (playerHealth > 60) {
    healthFill.style.background = HUD_CONFIG.HEALTH_COLOR.HIGH;
  } else if (playerHealth > 30) {
    healthFill.style.background = HUD_CONFIG.HEALTH_COLOR.MEDIUM;
  } else {
    healthFill.style.background = HUD_CONFIG.HEALTH_COLOR.LOW;
  }

  // Update weapon info
  weaponInfo.innerHTML = `
        <div style="font-size: 14px; margin-bottom: 5px; color: #00ffff;">
            ${HUD_CONFIG.WEAPON.NAME}
        </div>
        <div style="font-size: 12px; color: #ffffff80;">
            Damage: ${HUD_CONFIG.WEAPON.DAMAGE} | Fire Rate: ${HUD_CONFIG.WEAPON.FIRE_RATE}
        </div>
    `;
}

let isRunning = false;
let runStartTime = 0;
const WALK_SPEED = 33.3; // 100/3
const RUN_SPEED = 66.7; // 200/3
const RUN_DURATION = 5000; // 5 seconds in milliseconds

init();
animate();

function init() {
  // Add login handler before initializing the game
  const startButton = document.getElementById("startButton");
  const nameInput = document.getElementById("playerNameInput");

  startButton.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (name.length >= 2 && name.length <= 15) {
      playerName = name;
      loginOverlay.style.display = "none";
      initializeGame();
    } else {
      alert("Please enter a name between 2 and 15 characters!");
    }
  });

  nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      startButton.click();
    }
  });
}

function initializeGame() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.y = 2;

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // Controls setup
  controls = new THREE.PointerLockControls(camera, document.body);

  // Click to start
  document.addEventListener("click", function () {
    controls.lock();
  });

  controls.addEventListener("lock", function () {
    console.log("Controls locked");
  });

  controls.addEventListener("unlock", function () {
    console.log("Controls unlocked");
  });

  // Movement
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  // Floor (larger size)
  const floorGeometry = new THREE.PlaneGeometry(200, 200); // Doubled the floor size
  const floorMaterial = new THREE.MeshPhongMaterial({
    color: 0x404040,
    roughness: 0.8, // Make the floor less slippery looking
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Enhanced lighting (adjusted for larger map)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 100, 0); // Moved further out
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 4096; // Increased shadow resolution
  directionalLight.shadow.mapSize.height = 4096;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 1000;
  directionalLight.shadow.camera.left = -100;
  directionalLight.shadow.camera.right = 100;
  directionalLight.shadow.camera.top = 100;
  directionalLight.shadow.camera.bottom = -100;
  scene.add(directionalLight);

  // Add environmental objects
  createEnvironment();

  // Socket.io setup
  socket = io();

  // Send player name to server
  socket.emit('playerName', playerName);

  socket.on("currentPlayers", (serverPlayers) => {
    console.log('Received current players:', serverPlayers);
    serverPlayers.forEach((playerData) => {
      if (playerData.id !== socket.id) {
        console.log('Adding player:', playerData);
        addPlayer(playerData);
      }
    });
  });

  socket.on("playerJoined", (playerData) => {
    console.log('New player joined:', playerData);
    if (playerData.id !== socket.id) {
      addPlayer(playerData);
    }
  });

  socket.on("playerLeft", (playerId) => {
    removePlayer(playerId);
  });

  socket.on("playerMoved", (playerData) => {
    const player = players.get(playerData.id);
    if (player) {
      player.mesh.position.copy(playerData.position);
      player.mesh.rotation.copy(playerData.rotation);
      player.healthBar.setPosition(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );
    }
  });

  socket.on("playerHealthUpdate", (data) => {
    const player = players.get(data.id);
    if (player) {
      if (data.id === socket.id) {
        // Update local player health
        playerHealth = data.health;
        updateHUD();

        // Check for death
        if (playerHealth <= 0 && !isDead) {
          handleDeath();
        }

        // Enhanced visual feedback when hit
        if (data.damage && !isDead) {
          // Red flash effect with increased intensity based on damage
          const flashIntensity = Math.min(0.5, data.damage / 20);
          document.body.style.backgroundColor = `rgba(255,0,0,${flashIntensity})`;
          setTimeout(() => {
            document.body.style.backgroundColor = `rgba(255,0,0,${
              flashIntensity / 2
            })`;
            setTimeout(() => {
              document.body.style.backgroundColor = "transparent";
            }, 100);
          }, 100);

          // Shake effect on camera with intensity based on damage
          const shakeIntensity = data.damage / 10;
          const originalPosition = camera.position.clone();
          const shake = () => {
            camera.position.x =
              originalPosition.x + (Math.random() - 0.5) * shakeIntensity;
            camera.position.z =
              originalPosition.z + (Math.random() - 0.5) * shakeIntensity;
          };

          let shakeCount = 0;
          const shakeInterval = setInterval(() => {
            shake();
            shakeCount++;
            if (shakeCount > 5) {
              clearInterval(shakeInterval);
              camera.position.copy(originalPosition);
            }
          }, 50);

          // Add damage number popup
          const damagePopup = document.createElement("div");
          damagePopup.style.cssText = `
                    position: fixed;
                    color: #ff3333;
                    font-size: 24px;
                    font-weight: bold;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
                    pointer-events: none;
                    user-select: none;
                    animation: fadeUp 0.5s ease-out forwards;
                `;
          damagePopup.textContent = `-${data.damage}`;

          // Position popup randomly near the center of the screen
          const randomX = Math.random() * 100 - 50;
          const randomY = Math.random() * 50 - 25;
          damagePopup.style.left = `calc(50% + ${randomX}px)`;
          damagePopup.style.top = `calc(50% + ${randomY}px)`;

          // Add animation keyframes if they don't exist
          if (!document.querySelector("#damage-animation")) {
            const style = document.createElement("style");
            style.id = "damage-animation";
            style.textContent = `
                        @keyframes fadeUp {
                            0% {
                                opacity: 1;
                                transform: translateY(0);
                            }
                            100% {
                                opacity: 0;
                                transform: translateY(-50px);
                            }
                        }
                    `;
            document.head.appendChild(style);
          }

          document.body.appendChild(damagePopup);
          setTimeout(() => {
            document.body.removeChild(damagePopup);
          }, 500);
        }
      }

      // Update other player's health bar
      player.healthBar.setHealth(data.health);
    }
  });

  // Shooting
  document.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      // Left click
      shoot();
    }
  });

  // Handle remote player shots
  socket.on("playerShot", (data) => {
    const bulletStartPos = new THREE.Vector3(...data.origin);
    const bulletDirection = new THREE.Vector3(...data.direction);
    const bullet = new Bullet(bulletStartPos, bulletDirection);
    bullets.push(bullet);
  });

  // Handle initial players and new player joins
  socket.on('currentPlayers', (playerList) => {
    playerList.forEach(playerData => {
      if (playerData.id !== socket.id) {
        addPlayer(playerData);
      }
    });
  });

  socket.on('playerJoined', (playerData) => {
    if (playerData.id !== socket.id) {
      addPlayer(playerData);
    }
  });

  // Handle player movement updates
  socket.on('playerMoved', (playerData) => {
    const player = players.get(playerData.id);
    if (player) {
      player.mesh.position.copy(playerData.position);
      player.healthBar.setPosition(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );
    }
  });

  // Initialize HUD
  updateHUD();

  window.addEventListener("resize", onWindowResize, false);
}

function addPlayer(playerData) {
  console.log('Adding player with data:', playerData);
  
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const material = new THREE.MeshPhongMaterial({ 
    color: 0xff0000,
    transparent: false,
    opacity: 1
  });
  const playerMesh = new THREE.Mesh(geometry, material);
  
  // Ensure position is properly set
  if (playerData.position.x !== undefined) {
    playerMesh.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );
  } else if (Array.isArray(playerData.position)) {
    playerMesh.position.set(
      playerData.position[0],
      playerData.position[1],
      playerData.position[2]
    );
  }
  
  playerMesh.castShadow = true;
  playerMesh.receiveShadow = true;
  playerMesh.visible = true;

  // Create and add health bar with player name
  const healthBar = new HealthBar(playerData.name);
  healthBar.setHealth(playerData.health || 100);
  healthBar.setPosition(
    playerMesh.position.x,
    playerMesh.position.y,
    playerMesh.position.z
  );

  // Add health bar to scene
  scene.add(healthBar.container);

  // Store both player mesh and health bar
  players.set(playerData.id, {
    mesh: playerMesh,
    healthBar: healthBar,
    name: playerData.name,
  });

  scene.add(playerMesh);
  console.log('Player mesh added to scene:', playerMesh);
}

function removePlayer(playerId) {
  const player = players.get(playerId);
  if (player) {
    scene.remove(player.mesh);
    scene.remove(player.healthBar.container);
    players.delete(playerId);
  }
}

function shoot() {
  if (isDead) return; // Don't allow shooting while dead

  const bulletStartPos = camera.position.clone();
  bulletStartPos.add(
    camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1)
  );

  const bulletDirection = camera.getWorldDirection(new THREE.Vector3());
  const bullet = new Bullet(bulletStartPos, bulletDirection);
  bullets.push(bullet);

  socket.emit("playerShoot", {
    origin: bulletStartPos.toArray(),
    direction: bulletDirection.toArray(),
  });
}

function onKeyDown(event) {
  if (isDead) return; // Don't allow movement while dead

  switch (event.code) {
    case "ShiftLeft":
    case "ShiftRight":
      if (!isRunning) {
        isRunning = true;
        runStartTime = Date.now();
      }
      break;
    case "ArrowUp":
    case "KeyW":
      moveForward = true;
      break;
    case "ArrowDown":
    case "KeyS":
      moveBackward = true;
      break;
    case "ArrowLeft":
    case "KeyA":
      moveLeft = true;
      break;
    case "ArrowRight":
    case "KeyD":
      moveRight = true;
      break;
    case "Space":
      if (canJump) velocity.y += 350;
      canJump = false;
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case "ShiftLeft":
    case "ShiftRight":
      isRunning = false;
      break;
    case "ArrowUp":
    case "KeyW":
      moveForward = false;
      break;
    case "ArrowDown":
    case "KeyS":
      moveBackward = false;
      break;
    case "ArrowLeft":
    case "KeyA":
      moveLeft = false;
      break;
    case "ArrowRight":
    case "KeyD":
      moveRight = false;
      break;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // Make all health bars face the camera
  players.forEach((player) => {
    player.healthBar.container.lookAt(
      camera.position.x,
      player.healthBar.container.position.y,
      camera.position.z
    );
  });

  const delta = 0.1; // Time step

  // Update all bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const shouldKeepBullet = bullet.update(delta);
    if (!shouldKeepBullet) {
      bullet.remove();
      bullets.splice(i, 1);
    }
  }

  if (controls.isLocked) {
    const delta = 0.1;

    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 9.8 * 100.0 * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    // Check if running duration exceeded
    if (isRunning && Date.now() - runStartTime > RUN_DURATION) {
      isRunning = false;
    }

    const currentSpeed = isRunning ? RUN_SPEED : WALK_SPEED;

    if (moveForward || moveBackward) velocity.z -= direction.z * currentSpeed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * currentSpeed * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    camera.position.y += velocity.y * delta;

    if (camera.position.y < 2) {
      velocity.y = 0;
      camera.position.y = 2;
      canJump = true;
    }

    // Emit player position update
    socket.emit('playerMovement', {
      position: camera.position,
      rotation: camera.rotation
    });

    // Send position update to server
    socket.emit("playerMovement", {
      position: camera.position,
      rotation: camera.rotation,
    });
  }

  renderer.render(scene, camera);
}

// Add death handling functions
function handleDeath() {
  isDead = true;
  controls.unlock(); // Release mouse control

  // Show death overlay
  deathOverlay.style.display = "flex";
  respawnCountdown = RESPAWN_TIME;
  updateDeathOverlay();

  // Disable movement
  moveForward = moveBackward = moveLeft = moveRight = false;

  // Start respawn countdown
  const countdownInterval = setInterval(() => {
    respawnCountdown--;
    updateDeathOverlay();

    if (respawnCountdown <= 0) {
      clearInterval(countdownInterval);
      respawn();
    }
  }, 1000);
}

function updateDeathOverlay() {
  deathOverlay.innerHTML = `
    <div style="text-align: center">
      <h1 style="color: #ff0000; margin-bottom: 20px">YOU DIED!</h1>
      <p>Respawning in ${respawnCountdown} seconds...</p>
    </div>
  `;
}

function respawn() {
  isDead = false;
  deathOverlay.style.display = "none";

  // Request new spawn position from server
  socket.emit("requestRespawn");
}

// Update the respawn handler to update HUD
socket.on("respawnPosition", (position) => {
  if (isDead) {
    // Set new position
    camera.position.set(position.x, position.y, position.z);
    // Reset health
    playerHealth = 100;
    updateHUD(); // Update HUD after respawn
    // Re-enable controls
    controls.lock();
  }
});
