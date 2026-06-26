// NetworkManager - Client-side WebSocket connection handler
export class NetworkManager {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.connectionState = 'disconnected'; // disconnected | connecting | connected | reconnecting
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // 3 seconds
    this.messageHandlers = new Map(); // messageType -> handler[]
    this.pendingMessages = []; // Queue of messages to send when reconnected
    this.reconnectTimer = null;
  }

  // Establish WebSocket connection
  connect() {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      console.log('Already connected or connecting');
      return;
    }

    this.connectionState = 'connecting';
    this.emit('connecting');

    try {
      this.ws = new WebSocket(this.serverUrl);
      
      this.ws.onopen = () => this.handleOpen();
      this.ws.onclose = (event) => this.handleClose(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onmessage = (event) => this.handleMessage(event);
      
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.connectionState = 'disconnected';
      this.emit('error', error);
    }
  }

  // Clean disconnect
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.reconnectAttempts = 0;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.connectionState = 'disconnected';
    this.emit('disconnected');
  }

  // Send a typed message to the server
  send(messageType, payload = {}) {
    const message = {
      type: messageType,
      payload
    };

    if (this.connectionState !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`Queueing message ${messageType} (not connected)`);
      this.pendingMessages.push(message);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
      console.log(`Sent ${messageType}:`, payload);
    } catch (error) {
      console.error(`Failed to send ${messageType}:`, error);
      this.pendingMessages.push(message);
    }
  }

  // Register a message handler
  on(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType).push(handler);
  }

  // Unregister a message handler
  off(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) return;
    
    const handlers = this.messageHandlers.get(messageType);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  // Emit an event to registered handlers
  emit(messageType, data = null) {
    if (!this.messageHandlers.has(messageType)) return;
    
    const handlers = this.messageHandlers.get(messageType);
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in handler for ${messageType}:`, error);
      }
    }
  }

  // Handle WebSocket open event
  handleOpen() {
    console.log('WebSocket connected');
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.emit('connected');
    
    // Flush pending messages
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      this.ws.send(JSON.stringify(message));
      console.log(`Sent queued message: ${message.type}`);
    }
  }

  // Handle WebSocket close event
  handleClose(event) {
    console.log(`WebSocket closed: ${event.code} ${event.reason}`);
    
    const wasConnected = this.connectionState === 'connected';
    this.connectionState = 'disconnected';
    
    if (wasConnected && event.code !== 1000) {
      // Unexpected disconnection, attempt to reconnect
      this.attemptReconnect();
    } else {
      this.emit('disconnected');
    }
  }

  // Handle WebSocket error event
  handleError(error) {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  // Handle incoming message
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      // Acknowledge receipt (within 100ms as per requirement)
      if (message.type !== 'CONNECTED') {
        console.log(`Received ${message.type}`);
      }
      
      // Route to registered handlers
      this.emit(message.type, message.payload);
      
    } catch (error) {
      console.error('Failed to parse message:', error);
      this.emit('error', { type: 'parse_error', error });
    }
  }

  // Attempt to reconnect
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      this.connectionState = 'disconnected';
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    this.connectionState = 'reconnecting';
    this.emit('reconnecting', { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts });
    
    console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  // Get connection state
  getState() {
    return {
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      pendingMessages: this.pendingMessages.length
    };
  }
}
