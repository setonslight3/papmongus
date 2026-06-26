// Minigames implementation for papmongus tasks
import { COLORS } from './config.js';
import { playTaskComplete, playTaskProgress } from './audio.js';

let activeOnComplete = null;
let currentTask = null;

// State for Wiring
let wiringState = {
  canvas: null,
  ctx: null,
  leftNodes: [],  // { y, color, connectedTo: null }
  rightNodes: [], // { y, color }
  activeDragStart: null, // index of left node
  mouseX: 0,
  mouseY: 0
};

// State for Card Swipe
let swipeState = {
  card: null,
  reader: null,
  isDragging: false,
  startX: 0,
  startTime: 0,
  statusEl: null,
  success: false
};

// State for Upload/Download Data
let uploadState = {
  btn: null,
  progress: null,
  progressText: null,
  interval: null,
  percentage: 0,
  isFinished: false
};

export function initMinigames() {
  setupWiringEvents();
  setupSwipeEvents();
  setupUploadEvents();
  setupAsteroidsEvents();
  setupFuelEvents();
  setupLeavesEvents();
  setupCalibrateEvents();

  // Close button listener
  document.getElementById('minigame-close-btn').addEventListener('click', () => {
    closeMinigame(false);
  });
}

// ==========================================
// 4. ASTEROIDS MINIGAME LOGIC
// ==========================================
let asteroidsState = {
  canvas: null,
  ctx: null,
  asteroids: [],
  destroyed: 0,
  mouseX: 0,
  mouseY: 0,
  targetCount: 10,
  animationId: null
};

function startAsteroids() {
  asteroidsState.canvas = document.getElementById('asteroids-canvas');
  asteroidsState.ctx = asteroidsState.canvas.getContext('2d');
  asteroidsState.destroyed = 0;
  asteroidsState.asteroids = [];
  
  // Spawn asteroids
  for (let i = 0; i < asteroidsState.targetCount; i++) {
    asteroidsState.asteroids.push({
      x: Math.random() * asteroidsState.canvas.width,
      y: Math.random() * asteroidsState.canvas.height,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      size: Math.random() * 15 + 10,
      alive: true
    });
  }
  
  const counter = document.getElementById('asteroids-counter');
  if (counter) counter.innerText = `Asteroids destroyed: 0 / ${asteroidsState.targetCount}`;
  
  drawAsteroids();
}

