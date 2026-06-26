// Procedural pixel-art sprites drawer for papmongus
import { COLORS } from './config.js';

/**
 * Draws a pixel-art style crewmate on the canvas context.
 * Size is roughly 24x30 pixels.
 */
export function drawCrewmate(ctx, x, y, color, isFacingLeft, isMoving, isDead, isGhost, nickname = '', equippedHat = null) {
  ctx.save();
  ctx.translate(x, y);

  if (isGhost) {
    ctx.globalAlpha = 0.55;
  }

  // Handle facing direction
  if (isFacingLeft) {
    ctx.scale(-1, 1);
  }

  const pSize = 2; // Size of each "pixel" of the sprite

  // Main body outline (optional, can do styled solid)
  const bobY = isMoving && !isGhost ? Math.sin(Date.now() * 0.015) * 1.5 * pSize : 0;
  ctx.translate(0, bobY);

  // Backpack
  ctx.fillStyle = color;
  ctx.fillRect(-9 * pSize, -7 * pSize, 3 * pSize, 12 * pSize);
  // Backpack shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(-9 * pSize, 1 * pSize, 3 * pSize, 4 * pSize);

  // Main body outline (optional, can do styled solid)
  ctx.fillStyle = color;
  // Head / Body
  ctx.fillRect(-6 * pSize, -12 * pSize, 12 * pSize, 20 * pSize);
  
  // Draw Equipped Hat
  if (equippedHat) {
    ctx.save();
    if (equippedHat === 'tophat') {
      // Brim
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(-8 * pSize, -14 * pSize, 16 * pSize, 2 * pSize);
      // Tall cylinder
      ctx.fillRect(-5 * pSize, -22 * pSize, 10 * pSize, 8 * pSize);
      // Red band
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(-5 * pSize, -16 * pSize, 10 * pSize, 2 * pSize);
    } else if (equippedHat === 'crown') {
      // Gold base
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-6 * pSize, -15 * pSize, 12 * pSize, 3 * pSize);
      // Peaks
      ctx.fillRect(-6 * pSize, -19 * pSize, 2 * pSize, 4 * pSize);
      ctx.fillRect(-1 * pSize, -20 * pSize, 2 * pSize, 5 * pSize);
      ctx.fillRect(4 * pSize, -19 * pSize, 2 * pSize, 4 * pSize);
      // Red rubies
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-5 * pSize, -18 * pSize, 1 * pSize, 1 * pSize);
      ctx.fillRect(0 * pSize, -19 * pSize, 1 * pSize, 1 * pSize);
      ctx.fillRect(5 * pSize, -18 * pSize, 1 * pSize, 1 * pSize);
      ctx.fillRect(-2 * pSize, -14 * pSize, 1 * pSize, 1 * pSize);
      ctx.fillRect(2 * pSize, -14 * pSize, 1 * pSize, 1 * pSize);
    } else if (equippedHat === 'chef') {
      // White brim
      ctx.fillStyle = '#eeeeee';
      ctx.fillRect(-6 * pSize, -14 * pSize, 12 * pSize, 2 * pSize);
      // Fluffy puff shape
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5 * pSize, -22 * pSize, 10 * pSize, 8 * pSize);
      ctx.fillRect(-8 * pSize, -20 * pSize, 4 * pSize, 6 * pSize);
      ctx.fillRect(4 * pSize, -20 * pSize, 4 * pSize, 6 * pSize);
      // Shadows
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(-4 * pSize, -19 * pSize, 1 * pSize, 5 * pSize);
      ctx.fillRect(3 * pSize, -19 * pSize, 1 * pSize, 5 * pSize);
    } else if (equippedHat === 'slug') {
      // Sprout stem & leaf
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(-1 * pSize, -19 * pSize, 2 * pSize, 5 * pSize);
      ctx.fillRect(-3 * pSize, -20 * pSize, 2 * pSize, 1 * pSize);
      ctx.fillRect(1 * pSize, -20 * pSize, 2 * pSize, 1 * pSize);
      // Slug body
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(-4 * pSize, -17 * pSize, 8 * pSize, 3 * pSize);
      // Eye white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2 * pSize, -16 * pSize, 4 * pSize, 2 * pSize);
      // Pupil black
      ctx.fillStyle = '#000000';
      ctx.fillRect(-1 * pSize, -15 * pSize, 1 * pSize, 1 * pSize);
      ctx.fillRect(0 * pSize, -15 * pSize, 1 * pSize, 1 * pSize);
    }
    ctx.restore();
  }
  
  // Ghost tail instead of legs
  if (isGhost) {
    // Floating tail
    const tailWobble = Math.sin(Date.now() * 0.01) * 3 * pSize;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-6 * pSize, 8 * pSize);
    ctx.quadraticCurveTo(-6 * pSize + tailWobble, 16 * pSize, 0, 18 * pSize);
    ctx.quadraticCurveTo(6 * pSize + tailWobble, 16 * pSize, 6 * pSize, 8 * pSize);
    ctx.closePath();
    ctx.fill();
  } else {
    // Legs
    const legOffset = isMoving ? Math.sin(Date.now() * 0.02) * 2 * pSize : 0;
    // Left leg
    ctx.fillRect(-5 * pSize, 8 * pSize, 3 * pSize, 4 * pSize + (legOffset > 0 ? -pSize : 0));
    // Right leg
    ctx.fillRect(2 * pSize, 8 * pSize, 3 * pSize, 4 * pSize + (legOffset < 0 ? -pSize : 0));
  }

  // Shadow overlay on main body (bottom-left area)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(-6 * pSize, 2 * pSize, 12 * pSize, 6 * pSize);
  if (!isGhost) {
    ctx.fillRect(-5 * pSize, 8 * pSize, 3 * pSize, 2 * pSize);
    ctx.fillRect(2 * pSize, 8 * pSize, 3 * pSize, 2 * pSize);
  }

  // Visor (glass shield)
  ctx.fillStyle = '#22272e'; // dark outline border
  ctx.fillRect(-1 * pSize, -8 * pSize, 9 * pSize, 7 * pSize);
  ctx.fillStyle = '#8bd5ff'; // light blue visor
  ctx.fillRect(0, -7 * pSize, 7 * pSize, 5 * pSize);
  
  // Visor shine highlight
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3 * pSize, -7 * pSize, 3 * pSize, 1 * pSize);
  ctx.fillRect(5 * pSize, -6 * pSize, 1 * pSize, 1 * pSize);

  ctx.restore();

  // Draw name/nickname above character (unflipped)
  if (nickname) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(nickname, x, y - 32);
    ctx.restore();
  }
}

