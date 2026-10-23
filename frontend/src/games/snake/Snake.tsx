import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import Board from './Board'
import DungeonBackdrop from './DungeonBackdrop'
import DPad from './DPad'
import { runStatus, startRun, submitRun } from './api'
import {
  createGame,
  createPreviewGame,
  OPP,
  step,
  tickDelayMs,
  type ActionLog,
  type GameState,
  type SnakeDirection,
} from './engine'
import './Snake.css'

const MAX_QUEUED_TURNS = 2
const POLL_TRIES = 10
const POLL_MS = 600

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

type Submission = 'idle' | 'sending' | 'verified' | 'pending' | 'error'

export default function Snake() {
  const { me, refresh } = useAuth()
  const [game, setGame] = useState<GameState>(createPreviewGame)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'paused' | 'over'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [submission, setSubmission] = useState<Submission>('idle')
  const [busy, setBusy] = useState(false)

  // The live game is mutated in place by step(); React gets a copy each tick.
  const gameRef = useRef(game)
  const sessionRef = useRef<string | null>(null)
  const actionsRef = useRef<ActionLog['actions']>([])
  const queueRef = useRef<SnakeDirection[]>([])
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null)

  const paint = useCallback(() => {
    const g = gameRef.current
    setGame({ ...g, snake: g.snake.map(([x, y]) => [x, y]) })
  }, [])

  const startNewGame = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setFinalScore(null)
    setSubmission('idle')
    try {
      const session = await startRun()
      sessionRef.current = session.id
      gameRef.current = createGame(session.seed)
      actionsRef.current = []
      queueRef.current = []
      paint()
      setPhase('playing')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start Snake game')
      setPhase('idle')
    } finally {
      setBusy(false)
      refresh()
    }
  }, [busy, paint, refresh])

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

  // Send the recorded log to the backend and wait for the Celery task to score it.
  const finish = useCallback(async () => {
    const sessionId = sessionRef.current
    const g = gameRef.current
    if (!sessionId) return
    sessionRef.current = null
    const log: ActionLog = {
      actions: actionsRef.current,
      total_ticks: g.tick,
      end_reason: g.status === 'WON' ? 'WON' : 'COLLISION',
    }
    setSubmission('sending')
    try {
      await submitRun(sessionId, log)
      for (let i = 0; i < POLL_TRIES; i += 1) {
        await sleep(POLL_MS)
        const result = await runStatus(sessionId)
        if (result.status === 'verified') {
          setFinalScore(result.score)
          setSubmission('verified')
          return
        }
      }
      setSubmission('pending')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit score')
      setSubmission('error')
    }
  }, [])

  // Game loop: runs entirely in the browser, recording each direction change.
  useEffect(() => {
    if (phase !== 'playing') return
    let timer = 0
    const tick = () => {
      const g = gameRef.current
      const dir = queueRef.current.shift() ?? g.direction
      if (dir !== g.direction) {
        actionsRef.current.push({ tick: g.tick + 1, direction: dir })
      }
      step(g, dir)
      paint()
      if (g.status !== 'ACTIVE') {
        setPhase('over')
        void finish()
        return
      }
      timer = window.setTimeout(tick, tickDelayMs(g.apples_eaten))
    }
    timer = window.setTimeout(tick, tickDelayMs(gameRef.current.apples_eaten))
    return () => window.clearTimeout(timer)
  }, [phase, paint, finish])

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
                {submission === 'sending' && ' · VERIFYING...'}
                {submission === 'verified' && ' · VERIFIED'}
                {submission === 'pending' && ' · STILL VERIFYING'}
              </p>
            )}
            <button
              type="button"
              disabled={busy || submission === 'sending'}
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
