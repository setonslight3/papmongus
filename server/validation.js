// Validation Module - Server-side anti-cheat validation

class ValidationModule {
  // Validate movement (prevent speed hacks)
  static validateMovement(prevPos, newPos, deltaTime, maxSpeed = 3.5) {
    if (!prevPos || !newPos || !deltaTime) {
      return { valid: false, reason: 'Missing parameters' };
    }

    const distance = Math.sqrt(
      Math.pow(newPos.x - prevPos.x, 2) + Math.pow(newPos.y - prevPos.y, 2)
    );

    // Calculate max allowed distance (60 FPS assumption)
    const maxDistance = maxSpeed * (deltaTime / 1000) * 60;
    const tolerance = maxDistance * 1.2; // 20% tolerance for lag

    if (distance > tolerance) {
      return {
        valid: false,
        reason: 'speed_hack',
        distance: distance,
        maxAllowed: tolerance
      };
    }

    return { valid: true };
  }

  // Validate kill attempt
  static validateKill(killer, victim, gameState) {
    // Check if killer is impostor
    if (!killer.isImpostor) {
      return { valid: false, reason: 'not_impostor' };
    }

    // Check if victim is alive
    if (!victim.isAlive) {
      return { valid: false, reason: 'already_dead' };
    }

    // Check distance (kill range = 60 pixels)
    const distance = Math.sqrt(
      Math.pow(killer.x - victim.x, 2) + Math.pow(killer.y - victim.y, 2)
    );

    if (distance > 60) {
      return { valid: false, reason: 'too_far', distance: distance };
    }

    // Check cooldown
    if (killer.killCooldown > 0) {
      return { valid: false, reason: 'on_cooldown', cooldown: killer.killCooldown };
    }

    return { valid: true };
  }

  // Validate vote
  static validateVote(playerId, targetId, meetingState, gameState) {
    // Check if meeting is active
    if (!meetingState) {
      return { valid: false, reason: 'no_active_meeting' };
    }

    // Check if player already voted
    if (meetingState.votes.has(playerId)) {
      return { valid: false, reason: 'already_voted' };
    }

    // Check if target is valid (alive player or 'skip')
    if (targetId !== 'skip') {
      const target = gameState.getPlayer(targetId);
      if (!target || !target.isAlive) {
        return { valid: false, reason: 'invalid_target' };
      }
    }

    return { valid: true };
  }

  // Validate room code format
  static validateRoomCode(code) {
    if (typeof code !== 'string') {
      return { valid: false, reason: 'invalid_type' };
    }

    if (code.length !== 6) {
      return { valid: false, reason: 'invalid_length' };
    }

    const validChars = /^[ABCDEFGHJKLMNPQRTUVWXY346789]{6}$/;
    if (!validChars.test(code)) {
      return { valid: false, reason: 'invalid_characters' };
    }

    return { valid: true };
  }

  // Validate message payload size
  static validatePayloadSize(data, maxSize = 10240) { // 10KB max
    const size = JSON.stringify(data).length;
    
    if (size > maxSize) {
      return { valid: false, reason: 'payload_too_large', size: size, maxSize: maxSize };
    }

    return { valid: true };
  }
}

// Rate limiter for connection attempts
class RateLimiter {
  constructor(maxAttempts = 5, windowMs = 60000) { // 5 attempts per minute
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map(); // ip -> [timestamps]
  }

  // Check if IP is rate limited
  isRateLimited(ip) {
    const now = Date.now();
    const attempts = this.attempts.get(ip) || [];
    
    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(timestamp => now - timestamp < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return true;
    }

    // Record this attempt
    recentAttempts.push(now);
    this.attempts.set(ip, recentAttempts);
    
    return false;
  }

  // Clean up old entries periodically
  cleanup() {
    const now = Date.now();
    
    for (const [ip, attempts] of this.attempts.entries()) {
      const recentAttempts = attempts.filter(timestamp => now - timestamp < this.windowMs);
      
      if (recentAttempts.length === 0) {
        this.attempts.delete(ip);
      } else {
        this.attempts.set(ip, recentAttempts);
      }
    }
  }
}

module.exports = { ValidationModule, RateLimiter };