/**
 * Draws a ventilation grate (vent)
 */
export function drawVent(ctx, x, y, width = 32, height = 32) {
  ctx.save();
  ctx.fillStyle = '#2d3340';
  ctx.fillRect(x, y, width, height);

  // Outer frame
  ctx.strokeStyle = '#4a5366';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

  // Inner lines
  ctx.fillStyle = '#101216';
  const barSpacing = 6;
  for (let i = x + 6; i < x + width - 4; i += barSpacing) {
    ctx.fillRect(i, y + 5, 2, height - 10);
  }
  ctx.restore();
}

/**
 * Draws the Cafeteria central emergency table & button
 */
export function drawEmergencyButton(ctx, x, y, size = 64) {
  ctx.save();
  ctx.translate(x, y);

  // Central metallic circular table
  ctx.fillStyle = '#7a8599';
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#4e5666';
  ctx.stroke();

  // Dark border inner table ring
  ctx.fillStyle = '#4c5361';
  ctx.beginPath();
  ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
  ctx.fill();

  // Glass shield overlay
  ctx.fillStyle = 'rgba(139, 213, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(0, 0, size / 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // The Big Red Button
  ctx.fillStyle = '#cc0000';
  ctx.beginPath();
  ctx.arc(0, 0, size / 7, 0, Math.PI * 2);
  ctx.fill();

  // Button shadow/highlight
  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(-1, -1, size / 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a glowing task console
 */
export function drawTaskConsole(ctx, x, y, size = 32, isCompleted = false) {
  ctx.save();
  // Console base structure
  ctx.fillStyle = '#3a4454';
  ctx.fillRect(x, y, size, size);
  
  ctx.strokeStyle = '#222831';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);

  // Screen
  ctx.fillStyle = '#11151c';
  ctx.fillRect(x + 4, y + 4, size - 8, size - 14);

  // Glowing status color
  ctx.fillStyle = isCompleted ? '#2ecc71' : '#f1c40f'; // Green or Yellow glow
  ctx.fillRect(x + 6, y + 6, size - 12, size - 18);

  // Blinking dot indicator
  const blink = Math.floor(Date.now() / 400) % 2 === 0;
  ctx.fillStyle = blink && !isCompleted ? '#ff3333' : '#11151c';
  ctx.fillRect(x + 6, y + size - 8, 4, 4);

  // Keyboard slot
  ctx.fillStyle = '#7f8c8d';
  ctx.fillRect(x + 12, y + size - 8, size - 18, 4);
  
  ctx.restore();
}

/**
 * Draws a nuclear reactor panel
 */
export function drawReactorPanel(ctx, x, y, size = 32) {
  ctx.save();
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(x, y, size, size);

  // Outer border
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);

  // Reactor core circle
  const pulse = Math.abs(Math.sin(Date.now() * 0.005));
  const glowIntensity = Math.floor(pulse * 150) + 105;
  ctx.fillStyle = `rgb(${glowIntensity}, 0, 0)`; // Pulsing red core
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 3, 0, Math.PI * 2);
  ctx.fill();

  // Glass metallic frame details
  ctx.strokeStyle = '#cbd5e0';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a dead body crewmate (cut in half with bone).
 */
