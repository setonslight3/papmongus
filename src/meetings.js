// Meeting and voting logic with Bot AI discussion for papmongus
import { COLORS } from './config.js';

const COLORS_REVERSE = {
  '#ff1a1a': 'red',
  '#1a53ff': 'blue',
  '#1acc33': 'green',
  '#ffdb1a': 'yellow',
  '#a61aff': 'purple',
  '#ff881a': 'orange',
  '#1affd8': 'cyan',
  '#ff1ae2': 'pink',
  '#ffffff': 'white',
  '#111111': 'black'
};

let meetingTimer = null;
let timeLeft = 30;
let onMeetingComplete = null;

let meetingState = {
  entities: [],       // list of all game players and bots
  reporter: null,     // entity who reported the body or hit the button
  votes: {},          // key: entity.id, value: targetEntityId or 'skip'
  hasVoted: {},       // key: entity.id, value: boolean
  chatMessages: [],   // lines in the discussion log
  isResolved: false
};

const BOT_PHRASES_SUSPICIOUS = [
  "I saw {suspect} near the body in {room}!",
  "It's {suspect}! I saw them venting in {room}!",
  "{suspect} was running away from the body in {room}!",
  "I'm voting {suspect}. They are behaving very sus.",
  "Trust me, it is {suspect}."
];

const BOT_PHRASES_INNOCENT = [
  "I was doing wiring tasks in {room}. I think we skip.",
  "Where was the body? Skip for me.",
  "I didn't see anyone. Let's skip.",
  "I was with {friend} in {room}, they are safe.",
  "No evidence, let's skip voting."
];

export function initMeetingUI() {
  document.getElementById('skip-vote-btn').addEventListener('click', () => {
    castVote('P1', 'skip');
  });
  
  document.getElementById('skip-vote-btn-p2').addEventListener('click', () => {
    castVote('P2', 'skip');
  });

  // Player chat input
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');

  const sendPlayerMessage = () => {
    const msg = chatInput.value.trim();
    if (!msg) return;

    // Find which player is alive and can chat
    const p1 = meetingState.entities.find(e => e.id === 'P1');
    if (p1 && !p1.isDead) {
      addChatMessage(p1.nickname, p1.color, msg);
      handlePlayerChatMessage(msg);
    } else {
      const p2 = meetingState.entities.find(e => e.id === 'P2');
      if (p2 && !p2.isDead) {
        addChatMessage(p2.nickname, p2.color, msg);
        handlePlayerChatMessage(msg);
      }
    }
    chatInput.value = '';
  };

  chatSendBtn.addEventListener('click', sendPlayerMessage);
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Prevent game controls from firing while typing
    if (e.key === 'Enter') {
      sendPlayerMessage();
    }
  });
  // Prevent WASD/arrow keys from moving player while typing
  chatInput.addEventListener('keyup', (e) => e.stopPropagation());
}

export function startMeeting(entities, reporter, bodyFound, onComplete, reportedBody = null) {
  onMeetingComplete = onComplete;
  timeLeft = 25;
  
  meetingState = {
    entities: entities,
    reporter: reporter,
    votes: {},
    hasVoted: {},
    chatMessages: [],
    isResolved: false
  };

  // Open meeting panel UI
  const meetingPanel = document.getElementById('meeting-overlay');
  meetingPanel.classList.remove('hidden');
  
  document.getElementById('meeting-title-text').innerText = bodyFound 
    ? `DEAD BODY REPORTED BY ${reporter.nickname.toUpperCase()}`
    : `EMERGENCY MEETING CALLED BY ${reporter.nickname.toUpperCase()}`;

  // Clear previous chat
  const chatBox = document.getElementById('meeting-chat-box');
  chatBox.innerHTML = '';

  // Setup Player 2 skip controls based on game mode
  const coOpMode = entities.some(e => e.id === 'P2');
  document.getElementById('skip-vote-btn-p2').classList.toggle('hidden', !coOpMode);

  // Calculate suspicions based on proximity to reported body
  let suspectEntity = null;
  if (bodyFound && reportedBody) {
    let minDistance = 999999;
    entities.forEach(ent => {
      if (!ent.isDead && ent.id !== reporter.id) {
        const dist = Math.sqrt((ent.x - reportedBody.x)**2 + (ent.y - reportedBody.y)**2);
        if (dist < minDistance) {
          minDistance = dist;
          suspectEntity = ent;
        }
      }
    });
  }

  buildVotingCards();
  startTimer();
  runBotDiscussion(bodyFound, suspectEntity);
}

