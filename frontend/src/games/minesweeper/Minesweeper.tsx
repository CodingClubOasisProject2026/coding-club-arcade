import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api'
import { useAuth } from '../../auth'
import GoogleSignIn from '../../GoogleSignIn'
import { type Difficulty, type EndReason, type GameState, type MoveType, getGame, newGame, playMove } from './api'
import {
  DIFFICULTIES,
  EXTEND_MOVES,
  EXTEND_SECONDS,
  type MoveEvents,
  POWERUP_ICON,
  POWERUP_NAME,
  applyResult,
  blankGame,
  localExpire,
  localMove,
  neighbors,
} from './engine'
import './Minesweeper.css'

const CURRENT_GAME_KEY = 'minesweeper.currentGame'
const SOUND_STORAGE_KEY = 'minesweeper.soundEnabled'

// Countdown turns red at or below this many seconds, and the moves counter at this many moves.
const LOW_TIME = 10
const LOW_MOVES = 5

const END_TITLE: Record<EndReason, string> = {
  mine: 'You hit a mine',
  time: 'Out of time',
  moves: 'Out of moves',
}

function MineGlyph({ exploded, defused }: { exploded?: boolean; defused?: boolean }) {
  if (exploded) {
    return (
      <svg viewBox="0 0 24 24" className="tile-icon tile-icon-boom" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="#ff3838" strokeWidth="1.2" strokeDasharray="3 1.5" opacity="0.85" />
        <path
          d="M12 1.5l2.2 4.6 4.8-1.6-1.6 4.8 4.6 2.2-4.6 2.2 1.6 4.8-4.8-1.6-2.2 4.6-2.2-4.6-4.8 1.6 1.6-4.8-4.6-2.2 4.6-2.2-1.6-4.8 4.8 1.6z"
          fill="#ff4b2b"
        />
        <path
          d="M12 4l1.6 3.4 3.7-1.2-1.2 3.7 3.4 1.6-3.4 1.6 1.2 3.7-3.7-1.2-1.6 3.4-1.6-3.4-3.7 1.2 1.2-3.7-3.4-1.6 3.4-1.6-1.2-3.7 3.7 1.2z"
          fill="#ffaa00"
        />
        <circle cx="12" cy="12" r="5.2" fill="#fff599" />
        <circle cx="12" cy="12" r="3.2" fill="#ffffff" />
        <circle cx="6.5" cy="7" r="1.1" fill="#2b0e14" />
        <circle cx="17.5" cy="6.5" r="1" fill="#2b0e14" />
        <circle cx="16.5" cy="17" r="1.2" fill="#2b0e14" />
        <circle cx="7" cy="16.5" r="0.9" fill="#2b0e14" />
      </svg>
    )
  }

  const spikeColor = defused ? '#4ade80' : '#8892b0'
  const capColor = defused ? '#86efac' : '#ff4d6d'
  const diodeColor = defused ? '#22c55e' : '#ff2a4d'

  return (
    <svg viewBox="0 0 24 24" className={`tile-icon tile-icon-mine ${defused ? 'is-defused' : ''}`} aria-hidden="true">
      {/* 8 Radial Contact Spikes */}
      <line x1="12" y1="2" x2="12" y2="22" stroke={spikeColor} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="2" y1="12" x2="22" y2="12" stroke={spikeColor} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" stroke={spikeColor} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4.9" y1="19.1" x2="19.1" y2="4.9" stroke={spikeColor} strokeWidth="2.2" strokeLinecap="round" />

      {/* Contact horn caps */}
      <circle cx="12" cy="2.2" r="1.3" fill={capColor} />
      <circle cx="12" cy="21.8" r="1.3" fill={capColor} />
      <circle cx="2.2" cy="12" r="1.3" fill={capColor} />
      <circle cx="21.8" cy="12" r="1.3" fill={capColor} />
      <circle cx="5.1" cy="5.1" r="1.3" fill={capColor} />
      <circle cx="18.9" cy="18.9" r="1.3" fill={capColor} />
      <circle cx="5.1" cy="18.9" r="1.3" fill={capColor} />
      <circle cx="18.9" cy="5.1" r="1.3" fill={capColor} />

      {/* Main Mine Sphere */}
      <circle
        cx="12"
        cy="12"
        r="6.8"
        fill={defused ? '#13281e' : '#1b202e'}
        stroke={defused ? '#22c55e' : '#48536e'}
        strokeWidth="1.2"
      />

      {/* Inner depth circle */}
      <circle cx="12" cy="12" r="5.4" fill={defused ? '#193f2c' : '#272f44'} />

      {/* Specular Glint Highlight */}
      <ellipse
        cx="9.8"
        cy="9.2"
        rx="2"
        ry="1.1"
        transform="rotate(-30 9.8 9.2)"
        fill="#ffffff"
        opacity={defused ? 0.7 : 0.55}
      />

      {/* Center Detonator Diode */}
      <circle cx="12" cy="12" r="1.8" fill={diodeColor} />
      <circle cx="11.4" cy="11.4" r="0.6" fill="#ffffff" opacity="0.85" />
    </svg>
  )
}

