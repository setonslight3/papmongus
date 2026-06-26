# Requirements Document

## Introduction

This document specifies the requirements for adding online multiplayer functionality to the papmongus game (Among Us clone). The feature will enable remote players to join the same game session over the internet and play together in real-time, replacing or complementing the current local co-op mode where two players share the same keyboard.

The multiplayer system needs to synchronize game state (player positions, tasks, kills, meetings, votes) across all connected clients while maintaining the core gameplay mechanics of the existing single-player game.

## Glossary

- **Game_Client**: The browser-based JavaScript application running on a player's device
- **Game_Server**: The backend WebSocket server that manages game sessions and state synchronization
- **Room**: A game session that multiple players can join, identified by a unique code
- **Room_Code**: A 6-character alphanumeric identifier for a game session
- **Host**: The player who creates a room and has authority to start the game
- **Player_Nickname**: A display name chosen by the player (not requiring account creation)
- **Game_State**: The authoritative representation of all game data including player positions, roles, tasks, and voting
- **WebSocket_Connection**: A persistent bidirectional communication channel between Game_Client and Game_Server
- **State_Synchronization**: The process of keeping Game_State consistent across all connected clients
- **Backend_Service**: A cloud-hosted Node.js server (e.g., on Render) that hosts Game_Server
- **Database**: A persistent storage system (e.g., Supabase) for optional features like statistics

## Requirements

### Requirement 1: Room Creation and Joining

**User Story:** As a player, I want to create or join game rooms using simple codes, so that I can play with friends without creating an account.

#### Acceptance Criteria

1. WHEN a player clicks "Create Room", THE Game_Client SHALL generate a unique Room_Code and display it
2. WHEN a Room_Code is generated, THE Game_Server SHALL create a new Room with the player as Host
3. WHEN a player enters a Room_Code and clicks "Join Room", THE Game_Client SHALL connect to the specified Room
4. IF a Room_Code does not exist, THEN THE Game_Server SHALL return an error message "Room not found"
5. IF a Room is full (has 10 players), THEN THE Game_Server SHALL reject join requests with message "Room is full"
6. THE Room_Code SHALL be exactly 6 characters using uppercase letters and digits
7. WHEN a Room is created, THE Game_Server SHALL keep the Room active for 2 hours or until all players disconnect

### Requirement 2: Player Identity Without Accounts

**User Story:** As a player, I want to choose a nickname without creating an account, so that I can quickly join games with minimal friction.

#### Acceptance Criteria

1. WHEN a player first launches the game, THE Game_Client SHALL prompt for a Player_Nickname
2. THE Game_Client SHALL store the Player_Nickname locally in browser storage
3. THE Player_Nickname SHALL be between 1 and 15 characters long
4. WHEN a player joins a Room, THE Game_Client SHALL send the Player_Nickname to Game_Server
5. IF a Player_Nickname is already taken in a Room, THEN THE Game_Server SHALL append a number suffix (e.g., "Player", "Player2")
6. THE Game_Client SHALL allow players to change their Player_Nickname before joining a Room

### Requirement 3: Real-Time Game State Synchronization

**User Story:** As a player, I want my actions to be immediately visible to other players, so that the game feels responsive and fair.

#### Acceptance Criteria

1. WHEN a player moves, THE Game_Client SHALL send position updates to Game_Server at 20 updates per second
2. WHEN Game_Server receives a position update, THE Game_Server SHALL broadcast it to all other players in the Room within 50 milliseconds
3. WHEN a player completes a task, THE Game_Client SHALL send the task completion event to Game_Server immediately
4. WHEN Game_Server receives a task completion, THE Game_Server SHALL update the task progress bar for all players in the Room
5. WHEN an impostor performs a kill, THE Game_Client SHALL send the kill event to Game_Server immediately
6. WHEN Game_Server receives a kill event, THE Game_Server SHALL validate the kill (distance, cooldown) and broadcast to all players if valid
7. IF Game_Server detects a kill event is invalid, THEN THE Game_Server SHALL reject it and log the attempt
8. WHEN a player reports a body or calls an emergency meeting, THE Game_Server SHALL immediately transition all players to the meeting state

