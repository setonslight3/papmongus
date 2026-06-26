// State Manager - Authoritative game state management

class PlayerState {
  constructor(id, nickname, color) {
    this.id = id;
    this.nickname = nickname;
    this.color = color;
    this.x = 0;
    this.y = 0;
    this.isFacingLeft = false;
    this.isMoving = false;
    this.isAlive = true;
    this.isImpostor = false;
    this.tasks = [];
    this.completedTasks = 0;
    this.killCooldown = 0;
    this.equippedHat = null;
    this.lastUpdate = Date.now();
  }

  updatePosition(x, y, isFacingLeft, isMoving) {
    this.x = x;
    this.y = y;
    this.isFacingLeft = isFacingLeft;
    this.isMoving = isMoving;
    this.lastUpdate = Date.now();
  }
}

class GameState {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map(); // playerId -> PlayerState
    this.deadBodies = [];
    this.tasks = [];
    this.completedTasks = 0;
    this.totalTasks = 0;
    this.meetingState = null;
    this.sabotageState = null;
    this.timestamp = Date.now();
    this.updateCounter = 0;
  }

  addPlayer(playerId, nickname, color, equippedHat = null) {
    const player = new PlayerState(playerId, nickname, color);
    player.equippedHat = equippedHat;
    this.players.set(playerId, player);
    return player;
  }

  removePlayer(playerId) {
    return this.players.delete(playerId);
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getAlivePlayers() {
    return Array.from(this.players.values()).filter(p => p.isAlive);
  }

  getImpostors() {
    return Array.from(this.players.values()).filter(p => p.isImpostor);
  }

  getCrewmates() {
    return Array.from(this.players.values()).filter(p => !p.isImpostor);
  }

  getAliveImpostors() {
    return this.getImpostors().filter(p => p.isAlive);
  }

  getAliveCrewmates() {
    return this.getCrewmates().filter(p => p.isAlive);
  }

  toJSON() {
    return {
      roomCode: this.roomCode,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        color: p.color,
        x: p.x,
        y: p.y,
        isFacingLeft: p.isFacingLeft,
        isMoving: p.isMoving,
        isAlive: p.isAlive,
        equippedHat: p.equippedHat
      })),
      deadBodies: this.deadBodies,
      taskProgress: this.totalTasks > 0 ? this.completedTasks / this.totalTasks : 0,
      timestamp: this.timestamp,
      updateCounter: this.updateCounter
    };
  }
}

class StateManager {
  constructor() {
    this.gameStates = new Map(); // roomCode -> GameState
    this.updateThrottle = 50; // 20Hz = 50ms
    this.lastBroadcast = new Map(); // roomCode -> timestamp
  }

  // Initialize authoritative game state for a room (lobby dropship)
  initializeGameState(room) {
    const gameState = new GameState(room.code);
    
    // Add all players from room
    for (const [clientId, playerInfo] of room.players.entries()) {
      gameState.addPlayer(
        clientId,
        playerInfo.nickname,
        playerInfo.color,
        playerInfo.equippedHat
      );
    }

    // Set initial spawn positions inside dropship waiting room cabin
    const spawnX = 25 * 32 + 16; // TILE_SIZE = 32
    const spawnY = 20 * 32 + 16;
    let angle = 0;
    const angleStep = (2 * Math.PI) / Math.max(1, gameState.players.size);
    
    for (const player of gameState.players.values()) {
      player.x = spawnX + Math.cos(angle) * 30;
      player.y = spawnY + Math.sin(angle) * 30;
      angle += angleStep;
    }

    this.gameStates.set(room.code, gameState);
    room.gameState = gameState;
    
    console.log(`Game lobby state initialized for room ${room.code}: ${gameState.players.size} players`);
    return gameState;
  }