function FlagGlyph({ isWrong }: { isWrong?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`tile-icon tile-icon-flag ${isWrong ? 'is-wrong' : ''}`} aria-hidden="true">
      {/* Stand Base */}
      <path d="M5 20.5h14v1.5H5z" fill="#7886a4" />
      <path d="M7 19h10v1.5H7z" fill="#9aa8c6" />
      {/* Pole */}
      <line x1="11.5" y1="3" x2="11.5" y2="19" stroke="#ccd7ed" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11.5" cy="3" r="1.2" fill="#ffd166" />
      {/* Triangular flag pennant */}
      <path d="M11.5 4.5L3.5 8.8l8 4.3z" fill="#ff385c" />
      <path d="M11.5 4.5L3.5 8.8l8 0z" fill="#ff6b85" opacity="0.45" />
      {isWrong && (
        <g stroke="#ff2244" strokeWidth="2.8" strokeLinecap="round">
          <line x1="4" y1="4" x2="20" y2="20" />
          <line x1="20" y1="4" x2="4" y2="20" />
        </g>
      )}
    </svg>
  )
}

// ---------------------------------------------------------
// Sound Effects Engine
// ---------------------------------------------------------
class MinesweeperAudio {
  private ctx: AudioContext | null = null
  public enabled = true

  constructor() {
    try {
      const saved = localStorage.getItem(SOUND_STORAGE_KEY)
      if (saved !== null) this.enabled = saved === 'true'
    } catch {
      // ignore
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(this.enabled))
    } catch {
      // ignore
    }
    if (this.enabled) this.playClick()
    return this.enabled
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

  playClick() {
    const ctx = this.getContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.03)
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.03)
  }

  playReveal(count: number, isCascade: boolean = false) {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = isCascade ? 'triangle' : 'sine'
    const freq = 340 + count * 55 + (isCascade ? 120 : 0)
    osc.frequency.setValueAtTime(freq, now)
    gain.gain.setValueAtTime(isCascade ? 0.12 : 0.09, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCascade ? 0.14 : 0.06))
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + (isCascade ? 0.14 : 0.06))
  }

  playFlag(isFlagging: boolean) {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(isFlagging ? 1200 : 800, now)
    osc.frequency.exponentialRampToValueAtTime(isFlagging ? 1800 : 400, now + 0.04)
    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.04)
  }

  playExplosion() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(120, now)
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.45)
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.45)
  }

  // Rising arpeggio for picking up a power-up.
  playPowerUp() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    ;[660, 880, 1320].forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(freq, now + idx * 0.05)
      gain.gain.setValueAtTime(0.05, now + idx * 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + idx * 0.05)
      osc.stop(now + idx * 0.05 + 0.12)
    })
  }

  // Metallic clang when a shield blocks a mine.
  playShield() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08)
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.3)
    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.35)
  }

  // Two sonar pings.
  playSonar() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    ;[0, 0.18].forEach((delay) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1400, now + delay)
      osc.frequency.exponentialRampToValueAtTime(900, now + delay + 0.15)
      gain.gain.setValueAtTime(0.1, now + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + delay)
      osc.stop(now + delay + 0.16)
    })
  }

  playWin() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + idx * 0.07)
      gain.gain.setValueAtTime(0.1, now + idx * 0.07)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + idx * 0.07)
      osc.stop(now + idx * 0.07 + 0.22)
    })
  }
}

const audio = new MinesweeperAudio()

function formatDigits(num: number): string {
  const clamped = Math.max(-99, Math.min(999, num))
  if (clamped < 0) return '-' + String(Math.abs(clamped)).padStart(2, '0')
  return String(clamped).padStart(3, '0')
}

