// Multiplayer UI components

class MultiplayerUI {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.setupUI();
  }

  setupUI() {
    // Add "Online Multiplayer" button to title screen
    const playBtn = document.getElementById('menu-play-btn');
    if (playBtn && playBtn.parentElement) {
      const onlineBtn = document.createElement('button');
      onlineBtn.id = 'menu-online-btn';
      onlineBtn.className = 'menu-btn';
      onlineBtn.textContent = '🌐 ONLINE MULTIPLAYER';
      onlineBtn.addEventListener('click', () => this.showMultiplayerMenu());
      playBtn.parentElement.insertBefore(onlineBtn, playBtn.nextSibling);
    }

    // Create multiplayer modal container if doesn't exist
    if (!document.getElementById('multiplayer-modal')) {
      const modal = document.createElement('div');
      modal.id = 'multiplayer-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = `
        <div class="modal-content">
          <h2 id="multiplayer-title">Online Multiplayer</h2>
          <div id="multiplayer-content"></div>
          <button id="multiplayer-close-btn" class="btn">Close</button>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('multiplayer-close-btn').addEventListener('click', () => {
        this.hideMultiplayerMenu();
      });
    }

    // Create lobby modal if doesn't exist
    if (!document.getElementById('lobby-modal')) {
      const lobby = document.createElement('div');
      lobby.id = 'lobby-modal';
      lobby.className = 'modal hidden';
      lobby.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
          <h2>Game Lobby</h2>
          <div style="text-align: center; margin: 20px 0;">
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;" id="lobby-room-code">------</div>
            <div style="font-size: 14px; color: #888;">Share this code with friends</div>
          </div>
          <div id="lobby-players-list"></div>
          <div id="lobby-host-controls" class="hidden"></div>
          <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button id="lobby-leave-btn" class="btn">Leave</button>
            <button id="lobby-start-btn" class="btn hidden">Start Game</button>
          </div>
        </div>
      `;
      document.body.appendChild(lobby);

      document.getElementById('lobby-leave-btn').addEventListener('click', () => {
        this.gameEngine.leaveRoom();
      });

      document.getElementById('lobby-start-btn').addEventListener('click', () => {
        this.gameEngine.networkManager.send('START_GAME', {});
      });
    }
  }

  showMultiplayerMenu() {
    const modal = document.getElementById('multiplayer-modal');
    const content = document.getElementById('multiplayer-content');
    
    content.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 15px; max-width: 400px; margin: 0 auto;">
        <button id="mp-create-room-btn" class="btn" style="padding: 20px; font-size: 18px;">
          ➕ Create Room
        </button>
        <div style="text-align: center; color: #666;">— or —</div>
        <input type="text" id="mp-room-code-input" placeholder="Enter 6-character room code" 
               style="padding: 15px; font-size: 18px; text-align: center; text-transform: uppercase;" maxlength="6">
        <button id="mp-join-room-btn" class="btn" style="padding: 20px; font-size: 18px;">
          🚪 Join Room
        </button>
        <div id="mp-error-msg" style="color: #ff4444; text-align: center; display: none;"></div>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('mp-create-room-btn').addEventListener('click', () => {
      this.hideMultiplayerMenu();
      this.gameEngine.startMultiplayerMode('create');
      this.gameEngine.createRoom();
    });

    document.getElementById('mp-join-room-btn').addEventListener('click', () => {
      const code = document.getElementById('mp-room-code-input').value.trim().toUpperCase();
      if (code.length !== 6) {
        this.showError('Please enter a 6-character room code');
        return;
      }
      this.hideMultiplayerMenu();
      this.gameEngine.startMultiplayerMode('join');
      this.gameEngine.joinRoom(code);
    });

    document.getElementById('mp-room-code-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('mp-join-room-btn').click();
      }
    });
  }

  hideMultiplayerMenu() {
    document.getElementById('multiplayer-modal').classList.add('hidden');
  }

  showLobby(room, isHost) {
    const lobby = document.getElementById('lobby-modal');
    const roomCodeEl = document.getElementById('lobby-room-code');
    const startBtn = document.getElementById('lobby-start-btn');

    roomCodeEl.textContent = room.code;
    
    if (isHost) {
      startBtn.classList.remove('hidden');
    } else {
      startBtn.classList.add('hidden');
    }

    this.updatePlayerList(room.players);
    lobby.classList.remove('hidden');

    // Hide title screen
    const titleScreen = document.getElementById('title-screen');
    if (titleScreen) titleScreen.classList.add('hidden');
  }

  hideLobby() {
    document.getElementById('lobby-modal').classList.add('hidden');
    
    // Show title screen if returning to lobby
    if (this.gameEngine.gameState === 'LOBBY') {
      const titleScreen = document.getElementById('title-screen');
      if (titleScreen) titleScreen.classList.remove('hidden');
    }
  }

  updatePlayerList(players) {
    const list = document.getElementById('lobby-players-list');
    
    list.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0;">
        ${players.map(p => `
          <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 50%; background: ${p.color};"></div>
            <div style="flex: 1;">
              <div style="font-weight: bold;">${p.nickname}</div>
              ${p.isHost ? '<div style="font-size: 12px; color: #ffd700;">👑 Host</div>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="text-align: center; color: #888;">
        ${players.length} / 10 players
      </div>
    `;
  }

  showError(message) {
    const errorEl = document.getElementById('mp-error-msg');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 3000);
    } else {
      alert(message);
    }
  }

  showConnectionStatus(status) {
    // TODO: Show connection quality indicator
    console.log('Connection status:', status);
  }
}

// Initialize when loaded
if (typeof window !== 'undefined') {
  window.MultiplayerUI = MultiplayerUI;
}

export { MultiplayerUI };
