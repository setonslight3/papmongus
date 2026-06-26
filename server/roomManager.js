// Room Manager for multiplayer game sessions

class Room {
  constructor(code, hostId) {
    this.code = code;                  // 6-character room code
    this.hostId = hostId;              // Client ID of the host
    this.players = new Map();          // clientId -> Player
    this.state = 'WAITING';            // WAITING | PLAYING | MEETING | ENDED
    this.createdAt = Date.now();
    this.gameState = null;             // GameState object (when playing)
    this.settings = {
      maxPlayers: 10,
      impostorCount: 1,
      killCooldown: 25,
      playerSpeed: 3.5,
      botCount: 0
    };
  }

  // Add a player to the room
  addPlayer(clientId, player) {
    if (this.players.size >= this.settings.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }
    
    // Handle nickname conflicts
    let nickname = player.nickname;
    let suffix = 2;
    while (this.hasNickname(nickname)) {
      nickname = `${player.nickname}${suffix}`;
      suffix++;
    }
    player.nickname = nickname;
    
    this.players.set(clientId, player);
    return { success: true, nickname };
  }

  // Remove a player from the room
  removePlayer(clientId) {
    const removed = this.players.delete(clientId);
    
    // Handle host migration
    if (removed && clientId === this.hostId && this.players.size > 0) {
      // Assign first remaining player as new host
      const newHostId = this.players.keys().next().value;
      this.hostId = newHostId;
      return { removed, newHostId };
    }
    
    return { removed, newHostId: null };
  }

  // Check if nickname is already taken
  hasNickname(nickname) {
    for (const player of this.players.values()) {
      if (player.nickname === nickname) {
        return true;
      }
    }
    return false;
  }

  // Get player by client ID
  getPlayer(clientId) {
    return this.players.get(clientId);
  }

  // Check if room is full
  isFull() {
    return this.players.size >= this.settings.maxPlayers;
  }

  // Check if room is empty
  isEmpty() {
    return this.players.size === 0;
  }