function buildVotingCards() {
  const grid = document.getElementById('meeting-grid');
  grid.innerHTML = '';

  meetingState.entities.forEach(entity => {
    const card = document.createElement('div');
    card.className = `vote-card ${entity.isDead ? 'dead' : ''}`;
    card.id = `vote-card-${entity.id}`;

    // Top row: Avatar + Name + Badge
    const topRow = document.createElement('div');
    topRow.className = 'vote-card-top';

    // Avatar container
    const avatar = document.createElement('div');
    avatar.className = 'vote-avatar';
    avatar.style.backgroundColor = entity.color;
    const visor = document.createElement('div');
    visor.className = 'vote-visor';
    avatar.appendChild(visor);
    topRow.appendChild(avatar);

    // Nickname
    const nameText = document.createElement('div');
    nameText.className = 'vote-name';
    nameText.innerText = entity.nickname;
    if (entity.isImpostor && entity.id.startsWith('P')) {
      nameText.style.color = '#ff4d4d';
    }
    topRow.appendChild(nameText);

    // Voting state badge
    const badge = document.createElement('div');
    badge.className = 'vote-badge';
    badge.id = `vote-badge-${entity.id}`;
    if (entity.isDead) {
      badge.innerText = 'DEAD';
      badge.className += ' dead';
    }
    topRow.appendChild(badge);

    card.appendChild(topRow);

    // Bottom row: Vote buttons
    if (!entity.isDead) {
      const btnContainer = document.createElement('div');
      btnContainer.className = 'vote-action-buttons';

      // P1 Vote Button
      const vBtn1 = document.createElement('button');
      vBtn1.className = 'vote-p1-btn';
      vBtn1.innerText = 'VOTE (P1)';
      vBtn1.addEventListener('click', (e) => {
        e.stopPropagation();
        castVote('P1', entity.id);
      });
      btnContainer.appendChild(vBtn1);

      // P2 Vote Button (if active)
      const hasP2 = meetingState.entities.some(ent => ent.id === 'P2');
      if (hasP2) {
        const vBtn2 = document.createElement('button');
        vBtn2.className = 'vote-p2-btn';
        vBtn2.innerText = 'VOTE (P2)';
        vBtn2.addEventListener('click', (e) => {
          e.stopPropagation();
          castVote('P2', entity.id);
        });
        btnContainer.appendChild(vBtn2);
      }

      card.appendChild(btnContainer);
    }

    grid.appendChild(card);
  });
}

function addChatMessage(senderName, color, message) {
  const chatBox = document.getElementById('meeting-chat-box');
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-message';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'chat-sender';
  nameSpan.style.color = color;
  nameSpan.innerText = `${senderName}: `;

  const textSpan = document.createElement('span');
  textSpan.innerText = message;

  msgEl.appendChild(nameSpan);
  msgEl.appendChild(textSpan);
  chatBox.appendChild(msgEl);

  // Auto scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
}

function castVote(voterId, targetId) {
  // Can't vote if dead
  const voter = meetingState.entities.find(e => e.id === voterId);
  if (!voter || voter.isDead || meetingState.hasVoted[voterId]) return;

  meetingState.votes[voterId] = targetId;
  meetingState.hasVoted[voterId] = true;

  // Visual update (VOTED checkbox or badge)
  const badge = document.getElementById(`vote-badge-${voterId}`);
  if (badge) {
    badge.innerText = 'VOTED';
    badge.className = 'vote-badge voted';
  }

  // Check if all alive entities have voted
  checkAllVoted();
}

function checkAllVoted() {
  const aliveEntities = meetingState.entities.filter(e => !e.isDead);
  const allVoted = aliveEntities.every(e => meetingState.hasVoted[e.id]);

  if (allVoted) {
    resolveMeeting();
  }
}

