// Player and AI Bot entities system for papmongus
import { PLAYER_SPEED, TILE_SIZE, KILL_RANGE } from './config.js';
import { findPath } from './pathfinding.js';

export class BaseEntity {
  constructor(id, x, y, color, nickname, isImpostor = false) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.radius = 12; // Collision box size
    this.color = color;
    this.nickname = nickname;
    
    this.isImpostor = isImpostor;
    this.isDead = false;
    this.isGhost = false;
    this.isVenting = false;
    this.currentVentId = null;

    this.isFacingLeft = false;
    this.isMoving = false;
    
    // Vision cache
    this.visibilityPoints = [];
    this.lastSeenRoom = 'Cafeteria';
    this.equippedHat = null;
  }

  getCol() {
    return Math.floor(this.x / TILE_SIZE);
  }

  getRow() {
    return Math.floor(this.y / TILE_SIZE);
  }

  // Raycast polygon hit test
  isInVisibilityPolygon(tx, ty, points) {
    if (!points || points.length === 0) return false;
    
    // Standard ray casting algorithm for point-in-polygon
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      
      const intersect = ((yi > ty) !== (yj > ty))
          && (tx < (xj - xi) * (ty - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

export class Player extends BaseEntity {
  constructor(id, x, y, color, nickname, controls, isImpostor = false) {
    super(id, x, y, color, nickname, isImpostor);
    this.controls = controls; // Key mappings (e.g. WASD vs Arrows)
    this.killCooldown = 0;
    this.speed = PLAYER_SPEED;
  }

  update(keys, gameMap) {
    if (this.isVenting) {
      this.isMoving = false;
      return;
    }

    let dx = 0;
    let dy = 0;

    // Movement keys checks
    if (keys[this.controls.up]) dy -= 1;
    if (keys[this.controls.down]) dy += 1;
    if (keys[this.controls.left]) dx -= 1;
    if (keys[this.controls.right]) dx += 1;

    if (dx !== 0 || dy !== 0) {
      // Normalize velocity
      const len = Math.sqrt(dx * dx + dy * dy);
      const moveX = (dx / len) * this.speed;
      const moveY = (dy / len) * this.speed;

      // Apply sliding collision resolution (skip if dead/ghost)
      const nextPos = this.isDead 
        ? { x: this.x + moveX, y: this.y + moveY }
        : gameMap.resolveCollisions(this.x + moveX, this.y + moveY, this.radius);
      this.x = nextPos.x;
      this.y = nextPos.y;

      this.isMoving = true;
      this.isFacingLeft = dx < 0;
    } else {
      this.isMoving = false;
    }

    // Cache current room location
    this.lastSeenRoom = gameMap.getRoomName(this.x, this.y);
  }
}

export class AIBot extends BaseEntity {
  constructor(id, x, y, color, nickname, isImpostor = false, difficulty = 'medium') {
    super(id, x, y, color, nickname, isImpostor);
    
    this.difficulty = difficulty;
    this.aiState = 'IDLE'; // IDLE, WALKING_TO_TASK, DOING_TASK, WALKING_RANDOM, VENTING, SCAPING
    this.path = [];        // A* grid path nodes
    this.targetTask = null;
    this.stateTimer = 0;
    
    // Suspicions database (who this bot thinks is the Impostor)
    this.suspicion = null;
    this.seenVenting = {}; // Records playerIds caught venting
    
    // Scaling variables based on difficulty
    if (this.difficulty === 'easy') {
      this.speed = PLAYER_SPEED * 0.45;
      this.taskDurationBase = 16000;
      this.taskDurationRandom = 12000; // 16s to 28s faking duration
      this.killCooldown = Math.random() * 10000 + 25000; // 25s to 35s
    } else if (this.difficulty === 'hard') {
      this.speed = PLAYER_SPEED * 0.95;
      this.taskDurationBase = 6000;
      this.taskDurationRandom = 5000; // 6s to 11s faking duration
      this.killCooldown = Math.random() * 5000 + 12000; // 12s to 17s
    } else { // medium
      this.speed = PLAYER_SPEED * 0.7;
      this.taskDurationBase = 11000;
      this.taskDurationRandom = 8000; // 11s to 19s faking duration
      this.killCooldown = Math.random() * 8000 + 18000; // 18s to 26s
    }
  }

  update(game, gameMap) {
    if (game.gameState === 'WAITING_ROOM') {
      // In waiting room, bots just wander around or stand idle. No gameplay actions.
      switch (this.aiState) {
        case 'IDLE':
          this.isMoving = false;
          this.stateTimer += 16.6;
          if (this.stateTimer > 2500 + Math.random() * 3000) {
            this.stateTimer = 0;
            this.pickRandomWalk(gameMap);
          }
          break;
        case 'WALKING_RANDOM':
          this.followPath(gameMap);
          break;
        default:
          this.aiState = 'IDLE';
          break;
      }
      this.lastSeenRoom = 'Dropship';
      return;
    }

    // Tick kill cooldown if Impostor bot
    if (this.isImpostor && this.killCooldown > 0) {
      this.killCooldown -= 16.6; // ~1 frame at 60 FPS in ms
    }

    // State machine logic
    switch (this.aiState) {
      case 'IDLE':
        this.isMoving = false;
        this.stateTimer += 16.6;

        if (this.stateTimer > 2500 + Math.random() * 3000) {
          this.stateTimer = 0;
          
          if (this.isImpostor) {
            if (this.isDead) {
              // Dead impostor bots just wander around
              this.pickRandomWalk(gameMap);
            } else {
              // Impostor bot picks a random walk, looks for kills, or vents
              if (Math.random() < 0.25) {
                this.ventTeleport(gameMap);
              } else {
                this.pickRandomWalk(gameMap);
              }
            }
          } else {
            // Crewmate bot targets incomplete tasks or walks randomly
            this.pickNextTask(gameMap);
          }
        }
        break;

      case 'WALKING_TO_TASK':
      case 'WALKING_RANDOM':
        this.followPath(gameMap);
        
        // Impostor check for isolation kills while walking (only if alive)
        if (this.isImpostor && !this.isDead) {
          this.checkForIsolationKill(game);
        }
        break;

      case 'DOING_TASK':
        this.isMoving = false;
        this.stateTimer += 16.6;
        
        // Impostor check even while "faking" tasks (only if alive)
        if (this.isImpostor && !this.isDead) {
          this.checkForIsolationKill(game);
        }

        const durationLimit = this.taskDurationBase + Math.random() * this.taskDurationRandom;
        if (this.stateTimer > durationLimit) {
          this.stateTimer = 0;
          this.aiState = 'IDLE';
          if (this.targetTask && !this.isImpostor) {
            this.targetTask.completed = true;
          }
          this.targetTask = null;
        }
        break;
    }

    // Cache current room
    this.lastSeenRoom = gameMap.getRoomName(this.x, this.y);

    // AI vision check: scan for dead bodies or suspicious venting (only if alive)
    if (!this.isDead) {
      this.scanSurroundings(game);
    }
  }

  pickNextTask(gameMap) {
    if (this.isImpostor || !this.tasks) {
      this.pickRandomWalk(gameMap);
      return;
    }
    const uncompleted = this.tasks.filter(t => !t.completed);
    
    if (uncompleted.length > 0 && Math.random() < 0.8) {
      // Pick a random task
      const task = uncompleted[Math.floor(Math.random() * uncompleted.length)];
      this.targetTask = task;
      
      const startCol = this.getCol();
      const startRow = this.getRow();
      
      if (this.isDead) {
        // Ghosts walk in a straight line, so path is just one node: the target
        this.path = [{ col: task.col, row: task.row }];
      } else {
        this.path = findPath(startCol, startRow, task.col, task.row, gameMap);
      }
      
      if (this.path.length > 0) {
        this.aiState = 'WALKING_TO_TASK';
      } else {
        this.aiState = 'IDLE';
      }
    } else {
      this.pickRandomWalk(gameMap);
    }
  }

  pickRandomWalk(gameMap) {
    // Pick a random room floor tile
    let attempts = 0;
    let found = false;
    let targetCol, targetRow;

    while (attempts < 30 && !found) {
      if (gameMap.isWaitingRoom) {
        targetCol = 19 + Math.floor(Math.random() * 12); // col 19 to 30
        targetRow = 14 + Math.floor(Math.random() * 12); // row 14 to 25
      } else {
        targetCol = Math.floor(Math.random() * gameMap.cols);
        targetRow = Math.floor(Math.random() * gameMap.rows);
      }
      if (!gameMap.isSolid(targetCol, targetRow)) {
        found = true;
      }
      attempts++;
    }

    if (found) {
      if (this.isDead) {
        this.path = [{ col: targetCol, row: targetRow }];
      } else {
        this.path = findPath(this.getCol(), this.getRow(), targetCol, targetRow, gameMap);
      }
      if (this.path.length > 0) {
        this.aiState = 'WALKING_RANDOM';
      }
    }
  }

  followPath(gameMap) {
    if (this.path.length === 0) {
      this.aiState = 'IDLE';
      this.isMoving = false;
      return;
    }

    // Target current node center
    const targetNode = this.path[0];
    const targetX = targetNode.col * TILE_SIZE + TILE_SIZE / 2;
    const targetY = targetNode.row * TILE_SIZE + TILE_SIZE / 2;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 4) {
      // Reached node, move to next
      this.path.shift();
      if (this.path.length === 0) {
        // Reached end of path!
        if (this.aiState === 'WALKING_TO_TASK' && this.targetTask) {
          this.aiState = 'DOING_TASK';
          this.stateTimer = 0;
        } else {
          this.aiState = 'IDLE';
        }
        this.isMoving = false;
      }
    } else {
      // Move towards node
      const moveX = (dx / dist) * this.speed;
      const moveY = (dy / dist) * this.speed;
      
      const nextPos = this.isDead 
        ? { x: this.x + moveX, y: this.y + moveY }
        : gameMap.resolveCollisions(this.x + moveX, this.y + moveY, this.radius);
      this.x = nextPos.x;
      this.y = nextPos.y;

      this.isMoving = true;
      this.isFacingLeft = dx < 0;
    }
  }

  ventTeleport(gameMap) {
    // Find closest vent
    let closestVent = null;
    let minDist = 150;

    gameMap.vents.forEach(vent => {
      const ventX = vent.col * TILE_SIZE + TILE_SIZE / 2;
      const ventY = vent.row * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.sqrt((this.x - ventX) ** 2 + (this.y - ventY) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestVent = vent;
      }
    });

    if (closestVent) {
      // Warp to a connected vent
      const nextVentId = closestVent.connections[Math.floor(Math.random() * closestVent.connections.length)];
      const nextVent = gameMap.vents.find(v => v.id === nextVentId);
      
      if (nextVent) {
        this.x = nextVent.col * TILE_SIZE + TILE_SIZE / 2;
        this.y = nextVent.row * TILE_SIZE + TILE_SIZE / 2;
        this.path = [];
        this.aiState = 'IDLE';
        this.stateTimer = 0;
      }
    }
  }

  checkForIsolationKill(game) {
    if (this.killCooldown > 0) return;

    // Scan for any alive crewmates nearby (both bots/local players in game.entities, and other players in game.remotePlayers)
    let targets = game.entities.filter(e => !e.isImpostor && !e.isDead);
    if (game.isMultiplayer && game.remotePlayers) {
      const remoteTargets = Array.from(game.remotePlayers.values()).filter(e => !e.isImpostor && !e.isDead);
      targets = [...targets, ...remoteTargets];
    }
    
    for (const target of targets) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < KILL_RANGE) {
        // Can we kill them in secret?
        // Ensure no other alive crewmate sees us (within vision raycast polygon of other players)
        let witnesses = game.entities.filter(e => e.id !== this.id && e.id !== target.id && !e.isDead);
        if (game.isMultiplayer && game.remotePlayers) {
          const remoteWitnesses = Array.from(game.remotePlayers.values()).filter(e => e.id !== this.id && e.id !== target.id && !e.isDead);
          witnesses = [...witnesses, ...remoteWitnesses];
        }
        let seenByWitness = false;

        for (const witness of witnesses) {
          // Check if witness is close and has line of sight
          const witnessDist = Math.sqrt((witness.x - this.x) ** 2 + (witness.y - this.y) ** 2);
          if (witnessDist < 250) {
            // Check if this bot is within witness's field of view polygon
            if (this.isInVisibilityPolygon(this.x, this.y, witness.visibilityPoints)) {
              seenByWitness = true;
              break;
            }
          }
        }

        if (!seenByWitness) {
          // Execute isolated kill!
          game.killPlayer(target, this);
          this.killCooldown = Math.random() * 10000 + 15000; // Reset bot kill cooldown
          this.aiState = 'IDLE';
          this.stateTimer = 0;
          break;
        }
      }
    }
  }

  scanSurroundings(game) {
    // 1. Crewmate checks for dead bodies in line-of-sight
    if (!this.isImpostor) {
      const scanRange = this.difficulty === 'easy' ? 150 : (this.difficulty === 'hard' ? 260 : 200);
      game.deadBodies.forEach(body => {
        const dist = Math.sqrt((this.x - body.x) ** 2 + (this.y - body.y) ** 2);
        if (dist < scanRange) {
          // Check line of sight
          if (this.isInVisibilityPolygon(body.x, body.y, this.visibilityPoints)) {
            // Report body!
            game.triggerMeeting(this, true, body);
          }
        }
      });
    }

    // 2. Scan for venting players
    const ventScanRange = this.difficulty === 'easy' ? 150 : (this.difficulty === 'hard' ? 260 : 200);
    game.entities.forEach(entity => {
      if (entity.id !== this.id && entity.isVenting && !entity.isDead) {
        const dist = Math.sqrt((this.x - entity.x) ** 2 + (this.y - entity.y) ** 2);
        if (dist < 200) {
          if (this.isInVisibilityPolygon(entity.x, entity.y, this.visibilityPoints)) {
            // Caught venting! Set suspicion to this voter target
            this.seenVenting[entity.id] = true;
            this.suspicion = entity.id;
          }
        }
      }
    });

    // 3. Crewmate records suspicion if standing near a dead body reporter or victim
    // We already do accusation logic inside meetings based on proximity
  }

}


