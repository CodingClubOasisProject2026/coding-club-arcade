import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HubLink } from '../../loader/HubTransition'
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
  neighbors,
} from './engine'
import './Minesweeper.css'

const CURRENT_GAME_KEY = 'minesweeper.currentGame'
const SOUND_STORAGE_KEY = 'minesweeper.soundEnabled'

// Countdown turns red at or below this many seconds, and the moves counter at this many moves.
const LOW_TIME = 10

// Layout sizes in px, kept in step with Minesweeper.css.
const TILE_GAP = 2 // .ms-board gap
const PLATE_PAD = 6 // .ms-board padding
const MIN_TILE = 18
const MAX_TILE = 44
const CARD_GAP = 8 // .ms-card gap
const CARD_PAD = 8 // .ms-card padding
const CARD_BORDER = 4 // .ms-card border
const SIDE_W = 236 // side column inside the screen
const HUD_H = 72 // .ms-hud height
const NAV_H = 44 // .ms-nav height
const BANNER_H = 40 // no-tickets banner under the nav (.ms-ticket-banner), when shown
const STAGE_PAD = 12 // .ms-stage padding
// Console chrome around the screen
const SHELL_PAD_X = 16 // .gb-body left/right padding
const SHELL_PAD_Y = 18 + 22 // .gb-body top + bottom padding
const WING_W = 128 // .gb-wing width (left and right)
const BEZEL_X = 18 // .gb-bezel left/right padding
const BEZEL_Y = 16 + 34 // .gb-bezel top + bottom padding (bottom holds the logo)
const PORTRAIT_WINGS_H = 80 + 60 // Stacked left/right wings in the mobile layout
// Below this window width the wings are dropped so the screen keeps its room.
const WINGS_MIN_VIEWPORT = 760

const END_TITLE: Record<EndReason, string> = {
  mine: 'You hit a mine',
  time: 'Out of time',
  moves: 'Out of moves',
}

type FaceExpression = 'happy' | 'cool' | 'dizzy' | 'surprised'

