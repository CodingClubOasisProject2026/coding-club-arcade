import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api'
import { useAuth } from '../../auth'
import GoogleSignIn from '../../GoogleSignIn'
import { type RunStatus, runStatus, startRun, submitRun } from './api'
import {
  type ActionLog,
  type Dir,
  ENGINE_VERSION,
  type GameState,
  TICKS_PER_SECOND,
  createGame,
  step,
} from './engine'
import { HEIGHT, WIDTH, draw, renderMaze } from './render'
import './Pacman.css'

type Phase = 'menu' | 'starting' | 'playing' | 'paused' | 'over'
type Hud = { score: number; lives: number; level: number }
type Submission = { state: 'idle' | 'practice' | 'sending' | 'error' } | { state: 'done'; result: RunStatus }

const STEP_MS = 1000 / TICKS_PER_SECOND
const SCALE = 2
const KEYS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowLeft: 'L', ArrowDown: 'D', ArrowRight: 'R',
  w: 'U', a: 'L', s: 'D', d: 'R', W: 'U', A: 'L', S: 'D', D: 'R',
}
const POLL_MS = 1000
const POLL_TRIES = 20

function randomSeed() {
  const words = crypto.getRandomValues(new Uint32Array(2))
  return ((BigInt(words[0]) << 32n) | BigInt(words[1])).toString()
}