  // Setup match roles, tasks, and teleport players to Cafeteria
  startMatchState(room) {
    const gameState = this.gameStates.get(room.code);
    if (!gameState) {
      throw new Error(`Game state not found for room ${room.code}`);
    }

    // Reset tasks/roles for all players in GameState
    for (const playerState of gameState.players.values()) {
      playerState.isAlive = true;
      playerState.isImpostor = false;
      playerState.tasks = [];
      playerState.completedTasks = 0;
    }

    gameState.deadBodies = [];
    gameState.completedTasks = 0;

    // Assign Impostor Roles among all players (humans + bots)
    const candidates = Array.from(gameState.players.values());
    const impostorCount = room.settings.impostorCount || 1;
    
    // Choose impostors randomly
    const assignedImpostors = [];
    for (let i = 0; i < impostorCount && candidates.length > 0; i++) {
      const idx = Math.floor(Math.random() * candidates.length);
      const chosen = candidates.splice(idx, 1)[0];
      chosen.isImpostor = true;
      assignedImpostors.push(chosen);
      console.log(`Assigned impostor role to: ${chosen.nickname} (${chosen.id})`);
    }

    // Assign Tasks to crewmates
    const availableTasks = this.generateTaskList();
    let totalTasks = 0;

    for (const playerState of gameState.players.values()) {
      if (!playerState.isImpostor) {
        // Assign 3-5 random tasks
        const taskCount = 3 + Math.floor(Math.random() * 3);
        playerState.tasks = this.assignRandomTasks(availableTasks, taskCount);
        totalTasks += playerState.tasks.length;
      }
    }

    gameState.totalTasks = totalTasks;

    // Teleport everyone to Cafeteria spawn circle
    const spawnX = 25 * 32 + 16;
    const spawnY = 6 * 32 + 16;
    let angle = 0;
    const angleStep = (2 * Math.PI) / Math.max(1, gameState.players.size);

    for (const playerState of gameState.players.values()) {
      playerState.x = spawnX + Math.cos(angle) * 60;
      playerState.y = spawnY + Math.sin(angle) * 60;
      angle += angleStep;
    }

    // Roster of bot roles to securely send only to host client
    const botRoles = {};
    for (const [id, playerState] of gameState.players.entries()) {
      if (id.startsWith('bot-')) {
        botRoles[id] = {
          id: id,
          nickname: playerState.nickname,
          color: playerState.color,
          equippedHat: playerState.equippedHat,
          isImpostor: playerState.isImpostor,
          x: playerState.x,
          y: playerState.y
        };
      }
    }

    console.log(`Match started: total tasks = ${totalTasks}`);
    return { botRoles };
  }

  // Generate available task list
  generateTaskList() {
    return [
      'wires_electrical', 'wires_cafeteria', 'wires_security', 'wires_storage',
      'swipe_admin', 'upload_admin', 'upload_cafeteria', 'asteroids_weapons',
      'fuel_upper_engine', 'fuel_lower_engine', 'leaves_o2', 'calibrate_navigation'
    ];
  }

  // Assign random tasks to a player
  assignRandomTasks(availableTasks, count) {
    const shuffled = [...availableTasks].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  // Update player position
  updatePlayerPosition(roomCode, playerId, x, y, isFacingLeft, isMoving) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState) {
      return { success: false, error: 'Game state not found' };
    }

    const player = gameState.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (!player.isAlive) {
      return { success: false, error: 'Player is dead' };
    }

    player.updatePosition(x, y, isFacingLeft, isMoving);
    gameState.timestamp = Date.now();
    gameState.updateCounter++;

