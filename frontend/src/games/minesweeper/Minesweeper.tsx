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
  scoreBreakdown,
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

// Tile maths. Every layout size is handed to the CSS as a custom property
// (see cssVars below), so the stylesheet and this maths can't drift apart.
const TILE_GAP = 2
const PLATE_PAD = 6
const MIN_TILE = 20
const MAX_TILE = 44
const MIN_SCREEN_W = 300

type Layout = 'console' | 'portrait'

type Sizes = {
  nav: number // top bar
  banner: number // no-tickets banner
  stageX: number // stage side padding
  stageY: number // stage top/bottom padding
  shoulder: number // how far the L/R bumpers stick out above the grips
  gripW: number // each grip's width (0 in portrait)
  gripDrop: number // how far the grips hang below the screen section
  coreX: number // grey shell around the screen, sides
  coreY: number // grey shell around the screen, top/bottom
  bezel: number // dark frame around the display (sides and bottom)
  bezelTop: number // label strip above the display (stripes, power LED)
  hud: number // readouts row inside the screen
  hint: number // hint line inside the screen
  gap: number // gap between HUD, board and hint
  deck: number // portrait control deck under the screen
  deckGap: number // gap between screen and deck
  dpad: number
  stick: number // speaker grille size
  btn: number // A/B/X/Y size
}

function sizesFor(layout: Layout, slim: boolean, compact: boolean): Sizes {
  if (layout === 'console' && !slim) {
    return {
      nav: 52, banner: 40, stageX: 20, stageY: 14, shoulder: 12, gripW: 196, gripDrop: 26,
      coreX: 14, coreY: 16, bezel: 10, bezelTop: 24, hud: 36, hint: 16, gap: 6, deck: 0, deckGap: 0,
      dpad: 112, stick: 76, btn: 40,
    }
  }
  if (layout === 'console') {
    return {
      nav: 44, banner: 32, stageX: 12, stageY: 6, shoulder: 8, gripW: 148, gripDrop: 14,
      coreX: 10, coreY: 10, bezel: 8, bezelTop: 14, hud: 30, hint: 14, gap: 4, deck: 0, deckGap: 0,
      dpad: 84, stick: 54, btn: 30,
    }
  }
  return {
    nav: 52, banner: 40, stageX: compact ? 10 : 16, stageY: 10, shoulder: 0, gripW: 0, gripDrop: 0,
    coreX: 10, coreY: 12, bezel: 8, bezelTop: 18, hud: 34, hint: 16, gap: 6, deck: 52, deckGap: 10,
    dpad: 0, stick: 0, btn: 0,
  }
}

const END_TITLE: Record<EndReason, string> = {
  mine: 'You hit a mine',
  time: 'Out of time',
  moves: 'Out of moves',
}

// ---------------------------------------------------------
// Pixel sprites: a = main, b = highlight, c = pennant, x = "wrong" cross
// ---------------------------------------------------------
const MINE_SPRITE = [
  '.....a.....',
  '.a...a...a.',
  '..aaaaaaa..',
  '..abbaaaa..',
  '.aabaaaaaa.',
  'aaaaaaaaaaa',
  '.aaaaaaaaa.',
  '..aaaaaaa..',
  '..aaaaaaa..',
  '.a...a...a.',
  '.....a.....',
]

const FLAG_SPRITE = [
  '...........',
  '....cca....',
  '..cccca....',
  '.ccccca....',
  '..cccca....',
  '....cca....',
  '......a....',
  '......a....',
  '....aaaaa..',
  '..aaaaaaaaa',
  '...........',
]

const CROSS_SPRITE = Array.from({ length: 11 }, (_, y) =>
  Array.from({ length: 11 }, (_, x) => (x >= 1 && x <= 9 && (x === y || x === 10 - y) ? 'x' : '.')).join(''),
)

function Sprite({ layers, className }: { layers: string[][]; className: string }) {
  const size = layers[0].length
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" aria-hidden="true">
      {layers.flatMap((rows, l) =>
        rows.flatMap((row, y) =>
          [...row].map((c, x) =>
            c === '.' ? null : (
              <rect key={`${l}-${x}-${y}`} x={x} y={y} width={1} height={1} className={`px-${c}`} />
            ),
          ),
        ),
      )}
    </svg>
  )
}