export default function Pacman() {
  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true

  const [phase, setPhase] = useState<Phase>('menu')
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, level: 1 })
  const [notice, setNotice] = useState<string | null>(null)
  const [submission, setSubmission] = useState<Submission>({ state: 'idle' })

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mazeRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef<GameState>(createGame(1))
  const inputsRef = useRef<[number, Dir][]>([])
  const pendingDir = useRef<Dir | null>(null)
  const sessionRef = useRef<string | null>(null)
  const phaseRef = useRef<Phase>('menu')
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const setGamePhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    mazeRef.current ??= renderMaze(SCALE)
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    draw(ctx, mazeRef.current, gameRef.current)
  }, [])

  const finish = useCallback(async () => {
    const state = gameRef.current
    const sessionId = sessionRef.current
    if (!sessionId) {
      setSubmission({ state: 'practice' })
      return
    }
    const log: ActionLog = {
      version: ENGINE_VERSION,
      inputs: inputsRef.current,
      total_ticks: state.tick,
      claimed_score: state.score,
    }
    setSubmission({ state: 'sending' })
    try {
      await submitRun(sessionId, log)
      for (let i = 0; i < POLL_TRIES; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        const result = await runStatus(sessionId)
        if (result.status !== 'pending') {
          setSubmission({ state: 'done', result })
          return
        }
      }
      setSubmission({ state: 'done', result: { status: 'pending', score: null, reason: '' } })
    } catch {
      setSubmission({ state: 'error' })
    } finally {
      refresh()
    }
  }, [refresh])

  // Fixed-timestep loop: the engine always advances in whole 60 Hz ticks so the
  // recorded inputs replay identically on the server.
  useEffect(() => {
    if (phase !== 'playing') return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      acc += Math.min(now - last, 250)
      last = now
      const state = gameRef.current
      while (acc >= STEP_MS && !state.over) {
        const dir = pendingDir.current
        if (dir && dir !== state.pac.want) {
          inputsRef.current.push([state.tick + 1, dir])
          step(state, dir)
        } else {
          step(state, null)
        }
        acc -= STEP_MS
      }
      paint()
      setHud((h) =>
        h.score === state.score && h.lives === state.lives && h.level === state.level
          ? h
          : { score: state.score, lives: state.lives, level: state.level },
      )
      if (state.over) {
        setGamePhase('over')
        void finish()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase, paint, finish, setGamePhase])

  const start = useCallback(async () => {
    if (phaseRef.current === 'starting' || phaseRef.current === 'playing') return
    setGamePhase('starting')
    setNotice(null)
    setSubmission({ state: 'idle' })
    let seed: string
    try {
      const session = await startRun()
      sessionRef.current = session.id
      seed = String(session.seed)
    } catch (e) {
      sessionRef.current = null
      seed = randomSeed()
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setNotice('Practice mode. Sign in to post scores.')
      } else if (e instanceof ApiError && e.status === 400) {
        setNotice('No tickets left. Playing in practice mode.')
      } else {
        setNotice('Could not reach the arcade. Playing in practice mode.')
      }
    } finally {
      refresh()
    }
    gameRef.current = createGame(seed)
    inputsRef.current = []
    pendingDir.current = null
    setHud({ score: 0, lives: 3, level: 1 })
    setGamePhase('playing')
  }, [refresh, setGamePhase])

  const steer = useCallback((dir: Dir) => {
    pendingDir.current = dir
  }, [])

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') setGamePhase('paused')
    else if (phaseRef.current === 'paused') setGamePhase('playing')
  }, [setGamePhase])

  useEffect(() => {
    paint()
  }, [paint])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      if (dir) {
        e.preventDefault()
        if (phaseRef.current === 'paused') setGamePhase('playing')
        steer(dir)
        return
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        togglePause()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (phaseRef.current === 'menu' || phaseRef.current === 'over') void start()
        else if (phaseRef.current === 'paused') setGamePhase('playing')
      }
    }
    // Ticks don't advance while hidden, so pausing never invalidates the log.
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === 'playing') setGamePhase('paused')
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [start, steer, togglePause, setGamePhase])

  const onPointerDown = (e: React.PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const origin = swipeStart.current
    if (!origin) return
    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U')
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => {
    swipeStart.current = null
  }

  return (
    <div className="pm-page">
      <header className="pm-topbar">
        <Link to="/" className="pm-back" aria-label="Back to arcade">←</Link>
        <h1 className="pm-title">Pac-Man</h1>
        <div className="pm-topbar-right">
          {signedIn && <span className="pm-tickets" title="Tickets left">🎟️ {me.tickets}</span>}
        </div>
      </header>

      {notice && (
        <div className="pm-notice" role="status">
          <span>{notice}</span>
          {!signedIn && <GoogleSignIn />}
        </div>
      )}

      <main className="pm-main">
        <div className="pm-hud" aria-live="polite">
          <span>
            <small>Score</small>
            <strong>{hud.score}</strong>
          </span>
          <span>
            <small>Level</small>
            <strong>{hud.level}</strong>
          </span>
          <span className="pm-lives" aria-label={`${hud.lives} lives`}>
            {Array.from({ length: Math.max(0, hud.lives) }, (_, i) => <i key={i} />)}
          </span>
        </div>

        <div className="pm-board-slot">
          <div
            className="pm-board"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} width={WIDTH * SCALE} height={HEIGHT * SCALE} aria-label="Pac-Man maze" />

            {phase !== 'playing' && (
              <div className="pm-overlay">
                {(phase === 'menu' || phase === 'starting') && (
                  <>
                    <button type="button" className="pm-btn" onClick={() => void start()} disabled={phase === 'starting'}>
                      {phase === 'starting' ? 'Starting…' : 'Start'}
                    </button>
                    <p>
                      {signedIn ? 'Ranked runs use 1 ticket.' : 'Sign in to post scores.'}
                      <br />
                      Arrows / WASD or swipe to move.
                    </p>
                  </>
                )}
                {phase === 'paused' && (
                  <button type="button" className="pm-btn" onClick={() => setGamePhase('playing')}>
                    Resume
                  </button>
                )}
                {phase === 'over' && (
                  <>
                    <p className="pm-final">{hud.score}</p>
                    <SubmissionStatus submission={submission} />
                    <button type="button" className="pm-btn" onClick={() => void start()}>
                      Play again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pm-dpad" aria-label="Direction pad">
          {(['U', 'L', 'R', 'D'] as Dir[]).map((dir) => (
            <button
              key={dir}
              type="button"
              className={`pm-dpad-${dir}`}
              aria-label={{ U: 'Up', L: 'Left', R: 'Right', D: 'Down' }[dir]}
              onPointerDown={(e) => {
                e.preventDefault()
                steer(dir)
              }}
            >
              {{ U: '▲', L: '◀', R: '▶', D: '▼' }[dir]}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

function SubmissionStatus({ submission }: { submission: Submission }) {
  if (submission.state === 'practice') return <p>Practice run. Not submitted.</p>
  if (submission.state === 'sending') return <p>Verifying score…</p>
  if (submission.state === 'error') return <p className="pm-bad">Could not submit this run.</p>
  if (submission.state !== 'done') return null
  const { result } = submission
  if (result.status === 'verified') return <p className="pm-good">Score verified: {result.score}</p>
  if (result.status === 'rejected') return <p className="pm-bad">Run rejected: {result.reason}</p>
  return <p>Still verifying. Check the leaderboard shortly.</p>
}
