// Web Audio API synthesizer for retro 8-bit Flappy Bird sound effects.
// Completely self-contained with zero external assets.

class FlappyAudio {
  private ctx: AudioContext | null = null
  public enabled: boolean = true

  private bgmTimer: number | null = null
  private bgmIndex: number = 0

  constructor() {
    try {
      const stored = localStorage.getItem('flappy-sound')
      this.enabled = stored !== null ? stored === 'true' : true
    } catch {
      this.enabled = true
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    try {
      localStorage.setItem('flappy-sound', String(this.enabled))
    } catch {
      // ignore
    }
    if (!this.enabled) {
      this.stopBgm()
    }
    return this.enabled
  }

  startBgm() {
    if (!this.enabled || this.bgmTimer) return
    const ctx = this.getContext()
    if (!ctx) return

    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23]
    this.bgmIndex = 0

    this.bgmTimer = window.setInterval(() => {
      if (!this.enabled) {
        this.stopBgm()
        return
      }
      const freq = notes[this.bgmIndex]
      this.bgmIndex = (this.bgmIndex + 1) % notes.length
      try {
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const filter = ctx.createBiquadFilter()

        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, now)

        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(600, now)

        gain.gain.setValueAtTime(0.018, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

        osc.connect(filter)
        filter.connect(gain)
        gain.connect(ctx.destination)

        osc.start(now)
        osc.stop(now + 0.22)
      } catch {
        // audio interrupted
      }
    }, 260)
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null
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

  /** Bird wing flap swoop */
  playFlap() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.075)

    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.075)
  }

  /** Pipe cleared / score coin ping */
  playScore() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const notes = [987.77, 1318.51] // B5, E6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      const startT = now + idx * 0.06
      osc.frequency.setValueAtTime(freq, startT)

      gain.gain.setValueAtTime(0.15, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.12)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.12)
    })
  }

  /** Pipe / ground hit bonk */
  playHit() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(240, now)
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12)

    gain.gain.setValueAtTime(0.2, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.12)
  }

  /** Fall / Game over slide */
  playFall() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(450, now)
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.28)

    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.28)
  }

  /** Start game fanfare */
  playStart() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const notes = [392.0, 523.25, 659.25, 783.99] // G4, C5, E5, G5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      const startT = now + idx * 0.05
      osc.frequency.setValueAtTime(freq, startT)

      gain.gain.setValueAtTime(0.12, startT)
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startT)
      osc.stop(startT + 0.08)
    })
  }
}

export const flappyAudio = new FlappyAudio()