function startTimer() {
  if (meetingTimer) clearInterval(meetingTimer);

  const timerEl = document.getElementById('meeting-timer');
  timerEl.innerText = `Voting Ends In: ${timeLeft}s`;

  meetingTimer = setInterval(() => {
    timeLeft--;
    timerEl.innerText = `Voting Ends In: ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearInterval(meetingTimer);
      resolveMeeting();
    }
  }, 1000);
}

function runBotDiscussion(bodyFound, suspectEntity) {
  // Let bots chat sequentially with small delays
  const bots = meetingState.entities.filter(e => e.id.startsWith('bot-') && !e.isDead);
  
  bots.forEach((bot, index) => {
    const delay = 1500 + index * (1500 + Math.random() * 1000); // Staggered delays
    
    setTimeout(() => {
      if (meetingState.isResolved) return;

      // Determine who this bot suspects
      let suspect = null;
      
      if (bot.isImpostor) {
        // Impostor bot wants to frame a crewmate!
        const aliveCrew = meetingState.entities.filter(e => !e.isImpostor && !e.isDead);
        if (aliveCrew.length > 0) {
          suspect = aliveCrew[Math.floor(Math.random() * aliveCrew.length)];
        }
      } else {
        // Crewmate bot suspicion logic:
        // 1. If they caught someone venting
        if (bot.suspicion) {
          suspect = meetingState.entities.find(e => e.id === bot.suspicion && !e.isDead);
        }
        // 2. Proximity to reported body
        if (!suspect && suspectEntity && suspectEntity.id !== bot.id) {
          if (Math.random() < 0.75) {
            suspect = suspectEntity;
          }
        }
      }

      let message = "";
      if (suspect) {
        // Accuse suspect
        const phrases = BOT_PHRASES_SUSPICIOUS;
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        message = phrase
          .replace('{suspect}', suspect.nickname)
          .replace('{room}', bot.lastSeenRoom || 'Corridor');
      } else {
        // Chat innocently / suggest skip
        const phrases = BOT_PHRASES_INNOCENT;
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        // Pick a random alive player as a friend placeholder
        const aliveOthers = meetingState.entities.filter(e => e.id !== bot.id && !e.isDead);
        const friend = aliveOthers.length > 0 ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)].nickname : 'someone';
        
        message = phrase
          .replace('{friend}', friend)
          .replace('{room}', bot.lastSeenRoom || 'Security');
      }

      addChatMessage(bot.nickname, bot.color, message);

      // Cast the bot's vote
      setTimeout(() => {
        if (meetingState.isResolved || meetingState.hasVoted[bot.id]) return;
        
        // Vote for the suspect, or 30% chance to skip if no suspect
        const voteTarget = suspect ? suspect.id : (Math.random() < 0.3 ? 'skip' : null);
        
        if (!voteTarget) {
          // If no vote target chosen, vote for a random other alive player (prevent always skipping)
          const voteable = meetingState.entities.filter(e => !e.isDead && e.id !== bot.id);
          if (voteable.length > 0) {
            castVote(bot.id, voteable[Math.floor(Math.random() * voteable.length)].id);
          } else {
            castVote(bot.id, 'skip');
          }
        } else {
          castVote(bot.id, voteTarget);
        }
      }, 800);

    }, delay);
  });
}

function handlePlayerChatMessage(msg) {
  const text = msg.toLowerCase();
  
  // Find all alive bots in this meeting
  const aliveBots = meetingState.entities.filter(e => e.id.startsWith('bot-') && !e.isDead);
  if (aliveBots.length === 0) return;

  // Let's check which bot the player is accusing
  let accusedBot = null;
  
  for (const bot of aliveBots) {
    const nameLower = bot.nickname.toLowerCase();
    const color = nameLower.split(' ')[0]; // gets "green" from "Green Bot"
    const hexColor = bot.color;
    const colorName = COLORS_REVERSE[hexColor] || '';
    
    if (text.includes(nameLower) || text.includes(color) || (colorName && text.includes(colorName))) {
      accusedBot = bot;
      break;
    }
  }

  if (accusedBot) {
    // A bot should agree in chat and cast their vote on the accused bot
    const otherBots = aliveBots.filter(b => b.id !== accusedBot.id && !meetingState.hasVoted[b.id]);
    if (otherBots.length > 0) {
      const helperBot = otherBots[Math.floor(Math.random() * otherBots.length)];
      
      setTimeout(() => {
        if (meetingState.isResolved || meetingState.hasVoted[helperBot.id]) return;
        
        const responses = [
          `Okay, I'll follow Player 1 and vote ${accusedBot.nickname}.`,
          `I trust Player 1. Voting ${accusedBot.nickname}.`,
          `Yeah, ${accusedBot.nickname} is pretty sus. Voting them.`,
          `Let's vote ${accusedBot.nickname} out then.`
        ];
        const reply = responses[Math.floor(Math.random() * responses.length)];
        addChatMessage(helperBot.nickname, helperBot.color, reply);
        
        // Cast helper bot's vote
        castVote(helperBot.id, accusedBot.id);
      }, 1000 + Math.random() * 1000);
    }
  }
}

