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
      const onlineBtn = document.createElement('div');
      onlineBtn.id = 'menu-online-btn';
      onlineBtn.className = 'dashboard-btn';
      onlineBtn.style.background = 'linear-gradient(180deg, #6a5acd, #483d8b)';
      onlineBtn.style.marginTop = '8px';
      onlineBtn.innerHTML = '<span class="btn-icon">🌐</span><span class="btn-text">ONLINE MULTIPLAYER</span>';
      onlineBtn.addEventListener('click', () => this.showMultiplayerMenu());
      playBtn.parentElement.appendChild(onlineBtn);
    }

    // Create multiplayer modal container if doesn't exist
    if (!document.getElementById('multiplayer-modal')) {
      const modal = document.createElement('div');
      modal.id = 'multiplayer-modal';
      modal.className = 'modal-overlay hidden';
      modal.innerHTML = `
        <div class="modal-content glass-modal-content" style="max-width: 500px;">
          <button id="multiplayer-close-btn" class="close-btn">&times;</button>
          <h2 style="text-align: center; font-size: 1.8rem; letter-spacing: 2px; margin-bottom: 25px; color: var(--neon-blue);">Online Multiplayer</h2>
          <div id="multiplayer-content"></div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('multiplayer-close-btn').addEventListener('click', () => {
        this.hideMultiplayerMenu();
      });
    }

    // Create lobby modal if doesn't exist
    if (!document.getElementById('multiplayer-lobby-modal')) {
      const lobby = document.createElement('div');
      lobby.id = 'multiplayer-lobby-modal';
      lobby.className = 'modal-overlay hidden';
      lobby.innerHTML = `
        <div class="modal-content glass-modal-content" style="max-width: 700px;">
          <h2 style="text-align: center; font-size: 1.8rem; letter-spacing: 2px; margin-bottom: 25px; color: var(--neon-blue);">Game Lobby</h2>
          <div style="text-align: center; margin: 20px 0; background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Room Code</div>
            <div style="font-size: 3rem; font-weight: 900; letter-spacing: 12px; color: var(--neon-green); text-shadow: 0 0 20px rgba(46, 204, 113, 0.5);" id="lobby-room-code">------</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">Share this code with friends</div>
          </div>
          <div id="lobby-players-list"></div>
          <div id="lobby-host-controls" class="hidden"></div>
          <div style="margin-top: 25px; display: flex; gap: 12px; justify-content: center;">
            <button id="lobby-leave-btn" class="btn btn-skip" style="padding: 12px 32px;">LEAVE</button>
            <button id="lobby-start-btn" class="btn primary-btn hidden" style="padding: 12px 32px;">START GAME</button>
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

      const roomCodeEl = document.getElementById('lobby-room-code');
      if (roomCodeEl) {
        roomCodeEl.style.cursor = 'pointer';
        roomCodeEl.title = 'Click to copy';
        roomCodeEl.addEventListener('click', () => {
          const code = roomCodeEl.textContent;
          if (code && code !== '------') {
            navigator.clipboard.writeText(code).then(() => {
              const subtitle = roomCodeEl.nextElementSibling;
              if (subtitle) {
                const originalText = subtitle.textContent;
                subtitle.textContent = 'Copied to clipboard!';
                subtitle.style.color = 'var(--neon-green)';
                setTimeout(() => {
                  subtitle.textContent = originalText;
                  subtitle.style.color = '';
                }, 2000);
              }
            }).catch(err => {
              console.error('Failed to copy text: ', err);
            });
          }
        });
      }
    }
  }

  showMultiplayerMenu() {
    // Only show if we're in the title screen (not in-game)
    const titleScreen = document.getElementById('title-screen');
    if (!titleScreen || titleScreen.classList.contains('hidden')) {
      return; // Don't show multiplayer menu if not on title screen
    }

    const modal = document.getElementById('multiplayer-modal');
    const content = document.getElementById('multiplayer-content');
    
    content.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <button id="mp-create-room-btn" class="btn primary-btn" style="padding: 18px 28px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 10px;">
          <span style="font-size: 1.4rem;">➕</span>
          <span>CREATE ROOM</span>
        </button>
        <div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600;">— or —</div>
        <input type="text" id="mp-room-code-input" placeholder="ENTER 6-CHARACTER ROOM CODE" 
               style="padding: 15px; font-size: 1.1rem; text-align: center; text-transform: uppercase; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); color: #fff; border-radius: 8px; outline: none; font-family: var(--font-family); font-weight: 600; letter-spacing: 3px;" maxlength="6">
        <button id="mp-join-room-btn" class="btn secondary-btn" style="padding: 18px 28px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 10px;">
          <span style="font-size: 1.4rem;">🚪</span>
          <span>JOIN ROOM</span>
        </button>
        <div id="mp-error-msg" style="color: var(--neon-red); text-align: center; display: none; font-weight: 600; padding: 10px; background: rgba(231, 76, 60, 0.1); border-radius: 6px; border: 1px solid var(--neon-red);"></div>
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
    const lobby = document.getElementById('multiplayer-lobby-modal');
    const roomCodeEl = document.getElementById('lobby-room-code');
    const startBtn = document.getElementById('lobby-start-btn');

    if (roomCodeEl) roomCodeEl.textContent = room.code;
    
    if (isHost && startBtn) {
      startBtn.classList.remove('hidden');
    } else if (startBtn) {
      startBtn.classList.add('hidden');
    }

    this.updatePlayerList(room.players);
    if (lobby) lobby.classList.remove('hidden');

    // Hide title screen
    const titleScreen = document.getElementById('title-screen');
    if (titleScreen) titleScreen.classList.add('hidden');
  }

  hideLobby() {
    const lobby = document.getElementById('multiplayer-lobby-modal');
    if (lobby) lobby.classList.add('hidden');
    
    // Show title screen if returning to lobby
    if (this.gameEngine.gameState === 'LOBBY') {
      const titleScreen = document.getElementById('title-screen');
      if (titleScreen) titleScreen.classList.remove('hidden');
    }
  }

  updatePlayerList(players) {
    const list = document.getElementById('lobby-players-list');
    if (!list) return;
    
    list.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 20px 0;">
        ${players.map(p => `
          <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--glass-border);">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${p.color}; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
            <div style="flex: 1;">
              <div style="font-weight: bold; font-size: 0.95rem; color: #fff;">${p.nickname}</div>
              ${p.isHost ? '<div style="font-size: 0.75rem; color: #ffd700; margin-top: 2px;">👑 Host</div>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
        ${players.length} / 10 players
      </div>
    `;
  }

  showError(message) {
    // First try to show in the multiplayer modal
    const errorEl = document.getElementById('mp-error-msg');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }
    
    // Also show the modal if it's hidden
    const modal = document.getElementById('multiplayer-modal');
    if (modal && modal.classList.contains('hidden')) {
      this.showMultiplayerMenu();
      // Wait a bit then show error
      setTimeout(() => {
        const errorEl2 = document.getElementById('mp-error-msg');
        if (errorEl2) {
          errorEl2.textContent = message;
          errorEl2.style.display = 'block';
        }
      }, 100);
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
