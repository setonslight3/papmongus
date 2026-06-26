let audioCtx = null;
let masterVolume = 0.5;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setVolume(vol) {
  masterVolume = Math.max(0, Math.min(1, vol));
}

export function playClick() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(masterVolume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playKill() {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    
    // Sawtooth slash sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    
    gain.gain.setValueAtTime(masterVolume * 0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);

    // Deep thud
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(120, t + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(30, t + 0.45);
    
    gain2.gain.setValueAtTime(masterVolume * 0.9, t + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.15);
    osc2.stop(t + 0.45);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playReport() {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    // Megaphone siren sound (alternating frequencies)
    const duration = 1.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    for (let i = 0; i < 6; i++) {
      const step = i * 0.2;
      osc.frequency.setValueAtTime(i % 2 === 0 ? 550 : 350, t + step);
    }
    
    gain.gain.setValueAtTime(masterVolume * 0.5, t);
    gain.gain.setValueAtTime(masterVolume * 0.5, t + duration - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playTaskProgress() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    
    gain.gain.setValueAtTime(masterVolume * 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playTaskComplete() {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    
    // Nice pleasant double beep
    const playBeep = (freq, startOffset, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + startOffset);
      gain.gain.setValueAtTime(masterVolume * 0.25, t + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.01, t + startOffset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + startOffset);
      osc.stop(t + startOffset + dur);
    };
    
    playBeep(659.25, 0, 0.12); // E5
    playBeep(880.00, 0.14, 0.25); // A5
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playSabotageAlert() {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(220, t + 0.3);
    osc.frequency.linearRampToValueAtTime(150, t + 0.6);
    
    gain.gain.setValueAtTime(masterVolume * 0.35, t);
    gain.gain.linearRampToValueAtTime(masterVolume * 0.35, t + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playVictory() {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    
    const playNote = (freq, delay, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(masterVolume * 0.35, t + delay);
      gain.gain.setValueAtTime(masterVolume * 0.35, t + delay + duration - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, t + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + duration);
    };

    // Upward arpeggio: C5 - E5 - G5 - C6
    playNote(523.25, 0, 0.15); // C5
    playNote(659.25, 0.12, 0.15); // E5
    playNote(783.99, 0.24, 0.15); // G5
    playNote(1046.50, 0.36, 0.8); // C6
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playDefeat() {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    
    const playNote = (freq, delay, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(masterVolume * 0.4, t + delay);
      gain.gain.linearRampToValueAtTime(masterVolume * 0.4, t + delay + duration - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, t + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + duration);
    };

    // Descending sad chord notes (minor): G4 - Eb4 - C4
    playNote(392.00, 0, 0.3); // G4
    playNote(311.13, 0.25, 0.3); // Eb4
    playNote(261.63, 0.5, 1.2); // C4
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}

export function playRoleReveal(isImpostor) {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    
    if (isImpostor) {
      // Impostor dramatic staccato chord & low drone
      // High pitch screech
      const oscScreech = ctx.createOscillator();
      const gainScreech = ctx.createGain();
      oscScreech.type = 'sawtooth';
      oscScreech.frequency.setValueAtTime(1500, t);
      oscScreech.frequency.exponentialRampToValueAtTime(180, t + 0.35);
      
      gainScreech.gain.setValueAtTime(masterVolume * 0.75, t);
      gainScreech.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      
      oscScreech.connect(gainScreech);
      gainScreech.connect(ctx.destination);
      oscScreech.start(t);
      oscScreech.stop(t + 0.35);
      
      // Deep suspenseful low drone
      const oscDrone = ctx.createOscillator();
      const gainDrone = ctx.createGain();
      oscDrone.type = 'sawtooth';
      oscDrone.frequency.setValueAtTime(85, t + 0.1);
      
      // Add a lowpass filter to make the drone warm and dark
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, t);
      filter.frequency.linearRampToValueAtTime(100, t + 2.0);
      
      gainDrone.gain.setValueAtTime(0, t);
      gainDrone.gain.linearRampToValueAtTime(masterVolume * 0.9, t + 0.3);
      gainDrone.gain.linearRampToValueAtTime(masterVolume * 0.7, t + 1.2);
      gainDrone.gain.exponentialRampToValueAtTime(0.01, t + 2.2);
      
      oscDrone.connect(filter);
      filter.connect(gainDrone);
      gainDrone.connect(ctx.destination);
      
      oscDrone.start(t + 0.1);
      oscDrone.stop(t + 2.2);
    } else {
      // Crewmate pleasant/mysterious chord
      const playSine = (freq, delay, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        
        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(masterVolume * 0.25, t + delay + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + delay + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + duration);
      };
      
      playSine(523.25, 0, 1.8);  // C5
      playSine(659.25, 0.05, 1.8); // E5
      playSine(783.99, 0.1, 1.8);  // G5
      playSine(987.77, 0.15, 1.8); // B5 (creates a nice major 7th chord!)
    }
  } catch (e) {
    console.warn("Audio play failed:", e);
  }
}