function drawAsteroids() {
  const { canvas, ctx, asteroids } = asteroidsState;
  if (!canvas) return;
  
  ctx.fillStyle = '#000008';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    const x = (i * 37 + Date.now() * 0.01) % canvas.width;
    const y = (i * 53) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
  
  // Update and draw asteroids
  asteroids.forEach(ast => {
    if (!ast.alive) return;
    
    ast.x += ast.vx;
    ast.y += ast.vy;
    
    // Wrap around
    if (ast.x < 0) ast.x = canvas.width;
    if (ast.x > canvas.width) ast.x = 0;
    if (ast.y < 0) ast.y = canvas.height;
    if (ast.y > canvas.height) ast.y = 0;
    
    // Draw asteroid
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.arc(ast.x, ast.y, ast.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  
  // Draw crosshair
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(asteroidsState.mouseX - 10, asteroidsState.mouseY);
  ctx.lineTo(asteroidsState.mouseX + 10, asteroidsState.mouseY);
  ctx.moveTo(asteroidsState.mouseX, asteroidsState.mouseY - 10);
  ctx.lineTo(asteroidsState.mouseX, asteroidsState.mouseY + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(asteroidsState.mouseX, asteroidsState.mouseY, 15, 0, Math.PI * 2);
  ctx.stroke();
  
  if (asteroidsState.destroyed < asteroidsState.targetCount) {
    asteroidsState.animationId = requestAnimationFrame(drawAsteroids);
  }
}

function setupAsteroidsEvents() {
  const canvas = document.getElementById('asteroids-canvas');
  
  const getMousePos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };
  
  const handleMove = (e) => {
    const pos = getMousePos(e);
    asteroidsState.mouseX = pos.x;
    asteroidsState.mouseY = pos.y;
  };
  
  const handleClick = (e) => {
    const pos = getMousePos(e);
    
    // Check if any asteroid was hit
    asteroidsState.asteroids.forEach(ast => {
      if (!ast.alive) return;
      const dist = Math.sqrt((ast.x - pos.x) ** 2 + (ast.y - pos.y) ** 2);
      if (dist < ast.size) {
        ast.alive = false;
        asteroidsState.destroyed++;
        playTaskProgress();
        
        const counter = document.getElementById('asteroids-counter');
        if (counter) counter.innerText = `Asteroids destroyed: ${asteroidsState.destroyed} / ${asteroidsState.targetCount}`;
        
        if (asteroidsState.destroyed >= asteroidsState.targetCount) {
          if (asteroidsState.animationId) {
            cancelAnimationFrame(asteroidsState.animationId);
          }
          setTimeout(() => {
            closeMinigame(true);
          }, 500);
        }
      }
    });
  };
  
  canvas.addEventListener('mousemove', handleMove);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchmove', handleMove);
  canvas.addEventListener('touchstart', handleClick);
}

// ==========================================
// 5. FUEL ENGINES MINIGAME LOGIC
// ==========================================
let fuelState = {
  btn: null,
  fill: null,
  status: null,
  level: 0,
  isHolding: false,
  interval: null
};

function startFuel() {
  fuelState.btn = document.getElementById('fuel-btn');
  fuelState.fill = document.getElementById('fuel-fill');
  fuelState.status = document.getElementById('fuel-status');
  fuelState.level = 0;
  fuelState.isHolding = false;
  
  if (fuelState.fill) fuelState.fill.style.height = '0%';
  if (fuelState.status) fuelState.status.innerText = 'Hold the button to fill the tank';
}

function setupFuelEvents() {
  const btn = document.getElementById('fuel-btn');
  
  const startHold = () => {
    if (fuelState.level >= 100) return;
    fuelState.isHolding = true;
    
    fuelState.interval = setInterval(() => {
      fuelState.level += 2;
      if (fuelState.level >= 100) {
        fuelState.level = 100;
        clearInterval(fuelState.interval);
        if (fuelState.status) fuelState.status.innerText = 'Tank Full!';
        playTaskComplete();
        setTimeout(() => {
          closeMinigame(true);
        }, 500);
      } else {
        playTaskProgress();
      }
      
      if (fuelState.fill) fuelState.fill.style.height = `${fuelState.level}%`;
    }, 50);
  };
  
  const endHold = () => {
    fuelState.isHolding = false;
    if (fuelState.interval) {
      clearInterval(fuelState.interval);
      fuelState.interval = null;
    }
  };
  
  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('touchstart', startHold);
  window.addEventListener('mouseup', endHold);
  window.addEventListener('touchend', endHold);
}

// ==========================================
// 6. CLEAN LEAVES MINIGAME LOGIC
// ==========================================
let leavesState = {
  canvas: null,
  ctx: null,
  leaves: [],
  removed: 0,
  targetCount: 6
};

function startLeaves() {
  leavesState.canvas = document.getElementById('leaves-canvas');
  leavesState.ctx = leavesState.canvas.getContext('2d');
  leavesState.removed = 0;
  leavesState.leaves = [];
  
  // Spawn leaves
  for (let i = 0; i < leavesState.targetCount; i++) {
    leavesState.leaves.push({
      x: Math.random() * leavesState.canvas.width,
      y: Math.random() * leavesState.canvas.height,
      size: Math.random() * 20 + 15,
      color: ['#2ecc71', '#27ae60', '#16a085'][Math.floor(Math.random() * 3)],
      alive: true
    });
  }
  
  const counter = document.getElementById('leaves-counter');
  if (counter) counter.innerText = `Leaves remaining: ${leavesState.targetCount}`;
  
  drawLeaves();
}

function drawLeaves() {
  const { canvas, ctx, leaves } = leavesState;
  if (!canvas) return;
  
  ctx.fillStyle = '#34495e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw filter grid
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  // Draw leaves
  leaves.forEach(leaf => {
    if (!leaf.alive) return;
    
    ctx.fillStyle = leaf.color;
    ctx.beginPath();
    ctx.ellipse(leaf.x, leaf.y, leaf.size, leaf.size * 0.6, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#145a32';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function setupLeavesEvents() {
  const canvas = document.getElementById('leaves-canvas');
  
  const getMousePos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };
  
  const handleClick = (e) => {
    const pos = getMousePos(e);
    
    leavesState.leaves.forEach(leaf => {
      if (!leaf.alive) return;
      const dist = Math.sqrt((leaf.x - pos.x) ** 2 + (leaf.y - pos.y) ** 2);
      if (dist < leaf.size) {
        leaf.alive = false;
        leavesState.removed++;
        playTaskProgress();
        
        const counter = document.getElementById('leaves-counter');
        if (counter) counter.innerText = `Leaves remaining: ${leavesState.targetCount - leavesState.removed}`;
        
        drawLeaves();
        
        if (leavesState.removed >= leavesState.targetCount) {
          setTimeout(() => {
            closeMinigame(true);
          }, 500);
        }
      }
    });
  };
  
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', handleClick);
}

// ==========================================
// 7. CALIBRATE DISTRIBUTOR MINIGAME LOGIC
// ==========================================
let calibrateState = {
  canvas: null,
  ctx: null,
  angle: 0,
  targetAngle: 0,
  stage: 0,
  totalStages: 3,
  animationId: null
};

function startCalibrate() {
  calibrateState.canvas = document.getElementById('calibrate-canvas');
  calibrateState.ctx = calibrateState.canvas.getContext('2d');
  calibrateState.angle = 0;
  calibrateState.targetAngle = Math.random() * Math.PI * 2;
  calibrateState.stage = 0;
  
  const status = document.getElementById('calibrate-status');
  if (status) status.innerText = 'Click when the spinner aligns with the target';
  
  drawCalibrate();
}

function drawCalibrate() {
  const { canvas, ctx } = calibrateState;
  if (!canvas) return;
  
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 100;
  
  // Draw outer circle
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Draw target zone (green arc)
  ctx.strokeStyle = '#2ecc71';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, calibrateState.targetAngle - 0.2, calibrateState.targetAngle + 0.2);
  ctx.stroke();
  
  // Draw spinning needle
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(calibrateState.angle);
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -radius);
  ctx.stroke();
  ctx.restore();
  
  // Draw stage indicator
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Stage: ${calibrateState.stage + 1} / ${calibrateState.totalStages}`, centerX, centerY + radius + 30);
  
  // Animate
  calibrateState.angle += 0.05;
  if (calibrateState.angle > Math.PI * 2) calibrateState.angle -= Math.PI * 2;
  
  if (calibrateState.stage < calibrateState.totalStages) {
    calibrateState.animationId = requestAnimationFrame(drawCalibrate);
  }
}

function setupCalibrateEvents() {
  const canvas = document.getElementById('calibrate-canvas');
  
  const handleClick = () => {
    // Check if angle is close to target
    let diff = Math.abs(calibrateState.angle - calibrateState.targetAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    
    if (diff < 0.3) {
      // Success!
      calibrateState.stage++;
      playTaskProgress();
      
      if (calibrateState.stage >= calibrateState.totalStages) {
        if (calibrateState.animationId) {
          cancelAnimationFrame(calibrateState.animationId);
        }
        setTimeout(() => {
          closeMinigame(true);
        }, 500);
      } else {
        // Next stage
        calibrateState.targetAngle = Math.random() * Math.PI * 2;
      }
    } else {
      // Failed - restart current stage
      playTaskProgress();
      const status = document.getElementById('calibrate-status');
      if (status) {
        status.innerText = 'Missed! Try again...';
        setTimeout(() => {
          status.innerText = 'Click when the spinner aligns with the target';
        }, 1000);
      }
    }
  };
  
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', handleClick);
}

export function openMinigame(task, onComplete) {
  currentTask = task;
  activeOnComplete = onComplete;
  
  // Show base overlay
  const overlay = document.getElementById('minigame-overlay');
  overlay.classList.remove('hidden');

  // Hide all games first
  document.getElementById('wiring-game').classList.add('hidden');
  document.getElementById('swipe-game').classList.add('hidden');
  document.getElementById('upload-game').classList.add('hidden');
  document.getElementById('asteroids-game').classList.add('hidden');
  document.getElementById('fuel-game').classList.add('hidden');
  document.getElementById('leaves-game').classList.add('hidden');
  document.getElementById('calibrate-game').classList.add('hidden');

  // Activate specific game panel
  if (task.type === 'wires') {
    document.getElementById('wiring-game').classList.remove('hidden');
    startWiring();
  } else if (task.type === 'swipe') {
    document.getElementById('swipe-game').classList.remove('hidden');
    startSwipe();
  } else if (task.type === 'upload') {
    document.getElementById('upload-game').classList.remove('hidden');
    startUpload(task.name);
  } else if (task.type === 'asteroids') {
    document.getElementById('asteroids-game').classList.remove('hidden');
    startAsteroids();
  } else if (task.type === 'fuel') {
    document.getElementById('fuel-game').classList.remove('hidden');
    startFuel();
  } else if (task.type === 'leaves') {
    document.getElementById('leaves-game').classList.remove('hidden');
    startLeaves();
  } else if (task.type === 'calibrate') {
    document.getElementById('calibrate-game').classList.remove('hidden');
    startCalibrate();
  }
}

export function closeMinigame(completed = false) {
  // Clean up timers
  if (uploadState.interval) {
    clearInterval(uploadState.interval);
    uploadState.interval = null;
  }

  if (completed) {
    // Show Task Completed banner overlay
    const banner = document.getElementById('task-completed-banner');
    if (banner) {
      banner.classList.remove('hidden');
    }
    
    // Play complete sound
    playTaskComplete();
    
    // Hold it for 1.0 second, then close minigame overlay
    setTimeout(() => {
      if (banner) {
        banner.classList.add('hidden');
      }
      const overlay = document.getElementById('minigame-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }
      
      if (activeOnComplete) {
        activeOnComplete(currentTask);
      }
      activeOnComplete = null;
      currentTask = null;
    }, 1000);
  } else {
    const overlay = document.getElementById('minigame-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    activeOnComplete = null;
    currentTask = null;
  }
}

// ==========================================
// 1. WIRING MINIGAME LOGIC
// ==========================================
function startWiring() {
  const canvas = document.getElementById('wiring-canvas');
  wiringState.canvas = canvas;
  wiringState.ctx = canvas.getContext('2d');
  
  const colors = ['#ff3333', '#3333ff', '#f1c40f', '#9b59b6'];
  
  // Shuffle colors helper
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  const leftColors = shuffle(colors);
  const rightColors = shuffle(colors);

  wiringState.leftNodes = leftColors.map((color, index) => ({
    y: 40 + index * 70,
    color: color,
    connectedTo: null
  }));

  wiringState.rightNodes = rightColors.map((color, index) => ({
    y: 40 + index * 70,
    color: color
  }));

  wiringState.activeDragStart = null;
  drawWiring();
}

function drawWiring() {
  const { canvas, ctx, leftNodes, rightNodes, activeDragStart, mouseX, mouseY } = wiringState;
  if (!canvas) return;

  // Clear
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const nodeRadius = 12;
  const leftX = 40;
  const rightX = canvas.width - 40;

  // Draw connected and active wires
  leftNodes.forEach((node, i) => {
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    if (node.connectedTo !== null) {
      // Draw locked wire
      ctx.strokeStyle = node.color;
      ctx.beginPath();
      ctx.moveTo(leftX, node.y);
      ctx.lineTo(rightX, rightNodes[node.connectedTo].y);
      ctx.stroke();
    }

    // Draw active dragging wire
    if (activeDragStart === i) {
      ctx.strokeStyle = node.color;
      ctx.beginPath();
      ctx.moveTo(leftX, node.y);
      ctx.lineTo(mouseX, mouseY);
      ctx.stroke();
    }
  });

  // Draw Left nodes (colored blocks + metallic pins)
  leftNodes.forEach((node) => {
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(5, node.y - 15, 30, 30);
    
    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(leftX, node.y, nodeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Draw Right nodes
  rightNodes.forEach((node) => {
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(canvas.width - 35, node.y - 15, 30, 30);

    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(rightX, node.y, nodeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function setupWiringEvents() {
  const canvas = document.getElementById('wiring-canvas');
  
  const getMousePos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const handleStart = (e) => {
    const pos = getMousePos(e);
    // Check if clicked near a left node
    wiringState.leftNodes.forEach((node, i) => {
      if (node.connectedTo === null && Math.abs(pos.x - 40) < 25 && Math.abs(pos.y - node.y) < 25) {
        wiringState.activeDragStart = i;
        wiringState.mouseX = pos.x;
        wiringState.mouseY = pos.y;
      }
    });
    drawWiring();
  };

  const handleMove = (e) => {
    if (wiringState.activeDragStart === null) return;
    const pos = getMousePos(e);
    wiringState.mouseX = pos.x;
    wiringState.mouseY = pos.y;
    drawWiring();
  };

  const handleEnd = (e) => {
    if (wiringState.activeDragStart === null) return;
    
    const leftIndex = wiringState.activeDragStart;
    const leftNode = wiringState.leftNodes[leftIndex];
    const rightX = canvas.width - 40;

    // Check if released near any matching right node
    let matched = false;
    wiringState.rightNodes.forEach((rNode, rIndex) => {
      // Check collision with right node
      if (Math.abs(wiringState.mouseX - rightX) < 30 && Math.abs(wiringState.mouseY - rNode.y) < 25) {
        // Colors must match
        if (leftNode.color === rNode.color) {
          // Connect!
          leftNode.connectedTo = rIndex;
          matched = true;
        }
      }
    });

    wiringState.activeDragStart = null;
    drawWiring();

    // Check if all connected
    const allDone = wiringState.leftNodes.every(n => n.connectedTo !== null);
    if (allDone) {
      setTimeout(() => {
        closeMinigame(true);
      }, 200);
    }
  };

  // Mouse Listeners
  canvas.addEventListener('mousedown', handleStart);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);

  // Touch Listeners
  canvas.addEventListener('touchstart', handleStart);
  window.addEventListener('touchmove', handleMove);
  window.addEventListener('touchend', handleEnd);
}

// ==========================================
// 2. CARD SWIPE MINIGAME LOGIC
// ==========================================
function startSwipe() {
  swipeState.card = document.getElementById('swipe-card');
  swipeState.reader = document.getElementById('swipe-track');
  swipeState.statusEl = document.getElementById('swipe-status');
  swipeState.success = false;
  swipeState.isDragging = false;
  
  swipeState.card.style.left = '10px';
  swipeState.statusEl.innerText = 'INSERT CARD';
  swipeState.statusEl.className = 'swipe-status-text neutral';
}

function setupSwipeEvents() {
  const card = document.getElementById('swipe-card');
  const track = document.getElementById('swipe-track');

  const startDrag = (e) => {
    if (swipeState.success) return;
    swipeState.isDragging = true;
    swipeState.startX = e.touches ? e.touches[0].clientX : e.clientX;
    swipeState.startTime = Date.now();
    swipeState.statusEl.innerText = 'SWIPING...';
    swipeState.statusEl.className = 'swipe-status-text neutral';
  };

  const moveDrag = (e) => {
    if (!swipeState.isDragging || swipeState.success) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = track.getBoundingClientRect();
    let currentLeft = clientX - rect.left - 40; // Center offset

    // Boundary check
    if (currentLeft < 10) currentLeft = 10;
    if (currentLeft > rect.width - 90) currentLeft = rect.width - 90;

    card.style.left = `${currentLeft}px`;
  };

  const endDrag = (e) => {
    if (!swipeState.isDragging || swipeState.success) return;
    swipeState.isDragging = false;

    const rect = track.getBoundingClientRect();
    const currentLeft = parseInt(card.style.left) || 10;
    const endBound = rect.width - 100;

    // Did the player drag it all the way to the end?
    if (currentLeft >= endBound) {
      const elapsed = Date.now() - swipeState.startTime;

      // Speed check: between 250ms and 600ms is "just right"
      if (elapsed < 200) {
        swipeState.statusEl.innerText = 'TOO FAST. TRY AGAIN.';
        swipeState.statusEl.className = 'swipe-status-text error';
        card.style.left = '10px';
      } else if (elapsed > 700) {
        swipeState.statusEl.innerText = 'TOO SLOW. TRY AGAIN.';
        swipeState.statusEl.className = 'swipe-status-text error';
        card.style.left = '10px';
      } else {
        swipeState.statusEl.innerText = 'BADGE ACCEPTED';
        swipeState.statusEl.className = 'swipe-status-text success';
        swipeState.success = true;
        
        setTimeout(() => {
          closeMinigame(true);
        }, 300);
      }
    } else {
      // Reset card if let go mid-swipe
      swipeState.statusEl.innerText = 'BAD SWIPE. TRY AGAIN.';
      swipeState.statusEl.className = 'swipe-status-text error';
      card.style.left = '10px';
    }
  };

  card.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);

  card.addEventListener('touchstart', startDrag);
  window.addEventListener('touchmove', moveDrag);
  window.addEventListener('touchend', endDrag);
}

// ==========================================
// 3. UPLOAD/DOWNLOAD MINIGAME LOGIC
// ==========================================
function startUpload(taskName) {
  uploadState.btn = document.getElementById('upload-btn');
  uploadState.progress = document.getElementById('upload-progress-fill');
  uploadState.progressText = document.getElementById('upload-progress-text');
  
  uploadState.percentage = 0;
  uploadState.isFinished = false;
  uploadState.progress.style.width = '0%';
  uploadState.progressText.innerText = '0%';
  
  uploadState.btn.innerText = taskName.includes('Download') ? 'DOWNLOAD DATA' : 'UPLOAD DATA';
  uploadState.btn.disabled = false;
}

function setupUploadEvents() {
  const btn = document.getElementById('upload-btn');
  
  btn.addEventListener('click', () => {
    if (uploadState.isFinished || uploadState.interval) return;
    
    btn.disabled = true;
    btn.innerText = 'TRANSFERRING...';
    
    uploadState.interval = setInterval(() => {
      uploadState.percentage += Math.floor(Math.random() * 8) + 4; // Increments randomly
      
      if (uploadState.percentage >= 100) {
        uploadState.percentage = 100;
        clearInterval(uploadState.interval);
        uploadState.interval = null;
        uploadState.isFinished = true;
        btn.innerText = 'TRANSFER COMPLETE';
        
        setTimeout(() => {
          closeMinigame(true);
        }, 300);
      } else {
        playTaskProgress();
      }
      
      uploadState.progress.style.width = `${uploadState.percentage}%`;
      uploadState.progressText.innerText = `${uploadState.percentage}%`;
    }, 150);
  });
}
