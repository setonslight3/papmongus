// Multiplayer extension for GameEngine
import { NetworkManager } from './network.js';
import { RemotePlayer, Player } from './entity.js';
import { GameMap } from './map.js';
import { CONTROLS, TILE_SIZE, SCREEN_WIDTH, SCREEN_HEIGHT } from './config.js';
import { updateTasksHUD } from './tasks.js';
import { playRoleReveal } from './audio.js';

export function initMultiplayer(gameEngine) {
  // Server URL - use environment variable or default
  const SERVER_URL = 'ws://localhost:3000';
  
  // Initialize multiplayer mode
  gameEngine.startMultiplayerMode = function(mode) {
    this.isMultiplayer = true;
    this.networkManager = new NetworkManager(SERVER_URL);
    
    // Register all message handlers
    this.setupNetworkHandlers();
    
    // Connect to server with error handling
    this.networkManager.connect()
      .then(() => {
        console.log('Successfully connected to multiplayer server');
        if (mode === 'create') {
          this.createRoom();
        }
      })
      .catch((error) => {
        console.error('Failed to connect to multiplayer server:', error);
        this.isMultiplayer = false;
        this.networkManager = null;
        
        if (window.multiplayerUI) {
          window.multiplayerUI.showError(
            'Cannot connect to multiplayer server. Make sure the server is running on localhost:3000'
          );
        } else {
          alert('Cannot connect to multiplayer server. The server may be offline.');
        }
        
        // Return to title screen
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) titleScreen.classList.remove('hidden');
      });
  };
  
  // Setup network message handlers
  gameEngine.setupNetworkHandlers = function() {
    const nm = this.networkManager;
    
    // Connection events
    nm.on('connected', (data) => {
      console.log('Connected to server:', data);
      this.localPlayerId = data.clientId;
    });
    
    nm.on('disconnected', () => {
      console.log('Disconnected from server');
      if (this.isMultiplayer) {
        alert('Disconnected from game');
        this.leaveRoom();
      }
    });
    
    nm.on('reconnecting', (data) => {
      console.log(`Reconnecting... (${data.attempt}/${data.max})`);
    });
    
    nm.on('reconnect_failed', () => {
      alert('Disconnected from game');
      this.leaveRoom();
    });
    
    nm.on('error', (data) => {
      console.error('Network error:', data);
    });
    
    // Server error messages
    nm.on('ERROR', (data) => {
      console.error('Server error:', data.message);
      if (window.multiplayerUI) {
        window.multiplayerUI.showError(data.message || 'An error occurred');
      } else {
        alert(data.message || 'An error occurred');
      }
    });
    
    // Room management
    nm.on('ROOM_CREATED', (data) => {
      this.roomCode = data.roomCode;
      this.isHost = data.isHost;
      this.localPlayerId = data.playerId;
      console.log(`Room created: ${data.roomCode}`);
      // Show lobby UI with room code
      if (window.multiplayerUI) {
        window.multiplayerUI.showLobby(data.room, true);
      }
    });
    
    nm.on('ROOM_JOINED', (data) => {
      this.roomCode = data.roomCode;
      this.isHost = false;
      this.localPlayerId = data.playerId;
      console.log(`Joined room: ${data.roomCode}`);
      // Show lobby UI
      if (window.multiplayerUI) {
        window.multiplayerUI.showLobby(data.room, false);
      }
    });
    
    nm.on('PLAYER_JOINED', (data) => {
      console.log('Player joined:', data.playerId);
      // Update lobby UI
      if (window.multiplayerUI) {
        window.multiplayerUI.updatePlayerList(data.room.players);
      }
    });
    
    nm.on('PLAYER_LEFT', (data) => {
      console.log('Player left:', data.playerId);
      // Remove from remote players
      this.remotePlayers.delete(data.playerId);
      // Update lobby UI
      if (window.multiplayerUI) {
        window.multiplayerUI.updatePlayerList(data.room.players);
      }
    });
    
    nm.on('PLAYER_DISCONNECTED', (data) => {
      console.log('Player disconnected:', data.playerId);
      this.remotePlayers.delete(data.playerId);
    });
    
    // Game start
    nm.on('GAME_STARTED', (data) => {
      console.log('Game started! Role:', data.role);
      
      // Hide lobby UI
      if (window.multiplayerUI) {
        window.multiplayerUI.hideLobby();
      }
      
      // Show game screen
      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('game-screen').classList.remove('hidden');
      
      // Set game state to reveal
      this.gameState = 'REVEAL';
      this.revealTimer = 3500;
      
      // Initialize map
      this.map = new GameMap(false); // isWaitingRoom = false
      
      // Clear existing entities and create local player from game state
      this.entities = [];
      this.deadBodies = [];
      this.remotePlayers.clear();
      
      // Find local player data from server
      const localPlayerData = data.gameState.players.find(p => p.id === this.localPlayerId);
      if (localPlayerData) {
        const localPlayer = new Player(
          'P1', // Always P1 internally for compatibility with main.js loops
          localPlayerData.x,
          localPlayerData.y,
          localPlayerData.color,
          localPlayerData.nickname,
          CONTROLS.P1,
          localPlayerData.isImpostor
        );
        localPlayer.equippedHat = localPlayerData.equippedHat;
        localPlayer.speed = this.playerSpeedSetting;
        localPlayer.tasks = data.tasks || [];
        this.entities.push(localPlayer);
        
        // Update HUD
        updateTasksHUD(localPlayer.tasks || [], 'tasks-hud-p1');
        document.getElementById('p1-hud').classList.remove('hidden');
      }
      
      // Initialize remote players
      for (const playerData of data.gameState.players) {
        if (playerData.id !== this.localPlayerId) {
          const remotePlayer = new RemotePlayer(
            playerData.id,
            playerData.nickname,
            playerData.color,
            playerData.x,
            playerData.y
          );
          remotePlayer.equippedHat = playerData.equippedHat;
          remotePlayer.isImpostor = playerData.isImpostor;
          this.remotePlayers.set(playerData.id, remotePlayer);
        }
      }
      
      // Play role reveal sound
      playRoleReveal(data.role === 'impostor');
      
      // Start game loop if not already running
      if (!this.lastTime) {
        this.lastTime = Date.now();
        this.gameLoop();
      }
    });
    
    // State synchronization
    nm.on('STATE_SYNC', (data) => {
      // 1. Sync local player alive state
      const localPlayerData = data.players.find(p => p.id === this.localPlayerId);
      if (localPlayerData) {
        const localPlayer = this.entities.find(e => e.id === 'P1');
        if (localPlayer) {
          if (!localPlayerData.isAlive && !localPlayer.isDead) {
            localPlayer.isDead = true;
            localPlayer.isGhost = true;
          }
        }
      }

      // Update remote player positions
      for (const playerData of data.players) {
        if (playerData.id === this.localPlayerId) continue;
        
        let remotePlayer = this.remotePlayers.get(playerData.id);
        if (!remotePlayer) {
          remotePlayer = new RemotePlayer(
            playerData.id,
            playerData.nickname,
            playerData.color,
            playerData.x,
            playerData.y
          );
          this.remotePlayers.set(playerData.id, remotePlayer);
        }
        
        remotePlayer.isDead = !playerData.isAlive;
        remotePlayer.equippedHat = playerData.equippedHat;
        remotePlayer.color = playerData.color;
        
        remotePlayer.updatePosition(
          playerData.x,
          playerData.y,
          playerData.isFacingLeft,
          playerData.isMoving,
          data.timestamp
        );
      }
    });
    
    // Gameplay events
    nm.on('KILL_CONFIRMED', (data) => {
      console.log('Kill confirmed:', data.killerId, 'killed', data.victimId);
      // Add dead body
      const victimColor = (data.victimId === this.localPlayerId)
        ? (this.entities.find(e => e.id === 'P1')?.color || '#ffffff')
        : (this.remotePlayers.get(data.victimId)?.color || '#ffffff');

      this.deadBodies.push({
        x: data.bodyX,
        y: data.bodyY,
        color: victimColor
      });
      
      // Mark player as dead
      if (data.victimId === this.localPlayerId) {
        const localPlayer = this.entities.find(e => e.id === 'P1');
        if (localPlayer) {
          localPlayer.isDead = true;
          localPlayer.isGhost = true;
        }
      } else {
        const victim = this.remotePlayers.get(data.victimId);
        if (victim) {
          victim.isDead = true;
        }
      }
    });
    
    nm.on('TASK_PROGRESS', (data) => {
      console.log('Task progress:', data.progress);
      // Update task bar
    });
    
    nm.on('MEETING_TRIGGERED', (data) => {
      console.log('Meeting triggered by', data.reporterId);
      this.gameState = 'MEETING';
      
      // Get all players
      const allPlayers = [...this.entities, ...this.remotePlayers.values()];
      
      // Find reporter player
      const reporter = allPlayers.find(p => p.id === data.reporterId || (p.id === 'P1' && data.reporterId === this.localPlayerId));
      
      // Find victim player
      let victim = null;
      if (data.bodyId) {
        victim = allPlayers.find(p => p.id === data.bodyId || (p.id === 'P1' && data.bodyId === this.localPlayerId));
      }
      
      // Open the meeting UI
      if (window.startMeeting) {
        window.startMeeting(allPlayers, reporter, !!data.bodyId, () => {}, victim);
      }
    });
    
    nm.on('VOTING_RESULTS', (data) => {
      console.log('Voting results:', data);
      
      // Hide meeting UI
      document.getElementById('meeting-overlay').classList.add('hidden');
      
      // Build ejection animation stars
      const stars = [];
      for (let i = 0; i < 40; i++) {
        stars.push({
          x: Math.random() * SCREEN_WIDTH,
          y: Math.random() * SCREEN_HEIGHT,
          speed: Math.random() * 2 + 1,
          size: Math.random() * 2
        });
      }
      
      // Find ejected player
      let ejectedEntity = null;
      if (data.ejectedId) {
        if (data.ejectedId === this.localPlayerId) {
          ejectedEntity = this.entities.find(e => e.id === 'P1');
        } else {
          ejectedEntity = this.remotePlayers.get(data.ejectedId);
        }
      }
      
      if (ejectedEntity) {
        ejectedEntity.isDead = true;
        ejectedEntity.isGhost = true;
      }
      
      this.ejectData = {
        entity: ejectedEntity,
        isSkip: data.isTie || !data.ejectedId,
        isTie: data.isTie,
        timer: 3000,
        stars: stars
      };
      
      this.gameState = 'EJECTING';
    });
    
    nm.on('GAME_ENDED', (data) => {
      console.log('Game ended:', data.winner);
      this.gameState = 'GAMEOVER';
      
      // Determine banner: victory/defeat
      const p1 = this.entities.find(e => e.id === 'P1');
      const crewWon = data.winner === 'crew';
      let banner = crewWon ? 'victory' : 'defeat';
      if (p1 && p1.isImpostor) {
        banner = crewWon ? 'defeat' : 'victory';
      }
      
      // Show game over screen (use existing gameEngine triggerGameOver method)
      this.triggerGameOver(banner, crewWon ? 'The Impostors have been ejected!' : 'The Impostors took over the ship!');
    });
    
    // Customization
    nm.on('COLOR_CHANGED', (data) => {
      const player = this.remotePlayers.get(data.playerId);
      if (player) {
        player.color = data.color;
      }
    });
    
    nm.on('COSMETIC_CHANGED', (data) => {
      const player = this.remotePlayers.get(data.playerId);
      if (player) {
        player.equippedHat = data.equippedHat;
      }
    });
  };
  
  // Create room
  gameEngine.createRoom = function() {
    if (!this.networkManager) {
      console.error('Network manager not initialized');
      return;
    }
    
    const nickname = localStorage.getItem('papmongus_name') || 'Player';
    
    this.networkManager.send('CREATE_ROOM', {
      playerInfo: {
        nickname: nickname,
        color: this.p1Color,
        equippedHat: this.equippedHat === 'none' ? null : this.equippedHat
      },
      settings: {
        maxPlayers: 10,
        impostorCount: 1,
        killCooldown: this.killCooldownSetting,
        playerSpeed: this.playerSpeedSetting
      }
    });
  };
  
  // Join room
  gameEngine.joinRoom = function(roomCode) {
    if (!this.networkManager) {
      console.error('Network manager not initialized');
      return;
    }
    
    const nickname = localStorage.getItem('papmongus_name') || 'Player';
    
    this.networkManager.send('JOIN_ROOM', {
      roomCode: roomCode.toUpperCase(),
      playerInfo: {
        nickname: nickname,
        color: this.p1Color,
        equippedHat: this.equippedHat === 'none' ? null : this.equippedHat
      }
    });
  };
  
  // Leave room
  gameEngine.leaveRoom = function() {
    if (this.networkManager) {
      this.networkManager.send('LEAVE_ROOM', {});
      this.networkManager.disconnect();
    }
    
    this.isMultiplayer = false;
    this.networkManager = null;
    this.roomCode = null;
    this.isHost = false;
    this.remotePlayers.clear();
    this.localPlayerId = null;
    
    // Return to title screen
    this.gameState = 'LOBBY';
    if (window.multiplayerUI) {
      window.multiplayerUI.hideLobby();
    }
  };
  
  // Send position update (throttled to 20Hz)
  gameEngine.sendPositionUpdate = function() {
    if (!this.isMultiplayer || !this.networkManager) return;
    
    const now = Date.now();
    if (now - this.lastPositionUpdate < this.positionUpdateInterval) return;
    
    this.lastPositionUpdate = now;
    
    // Find local player
    const localPlayer = this.entities.find(e => e.id === 'P1');
    if (!localPlayer) return;
    
    this.networkManager.send('POSITION_UPDATE', {
      x: localPlayer.x,
      y: localPlayer.y,
      isFacingLeft: localPlayer.isFacingLeft,
      isMoving: localPlayer.isMoving
    });
  };
  
  // Send action events
  gameEngine.sendActionEvent = function(action, data = {}) {
    if (!this.isMultiplayer || !this.networkManager) return;
    
    const messageType = {
      'kill': 'KILL_ATTEMPT',
      'task': 'TASK_COMPLETED',
      'report': 'MEETING_TRIGGERED',
      'vote': 'VOTE_CAST'
    }[action];
    
    if (messageType) {
      this.networkManager.send(messageType, data);
    }
  };
  
  // Update remote players (call in game loop)
  gameEngine.updateRemotePlayers = function(deltaTime) {
    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.interpolate(deltaTime);
    }
  };
  
  // Draw remote players (call in render loop)
  gameEngine.drawRemotePlayers = function(ctx, cameraX, cameraY) {
    for (const remotePlayer of this.remotePlayers.values()) {
      if (remotePlayer.isDead) continue;
      
      const pos = remotePlayer.getDisplayPosition();
      const screenX = pos.x - cameraX;
      const screenY = pos.y - cameraY;
      
      // Use existing drawCrewmate function
      if (window.drawCrewmate) {
        window.drawCrewmate(ctx, screenX, screenY, remotePlayer.color, remotePlayer.isFacingLeft);
      }
      
      // Draw nickname
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(remotePlayer.nickname, screenX, screenY - 20);
    }
  };
}
