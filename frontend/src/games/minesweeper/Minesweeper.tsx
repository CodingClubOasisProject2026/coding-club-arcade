import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api'
import { useAuth } from '../../auth'
import GoogleSignIn from '../../GoogleSignIn'
import { type Difficulty, type GameState, type MoveType, getGame, newGame, playMove } from './api'
import './Minesweeper.css'

const CURRENT_GAME_KEY = 'minesweeper.currentGame'
const SOUND_STORAGE_KEY = 'minesweeper.soundEnabled'

const DIFFICULTIES: { key: Difficulty; label: string; cols: number; rows: number; mines: number }[] = [
  { key: 'beginner', label: 'Beginner', cols: 9, rows: 9, mines: 10 },
  { key: 'intermediate', label: 'Intermediate', cols: 16, rows: 16, mines: 40 },
  { key: 'expert', label: 'Expert', cols: 30, rows: 16, mines: 99 },
]

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
  const [localStart, setLocalStart] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
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
  const isTouchDragging = useRef(false)

  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true

  const currentConfig = useMemo(() => {
    return DIFFICULTIES.find((d) => d.key === difficulty) ?? DIFFICULTIES[0]
  }, [difficulty])

  // Timer loop
  useEffect(() => {
    const isRunning = game?.status === 'in_progress' && (game.startedAt || localStart)
    if (!isRunning) return

    const startMs = game?.startedAt ? Date.parse(game.startedAt) : localStart || Date.now()
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)))
    }, 250)

    return () => clearInterval(interval)
  }, [game?.status, game?.startedAt, localStart])

  useEffect(() => {
    if (!game?.startedAt && !localStart) {
      setElapsed(0)
    }
  }, [game?.startedAt, localStart])

  // Local game fallback
  const startLocalGame = useCallback(() => {
    const config = currentConfig
    const localGame: GameState = {
      id: `local-${Date.now()}`,
      width: config.cols,
      height: config.rows,
      mine_count: config.mines,
      status: 'in_progress',
      move_count: 0,
      cells: [],
      flagged: [],
      mines_left: config.mines,
      startedAt: null,
      finishedAt: null,
      mines: undefined,
      exploded: [],
      score: 0,
    }
    setGame(localGame)
    setLocalStart(null)
    setElapsed(0)
    setTotalClicks(0)
    audio.playClick()
  }, [currentConfig])

  // Start new game
  const start = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const g = await newGame(difficulty)
      try {
        localStorage.setItem(CURRENT_GAME_KEY, g.id)
      } catch {
        // ignore
      }
      setGame(g)
      setLocalStart(null)
      setElapsed(0)
      setTotalClicks(0)
      audio.playClick()
    } catch (e) {
      startLocalGame()
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError('Practice mode. Sign in to record leaderboard scores.')
      } else if (e instanceof ApiError && e.status === 400) {
        setError('No tickets left. You are playing in practice mode.')
      }
    } finally {
      setBusy(false)
      refresh()
    }
  }, [difficulty, refresh, startLocalGame])

  // Start a fresh game on mount and whenever the difficulty changes.
  // (Calling start() from the pill's onClick would use the previous difficulty,
  // because the callback closes over the old value.)
  useEffect(() => {
    setZoom(1)
    setDismissedRotatePrompt(false)
    if (boardViewportRef.current) {
      boardViewportRef.current.scrollLeft = 0
      boardViewportRef.current.scrollTop = 0
    }
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty])

  // Win/Loss Audio triggers
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
  }, [start])

  // Move handler
  const move = useCallback(
    async (type: MoveType, index: number) => {
      if (!game || game.status !== 'in_progress' || pending.current) return
      pending.current = true
      setTotalClicks((c) => c + 1)

      if (navigator.vibrate) {
        navigator.vibrate(type === 'flag' ? 20 : 10)
      }

      // Local practice mode
      if (game.id.startsWith('local-')) {
        try {
          const { width, height, mine_count } = game
          const totalCells = width * height
          let currentMines = game.mines ? new Set(game.mines) : null
          const openedMap = new Map(game.cells)
          const flaggedSet = new Set(game.flagged)

          if (type === 'flag') {
            if (openedMap.has(index)) return
            if (flaggedSet.has(index)) {
              flaggedSet.delete(index)
              audio.playFlag(false)
            } else {
              if (flaggedSet.size >= mine_count) return
              flaggedSet.add(index)
              audio.playFlag(true)
            }
            setGame((g) =>
              g
                ? {
                  ...g,
                  flagged: Array.from(flaggedSet),
                  mines_left: mine_count - flaggedSet.size,
                }
                : null,
            )
            return
          }

          let isFirst = false
          if (!currentMines) {
            isFirst = true
            setLocalStart(Date.now())
            const safeZone = new Set<number>()
            const r0 = Math.floor(index / width)
            const c0 = index % width
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = r0 + dr
                const nc = c0 + dc
                if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
                  safeZone.add(nr * width + nc)
                }
              }
            }

            const candidates: number[] = []
            for (let i = 0; i < totalCells; i++) {
              if (!safeZone.has(i)) candidates.push(i)
            }
            for (let i = candidates.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
                ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
            }

            const placed = new Set(candidates.slice(0, mine_count))
            if (placed.size < mine_count) {
              for (let i = 0; i < totalCells; i++) {
                if (i !== index && placed.size < mine_count) placed.add(i)
              }
            }
            currentMines = placed
          }

          const getNeighbors = (idx: number) => {
            const r = Math.floor(idx / width)
            const c = idx % width
            const n: number[] = []
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue
                const nr = r + dr
                const nc = c + dc
                if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
                  n.push(nr * width + nc)
                }
              }
            }
            return n
          }

          if (type === 'chord') {
            const val = openedMap.get(index)
            if (val === undefined || val === 0) return
            const neighbors = getNeighbors(index)
            const flagCount = neighbors.filter((n) => flaggedSet.has(n)).length
            if (flagCount !== val) return

            const toReveal = neighbors.filter((n) => !flaggedSet.has(n) && !openedMap.has(n))
            if (toReveal.length === 0) return

            const hitMines = toReveal.filter((idx) => currentMines!.has(idx))
            if (hitMines.length > 0) {
              setGame((g) =>
                g
                  ? {
                    ...g,
                    status: 'lost',
                    mines: Array.from(currentMines!),
                    exploded: hitMines,
                    finishedAt: new Date().toISOString(),
                  }
                  : null,
              )
              return
            }

            const queue = [...toReveal]
            const newlyOpened: [number, number][] = []
            const visited = new Set<number>()

            while (queue.length > 0) {
              const curr = queue.shift()!
              if (visited.has(curr) || openedMap.has(curr) || flaggedSet.has(curr)) continue
              visited.add(curr)
              const nList = getNeighbors(curr)
              const adjMines = nList.filter((n) => currentMines!.has(n)).length
              newlyOpened.push([curr, adjMines])
              openedMap.set(curr, adjMines)

              if (adjMines === 0) {
                for (const n of nList) {
                  if (!visited.has(n) && !openedMap.has(n)) queue.push(n)
                }
              }
            }

            const allOpened = [...game.cells, ...newlyOpened]
            const won = allOpened.length === totalCells - mine_count
            setGame((g) =>
              g
                ? {
                  ...g,
                  mines: Array.from(currentMines!),
                  move_count: g.move_count + 1,
                  cells: allOpened,
                  status: won ? 'won' : 'in_progress',
                  score: won ? Math.max(100, 1000 - g.move_count * 2) : 0,
                  finishedAt: won ? new Date().toISOString() : null,
                }
                : null,
            )
            return
          }

          if (flaggedSet.has(index)) return
          if (openedMap.has(index)) {
            pending.current = false
            move('chord', index)
            return
          }

          if (currentMines.has(index)) {
            setGame((g) =>
              g
                ? {
                  ...g,
                  status: 'lost',
                  mines: Array.from(currentMines!),
                  exploded: [index],
                  finishedAt: new Date().toISOString(),
                }
                : null,
            )
            return
          }

          const queue = [index]
          const newlyOpened: [number, number][] = []
          const visited = new Set<number>()

          while (queue.length > 0) {
            const curr = queue.shift()!
            if (visited.has(curr) || openedMap.has(curr) || flaggedSet.has(curr)) continue
            visited.add(curr)

            const neighbors = getNeighbors(curr)
            const adjMines = neighbors.filter((n) => currentMines!.has(n)).length
            newlyOpened.push([curr, adjMines])
            openedMap.set(curr, adjMines)

            if (adjMines === 0) {
              for (const n of neighbors) {
                if (!visited.has(n) && !openedMap.has(n)) queue.push(n)
              }
            }
          }

          const allOpened = [...game.cells, ...newlyOpened]
          const won = allOpened.length === totalCells - mine_count
          const count = newlyOpened.length > 0 ? newlyOpened[0][1] : 0
          audio.playReveal(count, newlyOpened.length > 1 || isFirst)

          setGame((g) =>
            g
              ? {
                ...g,
                mines: Array.from(currentMines!),
                startedAt: g.startedAt || new Date().toISOString(),
                move_count: g.move_count + 1,
                cells: allOpened,
                status: won ? 'won' : 'in_progress',
                score: won ? Math.max(100, 1000 - g.move_count * 2) : 0,
                finishedAt: won ? new Date().toISOString() : null,
              }
              : null,
          )
        } finally {
          pending.current = false
        }
        return
      }

      // Backend Hub Mode
      try {
        const r = await playMove(game.id, game.move_count, type, index, game.width)
        if (type !== 'flag' && !game.startedAt && localStart === null) setLocalStart(Date.now())

        if (type === 'flag') {
          audio.playFlag(r.flagged.includes(index))
        } else {
          const firstCount = r.cells.length > 0 ? r.cells[0][1] : 0
          audio.playReveal(firstCount, r.cells.length > 1)
        }

        setGame((g) =>
          g
            ? {
              ...g,
              status: r.status,
              move_count: r.move_count,
              cells: [...g.cells, ...r.cells],
              flagged: r.flagged,
              mines_left: r.mines_left,
              mines: r.mines,
              exploded: r.exploded,
              score: r.score,
              finishedAt: r.status !== 'in_progress' ? new Date().toISOString() : g.finishedAt,
            }
            : null,
        )

        if (r.status !== 'in_progress') {
          getGame(game.id).then(setGame).catch(() => { })
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          getGame(game.id).then(setGame).catch(() => { })
        }
      } finally {
        pending.current = false
      }
    },
    [game, localStart],
  )

  const view = useMemo(() => {
    if (!game) return null
    return {
      opened: new Map(game.cells),
      flagged: new Set(game.flagged),
      mines: new Set(game.mines ?? []),
      exploded: new Set(game.exploded ?? []),
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

  const onCellClick = (index: number, isOpen: boolean, isFlag: boolean) => {
    if (didLongPress.current || isTouchDragging.current) {
      didLongPress.current = false
      isTouchDragging.current = false
      return
    }
    if (isOpen) {
      move('chord', index)
    } else if (flagMode) {
      move('flag', index)
    } else if (!isFlag) {
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
          {/* HUD: mines left, restart, timer */}
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

            <div className="ms-lcd-counter" title="Time in seconds" aria-label="Time in seconds">
              {formatDigits(elapsed)}
            </div>
          </div>

          {/* Minefield */}
          {game && view && (
            <div className="ms-board-viewport" ref={boardViewportRef}>
              <div
                className="ms-board-plate"
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

                  // SVG glyphs scale crisply with optimalTileSize
                  let cls = 'tile'
                  let content: React.ReactNode = null
                  let label = 'Hidden'

                  if (isOpen) {
                    cls += ` open n${n}`
                    content = n ? <span className="n-digit">{n}</span> : null
                    label = n ? `${n} adjacent` : 'Empty'
                  } else if (isExploded) {
                    cls += ' open boom'
                    content = <MineGlyph exploded />
                    label = 'Exploded mine'
                  } else if (isFlag) {
                    const isWrong = game.status === 'lost' && !isMine
                    cls += isWrong ? ' flag wrong' : ' flag'
                    content = <FlagGlyph isWrong={isWrong} />
                    label = isWrong ? 'Wrong flag' : 'Flagged'
                  } else if (isMine && game.status !== 'in_progress') {
                    const isDefused = game.status === 'won'
                    cls += isDefused ? ' open defused' : ' open mine'
                    content = <MineGlyph defused={isDefused} />
                    label = isDefused ? 'Defused mine' : 'Mine'
                  }

                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      style={{ width: `${optimalTileSize}px`, height: `${optimalTileSize}px` }}
                      aria-label={`Row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}: ${label}`}
                      onMouseDown={(e) => {
                        if (e.button === 0 && !isOpen && !isFlag) setIsClickingCell(true)
                      }}
                      onMouseUp={() => setIsClickingCell(false)}
                      onMouseLeave={() => setIsClickingCell(false)}
                      onTouchStart={(e) => onTouchStartCell(e, i, isOpen)}
                      onTouchMove={onTouchMoveCell}
                      onTouchEnd={onTouchEndCell}
                      onTouchCancel={onTouchEndCell}
                      onClick={() => onCellClick(i, isOpen, isFlag)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (!isOpen) move('flag', i)
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
          <div className="ms-telemetry-bar">
            <div className="telemetry-item">
              <span className="telemetry-lbl">APM</span>
              <span className="telemetry-val">{apm}</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-lbl">Moves</span>
              <span className="telemetry-val">{game?.move_count ?? 0}</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-lbl">Grid</span>
              <span className="telemetry-val">
                {cols}×{rows}
              </span>
            </div>
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
              Left-click to dig. Right-click to flag. Click a number to chord.
            </span>
          </div>

          {/* Result bar */}
          {game && game.status !== 'in_progress' && (
            <div className={`ms-status-toast ${game.status}`} role="status">
              <div className="toast-content">
                <strong>{game.status === 'won' ? 'Board cleared' : 'You hit a mine'}</strong>
                <span>
                  {elapsed}s · {game.move_count} moves · {apm} APM
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