  // Update room settings (host only)
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  // Get room info for client
  getRoomInfo() {
    return {
      code: this.code,
      hostId: this.hostId,
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      state: this.state,
      settings: this.settings,
      players: Array.from(this.players.entries()).map(([id, player]) => ({
        id,
        nickname: player.nickname,
        color: player.color,
        isHost: id === this.hostId,
        equippedHat: player.equippedHat
      }))
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();           // roomCode -> Room
    this.clientToRoom = new Map();    // clientId -> roomCode
  }

  // Create a new room
  createRoom(hostId, playerInfo, settings = {}) {
    const code = this.generateRoomCode();
    const room = new Room(code, hostId);
    
    // Apply custom settings
    if (settings) {
      room.updateSettings(settings);
    }
    
    // Add host as first player
    const player = {
      nickname: playerInfo.nickname || 'Player',
      color: playerInfo.color || 'red',
      equippedHat: playerInfo.equippedHat || null
    };
    
    const result = room.addPlayer(hostId, player);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    this.rooms.set(code, room);
    this.clientToRoom.set(hostId, code);
    
    console.log(`Room created: ${code} by ${hostId}`);
    return { 
      success: true, 
      roomCode: code, 
      room: room.getRoomInfo(),
      nickname: result.nickname
    };
  }

  // Join an existing room
  joinRoom(clientId, roomCode, playerInfo) {
    const room = this.rooms.get(roomCode);
    
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    
    if (room.isFull()) {
      return { success: false, error: 'Room is full' };
    }
    
    if (room.state !== 'WAITING') {
      return { success: false, error: 'Game already in progress' };
    }
    
    const player = {
      nickname: playerInfo.nickname || 'Player',
      color: playerInfo.color || 'blue',
      equippedHat: playerInfo.equippedHat || null
    };
    
    const result = room.addPlayer(clientId, player);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    this.clientToRoom.set(clientId, roomCode);
    
    console.log(`${clientId} joined room ${roomCode}`);
    return { 
      success: true, 
      room: room.getRoomInfo(),
      nickname: result.nickname
    };
  }

  // Leave a room
  leaveRoom(clientId) {
    const roomCode = this.clientToRoom.get(clientId);
    if (!roomCode) {
      return { success: false, error: 'Not in a room' };
    }
    
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.clientToRoom.delete(clientId);
      return { success: false, error: 'Room not found' };
    }
    
    const result = room.removePlayer(clientId);
    this.clientToRoom.delete(clientId);
    
    // Clean up empty rooms
    if (room.isEmpty()) {
      this.rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted (empty)`);
      return { success: true, roomDeleted: true };
    }
    
    console.log(`${clientId} left room ${roomCode}`);
    return { 
      success: true, 
      roomDeleted: false,
      newHostId: result.newHostId,
      room: room.getRoomInfo()
    };
  }

  // Get room by client ID
  getRoomByClient(clientId) {
    const roomCode = this.clientToRoom.get(clientId);
    return roomCode ? this.rooms.get(roomCode) : null;
  }

  // Get room by room code
  getRoomByCode(roomCode) {
    return this.rooms.get(roomCode);
  }

  // Generate unique 6-character room code
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRTUVWXY346789'; // Exclude ambiguous: 0/O, 1/I, 5/S, Z
    let code;
    let attempts = 0;
    
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
      
      if (attempts > 100) {
        throw new Error('Failed to generate unique room code after 100 attempts');
      }
    } while (this.rooms.has(code));
    
    return code;
  }

  // Validate room code format
  validateRoomCode(code) {
    if (typeof code !== 'string') return false;
    if (code.length !== 6) return false;
    
    const validChars = /^[ABCDEFGHJKLMNPQRTUVWXY346789]{6}$/;
    return validChars.test(code);
  }

  // Start a game in a room
  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    
    const totalPlayers = room.players.size + (room.settings.botCount || 0);
    if (totalPlayers < 2) {
      return { success: false, error: 'Need at least 2 players/bots to start' };
    }
    
    const impostorCount = room.settings.impostorCount || 1;
    const crewmateCount = totalPlayers - impostorCount;
    if (crewmateCount <= impostorCount) {
      return { 
        success: false, 
        error: `Cannot start: need more crewmates (${crewmateCount}) than impostors (${impostorCount}). Add more players or bots!` 
      };
    }
    
    room.state = 'PLAYING';
    console.log(`Game started in room ${roomCode}`);
    return { success: true };
  }

  // End a game in a room
  endGame(roomCode, result) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    
    room.state = 'ENDED';
    room.gameState = null;
    console.log(`Game ended in room ${roomCode}: ${result}`);
    
    // Transition back to WAITING after a delay
    setTimeout(() => {
      if (this.rooms.has(roomCode)) {
        room.state = 'WAITING';
        console.log(`Room ${roomCode} returned to WAITING state`);
      }
    }, 10000); // 10 seconds for victory screen
    
    return { success: true };
  }

  // Clean up stale rooms (older than 2 hours)
  cleanupStaleRooms() {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [code, room] of this.rooms.entries()) {
      if (room.createdAt < twoHoursAgo) {
        // Remove all players from clientToRoom map
        for (const clientId of room.players.keys()) {
          this.clientToRoom.delete(clientId);
        }
        
        this.rooms.delete(code);
        cleanedCount++;
        console.log(`Room ${code} cleaned up (stale)`);
      }
    }
    
    return cleanedCount;
  }

  // Get statistics
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalPlayers: this.clientToRoom.size,
      rooms: Array.from(this.rooms.values()).map(room => ({
        code: room.code,
        players: room.players.size,
        state: room.state,
        age: Math.floor((Date.now() - room.createdAt) / 1000)
      }))
    };
  }
}

module.exports = { Room, RoomManager };