    return { success: true };
  }

  // Handle kill attempt
  handleKillAttempt(roomCode, killerId, victimId) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState) {
      return { success: false, error: 'Game state not found' };
    }

    const killer = gameState.getPlayer(killerId);
    const victim = gameState.getPlayer(victimId);

    if (!killer || !victim) {
      return { success: false, error: 'Player not found' };
    }

    if (!killer.isImpostor) {
      return { success: false, error: 'Not an impostor' };
    }

    if (!victim.isAlive) {
      return { success: false, error: 'Victim already dead' };
    }

    if (killer.killCooldown > 0) {
      return { success: false, error: 'Kill on cooldown' };
    }

    // Check distance (kill range = 60 pixels)
    const distance = Math.sqrt(
      Math.pow(killer.x - victim.x, 2) + Math.pow(killer.y - victim.y, 2)
    );

    if (distance > 60) {
      return { success: false, error: 'Too far' };
    }

    // Execute kill
    victim.isAlive = false;
    gameState.deadBodies.push({
      victimId: victimId,
      x: victim.x,
      y: victim.y,
      timestamp: Date.now()
    });

    // Set kill cooldown (from room settings)
    killer.killCooldown = 25000; // 25 seconds in ms

    console.log(`Kill successful: ${killer.nickname} killed ${victim.nickname}`);
    return {
      success: true,
      bodyX: victim.x,
      bodyY: victim.y
    };
  }

  // Handle task completion
  handleTaskCompletion(roomCode, playerId, taskId) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState) {
      return { success: false, error: 'Game state not found' };
    }

    const player = gameState.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.isImpostor) {
      return { success: false, error: 'Impostors cannot complete tasks' };
    }

    if (!player.tasks.includes(taskId)) {
      return { success: false, error: 'Task not assigned to player' };
    }

    // Mark task as completed
    player.tasks = player.tasks.filter(t => t !== taskId);
    player.completedTasks++;
    gameState.completedTasks++;

    const progress = gameState.totalTasks > 0 ? gameState.completedTasks / gameState.totalTasks : 0;
    console.log(`Task completed: ${player.nickname} completed ${taskId} (${Math.floor(progress * 100)}%)`);

    return {
      success: true,
      progress: progress,
      taskProgress: `${gameState.completedTasks}/${gameState.totalTasks}`
    };
  }

  // Handle meeting trigger
  handleMeetingTrigger(roomCode, reporterId, bodyId = null) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState) {
      return { success: false, error: 'Game state not found' };
    }

    gameState.meetingState = {
      reporterId: reporterId,
      bodyId: bodyId,
      discussionTimeLeft: 60, // 60 seconds
      votingTimeLeft: 30, // 30 seconds
      phase: 'discussion', // discussion | voting | results
      votes: new Map(), // playerId -> targetId
      startedAt: Date.now()
    };

    console.log(`Meeting started in room ${roomCode} by ${reporterId}`);
    return { success: true, meetingState: gameState.meetingState };
  }

  // Handle vote cast
  handleVote(roomCode, playerId, targetId) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState || !gameState.meetingState) {
      return { success: false, error: 'No active meeting' };
    }

    const player = gameState.getPlayer(playerId);
    if (!player || !player.isAlive) {
      return { success: false, error: 'Cannot vote (dead or not found)' };
    }

    if (gameState.meetingState.votes.has(playerId)) {
      return { success: false, error: 'Already voted' };
    }

    // targetId can be a playerId or 'skip'
    if (targetId !== 'skip') {
      const target = gameState.getPlayer(targetId);
      if (!target || !target.isAlive) {
        return { success: false, error: 'Invalid vote target' };
      }
    }

    gameState.meetingState.votes.set(playerId, targetId);
    console.log(`Vote cast: ${player.nickname} voted for ${targetId}`);

    return { success: true, voteCount: gameState.meetingState.votes.size };
  }

  // Tally votes and determine ejection
  tallyVotes(roomCode) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState || !gameState.meetingState) {
      return { success: false, error: 'No active meeting' };
    }

    const voteCounts = new Map(); // targetId -> count
    
    for (const targetId of gameState.meetingState.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
    }

    // Find player with most votes
    let maxVotes = 0;
    let ejectedId = null;
    let isTie = false;

    for (const [targetId, count] of voteCounts.entries()) {
      if (targetId === 'skip') continue;
      
      if (count > maxVotes) {
        maxVotes = count;
        ejectedId = targetId;
        isTie = false;
      } else if (count === maxVotes && maxVotes > 0) {
        isTie = true;
      }
    }

    if (isTie || maxVotes === 0) {
      ejectedId = null;
    }

    // Eject player if there's a clear winner
    let ejectedPlayer = null;
    if (ejectedId) {
      ejectedPlayer = gameState.getPlayer(ejectedId);
      if (ejectedPlayer) {
        ejectedPlayer.isAlive = false;
      }
    }

    const result = {
      ejectedId: ejectedId,
      ejectedNickname: ejectedPlayer ? ejectedPlayer.nickname : null,
      wasImpostor: ejectedPlayer ? ejectedPlayer.isImpostor : null,
      isTie: isTie,
      voteCounts: Object.fromEntries(voteCounts)
    };

    // Clear meeting state
    gameState.meetingState = null;

    console.log(`Voting results: ${ejectedId ? ejectedPlayer.nickname + ' ejected' : 'No ejection'}`);
    return { success: true, result };
  }

  // Check win conditions
  checkWinConditions(roomCode) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState) {
      return null;
    }

    const aliveImpostors = gameState.getAliveImpostors();
    const aliveCrewmates = gameState.getAliveCrewmates();

    // Impostors win if they equal or outnumber crewmates
    if (aliveImpostors.length >= aliveCrewmates.length && aliveImpostors.length > 0) {
      return { winner: 'IMPOSTORS_WIN', reason: 'Impostors equal or outnumber crewmates' };
    }

    // Crewmates win if all impostors are dead
    if (aliveImpostors.length === 0) {
      return { winner: 'CREWMATES_WIN', reason: 'All impostors eliminated' };
    }

    // Crewmates win if all tasks completed
    if (gameState.totalTasks > 0 && gameState.completedTasks >= gameState.totalTasks) {
      return { winner: 'CREWMATES_WIN', reason: 'All tasks completed' };
    }

    return null; // Game continues
  }

  // Get game state
  getGameState(roomCode) {
    return this.gameStates.get(roomCode);
  }

  // Should throttle broadcast
  shouldBroadcast(roomCode) {
    const lastTime = this.lastBroadcast.get(roomCode) || 0;
    const now = Date.now();
    
    if (now - lastTime >= this.updateThrottle) {
      this.lastBroadcast.set(roomCode, now);
      return true;
    }
    
    return false;
  }

  // Clean up game state
  removeGameState(roomCode) {
    this.gameStates.delete(roomCode);
    this.lastBroadcast.delete(roomCode);
  }

  // Update kill cooldowns (call periodically)
  updateCooldowns(roomCode, deltaTime) {
    const gameState = this.gameStates.get(roomCode);
    if (!gameState) return;

    for (const player of gameState.players.values()) {
      if (player.killCooldown > 0) {
        player.killCooldown = Math.max(0, player.killCooldown - deltaTime);
      }
    }
  }
}

module.exports = { StateManager, GameState, PlayerState };
