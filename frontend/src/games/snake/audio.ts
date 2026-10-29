// Web Audio API synthesizer for retro 8-bit Snake sound effects.
// Completely self-contained with zero external audio assets.

class SnakeAudio {
  private ctx: AudioContext | null = null
  private _enabled: boolean = true

  private bgmTimer: number | null = null
  private bgmIndex: number = 0

  constructor() {
    try {
      const stored = localStorage.getItem('snake-sound')
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
      localStorage.setItem('snake-sound', String(this._enabled))
    } catch {
      // Ignore quota
    }
    if (!this._enabled) {
      this.stopBgm()
    }
    return this._enabled
  }

  startBgm() {
    if (!this._enabled || this.bgmTimer) return
    const ctx = this.getContext()
    if (!ctx) return

    const bassPattern = [110, 0, 130.81, 0, 146.83, 130.81, 110, 98]
    this.bgmIndex = 0

    this.bgmTimer = window.setInterval(() => {
      if (!this._enabled) {
        this.stopBgm()
        return
      }
      const freq = bassPattern[this.bgmIndex]
      this.bgmIndex = (this.bgmIndex + 1) % bassPattern.length
      if (freq > 0) {
        try {
          const now = ctx.currentTime
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const filter = ctx.createBiquadFilter()

          osc.type = 'triangle'
          osc.frequency.setValueAtTime(freq, now)

          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(450, now)

          gain.gain.setValueAtTime(0.022, now)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

          osc.connect(filter)
          filter.connect(gain)
          gain.connect(ctx.destination)

          osc.start(now)
          osc.stop(now + 0.18)
        } catch {
          // Ignore audio interrupted
        }
      }
    }, 220)
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
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

  /** Normal apple crunch/bite */
  playBite() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08)

    gain.gain.setValueAtTime(0.14, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.08)
  }

  /** Special Golden Apple high chime */
  playGoldenBite() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const notes = [587.33, 880, 1174.66]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      const startT = now + idx * 0.06
      osc.frequency.setValueAtTime(freq, startT)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, startT + 0.12)

      gain.gain.setValueAtTime(0.18, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.12)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.12)
    })
  }

  /** Snake direction change click */
  playTurn() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.02)

    gain.gain.setValueAtTime(0.04, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.02)
  }

  /** Portal teleport swoosh */
  playWarp() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, now)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12)
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.22)

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.22)
  }

  /** Powerup collection fanfare */
  playPowerup(type?: string) {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const baseFreq = type === 'FREEZE' ? 659.25 : type === 'GHOST' ? 523.25 : 783.99
    const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = type === 'FREEZE' ? 'sine' : 'triangle'
      const startT = now + idx * 0.05
      osc.frequency.setValueAtTime(freq, startT)

      gain.gain.setValueAtTime(0.12, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.1)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.1)
    })
  }

  /** Collision / Game over */
  playDie() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(140, now)
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35)

    gain.gain.setValueAtTime(0.24, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.35)
  }

  /** Start run fanfare */
  playStart() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const notes = [392.0, 523.25, 659.25]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      const startT = now + idx * 0.07
      osc.frequency.setValueAtTime(freq, startT)

      gain.gain.setValueAtTime(0.1, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.1)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.1)
    })
  }
}

export const snakeAudio = new SnakeAudio()
