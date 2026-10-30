// Web Audio API synthesizer for retro 8-bit Pecman sound effects.
// Completely self-contained with zero external asset latency or 404 dependencies.

class PacmanAudio {
  private ctx: AudioContext | null = null
  private _enabled: boolean = true
  private chompAlternator: boolean = false
  private lastChompTime: number = 0

  private bgmOsc: OscillatorNode | null = null
  private bgmGain: GainNode | null = null
  private bgmLfo: OscillatorNode | null = null
  private bgmPlaying: boolean = false

  constructor() {
    try {
      const stored = localStorage.getItem('pacman-sound')
      this._enabled = stored !== null ? stored === 'true' : true
    } catch {
      this._enabled = true
    }
  }

  get enabled(): boolean {
    return this._enabled
  }

  toggle(): boolean {
    this._enabled = !this._enabled
    try {
      localStorage.setItem('pacman-sound', String(this._enabled))
    } catch {
      // Ignore localStorage quotas
    }
    if (!this._enabled) {
      this.stopBgm()
    }
    return this._enabled
  }

  startBgm() {
    if (!this._enabled || this.bgmPlaying) return
    const ctx = this.getContext()
    if (!ctx) return

    try {
      this.stopBgm()
      const now = ctx.currentTime

      // Subtle, warm retro arcade cabinet siren hum
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(115, now)

      // Slow gentle LFO sweep
      const lfo = ctx.createOscillator()
      lfo.type = 'sawtooth'
      lfo.frequency.setValueAtTime(1.9, now)

      const lfoGain = ctx.createGain()
      lfoGain.gain.setValueAtTime(24, now)
      lfo.connect(osc.frequency)

      // Warm low-pass filter so it remains subtle and non-fatiguing
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(550, now)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(0.022, now + 0.3)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      lfo.start(now)

      this.bgmOsc = osc
      this.bgmLfo = lfo
      this.bgmGain = gain
      this.bgmPlaying = true
    } catch {
      // AudioContext interrupted or not allowed
    }
  }

  stopBgm() {
    this.bgmPlaying = false
    if (this.bgmGain && this.ctx) {
      try {
        const now = this.ctx.currentTime
        this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now)
        this.bgmGain.gain.linearRampToValueAtTime(0.0001, now + 0.05)
      } catch {
        // Ignore
      }
    }
    setTimeout(() => {
      try {
        this.bgmOsc?.stop()
        this.bgmLfo?.stop()
        this.bgmOsc?.disconnect()
        this.bgmLfo?.disconnect()
        this.bgmGain?.disconnect()
      } catch {
        // Already stopped
      }
      this.bgmOsc = null
      this.bgmLfo = null
      this.bgmGain = null
    }, 60)
  }

  private getContext(): AudioContext | null {
    if (!this._enabled) return null
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /** Classic chomp (waka-waka) sound with alternating low/high pitch */
  playChomp() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    // Throttle chomp sounds so fast loops don't clip
    if (now - this.lastChompTime < 0.08) return
    this.lastChompTime = now

    this.chompAlternator = !this.chompAlternator
    const freq = this.chompAlternator ? 330 : 260

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.07)

    gain.gain.setValueAtTime(0.09, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.07)
  }

  /** Energizer / power pellet chime */
  playPowerPellet() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.linearRampToValueAtTime(420, now + 0.12)

    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.12)
  }

  /** Eating a frightened ghost */
  playEatGhost() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.28)

    gain.gain.setValueAtTime(0.16, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.28)
  }

  /** Classic arcade death sound: chromatic descending steps */
  playDeath() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const frequencies = [580, 520, 480, 440, 400, 360, 320, 280, 240, 200, 160]
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      const startT = now + i * 0.055
      osc.frequency.setValueAtTime(freq, startT)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, startT + 0.05)

      gain.gain.setValueAtTime(0.12, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.05)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.05)
    })
  }

  /** Retro start fanfare */
  playStart() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const notes = [261.63, 329.63, 392.0, 523.25, 493.88, 392.0, 329.63, 261.63]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'square'
      const startT = now + i * 0.06
      osc.frequency.setValueAtTime(freq, startT)

      gain.gain.setValueAtTime(0.07, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.055)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.055)
    })
  }
}

export const audio = new PacmanAudio()
