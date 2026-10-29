// Web Audio API synthesizer for retro 8-bit Tetris sound effects.
// Completely self-contained with zero external audio assets.

class TetrisAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try {
      const stored = localStorage.getItem('tetris-sound');
      this.enabled = stored !== null ? stored === 'true' : true;
    } catch {
      this.enabled = true;
    }
    this.bgmTimer = null;
    this.bgmIndex = 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('tetris-sound', String(this.enabled));
    } catch {
      // ignore
    }
    if (!this.enabled) {
      this.stopBgm();
    }
    return this.enabled;
  }

  startBgm() {
    if (!this.enabled || this.bgmTimer) return;
    const ctx = this.getContext();
    if (!ctx) return;

    // Classic Korobeiniki (Tetris Theme A)
    const melody = [
      { f: 659.25, d: 2 }, { f: 493.88, d: 1 }, { f: 523.25, d: 1 },
      { f: 587.33, d: 2 }, { f: 523.25, d: 1 }, { f: 493.88, d: 1 },
      { f: 440.00, d: 2 }, { f: 440.00, d: 1 }, { f: 523.25, d: 1 },
      { f: 659.25, d: 2 }, { f: 587.33, d: 1 }, { f: 523.25, d: 1 },
      { f: 493.88, d: 3 }, { f: 523.25, d: 1 }, { f: 587.33, d: 2 },
      { f: 659.25, d: 2 }, { f: 523.25, d: 2 }, { f: 440.00, d: 2 },
      { f: 440.00, d: 2 }, { f: 0, d: 1 },
      { f: 587.33, d: 2 }, { f: 698.46, d: 1 }, { f: 880.00, d: 2 },
      { f: 783.99, d: 1 }, { f: 698.46, d: 1 }, { f: 659.25, d: 3 },
      { f: 523.25, d: 1 }, { f: 659.25, d: 2 }, { f: 587.33, d: 1 },
      { f: 523.25, d: 1 }, { f: 493.88, d: 2 }, { f: 493.88, d: 1 },
      { f: 523.25, d: 1 }, { f: 587.33, d: 2 }, { f: 659.25, d: 2 },
      { f: 523.25, d: 2 }, { f: 440.00, d: 2 }, { f: 440.00, d: 2 },
      { f: 0, d: 2 },
    ];

    const stepMs = 135;
    this.bgmIndex = 0;

    const playNextNote = () => {
      if (!this.enabled) {
        this.stopBgm();
        return;
      }
      const note = melody[this.bgmIndex];
      this.bgmIndex = (this.bgmIndex + 1) % melody.length;
      const noteDur = note.d * stepMs;

      if (note.f > 0) {
        try {
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(note.f, now);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(550, now);

          const durSec = (noteDur * 0.85) / 1000;
          gain.gain.setValueAtTime(0.02, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + durSec);
        } catch {
          // ignore
        }
      }

      this.bgmTimer = window.setTimeout(playNextNote, noteDur);
    };

    playNextNote();
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  getContext() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playMove() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  playRotate() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  playDrop() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playSlam() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.1);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playClear(lines = 1) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    let notes;
    if (lines === 1) {
      notes = [523.25, 659.25]; // C5, E5
    } else if (lines === 2) {
      notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    } else if (lines === 3) {
      notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    } else {
      // 4 lines = TETRIS! / MEGA
      notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]; // C5, E5, G5, C6, E6, G6
    }

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = lines >= 4 ? 'square' : 'triangle';
      const startT = now + idx * 0.06;
      osc.frequency.setValueAtTime(freq, startT);

      gain.gain.setValueAtTime(lines >= 4 ? 0.1 : 0.14, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startT);
      osc.stop(startT + 0.12);
    });
  }

  playBomb() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.28);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playGameOver() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [440, 415.3, 392, 369.99, 329.63, 293.66, 261.63];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      const startT = now + idx * 0.07;
      osc.frequency.setValueAtTime(freq, startT);

      gain.gain.setValueAtTime(0.12, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startT);
      osc.stop(startT + 0.08);
    });
  }

  playStart() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      const startT = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, startT);

      gain.gain.setValueAtTime(0.12, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startT);
      osc.stop(startT + 0.1);
    });
  }
}

export const tetrisAudio = new TetrisAudio();
