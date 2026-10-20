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
  const [boardSpace, setBoardSpace] = useState({ width: 0, height: 0 })

  const lossDialogRef = useRef<HTMLDialogElement | null>(null)
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
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty])

  // Native modal handles focus trapping, Escape, and focus restoration.
  useEffect(() => {
    const dialog = lossDialogRef.current
    if (game?.status === 'lost') {
      if (dialog && !dialog.open) dialog.showModal()
    } else {
      dialog?.close()
    }
  }, [game?.status, game?.id])

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
      if (lossDialogRef.current?.open) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'r' || e.key === 'R') {
        start()
      } else if (e.key === ' ' || e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFlagMode((f) => {
          audio.playFlag(!f)
          return !f
        })

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
          getGame(game.id).then(setGame).catch(() => {})
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          getGame(game.id).then(setGame).catch(() => {})
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

  // Measure the board slot, not the window: headers, controls, and banners
  // are already accounted for by CSS layout. Fractional cells fit small screens.
  useEffect(() => {
    const slot = boardViewportRef.current
    if (!slot) return
    const observer = new ResizeObserver(([entry]) => {
      setBoardSpace({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(slot)
    return () => observer.disconnect()
  }, [])

  const boardGap = boardSpace.width < 480 ? 1 : 2
  const optimalTileSize = Math.max(0, Math.min(56,
    (boardSpace.width - 12 - (cols - 1) * boardGap) / cols,
    (boardSpace.height - 12 - (rows - 1) * boardGap) / rows,
  ))
  const safeCells = cols * rows - (game?.mine_count ?? currentConfig.mines)
  const clearedPercent = Math.round(((view?.opened.size ?? 0) / safeCells) * 100)

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
            aria-pressed={soundOn}
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

      <main className="ms-main-stage">
        <div className={`ms-cabinet-card ${busy ? 'is-loading' : ''} ${game?.status === 'won' ? 'is-victory' : ''}`}>
          <div className="ms-board-heading">
            <div><span className="ms-eyebrow">CC ARCADE™ / POCKET SYSTEM</span><h2>Minesweeper <span className="ms-console-edition">{currentConfig.label}</span></h2></div>
            <span className="ms-session-badge">{game?.id.startsWith('local-') ? 'Practice' : 'Arcade'} mode</span>
          </div>
          {/* HUD: mines left, restart, timer */}
          <div className="ms-hud-panel">
            <div className="ms-counter-group"><span className="ms-counter-label">Mines left</span><div className="ms-lcd-counter" title="Mines left" aria-label="Mines left">
              {formatDigits(game?.mines_left ?? currentConfig.mines)}
            </div></div>

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

            <div className="ms-counter-group"><span className="ms-counter-label">Time / sec</span><div className="ms-lcd-counter" title="Time in seconds" aria-label="Time in seconds">
              {formatDigits(elapsed)}
            </div></div>
          </div>

          {/* Minefield */}
          <div className="ms-board-viewport" ref={boardViewportRef}>
            {game && view && optimalTileSize > 0 && (
              <div
                className="ms-board-plate"
                role="group"
                aria-label="Minefield"
                style={{
                  gridTemplateColumns: `repeat(${cols}, ${optimalTileSize}px)`,
                  gridTemplateRows: `repeat(${rows}, ${optimalTileSize}px)`,
                  width: cols * optimalTileSize + (cols - 1) * boardGap + 12,
                  gap: boardGap,
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {Array.from({ length: cols * rows }, (_, i) => {
                  const n = view.opened.get(i)
                  const isOpen = n !== undefined
                  const isFlag = view.flagged.has(i)
                  const isMine = view.mines.has(i)
                  const isExploded = view.exploded.has(i)

                  // Flag, mine and explosion glyphs are drawn by the stylesheet (::after),
                  // so they scale with the tile. Only digits are rendered here.
                  let cls = 'tile'
                  let content: React.ReactNode = null
                  let label = 'Hidden'

                  if (isOpen) {
                    cls += ` open n${n}`
                    content = n ? <span className="n-digit">{n}</span> : null
                    label = n ? `${n} adjacent` : 'Empty'
                  } else if (isExploded) {
                    cls += ' open boom'
                    label = 'Exploded mine'
                  } else if (isFlag) {
                    const isWrong = game.status === 'lost' && !isMine
                    cls += isWrong ? ' flag wrong' : ' flag'
                    label = isWrong ? 'Wrong flag' : 'Flagged'
                  } else if (isMine && game.status !== 'in_progress') {
                    cls += ' open mine'
                    label = 'Mine'
                  }

                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      disabled={busy}
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
            )}
          </div>

          <div className="ms-progress-section">
            <div className="ms-progress-label"><span>{busy ? 'Preparing your field…' : game?.status === 'won' ? 'Beautifully cleared.' : game?.status === 'lost' ? 'One more round?' : clearedPercent === 0 ? 'Your next move starts here' : 'Keep going. You’ve got this.'}</span><strong>{clearedPercent}% cleared</strong></div>
            <div className="ms-progress" role="progressbar" aria-label="Safe cells cleared" aria-valuenow={clearedPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${clearedPercent}%` }} /></div>
          </div>
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
                <span className="ms-action-key" aria-hidden="true">A</span><span>Reveal</span>
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
                <span className="ms-action-key" aria-hidden="true">B</span><span>Flag</span>
              </button>
            </div>


          </div>

          <div className="ms-console-hardware" aria-hidden="true">
            <span className="ms-console-power"><i /> POWER</span>
            <span className="ms-console-model">MS–01 · DIGITAL GAME SYSTEM</span>
            <span className="ms-console-speaker"><i /><i /><i /><i /><i /></span>
          </div>

          {game?.status !== 'won' && (
            <div className="ms-console-signature" aria-hidden="true">
              <span className="ms-cartridge-slot" />
              <strong>CC<span> / </span>01</strong>
              <span>MINESWEEPER · {cols} × {rows}</span>
              <span className="ms-console-grip"><i /><i /><i /></span>
            </div>
          )}
          {/* Result bar */}
          {game && game.status === 'won' && (
            <div className="ms-status-toast won" role="status">
              <div className="toast-content">
                <strong>Board cleared</strong>
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
        <div className="ms-instructions"><span><kbd>Click</kbd> reveal</span><span><kbd>Right-click / hold</kbd> flag</span><span><kbd>R</kbd> restart</span><span><kbd>F</kbd> switch mode</span></div>
      </main>
      <dialog ref={lossDialogRef} className="ms-loss-popup" aria-labelledby="ms-loss-title" aria-describedby="ms-loss-description">
        <button type="button" className="ms-popup-close" aria-label="Close and view board" onClick={() => lossDialogRef.current?.close()}>×</button>
        <div className="ms-popup-mine" aria-hidden="true">✹</div>
        <span className="ms-eyebrow">GAME OVER</span>
        <h2 id="ms-loss-title">You hit a mine</h2>
        <p id="ms-loss-description">One wrong step. A fresh field awaits.</p>
        <div className="ms-popup-stats">
          <span><strong>{elapsed}s</strong>Time</span>
          <span><strong>{game?.move_count ?? 0}</strong>Moves</span>
          <span><strong>{clearedPercent}%</strong>Cleared</span>
        </div>
        <button type="button" className="ms-popup-play" disabled={busy} onClick={() => { lossDialogRef.current?.close(); void start() }}>Play again ↗</button>
        <button type="button" className="ms-popup-inspect" onClick={() => lossDialogRef.current?.close()}>View board</button>
      </dialog>
    </div>
  )
}