function MineGlyph({ exploded, defused }: { exploded?: boolean; defused?: boolean }) {
  return (
    <Sprite
      layers={[MINE_SPRITE]}
      className={`tile-icon ${exploded ? 'is-boom' : ''} ${defused ? 'is-defused' : ''}`}
    />
  )
}

function FlagGlyph({ isWrong }: { isWrong?: boolean }) {
  return <Sprite layers={isWrong ? [FLAG_SPRITE, CROSS_SPRITE] : [FLAG_SPRITE]} className="tile-icon" />
}

// ---------------------------------------------------------
// Chiptune sound effects (square waves)
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

  // One blip: frequency slides from `from` to `to` over `dur` seconds.
  private tone(ctx: AudioContext, from: number, to: number, at: number, dur: number, vol: number) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(from, at)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + dur)
    gain.gain.setValueAtTime(vol, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + dur)
  }

  playClick() {
    const ctx = this.getContext()
    if (!ctx) return
    this.tone(ctx, 600, 800, ctx.currentTime, 0.03, 0.04)
  }

  playReveal(count: number, isCascade: boolean = false) {
    const ctx = this.getContext()
    if (!ctx) return
    const freq = 340 + count * 55 + (isCascade ? 120 : 0)
    this.tone(ctx, freq, freq, ctx.currentTime, isCascade ? 0.12 : 0.05, isCascade ? 0.06 : 0.05)
  }

  playFlag(isFlagging: boolean) {
    const ctx = this.getContext()
    if (!ctx) return
    this.tone(ctx, isFlagging ? 1200 : 800, isFlagging ? 1800 : 400, ctx.currentTime, 0.04, 0.05)
  }

  playExplosion() {
    const ctx = this.getContext()
    if (!ctx) return
    this.tone(ctx, 120, 25, ctx.currentTime, 0.45, 0.16)
  }

  // Rising arpeggio for picking up a power-up.
  playPowerUp() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    ;[660, 880, 1320].forEach((freq, idx) => this.tone(ctx, freq, freq, now + idx * 0.05, 0.12, 0.04))
  }

  // Metallic clang when a shield blocks a mine.
  playShield() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.tone(ctx, 220, 880, now, 0.08, 0.1)
    this.tone(ctx, 880, 330, now + 0.08, 0.27, 0.1)
  }

  // Two sonar pings.
  playSonar() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    ;[0, 0.18].forEach((delay) => this.tone(ctx, 1400, 900, now + delay, 0.16, 0.05))
  }

  playWin() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime
    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) =>
      this.tone(ctx, freq, freq, now + idx * 0.07, 0.22, 0.06),
    )
  }
}

const audio = new MinesweeperAudio()

function formatDigits(num: number): string {
  const clamped = Math.max(-99, Math.min(999, num))
  if (clamped < 0) return '-' + String(Math.abs(clamped)).padStart(2, '0')
  return String(clamped).padStart(3, '0')
}

function Readout({ label, value, ariaLabel, low }: { label: string; value: string; ariaLabel: string; low?: boolean }) {
  return (
    <div className="ms-readout">
      <span className="ms-readout-label">{label}</span>
      <span className={`ms-lcd ${low ? 'is-low' : ''}`} aria-label={ariaLabel}>
        {value}
      </span>
    </div>
  )
}

