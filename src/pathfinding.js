// A* Pathfinding implementation for papmongus AI bots
import { MAP_COLS, MAP_ROWS } from './config.js';

class PathNode {
  constructor(col, row, parent = null, gCost = 0, hCost = 0) {
    this.col = col;
    this.row = row;
    this.parent = parent;
    this.gCost = gCost; // Cost from start
    this.hCost = hCost; // Heuristic cost to end
  }

  get fCost() {
    return this.gCost + this.hCost;
  }
}

/**
 * Solves A* pathfinding on the map grid.
 * Returns an array of grid coordinates [{col, row}] from start to end, or empty if no path.
 */
export function findPath(startCol, startRow, endCol, endRow, gameMap) {
  // If start or end is out of bounds or inside a wall, fail immediately
  if (gameMap.isSolid(startCol, startRow) || gameMap.isSolid(endCol, endRow)) {
    return [];
  }

  const openSet = [];
  const closedSet = new Set();

  const startNode = new PathNode(startCol, startRow, null, 0, manhattanDist(startCol, startRow, endCol, endRow));
  openSet.push(startNode);

  const getClosedSetKey = (col, row) => `${col},${row}`;

  // Limit iterations to prevent freezing if path is blocked or extremely long
  let iterations = 0;
  const maxIterations = 800;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest fCost
    let currentIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].fCost < openSet[currentIndex].fCost || 
         (openSet[i].fCost === openSet[currentIndex].fCost && openSet[i].hCost < openSet[currentIndex].hCost)) {
        currentIndex = i;
      }
    }

    const currentNode = openSet[currentIndex];

    // Check if reached destination
    if (currentNode.col === endCol && currentNode.row === endRow) {
      const path = [];
      let curr = currentNode;
      while (curr !== null) {
        path.push({ col: curr.col, row: curr.row });
        curr = curr.parent;
      }
      return path.reverse(); // Return path from start to end
    }

    // Move current node from open to closed
    openSet.splice(currentIndex, 1);
    closedSet.add(getClosedSetKey(currentNode.col, currentNode.row));

    // Get 4-directional neighbors
    const directions = [
      { col: 0, row: -1 }, // Up
      { col: 0, row: 1 },  // Down
      { col: -1, row: 0 }, // Left
      { col: 1, row: 0 }   // Right
    ];

    for (const dir of directions) {
      const neighborCol = currentNode.col + dir.col;
      const neighborRow = currentNode.row + dir.row;

      // Skip if out of bounds or solid wall
      if (neighborCol < 0 || neighborCol >= MAP_COLS || neighborRow < 0 || neighborRow >= MAP_ROWS) continue;
      if (gameMap.isSolid(neighborCol, neighborRow)) continue;

      // Skip if already evaluated
      if (closedSet.has(getClosedSetKey(neighborCol, neighborRow))) continue;

      const gScore = currentNode.gCost + 1; // Orthogonal step cost is 1
      const hScore = manhattanDist(neighborCol, neighborRow, endCol, endRow);
      
      // Check if neighbor is already in openSet
      let existingNode = openSet.find(node => node.col === neighborCol && node.row === neighborRow);

      if (!existingNode) {
        const neighborNode = new PathNode(neighborCol, neighborRow, currentNode, gScore, hScore);
        openSet.push(neighborNode);
      } else if (gScore < existingNode.gCost) {
        // Found a better path to this node
        existingNode.gCost = gScore;
        existingNode.parent = currentNode;
      }
    }
  }

  return []; // Return empty path if search limits hit or target unreachable
}

function manhattanDist(col1, row1, col2, row2) {
  return Math.abs(col1 - col2) + Math.abs(row1 - row2);
}
