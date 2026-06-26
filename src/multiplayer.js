// Multiplayer extension for GameEngine
import { NetworkManager } from './network.js';
import { RemotePlayer, Player, AIBot } from './entity.js';
import { GameMap } from './map.js';
import { CONTROLS, TILE_SIZE, SCREEN_WIDTH, SCREEN_HEIGHT, TASKS_LIST, COLORS } from './config.js';
import { updateTasksHUD } from './tasks.js';
import { playRoleReveal, playReport } from './audio.js';
import { closeMinigame } from './minigames.js';

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
      if (this.isMultiplayer && this.gameState !== 'GAMEOVER') {
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
      
      this.gameState = 'WAITING_ROOM';
      this.deadBodies = [];
      this.sabotageActive = false;
      this.sabotageType = null;

      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('game-screen').classList.remove('hidden');
      
      const canvas = document.getElementById('game-canvas');
      if (canvas) canvas.focus();

      // Spawn local player
      const nickname = localStorage.getItem('papmongus_name') || 'Host';
      const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 20 * TILE_SIZE + TILE_SIZE / 2 };
      
      const p1 = new Player('P1', spawnCenter.x, spawnCenter.y - 30, COLORS[this.p1Color], nickname, CONTROLS.P1, false);
      p1.equippedHat = this.equippedHat === 'none' ? null : this.equippedHat;
      p1.speed = this.playerSpeedSetting;
      
      this.entities = [p1];
      this.remotePlayers.clear();
      this.map = new GameMap(true);

      // Show HUD items
      const roomCodeDisplay = document.getElementById('game-room-code-display');
      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = `Room Code: ${data.roomCode}`;
        roomCodeDisplay.classList.remove('hidden');
      }
      const leaveRoomHud = document.getElementById('lobby-leave-btn-hud');
      if (leaveRoomHud) {
        leaveRoomHud.classList.remove('hidden');
      }

      // Hide lobby modal if active
      if (window.multiplayerUI) {
        window.multiplayerUI.hideLobby();
      }

      // Start loop if not already running
      if (!this.lastTime) {
        this.lastTime = Date.now();
        this.gameLoop();
      }
    });
    
    nm.on('ROOM_JOINED', (data) => {
      this.roomCode = data.roomCode;
      this.isHost = false;
      this.localPlayerId = data.playerId;
      console.log(`Joined room: ${data.roomCode}`);
      
      this.gameState = 'WAITING_ROOM';
      this.deadBodies = [];
      this.sabotageActive = false;
      this.sabotageType = null;

      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('game-screen').classList.remove('hidden');
      
      const canvas = document.getElementById('game-canvas');
      if (canvas) canvas.focus();

      // Spawn local player
      const nickname = localStorage.getItem('papmongus_name') || 'Guest';
      const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 20 * TILE_SIZE + TILE_SIZE / 2 };
      
      const p1 = new Player('P1', spawnCenter.x, spawnCenter.y - 30, COLORS[this.p1Color], nickname, CONTROLS.P1, false);
      p1.equippedHat = this.equippedHat === 'none' ? null : this.equippedHat;
      p1.speed = this.playerSpeedSetting;
      
      this.entities = [p1];
      this.remotePlayers.clear();
      this.map = new GameMap(true);

      // Populate remote players with already joined ones
      if (data.room && data.room.players) {
        data.room.players.forEach(p => {
          if (p.id !== this.localPlayerId) {
            const remotePlayer = new RemotePlayer(
              p.id,
              p.nickname,
              p.color,
              p.x || spawnCenter.x,
              p.y || (spawnCenter.y - 30)
            );
            remotePlayer.equippedHat = p.equippedHat;
            this.remotePlayers.set(p.id, remotePlayer);
          }
        });
      }

      // Show HUD items
      const roomCodeDisplay = document.getElementById('game-room-code-display');
      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = `Room Code: ${data.roomCode}`;
        roomCodeDisplay.classList.remove('hidden');
      }
      const leaveRoomHud = document.getElementById('lobby-leave-btn-hud');
      if (leaveRoomHud) {
        leaveRoomHud.classList.remove('hidden');
      }

      // Hide lobby modal if active
      if (window.multiplayerUI) {
        window.multiplayerUI.hideLobby();
      }

      // Start loop if not already running
      if (!this.lastTime) {
        this.lastTime = Date.now();
        this.gameLoop();
      }
    });
    
    nm.on('PLAYER_JOINED', (data) => {
      console.log('Player joined:', data.playerId);
      const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 20 * TILE_SIZE + TILE_SIZE / 2 };
      // Spawn them as a remote player if they aren't already there
      if (!this.remotePlayers.has(data.playerId)) {
        const remotePlayer = new RemotePlayer(
          data.playerId,
          data.player.nickname,
          data.player.color,
          data.player.x || spawnCenter.x,
          data.player.y || (spawnCenter.y - 30)
        );
        remotePlayer.equippedHat = data.player.equippedHat;
        this.remotePlayers.set(data.playerId, remotePlayer);
      }
    });
    
    nm.on('PLAYER_LEFT', (data) => {
      console.log('Player left:', data.playerId);
      // Remove from remote players
      this.remotePlayers.delete(data.playerId);
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

      // Hide HUD waiting room elements
      const roomCodeDisplay = document.getElementById('game-room-code-display');
      if (roomCodeDisplay) roomCodeDisplay.classList.add('hidden');
      const leaveRoomHud = document.getElementById('lobby-leave-btn-hud');
      if (leaveRoomHud) leaveRoomHud.classList.add('hidden');
      
      // Show game screen
      document.getElementById('title-screen').classList.add('hidden');
      document.getElementById('game-screen').classList.remove('hidden');
      
      // Auto-focus canvas so keyboard controls work immediately
      const canvas = document.getElementById('game-canvas');
      if (canvas) {
        canvas.focus();
      }
      
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
        const mappedTasks = [];
        if (data.tasks) {
          data.tasks.forEach(taskId => {
            const mapTask = this.map.tasks.find(t => t.id === taskId);
            if (mapTask) {
              mappedTasks.push({ ...mapTask, completed: false });
            } else {
              const taskDef = TASKS_LIST.find(t => t.id === taskId);
              if (taskDef) {
                mappedTasks.push({
                  ...taskDef,
                  x: 0,
                  y: 0,
                  col: 0,
                  row: 0,
                  completed: false
                });
              }
            }
          });
        }
        localPlayer.tasks = mappedTasks;
        this.entities.push(localPlayer);
        
        // Update HUD
        updateTasksHUD(localPlayer.tasks || [], 'tasks-hud-p1');
        document.getElementById('p1-hud').classList.remove('hidden');
      }

      // Host spawns bots locally
      if (this.isHost && data.botRoles) {
        for (const botId in data.botRoles) {
          const b = data.botRoles[botId];
          const bot = new AIBot(
            botId,
            b.x,
            b.y,
            b.color,
            b.nickname,
            b.isImpostor,
            this.botDifficulty || 'medium'
          );
          bot.equippedHat = b.equippedHat;
          this.entities.push(bot);
        }
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
      this.multiplayerTaskProgress = data.taskProgress;
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
        color: victimColor,
        victimId: data.victimId
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
      this.multiplayerTaskProgress = data.progress;
    });
    
    nm.on('MEETING_TRIGGERED', (data) => {
      console.log('Meeting triggered by', data.reporterId);
      
      closeMinigame(false);
      playReport();
      this.deadBodies = [];

      // Pause local player
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1) p1.isMoving = false;

      // Show megaphone flash overlay
      const reportOverlay = document.getElementById('report-overlay');
      if (reportOverlay) {
        const headline = reportOverlay.querySelector('.report-headline');
        if (headline) {
          headline.innerText = data.bodyId ? 'BODY REPORTED!' : 'EMERGENCY MEETING!';
        }
        reportOverlay.classList.remove('hidden');
      }

      // Wait 2.2 seconds before transitioning to meeting screen
      setTimeout(() => {
        const reportOverlay = document.getElementById('report-overlay');
        if (reportOverlay) {
          reportOverlay.classList.add('hidden');
        }
        
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
      }, 2200);
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

    nm.on('ROOM_SETTINGS_UPDATED', (data) => {
      console.log('Room settings updated:', data.settings);
      
      this.impostorCountSetting = data.settings.impostorCount;
      this.killCooldownSetting = data.settings.killCooldown;
      this.playerSpeedSetting = data.settings.playerSpeed;
      this.botCountSetting = data.settings.botCount;
      this.botDifficulty = data.settings.botDifficulty || 'medium';

      // Update local sliders/HUD if config modal is open or settings view is active
      const configImpostors = document.getElementById('config-impostors');
      if (configImpostors) configImpostors.value = this.impostorCountSetting;
      const impostorsLabel = document.getElementById('config-impostors-val');
      if (impostorsLabel) impostorsLabel.innerText = this.impostorCountSetting;

      const configSpeed = document.getElementById('config-speed');
      if (configSpeed) configSpeed.value = this.playerSpeedSetting;
      const speedLabel = document.getElementById('config-speed-val');
      if (speedLabel) speedLabel.innerText = this.playerSpeedSetting;

      const configCooldown = document.getElementById('config-cooldown');
      if (configCooldown) configCooldown.value = this.killCooldownSetting;
      const cooldownLabel = document.getElementById('config-cooldown-val');
      if (cooldownLabel) cooldownLabel.innerText = `${this.killCooldownSetting}s`;

      const configBots = document.getElementById('config-bots');
      if (configBots) configBots.value = this.botCountSetting;
      const botsLabel = document.getElementById('config-bots-val');
      if (botsLabel) botsLabel.innerText = this.botCountSetting;

      const configBotDiff = document.getElementById('config-bot-diff');
      if (configBotDiff) configBotDiff.value = this.botDifficulty;

      // Host updates local bot entities based on target count
      if (this.isHost) {
        this.syncLobbyBots();
      }
    });

    nm.on('CHAT_MESSAGE_RECEIVED', (data) => {
      console.log('Chat message received:', data);
      if (window.addChatMessage) {
        window.addChatMessage(data.senderName, data.color, data.message);
      }
      
      // Authoritatively trigger bot responses on host
      if (this.isHost && window.handlePlayerChatMessage) {
        window.handlePlayerChatMessage(data.message);
      }
    });

    // Bind room code copy listener
    const roomCodeDisplay = document.getElementById('game-room-code-display');
    if (roomCodeDisplay && !roomCodeDisplay.hasCopyListener) {
      roomCodeDisplay.hasCopyListener = true;
      roomCodeDisplay.addEventListener('click', () => {
        const codeText = roomCodeDisplay.textContent.replace('Room Code: ', '').trim();
        if (codeText && codeText !== '------') {
          navigator.clipboard.writeText(codeText).then(() => {
            const originalText = roomCodeDisplay.textContent;
            roomCodeDisplay.textContent = 'Copied!';
            roomCodeDisplay.style.color = 'var(--neon-green)';
            setTimeout(() => {
              roomCodeDisplay.textContent = originalText;
              roomCodeDisplay.style.color = '';
            }, 1500);
          }).catch(err => {
            console.error('Failed to copy: ', err);
          });
        }
      });
    }
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
        impostorCount: this.impostorCountSetting || 1,
        killCooldown: this.killCooldownSetting,
        playerSpeed: this.playerSpeedSetting,
        botCount: this.botCountSetting,
        botDifficulty: this.botDifficulty || 'medium'
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
    this.isMultiplayer = false;
    if (this.networkManager) {
      this.networkManager.send('LEAVE_ROOM', {});
      this.networkManager.disconnect();
    }
    this.networkManager = null;
    this.roomCode = null;
    this.isHost = false;
    this.remotePlayers.clear();
    this.localPlayerId = null;
    
    // Return to title screen
    this.gameState = 'LOBBY';
    const roomCodeDisplay = document.getElementById('game-room-code-display');
    if (roomCodeDisplay) roomCodeDisplay.classList.add('hidden');
    const leaveRoomHud = document.getElementById('lobby-leave-btn-hud');
    if (leaveRoomHud) leaveRoomHud.classList.add('hidden');

    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');

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

    // If host, sync bot position updates to the server too
    if (this.isHost) {
      const bots = this.entities.filter(e => e.id.startsWith('bot-')).map(bot => ({
        id: bot.id,
        x: bot.x,
        y: bot.y,
        isFacingLeft: bot.isFacingLeft,
        isMoving: bot.isMoving
      }));
      if (bots.length > 0) {
        this.networkManager.send('BOT_POSITION_UPDATE', { bots });
      }
    }
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