function resolveMeeting() {
  if (meetingState.isResolved) return;
  meetingState.isResolved = true;

  if (meetingTimer) {
    clearInterval(meetingTimer);
    meetingTimer = null;
  }

  // Count votes
  const voteTallies = {}; // targetId: count
  let skipVotes = 0;

  Object.entries(meetingState.votes).forEach(([voterId, targetId]) => {
    if (targetId === 'skip') {
      skipVotes++;
    } else {
      voteTallies[targetId] = (voteTallies[targetId] || 0) + 1;
    }
  });

  // Find entity with maximum votes
  let ejectedId = null;
  let maxVotes = 0;
  let isTie = false;

  Object.entries(voteTallies).forEach(([targetId, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      ejectedId = targetId;
      isTie = false;
    } else if (count === maxVotes) {
      isTie = true;
    }
  });

  if (skipVotes >= maxVotes) {
    ejectedId = null; // Skipped
  } else if (isTie) {
    ejectedId = null; // Tie
  }

  // Get ejected entity
  const ejectedEntity = ejectedId ? meetingState.entities.find(e => e.id === ejectedId) : null;

  // --- VISUAL REVEAL PHASE ---
  // Disable further voting controls immediately
  document.querySelectorAll('.vote-action-buttons').forEach(el => el.innerHTML = '');
  const skipBtn1 = document.getElementById('skip-vote-btn');
  const skipBtn2 = document.getElementById('skip-vote-btn-p2');
  if (skipBtn1) skipBtn1.disabled = true;
  if (skipBtn2) skipBtn2.disabled = true;

  // Reveal player choices on cards
  meetingState.entities.forEach(entity => {
    if (entity.isDead) return;
    
    const card = document.getElementById(`vote-card-${entity.id}`);
    if (card) {
      const revealContainer = document.createElement('div');
      revealContainer.className = 'vote-reveal-container';
      
      // Find all voters who voted for this entity
      Object.entries(meetingState.votes).forEach(([voterId, targetId]) => {
        if (targetId === entity.id) {
          const voter = meetingState.entities.find(e => e.id === voterId);
          if (voter) {
            const dot = document.createElement('div');
            dot.className = 'vote-reveal-dot';
            dot.style.backgroundColor = voter.color;
            dot.title = voter.nickname;
            revealContainer.appendChild(dot);
          }
        }
      });
      card.appendChild(revealContainer);
    }
  });

  // Reveal skip votes in the footer
  const skipContainer = document.createElement('div');
  skipContainer.className = 'vote-reveal-container';
  skipContainer.style.marginTop = '10px';
  Object.entries(meetingState.votes).forEach(([voterId, targetId]) => {
    if (targetId === 'skip') {
      const voter = meetingState.entities.find(e => e.id === voterId);
      if (voter) {
        const dot = document.createElement('div');
        dot.className = 'vote-reveal-dot';
        dot.style.backgroundColor = voter.color;
        dot.title = voter.nickname;
        skipContainer.appendChild(dot);
      }
    }
  });
  
  const footer = document.querySelector('.meeting-footer');
  if (footer) {
    footer.appendChild(skipContainer);
  }

  // Wait 3.5 seconds to show results before closing meeting overlay
  setTimeout(() => {
    document.getElementById('meeting-overlay').classList.add('hidden');
    
    // Clean up disabled states and temporary footer elements for next meeting
    if (skipBtn1) skipBtn1.disabled = false;
    if (skipBtn2) skipBtn2.disabled = false;
    if (skipContainer.parentNode) {
      skipContainer.parentNode.removeChild(skipContainer);
    }

    if (onMeetingComplete) {
      onMeetingComplete({
        ejectedEntity,
        isSkip: ejectedEntity === null && !isTie,
        isTie
      });
    }
  }, 3500);
}
