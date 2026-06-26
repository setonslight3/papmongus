# Implementation Plan: Online Multiplayer

## Overview

This implementation plan converts the online multiplayer design into consolidated coding tasks. The system will add real-time WebSocket-based multiplayer functionality to the papmongus game.

## Tasks

- [x] 1. Backend Server Infrastructure (COMPLETED)
  - Set up Node.js WebSocket server with ws library
  - Create server.js with health check endpoint
  - Implement graceful shutdown handlers
  - Create RoomManager with room code generation, join/leave logic, and cleanup
  - _Requirements: 5.1-5.5, 1.1-1.7_

- [x] 2. Backend Game State Management
  - Create StateManager with GameState and PlayerState data structures
  - Implement game initialization with role assignment
  - Add position update handling with validation
  - Implement gameplay action handlers (kills, tasks, meetings, votes)
  - Add win condition checking
  - _Requirements: 3.1-3.8, 6.7, 9.1-9.4_

- [x] 3. Backend Message Routing & Validation
  - Wire up message routing in server.js for all message types
  - Implement connection lifecycle handlers (disconnect, reconnect, errors)
  - Create validation module (movement, kills, votes)
  - Add rate limiting and input sanitization
  - Implement room management message handlers (create, join, leave, start)
  - Implement gameplay message handlers (position, kill, task, meeting, vote)
  - Add customization handlers (color, cosmetics)
  - _Requirements: 4.4-4.7, 6.1-6.5, 10.1-10.5, 11.1-11.4_

- [x] 4. Client Network Manager (COMPLETED)
  - Create NetworkManager class with WebSocket connection
  - Implement connection lifecycle and reconnection logic (5 attempts, 3s intervals)
  - Add message sending/routing with queue for disconnections
  - _Requirements: 4.1-4.3, 4.6-4.7_

- [ ] 5. Client RemotePlayer & GameEngine Integration
  - Create RemotePlayer entity class with position interpolation
  - Add multiplayer properties to GameEngine (isMultiplayer, networkManager, roomCode, remotePlayers)
  - Implement multiplayer mode initialization
  - Add room creation and joining flows
  - Implement position update sending (throttled to 20Hz)
  - Add remote position update handling
  - Implement gameplay action sending (kill, task, meeting, report)
  - Add remote action event handling
  - Update rendering to draw remote players with interpolation
  - Implement leave room cleanup
  - _Requirements: 3.1-3.2, 13.1-13.3_

- [x] 6. Client Multiplayer UI
  - Create multiplayer-ui.js with room creation/join screens
  - Build lobby/waiting room UI with player list and room code display
  - Add host controls (settings, kick, start game)
  - Implement connection status and error displays
  - Wire multiplayer UI to main menu (add "Online Multiplayer" button)
  - _Requirements: 1.1-1.5, 6.1-6.4, 11.1_

- [x] 7. Meeting & Voting Synchronization
  - Implement meeting start synchronization (lock positions, start timers)
  - Create voting UI with player buttons and skip option
  - Handle vote casting and results display
  - Show ejection results and transition back to playing
  - _Requirements: 8.1-8.9_

- [x] 8. Color & Cosmetic Synchronization
  - Add color selection to lobby with availability checking
  - Implement cosmetic selection UI in lobby
  - Synchronize color/cosmetic changes across clients
  - _Requirements: 7.1-7.6_

- [x] 9. Deployment & Production Config
  - Create Procfile and deployment scripts for Render
  - Configure environment variables (PORT, NODE_ENV)
  - Set up secure WebSocket (wss://) for production
  - Add server URL configuration in client
  - _Requirements: 5.2-5.3, 10.6_

- [x] 10. Optional Database Integration
  - Create database.js with Supabase connection
  - Implement graceful fallback if DB unavailable
  - Add game statistics logging (completed games, player stats)
  - _Requirements: 12.1-12.5_

- [x] 11. Testing & Polish
  - Test complete flow: create → join → play → meeting → vote → end
  - Test disconnection and reconnection handling
  - Verify backward compatibility (single-player and local co-op work)
  - Fix any bugs and polish UI

## Notes

- Tasks 1 and 4 are already complete
- Each task now consolidates multiple sub-tasks for faster execution
- Task 10 (database) is optional for MVP
- Testing task covers end-to-end validation

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1"]
    },
    {
      "id": 1,
      "tasks": ["2", "3", "4"]
    },
    {
      "id": 2,
      "tasks": ["5", "6"]
    },
    {
      "id": 3,
      "tasks": ["7", "8"]
    },
    {
      "id": 4,
      "tasks": ["9", "10", "11"]
    }
  ]
}
```