// Remote Player - Represents a networked player with interpolation
export class RemotePlayer extends BaseEntity {
  constructor(id, nickname, color, x = 0, y = 0) {
    super(id, x, y, color, nickname, false);
    
    // Target position from server
    this.targetX = x;
    this.targetY = y;
    this.lastUpdateTimestamp = Date.now();
    
    // Interpolation
    this.interpolationAlpha = 0;
    this.interpolationSpeed = 0.3; // Smooth factor
    
    // Extrapolation limit
    this.maxExtrapolationTime = 500; // 500ms
  }

  // Update target position from server
  updatePosition(x, y, isFacingLeft, isMoving, timestamp = Date.now()) {
    this.targetX = x;
    this.targetY = y;
    this.isFacingLeft = isFacingLeft;
    this.isMoving = isMoving;
    this.lastUpdateTimestamp = Date.now(); // Use local arrival time to avoid host/client clock skew issues
    this.interpolationAlpha = 0;
  }

  // Interpolate position for smooth rendering
  interpolate(deltaTime) {
    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdateTimestamp;
    
    // Calculate distance to target
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Snap to server position if too far (anti-desync)
    if (distance > 50) {
      this.x = this.targetX;
      this.y = this.targetY;
      return;
    }
    
    // If no update for too long, freeze position
    if (timeSinceUpdate > this.maxExtrapolationTime) {
      return;
    }
    
    // Frame-rate independent smooth interpolation (e.g. LERP using deltaTime in ms)
    // deltaTime is in ms. At 60fps, deltaTime ~ 16.6ms.
    // We want the interpolation speed to be around 0.25 at 60fps.
    // 1 - (1 - speed) ^ (deltaTime / 16.6)
    const t = 1 - Math.pow(1 - 0.25, deltaTime / 16.6);
    this.x += dx * Math.min(1, Math.max(0, t));
    this.y += dy * Math.min(1, Math.max(0, t));
  }

  // Get display position (already interpolated)
  getDisplayPosition() {
    return { x: this.x, y: this.y };
  }
}
