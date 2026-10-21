import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import Board from './Board'
import DungeonBackdrop from './DungeonBackdrop'
import DPad from './DPad'
import {
  createSnakeSession,
  endSnakeGame,
  moveSnake,
  startSnakeGame,
  type SnakeDirection,
  type SnakeGameState,
} from './api'
import { createPreviewGame, OPP } from './engine'
import './Snake.css'

const BASE_TICK_MS = 150
const MIN_TICK_MS = 90
const SPEEDUP_PER_APPLE_MS = 4
const MAX_QUEUED_TURNS = 2

const KEY_TO_DIR: Record<string, SnakeDirection> = {
  ArrowUp: 'UP',
  w: 'UP',
  W: 'UP',
  ArrowDown: 'DOWN',
  s: 'DOWN',
  S: 'DOWN',
  ArrowLeft: 'LEFT',
  a: 'LEFT',
  A: 'LEFT',
  ArrowRight: 'RIGHT',
  d: 'RIGHT',
  D: 'RIGHT',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Snake() {
  const { me } = useAuth()
  const [game, setGame] = useState<SnakeGameState>(() => createPreviewGame() as unknown as SnakeGameState)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'paused' | 'over'>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const gameRef = useRef(game)
  const queueRef = useRef<SnakeDirection[]>([])
  const runIdRef = useRef(0)
  const endedRef = useRef(false)
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null)

  const commit = useCallback((next: SnakeGameState) => {
    gameRef.current = next
    setGame(next)
  }, [])

  const startNewGame = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setFinalScore(null)
    endedRef.current = false
    queueRef.current = []
    const runId = ++runIdRef.current

    try {
      // 1. Create arcade session
      const sid = await createSnakeSession()
      setSessionId(sid)

      // 2. Start game on backend
      const state = await startSnakeGame(sid)
      if (runId !== runIdRef.current) return
      commit(state)
      setPhase('playing')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start Snake game'
      setError(msg)
      setPhase('idle')
    } finally {
      setBusy(false)
    }
  }, [busy, commit])

  const togglePause = useCallback(() => {
    setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))
  }, [])

  const changeDirection = useCallback(
    (dir: SnakeDirection) => {
      if (phase !== 'playing') return
      const queue = queueRef.current
      const last = queue.length ? queue[queue.length - 1] : gameRef.current.direction
      if (dir === last || dir === OPP[last]) return
      if (queue.length >= MAX_QUEUED_TURNS) return
      queue.push(dir)
    },
    [phase]
  )

  // Game loop tick
  useEffect(() => {
    if (phase !== 'playing' || !sessionId) return

    let stopped = false
    const runId = runIdRef.current

    ;(async () => {
      while (!stopped) {
        const eaten = gameRef.current.apples_eaten ?? 0
        const delay = Math.max(MIN_TICK_MS, BASE_TICK_MS - eaten * SPEEDUP_PER_APPLE_MS)
        await sleep(delay)
        if (stopped) return

        const dir = queueRef.current.shift() ?? gameRef.current.direction
        try {
          const next = await moveSnake(sessionId, dir)
          if (runId !== runIdRef.current) return
          commit(next)
          if (next.game_over || next.status === 'GAME_OVER' || next.status === 'WON') {
            setPhase('over')
            return
          }
        } catch (e: unknown) {
          if (runId === runIdRef.current) {
            const msg = e instanceof Error ? e.message : 'Movement error'
            setError(msg)
            setPhase('idle')
          }
          return
        }
      }
    })()

    return () => {
      stopped = true
    }
  }, [phase, sessionId, commit])

  // End game handler
  useEffect(() => {
    if (phase !== 'over' || !sessionId || endedRef.current) return
    endedRef.current = true
    endSnakeGame(sessionId)
      .then((res) => {
        setFinalScore(res.score ?? gameRef.current.score)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Failed to finish game'
        setError(msg)
      })
  }, [phase, sessionId])

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key]
      if (dir) {
        e.preventDefault()
        changeDirection(dir)
        return
      }
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [changeDirection, togglePause])

  // Swipe support
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return
    swipeOriginRef.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!swipeOriginRef.current) return
    const dx = e.clientX - swipeOriginRef.current.x
    const dy = e.clientY - swipeOriginRef.current.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return

    if (Math.abs(dx) > Math.abs(dy)) {
      changeDirection(dx > 0 ? 'RIGHT' : 'LEFT')
    } else {
      changeDirection(dy > 0 ? 'DOWN' : 'UP')
    }
    swipeOriginRef.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = () => {
    swipeOriginRef.current = null
  }

  const overlay = {
    idle: { title: 'READY TO PLAY?', label: 'START GAME' },
    paused: { title: 'PAUSED', label: 'RESUME' },
    over: {
      title: game.status === 'WON' ? 'YOU WON!' : 'GAME OVER',
      label: 'PLAY AGAIN',
    },
  }[phase === 'playing' ? 'idle' : phase]

  return (
    <main className="snake-route">
      <DungeonBackdrop />

      <header className="snake-nav">
        <Link to="/" className="snake-back">
          ← ARCADE
        </Link>
        <div className="snake-stats">
          <span>SCORE {String(game.score ?? 0).padStart(4, '0')}</span>
          <span>APPLES {game.apples_eaten ?? 0}</span>
          {phase === 'playing' && (
            <button type="button" onClick={togglePause} className="snake-btn-pause">
              PAUSE
            </button>
          )}
        </div>
      </header>

      <h1 className="snake-title">SNAKE</h1>

      {error && <div className="snake-error">{error}</div>}

      <div
        style={{ position: 'relative', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Board board={game.board} snake={game.snake} apple={game.apple} />

        {phase !== 'playing' && overlay && (
          <div className="snake-overlay">
            <h2 className="snake-overlay-title">{overlay.title}</h2>
            {phase === 'over' && (
              <p style={{ margin: 0, fontSize: '13px' }}>
                FINAL SCORE: {finalScore ?? game.score}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={phase === 'paused' ? togglePause : startNewGame}
              className="snake-overlay-btn"
            >
              {busy ? 'STARTING...' : overlay.label}
            </button>
          </div>
        )}
      </div>

      <DPad onDirection={changeDirection} />

      <p className="snake-hint">
        ARROWS / WASD MOVE · SPACE OR P PAUSE · SWIPE ON MOBILE
        {me?.authenticated && <span> · 🎟 {me.tickets} ticket{me.tickets === 1 ? '' : 's'}</span>}
      </p>
    </main>
  )
}