### Requirement 4: WebSocket Communication Infrastructure

**User Story:** As a developer, I want reliable real-time communication between clients and server, so that game state remains synchronized.

#### Acceptance Criteria

1. THE Game_Client SHALL establish a WebSocket_Connection to Game_Server when creating or joining a Room
2. WHEN a WebSocket_Connection is lost, THE Game_Client SHALL attempt to reconnect every 3 seconds for up to 5 attempts
3. IF reconnection fails after 5 attempts, THEN THE Game_Client SHALL display "Disconnected from game" and return to main menu
4. WHEN a player disconnects during a game, THE Game_Server SHALL notify remaining players within 5 seconds
5. THE Game_Server SHALL remove disconnected players from the Room after 30 seconds without reconnection
6. THE WebSocket_Connection SHALL use JSON format for all message payloads
7. WHEN Game_Server sends a message, THE Game_Client SHALL acknowledge receipt within 100 milliseconds

### Requirement 5: Backend Server Deployment

**User Story:** As a developer, I want to deploy the game server to a cloud platform, so that players can connect from anywhere.

#### Acceptance Criteria

1. THE Backend_Service SHALL be a Node.js application using the ws (WebSocket) library
2. THE Backend_Service SHALL be deployable to Render (or similar PaaS platform)
3. THE Backend_Service SHALL expose a WebSocket endpoint at wss://[domain]/game
4. THE Backend_Service SHALL support at least 50 concurrent connections
5. WHEN Backend_Service starts, THE Backend_Service SHALL log "Server ready" with the WebSocket port number
6. THE Backend_Service SHALL implement health check endpoint at /health for platform monitoring
7. THE Backend_Service SHALL automatically restart if it crashes

### Requirement 6: Lobby and Waiting Room

**User Story:** As a host, I want to configure game settings and see who joined before starting, so that I can ensure everyone is ready.

#### Acceptance Criteria

1. WHEN a Room is created, THE Game_Server SHALL initialize the Room in "WAITING" state
2. WHILE a Room is in "WAITING" state, THE Host SHALL be able to adjust game settings (player speed, kill cooldown, bot count)
3. WHEN a player joins the Room, THE Game_Server SHALL broadcast the updated player list to all connected players
4. THE Game_Client SHALL display all players in the Room with their chosen colors and nicknames
5. WHEN the Host clicks "Start Game", THE Game_Server SHALL transition the Room to "PLAYING" state if at least 4 players are connected
6. IF fewer than 4 players are connected, THEN THE Game_Server SHALL reject the start request with message "Need at least 4 players"
7. WHEN the game starts, THE Game_Server SHALL randomly assign impostor roles according to configured settings

### Requirement 7: Color and Customization Synchronization

**User Story:** As a player, I want to choose my character color and cosmetics, so that I can express my identity in the game.

#### Acceptance Criteria

1. WHEN a player joins a Room, THE Game_Client SHALL send the player's preferred color to Game_Server
2. IF the preferred color is already taken, THEN THE Game_Server SHALL assign the next available color
3. THE Game_Client SHALL display a color picker in the waiting room with available colors highlighted
4. WHEN a player changes color, THE Game_Server SHALL broadcast the color change to all players if the color is available
5. WHEN a player equips a hat or cosmetic, THE Game_Client SHALL send the cosmetic selection to Game_Server
6. THE Game_Server SHALL synchronize equipped cosmetics to all players for rendering

### Requirement 8: Meeting and Voting Synchronization

**User Story:** As a player, I want to participate in meetings and vote to eject players, so that crewmates can eliminate impostors.

#### Acceptance Criteria

