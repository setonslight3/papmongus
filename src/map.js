// Map generator and collision engine for papmongus
import { MAP_COLS, MAP_ROWS, TILE_SIZE, ROOMS, TASKS_LIST, COLORS } from './config.js';

export class GameMap {
  constructor(isWaitingRoom = false) {
    this.cols = MAP_COLS;
    this.rows = MAP_ROWS;
    this.grid = [];
    this.isWaitingRoom = isWaitingRoom;
    
    // Vents coordinates and networking (Skeld Vents loops)
    this.vents = [
      // Left Loop (Reactor & Engines)
      { id: 'vent_upper_engine', room: 'Upper Engine', col: 9, row: 5, connections: ['vent_reactor_top', 'vent_reactor_bottom'] },
      { id: 'vent_reactor_top', room: 'Reactor', col: 3, row: 15, connections: ['vent_upper_engine', 'vent_reactor_bottom'] },
      { id: 'vent_reactor_bottom', room: 'Reactor', col: 3, row: 21, connections: ['vent_lower_engine', 'vent_reactor_top'] },
      { id: 'vent_lower_engine', room: 'Lower Engine', col: 9, row: 31, connections: ['vent_reactor_bottom', 'vent_reactor_top'] },
      
      // Medbay / Electrical / Security Loop (Triangle)
      { id: 'vent_medbay', room: 'Medbay', col: 13, row: 12, connections: ['vent_electrical', 'vent_security'] },
      { id: 'vent_electrical', room: 'Electrical', col: 19, row: 24, connections: ['vent_medbay', 'vent_security'] },
      { id: 'vent_security', room: 'Security', col: 16, row: 22, connections: ['vent_medbay', 'vent_electrical'] },
      
      // Cafeteria / Admin Loop
      { id: 'vent_cafeteria', room: 'Cafeteria', col: 29, row: 9, connections: ['vent_admin'] },
      { id: 'vent_admin', room: 'Admin', col: 32, row: 22, connections: ['vent_cafeteria'] },
      
      // Right Loop (Weapons, Navigation, Shields)
      { id: 'vent_weapons', room: 'Weapons', col: 41, row: 8, connections: ['vent_nav_top'] },
      { id: 'vent_nav_top', room: 'Navigation', col: 43, row: 14, connections: ['vent_weapons', 'vent_nav_bottom'] },
      { id: 'vent_nav_bottom', room: 'Navigation', col: 43, row: 20, connections: ['vent_shields', 'vent_nav_top'] },
      { id: 'vent_shields', room: 'Shields', col: 41, row: 29, connections: ['vent_nav_bottom'] }
    ];

    // Emergency Meeting Table center pixel coordinate
    this.emergencyButton = {
      x: 25 * TILE_SIZE + TILE_SIZE / 2,
      y: 6 * TILE_SIZE + TILE_SIZE / 2,
      size: 56
    };

    this.tasks = [];

    if (this.isWaitingRoom) {
      this.generateWaitingRoomMap();
    } else {
      this.generateMap();
    }
  }