export default function Minesweeper() {
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')
  const [game, setGame] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [soundOn, setSoundOn] = useState(() => audio.enabled)
  const [isClickingCell, setIsClickingCell] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [sonarMode, setSonarMode] = useState(false)
  const [notice, setNotice] = useState<{ text: string; tone: 'good' | 'info'; id: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [totalClicks, setTotalClicks] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [dismissedRotatePrompt, setDismissedRotatePrompt] = useState(false)

  // Viewport tracking for guaranteed responsive cell sizing
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  })

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const pending = useRef(false)
  const longPressTimer = useRef<number | null>(null)
  const didLongPress = useRef(false)
  const boardViewportRef = useRef<HTMLDivElement | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  // Used when resuming a saved game after a refresh.
  const difficultyRef = useRef(difficulty)
  const skipNextResetRef = useRef(false)
  const sessionStartedRef = useRef(false)
  const isTouchDragging = useRef(false)

  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true

  const currentConfig = useMemo(() => {
    return DIFFICULTIES.find((d) => d.key === difficulty) ?? DIFFICULTIES[0]
  }, [difficulty])

  // Elapsed time, for APM and the result bar.
  useEffect(() => {
    const isRunning = game?.status === 'in_progress' && game.startedAt
    if (!isRunning) return

    const startMs = Date.parse(game.startedAt!)
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)))
    }, 250)

    return () => clearInterval(interval)
  }, [game?.status, game?.startedAt])

  useEffect(() => {
    if (!game?.startedAt) {
      setElapsed(0)
    }
  }, [game?.startedAt])

  // Countdown. Every board update carries fresh `time_left` (seconds left when
  // the server answered), so the deadline is rebuilt from it on each update.
  // Using our own clock for the deadline keeps it right even if the player's
  // clock disagrees with the server's.
  const running = game?.status === 'in_progress' && !!game.startedAt && game.time_left !== null
  const deadline = useMemo(
    () => (running && game ? Date.now() + game.time_left! * 1000 : null),
    // Rebuild only when a new board state arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game],
  )

  useEffect(() => {
    if (deadline === null) return
    setNowMs(Date.now())
    const interval = setInterval(() => setNowMs(Date.now()), 200)
    return () => clearInterval(interval)
  }, [deadline])

  const secondsLeft =
    deadline !== null
      ? Math.max(0, (deadline - nowMs) / 1000)
      : (game?.time_left ?? currentConfig.time)

  const movesLeft = game ? game.moves_left : currentConfig.moves

  // Sonar can be aimed once the board has started and one is in stock.
  const canSonar = game?.status === 'in_progress' && !!game.startedAt && game.sonars > 0
  const sonarArmed = sonarMode && canSonar

  // A blank board. 'pending' boards have no session yet (the ticket is spent on
  // the first reveal); 'local' boards are practice games that never hit the API.
  const blankBoard = useCallback(
    (kind: 'pending' | 'local'): GameState => blankGame(currentConfig, `${kind}-${Date.now()}`),
    [currentConfig],
  )

  // Reset to a blank board. No session is created and no ticket is spent until
  // the player reveals their first tile (see move()).
  const start = useCallback(() => {
    if (pending.current) return
    setError(null)
    setGame(blankBoard('pending'))
    setElapsed(0)
    setTotalClicks(0)
    setSonarMode(false)
    setNotice(null)
    audio.playClick()
  }, [blankBoard])

  // Short pop-up for power-up events.
  const showNotice = useCallback((text: string, tone: 'good' | 'info' = 'good') => {
    setNotice({ text, tone, id: Date.now() })
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  // Spends a ticket and creates the server game. Falls back to practice mode.
  const createSession = useCallback(async (): Promise<GameState> => {
    setBusy(true)
    try {
      const g = await newGame(difficulty)
      try {
        localStorage.setItem(CURRENT_GAME_KEY, g.id)
      } catch {
        // ignore
      }
      return g
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError('Practice mode. Sign in to record leaderboard scores.')
      } else if (e instanceof ApiError && e.status === 400) {
        setError('No tickets left. You are playing in practice mode.')
      }
      return blankBoard('local')
    } finally {
      setBusy(false)
      refresh()
    }
  }, [blankBoard, difficulty, refresh])

  // Show a blank board on mount and whenever the difficulty changes.
  // (Calling start() from the pill's onClick would use the previous difficulty,
  // because the callback closes over the old value.)
  useEffect(() => {
    difficultyRef.current = difficulty
    setZoom(1)
    setDismissedRotatePrompt(false)
    if (boardViewportRef.current) {
      boardViewportRef.current.scrollLeft = 0
      boardViewportRef.current.scrollTop = 0
    }
    // Resuming a saved game switches the difficulty to match it; don't wipe that board.
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false
      return
    }
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty])

  // Resume a ranked game that was in progress before a refresh.
  useEffect(() => {
    let savedId: string | null = null
    try {
      savedId = localStorage.getItem(CURRENT_GAME_KEY)
    } catch {
      // ignore
    }
    if (!savedId) return
    const forget = () => {
      try {
        localStorage.removeItem(CURRENT_GAME_KEY)
      } catch {
        // ignore
      }
    }
    let cancelled = false
    getGame(savedId)
      .then((g) => {
        if (cancelled) return
        if (g.status !== 'in_progress') {
          forget()
          return
        }
        // The player already started a new game while this was loading.
        if (pending.current || sessionStartedRef.current) return
        const config = DIFFICULTIES.find(
          (d) => d.cols === g.width && d.rows === g.height && d.mines === g.mine_count,
        )
        if (!config) {
          forget()
          return
        }
        if (config.key !== difficultyRef.current) {
          skipNextResetRef.current = true
          setDifficulty(config.key)
        }
        setGame(g)
        setTotalClicks(g.move_count)
        setError(null)
      })
      .catch((e) => {
        // Gone, or not this user's game (signed out, other account). Network
        // errors keep the id so the next load can try again.
        if (!cancelled && e instanceof ApiError && [401, 403, 404].includes(e.status)) forget()
      })
    return () => {
      cancelled = true
    }
  }, [])

  // When the countdown reaches zero, end the game. Practice games end here; for
  // ranked games the server decides, so ask it (it ends the game on that request).
  const expiringRef = useRef<string | null>(null)
  useEffect(() => {
    if (!game || deadline === null || nowMs < deadline) return
    if (game.id.startsWith('local-')) {
      setGame((g) => (g ? localExpire(g) : g))
      return
    }
    if (expiringRef.current === game.id) return
    const id = game.id
    expiringRef.current = id
    getGame(id)
      .then((g) => setGame((cur) => (cur && cur.id === id ? g : cur)))
      .catch(() => {})
      .finally(() => {
        // Allows a retry if the server still had time left.
        if (expiringRef.current === id) expiringRef.current = null
      })
  }, [game, deadline, nowMs])

  // Win/Loss Audio triggers
  // A finished ranked game has nothing to resume.
  const gameId = game?.id
  const gameStatus = game?.status
  useEffect(() => {
    if (!gameId || gameStatus === 'in_progress') return
    try {
      if (localStorage.getItem(CURRENT_GAME_KEY) === gameId) localStorage.removeItem(CURRENT_GAME_KEY)
    } catch {
      // ignore
    }
  }, [gameId, gameStatus])

  useEffect(() => {
    if (game?.status === 'won') {
      audio.playWin()
    } else if (game?.status === 'lost') {
      audio.playExplosion()
      setIsShaking(true)
      const t = setTimeout(() => setIsShaking(false), 500)
      return () => clearTimeout(t)
    }
  }, [game?.status])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'r' || e.key === 'R') {
        start()
      } else if (e.key === ' ' || e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFlagMode((f) => {
          audio.playFlag(!f)
          return !f
        })
      } else if (e.key === 's' || e.key === 'S') {
        if (canSonar) {
          setSonarMode((on) => {
            if (!on) audio.playSonar()
            return !on
          })
        }
      } else if (e.key === 'Escape') {
        setSonarMode(false)
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))
      } else if (e.key === '-' || e.key === '_') {
        setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))
      } else if (e.key === '0') {
        setZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [start, canSonar])

  // Sounds and pop-ups for what a move turned up.
  const announce = useCallback(
    (type: MoveType, index: number, flagged: number[], events: MoveEvents) => {
      if (type === 'flag') {
        audio.playFlag(flagged.includes(index))
      } else if (type === 'sonar') {
        audio.playSonar()
      } else if (events.cells.length > 0) {
        audio.playReveal(events.cells[0][1], events.cells.length > 1)
      }

      const messages: string[] = []
      if (type === 'sonar') {
        const n = events.pinged.length
        messages.push(n ? `📡 Sonar found ${n} mine${n === 1 ? '' : 's'}` : '📡 No new mines there')
      }
      if (events.blocked.length > 0) {
        audio.playShield()
        messages.push('🛡️ Shield blocked a mine!')
      }
      if (events.picked_up.length > 0) {
        audio.playPowerUp()
        for (const [, kind] of events.picked_up) {
          if (kind === 'shield') messages.push('🛡️ Shield ready')
          else if (kind === 'sonar') messages.push('📡 Sonar ready (S)')
          else messages.push(`⏱️ +${EXTEND_SECONDS}s +${EXTEND_MOVES} moves`)
        }
      }
      if (messages.length > 0) {
        const goodNews = events.blocked.length > 0 || events.picked_up.length > 0
        showNotice(messages.join(' · '), goodNews ? 'good' : 'info')
      }
    },
    [showNotice],
  )

  // Move handler
  const move = useCallback(
    async (type: MoveType, index: number) => {
      if (!game || game.status !== 'in_progress' || pending.current) return
      const isPending = game.id.startsWith('pending-')
      // Nothing to flag or chord before the first reveal.
      if (isPending && type !== 'reveal') return
      pending.current = true
      setTotalClicks((c) => c + 1)

      if (navigator.vibrate) {
        navigator.vibrate(type === 'flag' ? 20 : 10)
      }

      // First reveal on a fresh board: this is where the ticket is spent.
      let current = game
      if (isPending) {
        sessionStartedRef.current = true
        current = await createSession()
        setGame(current)
      }

      // Practice game: play it locally with the same rules as the server.
      if (current.id.startsWith('local-')) {
        try {
          const outcome = localMove(current, type, index)
          if (!outcome) return
          setGame(outcome.game)
          announce(type, index, outcome.game.flagged, outcome.events)
        } finally {
          pending.current = false
        }
        return
      }

      // Ranked game: the server plays the move.
      try {
        const r = await playMove(current.id, current.move_count, type, index, current.width)
        setGame((g) => (g && g.id === current.id ? applyResult(g, r) : g))
        announce(type, index, r.flagged, r)

        if (r.status !== 'in_progress') {
          getGame(current.id).then(setGame).catch(() => { })
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          getGame(current.id).then(setGame).catch(() => { })
        }
      } finally {
        pending.current = false
      }
    },
    [game, createSession, announce],
  )

  const view = useMemo(() => {
    if (!game) return null
    return {
      opened: new Map(game.cells),
      flagged: new Set(game.flagged),
      mines: new Set(game.mines ?? []),
      exploded: new Set(game.exploded ?? []),
      detected: new Set(game.detected),
      defused: new Set(game.defused),
      found: new Map(game.found),
      // Power-ups nobody picked up, shown once the game is over.
      missed: new Map(game.status !== 'in_progress' ? (game.powerups ?? []) : []),
    }
  }, [game])

  const face = useMemo(() => {
    if (!game) return '🙂'
    if (game.status === 'won') return '😎'
    if (game.status === 'lost') return '😵'
    if (isClickingCell) return '😮'
    return '🙂'
  }, [game, isClickingCell])

  // Long press handler for touch flagging
  // Long press handler for touch flagging with drag cancellation for smooth scrolling
  const onTouchStartCell = (e: React.TouchEvent, index: number, isOpen: boolean) => {
    setIsClickingCell(true)
    didLongPress.current = false
    isTouchDragging.current = false
    if (e.touches && e.touches[0]) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    if (isOpen) return // nothing to flag on a revealed tile
    longPressTimer.current = window.setTimeout(() => {
      didLongPress.current = true
      if (game?.status === 'in_progress') {
        move('flag', index)
      }
    }, 320)
  }

  const onTouchMoveCell = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !e.touches || !e.touches[0]) return
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y)
    // If movement exceeds small threshold, user is panning/scrolling, not tapping
    if (dx > 8 || dy > 8) {
      isTouchDragging.current = true
      setIsClickingCell(false)
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }
  }

  const onTouchEndCell = () => {
    setIsClickingCell(false)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Only chord when it can open something, so a stray click never costs a move.
  const canChord = (index: number) => {
    if (!game || !view) return false
    const value = view.opened.get(index)
    if (!value) return false
    const around = neighbors(index, game.width, game.height)
    const isMarked = (n: number) => view.flagged.has(n) || view.defused.has(n) || view.detected.has(n)
    return (
      around.filter(isMarked).length === value &&
      around.some((n) => !view.opened.has(n) && !isMarked(n))
    )
  }

  const onCellClick = (index: number, isOpen: boolean, isFlag: boolean, isDetected: boolean) => {
    if (didLongPress.current || isTouchDragging.current) {
      didLongPress.current = false
      isTouchDragging.current = false
      return
    }
    if (sonarArmed) {
      setSonarMode(false)
      move('sonar', index)
    } else if (isOpen) {
      if (canChord(index)) move('chord', index)
    } else if (flagMode) {
      move('flag', index)
    } else if (!isFlag && !isDetected) {
      move('reveal', index)
    }
  }

  const cols = game?.width ?? currentConfig.cols
  const rows = game?.height ?? currentConfig.rows

  // Live APM calculation (Actions Per Minute)
  const apm = useMemo(() => {
    if (elapsed === 0) return 0
    return Math.round((totalClicks / elapsed) * 60)
  }, [totalClicks, elapsed])

  // Phone detection:
  // Phones in portrait have narrow width (<= 500px).
  // Phones in landscape have short height (<= 500px) and width <= 1050px.
  // Laptops and desktops have height >= 600px and width >= 1024px.
  const isPhonePortrait = viewport.w <= 500 && viewport.h > viewport.w
  const isPhoneLandscape = viewport.h <= 500 && viewport.w <= 1050 && viewport.w > viewport.h

  // In phone landscape, the side rail takes ~240px on the right,
  // so the board takes the remaining width and gets nearly the full screen height!
  const maxBoardWidth = isPhoneLandscape
    ? Math.max(280, viewport.w - 240)
    : Math.min(viewport.w - 32, 980)

  const maxBoardHeight = isPhoneLandscape
    ? Math.max(160, viewport.h - 52)
    : Math.max(220, viewport.h - 190)

  const rawSizeByWidth = Math.floor((maxBoardWidth - (cols - 1) * 2 - 20) / cols)
  const rawSizeByHeight = Math.floor((maxBoardHeight - (rows - 1) * 2 - 20) / rows)
  const fitTileSize = Math.min(rawSizeByWidth, rawSizeByHeight)

  // On laptop/desktop: strictly use fitTileSize so the HUD and Footer are NEVER cut off!
  // In phone landscape: fitTileSize fits the full 30x16 field onto the phone with 0 scroll!
  // In phone portrait: if user chooses to stay in portrait, provide a comfortable tap size.
  const baseTileSize = isPhonePortrait
    ? Math.max(30, Math.min(48, rawSizeByWidth))
    : Math.max(12, Math.min(48, fitTileSize))

  const optimalTileSize = Math.round(baseTileSize * zoom)

  const tryRotateLandscape = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
      }
      if ('orientation' in screen && screen.orientation && 'lock' in screen.orientation) {
        await (screen.orientation as { lock: (orientation: string) => Promise<void> }).lock('landscape')
      }
    } catch {
      // Browsers like iOS Safari require physical rotation
    }
  }


  return (
    <div className={`ms-page ${isShaking ? 'screen-shake' : ''}`}>
      <header className="ms-nav">
        <div className="ms-nav-left">
          <Link to="/" className="ms-back-link">
            ← Arcade
          </Link>
          <span className="ms-title">Minesweeper</span>
        </div>

        {/* Difficulty selector */}
        <div className="ms-diff-pills" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={difficulty === d.key}
              className={`ms-diff-pill ${difficulty === d.key ? 'active' : ''}`}
              onClick={() => setDifficulty(d.key)}
              disabled={busy}
            >
              <span className="diff-full">{d.label}</span>
              <span className="diff-short">
                {d.cols}×{d.rows}
              </span>
            </button>
          ))}
        </div>

        <div className="ms-nav-right">
          <button
            type="button"
            className="ms-btn-sound"
            onClick={() => setSoundOn(audio.toggle())}
            title={soundOn ? 'Mute sound' : 'Turn sound on'}
            aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>

          {signedIn && (
            <div className="ms-user-tickets" title="Tickets left">
              🎟️ <span>{me.tickets}</span>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="ms-alert-banner" role="status">
          <span>{error}</span>
          {!signedIn && <GoogleSignIn />}
        </div>
      )}

      {/* Landscape Rotation Modal for Mobile Expert Mode */}
      {difficulty === 'expert' && isPhonePortrait && !dismissedRotatePrompt && (
        <div className="ms-rotate-overlay" role="dialog" aria-modal="true" aria-labelledby="ms-rotate-heading">
          <div className="ms-rotate-card">
            <div className="ms-rotate-badge">Widescreen Required</div>
            <div className="ms-rotate-icon-wrap" aria-hidden="true">
              <svg className="ms-phone-rotate-anim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                <path d="M12 18h.01" />
              </svg>
            </div>

            <h2 id="ms-rotate-heading" className="ms-rotate-title">Rotate Phone to Landscape</h2>
            <p className="ms-rotate-desc">
              Expert mode is <strong>30 columns wide</strong>. Rotate your device sideways to play the entire field without scrolling!
            </p>

            <div className="ms-rotate-actions">
              <button
                type="button"
                className="ms-btn-rotate-primary"
                onClick={async () => {
                  await tryRotateLandscape()
                }}
              >
                <span>🔄</span> Turn Sideways
              </button>
              <button
                type="button"
                className="ms-btn-rotate-secondary"
                onClick={() => setDismissedRotatePrompt(true)}
              >
                Continue in Portrait
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent hint chip when player chose to stay in portrait */}
      {difficulty === 'expert' && isPhonePortrait && dismissedRotatePrompt && (
        <div className="ms-landscape-hint-chip" onClick={() => setDismissedRotatePrompt(false)}>
          <span>🔄</span> Rotate to landscape for zero-scroll widescreen
        </div>
      )}

      <main className="ms-main-stage">
        <div className="ms-cabinet-card">
          {/* HUD: mines left, restart, countdown */}
          <div className="ms-hud-panel">
            <div className="ms-lcd-counter" title="Mines left" aria-label="Mines left">
              {formatDigits(game?.mines_left ?? currentConfig.mines)}
            </div>

            <button
              type="button"
              className={`ms-smiley-btn ${game?.status !== 'in_progress' ? 'glow' : ''}`}
              onClick={start}
              disabled={busy}
              aria-label="Restart game"
              title="Restart (R)"
            >
              <span className="smiley-face">{face}</span>
            </button>

            <div
              className={`ms-lcd-counter ${running && secondsLeft <= LOW_TIME ? 'is-low' : ''}`}
              title="Seconds left"
              aria-label="Seconds left"
            >
              {formatDigits(Math.ceil(secondsLeft))}
            </div>
          </div>

          {notice && (
            <div key={notice.id} className={`ms-notice ${notice.tone}`} role="status">
              {notice.text}
            </div>
          )}

          {/* Minefield */}
          {game && view && (
            <div className="ms-board-viewport" ref={boardViewportRef}>
              <div
                className={`ms-board-plate ${sonarArmed ? 'is-aiming' : ''}`}
                role="group"
                aria-label="Minefield"
                style={{
                  gridTemplateColumns: `repeat(${cols}, ${optimalTileSize}px)`,
                  gridTemplateRows: `repeat(${rows}, ${optimalTileSize}px)`,
                  width: cols * optimalTileSize + (cols - 1) * 2 + 12,
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {Array.from({ length: cols * rows }, (_, i) => {
                  const n = view.opened.get(i)
                  const isOpen = n !== undefined
                  const isFlag = view.flagged.has(i)
                  const isMine = view.mines.has(i)
                  const isExploded = view.exploded.has(i)
                  const isDefused = view.defused.has(i)
                  const isDetected = view.detected.has(i)
                  const foundPowerUp = view.found.get(i)
                  const missedPowerUp = view.missed.get(i)

                  // SVG glyphs scale crisply with optimalTileSize
                  let cls = 'tile'
                  let content: React.ReactNode = null
                  let label = 'Hidden'

                  if (isOpen) {
                    cls += ` open n${n}`
                    content = (
                      <>
                        {n ? <span className="n-digit">{n}</span> : null}
                        {foundPowerUp && (
                          <span className="pu-badge" aria-hidden="true">
                            {POWERUP_ICON[foundPowerUp]}
                          </span>
                        )}
                      </>
                    )
                    label = n ? `${n} adjacent` : 'Empty'
                    if (foundPowerUp) label += `, ${POWERUP_NAME[foundPowerUp]} picked up`
                  } else if (isDefused) {
                    cls += ' open shielded'
                    content = <MineGlyph defused />
                    label = 'Mine blocked by shield'
                  } else if (isExploded) {
                    cls += ' open boom'
                    content = <MineGlyph exploded />
                    label = 'Exploded mine'
                  } else if (isFlag) {
                    const isWrong = game.status === 'lost' && !isMine
                    cls += isWrong ? ' flag wrong' : ' flag'
                    content = <FlagGlyph isWrong={isWrong} />
                    label = isWrong ? 'Wrong flag' : 'Flagged'
                  } else if (isDetected) {
                    cls += ' detected'
                    content = <MineGlyph />
                    label = 'Mine found by sonar'
                  } else if (isMine && game.status !== 'in_progress') {
                    const isWon = game.status === 'won'
                    cls += isWon ? ' open defused' : ' open mine'
                    content = <MineGlyph defused={isWon} />
                    label = isWon ? 'Defused mine' : 'Mine'
                  } else if (missedPowerUp) {
                    cls += ' missed-powerup'
                    content = (
                      <span className="pu-badge" aria-hidden="true">
                        {POWERUP_ICON[missedPowerUp]}
                      </span>
                    )
                    label = `Hidden ${POWERUP_NAME[missedPowerUp]}`
                  }
                  // Tiles that act like opened ones: no digging, flagging or long-press.
                  const isSettled = isOpen || isDefused

                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      style={{ width: `${optimalTileSize}px`, height: `${optimalTileSize}px` }}
                      aria-label={`Row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}: ${label}`}
                      onMouseDown={(e) => {
                        if (e.button === 0 && !isSettled && !isFlag && !isDetected) setIsClickingCell(true)
                      }}
                      onMouseUp={() => setIsClickingCell(false)}
                      onMouseLeave={() => setIsClickingCell(false)}
                      onTouchStart={(e) => onTouchStartCell(e, i, isSettled)}
                      onTouchMove={onTouchMoveCell}
                      onTouchEnd={onTouchEndCell}
                      onTouchCancel={onTouchEndCell}
                      onClick={() => {
                        if (isDefused && !sonarArmed) return
                        onCellClick(i, isOpen, isFlag, isDetected)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (!isSettled) move('flag', i)
                      }}
                    >
                      {content}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {/* Moves left and power-ups */}
          <div className="ms-telemetry-bar">
            <div
              className={`telemetry-item ${movesLeft !== null && movesLeft <= LOW_MOVES && game?.status === 'in_progress' ? 'is-low' : ''}`}
              title="Digs, chords and sonar pings use a move. Flags are free."
            >
              <span className="telemetry-lbl">Moves</span>
              <span className="telemetry-val">{movesLeft ?? '∞'}</span>
            </div>
            <div
              className={`telemetry-item pu-item ${(game?.shields ?? 0) > 0 ? 'is-ready' : ''}`}
              title="Shield: blocks the next mine you hit"
            >
              <span aria-hidden="true">{POWERUP_ICON.shield}</span>
              <span className="telemetry-lbl">Shield</span>
              <span className="telemetry-val">{game?.shields ?? 0}</span>
            </div>
            <button
              type="button"
              className={`telemetry-item pu-item pu-sonar ${canSonar ? 'is-ready' : ''} ${sonarArmed ? 'is-armed' : ''}`}
              onClick={() => {
                if (!canSonar) return
                setSonarMode((on) => !on)
                audio.playSonar()
              }}
              disabled={!canSonar}
              aria-pressed={sonarArmed}
              title="Sonar (S): tap a tile to show the mines in the 3×3 around it. Uses a move."
            >
              <span aria-hidden="true">{POWERUP_ICON.sonar}</span>
              <span className="telemetry-lbl">{sonarArmed ? 'Pick a tile' : 'Sonar'}</span>
              <span className="telemetry-val">{game?.sonars ?? 0}</span>
            </button>
          </div>

          {/* Controls */}
          <div className="ms-card-footer">
            <div className="ms-mode-switch" role="group" aria-label="Tap mode">
              <button
                type="button"
                className={`mode-btn ${!flagMode ? 'active' : ''}`}
                aria-pressed={!flagMode}
                onClick={() => {
                  setFlagMode(false)
                  audio.playClick()
                }}
              >
                Dig
              </button>
              <button
                type="button"
                className={`mode-btn flag ${flagMode ? 'active' : ''}`}
                aria-pressed={flagMode}
                onClick={() => {
                  setFlagMode(true)
                  audio.playFlag(true)
                }}
              >
                Flag (F)
              </button>
            </div>

            {/* Zoom controls */}
            <div className="ms-zoom-controls" role="group" aria-label="Board zoom">
              <button
                type="button"
                className="ms-zoom-btn"
                onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))}
                disabled={zoom <= 0.7}
                title="Zoom out (-)"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="ms-zoom-val"
                onClick={() => setZoom(1)}
                title="Reset zoom (0)"
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="ms-zoom-btn"
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
                disabled={zoom >= 1.8}
                title="Zoom in (+)"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>

            <span className="ms-footer-hint">
              {sonarArmed
                ? 'Sonar armed: click a tile to scan around it. Esc cancels.'
                : 'Left-click to dig. Right-click to flag. S for sonar.'}
            </span>
          </div>

          {/* Result bar */}
          {game && game.status !== 'in_progress' && (
            <div className={`ms-status-toast ${game.status}`} role="status">
              <div className="toast-content">
                <strong>{game.status === 'won' ? 'Board cleared' : END_TITLE[game.end_reason ?? 'mine']}</strong>
                <span>
                  {elapsed}s · {game.moves_used} moves · {apm} APM
                  {game.status === 'won' && game.score ? ` · Score ${game.score}` : ''}
                </span>
              </div>
              <button type="button" className="toast-restart-btn" onClick={start} disabled={busy}>
                Play again
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