type Actions = {
  helpOpen: boolean
  pressA: () => void
  pressB: () => void
  moveCursor: (dx: number, dy: number) => void
  start: () => void
  toggleFlagMode: () => void
  toggleSonar: () => void
  toggleSound: () => void
  shiftDifficulty: (dir: 1 | -1) => void
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
  // Console cursor, moved by the D-pad / arrow keys. null until first used.
  const [cursor, setCursor] = useState<number | null>(null)
  // D-pad press direction, for the little rocking animation.
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

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
  const boardRef = useRef<HTMLDivElement | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const difficultyRef = useRef(difficulty)
  const skipNextResetRef = useRef(false)
  const sessionStartedRef = useRef(false)
  const isTouchDragging = useRef(false)
  const tiltTimer = useRef<number | null>(null)
  const actions = useRef<Actions | null>(null)

  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true
  // Ranked games need a signed-in player with a ticket.
  const ranked = signedIn && me.tickets > 0
  const outOfTickets = signedIn && me.tickets === 0
  // Once we know who's playing, a player who can't play ranked starts in practice.
  const practiceOnly = !!me && !ranked

  const currentConfig = useMemo(() => {
    return DIFFICULTIES.find((d) => d.key === difficulty) ?? DIFFICULTIES[0]
  }, [difficulty])
  const diffIndex = DIFFICULTIES.findIndex((d) => d.key === difficulty)

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
    if (!game?.startedAt) setElapsed(0)
  }, [game?.startedAt])

  // Countdown. Every board update carries fresh `time_left`, so the deadline is
  // rebuilt from it on each update, using our own clock.
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
    deadline !== null ? Math.max(0, (deadline - nowMs) / 1000) : (game?.time_left ?? currentConfig.time)

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

  // Reset to a blank board. No ticket is spent until the first reveal.
  const start = useCallback(() => {
    if (pending.current) return
    setGame(blankBoard('pending'))
    setElapsed(0)
    setSonarMode(false)
    setNotice(null)
    audio.playClick()
  }, [blankBoard])

  // An untouched board follows the player's tickets: practice when they can't
  // play ranked, ranked again once they can.
  useEffect(() => {
    setGame((g) => {
      if (!g || g.move_count > 0 || g.startedAt) return g
      if (practiceOnly && g.id.startsWith('pending-')) return { ...g, id: g.id.replace('pending-', 'local-') }
      if (!practiceOnly && g.id.startsWith('local-')) return { ...g, id: g.id.replace('local-', 'pending-') }
      return g
    })
  }, [practiceOnly, game?.id])

  // Short pop-up for power-up events.
  const showNotice = useCallback((text: string, tone: 'good' | 'info' = 'good') => {
    setNotice({ text, tone, id: Date.now() })
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  // A finished game uses the hint line for the score breakdown.
  const finished = !!game && game.status !== 'in_progress'
  useEffect(() => {
    if (finished) setNotice(null)
  }, [finished])

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
    } catch {
      // Signed out, out of tickets, or offline: play a practice game.
      return blankBoard('local')
    } finally {
      setBusy(false)
      refresh()
    }
  }, [blankBoard, difficulty, refresh])

  // Show a blank board on mount and whenever the difficulty changes.
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
        // Gone, or not this user's game. Network errors keep the id for next time.
        if (!cancelled && e instanceof ApiError && [401, 403, 404].includes(e.status)) forget()
      })
    return () => {
      cancelled = true
    }
  }, [])

  // When the countdown reaches zero, end the game. Practice games end here; for
  // ranked games the server decides, so ask it.
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

  // Win / loss audio and shake.
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
          else if (kind === 'sonar') messages.push('📡 Sonar ready (X)')
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
          getGame(current.id).then(setGame).catch(() => {})
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          getGame(current.id).then(setGame).catch(() => {})
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

  // Long-press to flag on touch, cancelled by dragging so the board can scroll.
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
      if (game?.status === 'in_progress') move('flag', index)
    }, 320)
  }

  const onTouchMoveCell = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !e.touches || !e.touches[0]) return
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y)
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
    return around.filter(isMarked).length === value && around.some((n) => !view.opened.has(n) && !isMarked(n))
  }

  const onCellClick = (index: number, isOpen: boolean, isFlag: boolean, isDetected: boolean) => {
    if (didLongPress.current || isTouchDragging.current) {
      didLongPress.current = false
      isTouchDragging.current = false
      return
    }
    if (sonarArmed) {
      // Sonar can only be aimed at hidden tiles; stay armed otherwise.
      if (isOpen) return
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

  // ---------- Console controls ----------

  const cols = game?.width ?? currentConfig.cols
  const rows = game?.height ?? currentConfig.rows
  const centerTile = Math.floor(rows / 2) * cols + Math.floor(cols / 2)

  // A new board size makes the old cursor position meaningless.
  useEffect(() => {
    setCursor(null)
  }, [cols, rows])

  // Keep the cursor tile visible on boards that scroll.
  useEffect(() => {
    if (cursor === null) return
    const el = boardRef.current?.children[cursor] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cursor])

  const moveCursor = (dx: number, dy: number) => {
    setCursor((c) => {
      if (c === null || c >= cols * rows) return centerTile
      const col = Math.min(cols - 1, Math.max(0, (c % cols) + dx))
      const row = Math.min(rows - 1, Math.max(0, Math.floor(c / cols) + dy))
      return row * cols + col
    })
    setTilt({ x: dx, y: dy })
    if (tiltTimer.current) clearTimeout(tiltTimer.current)
    tiltTimer.current = window.setTimeout(() => setTilt({ x: 0, y: 0 }), 140)
  }

  // The tile under the cursor. The first press only shows the cursor.
  const cursorTile = (): number | null => {
    if (cursor !== null && cursor < cols * rows) return cursor
    setCursor(centerTile)
    audio.playClick()
    return null
  }

  // A: dig (or clear around a number, or fire an armed sonar) at the cursor.
  const pressA = () => {
    if (!view) return
    const i = cursorTile()
    if (i === null || view.defused.has(i)) return
    const isOpen = view.opened.has(i)
    if (sonarArmed) {
      if (isOpen) return
      setSonarMode(false)
      move('sonar', i)
    } else if (isOpen) {
      if (canChord(i)) move('chord', i)
    } else if (!view.flagged.has(i) && !view.detected.has(i)) {
      move('reveal', i)
    }
  }

  // B: flag at the cursor.
  const pressB = () => {
    if (!view) return
    const i = cursorTile()
    if (i === null || view.opened.has(i) || view.defused.has(i)) return
    move('flag', i)
  }

  const toggleFlagMode = () => {
    const next = !flagMode
    setFlagMode(next)
    audio.playFlag(next)
  }

  const setTapMode = (flag: boolean) => {
    setFlagMode(flag)
    if (flag) audio.playFlag(true)
    else audio.playClick()
  }

  const toggleSonar = () => {
    if (!canSonar) return
    const next = !sonarArmed
    setSonarMode(next)
    if (next) audio.playSonar()
  }

  const toggleSound = () => setSoundOn(audio.toggle())

  const shiftDifficulty = (dir: 1 | -1) => {
    const next = DIFFICULTIES[diffIndex + dir]
    if (!next || busy) return
    setDifficulty(next.key)
  }

  // Latest handlers for the keyboard listener, so it's only attached once.
  useEffect(() => {
    actions.current = {
      helpOpen, pressA, pressB, moveCursor, start, toggleFlagMode, toggleSonar, toggleSound, shiftDifficulty,
    }
  })

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actions.current
      if (!a) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        setSonarMode(false)
        setHelpOpen(false)
        return
      }
      if (e.key === '?') {
        setHelpOpen((open) => !open)
        return
      }
      if (a.helpOpen) return

      const arrows: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }
      if (arrows[e.key]) {
        e.preventDefault()
        a.moveCursor(...arrows[e.key])
        return
      }

      switch (e.key) {
        case 'Enter':
          // A focused button handles Enter itself.
          if (e.target instanceof HTMLButtonElement) return
          e.preventDefault()
          a.pressA()
          break
        case 'a':
        case 'A':
          a.pressA()
          break
        case 'b':
        case 'B':
          a.pressB()
          break
        case 'r':
        case 'R':
          a.start()
          break
        case ' ':
        case 'f':
        case 'F':
        case 'y':
        case 'Y':
          e.preventDefault()
          a.toggleFlagMode()
          break
        case 's':
        case 'S':
        case 'x':
        case 'X':
          a.toggleSonar()
          break
        case 'm':
        case 'M':
          a.toggleSound()
          break
        case '[':
          a.shiftDifficulty(-1)
          break
        case ']':
          a.shiftDifficulty(1)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- Layout ----------
  // 'console': grips beside the screen (laptops, phones held sideways).
  // 'portrait': screen over a control deck (phones held upright).
  const layout: Layout = viewport.w > viewport.h && viewport.w >= 560 ? 'console' : 'portrait'
  const isConsole = layout === 'console'
  const slim = isConsole && (viewport.h <= 560 || viewport.w < 1100)
  const short = viewport.h <= 560
  const compact = viewport.w <= 640
  const S = sizesFor(layout, slim, compact)

  // Only while playing practice because of tickets.
  const showTicketBanner = outOfTickets && !!game && game.id.startsWith('local-')

  const availW = viewport.w - 2 * S.stageX - 2 * S.gripW - 2 * S.coreX - 2 * S.bezel - 2 * PLATE_PAD
  const availH =
    viewport.h -
    S.nav -
    (showTicketBanner ? S.banner : 0) -
    2 * S.stageY -
    S.shoulder -
    S.gripDrop -
    2 * S.coreY -
    S.bezelTop -
    S.bezel -
    S.hud -
    S.hint -
    2 * S.gap -
    S.deck -
    S.deckGap -
    2 * PLATE_PAD
  const fit = Math.floor(
    Math.min((availW - (cols - 1) * TILE_GAP) / cols, (availH - (rows - 1) * TILE_GAP) / rows),
  )
  const tileSize = Math.max(MIN_TILE, Math.min(MAX_TILE, fit))
  const boardWidth = cols * tileSize + (cols - 1) * TILE_GAP + 2 * PLATE_PAD
  const boardHeight = rows * tileSize + (rows - 1) * TILE_GAP + 2 * PLATE_PAD
  // Boards bigger than the screen scroll inside it.
  const maxW = Math.max(availW + 2 * PLATE_PAD, 120)
  const maxH = Math.max(availH + 2 * PLATE_PAD, 120)
  const scrollW = Math.min(boardWidth, maxW)
  const scrollH = Math.min(boardHeight, maxH)
  const screenW = Math.min(Math.max(scrollW, MIN_SCREEN_W), maxW)

  const cssVars = Object.fromEntries(
    Object.entries({
      'nav-h': S.nav,
      'banner-h': S.banner,
      'stage-x': S.stageX,
      'stage-y': S.stageY,
      shoulder: S.shoulder,
      'grip-w': S.gripW,
      'grip-drop': S.gripDrop,
      'core-x': S.coreX,
      'core-y': S.coreY,
      bezel: S.bezel,
      'bezel-top': S.bezelTop,
      'hud-h': S.hud,
      'hint-h': S.hint,
      'display-gap': S.gap,
      'deck-h': S.deck,
      'deck-gap': S.deckGap,
      dpad: S.dpad,
      stick: S.stick,
      'face-btn': S.btn,
      'tile-gap': TILE_GAP,
      'plate-pad': PLATE_PAD,
    }).map(([k, v]) => [`--${k}`, `${v}px`]),
  ) as React.CSSProperties

  const started = !!game?.startedAt
  const over = !!game && game.status !== 'in_progress'
  const totalMoves = game && game.moves_left !== null ? game.moves_left + game.moves_used : null
  const movesFraction = totalMoves ? (movesLeft ?? 0) / totalMoves : 1
  const lowOnTime = running && secondsLeft <= LOW_TIME
  const lowOnMoves = movesLeft !== null && movesLeft <= LOW_MOVES && !over
  const shields = game?.shields ?? 0
  const sonars = game?.sonars ?? 0

  // Drives the power LED.
  const mood =
    game?.status === 'won'
      ? 'won'
      : game?.status === 'lost'
        ? 'lost'
        : sonarArmed
          ? 'armed'
          : started && (lowOnTime || lowOnMoves)
            ? 'low'
            : 'idle'

  // 3x3 the armed sonar would scan: under the mouse, or under the cursor.
  const aimArea = useMemo(() => {
    const at = aim ?? cursor
    if (!sonarArmed || at === null || at >= cols * rows) return null
    return new Set([at, ...neighbors(at, cols, rows)])
  }, [sonarArmed, aim, cursor, cols, rows])

  // Known before the first dig, so the hint (not a pop-up) can say it.
  const isPractice = game ? game.id.startsWith('local-') || (game.id.startsWith('pending-') && !ranked) : !ranked

  let hint: string
  // On finish, the hint line shows how the score adds up (when it matches the
  // score we were given; the server is the source of truth).
  const breakdown = game && over ? scoreBreakdown(game) : null
  const showBreakdown = !!breakdown && typeof game?.score === 'number' && breakdown.total === game.score

  if (over && showBreakdown && game.status === 'won')
    hint = `${breakdown.parts.map((p) => `${p.points} ${p.label}`).join(' + ')} = ${breakdown.total}`
  else if (over && showBreakdown) hint = `${breakdown.total} points for tiles opened. Bonuses only count on a win.`
  else if (over) hint = 'Press START (R) or the face to play again.'
  else if (sonarArmed) hint = 'Sonar: pick a hidden tile to reveal mines in the 3×3 around it. Esc cancels.'
  else if (!started && isPractice)
    hint = signedIn
      ? 'No tickets left, so this is a practice game. Dig to start.'
      : 'Practice game. Sign in to save scores. Dig to start.'
  else if (!started) hint = 'Dig any tile to start. The clock starts on your first dig.'
  else if (flagMode) hint = 'Flag mode: tap tiles to flag them. Flags are free.'
  else if (cursor !== null) hint = 'D-pad moves the cursor. A digs, B flags, X fires sonar.'
  else hint = 'Right-click or long-press to flag. Click a number to clear around it.'

  const resultTitle = !game ? '' : game.status === 'won' ? 'Board cleared!' : END_TITLE[game.end_reason ?? 'mine']

  return (
    <div
      className={`ms-page layout-${layout} mood-${mood} ${slim ? 'is-slim' : ''} ${short ? 'is-short' : ''} ${compact ? 'is-compact' : ''}`}
      style={cssVars}
    >
      <header className="ms-nav">
        <div className="ms-nav-left">
          <Link to="/" className="ms-back-link" aria-label="Back to arcade">
            ← <span className="ms-back-text">Arcade</span>
          </Link>
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
              onClick={() => setDifficulty(d.key)}
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
                  ? 'No tickets left. You can still play practice games, but scores are not saved.'
                  : 'Tickets left. Each ranked game uses one.'
              }
            >
              🎟️ {outOfTickets && !compact ? 'No tickets left' : me.tickets}
            </span>
          ) : (
            me && <GoogleSignIn label={compact ? '' : 'Sign in'} />
          )}
          <button
            type="button"
            className="ms-icon-btn ms-nav-sound"
            onClick={toggleSound}
            title={soundOn ? 'Mute sound (M)' : 'Turn sound on (M)'}
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
            <b>No tickets left.</b>{' '}
            {compact
              ? 'Practice mode: scores aren’t saved.'
              : 'You’re in practice mode, so scores aren’t saved. Ask a club admin for more tickets.'}
          </span>
        </div>
      )}

      <main className="ms-stage">
        <div className={`ms-shell ${isShaking ? 'is-shaking' : ''}`}>
          {/* ---------- Left grip ---------- */}
          {isConsole && (
            <div className="ms-grip left">
              <button
                type="button"
                className="ms-shoulder"
                onClick={() => shiftDifficulty(-1)}
                disabled={busy || diffIndex <= 0}
                aria-label="Easier difficulty"
                title="Easier difficulty ([)"
              >
                L
              </button>

              <div className="ms-dpad">
                <div
                  className="ms-dpad-cross"
                  role="group"
                  aria-label="Move cursor"
                  style={{
                    transform: `perspective(160px) rotateX(${-tilt.y * 14}deg) rotateY(${tilt.x * 14}deg)`,
                  }}
                >
                  <button type="button" className="up" onClick={() => moveCursor(0, -1)} aria-label="Cursor up" />
                  <button type="button" className="left" onClick={() => moveCursor(-1, 0)} aria-label="Cursor left" />
                  <span className="hub" aria-hidden="true" />
                  <button type="button" className="right" onClick={() => moveCursor(1, 0)} aria-label="Cursor right" />
                  <button type="button" className="down" onClick={() => moveCursor(0, 1)} aria-label="Cursor down" />
                </div>
              </div>

              <div className="ms-pills">
                <button
                  type="button"
                  className={`ms-pill ${soundOn ? '' : 'is-off'}`}
                  onClick={toggleSound}
                  aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}
                  title="Sound (M)"
                >
                  <span className="ms-pill-cap" />
                  <span className="ms-pill-label">{soundOn ? 'SOUND' : 'MUTED'}</span>
                </button>
                <button type="button" className="ms-pill" onClick={() => setHelpOpen(true)} title="How to play (?)">
                  <span className="ms-pill-cap" />
                  <span className="ms-pill-label">RULES</span>
                </button>
              </div>

              <span className="ms-emboss" aria-hidden="true">
                POCKET
                <br />
                SWEEPER
              </span>
            </div>
          )}

          {/* ---------- Screen ---------- */}
          <div className="ms-core">
            <div className="ms-screen">
              {isPractice && !showTicketBanner && <span className="ms-practice-tag">Practice · not ranked</span>}

              <div className="ms-bezel-label" aria-hidden="true">
                <span className="ms-power">
                  <i />
                  POWER
                </span>
                <span className="ms-stripes" />
                <span className="ms-brand">MINESWEEPER · 8-BIT LCD</span>
                <span className="ms-stripes" />
              </div>

              <div className="ms-display" style={{ width: screenW }}>
                <div className="ms-hud">
                  <div className="ms-hud-group">
                    <Readout
                      label="Mines"
                      ariaLabel="Mines left"
                      value={formatDigits(game?.mines_left ?? currentConfig.mines)}
                    />
                    <Readout
                      label="Moves"
                      ariaLabel="Moves left"
                      value={movesLeft === null ? '---' : formatDigits(movesLeft)}
                      low={lowOnMoves}
                    />
                  </div>

                  <button
                    type="button"
                    className={`ms-face ${over ? 'glow' : ''}`}
                    onClick={start}
                    disabled={busy}
                    aria-label="New game"
                    title="New game (R)"
                  >
                    <span>{face}</span>
                  </button>

                  <div className="ms-hud-group end">
                    <div className="ms-hud-pu">
                      <span
                        className={shields > 0 ? 'on' : ''}
                        title="Shield: blocks the next mine you hit. Used automatically."
                      >
                        <em>{POWERUP_ICON.shield}</em>
                        <b>{shields}</b>
                      </span>
                      <span className={canSonar ? 'on' : ''} title="Sonar (X): reveals the mines in a 3×3.">
                        <em>{POWERUP_ICON.sonar}</em>
                        <b>{sonars}</b>
                      </span>
                    </div>
                    <Readout
                      label="Time"
                      ariaLabel="Seconds left"
                      value={formatDigits(Math.ceil(secondsLeft))}
                      low={lowOnTime}
                    />
                  </div>

                  <div className={`ms-meter ${lowOnMoves ? 'is-low' : ''}`} aria-hidden="true">
                    <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, movesFraction))})` }} />
                  </div>
                </div>

                <div className="ms-board-wrap">
                  {game && view && (
                    <div
                      className="ms-board-scroll"
                      ref={boardViewportRef}
                      style={{ width: scrollW, height: scrollH }}
                    >
                      <div
                        ref={boardRef}
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
                          if (cursor === i) cls += ' is-cursor'
                          if (aimArea?.has(i)) cls += ' in-aim'
                          // Tiles that act like opened ones: no digging, flagging or long-press.
                          const isSettled = isOpen || isDefused

                          return (
                            <button
                              key={i}
                              type="button"
                              className={cls}
                              aria-label={`Row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}: ${label}`}
                              onMouseEnter={sonarArmed ? () => setAim(isSettled ? null : i) : undefined}
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
                                // Once the cursor is in use, it follows clicks too.
                                setCursor((c) => (c === null ? c : i))
                                if (isDefused) return
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

                  {game && over && (
                    <div className={`ms-result ${game.status}`} role="status">
                      <div className="ms-result-text">
                        <strong>{resultTitle}</strong>
                        <span>
                          {elapsed}s · {game.moves_used} moves
                          {isPractice ? ' · not saved' : ''}
                        </span>
                      </div>
                      <div className="ms-final-score" aria-label={`Final score ${game.score ?? 0}`}>
                        <span className="ms-readout-label">Score</span>
                        <span className="ms-final-score-val">{game.score ?? '—'}</span>
                      </div>
                      <button type="button" className="ms-primary-btn" onClick={start} disabled={busy}>
                        Play again
                      </button>
                    </div>
                  )}
                </div>

                <p className={`ms-hint ${notice ? `is-notice ${notice.tone}` : ''}`} role="status">
                  {notice ? notice.text : hint}
                </p>
              </div>
            </div>

            {/* ---------- Portrait control deck ---------- */}
            {!isConsole && (
              <div className="ms-deck">
                <div className="ms-toggle" role="group" aria-label="Tap mode">
                  <button
                    type="button"
                    className={!flagMode ? 'active' : ''}
                    aria-pressed={!flagMode}
                    onClick={() => setTapMode(false)}
                  >
                    ⛏️ Dig
                  </button>
                  <button
                    type="button"
                    className={flagMode ? 'active flag' : ''}
                    aria-pressed={flagMode}
                    onClick={() => setTapMode(true)}
                  >
                    🚩 Flag
                  </button>
                </div>
                <button
                  type="button"
                  className={`ms-round ${canSonar ? 'is-ready' : ''} ${sonarArmed ? 'is-armed' : ''}`}
                  onClick={toggleSonar}
                  disabled={!canSonar}
                  aria-pressed={sonarArmed}
                  aria-label={`Sonar, ${sonars} left`}
                  title="Sonar: pick a hidden tile to reveal the mines in the 3×3 around it. Uses a move."
                >
                  {POWERUP_ICON.sonar}
                  {sonars > 0 && <i className="ms-badge">{sonars}</i>}
                </button>
                <div
                  className={`ms-round is-static ${shields > 0 ? 'is-ready' : ''}`}
                  title="Shield: blocks the next mine you hit. Used automatically."
                  aria-label={`Shields: ${shields}`}
                >
                  {POWERUP_ICON.shield}
                  {shields > 0 && <i className="ms-badge">{shields}</i>}
                </div>
                <button
                  type="button"
                  className="ms-round help"
                  onClick={() => setHelpOpen(true)}
                  aria-label="How to play"
                >
                  ?
                </button>
              </div>
            )}
          </div>

          {/* ---------- Right grip ---------- */}
          {isConsole && (
            <div className="ms-grip right">
              <button
                type="button"
                className="ms-shoulder"
                onClick={() => shiftDifficulty(1)}
                disabled={busy || diffIndex >= DIFFICULTIES.length - 1}
                aria-label="Harder difficulty"
                title="Harder difficulty (])"
              >
                R
              </button>

              <div className="ms-abxy" role="group" aria-label="Action buttons">
                <button
                  type="button"
                  className={`ms-fbtn x ${canSonar ? 'is-ready' : ''} ${sonarArmed ? 'is-armed' : ''}`}
                  onClick={toggleSonar}
                  disabled={!canSonar}
                  aria-pressed={sonarArmed}
                  aria-label={`X: sonar, ${sonars} left`}
                  title="Sonar (X or S)"
                >
                  X{sonars > 0 && <i className="ms-badge">{sonars}</i>}
                </button>
                <button
                  type="button"
                  className={`ms-fbtn y ${flagMode ? 'is-on' : ''}`}
                  onClick={toggleFlagMode}
                  aria-pressed={flagMode}
                  aria-label="Y: switch tap mode between dig and flag"
                  title="Tap mode (Y or F)"
                >
                  Y
                </button>
                <button
                  type="button"
                  className="ms-fbtn a"
                  onClick={pressA}
                  aria-label="A: dig at cursor"
                  title="Dig (A or Enter)"
                >
                  A
                </button>
                <button type="button" className="ms-fbtn b" onClick={pressB} aria-label="B: flag at cursor" title="Flag (B)">
                  B
                </button>
              </div>

              <div className="ms-legend" aria-hidden="true">
                <span>A DIG</span>
                <span>B FLAG</span>
                <span>X SONAR</span>
                <span>Y {flagMode ? 'FLAG' : 'DIG'}</span>
              </div>

              <div className="ms-pills">
                <button type="button" className="ms-pill" onClick={start} disabled={busy} title="New game (R)">
                  <span className="ms-pill-cap" />
                  <span className="ms-pill-label">START</span>
                </button>
              </div>

              <div className="ms-speaker" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
          )}
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
                <b>Dig</b> a tile by clicking it. A number tells you how many of the 8 tiles around it are mines.
              </li>
              <li>
                <b>Flag</b> a tile you think is a mine: right-click, long-press, or switch to Flag mode. Flags are free.
              </li>
              <li>
                <b>Clear around</b> a number by clicking it once all its mines are flagged.
              </li>
              <li>
                <b>Beat the limits.</b> {currentConfig.label}: {currentConfig.time}s and {currentConfig.moves} moves.
                Digs, clears and sonar each use a move.
              </li>
            </ul>

            <h3>Controls</h3>
            <ul className="ms-help-keys">
              <li>
                <kbd>D-pad</kbd> / <kbd>←↑↓→</kbd> move the cursor
              </li>
              <li>
                <kbd>A</kbd> / <kbd>Enter</kbd> dig · <kbd>B</kbd> flag
              </li>
              <li>
                <kbd>X</kbd> / <kbd>S</kbd> sonar · <kbd>Y</kbd> / <kbd>F</kbd> switch tap mode
              </li>
              <li>
                <kbd>START</kbd> / <kbd>R</kbd> new game · <kbd>L</kbd> <kbd>R</kbd> / <kbd>[</kbd> <kbd>]</kbd>{' '}
                difficulty
              </li>
              <li>
                <kbd>M</kbd> sound · <kbd>?</kbd> this help
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
                  <b>Sonar</b>: press X, then pick a tile to reveal every mine in the 3×3 around it.
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