  generateWaitingRoomMap() {
    // Fill map with walls (1)
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = 1;
      }
    }

    // Dig out a large capsule Dropship cabin: col 19 to 30, row 14 to 25
    for (let r = 14; r <= 25; r++) {
      let cStart = 19;
      let cEnd = 30;

      if (r === 14) {
        cStart = 24; cEnd = 25; // Top door opening
      } else if (r === 15) {
        cStart = 22; cEnd = 27; // Slanted top
      } else if (r === 16) {
        cStart = 21; cEnd = 28;
      } else if (r === 17) {
        cStart = 20; cEnd = 29;
      } else if (r === 24) {
        cStart = 20; cEnd = 29; // Slanted bottom
      } else if (r === 25) {
        cStart = 21; cEnd = 28;
      }

      for (let c = cStart; c <= cEnd; c++) {
        this.grid[r][c] = 0;
      }
    }

    // Add obstacles inside the dropship
    // Laptop console table: col 21, row 18
    this.grid[18][21] = 1;
    // Cargo Crate 1: col 22, row 22
    this.grid[22][22] = 1;
    // Cargo Crate 2: col 27, row 20
    this.grid[20][27] = 1;
    // Toolbox: col 28, row 18
    this.grid[18][28] = 1;

    // Clear vents and tasks
    this.vents = [];
    this.tasks = [];
  }

  generateMap() {
    // 1. Fill map with walls (1)
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        // Outer boundaries are always walls
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          this.grid[r][c] = 1;
        } else {
          this.grid[r][c] = 1;
        }
      }
    }

    // 2. Dig out the rooms based on config boundaries
    ROOMS.forEach(room => {
      for (let r = room.rowStart; r <= room.rowEnd; r++) {
        for (let c = room.colStart; c <= room.colEnd; c++) {
          this.grid[r][c] = 0; // Dig (floor)
        }
      }
    });

    // 3. Dig out corridors (1-tile to 3-tile wide pathways)
    // Left-side connectors
    this.digHorizontalCorridor(14, 20, 6);   // Cafeteria to Upper Engine
    this.digHorizontalCorridor(6, 8, 6);     // Upper Engine to Reactor corridor
    this.digVerticalCorridor(6, 6, 28);      // Left vertical corridor (Reactor/Engines bypass)
    this.digHorizontalCorridor(6, 8, 28);    // Lower Engine to Reactor corridor
    this.digHorizontalCorridor(7, 15, 20);   // Security door to Left corridor
    this.digHorizontalCorridor(17, 22, 15);  // Medbay door to Hallway
    this.digVerticalCorridor(22, 10, 16);    // Medbay vertical hallway to Cafeteria

    // Center connectors
    this.digVerticalCorridor(25, 10, 24);    // Center vertical corridor (Cafeteria to Storage)
    this.digHorizontalCorridor(23, 25, 24);  // Electrical door to Center corridor
    this.digHorizontalCorridor(25, 31, 20);  // Admin door to Center corridor

    // Right-side connectors
    this.digHorizontalCorridor(30, 36, 6);   // Cafeteria to Weapons
    this.digVerticalCorridor(39, 9, 25);     // Right vertical corridor
    this.digHorizontalCorridor(38, 39, 13);  // O2 door to Right corridor
    this.digHorizontalCorridor(39, 42, 16);  // Navigation door to Right corridor
    this.digHorizontalCorridor(29, 39, 25);  // Storage to right hallway (Shields connection)
    this.digVerticalCorridor(33, 25, 31);    // Communication to Storage/Shields corridor

    // 4. Place interactive Task consoles in rooms
    this.placeTasks();
  }

  digHorizontalCorridor(colStart, colEnd, row) {
    const start = Math.min(colStart, colEnd);
    const end = Math.max(colStart, colEnd);
    for (let c = start; c <= end; c++) {
      this.grid[row][c] = 0;
      // Make corridors 2 tiles wide for easier navigation
      if (row + 1 < this.rows - 1) this.grid[row + 1][c] = 0;
    }
  }

  digVerticalCorridor(col, rowStart, rowEnd) {
    const start = Math.min(rowStart, rowEnd);
    const end = Math.max(rowStart, rowEnd);
    for (let r = start; r <= end; r++) {
      this.grid[r][col] = 0;
      // Make corridors 2 tiles wide
      if (col + 1 < this.cols - 1) this.grid[r][col + 1] = 0;
    }
  }

  placeTasks() {
    this.tasks = [];
    
    // Placements for all tasks in TASKS_LIST
    const placements = {
      wires_electrical: { col: 20, row: 27 },
      wires_cafeteria: { col: 25, row: 3 },
      wires_security: { col: 18, row: 19 },
      wires_storage: { col: 26, row: 31 },
      wires_navigation: { col: 45, row: 17 },
      wires_admin: { col: 34, row: 20 },
      swipe_admin: { col: 35, row: 22 },
      upload_admin: { col: 33, row: 23 },
      upload_cafeteria: { col: 28, row: 5 },
      upload_medbay: { col: 15, row: 13 },
      upload_weapons: { col: 39, row: 7 },
      upload_navigation: { col: 46, row: 15 },
      upload_communications: { col: 33, row: 33 },
      upload_shields: { col: 40, row: 27 },
      asteroids_weapons: { col: 40, row: 5 },
      fuel_upper_engine: { col: 10, row: 6 },
      fuel_lower_engine: { col: 10, row: 29 },
      leaves_o2: { col: 36, row: 13 },
      calibrate_navigation: { col: 44, row: 19 },
      calibrate_electrical: { col: 22, row: 25 },
      leaves_reactor: { col: 4, row: 17 },
      asteroids_shields: { col: 39, row: 28 },
      fuel_storage: { col: 27, row: 27 },
      swipe_security: { col: 17, row: 21 }
    };

    TASKS_LIST.forEach(taskDef => {
      const pos = placements[taskDef.id];
      if (pos) {
        this.tasks.push({
          ...taskDef,
          x: pos.col * TILE_SIZE + TILE_SIZE / 2,
          y: pos.row * TILE_SIZE + TILE_SIZE / 2,
          col: pos.col,
          row: pos.row,
          completed: false
        });
        // Make sure task floor tile is dug out
        this.grid[pos.row][pos.col] = 0;
      }
    });
  }

  isSolid(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
    return this.grid[row][col] === 1;
  }

  // Returns room name at pixel coordinate
  getRoomName(x, y) {
    if (this.isWaitingRoom) return 'Dropship';
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);

    for (const room of ROOMS) {
      if (col >= room.colStart && col <= room.colEnd &&
          row >= room.rowStart && row <= room.rowEnd) {
        return room.name;
      }
    }
    return 'Corridor';
  }

  // Sliding AABB collision resolution
  resolveCollisions(x, y, radius) {
    let newX = x;
    let newY = y;

    // Check collision bounding box based on entity radius
    // We sample grid cells surrounding the player coordinates
    const startCol = Math.floor((x - radius) / TILE_SIZE);
    const endCol = Math.floor((x + radius) / TILE_SIZE);
    const startRow = Math.floor((y - radius) / TILE_SIZE);
    const endRow = Math.floor((y + radius) / TILE_SIZE);

    // Resolve X axis first
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (this.isSolid(c, r)) {
          // Find closest point on this tile to the circle center
          const tileLeft = c * TILE_SIZE;
          const tileRight = tileLeft + TILE_SIZE;
          const tileTop = r * TILE_SIZE;
          const tileBottom = tileTop + TILE_SIZE;

          const closestX = Math.max(tileLeft, Math.min(newX, tileRight));
          const closestY = Math.max(tileTop, Math.min(newY, tileBottom));

          const distSplitX = newX - closestX;
          const distSplitY = newY - closestY;
          const distance = Math.sqrt(distSplitX * distSplitX + distSplitY * distSplitY);

          if (distance < radius && distance > 0) {
            // Push out of collision
            const overlap = radius - distance;
            newX += (distSplitX / distance) * overlap;
          }
        }
      }
    }

    // Resolve Y axis next
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (this.isSolid(c, r)) {
          const tileLeft = c * TILE_SIZE;
          const tileRight = tileLeft + TILE_SIZE;
          const tileTop = r * TILE_SIZE;
          const tileBottom = tileTop + TILE_SIZE;

          const closestX = Math.max(tileLeft, Math.min(newX, tileRight));
          const closestY = Math.max(tileTop, Math.min(newY, tileBottom));

          const distSplitX = newX - closestX;
          const distSplitY = newY - closestY;
          const distance = Math.sqrt(distSplitX * distSplitX + distSplitY * distSplitY);

          if (distance < radius && distance > 0) {
            const overlap = radius - distance;
            newY += (distSplitY / distance) * overlap;
          }
        }
      }
    }

    return { x: newX, y: newY };
  }

  // Draw the background map tiles with 3D bevels and room styling
  draw(ctx, camera, layer = 'all') {
    const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const endCol = Math.min(this.cols - 1, Math.ceil((camera.x + camera.width) / TILE_SIZE));
    const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endRow = Math.min(this.rows - 1, Math.ceil((camera.y + camera.height) / TILE_SIZE));

    ctx.save();
    
    // 1. Draw floors and walls
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (this.grid[r][c] === 1) {
          if (layer === 'floor') continue;

          // Check if this cell is part of the Left Thruster Engine (col 16-18, row 21-24)
          if (this.isWaitingRoom && c >= 16 && c <= 18 && r >= 21 && r <= 24) {
            if (c === 16 && r === 21) {
              const engX = 16 * TILE_SIZE;
              const engY = 21 * TILE_SIZE;
              const engW = 3 * TILE_SIZE;
              const engH = 110; // Cylinder height
              
              // 1. Draw metallic engine casing gradient
              const casingGrad = ctx.createLinearGradient(engX, engY, engX + engW, engY);
              casingGrad.addColorStop(0, '#1a222e');
              casingGrad.addColorStop(0.2, '#3b4554');
              casingGrad.addColorStop(0.5, '#5c697d');
              casingGrad.addColorStop(0.8, '#3b4554');
              casingGrad.addColorStop(1, '#1a222e');
              ctx.fillStyle = casingGrad;
              ctx.fillRect(engX, engY, engW, engH);
              
              // Casing accent strokes
              ctx.strokeStyle = '#242b36';
              ctx.lineWidth = 2;
              ctx.strokeRect(engX, engY, engW, engH);
              
              // Steel bands
              ctx.fillStyle = '#0a0d12';
              ctx.fillRect(engX, engY + 20, engW, 6);
              ctx.fillRect(engX, engY + 55, engW, 6);
              ctx.fillRect(engX, engY + 90, engW, 6);
              
              // 2. Draw nozzle (trapezoid at nozzleY1 to nozzleY2)
              const nozzleY1 = engY + engH;
              const nozzleY2 = engY + 4 * TILE_SIZE; // 128px
              const nozzleW1 = 56;
              const nozzleW2 = 72;
              const nX1_top = engX + (engW - nozzleW1) / 2;
              const nX2_top = nX1_top + nozzleW1;
              const nX1_bot = engX + (engW - nozzleW2) / 2;
              const nX2_bot = nX1_bot + nozzleW2;
              
              ctx.fillStyle = '#1c1f24';
              ctx.beginPath();
              ctx.moveTo(nX1_top, nozzleY1);
              ctx.lineTo(nX2_top, nozzleY1);
              ctx.lineTo(nX2_bot, nozzleY2);
              ctx.lineTo(nX1_bot, nozzleY2);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = '#0a0d12';
              ctx.stroke();
              
              // 3. Draw animated flickering blue plasma flame
              const flameLen = 65 + Math.sin(Date.now() * 0.05) * 12 + Math.random() * 6;
              const flameCenterX = engX + engW / 2;
              const flameTopY = nozzleY2;
              
              ctx.save();
              ctx.shadowColor = '#00d2ff';
              ctx.shadowBlur = 24;
              
              // Outer flame
              const outerGrad = ctx.createLinearGradient(flameCenterX, flameTopY, flameCenterX, flameTopY + flameLen);
              outerGrad.addColorStop(0, 'rgba(0, 210, 255, 0.9)');
              outerGrad.addColorStop(0.3, 'rgba(30, 100, 255, 0.7)');
              outerGrad.addColorStop(0.7, 'rgba(0, 50, 255, 0.3)');
              outerGrad.addColorStop(1, 'rgba(0, 0, 255, 0)');
              ctx.fillStyle = outerGrad;
              
              ctx.beginPath();
              ctx.moveTo(flameCenterX - 28, flameTopY);
              ctx.lineTo(flameCenterX + 28, flameTopY);
              ctx.lineTo(flameCenterX + 8, flameTopY + flameLen * 0.75);
              ctx.lineTo(flameCenterX, flameTopY + flameLen);
              ctx.lineTo(flameCenterX - 8, flameTopY + flameLen * 0.75);
              ctx.closePath();
              ctx.fill();
              
              // Inner flame core
              const innerGrad = ctx.createLinearGradient(flameCenterX, flameTopY, flameCenterX, flameTopY + flameLen * 0.65);
              innerGrad.addColorStop(0, '#ffffff');
              innerGrad.addColorStop(0.4, 'rgba(0, 210, 255, 0.85)');
              innerGrad.addColorStop(1, 'rgba(0, 210, 255, 0)');
              ctx.fillStyle = innerGrad;
              
              ctx.beginPath();
              ctx.moveTo(flameCenterX - 14, flameTopY);
              ctx.lineTo(flameCenterX + 14, flameTopY);
              ctx.lineTo(flameCenterX, flameTopY + flameLen * 0.65);
              ctx.closePath();
              ctx.fill();
              
              ctx.restore();
            }
            continue; // Skip normal wall
          }

          // Check if this cell is part of the Right Thruster Engine (col 31-33, row 21-24)
          if (this.isWaitingRoom && c >= 31 && c <= 33 && r >= 21 && r <= 24) {
            if (c === 31 && r === 21) {
              const engX = 31 * TILE_SIZE;
              const engY = 21 * TILE_SIZE;
              const engW = 3 * TILE_SIZE;
              const engH = 110; // Cylinder height
              
              // 1. Draw metallic engine casing gradient
              const casingGrad = ctx.createLinearGradient(engX, engY, engX + engW, engY);
              casingGrad.addColorStop(0, '#1a222e');
              casingGrad.addColorStop(0.2, '#3b4554');
              casingGrad.addColorStop(0.5, '#5c697d');
              casingGrad.addColorStop(0.8, '#3b4554');
              casingGrad.addColorStop(1, '#1a222e');
              ctx.fillStyle = casingGrad;
              ctx.fillRect(engX, engY, engW, engH);
              
              // Casing accent strokes
              ctx.strokeStyle = '#242b36';
              ctx.lineWidth = 2;
              ctx.strokeRect(engX, engY, engW, engH);
              
              // Steel bands
              ctx.fillStyle = '#0a0d12';
              ctx.fillRect(engX, engY + 20, engW, 6);
              ctx.fillRect(engX, engY + 55, engW, 6);
              ctx.fillRect(engX, engY + 90, engW, 6);
              
              // 2. Draw nozzle (trapezoid at nozzleY1 to nozzleY2)
              const nozzleY1 = engY + engH;
              const nozzleY2 = engY + 4 * TILE_SIZE; // 128px
              const nozzleW1 = 56;
              const nozzleW2 = 72;
              const nX1_top = engX + (engW - nozzleW1) / 2;
              const nX2_top = nX1_top + nozzleW1;
              const nX1_bot = engX + (engW - nozzleW2) / 2;
              const nX2_bot = nX1_bot + nozzleW2;
              
              ctx.fillStyle = '#1c1f24';
              ctx.beginPath();
              ctx.moveTo(nX1_top, nozzleY1);
              ctx.lineTo(nX2_top, nozzleY1);
              ctx.lineTo(nX2_bot, nozzleY2);
              ctx.lineTo(nX1_bot, nozzleY2);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = '#0a0d12';
              ctx.stroke();
              
              // 3. Draw animated flickering blue plasma flame
              const flameLen = 65 + Math.sin(Date.now() * 0.05) * 12 + Math.random() * 6;
              const flameCenterX = engX + engW / 2;
              const flameTopY = nozzleY2;
              
              ctx.save();
              ctx.shadowColor = '#00d2ff';
              ctx.shadowBlur = 24;
              
              // Outer flame
              const outerGrad = ctx.createLinearGradient(flameCenterX, flameTopY, flameCenterX, flameTopY + flameLen);
              outerGrad.addColorStop(0, 'rgba(0, 210, 255, 0.9)');
              outerGrad.addColorStop(0.3, 'rgba(30, 100, 255, 0.7)');
              outerGrad.addColorStop(0.7, 'rgba(0, 50, 255, 0.3)');
              outerGrad.addColorStop(1, 'rgba(0, 0, 255, 0)');
              ctx.fillStyle = outerGrad;
              
              ctx.beginPath();
              ctx.moveTo(flameCenterX - 28, flameTopY);
              ctx.lineTo(flameCenterX + 28, flameTopY);
              ctx.lineTo(flameCenterX + 8, flameTopY + flameLen * 0.75);
              ctx.lineTo(flameCenterX, flameTopY + flameLen);
              ctx.lineTo(flameCenterX - 8, flameTopY + flameLen * 0.75);
              ctx.closePath();
              ctx.fill();
              
              // Inner flame core
              const innerGrad = ctx.createLinearGradient(flameCenterX, flameTopY, flameCenterX, flameTopY + flameLen * 0.65);
              innerGrad.addColorStop(0, '#ffffff');
              innerGrad.addColorStop(0.4, 'rgba(0, 210, 255, 0.85)');
              innerGrad.addColorStop(1, 'rgba(0, 210, 255, 0)');
              ctx.fillStyle = innerGrad;
              
              ctx.beginPath();
              ctx.moveTo(flameCenterX - 14, flameTopY);
              ctx.lineTo(flameCenterX + 14, flameTopY);
              ctx.lineTo(flameCenterX, flameTopY + flameLen * 0.65);
              ctx.closePath();
              ctx.fill();
              
              ctx.restore();
            }
            continue; // Skip normal wall
          }

          // Draw wall tile - Solid dark slate gray
          ctx.fillStyle = this.isWaitingRoom ? '#0f1115' : '#1c2029';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

          // Draw laptop table (col 21, row 18)
          if (this.isWaitingRoom && c === 21 && r === 18) {
            ctx.fillStyle = '#34495e'; // Steel console table
            ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

            // Draw status green LED
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(x + 5, y + 5, 3, 3);

            // Draw laptop base
            ctx.fillStyle = '#7f8c8d'; 
            ctx.fillRect(x + 6, y + 16, TILE_SIZE - 12, 5);
            // Draw laptop screen (glowing screen with flicker)
            const glowVal = 0.6 + 0.3 * Math.sin(Date.now() * 0.007);
            ctx.fillStyle = `rgba(0, 210, 255, ${glowVal})`; 
            ctx.fillRect(x + 8, y + 6, TILE_SIZE - 16, 10);
            ctx.strokeStyle = '#ffffff';
            ctx.strokeRect(x + 8, y + 6, TILE_SIZE - 16, 10);
          }

          // Cargo Crate 1 (col 22, row 22)
          if (this.isWaitingRoom && c === 22 && r === 22) {
            ctx.fillStyle = '#7f8c8d'; // Silver metal crate
            ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#95a5a6';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            
            ctx.strokeStyle = '#34495e';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 12);
            
            ctx.fillStyle = '#f1c40f'; // Yellow stripe
            ctx.fillRect(x + 10, y + 12, 12, 4);
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(x + 13, y + 12, 3, 4);
          }

          // Cargo Crate 2 (col 27, row 20)
          if (this.isWaitingRoom && c === 27 && r === 20) {
            ctx.fillStyle = '#27ae60'; // Green cargo chest
            ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeStyle = '#1e824c';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            
            ctx.strokeStyle = '#16a085';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 2, y + 2);
            ctx.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE - 2);
            ctx.moveTo(x + TILE_SIZE - 2, y + 2);
            ctx.lineTo(x + 2, y + TILE_SIZE - 2);
            ctx.stroke();
          }

          // Toolbox (col 28, row 18)
          if (this.isWaitingRoom && c === 28 && r === 18) {
            ctx.fillStyle = '#c0392b'; // Deep red toolbox
            ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.strokeStyle = '#7f0f0f';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            
            ctx.fillStyle = '#bdc3c7'; // Handle
            ctx.fillRect(x + 10, y + 1, 12, 3);
            ctx.fillStyle = '#95a5a6'; // Latch
            ctx.fillRect(x + 14, y + 8, 4, 4);
          }
        } else {
          if (layer === 'walls') continue;
          // Floor tile
          if (this.isWaitingRoom) {
            ctx.fillStyle = '#2c3543'; // Steel gray dropship floor
          } else {
            const room = ROOMS.find(rm => c >= rm.colStart && c <= rm.colEnd && r >= rm.rowStart && r <= rm.rowEnd);
            if (room) {
              ctx.fillStyle = room.floor || COLORS.floor;
            } else {
              ctx.fillStyle = COLORS.floor;
            }
          }
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          
          // Subtle floor grid lines
          ctx.strokeStyle = this.isWaitingRoom ? '#202631' : '#1e2636';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

          // Draw seats on top wall (lining row 15 cols 22, 23, 26, 27)
          if (this.isWaitingRoom && r === 15 && (c === 22 || c === 23 || c === 26 || c === 27)) {
            ctx.fillStyle = '#2980b9'; // Blue chair back
            ctx.fillRect(x + 4, y + 2, TILE_SIZE - 8, 12);
            ctx.fillStyle = '#1f3a60'; // Cushion
            ctx.fillRect(x + 5, y + 14, TILE_SIZE - 10, 6);
          }

          // Draw seats on left wall (lining col 19, rows 18-23)
          if (this.isWaitingRoom && c === 19 && r >= 18 && r <= 23) {
            ctx.fillStyle = '#2980b9'; // Blue backrest
            ctx.fillRect(x + 2, y + 4, 8, TILE_SIZE - 8);
            ctx.fillStyle = '#1f3a60'; // Cushion
            ctx.fillRect(x + 10, y + 5, 8, TILE_SIZE - 10);
          }

          // Draw seats on right wall (lining col 30, rows 18-23)
          if (this.isWaitingRoom && c === 30 && r >= 18 && r <= 23) {
            ctx.fillStyle = '#2980b9'; // Blue backrest
            ctx.fillRect(x + TILE_SIZE - 10, y + 4, 8, TILE_SIZE - 8);
            ctx.fillStyle = '#1f3a60'; // Cushion
            ctx.fillRect(x + TILE_SIZE - 18, y + 5, 8, TILE_SIZE - 10);
          }

          // Draw sliding top center door (above row 14 col 24-25 floor opening)
          if (this.isWaitingRoom && r === 14 && (c === 24 || c === 25)) {
            ctx.fillStyle = '#7f8c8d'; // Metal sliding door
            ctx.fillRect(x, y, TILE_SIZE, 6);
            ctx.fillStyle = '#bdc3c7';
            ctx.fillRect(x, y + 6, TILE_SIZE, 2);
          }
        }
      }
    }

    // 2. Draw room glow overlays, accent outlines, and floor labels
    if (layer === 'floor' || layer === 'all') {
      ROOMS.forEach(room => {
        const rx = room.colStart * TILE_SIZE;
        const ry = room.rowStart * TILE_SIZE;
        const rw = (room.colEnd - room.colStart + 1) * TILE_SIZE;
        const rh = (room.rowEnd - room.rowStart + 1) * TILE_SIZE;

        // Check if room overlaps with camera
        if (rx + rw >= camera.x && rx <= camera.x + camera.width &&
            ry + rh >= camera.y && ry <= camera.y + camera.height) {
          
          // Draw room floor glow overlay
          ctx.fillStyle = room.glow || 'rgba(255,255,255,0.01)';
          ctx.fillRect(rx, ry, rw, rh);

          // Draw room threshold outline (accent border)
          ctx.strokeStyle = room.accent + '2b'; // ~17% opacity
          ctx.lineWidth = 2;
          ctx.strokeRect(rx, ry, rw, rh);

          // Draw room name label
          const centerX = rx + rw / 2;
          const centerY = ry + rh / 2;
          ctx.save();
          ctx.fillStyle = room.accent + '22'; // ~13% opacity
          ctx.font = '800 22px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(room.name.toUpperCase(), centerX, centerY);
          ctx.restore();
        }
      });
    }

    // 3. Draw smooth walls outlines (border between floor and wall)
    if (layer === 'walls' || layer === 'all') {
      ctx.save();
      ctx.strokeStyle = '#7f8c8d'; // Silver gray outline
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (this.grid[r][c] === 1) {
            const x = c * TILE_SIZE;
            const y = r * TILE_SIZE;

            // Draw line segments on wall edges facing floor tiles
            if (r > 0 && this.grid[r - 1][c] === 0) { // Top
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + TILE_SIZE, y);
              ctx.stroke();
            }
            if (r < this.rows - 1 && this.grid[r + 1][c] === 0) { // Bottom
              ctx.beginPath();
              ctx.moveTo(x, y + TILE_SIZE);
              ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
              ctx.stroke();
            }
            if (c > 0 && this.grid[r][c - 1] === 0) { // Left
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x, y + TILE_SIZE);
              ctx.stroke();
            }
            if (c < this.cols - 1 && this.grid[r][c + 1] === 0) { // Right
              ctx.beginPath();
              ctx.moveTo(x + TILE_SIZE, y);
              ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
              ctx.stroke();
            }
          }
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
