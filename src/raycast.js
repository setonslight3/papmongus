// 2D Field of View Raycasting for papmongus
import { TILE_SIZE } from './config.js';

/**
 * Calculates a list of coordinates forming the visibility polygon for a player.
 * Shoots rays in 360 degrees and finds where they hit solid walls.
 */
export function getVisibilityPolygon(px, py, radius, gameMap) {
  const points = [];
  const rayCount = 180; // 180 rays = 2-degree increments, good balance between performance and accuracy
  const stepSize = 6;  // Step distance in pixels for ray marching

  for (let i = 0; i < rayCount; i++) {
    const angle = (i * 2 * Math.PI) / rayCount;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let dist = 0;
    let hitX = px;
    let hitY = py;
    let hitWall = false;

    // Ray march until we hit a wall or reach maximum vision radius
    while (dist < radius) {
      dist += stepSize;
      const nextX = px + cos * dist;
      const nextY = py + sin * dist;

      const col = Math.floor(nextX / TILE_SIZE);
      const row = Math.floor(nextY / TILE_SIZE);

      if (gameMap.isSolid(col, row)) {
        // We hit a wall!
        hitX = nextX;
        hitY = nextY;
        hitWall = true;
        break;
      }
    }

    if (!hitWall) {
      hitX = px + cos * radius;
      hitY = py + sin * radius;
    }

    points.push({ x: hitX, y: hitY });
  }

  return points;
}

/**
 * Clips the canvas rendering context to the player's visibility polygon.
 */
export function clipToVisibility(ctx, px, py, points, cameraOffset) {
  ctx.beginPath();
  if (points.length === 0) return;

  // Transform coordinates based on camera offset
  ctx.moveTo(points[0].x - cameraOffset.x, points[0].y - cameraOffset.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x - cameraOffset.x, points[i].y - cameraOffset.y);
  }
  ctx.closePath();
  ctx.clip();
}
