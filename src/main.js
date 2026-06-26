// Main game engine orchestrator for papmongus
import { 
  SCREEN_WIDTH, SCREEN_HEIGHT, TILE_SIZE, COLORS, CONTROLS, TASKS_LIST, ROOMS,
  VISION_RADIUS_CREW, VISION_RADIUS_IMPOSTOR, VISION_RADIUS_SABOTAGED,
  KILL_COOLDOWN, KILL_RANGE, SABOTAGE_COOLDOWN
} from './config.js';
import { GameMap } from './map.js';
import { Player, AIBot } from './entity.js';
import { getVisibilityPolygon, clipToVisibility } from './raycast.js';
import { initMinigames, openMinigame, closeMinigame } from './minigames.js';
import { getClosestTask, updateTasksHUD, getTaskProgress } from './tasks.js';
import { startMeeting, initMeetingUI } from './meetings.js';
import { drawCrewmate, drawDeadBody, drawVent, drawEmergencyButton, drawTaskConsole } from './sprites.js';
import { 
  playClick, playKill, playReport, playVictory, playDefeat, playSabotageAlert, setVolume, playRoleReveal 
} from './audio.js';
import { initMultiplayer } from './multiplayer.js';
import { MultiplayerUI } from './multiplayer-ui.js';

class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.shadowCanvas = document.createElement('canvas');
    this.shadowCtx = this.shadowCanvas.getContext('2d');
    
    this.gameState = 'LOBBY'; // LOBBY, PLAYING, MINIGAME, MEETING, EJECTING, GAMEOVER
    this.gameMode = 'SINGLE';  // SINGLE, COOP
    
    this.map = new GameMap();
    this.entities = [];
    this.deadBodies = [];
    
    this.keys = {};
    this.p1Color = 'red';
    this.p1Role = 'random';
    
    // Sabotages status
    this.sabotageActive = false;
    this.sabotageType = null; // 'lights'
    this.sabotageCooldownP1 = 0;
    this.sabotageCooldownP2 = 0;

    // Ejection animation state
    this.ejectData = null; // { entity, isSkip, isTie, timer, stars: [] }

    // Load Task Points & Cosmetics
    const storedTp = localStorage.getItem('papmongus_tp');
    this.tp = storedTp !== null ? parseInt(storedTp) : 0;
    if (isNaN(this.tp)) this.tp = 0;

    this.unlockedHats = ['none'];
    try {
      const storedHats = localStorage.getItem('papmongus_hats');
      if (storedHats) {
        this.unlockedHats = JSON.parse(storedHats) || ['none'];
      }
    } catch (e) {
      console.warn("Failed to parse hats:", e);
    }

    this.equippedHat = localStorage.getItem('papmongus_equipped_hat') || 'none';

    // Load Settings
    const volVal = localStorage.getItem('papmongus_volume');
    this.volume = volVal !== null ? parseFloat(volVal) : 0.5;
    if (isNaN(this.volume)) this.volume = 0.5;

    const speedVal = localStorage.getItem('papmongus_speed');
    this.playerSpeedSetting = speedVal !== null ? parseFloat(speedVal) : 3.5;
    if (isNaN(this.playerSpeedSetting)) this.playerSpeedSetting = 3.5;

    const cdVal = localStorage.getItem('papmongus_cooldown');
    this.killCooldownSetting = cdVal !== null ? parseInt(cdVal) : 25;
    if (isNaN(this.killCooldownSetting)) this.killCooldownSetting = 25;

    const botsVal = localStorage.getItem('papmongus_bots');
    this.botCountSetting = botsVal !== null ? parseInt(botsVal) : 6;
    if (isNaN(this.botCountSetting)) this.botCountSetting = 6;

    const impVal = localStorage.getItem('papmongus_impostors');
    this.impostorCountSetting = impVal !== null ? parseInt(impVal) : 1;
    if (isNaN(this.impostorCountSetting)) this.impostorCountSetting = 1;

    // Multiplayer properties
    this.isMultiplayer = false;
    this.networkManager = null;
    this.roomCode = null;
    this.isHost = false;
    this.remotePlayers = new Map(); // playerId -> RemotePlayer
    this.localPlayerId = null;
    this.lastPositionUpdate = 0;
    this.positionUpdateInterval = 50; // 20Hz = 50ms

    // Set initial audio volume
    setVolume(this.volume);
    
    this.setupLobbyUI();
    this.setupTitleScreenUI();
    this.setupRoomConfigUI();
    this.setupInputListeners();
    this.setupActionButtonListeners();
    initMinigames();
    initMeetingUI();

    // Initialize multiplayer functionality
    initMultiplayer(this);
    
    // Initialize multiplayer UI
    if (typeof window !== 'undefined') {
      window.multiplayerUI = new MultiplayerUI(this);
    }

    // Start title screen starfield and rotating crewmate background canvas loop
    this.initMenuCanvas();
  }

  setupActionButtonListeners() {
    const bindButton = (btnId, keyCode) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          playClick();
          this.handleKeyPress(keyCode);
        });
        btn.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          e.preventDefault();
          playClick();
          this.handleKeyPress(keyCode);
        });
      }
    };

    // P1 Action buttons
    bindButton('p1-action-use', CONTROLS.P1.use);
    bindButton('p1-action-kill', CONTROLS.P1.kill);
    bindButton('p1-action-vent', CONTROLS.P1.vent);
    bindButton('p1-action-report', CONTROLS.P1.report);

    // P2 Action buttons
    bindButton('p2-action-use', CONTROLS.P2.use);
    bindButton('p2-action-kill', CONTROLS.P2.kill);
    bindButton('p2-action-vent', CONTROLS.P2.vent);
    bindButton('p2-action-report', CONTROLS.P2.report);
  }

  setupTitleScreenUI() {
    // Initial Nickname & TP Displays
    const nameInput = document.getElementById('player-name-input');
    if (nameInput) {
      const savedName = localStorage.getItem('papmongus_name');
      if (savedName) {
        nameInput.value = savedName;
      }
      nameInput.addEventListener('input', (e) => {
        localStorage.setItem('papmongus_name', e.target.value);
      });
    }

    this.updateTPDisplay();

    // Helper to open/close modal overlays
    const bindModal = (openBtnId, modalId, closeBtnId, beforeOpen = null) => {
      const openBtn = document.getElementById(openBtnId);
      const modal = document.getElementById(modalId);
      const closeBtn = document.getElementById(closeBtnId);
      
      if (openBtn && modal && closeBtn) {
        openBtn.addEventListener('click', () => {
          playClick();
          if (beforeOpen) beforeOpen();
          modal.classList.remove('hidden');
        });
        closeBtn.addEventListener('click', () => {
          playClick();
          modal.classList.add('hidden');
        });
      }
    };

    // Play button -> goes straight to waiting room
    const playBtn = document.getElementById('menu-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        playClick();
        this.startGame();
      });
    }

    // Settings button -> opens Settings modal
    bindModal('menu-settings-btn', 'settings-modal', 'settings-close-btn', () => {
      // Sync sliders with memory settings
      const volSlider = document.getElementById('setting-volume');
      if (volSlider) volSlider.value = this.volume;
      const volValLabel = document.getElementById('volume-val');
      if (volValLabel) volValLabel.innerText = `${Math.round(this.volume * 100)}%`;

      const speedSlider = document.getElementById('setting-speed');
      if (speedSlider) speedSlider.value = this.playerSpeedSetting;
      const speedValLabel = document.getElementById('speed-val');
      if (speedValLabel) speedValLabel.innerText = this.playerSpeedSetting;

      const cdSlider = document.getElementById('setting-cooldown');
      if (cdSlider) cdSlider.value = this.killCooldownSetting;
      const cooldownValLabel = document.getElementById('cooldown-val');
      if (cooldownValLabel) cooldownValLabel.innerText = `${this.killCooldownSetting}s`;

      const botsSlider = document.getElementById('setting-bots');
      if (botsSlider) botsSlider.value = this.botCountSetting;
      const botsValLabel = document.getElementById('bots-val');
      if (botsValLabel) botsValLabel.innerText = this.botCountSetting;
    });

    // Shop button -> opens Shop modal
    bindModal('menu-shop-btn', 'shop-modal', 'shop-close-btn', () => {
      this.updateShopInventoryUI();
    });

    // Inventory button -> opens Inventory modal
    bindModal('menu-inventory-btn', 'inventory-modal', 'inventory-close-btn', () => {
      this.updateShopInventoryUI();
    });

    // Settings Sliders Event Listeners
    const volSlider = document.getElementById('setting-volume');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        this.volume = parseFloat(e.target.value);
        localStorage.setItem('papmongus_volume', this.volume);
        const volValLabel = document.getElementById('volume-val');
        if (volValLabel) volValLabel.innerText = `${Math.round(this.volume * 100)}%`;
        setVolume(this.volume);
      });
    }

    const speedSlider = document.getElementById('setting-speed');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.playerSpeedSetting = parseFloat(e.target.value);
        localStorage.setItem('papmongus_speed', this.playerSpeedSetting);
        const speedValLabel = document.getElementById('speed-val');
        if (speedValLabel) speedValLabel.innerText = this.playerSpeedSetting;
      });
    }

    const cdSlider = document.getElementById('setting-cooldown');
    if (cdSlider) {
      cdSlider.addEventListener('input', (e) => {
        this.killCooldownSetting = parseInt(e.target.value);
        localStorage.setItem('papmongus_cooldown', this.killCooldownSetting);
        const cooldownValLabel = document.getElementById('cooldown-val');
        if (cooldownValLabel) cooldownValLabel.innerText = `${this.killCooldownSetting}s`;
      });
    }

    const botsSlider = document.getElementById('setting-bots');
    if (botsSlider) {
      botsSlider.addEventListener('input', (e) => {
        this.botCountSetting = parseInt(e.target.value);
        localStorage.setItem('papmongus_bots', this.botCountSetting);
        const botsValLabel = document.getElementById('bots-val');
        if (botsValLabel) botsValLabel.innerText = this.botCountSetting;
      });
    }

    // Shop Buy Hats Handlers
    const bindBuyHandler = (hatName, price) => {
      const btn = document.getElementById(`buy-${hatName}`);
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.unlockedHats.includes(hatName)) return;
          if (this.tp >= price) {
            this.tp -= price;
            localStorage.setItem('papmongus_tp', this.tp);
            this.unlockedHats.push(hatName);
            localStorage.setItem('papmongus_hats', JSON.stringify(this.unlockedHats));
            playVictory(); // play a triumphant little beep!
            this.updateTPDisplay();
            this.updateShopInventoryUI();
          } else {
            playDefeat(); // play low sound to indicate not enough points
            alert("Not enough Task Points (TP)!");
          }
        });
      }
    };

    bindBuyHandler('tophat', 100);
    bindBuyHandler('crown', 250);
    bindBuyHandler('chef', 150);
    bindBuyHandler('slug', 200);

    // Inventory Equip Hats Handlers
    const bindEquipHandler = (hatName) => {
      const btn = document.getElementById(`equip-${hatName}`);
      if (btn) {
        btn.addEventListener('click', () => {
          playClick();
          this.equippedHat = hatName;
          localStorage.setItem('papmongus_equipped_hat', hatName);
          this.updateShopInventoryUI();
        });
      }
    };

    bindEquipHandler('none');
    bindEquipHandler('tophat');
    bindEquipHandler('crown');
    bindEquipHandler('chef');
    bindEquipHandler('slug');

    // News/Account/Credits buttons clicks
    ['menu-news-btn', 'menu-account-btn', 'menu-credits-btn', 'friends-btn'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          playClick();
          alert(`Option '${btn.innerText.trim()}' is coming soon! Complete tasks to earn Task Points.`);
        });
      }
    });
  }

  updateTPDisplay() {
    const tpDisp = document.getElementById('tp-amount');
    const shopTpDisp = document.getElementById('shop-tp-amount');
    if (tpDisp) tpDisp.innerText = this.tp;
    if (shopTpDisp) shopTpDisp.innerText = this.tp;
  }

  addTP(amount) {
    this.tp += amount;
    localStorage.setItem('papmongus_tp', this.tp);
    this.updateTPDisplay();
  }

  updateShopInventoryUI() {
    const hats = ['tophat', 'crown', 'chef', 'slug'];
    
    // Update Shop
    hats.forEach(hat => {
      const buyBtn = document.getElementById(`buy-${hat}`);
      if (buyBtn) {
        if (this.unlockedHats.includes(hat)) {
          buyBtn.innerText = 'OWNED';
          buyBtn.disabled = true;
          buyBtn.style.opacity = '0.5';
        } else {
          buyBtn.innerText = 'BUY';
          buyBtn.disabled = false;
          buyBtn.style.opacity = '1';
        }
      }
    });

    // Update Inventory
    hats.forEach(hat => {
      const invEl = document.getElementById(`inv-${hat}`);
      const equipBtn = document.getElementById(`equip-${hat}`);
      if (invEl && equipBtn) {
        if (this.unlockedHats.includes(hat)) {
          invEl.classList.remove('locked');
          equipBtn.disabled = false;
          if (this.equippedHat === hat) {
            equipBtn.innerText = 'EQUIPPED';
            equipBtn.classList.add('active');
          } else {
            equipBtn.innerText = 'EQUIP';
            equipBtn.classList.remove('active');
          }
        } else {
          invEl.classList.add('locked');
          equipBtn.disabled = true;
          equipBtn.innerText = 'LOCKED';
          equipBtn.classList.remove('active');
        }
      }
    });

    // Equip None button
    const equipNone = document.getElementById('equip-none');
    if (equipNone) {
      if (this.equippedHat === 'none') {
        equipNone.innerText = 'EQUIPPED';
        equipNone.classList.add('active');
      } else {
        equipNone.innerText = 'EQUIP';
        equipNone.classList.remove('active');
      }
    }
  }

  setupRoomConfigUI() {
    const modal = document.getElementById('room-config-modal');
    const closeBtn = document.getElementById('room-config-close-btn');
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        playClick();
        modal.classList.add('hidden');
      });
    }

    // Tab buttons switching
    const tabAppearanceBtn = document.getElementById('tab-appearance-btn');
    const tabSettingsBtn = document.getElementById('tab-settings-btn');
    
    if (tabAppearanceBtn && tabSettingsBtn) {
      tabAppearanceBtn.addEventListener('click', () => {
        playClick();
        this.switchConfigTab('appearance');
      });
      tabSettingsBtn.addEventListener('click', () => {
        playClick();
        this.switchConfigTab('settings');
      });
    }

    // Bind settings sliders in Room Config
    const configVol = document.getElementById('config-volume');
    if (configVol) {
      configVol.addEventListener('input', (e) => {
        this.volume = parseFloat(e.target.value);
        localStorage.setItem('papmongus_volume', this.volume);
        const valLabel = document.getElementById('config-volume-val');
        if (valLabel) valLabel.innerText = `${Math.round(this.volume * 100)}%`;
        setVolume(this.volume);
        // Also sync main menu setting slider
        const mainVol = document.getElementById('setting-volume');
        if (mainVol) mainVol.value = this.volume;
        const mainVolLabel = document.getElementById('volume-val');
        if (mainVolLabel) mainVolLabel.innerText = `${Math.round(this.volume * 100)}%`;
      });
    }

    const configSpeed = document.getElementById('config-speed');
    if (configSpeed) {
      configSpeed.addEventListener('input', (e) => {
        this.playerSpeedSetting = parseFloat(e.target.value);
        localStorage.setItem('papmongus_speed', this.playerSpeedSetting);
        const valLabel = document.getElementById('config-speed-val');
        if (valLabel) valLabel.innerText = this.playerSpeedSetting;
        // Update players speed in real-time
        this.entities.forEach(ent => {
          if (ent instanceof Player) {
            ent.speed = this.playerSpeedSetting;
          }
        });
        // Sync main menu setting slider
        const mainSpeed = document.getElementById('setting-speed');
        if (mainSpeed) mainSpeed.value = this.playerSpeedSetting;
        const mainSpeedLabel = document.getElementById('speed-val');
        if (mainSpeedLabel) mainSpeedLabel.innerText = this.playerSpeedSetting;

        if (this.isMultiplayer && this.isHost) {
          this.syncSettingsToServer();
        }
      });
    }

    const configCooldown = document.getElementById('config-cooldown');
    if (configCooldown) {
      configCooldown.addEventListener('input', (e) => {
        this.killCooldownSetting = parseInt(e.target.value);
        localStorage.setItem('papmongus_cooldown', this.killCooldownSetting);
        const valLabel = document.getElementById('config-cooldown-val');
        if (valLabel) valLabel.innerText = `${this.killCooldownSetting}s`;
        // Sync main menu setting slider
        const mainCooldown = document.getElementById('setting-cooldown');
        if (mainCooldown) mainCooldown.value = this.killCooldownSetting;
        const mainCooldownLabel = document.getElementById('cooldown-val');
        if (mainCooldownLabel) mainCooldownLabel.innerText = `${this.killCooldownSetting}s`;

        if (this.isMultiplayer && this.isHost) {
          this.syncSettingsToServer();
        }
      });
    }

    const configBots = document.getElementById('config-bots');
    if (configBots) {
      configBots.addEventListener('input', (e) => {
        this.botCountSetting = parseInt(e.target.value);
        localStorage.setItem('papmongus_bots', this.botCountSetting);
        const valLabel = document.getElementById('config-bots-val');
        if (valLabel) valLabel.innerText = this.botCountSetting;
        
        // Sync main menu setting slider
        const mainBots = document.getElementById('setting-bots');
        if (mainBots) mainBots.value = this.botCountSetting;
        const mainBotsLabel = document.getElementById('bots-val');
        if (mainBotsLabel) mainBotsLabel.innerText = this.botCountSetting;

        // Dynamically update bots in the dropship waiting room!
        if (this.gameState === 'WAITING_ROOM') {
          this.syncLobbyBots();
        }
      });
    }

    const configImpostors = document.getElementById('config-impostors');
    if (configImpostors) {
      configImpostors.addEventListener('input', (e) => {
        this.impostorCountSetting = parseInt(e.target.value);
        localStorage.setItem('papmongus_impostors', this.impostorCountSetting);
        const valLabel = document.getElementById('config-impostors-val');
        if (valLabel) valLabel.innerText = this.impostorCountSetting;

        if (this.isMultiplayer && this.isHost) {
          this.syncSettingsToServer();
        }
      });
    }

    // Role preference change
    const configRolePref = document.getElementById('config-role-pref');
    if (configRolePref) {
      configRolePref.addEventListener('change', (e) => {
        const val = e.target.value;
        const mainRole = document.getElementById('role-select');
        if (mainRole) mainRole.value = val;
      });
    }

    // Bot difficulty change
    const configBotDiff = document.getElementById('config-bot-diff');
    if (configBotDiff) {
      configBotDiff.addEventListener('change', (e) => {
        const val = e.target.value;
        this.botDifficulty = val;
        const mainDiff = document.getElementById('difficulty-select');
        if (mainDiff) mainDiff.value = val;
        // Update difficulty of active bots
        this.entities.forEach(ent => {
          if (ent instanceof AIBot) {
            ent.difficulty = val;
            // Recalculate AI speeds and task durations
            if (val === 'easy') {
              ent.speed = PLAYER_SPEED * 0.45;
              ent.taskDurationBase = 16000;
              ent.taskDurationRandom = 12000;
            } else if (val === 'hard') {
              ent.speed = PLAYER_SPEED * 0.95;
              ent.taskDurationBase = 6000;
              ent.taskDurationRandom = 5000;
            } else {
              ent.speed = PLAYER_SPEED * 0.7;
              ent.taskDurationBase = 11000;
              ent.taskDurationRandom = 8000;
            }
          }
        });

        if (this.isMultiplayer && this.isHost) {
          this.syncSettingsToServer();
        }
      });
    }

    // Game mode change
    const configGameMode = document.getElementById('config-game-mode');
    if (configGameMode) {
      configGameMode.addEventListener('change', (e) => {
        this.gameMode = e.target.value === 'coop' ? 'COOP' : 'SINGLE';
        if (this.gameState === 'WAITING_ROOM') {
          this.syncLobbyGameMode();
        }
      });
    }

    // START MATCH button inside Room Config
    const startBtn = document.getElementById('config-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        playClick();
        document.getElementById('room-config-modal').classList.add('hidden');
        if (this.isMultiplayer) {
          this.networkManager.send('START_GAME', {});
        } else {
          this.startActualGame();
        }
      });
    }
  }

  openRoomConfig(playerId) {
    this.activeConfigPlayerId = playerId;
    
    // Display modal
    const modal = document.getElementById('room-config-modal');
    modal.classList.remove('hidden');

    const player = this.entities.find(e => e.id === playerId);
    if (!player) return;

    // Set title
    const title = document.getElementById('room-config-title');
    if (title) title.innerText = `${player.nickname.toUpperCase()} CONFIGURATION`;

    // 1. Populate color picker swatch grid
    const colorGrid = document.getElementById('config-color-picker');
    colorGrid.innerHTML = '';
    const colorOptions = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink', 'white', 'black'];

    colorOptions.forEach((col) => {
      const swatch = document.createElement('div');
      // Check if this swatch color is the player's current color
      const isCurrent = player.color.toLowerCase() === COLORS[col].toLowerCase();
      swatch.className = `color-swatch ${isCurrent ? 'active' : ''}`;
      swatch.style.backgroundColor = COLORS[col];
      
      swatch.addEventListener('click', () => {
        playClick();
        player.color = COLORS[col];
        if (playerId === 'P1') {
          this.p1Color = col;
          if (this.isMultiplayer) {
            this.networkManager.send('COLOR_CHANGE', { color: COLORS[col] });
          }
        }
        // Refresh active classes in grid
        colorGrid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      });
      colorGrid.appendChild(swatch);
    });

    // 2. Populate hat picker grid
    const hatGrid = document.getElementById('config-hat-picker');
    hatGrid.innerHTML = '';

    const hatsList = [
      { id: 'none', label: 'No Hat', emoji: '❌' },
      { id: 'tophat', label: 'Top Hat', emoji: '🎩' },
      { id: 'crown', label: 'Golden Crown', emoji: '👑' },
      { id: 'chef', label: 'Chef Hat', emoji: '👨‍🍳' },
      { id: 'slug', label: 'Brain Slug', emoji: '🧠' }
    ];

    hatsList.forEach((hat) => {
      const isUnlocked = this.unlockedHats.includes(hat.id);
      
      const item = document.createElement('div');
      item.className = `inventory-item ${!isUnlocked ? 'locked' : ''}`;
      
      const preview = document.createElement('div');
      preview.className = 'hat-preview';
      preview.innerText = hat.emoji;
      item.appendChild(preview);

      const nameEl = document.createElement('div');
      nameEl.className = 'item-name';
      nameEl.innerText = hat.label;
      item.appendChild(nameEl);

      const btn = document.createElement('button');
      btn.className = 'btn equip-btn';
      
      const isEquipped = (player.equippedHat === hat.id) || (hat.id === 'none' && !player.equippedHat);
      if (isEquipped) {
        btn.innerText = 'EQUIPPED';
        btn.classList.add('active');
      } else if (isUnlocked) {
        btn.innerText = 'EQUIP';
      } else {
        btn.innerText = 'LOCKED';
        btn.disabled = true;
      }

      btn.addEventListener('click', () => {
        if (!isUnlocked) return;
        playClick();
        player.equippedHat = hat.id === 'none' ? null : hat.id;
        
        if (playerId === 'P1') {
          this.equippedHat = hat.id;
          localStorage.setItem('papmongus_equipped_hat', hat.id);
          if (this.isMultiplayer) {
            this.networkManager.send('COSMETIC_CHANGE', { equippedHat: hat.id === 'none' ? null : hat.id });
          }
        }
        
        // Refresh hat picker grid
        this.openRoomConfig(playerId);
      });

      item.appendChild(btn);
      hatGrid.appendChild(item);
    });

    // 3. Tab visibility based on player
    const tabSettingsBtn = document.getElementById('tab-settings-btn');
    if (playerId === 'P2') {
      tabSettingsBtn.classList.add('hidden');
      this.switchConfigTab('appearance');
    } else {
      tabSettingsBtn.classList.remove('hidden');
    }

    // 4. Start Match button visibility
    const startBtn = document.getElementById('config-start-btn');
    if (playerId === 'P1') {
      startBtn.classList.remove('hidden');
    } else {
      startBtn.classList.add('hidden');
    }

    // 5. Sync setting sliders
    const configVol = document.getElementById('config-volume');
    if (configVol) configVol.value = this.volume;
    const volLabel = document.getElementById('config-volume-val');
    if (volLabel) volLabel.innerText = `${Math.round(this.volume * 100)}%`;

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

    const configImpostors = document.getElementById('config-impostors');
    if (configImpostors) configImpostors.value = this.impostorCountSetting || 1;
    const impostorsLabel = document.getElementById('config-impostors-val');
    if (impostorsLabel) impostorsLabel.innerText = this.impostorCountSetting || 1;

    const configGameMode = document.getElementById('config-game-mode');
    if (configGameMode) {
      configGameMode.value = this.gameMode === 'COOP' ? 'coop' : 'single';
    }

    const configRolePref = document.getElementById('config-role-pref');
    if (configRolePref) {
      const mainRole = document.getElementById('role-select');
      if (mainRole) configRolePref.value = mainRole.value;
    }

    const configBotDiff = document.getElementById('config-bot-diff');
    if (configBotDiff) {
      const mainDiff = document.getElementById('difficulty-select');
      if (mainDiff) configBotDiff.value = mainDiff.value;
    }
  }

  switchConfigTab(tabName) {
    const tabAppearance = document.getElementById('tab-appearance');
    const tabSettings = document.getElementById('tab-settings');
    const tabAppearanceBtn = document.getElementById('tab-appearance-btn');
    const tabSettingsBtn = document.getElementById('tab-settings-btn');

    if (tabName === 'appearance') {
      tabAppearance.classList.remove('hidden');
      tabSettings.classList.add('hidden');
      tabAppearanceBtn.classList.add('active');
      tabSettingsBtn.classList.remove('active');
    } else {
      tabAppearance.classList.add('hidden');
      tabSettings.classList.remove('hidden');
      tabAppearanceBtn.classList.remove('active');
      tabSettingsBtn.classList.add('active');
    }
  }

  syncLobbyBots() {
    if (this.isMultiplayer && !this.isHost) return;

    const activeBots = this.entities.filter(e => e.id.startsWith('bot-'));
    const currentCount = activeBots.length;
    const targetCount = this.botCountSetting;

    if (currentCount < targetCount) {
      const hatsList = ['tophat', 'crown', 'chef', 'slug', null];
      const botColors = ['green', 'yellow', 'purple', 'orange', 'cyan', 'pink', 'white', 'black', 'red', 'blue'];
      const botNames = ['Green Bot', 'Yellow Bot', 'Purple Bot', 'Orange Bot', 'Cyan Bot', 'Pink Bot', 'White Bot', 'Black Bot', 'Red Bot', 'Blue Bot'];
      
      const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 20 * TILE_SIZE + TILE_SIZE / 2 };

      for (let i = currentCount; i < targetCount; i++) {
        // Find a color that is not taken
        const takenColors = this.entities.map(e => e.color);
        let availableColor = null;
        for (let col of botColors) {
          if (!takenColors.includes(COLORS[col])) {
            availableColor = col;
            break;
          }
        }
        if (!availableColor) availableColor = botColors[i % botColors.length];

        const name = botNames[i % botNames.length];
        const angle = (i * 2 * Math.PI) / targetCount;
        const bx = spawnCenter.x + Math.cos(angle) * 35;
        const by = spawnCenter.y + Math.sin(angle) * 35;

        const bot = new AIBot(`bot-${i}`, bx, by, COLORS[availableColor], name, false, this.botDifficulty || 'medium');
        bot.equippedHat = hatsList[Math.floor(Math.random() * hatsList.length)];
        this.entities.push(bot);
      }
    } else if (currentCount > targetCount) {
      let removeCount = currentCount - targetCount;
      for (let i = this.entities.length - 1; i >= 0; i--) {
        if (this.entities[i].id.startsWith('bot-') && removeCount > 0) {
          this.entities.splice(i, 1);
          removeCount--;
        }
      }
    }

    if (this.isMultiplayer && this.isHost) {
      this.syncBotsToServer();
    }
  }

  syncSettingsToServer() {
    if (!this.isMultiplayer || !this.isHost || !this.networkManager) return;
    this.networkManager.send('UPDATE_SETTINGS', {
      settings: {
        impostorCount: this.impostorCountSetting || 1,
        killCooldown: this.killCooldownSetting,
        playerSpeed: this.playerSpeedSetting,
        botCount: this.botCountSetting,
        botDifficulty: this.botDifficulty || 'medium'
      }
    });
  }

  syncBotsToServer() {
    if (!this.isMultiplayer || !this.isHost || !this.networkManager) return;
    const bots = this.entities.filter(e => e.id.startsWith('bot-')).map(bot => ({
      id: bot.id,
      nickname: bot.nickname,
      color: bot.color,
      equippedHat: bot.equippedHat
    }));
    this.networkManager.send('SYNC_BOTS', { bots });
  }

  syncLobbyGameMode() {
    const p2Exists = this.entities.some(e => e.id === 'P2');
    
    if (this.gameMode === 'COOP') {
      if (!p2Exists) {
        document.getElementById('p2-hud').classList.remove('hidden');
        const p2Color = this.p1Color === 'blue' ? 'red' : 'blue';
        const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 20 * TILE_SIZE + TILE_SIZE / 2 };
        const hatsList = ['tophat', 'crown', 'chef', 'slug', null];
        
        const p2 = new Player('P2', spawnCenter.x + 30, spawnCenter.y - 30, COLORS[p2Color], 'Player 2', CONTROLS.P2, false);
        p2.equippedHat = hatsList[Math.floor(Math.random() * hatsList.length)];
        p2.speed = this.playerSpeedSetting;
        this.entities.push(p2);
      }
    } else {
      if (p2Exists) {
        document.getElementById('p2-hud').classList.add('hidden');
        const idx = this.entities.findIndex(e => e.id === 'P2');
        if (idx !== -1) {
          this.entities.splice(idx, 1);
        }
      }
    }
  }

  initMenuCanvas() {
    const canvas = document.getElementById('menu-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let stars = [];
    for (let i = 0; i < 30; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.5 + 0.2
      });
    }

    let crewmate = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      rot: 0,
      color: COLORS.blue,
      bob: 0
    };

    const loop = () => {
      // Only run if the title screen is visible
      const titleScreen = document.getElementById('title-screen');
      if (!titleScreen || titleScreen.classList.contains('hidden')) {
        requestAnimationFrame(loop);
        return;
      }

      ctx.fillStyle = '#000008';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars
      ctx.fillStyle = '#ffffff';
      stars.forEach(s => {
        ctx.fillRect(s.x, s.y, s.size, s.size);
        s.x -= s.speed;
        if (s.x < 0) s.x = canvas.width;
      });

      // Rotating crewmate
      ctx.save();
      ctx.translate(crewmate.x, crewmate.y + Math.sin(crewmate.bob) * 15);
      ctx.rotate(crewmate.rot);
      // Draw crewmate centered at (0,0)
      drawCrewmate(ctx, 0, 0, crewmate.color, false, false, false, false, '', 'slug');
      ctx.restore();

      crewmate.rot += 0.01;
      crewmate.bob += 0.02;

      requestAnimationFrame(loop);
    };

    loop();
  }

  setupLobbyUI() {
    // Populate color pickers in the lobby
    const colorGrid = document.getElementById('color-picker-grid');
    const colorOptions = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
    
    colorOptions.forEach((col, idx) => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch ${idx === 0 ? 'active' : ''}`;
      swatch.style.backgroundColor = COLORS[col];
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.p1Color = col;
      });
      colorGrid.appendChild(swatch);
    });

    // Start buttons
    document.getElementById('start-single-btn').addEventListener('click', () => {
      this.gameMode = 'SINGLE';
      this.startGame();
    });

    document.getElementById('start-coop-btn').addEventListener('click', () => {
      this.gameMode = 'COOP';
      this.startGame();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
      this.showLobby();
    });
  }

  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.handleKeyPress(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  handleKeyPress(code) {
    if (this.gameState === 'WAITING_ROOM') {
      const laptopPos = { x: 21 * TILE_SIZE + TILE_SIZE/2, y: 18 * TILE_SIZE + TILE_SIZE/2 };
      
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1 && code === CONTROLS.P1.use) {
        const dist = Math.sqrt((p1.x - laptopPos.x)**2 + (p1.y - laptopPos.y)**2);
        if (dist < 45) {
          playClick();
          this.openRoomConfig('P1');
        }
      }

      const p2 = this.entities.find(e => e.id === 'P2');
      if (p2 && code === CONTROLS.P2.use && this.gameMode === 'COOP') {
        const dist = Math.sqrt((p2.x - laptopPos.x)**2 + (p2.y - laptopPos.y)**2);
        if (dist < 45) {
          playClick();
          this.openRoomConfig('P2');
        }
      }
      return;
    }

    if (this.gameState !== 'PLAYING') return;

    // --- PLAYER 1 CONTROLS ---
    const p1 = this.entities.find(e => e.id === 'P1');
    if (p1 && !p1.isDead) {
      // 1. Interaction (E)
      if (code === CONTROLS.P1.use) {
        if (p1.isImpostor) {
          // Sabotage Lights (if on or near Electrical panel or anywhere)
          this.triggerSabotage('P1');
        } else {
          // Open closest task
          const task = getClosestTask(p1);
          if (task) {
            this.gameState = 'MINIGAME';
            openMinigame(task, (completedTask) => {
              completedTask.completed = true;
              this.gameState = 'PLAYING';
              this.addTP(10); // Award 10 TP on task completion
              if (this.isMultiplayer) {
                this.sendActionEvent('task', { taskId: completedTask.id });
              }
              this.checkVictoryConditions();
            });
          }
        }
      }

      // 2. Report (R)
      if (code === CONTROLS.P1.report) {
        this.checkForReport(p1);
      }

      // 3. Venting (F)
      if (code === CONTROLS.P1.vent && p1.isImpostor) {
        this.toggleVent(p1);
      }

      // Vent navigation (WASD inside vent)
      if (p1.isVenting) {
        if (code === 'KeyA' || code === 'KeyD' || code === 'KeyW' || code === 'KeyS') {
          this.navigateVents(p1);
        }
      }

      // 4. Kill (Q)
      if (code === CONTROLS.P1.kill && p1.isImpostor) {
        this.attemptKill(p1);
      }
    }

    // --- PLAYER 2 CONTROLS ---
    const p2 = this.entities.find(e => e.id === 'P2');
    if (p2 && !p2.isDead && this.gameMode === 'COOP') {
      // 1. Interaction (Num 1)
      if (code === CONTROLS.P2.use) {
        if (p2.isImpostor) {
          this.triggerSabotage('P2');
        } else {
          const task = getClosestTask(p2);
          if (task) {
            this.gameState = 'MINIGAME';
            openMinigame(task, (completedTask) => {
              completedTask.completed = true;
              this.gameState = 'PLAYING';
              this.addTP(10); // Award 10 TP on task completion
              this.checkVictoryConditions();
            });
          }
        }
      }

      // 2. Report (Num 2)
      if (code === CONTROLS.P2.report) {
        this.checkForReport(p2);
      }

      // 3. Venting (Num 0)
      if (code === CONTROLS.P2.vent && p2.isImpostor) {
        this.toggleVent(p2);
      }

      // Vent navigation (Arrows inside vent)
      if (p2.isVenting) {
        if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
          this.navigateVents(p2);
        }
      }

      // 4. Kill (Num 3)
      if (code === CONTROLS.P2.kill && p2.isImpostor) {
        this.attemptKill(p2);
      }
    }
  }

  startGame() {
    this.gameState = 'WAITING_ROOM';
    this.deadBodies = [];
    this.sabotageActive = false;
    this.sabotageType = null;
    this.sabotageCooldownP1 = 0;
    this.sabotageCooldownP2 = 0;

    document.getElementById('lobby-modal').classList.add('hidden');
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('sabotage-warning').classList.add('hidden');

    const nameInput = document.getElementById('player-name-input').value || 'Player 1';
    const difficulty = document.getElementById('difficulty-select').value;
    this.botDifficulty = difficulty;

    // Define all entities
    this.entities = [];

    // Dropship spawn coordinates (centered inside cabin)
    const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 20 * TILE_SIZE + TILE_SIZE / 2 };

    // Player 1
    const p1 = new Player('P1', spawnCenter.x, spawnCenter.y - 30, COLORS[this.p1Color], nameInput, CONTROLS.P1, false);
    p1.equippedHat = this.equippedHat === 'none' ? null : this.equippedHat;
    p1.speed = this.playerSpeedSetting;
    this.entities.push(p1);

    const hatsList = ['tophat', 'crown', 'chef', 'slug', null];

    // Player 2 (if Co-op)
    if (this.gameMode === 'COOP') {
      document.getElementById('p2-hud').classList.remove('hidden');
      const p2Color = this.p1Color === 'blue' ? 'red' : 'blue';
      const p2 = new Player('P2', spawnCenter.x + 30, spawnCenter.y - 30, COLORS[p2Color], 'Player 2', CONTROLS.P2, false);
      p2.equippedHat = hatsList[Math.floor(Math.random() * hatsList.length)];
      p2.speed = this.playerSpeedSetting;
      this.entities.push(p2);
    } else {
      document.getElementById('p2-hud').classList.add('hidden');
    }

    // Add AI Bots inside the dropship
    const botColors = ['green', 'yellow', 'purple', 'orange', 'cyan', 'pink', 'white', 'black', 'red', 'blue'].filter(c => c !== this.p1Color);
    const botNames = ['Green Bot', 'Yellow Bot', 'Purple Bot', 'Orange Bot', 'Cyan Bot', 'Pink Bot', 'White Bot', 'Black Bot', 'Red Bot', 'Blue Bot'];

    for (let i = 0; i < this.botCountSetting; i++) {
      const angle = (i * 2 * Math.PI) / this.botCountSetting;
      const bx = spawnCenter.x + Math.cos(angle) * 35;
      const by = spawnCenter.y + Math.sin(angle) * 35;
      
      const bot = new AIBot(`bot-${i}`, bx, by, COLORS[botColors[i % botColors.length]], botNames[i % botNames.length], false, this.botDifficulty);
      bot.equippedHat = hatsList[Math.floor(Math.random() * hatsList.length)];
      this.entities.push(bot);
    }

    // Reset Tasks on the map
    this.map = new GameMap(true); // isWaitingRoom = true

    // Focus the canvas so key presses work immediately
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.focus();
    }

    // Clear HUD task lists (since no tasks are assigned yet in waiting room)
    updateTasksHUD([], 'tasks-hud-p1');
    const p2Obj = this.entities.find(e => e.id === 'P2');
    if (this.gameMode === 'COOP' && p2Obj) {
      updateTasksHUD([], 'tasks-hud-p2');
    }

    // Start loop
    this.lastTime = Date.now();
    this.gameLoop();
  }

  startActualGame() {
    // 1. Transition state to role reveal
    this.gameState = 'REVEAL';
    this.revealTimer = 3500;

    // 2. Re-generate main map (places task consoles, digs hallways, sets vents)
    this.map = new GameMap(false); // isWaitingRoom = false

    // 3. Teleport everyone to Cafeteria spawn center
    const spawnCenter = { x: 25 * TILE_SIZE + TILE_SIZE / 2, y: 6 * TILE_SIZE + TILE_SIZE / 2 };
    
    const p1 = this.entities.find(e => e.id === 'P1');
    if (p1) {
      p1.x = spawnCenter.x;
      p1.y = spawnCenter.y - 30;
      p1.isDead = false;
      p1.isGhost = false;
      p1.isVenting = false;
    }

    const p2Obj = this.entities.find(e => e.id === 'P2');
    if (p2Obj && this.gameMode === 'COOP') {
      p2Obj.x = spawnCenter.x + 30;
      p2Obj.y = spawnCenter.y - 30;
      p2Obj.isDead = false;
      p2Obj.isGhost = false;
      p2Obj.isVenting = false;
    }

    // Bots spawning in circle
    const botCount = this.entities.filter(e => e.id.startsWith('bot-')).length;
    let botIdx = 0;
    this.entities.forEach(ent => {
      if (ent.id.startsWith('bot-')) {
        const angle = (botIdx * 2 * Math.PI) / botCount;
        ent.x = spawnCenter.x + Math.cos(angle) * 70;
        ent.y = spawnCenter.y + Math.sin(angle) * 70;
        ent.isDead = false;
        ent.isGhost = false;
        ent.isVenting = false;
        ent.aiState = 'IDLE';
        ent.path = [];
        botIdx++;
      }
    });

    // 4. Assign Roles randomly based on preference
    let isP1Impostor = false;
    const rolePref = document.getElementById('role-select').value;
    if (rolePref === 'impostor') isP1Impostor = true;
    else if (rolePref === 'crew') isP1Impostor = false;
    else isP1Impostor = Math.random() < 0.25;

    if (p1) p1.isImpostor = isP1Impostor;

    let botImpostorAssigned = isP1Impostor;
    if (p2Obj && this.gameMode === 'COOP') {
      const isP2Impostor = !isP1Impostor && Math.random() < 0.3;
      p2Obj.isImpostor = isP2Impostor;
      botImpostorAssigned = botImpostorAssigned || isP2Impostor;
    }

    const bots = this.entities.filter(e => e.id.startsWith('bot-'));
    bots.forEach((bot, idx) => {
      let isBotImpostor = false;
      if (!botImpostorAssigned && idx === 0) {
        isBotImpostor = true;
        botImpostorAssigned = true;
      } else if (!botImpostorAssigned && Math.random() < 0.2) {
        isBotImpostor = true;
        botImpostorAssigned = true;
      }
      bot.isImpostor = isBotImpostor;
    });

    // 5. Assign Tasks to crewmates
    this.entities.forEach(ent => {
      if (!ent.isImpostor) {
        const entityTasks = [];
        // Fisher-Yates shuffle for proper randomization
        const shuffled = [...this.map.tasks];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const selected = shuffled.slice(0, 4); // each crewmate gets 4 tasks
        selected.forEach(t => {
          entityTasks.push({
            id: t.id,
            name: t.name,
            room: t.room,
            type: t.type,
            x: t.x,
            y: t.y,
            col: t.col,
            row: t.row,
            completed: false
          });
        });
        ent.tasks = entityTasks;
      } else {
        ent.tasks = [];
      }
    });

    // Reset UI HUDs
    if (p1) updateTasksHUD(p1.tasks || [], 'tasks-hud-p1');
    if (p2Obj && this.gameMode === 'COOP') {
      updateTasksHUD(p2Obj.tasks || [], 'tasks-hud-p2');
    }

    // Play reveal sound
    const hasImpostor = this.entities.some(e => (e.id === 'P1' || e.id === 'P2') && e.isImpostor);
    playRoleReveal(hasImpostor);
  }

  showLobby() {
    if (this.isMultiplayer) {
      this.leaveRoom();
      document.getElementById('gameover-overlay').classList.add('hidden');
      document.getElementById('game-screen').classList.add('hidden');
      return;
    }
    this.gameState = 'LOBBY';
    document.getElementById('gameover-overlay').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  }

  gameLoop() {
    if (this.gameState === 'LOBBY') return;

    const now = Date.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.update(dt);
    this.draw();

    requestAnimationFrame(() => this.gameLoop());
  }

  update(dt) {
    if (this.gameState === 'REVEAL') {
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) {
        this.gameState = 'PLAYING';
      }
    }

    if (this.gameState === 'WAITING_ROOM') {
      // 1. Update entities movement inside Dropship
      this.entities.forEach(ent => {
        if (ent.id.startsWith('bot-')) {
          ent.update(this, this.map);
        } else {
          ent.update(this.keys, this.map);
        }
      });

      // 2. Multiplayer: Send position updates (throttled to 20Hz)
      if (this.isMultiplayer) {
        this.sendPositionUpdate();
        this.updateRemotePlayers(dt);
      }

      // 3. Update HUD labels & hints
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1) {
        document.getElementById('p1-room-text').innerText = `Room: Dropship`;
        this.updateHUDActionHints(p1, 'P1');
      }
      const p2 = this.entities.find(e => e.id === 'P2');
      if (p2 && this.gameMode === 'COOP') {
        document.getElementById('p2-room-text').innerText = `Room: Dropship`;
        this.updateHUDActionHints(p2, 'P2');
      }
      return;
    }

    if (this.gameState === 'PLAYING' || this.gameState === 'MINIGAME') {
      // 1. Tick Cooldowns
      this.entities.forEach(ent => {
        if (ent.killCooldown > 0) ent.killCooldown -= dt;
      });
      if (this.sabotageCooldownP1 > 0) this.sabotageCooldownP1 -= dt;
      if (this.sabotageCooldownP2 > 0) this.sabotageCooldownP2 -= dt;

      // 2. Update entities (pause movement when in minigame only for the interacting player)
      this.entities.forEach(ent => {
        if (ent.id.startsWith('bot-')) {
          ent.update(this, this.map);
        } else {
          // If Player 1 is doing minigame, freeze P1
          if (this.gameState === 'MINIGAME' && ent.id === 'P1') {
            ent.isMoving = false;
          } else {
            ent.update(this.keys, this.map);
          }
        }
      });

      // 3. Multiplayer: Send position updates and interpolate remote players
      if (this.isMultiplayer) {
        this.sendPositionUpdate();
        this.updateRemotePlayers(dt);
      }

      // 4. Update Raycasting visibility polygons for active viewport renderers
      this.entities.forEach(ent => {
        const radius = this.sabotageActive && !ent.isImpostor 
          ? VISION_RADIUS_SABOTAGED 
          : (ent.isImpostor ? VISION_RADIUS_IMPOSTOR : VISION_RADIUS_CREW);
          
        ent.visibilityPoints = getVisibilityPolygon(ent.x, ent.y, radius, this.map);
      });

      // 5. Update HUD labels
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1) {
        document.getElementById('p1-room-text').innerText = `Room: ${p1.lastSeenRoom}`;
        this.updateHUDActionHints(p1, 'P1');
      }

      const p2 = this.entities.find(e => e.id === 'P2');
      if (p2 && this.gameMode === 'COOP') {
        document.getElementById('p2-room-text').innerText = `Room: ${p2.lastSeenRoom}`;
        this.updateHUDActionHints(p2, 'P2');
      }

      // 6. Check if crewmate is repairing lights in Electrical room (near wiring task console)
      if (this.sabotageActive) {
        const repairTaskPos = { x: 20 * TILE_SIZE + TILE_SIZE/2, y: 27 * TILE_SIZE + TILE_SIZE/2 };
        this.entities.forEach(ent => {
          if (!ent.isDead && !ent.isImpostor) {
            const dist = Math.sqrt((ent.x - repairTaskPos.x)**2 + (ent.y - repairTaskPos.y)**2);
            if (dist < 40) {
              // Repairing lights!
              this.sabotageActive = false;
              this.sabotageType = null;
              document.getElementById('sabotage-warning').classList.add('hidden');
            }
          }
        });
      }

      // 7. Update Tasks progress fill
      const progress = this.isMultiplayer ? (this.multiplayerTaskProgress || 0) * 100 : this.getTaskProgress();
      document.getElementById('tasks-progress-fill').style.width = `${progress}%`;
    }

    if (this.gameState === 'EJECTING') {
      this.updateEjectionAnim(dt);
    }
  }

  updateHUDActionHints(player, playerPrefix) {
    const useEl = document.getElementById(`${playerPrefix.toLowerCase()}-action-use`);
    const killEl = document.getElementById(`${playerPrefix.toLowerCase()}-action-kill`);
    const ventEl = document.getElementById(`${playerPrefix.toLowerCase()}-action-vent`);
    const reportEl = document.getElementById(`${playerPrefix.toLowerCase()}-action-report`);

    if (player.isDead) {
      useEl.classList.add('hidden');
      killEl.classList.add('hidden');
      ventEl.classList.add('hidden');
      reportEl.classList.add('hidden');
      return;
    }

    if (this.gameState === 'WAITING_ROOM') {
      killEl.classList.add('hidden');
      ventEl.classList.add('hidden');
      reportEl.classList.add('hidden');

      // Laptop console coordinates (col 21, row 18)
      const laptopPos = { x: 21 * TILE_SIZE + TILE_SIZE/2, y: 18 * TILE_SIZE + TILE_SIZE/2 };
      const dist = Math.sqrt((player.x - laptopPos.x)**2 + (player.y - laptopPos.y)**2);

      if (dist < 45) {
        useEl.classList.remove('hidden');
        useEl.innerText = player.id === 'P1' ? 'E - CUSTOMIZE' : 'Num 1 - CUSTOMIZE';
      } else {
        useEl.classList.add('hidden');
      }
      return;
    }

    // Use / Interact hint
    if (!player.isImpostor) {
      const task = getClosestTask(player);
      useEl.classList.toggle('hidden', !task);
    } else {
      // Impostor can Sabotage (shows USE)
      useEl.classList.remove('hidden');
      useEl.innerText = playerPrefix === 'P1' ? 'E - SABOTAGE' : 'Num 1 - SABOTAGE';
    }

    // Kill hint
    if (player.isImpostor && !player.isVenting) {
      const targets = this.entities.filter(e => !e.isImpostor && !e.isDead);
      let canKill = false;
      targets.forEach(t => {
        const dist = Math.sqrt((t.x - player.x)**2 + (t.y - player.y)**2);
        if (dist < KILL_RANGE) canKill = true;
      });
      killEl.classList.toggle('hidden', !canKill);
      const cd = Math.max(0, Math.ceil(player.killCooldown / 1000));
      killEl.innerText = cd > 0 
        ? `CD: ${cd}s` 
        : (playerPrefix === 'P1' ? 'Q - KILL' : 'Num 3 - KILL');
    } else {
      killEl.classList.add('hidden');
    }

    // Vent hint
    if (player.isImpostor) {
      let nearVent = false;
      this.map.vents.forEach(v => {
        const vx = v.col * TILE_SIZE + TILE_SIZE/2;
        const vy = v.row * TILE_SIZE + TILE_SIZE/2;
        const dist = Math.sqrt((vx - player.x)**2 + (vy - player.y)**2);
        if (dist < 40) nearVent = true;
      });
      ventEl.classList.toggle('hidden', !nearVent && !player.isVenting);
      ventEl.innerText = player.isVenting
        ? (playerPrefix === 'P1' ? 'F - EXIT VENT' : 'Num 0 - EXIT VENT')
        : (playerPrefix === 'P1' ? 'F - ENTER VENT' : 'Num 0 - ENTER VENT');
    } else {
      ventEl.classList.add('hidden');
    }

    // Report hint
    let nearBody = false;
    this.deadBodies.forEach(b => {
      const dist = Math.sqrt((b.x - player.x)**2 + (b.y - player.y)**2);
      if (dist < 80) nearBody = true;
    });
    // Emergency table button report
    const distTable = Math.sqrt((player.x - this.map.emergencyButton.x)**2 + (player.y - this.map.emergencyButton.y)**2);
    if (distTable < 60) nearBody = true;

    reportEl.classList.toggle('hidden', !nearBody);
  }

  toggleVent(player) {
    if (player.isVenting) {
      // Exit Vent
      player.isVenting = false;
      player.currentVentId = null;
    } else {
      // Enter closest Vent
      let closestVent = null;
      let minDist = 40;

      this.map.vents.forEach(v => {
        const vx = v.col * TILE_SIZE + TILE_SIZE/2;
        const vy = v.row * TILE_SIZE + TILE_SIZE/2;
        const dist = Math.sqrt((vx - player.x)**2 + (vy - player.y)**2);
        if (dist < minDist) {
          minDist = dist;
          closestVent = v;
        }
      });

      if (closestVent) {
        player.isVenting = true;
        player.currentVentId = closestVent.id;
        player.x = closestVent.col * TILE_SIZE + TILE_SIZE/2;
        player.y = closestVent.row * TILE_SIZE + TILE_SIZE/2;
      }
    }
  }

  navigateVents(player) {
    if (!player.isVenting || !player.currentVentId) return;

    const currentVent = this.map.vents.find(v => v.id === player.currentVentId);
    if (!currentVent) return;

    // Pick next connected vent
    const nextVentId = currentVent.connections[0]; // Simple warp cycle
    const nextVent = this.map.vents.find(v => v.id === nextVentId);

    if (nextVent) {
      player.currentVentId = nextVent.id;
      player.x = nextVent.col * TILE_SIZE + TILE_SIZE/2;
      player.y = nextVent.row * TILE_SIZE + TILE_SIZE/2;
    }
  }

  attemptKill(impostor) {
    if (impostor.killCooldown > 0) return;

    let targets;
    if (this.isMultiplayer) {
      targets = Array.from(this.remotePlayers.values()).filter(p => !p.isDead);
    } else {
      targets = this.entities.filter(e => !e.isImpostor && !e.isDead);
    }
    let closestTarget = null;
    let minDist = KILL_RANGE;

    targets.forEach(t => {
      const dist = Math.sqrt((t.x - impostor.x)**2 + (t.y - impostor.y)**2);
      if (dist < minDist) {
        minDist = dist;
        closestTarget = t;
      }
    });

    if (closestTarget) {
      if (this.isMultiplayer) {
        this.sendActionEvent('kill', { victimId: closestTarget.id });
        impostor.killCooldown = this.killCooldownSetting * 1000;
      } else {
        this.killPlayer(closestTarget, impostor);
        impostor.killCooldown = this.killCooldownSetting * 1000; // Reset cooldown from setting
        this.checkVictoryConditions();
      }
    }
  }

  killPlayer(victim, killer = null) {
    victim.isDead = true;
    victim.isGhost = true; // Turn into ghost for visibility specs
    
    // Drop dead body sprite at coordinates
    this.deadBodies.push({
      id: `body-${victim.id}`,
      x: victim.x,
      y: victim.y,
      color: victim.color,
      room: this.map.getRoomName(victim.x, victim.y)
    });

    // Determine the killer entity
    const actualKiller = killer || this.entities.find(e => e.isImpostor && !e.isDead) || { color: '#000000', equippedHat: null };

    // Trigger Killed screen overlay if player dies or player executes a kill
    const p1Involved = (victim.id === 'P1' || (killer && killer.id === 'P1'));
    const p2Involved = this.gameMode === 'COOP' && (victim.id === 'P2' || (killer && killer.id === 'P2'));
    
    if (p1Involved || p2Involved) {
      this.runKillAnimation(victim, actualKiller);
    } else {
      this.checkVictoryConditions();
    }
  }

  runKillAnimation(victim, killer) {
    // Freeze main game state temporarily
    const previousState = this.gameState;
    this.gameState = 'MINIGAME'; // freeze entities

    // Play synthesized kill sound
    playKill();

    const overlay = document.getElementById('killed-overlay');
    const canvas = document.getElementById('killed-canvas');
    if (!overlay || !canvas) return;

    overlay.classList.remove('hidden');
    const ctx = canvas.getContext('2d');
    const startTime = Date.now();

    const particles = [];

    const animLoop = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > 2200) {
        overlay.classList.add('hidden');
        this.gameState = previousState;
        this.checkVictoryConditions();
        return;
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (elapsed < 450) {
        // Red slash flash screen
        ctx.fillStyle = 'rgba(255, 0, 0, ' + (1.0 - elapsed / 450) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 15;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(50, canvas.height / 2 - 80);
        ctx.lineTo(canvas.width - 50, canvas.height / 2 + 80);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      } else {
        // Among Us style kill execution reveal
        const animElapsed = elapsed - 450;

        // Draw background floor
        ctx.fillStyle = '#222831';
        ctx.fillRect(0, canvas.height / 2 + 40, canvas.width, canvas.height / 2 - 40);
        ctx.fillStyle = '#1a1f26';
        ctx.fillRect(0, canvas.height / 2 + 60, canvas.width, 10);

        // Position coordinates
        const killerX = canvas.width / 2 + 80;
        const killerY = canvas.height / 2 + 30;
        const victimX = canvas.width / 2 - 80;
        const victimY = canvas.height / 2 + 30;

        // Draw killer
        drawCrewmate(ctx, killerX, killerY, killer.color, true, false, false, false, '', killer.equippedHat);

        if (animElapsed < 300) {
          // Normal victim
          drawCrewmate(ctx, victimX, victimY, victim.color, false, false, false, false, '', victim.equippedHat);
          
          // Draw killer strike indication line
          ctx.strokeStyle = '#ff3333';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(killerX - 10, killerY);
          ctx.lineTo(victimX + 10, victimY);
          ctx.stroke();
        } else {
          // Sliced in half!
          const slideProgress = Math.min(1.0, (animElapsed - 300) / 600);
          
          // Generate blood particles once
          if (particles.length === 0) {
            for (let i = 0; i < 25; i++) {
              particles.push({
                x: victimX,
                y: victimY - 5,
                vx: (Math.random() - 0.7) * 5 - 2,
                vy: -Math.random() * 6 - 3,
                r: Math.random() * 4 + 2
              });
            }
          }

          // Update and draw blood particles
          ctx.fillStyle = '#ff1a1a';
          particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.25; // gravity
          });

          // Draw lower half with bone
          ctx.save();
          ctx.translate(victimX, victimY);
          const pSize = 2;
          
          // Legs/lower body
          ctx.fillStyle = victim.color;
          ctx.fillRect(-5 * pSize, 8 * pSize, 3 * pSize, 4 * pSize); 
          ctx.fillRect(2 * pSize, 8 * pSize, 3 * pSize, 4 * pSize); 
          ctx.fillRect(-6 * pSize, 2 * pSize, 12 * pSize, 6 * pSize); 

          // Red bone surface
          ctx.fillStyle = '#cc0000';
          ctx.fillRect(-6 * pSize, 0, 12 * pSize, 2 * pSize);
          
          // Bone shaft & joints
          ctx.fillStyle = '#e6e6e6';
          ctx.fillRect(-1 * pSize, -4 * pSize, 2 * pSize, 4 * pSize); 
          ctx.fillRect(-2 * pSize, -5 * pSize, 2 * pSize, 2 * pSize); 
          ctx.fillRect(0 * pSize, -5 * pSize, 2 * pSize, 2 * pSize);  
          ctx.restore();

          // Draw sliding top half
          ctx.save();
          // Slide to left and rotate slightly
          const slideX = victimX - slideProgress * 40;
          const slideY = victimY + slideProgress * 15;
          ctx.translate(slideX, slideY);
          ctx.rotate(-slideProgress * 0.4);
          
          // Draw top half only (backpack top, head visor)
          const pSizeH = 2;
          ctx.fillStyle = victim.color;
          ctx.fillRect(-9 * pSizeH, -7 * pSizeH, 3 * pSizeH, 6 * pSizeH); // backpack top
          ctx.fillRect(-6 * pSizeH, -12 * pSizeH, 12 * pSizeH, 12 * pSizeH); // head top
          
          // Red bottom cut
          ctx.fillStyle = '#cc0000';
          ctx.fillRect(-6 * pSizeH, 0, 12 * pSizeH, 1 * pSizeH);

          // Visor (glass shield)
          ctx.fillStyle = '#22272e'; 
          ctx.fillRect(-1 * pSizeH, -8 * pSizeH, 9 * pSizeH, 7 * pSizeH);
          ctx.fillStyle = '#8bd5ff'; 
          ctx.fillRect(0, -7 * pSizeH, 7 * pSizeH, 5 * pSizeH);
          
          // Visor shine
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(3 * pSizeH, -7 * pSizeH, 3 * pSizeH, 1 * pSizeH);
          ctx.fillRect(5 * pSizeH, -6 * pSizeH, 1 * pSizeH, 1 * pSizeH);

          // If hat is equipped, draw it bobbing along
          if (victim.equippedHat) {
            ctx.save();
            const equippedHat = victim.equippedHat;
            const pSize = 2;
            if (equippedHat === 'tophat') {
              ctx.fillStyle = '#1c1c1c';
              ctx.fillRect(-8 * pSize, -14 * pSize, 16 * pSize, 2 * pSize);
              ctx.fillRect(-5 * pSize, -22 * pSize, 10 * pSize, 8 * pSize);
              ctx.fillStyle = '#ff2a2a';
              ctx.fillRect(-5 * pSize, -16 * pSize, 10 * pSize, 2 * pSize);
            } else if (equippedHat === 'crown') {
              ctx.fillStyle = '#f1c40f';
              ctx.fillRect(-6 * pSize, -15 * pSize, 12 * pSize, 3 * pSize);
              ctx.fillRect(-6 * pSize, -19 * pSize, 2 * pSize, 4 * pSize);
              ctx.fillRect(-1 * pSize, -20 * pSize, 2 * pSize, 5 * pSize);
              ctx.fillRect(4 * pSize, -19 * pSize, 2 * pSize, 4 * pSize);
              ctx.fillStyle = '#e74c3c';
              ctx.fillRect(-5 * pSize, -18 * pSize, 1 * pSize, 1 * pSize);
              ctx.fillRect(0 * pSize, -19 * pSize, 1 * pSize, 1 * pSize);
              ctx.fillRect(5 * pSize, -18 * pSize, 1 * pSize, 1 * pSize);
              ctx.fillRect(-2 * pSize, -14 * pSize, 1 * pSize, 1 * pSize);
              ctx.fillRect(2 * pSize, -14 * pSize, 1 * pSize, 1 * pSize);
            } else if (equippedHat === 'chef') {
              ctx.fillStyle = '#eeeeee';
              ctx.fillRect(-6 * pSize, -14 * pSize, 12 * pSize, 2 * pSize);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(-5 * pSize, -22 * pSize, 10 * pSize, 8 * pSize);
              ctx.fillRect(-8 * pSize, -20 * pSize, 4 * pSize, 6 * pSize);
              ctx.fillRect(4 * pSize, -20 * pSize, 4 * pSize, 6 * pSize);
              ctx.fillStyle = '#cccccc';
              ctx.fillRect(-4 * pSize, -19 * pSize, 1 * pSize, 5 * pSize);
              ctx.fillRect(3 * pSize, -19 * pSize, 1 * pSize, 5 * pSize);
            } else if (equippedHat === 'slug') {
              ctx.fillStyle = '#27ae60';
              ctx.fillRect(-1 * pSize, -19 * pSize, 2 * pSize, 5 * pSize);
              ctx.fillRect(-3 * pSize, -20 * pSize, 2 * pSize, 1 * pSize);
              ctx.fillRect(1 * pSize, -20 * pSize, 2 * pSize, 1 * pSize);
              ctx.fillStyle = '#2ecc71';
              ctx.fillRect(-4 * pSize, -17 * pSize, 8 * pSize, 3 * pSize);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(-2 * pSize, -16 * pSize, 4 * pSize, 2 * pSize);
              ctx.fillStyle = '#000000';
              ctx.fillRect(-1 * pSize, -15 * pSize, 1 * pSize, 1 * pSize);
              ctx.fillRect(0 * pSize, -15 * pSize, 1 * pSize, 1 * pSize);
            }
            ctx.restore();
          }

          ctx.restore();
        }
      }

      requestAnimationFrame(animLoop);
    };

    animLoop();
  }

  triggerSabotage(playerVoterId) {
    // Check cooldown
    if (playerVoterId === 'P1' && this.sabotageCooldownP1 > 0) return;
    if (playerVoterId === 'P2' && this.sabotageCooldownP2 > 0) return;

    if (this.sabotageActive) return;

    this.sabotageActive = true;
    this.sabotageType = 'lights';
    
    // Trigger Sabotage Siren sound
    playSabotageAlert();
    
    document.getElementById('sabotage-warning').classList.remove('hidden');
    document.getElementById('sabotage-text').innerText = 'LIGHTS SABOTAGED! REPAIR IN ELECTRICAL ROOM';

    // Reset cooldowns
    if (playerVoterId === 'P1') this.sabotageCooldownP1 = SABOTAGE_COOLDOWN;
    else this.sabotageCooldownP2 = SABOTAGE_COOLDOWN;
  }

  checkForReport(player) {
    let bodyToReport = null;
    let minDist = 80;

    // Check dead bodies
    this.deadBodies.forEach(b => {
      const dist = Math.sqrt((b.x - player.x)**2 + (b.y - player.y)**2);
      if (dist < minDist) {
        minDist = dist;
        bodyToReport = b;
      }
    });

    if (bodyToReport) {
      this.triggerMeeting(player, true, bodyToReport);
      return;
    }

    // Check emergency meeting button
    const distTable = Math.sqrt((player.x - this.map.emergencyButton.x)**2 + (player.y - this.map.emergencyButton.y)**2);
    if (distTable < 60) {
      this.triggerMeeting(player, false, null);
    }
  }

  triggerMeeting(reporter, isBodyFound, reportedBody = null) {
    if (this.isMultiplayer) {
      const bodyId = isBodyFound && reportedBody ? reportedBody.victimId : null;
      this.sendActionEvent('report', { bodyId });
      return;
    }

    closeMinigame(false); // Close any active minigames

    // Play report sound siren
    playReport();

    // Clear all dead bodies off the floor (eaten/bagged!)
    this.deadBodies = [];

    // Pause all bot velocities
    this.entities.forEach(ent => {
      ent.isMoving = false;
      if (ent.id.startsWith('bot-')) {
        ent.path = [];
        ent.aiState = 'IDLE';
      }
    });

    // Show megaphone flash overlay
    const reportOverlay = document.getElementById('report-overlay');
    if (reportOverlay) {
      const headline = reportOverlay.querySelector('.report-headline');
      if (headline) {
        headline.innerText = isBodyFound ? 'BODY REPORTED!' : 'EMERGENCY MEETING!';
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
      startMeeting(this.entities, reporter, isBodyFound, (result) => {
        this.resolveMeetingVotes(result);
      }, reportedBody);
    }, 2200);
  }

  resolveMeetingVotes(result) {
    this.gameState = 'EJECTING';
    const { ejectedEntity, isSkip, isTie } = result;

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

    this.ejectData = {
      entity: ejectedEntity,
      isSkip,
      isTie,
      timer: 3000, // 3 seconds ejection screen duration
      stars: stars
    };

    if (ejectedEntity) {
      ejectedEntity.isDead = true;
      ejectedEntity.isGhost = true;
    }
  }

  updateEjectionAnim(dt) {
    this.ejectData.timer -= dt;

    // Move stars
    this.ejectData.stars.forEach(s => {
      s.x -= s.speed;
      if (s.x < 0) s.x = SCREEN_WIDTH;
    });

    if (this.ejectData.timer <= 0) {
      this.gameState = 'PLAYING';
      this.ejectData = null;
      document.getElementById('ejection-overlay').classList.add('hidden');
      this.checkVictoryConditions();
    }
  }

  checkVictoryConditions() {
    if (this.isMultiplayer) {
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1) updateTasksHUD(p1.tasks || [], 'tasks-hud-p1');
      return;
    }

    const aliveEntities = this.entities.filter(e => !e.isDead);
    const impostors = aliveEntities.filter(e => e.isImpostor);
    const crewmates = aliveEntities.filter(e => !e.isImpostor);

    // Update task HUD in real-time
    const p1 = this.entities.find(e => e.id === 'P1');
    if (p1) updateTasksHUD(p1.tasks || [], 'tasks-hud-p1');
    const p2 = this.entities.find(e => e.id === 'P2');
    if (p2 && this.gameMode === 'COOP') {
      updateTasksHUD(p2.tasks || [], 'tasks-hud-p2');
    }

    // 1. All Impostors ejected -> Crew wins
    if (impostors.length === 0) {
      const outcome = this.getPlayerOutcome(true);
      this.triggerGameOver(outcome, 'The Impostors have been ejected!');
      return;
    }

    // 2. Impostors equal or outnumber Crewmates -> Impostors win
    if (impostors.length >= crewmates.length) {
      const outcome = this.getPlayerOutcome(false);
      this.triggerGameOver(outcome, 'The Impostors took over the ship!');
      return;
    }

    // 3. All tasks completed -> Crew wins
    const progress = this.getTaskProgress();
    if (progress >= 100) {
      const outcome = this.getPlayerOutcome(true);
      this.triggerGameOver(outcome, 'All tasks have been completed!');
    }
  }

  getTaskProgress() {
    const crewmates = this.entities.filter(e => !e.isImpostor);
    let totalTasksCount = 0;
    let completedTasksCount = 0;
    crewmates.forEach(crew => {
      totalTasksCount += crew.tasks ? crew.tasks.length : 0;
      completedTasksCount += crew.tasks ? crew.tasks.filter(t => t.completed).length : 0;
    });
    if (totalTasksCount === 0) return 0;
    return (completedTasksCount / totalTasksCount) * 100;
  }

  // Determine if the outcome is a win or loss for the player
  getPlayerOutcome(crewWon) {
    const p1 = this.entities.find(e => e.id === 'P1');
    if (!p1) return crewWon ? 'victory' : 'defeat';
    // If player is impostor, crew winning = player loses
    if (p1.isImpostor) return crewWon ? 'defeat' : 'victory';
    // If player is crewmate, crew winning = player wins
    return crewWon ? 'victory' : 'defeat';
  }

  triggerGameOver(banner, subtitle) {
    this.gameState = 'GAMEOVER';
    
    // Play sound and award points
    if (banner === 'victory') {
      playVictory();
      this.addTP(30);
    } else {
      playDefeat();
    }

    const bannerEl = document.getElementById('gameover-title');
    bannerEl.innerText = banner.toUpperCase();
    bannerEl.className = `gameover-headline ${banner}`;

    document.getElementById('gameover-subtitle').innerText = subtitle;
    
    // Spawn background floating crewmates matching winner team
    this.spawnGameOverCrewmates(banner === 'victory');

    // Count stats
    let completedCount = 0;
    let totalCount = 0;
    this.entities.filter(e => !e.isImpostor).forEach(crew => {
      completedCount += crew.tasks ? crew.tasks.filter(t => t.completed).length : 0;
      totalCount += crew.tasks ? crew.tasks.length : 0;
    });
    document.getElementById('stat-tasks').innerText = `${completedCount} / ${totalCount}`;
    
    const aliveCount = this.entities.filter(e => !e.isDead).length;
    document.getElementById('stat-alive').innerText = `${aliveCount} / ${this.entities.length}`;

    document.getElementById('gameover-overlay').classList.remove('hidden');
  }

  spawnGameOverCrewmates(isVictory) {
    const container = document.getElementById('gameover-space-bg');
    if (!container) return;
    container.innerHTML = '';
    
    // Spawn 5 colored crewmates drifting across
    const colors = isVictory ? ['cyan', 'green', 'yellow', 'white', 'pink'] : ['red', 'red', 'black', 'purple', 'orange'];
    for (let i = 0; i < 5; i++) {
      const el = document.createElement('div');
      el.className = `floating-crewmate ${colors[i % colors.length]}-crew`;
      el.style.top = `${15 + i * 16}%`;
      el.style.left = `-10%`;
      el.style.animation = `floatDrift${(i % 3) + 1} ${20 + i * 4}s linear infinite`;
      el.style.animationDelay = `${i * 1.2}s`;
      container.appendChild(el);
    }
  }

  draw() {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.gameState === 'EJECTING' && this.ejectData) {
      this.drawEjectionScreen();
      return;
    }

    if (this.gameState === 'REVEAL') {
      this.drawRoleRevealScreen();
      return;
    }

    if (this.gameMode === 'COOP') {
      // Split Screen Render
      const w = SCREEN_WIDTH / 2;
      const h = SCREEN_HEIGHT;

      // 1. Draw Left Split: Player 1 camera
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h);
        this.ctx.clip();
        this.drawCameraViewport(p1, 0, 0, w, h);
        this.ctx.restore();
      }

      // 2. Draw Right Split: Player 2 camera
      const p2 = this.entities.find(e => e.id === 'P2');
      if (p2) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(w, 0, w, h);
        this.ctx.clip();
        this.drawCameraViewport(p2, w, 0, w, h);
        this.ctx.restore();
      }

      // 3. Draw Vertical dividing line
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(w - 2, 0, 4, h);
    } else {
      // Single Screen Render
      const p1 = this.entities.find(e => e.id === 'P1');
      if (p1) {
        this.drawCameraViewport(p1, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      }
    }
  }

  drawCameraViewport(player, vx, vy, vWidth, vHeight) {
    // Center camera on dropship in waiting room, else center on player
    let camX, camY;
    if (this.gameState === 'WAITING_ROOM') {
      camX = 25 * TILE_SIZE - vWidth / 2;
      camY = 20 * TILE_SIZE - vHeight / 2;
    } else {
      camX = player.x - vWidth / 2;
      camY = player.y - vHeight / 2;
    }

    const camera = { x: camX, y: camY, width: vWidth, height: vHeight };
    const offset = { x: camX - vx, y: camY - vy };

    // Set viewport translations
    this.ctx.save();
    this.ctx.translate(-offset.x, -offset.y);

    // 1. Draw Map floor layer
    this.map.draw(this.ctx, camera, 'floor');

    // Draw Vent grates
    this.map.vents.forEach(vent => {
      drawVent(this.ctx, vent.col * TILE_SIZE, vent.row * TILE_SIZE);
    });

    // Draw Emergency meeting table
    drawEmergencyButton(this.ctx, this.map.emergencyButton.x, this.map.emergencyButton.y, this.map.emergencyButton.size);

    // Draw Task consoles
    this.map.tasks.forEach(t => {
      const playerTask = player.tasks ? player.tasks.find(pt => pt.id === t.id) : null;
      const isCompleted = playerTask ? playerTask.completed : false;
      drawTaskConsole(this.ctx, t.col * TILE_SIZE, t.row * TILE_SIZE, TILE_SIZE, isCompleted);
    });

    // Draw Dead Bodies on the floor
    this.deadBodies.forEach(b => {
      drawDeadBody(this.ctx, b.x, b.y, b.color);
    });

    // 2. Draw Fog of War Shadow Overlay (for non-ghosts)
    if (!player.isGhost && this.gameState !== 'WAITING_ROOM') {
      if (this.shadowCanvas.width !== this.canvas.width || this.shadowCanvas.height !== this.canvas.height) {
        this.shadowCanvas.width = this.canvas.width;
        this.shadowCanvas.height = this.canvas.height;
      }
      this.shadowCtx.clearRect(0, 0, this.shadowCanvas.width, this.shadowCanvas.height);
      
      // Draw solid black overlay over camera viewport bounds on offscreen canvas
      this.shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      this.shadowCtx.fillRect(vx, vy, vWidth, vHeight);
      
      // Carve out visibility polygon on offscreen canvas
      this.shadowCtx.save();
      this.shadowCtx.translate(-offset.x, -offset.y);
      this.shadowCtx.globalCompositeOperation = 'destination-out';
      this.shadowCtx.beginPath();
      if (player.visibilityPoints && player.visibilityPoints.length > 0) {
        this.shadowCtx.moveTo(player.visibilityPoints[0].x, player.visibilityPoints[0].y);
        for (let i = 1; i < player.visibilityPoints.length; i++) {
          this.shadowCtx.lineTo(player.visibilityPoints[i].x, player.visibilityPoints[i].y);
        }
        this.shadowCtx.closePath();
        this.shadowCtx.fill();
      }
      this.shadowCtx.restore();

      // Composite the offscreen shadow canvas back onto the main canvas in screen space
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(this.shadowCanvas, 0, 0);
      this.ctx.restore();
    }

    // 3. Draw Map Walls layer on top of fog of war shadow
    this.map.draw(this.ctx, camera, 'walls');

    // 4. Draw Alive entities inside visibility range
    this.entities.forEach(ent => {
      if (!ent.isDead && !ent.isVenting) {
        // Draw player's own crewmate, or any entity within their visibility polygon
        const isVisible = this.gameState === 'WAITING_ROOM' || player.isGhost || ent.id === player.id || player.isInVisibilityPolygon(ent.x, ent.y, player.visibilityPoints);
        if (isVisible) {
          drawCrewmate(this.ctx, ent.x, ent.y, ent.color, ent.isFacingLeft, ent.isMoving, false, false, ent.nickname, ent.equippedHat);
        }
      }
    });

    // 4.5. Draw Remote Players (multiplayer)
    if (this.isMultiplayer) {
      this.remotePlayers.forEach(remotePlayer => {
        if (!remotePlayer.isDead && !remotePlayer.isVenting) {
          const isVisible = this.gameState === 'WAITING_ROOM' || player.isGhost || player.isInVisibilityPolygon(remotePlayer.x, remotePlayer.y, player.visibilityPoints);
          if (isVisible) {
            drawCrewmate(this.ctx, remotePlayer.x, remotePlayer.y, remotePlayer.color, remotePlayer.isFacingLeft, remotePlayer.isMoving, false, false, remotePlayer.nickname, remotePlayer.equippedHat);
          }
        }
      });
    }

    // 5. Draw Ghosts (always see ghosts, ghosts see through walls)
    this.entities.forEach(ent => {
      if (ent.isDead && ent.isGhost) {
        if (player.isGhost) {
          drawCrewmate(this.ctx, ent.x, ent.y, ent.color, ent.isFacingLeft, ent.isMoving, false, true, ent.nickname, ent.equippedHat);
        }
      }
    });

    if (this.isMultiplayer && player.isGhost) {
      this.remotePlayers.forEach(remotePlayer => {
        if (remotePlayer.isDead) {
          drawCrewmate(this.ctx, remotePlayer.x, remotePlayer.y, remotePlayer.color, remotePlayer.isFacingLeft, remotePlayer.isMoving, false, true, remotePlayer.nickname, remotePlayer.equippedHat);
        }
      });
    }

    this.ctx.restore(); // Remove offset translation


  }

  drawEjectionScreen() {
    const { entity, isSkip, isTie, stars } = this.ejectData;
    
    // Stars background
    this.ctx.fillStyle = '#000008';
    this.ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    
    this.ctx.fillStyle = '#ffffff';
    stars.forEach(s => {
      this.ctx.fillRect(s.x, s.y, s.size, s.size);
    });

    // Floating text
    let displayMsg = "";
    if (isSkip) {
      displayMsg = "No one was ejected. (Skipped)";
    } else if (isTie) {
      displayMsg = "No one was ejected. (Tie)";
    } else if (entity) {
      const type = entity.isImpostor ? "an Impostor" : "not an Impostor";
      displayMsg = `${entity.nickname} was ejected. He was ${type}.`;
    }

    this.ctx.save();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '22px "Courier New", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(displayMsg, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    
    // Draw character floating horizontally
    if (entity && !isSkip && !isTie) {
      const progressPercent = (3000 - this.ejectData.timer) / 3000;
      const charX = SCREEN_WIDTH * progressPercent;
      const charY = SCREEN_HEIGHT / 2 + Math.sin(progressPercent * Math.PI * 4) * 40 + 60;
      
      // Floating animation rotation
      this.ctx.translate(charX, charY);
      this.ctx.rotate(progressPercent * Math.PI * 6);
      drawCrewmate(this.ctx, 0, 0, entity.color, false, false, false, false, '', entity.equippedHat);
    }
    this.ctx.restore();
  }

  drawRoleRevealScreen() {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const drawHalfReveal = (player, centerX, centerY, width, height) => {
      const isImpostor = player.isImpostor;

      // Draw background glow
      if (isImpostor) {
        // Red horizontal band
        const grad = this.ctx.createLinearGradient(centerX - width / 2, centerY, centerX + width / 2, centerY);
        grad.addColorStop(0, 'rgba(192, 41, 43, 0)');
        grad.addColorStop(0.3, 'rgba(192, 41, 43, 0.45)');
        grad.addColorStop(0.5, 'rgba(192, 41, 43, 0.85)');
        grad.addColorStop(0.7, 'rgba(192, 41, 43, 0.45)');
        grad.addColorStop(1, 'rgba(192, 41, 43, 0)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(centerX - width / 2, centerY - 40, width, 80);

        // Impostor text
        this.ctx.fillStyle = '#ff3333';
        this.ctx.font = '800 48px "Outfit", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = 'rgba(255, 51, 51, 0.6)';
        this.ctx.shadowBlur = 15;
        this.ctx.fillText('Impostor', centerX, centerY - 110);
        this.ctx.shadowBlur = 0; // reset
        
        // Impostor subtext
        this.ctx.fillStyle = '#ff9999';
        this.ctx.font = '600 16px "Courier New", monospace';
        this.ctx.fillText('me', centerX, centerY + 100);
      } else {
        // Cyan background glow
        const grad = this.ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 180);
        grad.addColorStop(0, 'rgba(0, 210, 255, 0.25)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 180, 0, Math.PI * 2);
        this.ctx.fill();

        // Crewmate titles
        this.ctx.fillStyle = '#8bd5ff';
        this.ctx.font = '600 22px "Courier New", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Your role is', centerX, centerY - 150);

        this.ctx.fillStyle = '#32ffc5';
        this.ctx.font = '800 52px "Outfit", sans-serif';
        this.ctx.shadowColor = 'rgba(50, 255, 197, 0.5)';
        this.ctx.shadowBlur = 15;
        this.ctx.fillText('Crewmate', centerX, centerY - 95);
        this.ctx.shadowBlur = 0; // reset

        // Crewmate subtext
        this.ctx.fillStyle = '#8bd5ff';
        this.ctx.font = '600 20px "Courier New", monospace';
        this.ctx.fillText('Do your tasks', centerX, centerY + 110);
      }

      // Draw scaled-up player sprite
      this.ctx.save();
      this.ctx.translate(centerX, centerY + 10);
      this.ctx.scale(2.8, 2.8);
      drawCrewmate(this.ctx, 0, 0, player.color, false, false, false, false, '', player.equippedHat);
      this.ctx.restore();
    };

    const p1 = this.entities.find(e => e.id === 'P1');
    const p2 = this.entities.find(e => e.id === 'P2');

    if (this.gameMode === 'COOP' && p2) {
      // Draw Player 1 Reveal on the left half
      drawHalfReveal(p1, SCREEN_WIDTH / 4, SCREEN_HEIGHT / 2, SCREEN_WIDTH / 2, SCREEN_HEIGHT);
      
      // Draw Player 2 Reveal on the right half
      drawHalfReveal(p2, (3 * SCREEN_WIDTH) / 4, SCREEN_HEIGHT / 2, SCREEN_WIDTH / 2, SCREEN_HEIGHT);

      // Draw a clean dividing border
      this.ctx.strokeStyle = '#2c3e50';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(SCREEN_WIDTH / 2, 0);
      this.ctx.lineTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT);
      this.ctx.stroke();
    } else if (p1) {
      // Draw Single Player Reveal in the center
      drawHalfReveal(p1, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH, SCREEN_HEIGHT);
    }
  }
}

// Instantiate engine when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GameEngine();
});
