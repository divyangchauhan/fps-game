const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

const PORT = process.env.PORT || 3000;

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, "../client")));

// Add a route for the root path
app.get("/", (req, res) => {
  console.log("Serving index.html");
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// Store connected players
const players = new Map();

// Add spawn point system
const spawnPoints = [
  { x: -70, y: 2, z: -70 },
  { x: 70, y: 2, z: -70 },
  { x: -70, y: 2, z: 70 },
  { x: 70, y: 2, z: 70 },
  { x: 0, y: 2, z: -50 },
  { x: 0, y: 2, z: 50 },
  { x: -50, y: 2, z: 0 },
  { x: 50, y: 2, z: 0 },
  { x: -35, y: 2, z: -35 },
  { x: 35, y: 2, z: 35 },
  { x: -35, y: 2, z: 35 },
  { x: 35, y: 2, z: -35 },
];

// Function to find a safe spawn point
function findSafeSpawnPoint() {
  // Shuffle spawn points
  const shuffledSpawns = [...spawnPoints].sort(() => Math.random() - 0.5);

  // Get all current player positions
  const playerPositions = Array.from(players.values()).map((p) => p.position);

  // Find first spawn point that's far enough from all players
  for (const spawn of shuffledSpawns) {
    let isSafe = true;
    for (const playerPos of playerPositions) {
      const distance = Math.sqrt(
        Math.pow(spawn.x - playerPos.x, 2) + Math.pow(spawn.z - playerPos.z, 2)
      );
      if (distance < 20) {
        // Minimum 20 units away from other players
        isSafe = false;
        break;
      }
    }
    if (isSafe) return spawn;
  }

  // If no safe spawn found, return a random spawn point
  return shuffledSpawns[0];
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  // Wait for player name before initializing
  socket.on("playerName", (name) => {
    // Sanitize name
    const sanitizedName = name.trim().slice(0, 15);

    // Initialize player with name
    players.set(socket.id, {
      id: socket.id,
      name: sanitizedName,
      position: findSafeSpawnPoint(),
      rotation: { x: 0, y: 0, z: 0 },
      health: 100,
      lives: 3,
      inactive: false,
      invulnerable: true,
      invulnerableUntil: Date.now() + 3000, // 3 seconds of invulnerability
      lastActivity: Date.now(),
    });

    console.log('Player initialized:', players.get(socket.id));
    
    // Send current players to the new player
    const currentPlayers = Array.from(players.values());
    console.log('Sending current players to new player:', currentPlayers);
    socket.emit("currentPlayers", currentPlayers);

    // Notify other players that a new player joined
    const newPlayer = players.get(socket.id);
    console.log('Broadcasting new player to others:', newPlayer);
    socket.broadcast.emit("playerJoined", newPlayer);
  });

  // Handle player movement
  socket.on("playerMovement", (movementData) => {
    const player = players.get(socket.id);
    if (player && !player.inactive) {
      // Ensure position data is properly formatted
      if (movementData.position) {
        player.position = {
          x: typeof movementData.position.x === 'number' ? movementData.position.x : movementData.position[0],
          y: typeof movementData.position.y === 'number' ? movementData.position.y : movementData.position[1],
          z: typeof movementData.position.z === 'number' ? movementData.position.z : movementData.position[2]
        };
      }
      
      if (movementData.rotation) {
        player.rotation = {
          x: typeof movementData.rotation.x === 'number' ? movementData.rotation.x : movementData.rotation[0],
          y: typeof movementData.rotation.y === 'number' ? movementData.rotation.y : movementData.rotation[1],
          z: typeof movementData.rotation.z === 'number' ? movementData.rotation.z : movementData.rotation[2]
        };
      }
      
      // Include health in movement updates
      const playerData = {
        id: player.id,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        name: player.name,
        inactive: false
      };
      
      socket.broadcast.emit("playerMoved", playerData);

      // Update last activity timestamp
      player.lastActivity = Date.now();
    }
  });

  // Handle player inactivity
  socket.on("playerInactive", () => {
    const player = players.get(socket.id);
    if (player) {
      player.inactive = true;
      socket.broadcast.emit("playerInactive", socket.id);
    }
  });

  // Handle position sync request
  socket.on("requestSync", () => {
    const player = players.get(socket.id);
    if (player) {
      player.inactive = false;
      // Send current state of all players to the requesting player
      socket.emit("currentPlayers", Array.from(players.values()));
    }
  });

  // Handle shooting
  socket.on("playerShoot", (shootData) => {
    socket.broadcast.emit("playerShot", {
      playerId: socket.id,
      origin: shootData.origin,
      direction: shootData.direction,
    });
  });

  // Handle player hit
  socket.on("playerHit", (data) => {
    const hitPlayer = players.get(data.hitPlayerId);
    if (hitPlayer) {
      // Check if player is invulnerable
      if (hitPlayer.invulnerable && Date.now() < hitPlayer.invulnerableUntil) {
        return; // Skip damage if player is invulnerable
      }
      console.log('Player hit:', data.hitPlayerId, 'Current health:', hitPlayer.health, 'Damage:', data.damage);
      hitPlayer.health -= data.damage;

      if (hitPlayer.health <= 0) {
        console.log('Player died:', data.hitPlayerId);
        hitPlayer.lives--;
        
        if (hitPlayer.lives <= 0) {
          // Game Over
          io.emit("gameOver", data.hitPlayerId);
          // Reset lives but keep player in game over state
          hitPlayer.lives = 0;
        } else {
          // Still has lives left, respawn immediately
          const newSpawnPoint = findSafeSpawnPoint();
          hitPlayer.health = 100;
          hitPlayer.position = newSpawnPoint;
          hitPlayer.invulnerable = true;
          hitPlayer.invulnerableUntil = Date.now() + 3000; // 3 seconds of invulnerability
          
          // Notify about death and respawn
          io.emit("playerDied", {
            playerId: data.hitPlayerId,
            livesLeft: hitPlayer.lives,
            newPosition: newSpawnPoint,
            newHealth: hitPlayer.health
          });

          // Broadcast new position to all players immediately
          io.emit("playerMoved", {
            id: hitPlayer.id,
            position: newSpawnPoint,
            rotation: hitPlayer.rotation,
            health: hitPlayer.health,
            name: hitPlayer.name,
            inactive: false
          });
        }
      }

      const healthUpdate = {
        id: hitPlayer.id,
        name: hitPlayer.name,
        health: hitPlayer.health,
        damage: data.damage,
      };
      
      console.log('Sending health update:', healthUpdate);
      io.emit("playerHealthUpdate", healthUpdate);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected");
    players.delete(socket.id);
    io.emit("playerLeft", socket.id);
  });

  // Update the requestRespawn handler
  socket.on("requestRespawn", () => {
    const player = players.get(socket.id);
    if (player && player.lives > 0) {
      const spawnPosition = findSafeSpawnPoint();
      player.health = 100;
      player.position = spawnPosition;

      socket.emit("respawnPosition", {
        position: spawnPosition,
        lives: player.lives
      });

      io.emit("playerHealthUpdate", {
        id: socket.id,
        name: player.name,
        health: player.health,
        lives: player.lives,
        damage: 0,
      });
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
