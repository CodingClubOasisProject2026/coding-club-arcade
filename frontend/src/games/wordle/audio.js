// Web Audio API synthesizer for Fastfind tactile sound effects.
// Completely self-contained with zero external assets.

class WordleAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try {
      const stored = localStorage.getItem('wordle-sound');
      this.enabled = stored !== null ? stored === 'true' : true;
    } catch {
      this.enabled = true;
    }
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('wordle-sound', String(this.enabled));
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

    // Cozy lofi ambient chord progression (Cmaj7 -> Am7 -> Fmaj7 -> G6)
    const chords = [
      [261.63, 329.63, 392.0, 493.88],
      [220.00, 261.63, 329.63, 392.0],
      [174.61, 261.63, 329.63, 349.23],
      [196.00, 246.94, 293.66, 329.63],
    ];
    this.bgmStep = 0;

    const playChord = () => {
      if (!this.enabled) {
        this.stopBgm();
        return;
      }
      const notes = chords[this.bgmStep];
      this.bgmStep = (this.bgmStep + 1) % chords.length;

      try {
        const now = ctx.currentTime;
        notes.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(500, now);

          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.012, now + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 2.15);
        });
      } catch {
        // audio context interrupted
      }
    };

    playChord();
    this.bgmTimer = window.setInterval(playChord, 2200);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
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

  /** Subtle mechanical key click */
  playKeyPress() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.025);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  }

  /** Soft pop on backspace / delete */
  playDelete() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  /** Error buzz when word is invalid or too short */
  playError() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.07].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      const startT = now + delay;
      osc.frequency.setValueAtTime(130, startT);

      gain.gain.setValueAtTime(0.12, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startT);
      osc.stop(startT + 0.05);
    });
  }

  /** Flip reveal tone: varies depending on correct (2), present (1), or absent (0) */
  playTileReveal(mark = 0, index = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    let freq;
    let wave;
    let dur = 0.12;

    if (mark === 2) {
      // Green / correct - high sparkling bell
      freq = 523.25 + index * 60; // C5 + step
      wave = 'sine';
    } else if (mark === 1) {
      // Yellow / present - warm amber tone
      freq = 392.0 + index * 40; // G4 + step
      wave = 'triangle';
    } else {
      // Gray / absent - subtle soft click
      freq = 220 + index * 20;
      wave = 'sine';
      dur = 0.06;
    }

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(mark === 2 ? 0.12 : mark === 1 ? 0.09 : 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur);
  }

  /** Word solved! Ascending harmonic chime */
  playWordSolved() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      const startT = now + idx * 0.07;
      osc.frequency.setValueAtTime(freq, startT);

      gain.gain.setValueAtTime(0.14, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startT);
      osc.stop(startT + 0.16);
    });
  }

  /** Victory fanfare when run clears */
  playVictory() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const startT = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, startT);

      gain.gain.setValueAtTime(0.15, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startT);
      osc.stop(startT + 0.25);
    });
  }

  /** Game over somber descent */
  playGameOver() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [392.0, 369.99, 329.63, 261.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      const startT = now + idx * 0.09;
      osc.frequency.setValueAtTime(freq, startT);

      gain.gain.setValueAtTime(0.12, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startT);
      osc.stop(startT + 0.14);
    });
  }
}

export const wordleAudio = new WordleAudio();
