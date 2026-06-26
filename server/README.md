# Papmongus Multiplayer Server

WebSocket server for real-time multiplayer Among Us gameplay.

## Deployment to Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your GitHub repository
4. Set build command: `cd server && npm install`
5. Set start command: `node server/server.js`
6. Set environment variables:
   - `PORT`: Auto-set by Render
   - `NODE_ENV`: production

## Local Development

```bash
cd server
npm install
npm start
```

Server runs on `http://localhost:3000`
- WebSocket: `ws://localhost:3000`
- Health check: `http://localhost:3000/health`

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Features

- Room-based matchmaking with 6-character codes
- Real-time state synchronization (20Hz)
- Server-authoritative validation
- Automatic cleanup of stale rooms
- Rate limiting
- Graceful shutdown handling
