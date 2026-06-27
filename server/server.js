// WebSocket server for papmongus multiplayer
const http = require('http');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./roomManager');
const { StateManager } = require('./stateManager');
const { ValidationModule, RateLimiter } = require('./validation');

// Configuration
const PORT = process.env.PORT || 3000;
const clients = new Map(); // clientId -> WebSocket
const clientIPs = new Map(); // clientId -> IP address

// Initialize managers
const roomManager = new RoomManager();
const stateManager = new StateManager();
const rateLimiter = new RateLimiter();

// Create HTTP server for health check
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      uptime: process.uptime(),
      connections: clients.size 
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

// Generate unique client ID
function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  // Get client IP
  const clientIP = req.socket.remoteAddress;
  
  // Rate limiting
  if (rateLimiter.isRateLimited(clientIP)) {
    ws.close(1008, 'Too many connection attempts');
    console.log(`Rate limited connection from ${clientIP}`);
    return;
  }
  
  const clientId = generateClientId();
  clients.set(clientId, ws);
  clientIPs.set(clientId, clientIP);
  
  console.log(`Client connected: ${clientId} from ${clientIP} (Total: ${clients.size})`);
  
  // Message handler
  ws.on('message', (data) => {
    try {
      handleMessage(clientId, data);
    } catch (error) {
      console.error(`Error handling message from ${clientId}:`, error);
      sendError(clientId, 'Invalid message format');
    }
  });
  
  // Close handler
  ws.on('close', () => {
    handleDisconnect(clientId);
  });
  
  // Error handler
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${clientId}:`, error);
    handleDisconnect(clientId);
  });
  
  // Send welcome message
  send(clientId, 'CONNECTED', { clientId });
});

// Message handling
function handleMessage(clientId, data) {
  // Validate payload size
  const sizeCheck = ValidationModule.validatePayloadSize(data.toString());
  if (!sizeCheck.valid) {
    sendError(clientId, 'Message too large');
    return;
  }
  
  const message = JSON.parse(data.toString());
  console.log(`Received from ${clientId}:`, message.type);
  
  // Route messages to appropriate handlers
  switch (message.type) {
    case 'CREATE_ROOM':
      handleCreateRoom(clientId, message.payload);
      break;
    case 'JOIN_ROOM':
      handleJoinRoom(clientId, message.payload);
      break;
    case 'LEAVE_ROOM':
      handleLeaveRoom(clientId);
      break;
    case 'START_GAME':
      handleStartGame(clientId);
      break;
    case 'POSITION_UPDATE':
      handlePositionUpdate(clientId, message.payload);
      break;
    case 'KILL_ATTEMPT':
      handleKillAttempt(clientId, message.payload);
      break;
    case 'TASK_COMPLETED':
      handleTaskCompleted(clientId, message.payload);
      break;
    case 'MEETING_TRIGGERED':
      handleMeetingTriggered(clientId, message.payload);
      break;
    case 'VOTE_CAST':
      handleVoteCast(clientId, message.payload);
      break;
    case 'COLOR_CHANGE':
      handleColorChange(clientId, message.payload);
      break;
    case 'COSMETIC_CHANGE':
      handleCosmeticChange(clientId, message.payload);
      break;
    case 'SYNC_BOTS':
      handleSyncBots(clientId, message.payload);
      break;
    case 'BOT_POSITION_UPDATE':
      handleBotPositionUpdate(clientId, message.payload);
      break;
    case 'UPDATE_SETTINGS':
      handleUpdateSettings(clientId, message.payload);
      break;
    case 'CHAT_MESSAGE':
      handleChatMessage(clientId, message.payload);
      break;
    default:
      console.warn(`Unknown message type: ${message.type}`);
      sendError(clientId, `Unknown message type: ${message.type}`);
  }
}

// Room Management Handlers
function handleCreateRoom(clientId, payload) {
  const result = roomManager.createRoom(clientId, payload.playerInfo || {}, payload.settings);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }

  // Initialize GameState immediately on creation so P1 can walk around and sync in WAITING lobby state
  const room = roomManager.getRoomByCode(result.roomCode);
  if (room) {
    stateManager.initializeGameState(room);
  }
  
  send(clientId, 'ROOM_CREATED', {
    roomCode: result.roomCode,
    playerId: clientId,
    isHost: true,
    nickname: result.nickname,
    room: result.room
  });
}

function handleJoinRoom(clientId, payload) {
  // Validate room code
  const codeCheck = ValidationModule.validateRoomCode(payload.roomCode);
  if (!codeCheck.valid) {
    sendError(clientId, 'Invalid room code format');
    return;
  }
  
  const result = roomManager.joinRoom(clientId, payload.roomCode, payload.playerInfo || {});
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }

  // Add player to GameState
  const room = roomManager.getRoomByCode(payload.roomCode);
  const spawnX = 25 * 32 + 16;
  const spawnY = 20 * 32 + 16;
  if (room && room.gameState) {
    const newPlayer = room.gameState.addPlayer(
      clientId,
      result.nickname,
      payload.playerInfo.color,
      payload.playerInfo.equippedHat
    );
    newPlayer.x = spawnX + (Math.random() - 0.5) * 40;
    newPlayer.y = spawnY + (Math.random() - 0.5) * 40;
  }
  
  // Send confirmation to joining player
  send(clientId, 'ROOM_JOINED', {
    roomCode: payload.roomCode,
    playerId: clientId,
    nickname: result.nickname,
    room: result.room
  });
  
  // Broadcast to all players in room
  broadcastToRoom(payload.roomCode, 'PLAYER_JOINED', {
    playerId: clientId,
    player: {
      nickname: result.nickname,
      color: payload.playerInfo.color,
      equippedHat: payload.playerInfo.equippedHat,
      x: spawnX,
      y: spawnY
    },
    room: result.room
  }, clientId);
}

function handleLeaveRoom(clientId) {
  const room = roomManager.getRoomByClient(clientId);
  if (room && room.gameState) {
    room.gameState.removePlayer(clientId);
  }

  const result = roomManager.leaveRoom(clientId);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }
  
  send(clientId, 'LEFT_ROOM', {});
  
  if (!result.roomDeleted) {
    // Broadcast to remaining players
    broadcastToRoom(result.room.code, 'PLAYER_LEFT', {
      playerId: clientId,
      newHostId: result.newHostId,
      room: result.room
    });
  }
}

function handleStartGame(clientId) {
  const room = roomManager.getRoomByClient(clientId);
  
  if (!room) {
    sendError(clientId, 'Not in a room');
    return;
  }
  
  if (room.hostId !== clientId) {
    sendError(clientId, 'Only host can start game');
    return;
  }
  
  const result = roomManager.startGame(room.code);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }
  
  // Run match setup state transition (teleportation, role selection, tasks)
  const matchResult = stateManager.startMatchState(room);
  
  // Send role assignments securely to each player
  for (const [playerId, playerState] of room.gameState.players.entries()) {
    if (!playerId.startsWith('bot-')) {
      const isHost = (playerId === room.hostId);
      send(playerId, 'GAME_STARTED', {
        roomCode: room.code,
        role: playerState.isImpostor ? 'impostor' : 'crewmate',
        tasks: playerState.tasks,
        botRoles: isHost ? matchResult.botRoles : undefined, // secure bot roles sync only to host client
        gameState: room.gameState.toJSON()
      });
    }
  }
}

// Gameplay Handlers
function handlePositionUpdate(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || (room.state !== 'PLAYING' && room.state !== 'WAITING')) return;
  
  const result = stateManager.updatePlayerPosition(
    room.code,
    clientId,
    payload.x,
    payload.y,
    payload.isFacingLeft,
    payload.isMoving
  );
  
  if (!result.success) return;
  
  // Throttled broadcast (20Hz)
  if (stateManager.shouldBroadcast(room.code)) {
    const gameState = stateManager.getGameState(room.code);
    broadcastToRoom(room.code, 'STATE_SYNC', gameState.toJSON());
  }
}

function handleKillAttempt(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.state !== 'PLAYING') {
    sendError(clientId, 'Cannot kill outside of game');
    return;
  }
  
  const killerId = (payload.killerId && payload.killerId.startsWith('bot-') && room.hostId === clientId)
    ? payload.killerId
    : clientId;

  const result = stateManager.handleKillAttempt(room.code, killerId, payload.victimId);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }
  
  // Broadcast kill to all players
  broadcastToRoom(room.code, 'KILL_CONFIRMED', {
    killerId: killerId,
    victimId: payload.victimId,
    bodyX: result.bodyX,
    bodyY: result.bodyY
  });
  
  // Check win conditions
  const winResult = stateManager.checkWinConditions(room.code);
  if (winResult) {
    handleGameEnd(room.code, winResult);
  }
}

function handleTaskCompleted(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.state !== 'PLAYING') return;
  
  const result = stateManager.handleTaskCompletion(room.code, clientId, payload.taskId);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }
  
  // Broadcast task progress
  broadcastToRoom(room.code, 'TASK_PROGRESS', {
    playerId: clientId,
    taskId: payload.taskId,
    progress: result.progress,
    taskProgress: result.taskProgress
  });
  
  // Check win conditions
  const winResult = stateManager.checkWinConditions(room.code);
  if (winResult) {
    handleGameEnd(room.code, winResult);
  }
}

function handleMeetingTriggered(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.state !== 'PLAYING') return;
  
  const result = stateManager.handleMeetingTrigger(room.code, clientId, payload.bodyId);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }
  
  room.state = 'MEETING';
  
  broadcastToRoom(room.code, 'MEETING_TRIGGERED', {
    reporterId: clientId,
    bodyId: payload.bodyId,
    meetingState: result.meetingState
  });
}

function handleVoteCast(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.state !== 'MEETING') return;

  const voterId = payload.voterId || clientId;

  // Verify only host can vote for bots
  if (payload.voterId && room.hostId !== clientId) {
    sendError(clientId, 'Unauthorized to vote for other entities');
    return;
  }
  
  const result = stateManager.handleVote(room.code, voterId, payload.targetId);
  
  if (!result.success) {
    sendError(clientId, result.error);
    return;
  }
  
  // Check if all alive players (including bots) have voted
  const gameState = stateManager.getGameState(room.code);
  const alivePlayers = gameState.getAlivePlayers();
  
  if (result.voteCount >= alivePlayers.length) {
    // Tally votes
    const tallyResult = stateManager.tallyVotes(room.code);
    
    room.state = 'PLAYING';
    
    broadcastToRoom(room.code, 'VOTING_RESULTS', tallyResult.result);
    
    // Check win conditions after ejection
    const winResult = stateManager.checkWinConditions(room.code);
    if (winResult) {
      handleGameEnd(room.code, winResult);
    }
  }
}

// Customization Handlers
function handleColorChange(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room) return;
  
  const player = room.getPlayer(clientId);
  if (!player) return;
  
  // Check if color is available
  for (const [id, p] of room.players.entries()) {
    if (id !== clientId && p.color === payload.color) {
      sendError(clientId, 'Color already taken');
      return;
    }
  }
  
  player.color = payload.color;
  
  // Update in GameState if active
  if (room.gameState) {
    const pState = room.gameState.getPlayer(clientId);
    if (pState) {
      pState.color = payload.color;
    }
  }
  
  broadcastToRoom(room.code, 'COLOR_CHANGED', {
    playerId: clientId,
    color: payload.color
  });
}

function handleCosmeticChange(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room) return;
  
  const player = room.getPlayer(clientId);
  if (!player) return;
  
  player.equippedHat = payload.equippedHat;
  
  // Update in GameState if active
  if (room.gameState) {
    const pState = room.gameState.getPlayer(clientId);
    if (pState) {
      pState.equippedHat = payload.equippedHat;
    }
  }
  
  broadcastToRoom(room.code, 'COSMETIC_CHANGED', {
    playerId: clientId,
    equippedHat: payload.equippedHat
  });
}

// Game end handler
function handleGameEnd(roomCode, winResult) {
  const room = roomManager.getRoomByCode(roomCode);
  if (!room) return;
  
  const gameState = stateManager.getGameState(roomCode);
  
  // Reveal all roles
  const playerRoles = {};
  for (const [playerId, playerState] of gameState.players.entries()) {
    playerRoles[playerId] = {
      nickname: playerState.nickname,
      isImpostor: playerState.isImpostor
    };
  }
  
  broadcastToRoom(roomCode, 'GAME_ENDED', {
    winner: winResult.winner,
    reason: winResult.reason,
    playerRoles: playerRoles
  });
  
  roomManager.endGame(roomCode, winResult.winner);
  stateManager.removeGameState(roomCode);
}

// Disconnection handler
function handleDisconnect(clientId) {
  console.log(`Client disconnected: ${clientId}`);
  
  // Leave room if in one
  const room = roomManager.getRoomByClient(clientId);
  if (room) {
    if (room.gameState) {
      room.gameState.removePlayer(clientId);
    }
    const result = roomManager.leaveRoom(clientId);
    
    if (!result.roomDeleted && result.room) {
      // Notify other players
      broadcastToRoom(result.room.code, 'PLAYER_DISCONNECTED', {
        playerId: clientId,
        newHostId: result.newHostId
      });
    }
  }
  
  clients.delete(clientId);
  clientIPs.delete(clientId);
}

// New handlers for bots, settings, and chat message sync
function handleSyncBots(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.hostId !== clientId) return;
  
  room.settings.bots = payload.bots || [];
  room.settings.botCount = room.settings.bots.length;

  if (room.gameState) {
    // Remove existing bots from GameState
    for (const [id, playerState] of room.gameState.players.entries()) {
      if (id.startsWith('bot-')) {
        room.gameState.removePlayer(id);
      }
    }
    // Add new bots
    const spawnX = 25 * 32 + 16;
    const spawnY = 20 * 32 + 16;
    room.settings.bots.forEach(bot => {
      const pState = room.gameState.addPlayer(bot.id, bot.nickname, bot.color, bot.equippedHat);
      pState.x = spawnX;
      pState.y = spawnY;
    });
  }

  broadcastToRoom(room.code, 'ROOM_SETTINGS_UPDATED', { settings: room.settings });
}

function handleBotPositionUpdate(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.hostId !== clientId || !room.gameState) return;

  payload.bots.forEach(bot => {
    const pState = room.gameState.getPlayer(bot.id);
    if (pState) {
      pState.updatePosition(bot.x, bot.y, bot.isFacingLeft, bot.isMoving);
    }
  });

  room.gameState.timestamp = Date.now();
  room.gameState.updateCounter++;

  if (stateManager.shouldBroadcast(room.code)) {
    broadcastToRoom(room.code, 'STATE_SYNC', room.gameState.toJSON());
  }
}

function handleUpdateSettings(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room || room.hostId !== clientId) return;

  room.updateSettings(payload.settings);
  broadcastToRoom(room.code, 'ROOM_SETTINGS_UPDATED', { settings: room.settings });
}

function handleChatMessage(clientId, payload) {
  const room = roomManager.getRoomByClient(clientId);
  if (!room) return;

  let senderName = payload.senderName;
  let color = payload.color;

  if (!payload.isBot) {
    const player = room.getPlayer(clientId);
    if (player) {
      senderName = player.nickname;
      color = player.color;
    } else {
      return;
    }
  } else {
    if (room.hostId !== clientId) return;
  }

  broadcastToRoom(room.code, 'CHAT_MESSAGE_RECEIVED', {
    playerId: payload.isBot ? payload.botId : clientId,
    senderName,
    color,
    message: payload.message
  });
}

// Send message to specific client
function send(clientId, messageType, payload) {
  const client = clients.get(clientId);
  if (client && client.readyState === 1) { // 1 = OPEN
    const message = {
      type: messageType,
      payload,
      timestamp: Date.now()
    };
    client.send(JSON.stringify(message));
  }
}

// Send error message
function sendError(clientId, errorMessage) {
  send(clientId, 'ERROR', { message: errorMessage });
}

// Broadcast to all clients in a room
function broadcastToRoom(roomCode, messageType, payload, excludeClientId = null) {
  const room = roomManager.getRoomByCode(roomCode);
  if (!room) return;
  
  const message = {
    type: messageType,
    payload,
    timestamp: Date.now()
  };
  
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  for (const clientId of room.players.keys()) {
    if (clientId === excludeClientId) continue;
    
    const client = clients.get(clientId);
    if (client && client.readyState === 1) {
      client.send(messageStr);
      sentCount++;
    }
  }
  
  console.log(`Broadcasted ${messageType} to ${sentCount} clients in room ${roomCode}`);
}

// Deprecated - use broadcastToRoom instead
function broadcast(roomCode, messageType, payload, excludeClientId = null) {
  broadcastToRoom(roomCode, messageType, payload, excludeClientId);
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Periodic cleanup tasks
  setInterval(() => {
    roomManager.cleanupStaleRooms();
    rateLimiter.cleanup();
  }, 60000); // Every minute
  
  // Update game timers
  setInterval(() => {
    for (const room of roomManager.rooms.values()) {
      if (room.gameState) {
        if (room.state === 'PLAYING') {
          stateManager.updateCooldowns(room.code, 100);
        } else if (room.state === 'MEETING') {
          const finished = stateManager.updateMeetingTimer(room.code, 100);
          if (finished) {
            // Tally votes authoritatively
            const tallyResult = stateManager.tallyVotes(room.code);
            room.state = 'PLAYING';
            broadcastToRoom(room.code, 'VOTING_RESULTS', tallyResult.result);
            
            // Check win conditions after ejection
            const winResult = stateManager.checkWinConditions(room.code);
            if (winResult) {
              handleGameEnd(room.code, winResult);
            }
          }
        }
      }
    }
  }, 100); // Every 100ms
});

// Graceful shutdown handlers
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, closing server...`);
  
  // Close all WebSocket connections
  clients.forEach((ws, clientId) => {
    ws.close(1000, 'Server shutting down');
  });
  
  // Close HTTP server
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
module.exports = { send, broadcast, clients };
