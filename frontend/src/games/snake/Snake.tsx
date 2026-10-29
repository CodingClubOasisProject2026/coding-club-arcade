import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { HubLink } from '../../loader/HubTransition'
import { ApiError } from '../../api'
import { useAuth } from '../../auth'
import GoogleSignIn from '../../GoogleSignIn'
import Board from './Board'
import DungeonBackdrop from './DungeonBackdrop'
import DPad from './DPad'
import { startRun, submitRun } from './api'
import {
  advance,
  createGame,
  createPreviewGame,
  OPP,
  tickDelayMs,
  type ActionLog,
  type GameState,
  type SnakeDirection,
  verifyRun,
} from './engine'
import './Snake.css'

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

type Submission = 'idle' | 'verified' | 'rejected' | 'error'

export default function Snake() {
  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true
  const [game, setGame] = useState<GameState>(createPreviewGame)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'paused' | 'over'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [submission, setSubmission] = useState<Submission>('idle')
  const [busy, setBusy] = useState(false)

  // The live game is mutated in place by step(); React gets a copy each tick.
  const gameRef = useRef(game)
  const sessionRef = useRef<string | null>(null)
  const seedRef = useRef<string | number | bigint>(0)
  const startedAtRef = useRef(0)
  const actionsRef = useRef<ActionLog['actions']>([])
  const queueRef = useRef<SnakeDirection[]>([])
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null)

  const paint = useCallback(() => {
    const g = gameRef.current
    setGame({ ...g, snake: g.snake.map(([x, y]) => [x, y]) })
  }, [])

  const startNewGame = useCallback(async () => {
    if (busy) return
    setError(null)
    setNotice(null)

    if (!signedIn) {
      setNotice('SIGN IN AND ADD A TICKET TO PLAY.')
      return
    }
    if (me.tickets <= 0) {
      setNotice('NO TICKETS LEFT. PLEASE ADD A TICKET TO PLAY.')
      return
    }

    setBusy(true)
    setFinalScore(null)
    setSubmission('idle')
    try {
      const session = await startRun()
      sessionRef.current = session.id
      seedRef.current = session.seed
      startedAtRef.current = Date.now()
      gameRef.current = createGame(session.seed)
      actionsRef.current = []
      queueRef.current = []
      paint()
      setPhase('playing')
    } catch (err: unknown) {
      sessionRef.current = null
      if (err instanceof ApiError && err.status === 400) {
        setNotice('NO TICKETS LEFT. PLEASE ADD A TICKET TO PLAY.')
      } else {
        setNotice('SIGN IN AND ADD A TICKET TO PLAY.')
      }
    } finally {
      setBusy(false)
      refresh()
    }
  }, [busy, me, paint, refresh, signedIn])

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

  // Verify the run locally (same replay as the backend) so the result shows
  // instantly, then hand the log to the backend in the background.
  const finish = useCallback(() => {
    const sessionId = sessionRef.current
    const g = gameRef.current
    if (!sessionId) {
      return
    }
    sessionRef.current = null
    const log: ActionLog = {
      actions: actionsRef.current,
      total_ticks: g.tick,
      end_reason: g.status === 'WON' ? 'WON' : 'COLLISION',
    }
    const score = verifyRun(seedRef.current, log, Date.now() - startedAtRef.current)
    if (score === null) {
      setSubmission('rejected')
    } else {
      setFinalScore(score)
      setSubmission('verified')
    }
    submitRun(sessionId, log).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Failed to submit score')
      setSubmission('error')
    })
  }, [])

  // Game loop: runs entirely in the browser, recording each direction change.
  useEffect(() => {
    if (phase !== 'playing') return
    let timer = 0
    const tick = () => {
      const g = gameRef.current
      advance(g, queueRef.current.shift() ?? g.direction, actionsRef.current)
      paint()
      if (g.status !== 'ACTIVE') {
        setPhase('over')
        finish()
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
        <HubLink to="/" className="snake-back">
          ← ARCADE
        </HubLink>
        <div className="snake-stats">
          <span>SCORE {String(game.score ?? 0).padStart(4, '0')}</span>
          <span>APPLES {game.apples_eaten ?? 0}</span>
          {game.apple_locked && <span className="snake-keyhud">LOCKED 🔒</span>}
          {phase === 'playing' && (
            <button type="button" onClick={togglePause} className="snake-btn-pause">
              PAUSE
            </button>
          )}
        </div>
      </header>

      <h1 className="snake-title">SNAKE</h1>

      {error && <div className="snake-error">{error}</div>}
      {notice && (
        <div className="snake-notice" role="status">
          <span>{notice}</span>
          {!me?.authenticated && <GoogleSignIn />}
        </div>
      )}

      <div
        style={{ position: 'relative', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Board board={game.board} snake={game.snake} apple={game.apple} keyCell={game.key} appleLocked={game.apple_locked} />

        {phase !== 'playing' && overlay && (
          <div className="snake-overlay">
            <h2 className="snake-overlay-title">{overlay.title}</h2>
            {phase === 'over' && (
              <p style={{ margin: 0, fontSize: '13px' }}>
                FINAL SCORE: {finalScore ?? game.score}
                {submission === 'verified' && ' · VERIFIED'}
                {submission === 'rejected' && ' · COULD NOT VERIFY'}
              </p>
            )}
            {phase !== 'paused' && !signedIn ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#ffce19', textAlign: 'center' }}>
                  SIGN IN AND ADD A TICKET TO PLAY
                </p>
                <GoogleSignIn />
              </div>
            ) : phase !== 'paused' && signedIn && me.tickets <= 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#ff7b7b', textAlign: 'center' }}>
                  NO TICKETS LEFT. PLEASE ADD A TICKET TO PLAY.
                </p>
                <button type="button" disabled className="snake-overlay-btn">
                  ADD A TICKET
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={phase === 'paused' ? togglePause : startNewGame}
                className="snake-overlay-btn"
              >
                {busy ? 'STARTING...' : overlay.label}
              </button>
            )}
          </div>
        )}
      </div>

      <DPad onDirection={changeDirection} />

      <p className="snake-hint">
        SOME APPLES ARE LOCKED · GRAB THE KEY FIRST · HITTING A LOCKED APPLE ENDS THE RUN
        <br />
        ARROWS / WASD MOVE · SPACE OR P PAUSE · SWIPE ON MOBILE
        {!signedIn ? (
          <span> · SIGN IN AND ADD A TICKET TO PLAY</span>
        ) : me.tickets === 0 ? (
          <span> · NO TICKETS LEFT. PLEASE ADD A TICKET</span>
        ) : (
          <span> · 🎟 {me.tickets} ticket{me.tickets === 1 ? '' : 's'}</span>
        )}
      </p>
    </main>
  )
}
