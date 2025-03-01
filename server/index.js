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
  console.log("A user connected");

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
    });

    // Send current players to the new player
    socket.emit("currentPlayers", Array.from(players.values()));

    // Notify other players that a new player joined
    socket.broadcast.emit("playerJoined", players.get(socket.id));
  });

  // Handle player movement
  socket.on("playerMovement", (movementData) => {
    const player = players.get(socket.id);
    if (player) {
      player.position = movementData.position;
      player.rotation = movementData.rotation;
      socket.broadcast.emit("playerMoved", player);
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
      hitPlayer.health -= data.damage;

      if (hitPlayer.health <= 0) {
        io.emit("playerDied", data.hitPlayerId);
        hitPlayer.health = 100;
        hitPlayer.position = findSafeSpawnPoint();
      }

      io.emit("playerHealthUpdate", {
        id: hitPlayer.id,
        name: hitPlayer.name,
        health: hitPlayer.health,
        damage: data.damage,
      });
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
    if (player) {
      const spawnPosition = findSafeSpawnPoint();
      player.health = 100;
      player.position = spawnPosition;

      socket.emit("respawnPosition", spawnPosition);

      io.emit("playerHealthUpdate", {
        id: socket.id,
        name: player.name,
        health: player.health,
        damage: 0,
      });
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