1. WHEN a meeting is triggered, THE Game_Server SHALL lock all player positions and disable movement
2. THE Game_Server SHALL start a 60-second discussion timer visible to all players
3. WHEN the discussion timer expires, THE Game_Server SHALL start a 30-second voting timer
4. WHILE the voting timer is active, THE Game_Client SHALL allow each player to cast one vote or skip
5. WHEN a player casts a vote, THE Game_Client SHALL send the vote to Game_Server immediately
6. WHEN voting ends, THE Game_Server SHALL tally votes and determine ejection based on majority
7. IF there is a tie, THEN THE Game_Server SHALL skip ejection
8. WHEN voting results are determined, THE Game_Server SHALL broadcast the results and ejected player (if any) to all players
9. WHEN the ejection animation completes, THE Game_Server SHALL transition the Room back to "PLAYING" state

### Requirement 9: Game End Conditions

**User Story:** As a player, I want the game to end when victory conditions are met, so that we can start a new round.

#### Acceptance Criteria

1. WHEN all tasks are completed by crewmates, THE Game_Server SHALL end the game with "CREWMATES_WIN" result
2. WHEN the number of impostors equals or exceeds the number of crewmates, THE Game_Server SHALL end the game with "IMPOSTORS_WIN" result
3. WHEN all impostors are ejected or killed, THE Game_Server SHALL end the game with "CREWMATES_WIN" result
4. WHEN the game ends, THE Game_Server SHALL broadcast the end result and reveal all player roles to all players
5. THE Game_Client SHALL display a victory or defeat screen for 10 seconds
6. WHEN the victory screen closes, THE Game_Server SHALL return the Room to "WAITING" state for a new round

### Requirement 10: Network Security and Anti-Cheat (Basic)

**User Story:** As a developer, I want basic protections against cheating and abuse, so that gameplay remains fair.

#### Acceptance Criteria

1. THE Game_Server SHALL validate all player movement updates to ensure speed does not exceed maximum allowed speed
2. THE Game_Server SHALL validate all kill attempts to ensure target is within kill range and impostor is not on cooldown
3. IF Game_Server detects an invalid action, THEN THE Game_Server SHALL reject the action and not broadcast it
4. THE Game_Server SHALL rate-limit connection attempts to 5 per IP address per minute to prevent spam
5. THE Game_Server SHALL validate Room_Code format before processing join requests
6. THE WebSocket_Connection SHALL use secure WebSocket (wss://) in production

### Requirement 11: Error Handling and Graceful Degradation

**User Story:** As a player, I want clear error messages when something goes wrong, so that I understand what happened.

#### Acceptance Criteria

1. WHEN a network error occurs, THE Game_Client SHALL display a user-friendly error message
2. IF a player is kicked for inactivity (no input for 5 minutes), THEN THE Game_Server SHALL send "KICKED_INACTIVE" message before disconnecting
3. WHEN Game_Server cannot process a request, THE Game_Server SHALL send an error response with a descriptive message
4. IF Game_Client receives an unexpected message format, THEN THE Game_Client SHALL log the error and continue operation
5. THE Game_Client SHALL handle partial disconnections gracefully by freezing remote player positions until reconnection

### Requirement 12: Optional Database Integration

**User Story:** As a developer, I want the option to add persistent features like statistics, so that I can enhance the game in future updates.

#### Acceptance Criteria

1. THE Backend_Service SHALL optionally connect to a Database (e.g., Supabase PostgreSQL)
2. WHERE Database is connected, THE Game_Server SHALL log completed games with players and results
3. WHERE Database is connected, THE Game_Server SHALL track player statistics (games played, wins, tasks completed)
4. IF Database connection fails, THEN THE Backend_Service SHALL continue operating without persistence features
5. THE Database connection string SHALL be configurable via environment variable

### Requirement 13: Backward Compatibility with Single-Player

**User Story:** As a player, I want to still play single-player or local co-op modes, so that I can play offline.

#### Acceptance Criteria

1. THE Game_Client SHALL retain the existing "Single Player" and "Local Co-op" modes
2. WHEN playing in single-player mode, THE Game_Client SHALL not establish a WebSocket_Connection
3. THE Game_Client SHALL display "Online Multiplayer", "Local Co-op", and "Single Player" as separate options
4. WHEN playing offline modes, THE Game_Client SHALL function identically to the current implementation

