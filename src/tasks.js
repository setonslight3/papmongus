// Tasks orchestration for papmongus
import { TILE_SIZE } from './config.js';

/**
 * Returns the task closest to the player's position, if within interaction range.
 */
export function getClosestTask(player, range = 45) {
  if (player.isImpostor || player.isDead || !player.tasks) return null;

  let closestTask = null;
  let minDist = range;

  player.tasks.forEach(task => {
    if (task.completed) return;
    
    const dx = player.x - task.x;
    const dy = player.y - task.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      closestTask = task;
    }
  });

  return closestTask;
}

/**
 * Redraws the tasks list on the HUD based on completion status.
 */
export function updateTasksHUD(tasks, playerHUDContainerId) {
  const container = document.getElementById(playerHUDContainerId);
  if (!container) return;

  container.innerHTML = '';

  tasks.forEach(task => {
    const li = document.createElement('div');
    li.className = `task-hud-item ${task.completed ? 'completed' : ''}`;
    
    // Colored dot indicator
    const dot = document.createElement('span');
    dot.className = `task-dot ${task.completed ? 'green' : 'yellow'}`;
    li.appendChild(dot);

    const text = document.createElement('span');
    text.innerText = `[${task.room}] ${task.name}`;
    li.appendChild(text);

    container.appendChild(li);
  });
}

/**
 * Calculates total completion percentage for all tasks.
 */
export function getTaskProgress(tasks) {
  if (tasks.length === 0) return 0;
  const completedCount = tasks.filter(t => t.completed).length;
  return (completedCount / tasks.length) * 100;
}
