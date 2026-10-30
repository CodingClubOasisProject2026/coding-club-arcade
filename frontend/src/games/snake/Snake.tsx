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
import { snakeAudio } from './audio'
import { SoundIcon } from '../../SoundIcon'
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
  const [soundOn, setSoundOn] = useState(() => snakeAudio.enabled)

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
      snakeAudio.playStart()
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
      snakeAudio.playTurn()
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
    if (phase !== 'playing') {
      snakeAudio.stopBgm()
      return
    }
    snakeAudio.startBgm()
    let timer = 0
    const tick = () => {
      const g = gameRef.current
      const applesBefore = g.apples_eaten
      const hadKeyBefore = !!g.key
      advance(g, queueRef.current.shift() ?? g.direction, actionsRef.current)
      paint()
      if (g.status !== 'ACTIVE') {
        snakeAudio.stopBgm()
        snakeAudio.playDie()
        setPhase('over')
        finish()
        return
      }
      if (g.apples_eaten > applesBefore) {
        if (g.apple_locked) {
          snakeAudio.playGoldenBite()
        } else {
          snakeAudio.playBite()
        }
      } else if (hadKeyBefore && !g.key) {
        snakeAudio.playPowerup('KEY')
      }
      timer = window.setTimeout(tick, tickDelayMs(g.apples_eaten))
    }
    timer = window.setTimeout(tick, tickDelayMs(gameRef.current.apples_eaten))
    return () => {
      window.clearTimeout(timer)
      snakeAudio.stopBgm()
    }
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
        <div className="snake-nav-center">
          <span className="snake-nav-badge">SLITHER</span>
        </div>
        <div className="snake-nav-actions">
          {signedIn && (
            <span className="snake-ticket-badge" title="Tickets remaining">
              🎟 {me.tickets}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const next = snakeAudio.toggle()
              setSoundOn(next)
              if (next && phase === 'playing') {
                snakeAudio.startBgm()
              }
            }}
            className="snake-btn-sound"
            title={soundOn ? 'Mute Sound' : 'Enable Sound'}
            aria-label={soundOn ? 'Mute Sound' : 'Enable Sound'}
          >
            <SoundIcon enabled={soundOn} size={15} />
          </button>
          {phase === 'playing' && (
            <button type="button" onClick={togglePause} className="snake-btn-pause" aria-label="Pause game">
              PAUSE
            </button>
          )}
        </div>
      </header>

      <h1 className="snake-title">SLITHER</h1>

      {error && <div className="snake-error">{error}</div>}
      {notice && (
        <div className="snake-notice" role="status">
          <span>{notice}</span>
          {!me?.authenticated && <GoogleSignIn />}
        </div>
      )}

      {/* Retro Arcade HUD */}
      <div className="snake-hud">
        <div className="snake-hud-card">
          <span className="snake-hud-label">SCORE</span>
          <span className="snake-hud-val score-val">{String(game.score ?? 0).padStart(4, '0')}</span>
        </div>
        <div className="snake-hud-card">
          <span className="snake-hud-label">APPLES</span>
          <span className="snake-hud-val apples-val">🍎 {game.apples_eaten ?? 0}</span>
        </div>
        <div className="snake-hud-card status-card">
          <span className="snake-hud-label">STATUS</span>
          <span className={`snake-hud-status ${game.apple_locked ? 'is-locked' : game.key ? 'is-key' : 'is-ready'}`}>
            {game.apple_locked ? '🔒 LOCKED' : game.key ? '🔑 KEY' : 'READY ✦'}
          </span>
        </div>
      </div>

      <div
        className="snake-board-wrap"
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
              <p className="snake-overlay-score">
                FINAL SCORE: {finalScore ?? game.score}
                {submission === 'verified' && ' · VERIFIED'}
                {submission === 'rejected' && ' · COULD NOT VERIFY'}
              </p>
            )}
            {phase !== 'paused' && !signedIn ? (
              <div className="snake-overlay-auth">
                <p className="snake-overlay-msg warn">
                  SIGN IN AND ADD A TICKET TO PLAY
                </p>
                <GoogleSignIn />
              </div>
            ) : phase !== 'paused' && signedIn && me.tickets <= 0 ? (
              <div className="snake-overlay-auth">
                <p className="snake-overlay-msg err">
                  NO TICKETS LEFT. PLEASE ADD A TICKET TO PLAY.
                </p>
                <button type="button" disabled className="snake-overlay-btn disabled">
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

      <DPad
        onDirection={changeDirection}
        onPause={togglePause}
        isPlaying={phase === 'playing'}
        isPaused={phase === 'paused'}
      />

      <div className="snake-hint-container">
        <p className="snake-hint snake-hint-desktop">
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
        <p className="snake-hint snake-hint-mobile">
          SWIPE OR TAP D-PAD TO MOVE · 🔑 UNLOCKS 🔒 APPLES
        </p>
      </div>
    </main>
  )
}