function PixelFace({ expression }: { expression: FaceExpression }) {
  const isCool = expression === 'cool'
  const isDizzy = expression === 'dizzy'
  const isSurprised = expression === 'surprised'

  return (
    <svg viewBox="0 0 16 16" className="ms-pixel-face" aria-hidden="true" shapeRendering="crispEdges">
      <path
        d="M4 1h8v1h2v2h1v8h-1v2h-2v1H4v-1H2v-2H1V4h1V2h2z"
        fill="#090613"
      />
      <path
        d="M4 2h8v1h2v2h1v6h-1v2h-2v1H4v-1H2v-2H1V5h1V3h2z"
        fill="#ffd166"
      />
      <path d="M3 4h1V3h2v1H4v2H3zM12 3h1v2h1v2h-1V5h-1z" fill="#fff1a8" />
      {isCool ? (
        <>
          <path d="M3 5h4v1h1v2H3zM9 6h1V5h4v3h-5z" fill="#17102d" />
          <path d="M4 6h3v1H4zM10 6h3v1h-3z" fill="#50c8ff" />
          <path d="M7 10h2v1H7zM6 11h4v1H6z" fill="#17102d" />
        </>
      ) : isDizzy ? (
        <>
          <path d="M3 5h1v1h1v1H4v1H3V7H2V6h1zM10 5h1v1h1v1h-1v1h-1V7H9V6h1z" fill="#17102d" />
          <path d="M6 10h4v1H6zM5 11h6v1H5z" fill="#17102d" />
          <path d="M6 12h4v1H6z" fill="#ff4d9d" />
        </>
      ) : isSurprised ? (
        <>
          <path d="M4 5h2v1H4zM10 5h2v1h-2z" fill="#17102d" />
          <path d="M7 9h2v1h1v3H6v-3h1z" fill="#17102d" />
          <path d="M7 10h2v2H7z" fill="#ff4d9d" />
        </>
      ) : (
        <>
          <path d="M4 5h2v2H4zM10 5h2v2h-2z" fill="#17102d" />
          <path d="M5 9h6v1h1v1h-1v1H5v-1H4v-1h1z" fill="#17102d" />
          <path d="M6 11h4v1H6z" fill="#ff4d9d" />
        </>
      )}
      <path d="M3 9h1v1H3zM12 9h1v1h-1z" fill="#ff9a8b" />
    </svg>
  )
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
  const [busy, setBusy] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [soundOn, setSoundOn] = useState(() => audio.enabled)
  const [isClickingCell, setIsClickingCell] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [sonarMode, setSonarMode] = useState(false)
  const [notice, setNotice] = useState<{ text: string; tone: 'good' | 'info'; id: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [helpOpen, setHelpOpen] = useState(false)
  // Tile the sonar is hovering over, to preview the 3x3 it will scan.
  const [aim, setAim] = useState<number | null>(null)

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
  const expiringRef = useRef<string | null>(null)
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
  // Ranked games need a signed-in player with a ticket.
  const ranked = signedIn && me.tickets > 0
  const outOfTickets = signedIn && me.tickets === 0

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

  // Sonar can be aimed once the board has started and one is in stock.
  const canSonar = game?.status === 'in_progress' && !!game.startedAt && game.sonars > 0
  const sonarArmed = sonarMode && canSonar

  // A blank board. 'pending' boards have no session yet (the ticket is spent on
  // the first reveal).
  const blankBoard = useCallback(
    (kind: 'pending'): GameState => blankGame(currentConfig, `${kind}-${Date.now()}`),
    [currentConfig],
  )

  // Reset to a blank board. No session is created and no ticket is spent until
  // the player reveals their first tile (see move()).
  const start = useCallback(() => {
    if (pending.current) return
    setGame(blankBoard('pending'))
    setElapsed(0)
    setSonarMode(false)
    setNotice(null)
    audio.playClick()
  }, [blankBoard])

  const invalidateSavedGame = useCallback(() => {
    expiringRef.current = null
    try {
      localStorage.removeItem(CURRENT_GAME_KEY)
    } catch {
      // ignore
    }
  }, [])

  const restart = useCallback(() => {
    if (pending.current) return
    invalidateSavedGame()
    sessionStartedRef.current = false
    start()
  }, [invalidateSavedGame, start])



  // Short pop-up for power-up events.
  const showNotice = useCallback((text: string, tone: 'good' | 'info' = 'good') => {
    setNotice({ text, tone, id: Date.now() })
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  // Spends a ticket and creates the server game.
  const createSession = useCallback(async (): Promise<GameState | null> => {
    setBusy(true)
    try {
      const g = await newGame(difficulty)
      try {
        localStorage.setItem(CURRENT_GAME_KEY, g.id)
      } catch {
        // ignore
      }
      return g
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 400) {
        showNotice('No tickets left. Please add a ticket to play.', 'info')
      } else {
        showNotice('Sign in and add a ticket to play.', 'info')
      }
      return null
    } finally {
      setBusy(false)
      refresh()
    }
  }, [difficulty, refresh, showNotice])

  // Show a blank board on mount and whenever the difficulty changes.
  // (Calling start() from the pill's onClick would use the previous difficulty,
  // because the callback closes over the old value.)
  useEffect(() => {
    difficultyRef.current = difficulty
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
      .then((g) => {
        if (g.status === 'in_progress' && g.time_left !== null && g.time_left > 0 && expiringRef.current === id) {
          expiringRef.current = null
        }
        setGame((cur) => (cur && cur.id === id ? g : cur))
      })
      .catch(() => {})
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
        restart()
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
        setHelpOpen(false)
      } else if (e.key === '?') {
        setHelpOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [restart, canSonar])

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
      if (!ranked) {
        showNotice(
          outOfTickets
            ? 'No tickets left. Please add a ticket to play.'
            : 'Sign in and add a ticket to play.',
          'info',
        )
        return
      }
      const isPending = game.id.startsWith('pending-')
      // Nothing to flag or chord before the first reveal.
      if (isPending && type !== 'reveal') return
      pending.current = true

      if (navigator.vibrate) {
        navigator.vibrate(type === 'flag' ? 20 : 10)
      }

      // First reveal on a fresh board: this is where the ticket is spent.
      let current = game
      if (isPending) {
        const sessionGame = await createSession()
        if (!sessionGame) {
          pending.current = false
          return
        }
        sessionStartedRef.current = true
        current = sessionGame
        setGame(current)
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
    [game, ranked, outOfTickets, showNotice, createSession, announce],
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
    if (!game) return 'happy'
    if (game.status === 'won') return 'cool'
    if (game.status === 'lost') return 'dizzy'
    if (isClickingCell) return 'surprised'
    return 'happy'
  }, [game, isClickingCell])

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

  // Layout. Every size here matches a fixed size in Minesweeper.css.
  const compact = viewport.w <= 640
  const portraitConsole = viewport.w < WINGS_MIN_VIEWPORT
  const wingW = portraitConsole ? 0 : WING_W
  const cardInset = CARD_PAD + CARD_BORDER
  const showTicketBanner = !signedIn || outOfTickets

  const chromeX = 2 * (SHELL_PAD_X + wingW + BEZEL_X)
  const chromeY = SHELL_PAD_Y + BEZEL_Y
  const availW =
    viewport.w -
    2 * STAGE_PAD -
    chromeX -
    2 * cardInset -
    2 * PLATE_PAD -
    (portraitConsole ? 0 : SIDE_W + CARD_GAP)
  const availH =
    viewport.h - NAV_H - (showTicketBanner ? BANNER_H : 0) - 2 * STAGE_PAD - chromeY - 2 * cardInset - 2 * PLATE_PAD
  const widthFit = (availW - (cols - 1) * TILE_GAP) / cols
  const heightFit = (availH - (rows - 1) * TILE_GAP) / rows
  const portraitBoardH =
    viewport.h -
    NAV_H -
    (showTicketBanner ? BANNER_H : 0) -
    2 * STAGE_PAD -
    chromeY -
    PORTRAIT_WINGS_H -
    HUD_H -
    96 -
    32 -
    3 * CARD_GAP -
    2 * cardInset
  const portraitHeightFit =
    (portraitBoardH - (rows - 1) * TILE_GAP - 2 * PLATE_PAD) / rows
  const fit = Math.floor(
    portraitConsole ? Math.min(widthFit, portraitHeightFit) : Math.min(widthFit, heightFit),
  )
  const tileSize = Math.max(MIN_TILE, Math.min(MAX_TILE, fit))
  const boardWidth = cols * tileSize + (cols - 1) * TILE_GAP + 2 * PLATE_PAD
  const cardWidth =
    (portraitConsole ? Math.min(boardWidth, availW + 2 * PLATE_PAD) : boardWidth + SIDE_W + CARD_GAP) +
    2 * CARD_PAD +
    2 * CARD_BORDER

  // Shrink the whole console when its width or stacked portrait height exceeds the viewport.
  const consoleNaturalWidth = cardWidth + chromeX
  const consoleNaturalHeight =
    rows * tileSize +
    (rows - 1) * TILE_GAP +
    2 * PLATE_PAD +
    HUD_H +
    96 +
    32 +
    3 * CARD_GAP +
    2 * cardInset +
    chromeY +
    PORTRAIT_WINGS_H
  const widthScale = (viewport.w - 2 * STAGE_PAD) / consoleNaturalWidth
  const heightScale =
    (viewport.h - NAV_H - (showTicketBanner ? BANNER_H : 0) - 2 * STAGE_PAD) / consoleNaturalHeight
  const consoleScale = Math.min(1, widthScale, portraitConsole ? heightScale : 1)

  const started = !!game?.startedAt
  const over = !!game && game.status !== 'in_progress'
  // 3x3 the armed sonar would scan.
  const aimArea = useMemo(() => {
    if (!sonarArmed || aim === null) return null
    return new Set([aim, ...neighbors(aim, cols, rows)])
  }, [sonarArmed, aim, cols, rows])

  let hint: string
  if (over) hint = 'Press R or the face to play again.'
  else if (sonarArmed) hint = 'Sonar: pick a tile to reveal mines in the 3×3 around it. Esc cancels.'
  else if (!started && !ranked)
    hint = signedIn ? 'No tickets left. Please add a ticket to play.' : 'Sign in and add a ticket to play.'
  else if (!started) hint = 'Dig any tile to start. The clock starts on your first dig.'
  else if (flagMode) hint = 'Flag mode: tap tiles to flag them. Flags are free.'
  else hint = 'Right-click or long-press to flag. Click a number to clear around it.'

  const resultTitle = !game
    ? ''
    : game.status === 'won'
      ? 'Board cleared!'
      : END_TITLE[game.end_reason ?? 'mine']

  // Power LED: green while a game runs, gold on a win, red on a loss.
  const ledClass = game?.status === 'won' ? 'is-won' : game?.status === 'lost' ? 'is-lost' : started ? 'is-on' : ''

  const chooseDig = () => {
    setFlagMode(false)
    audio.playClick()
  }
  const chooseFlag = () => {
    setFlagMode(true)
    audio.playFlag(true)
  }

  return (
    <div className={`ms-page ${compact ? 'is-compact' : ''} ${isShaking ? 'screen-shake' : ''}`}>
      <header className="ms-nav">
        <div className="ms-nav-left">
          <HubLink to="/" className="ms-back-link" aria-label="Back to arcade">
            ← <span className="ms-back-text">Arcade</span>
          </HubLink>
          <span className="ms-title">Minesweeper</span>
        </div>

        <div className="ms-diff" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={difficulty === d.key}
              className={`ms-diff-btn ${difficulty === d.key ? 'active' : ''}`}
              onClick={() => {
                invalidateSavedGame()
                setDifficulty(d.key)
              }}
              disabled={busy}
              title={`${d.cols}×${d.rows}, ${d.mines} mines, ${d.time}s, ${d.moves} moves`}
            >
              {compact ? d.label.slice(0, 3) : d.label}
            </button>
          ))}
        </div>

        <div className="ms-nav-right">
          {signedIn ? (
            <span
              className={`ms-tickets ${outOfTickets ? 'is-empty' : ''}`}
              title={
                outOfTickets
                  ? 'No tickets left. Please add a ticket to play.'
                  : 'Tickets left. Each game uses one.'
              }
            >
              🎟️ {outOfTickets && !compact ? 'No tickets left' : me.tickets}
            </span>
          ) : (
            me && <GoogleSignIn label={compact ? '' : 'Sign in & add ticket'} />
          )}
          <button
            type="button"
            className="ms-icon-btn"
            onClick={() => setSoundOn(audio.toggle())}
            title={soundOn ? 'Mute sound' : 'Turn sound on'}
            aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      {showTicketBanner && (
        <div className="ms-ticket-banner" role="status">
          <span aria-hidden="true">🎟️</span>
          <span className="ms-ticket-banner-text">
            {!signedIn ? (
              <>
                <b>Sign in and add a ticket to play.</b>{' '}
                {compact ? '' : 'You need to sign in and have at least one ticket to play Minesweeper.'}
              </>
            ) : (
              <>
                <b>No tickets left.</b>{' '}
                {compact
                  ? 'Please add a ticket to play.'
                  : 'You need at least one ticket to play Minesweeper. Ask a club admin to add a ticket.'}
              </>
            )}
          </span>
        </div>
      )}

      <main className="ms-stage">
        <div className={`gb-console ${portraitConsole ? 'is-portrait' : ''}`} style={consoleScale < 1 ? { zoom: consoleScale } : undefined}>
          <div className="gb-body">
            {/* Left wing: D-pad (decorative), Start = new game, Select = rules */}
            <div className="gb-wing gb-wing-left">
              <div className="gb-dpad" aria-hidden="true">
                <span className="gb-dpad-dot" />
              </div>
              <div className="gb-menu">
                <button type="button" className="gb-pill" onClick={restart} disabled={busy} aria-label="Start: new game (R)" title="Start: new game (R)">
                  <i />
                  <span>START</span>
                </button>
                  <button type="button" className="gb-pill" onClick={() => setHelpOpen(true)} aria-label="Help: how to play (?)" title="Help: how to play (?)">
                  <i />
                    <span>HELP</span>
                </button>
              </div>
            </div>

            {/* Screen bezel */}
            <div className="gb-bezel">
              <div className={`ms-card ${portraitConsole ? 'is-portrait' : ''}`} style={{ width: cardWidth }}>
                {/* Mines left, restart, time left */}
                <div className="ms-hud">
                  <div className="ms-readout">
                    <span className="ms-readout-label">Mines</span>
                    <span className="ms-lcd" aria-label="Mines left">
                      {formatDigits(game?.mines_left ?? currentConfig.mines)}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`ms-face ${over ? 'glow' : ''}`}
                    onClick={restart}
                    disabled={busy}
                    aria-label="New game"
                    title="New game (R)"
                  >
                    <PixelFace expression={face} />
                  </button>

                  <div className="ms-readout">
                    <span className="ms-readout-label">Time</span>
                    <span
                      className={`ms-lcd ${running && secondsLeft <= LOW_TIME ? 'is-low' : ''}`}
                      aria-label="Seconds left"
                    >
                      {formatDigits(Math.ceil(secondsLeft))}
                    </span>
                  </div>
                </div>

                {/* Minefield */}
                <div className="ms-board-wrap">
                  {game && view && (
                    <div className="ms-board-scroll" ref={boardViewportRef} style={{ width: boardWidth }}>
                      <div
                        className={`ms-board ${sonarArmed ? 'is-aiming' : ''}`}
                        role="group"
                        aria-label="Minefield"
                        style={{
                          gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
                          gridTemplateRows: `repeat(${rows}, ${tileSize}px)`,
                          width: boardWidth,
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onMouseLeave={() => setAim(null)}
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

                          let cls = 'ms-tile'
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
                          } else if (isMine && over) {
                            const isWon = game.status === 'won'
                            cls += isWon ? ' open defused' : ' open mine'
                            content = <MineGlyph defused={isWon} />
                            label = isWon ? 'Defused mine' : 'Mine'
                          } else if (missedPowerUp) {
                            cls += ' missed'
                            content = (
                              <span className="pu-badge" aria-hidden="true">
                                {POWERUP_ICON[missedPowerUp]}
                              </span>
                            )
                            label = `Hidden ${POWERUP_NAME[missedPowerUp]}`
                          }
                          if (aimArea?.has(i)) cls += ' in-aim'
                          // Tiles that act like opened ones: no digging, flagging or long-press.
                          const isSettled = isOpen || isDefused

                          return (
                            <button
                              key={i}
                              type="button"
                              className={cls}
                              aria-label={`Row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}: ${label}`}
                              onMouseEnter={sonarArmed ? () => setAim(i) : undefined}
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
                </div>

                {/* Power-ups and controls. The result covers this area so nothing moves. */}
                <div className="ms-panel">
                  <div className="ms-status">
                    <div
                      className={`ms-pu ${(game?.shields ?? 0) > 0 ? 'is-ready' : ''}`}
                      title="Shield: blocks the next mine you hit. Used automatically."
                    >
                      <span className="ms-pu-icon" aria-hidden="true">{POWERUP_ICON.shield}</span>
                      <span className="ms-pu-name">Shield</span>
                      <span className="ms-pu-count">{game?.shields ?? 0}</span>
                    </div>

                    <button
                      type="button"
                      className={`ms-pu ${canSonar ? 'is-ready' : ''} ${sonarArmed ? 'is-armed' : ''}`}
                      onClick={() => {
                        if (!canSonar) return
                        setSonarMode((on) => !on)
                        audio.playSonar()
                      }}
                      disabled={!canSonar}
                      aria-pressed={sonarArmed}
                      title="Sonar (S): pick a tile to reveal the mines in the 3×3 around it. Uses a move."
                    >
                      <span className="ms-pu-icon" aria-hidden="true">{POWERUP_ICON.sonar}</span>
                      <span className="ms-pu-name">Sonar</span>
                      <span className="ms-pu-count">{game?.sonars ?? 0}</span>
                    </button>
                  </div>

                  <div className="ms-controls">
                    <div className="ms-ab-mobile" role="group" aria-label="Game controls">
                      <button
                        type="button"
                        className={`gb-btn gb-btn-b flag ${flagMode ? 'is-on' : ''}`}
                        onClick={chooseFlag}
                        aria-pressed={flagMode}
                        aria-label="B: flag mode (F)"
                        title="B: flag mode (F)"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        className={`gb-btn gb-btn-a ${!flagMode ? 'is-on' : ''}`}
                        onClick={chooseDig}
                        aria-pressed={!flagMode}
                        aria-label="A: dig mode"
                        title="A: dig mode"
                      >
                        A
                      </button>
                    </div>
                    <div className="ms-toggle" role="group" aria-label="Tap mode">
                      <button
                        type="button"
                        className={!flagMode ? 'active' : ''}
                        aria-pressed={!flagMode}
                        onClick={chooseDig}
                      >
                        ⛏️ Dig
                      </button>
                      <button
                        type="button"
                        className={flagMode ? 'active flag' : ''}
                        aria-pressed={flagMode}
                        onClick={chooseFlag}
                        title="Flag mode (F)"
                      >
                        🚩 Flag
                      </button>
                    </div>
                  </div>

                  {game && over && (
                    <div className={`ms-result ${game.status}`} role="status">
                      <div className="ms-result-text">
                        <strong>{resultTitle}</strong>
                        <span>
                          {elapsed}s · {game.moves_used} moves
                          {typeof game.score === 'number' ? ` · Score ${game.score}` : ''}
                        </span>
                      </div>
                      <button type="button" className="ms-primary-btn" onClick={restart} disabled={busy}>
                        Play again
                      </button>
                    </div>
                  )}
                </div>

                {/* Power-up news takes over the hint line for a moment */}
                <p className={`ms-hint ${notice ? `is-notice ${notice.tone}` : ''}`} role="status">
                  {notice ? notice.text : hint}
                </p>
              </div>

              <div className="gb-logo" aria-hidden="true">
                <b>SWEEPER</b>
                <i>ADVANCE</i>
              </div>
            </div>

            {/* Right wing: power LED, B = flag mode, A = dig mode, speaker grille */}
            <div className="gb-wing gb-wing-right">
              <div className="gb-led-wrap" aria-hidden="true">
                <i className={`gb-led ${ledClass}`} />
                <span>POWER</span>
              </div>
              <div className="gb-ab">
                <button
                  type="button"
                  className={`gb-btn gb-btn-b flag ${flagMode ? 'is-on' : ''}`}
                  onClick={chooseFlag}
                  aria-pressed={flagMode}
                  aria-label="B: flag mode (F)"
                  title="B: flag mode (F)"
                >
                  B
                </button>
                <button
                  type="button"
                  className={`gb-btn gb-btn-a ${!flagMode ? 'is-on' : ''}`}
                  onClick={chooseDig}
                  aria-pressed={!flagMode}
                  aria-label="A: dig mode"
                  title="A: dig mode"
                >
                  A
                </button>
              </div>
              <div className="gb-grille" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </main>

      {helpOpen && (
        <div className="ms-help-backdrop" onClick={() => setHelpOpen(false)}>
          <div
            className="ms-help"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ms-help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ms-help-title">How to play</h2>
            <ul>
              <li>
                <b>Dig</b> a tile by clicking it. A number tells you how many of the 8 tiles around it
                are mines.
              </li>
              <li>
                <b>Flag</b> a tile you think is a mine: right-click, long-press, or use Flag mode (F or
                the B button). Flags are free.
              </li>
              <li>
                <b>Clear around</b> a number by clicking it once all its mines are flagged.
              </li>
              <li>
                <b>Beat the limits.</b> {currentConfig.label}: {currentConfig.time}s and{' '}
                {currentConfig.moves} moves. Digs, clears and sonar each use a move.
              </li>
            </ul>
            <h3>Power-ups</h3>
            <p className="ms-help-sub">Hidden under some safe tiles. Dig them up to collect them.</p>
            <ul className="ms-help-pu">
              <li>
                <span>{POWERUP_ICON.shield}</span>
                <div>
                  <b>Shield</b>: blocks the next mine you hit. Used automatically.
                </div>
              </li>
              <li>
                <span>{POWERUP_ICON.sonar}</span>
                <div>
                  <b>Sonar</b>: press S (or the Sonar button), then pick a tile to reveal every mine in
                  the 3×3 around it.
                </div>
              </li>
              <li>
                <span>{POWERUP_ICON.extender}</span>
                <div>
                  <b>Extender</b>: +{EXTEND_SECONDS} seconds and +{EXTEND_MOVES} moves, right away.
                </div>
              </li>
            </ul>
            <p className="ms-help-sub">Win bonus: 10 points per mine, plus points for time and moves left.</p>
            <button type="button" className="ms-primary-btn" onClick={() => setHelpOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}