export function drawDeadBody(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);

  const pSize = 2; // Size of each "pixel" of the sprite

  // Draw dead body (cut-in-half crewmate with bone)
  // Leg/lower body base color
  ctx.fillStyle = color;
  ctx.fillRect(-6 * pSize, 2 * pSize, 12 * pSize, 6 * pSize); // body
  ctx.fillRect(-5 * pSize, 8 * pSize, 3 * pSize, 4 * pSize); // left leg
  ctx.fillRect(2 * pSize, 8 * pSize, 3 * pSize, 4 * pSize); // right leg
  
  // Shadow shading on lower body
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(-6 * pSize, 5 * pSize, 12 * pSize, 3 * pSize);
  ctx.fillRect(-5 * pSize, 10 * pSize, 3 * pSize, 2 * pSize);
  ctx.fillRect(2 * pSize, 10 * pSize, 3 * pSize, 2 * pSize);

  // Backpack (lying flat)
  ctx.fillStyle = color;
  ctx.fillRect(-9 * pSize, 3 * pSize, 3 * pSize, 5 * pSize);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(-9 * pSize, 6 * pSize, 3 * pSize, 2 * pSize);

  // Red bloody cut surface
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(-6 * pSize, 0, 12 * pSize, 2 * pSize);
  ctx.fillStyle = '#ff3333';
  ctx.fillRect(-4 * pSize, 0, 8 * pSize, 1 * pSize);

  // The bone sticking out
  ctx.fillStyle = '#e6e6e6';
  ctx.fillRect(-1 * pSize, -4 * pSize, 2 * pSize, 4 * pSize); // shaft
  ctx.fillRect(-2 * pSize, -5 * pSize, 2 * pSize, 2 * pSize); // left joint
  ctx.fillRect(0 * pSize, -5 * pSize, 2 * pSize, 2 * pSize);  // right joint

  ctx.restore();
}

