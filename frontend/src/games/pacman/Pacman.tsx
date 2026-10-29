import { useCallback, useEffect, useRef, useState } from 'react'
import { HubLink } from '../../loader/HubTransition'
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
type Submission = { state: 'idle' | 'sending' | 'error' } | { state: 'done'; result: RunStatus }

const STEP_MS = 1000 / TICKS_PER_SECOND
const SCALE = 2
const MAX_LIVES = 3
const KEYS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowLeft: 'L', ArrowDown: 'D', ArrowRight: 'R',
  w: 'U', a: 'L', s: 'D', d: 'R', W: 'U', A: 'L', S: 'D', D: 'R',
}
const POLL_MS = 1000
const POLL_TRIES = 20
const BEST_KEY = 'pacman-high-score'
const pad = (n: number) => String(n).padStart(6, '0')

export default function Pacman() {
  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true

  const [phase, setPhase] = useState<Phase>('menu')
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, level: 1 })
  const [notice, setNotice] = useState<string | null>(null)
  const [submission, setSubmission] = useState<Submission>({ state: 'idle' })
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem(BEST_KEY)) || 0)

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
        setBest((b) => {
          if (state.score <= b) return b
          localStorage.setItem(BEST_KEY, String(state.score))
          return state.score
        })
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
    setNotice(null)

    if (!signedIn) {
      setNotice('Sign in and add a ticket to play.')
      return
    }
    if (me.tickets <= 0) {
      setNotice('No tickets left. Please add a ticket to play.')
      return
    }

    setGamePhase('starting')
    setSubmission({ state: 'idle' })
    let seed: string
    try {
      const session = await startRun()
      sessionRef.current = session.id
      seed = String(session.seed)
      gameRef.current = createGame(seed)
      inputsRef.current = []
      pendingDir.current = null
      setHud({ score: 0, lives: 3, level: 1 })
      setGamePhase('playing')
    } catch (e) {
      sessionRef.current = null
      if (e instanceof ApiError && e.status === 400) {
        setNotice('No tickets left. Please add a ticket to play.')
      } else {
        setNotice('Sign in and add a ticket to play.')
      }
      setGamePhase(phaseRef.current === 'over' ? 'over' : 'menu')
    } finally {
      refresh()
    }
  }, [me, refresh, setGamePhase, signedIn])

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

  const isNewBest = phase === 'over' && hud.score > 0 && hud.score >= best
  const stateLabel = {
    menu: 'READY',
    starting: 'CONNECTING',
    playing: 'RANKED RUN',
    paused: 'PAUSED',
    over: 'GAME OVER',
  }[phase]

  // Lives shown as an RPG-style HP bar: green → yellow → red.
  const hpRatio = Math.max(0, Math.min(hud.lives, MAX_LIVES)) / MAX_LIVES
  const hpTone = hpRatio > 0.67 ? 'high' : hpRatio > 0.34 ? 'mid' : 'low'

  const lifeIcons = (
    <span className="pm-lives" aria-label={`${hud.lives} lives`}>
      {Array.from({ length: MAX_LIVES }, (_, i) => (
        <i key={i} className={i < hud.lives ? '' : 'is-lost'} />
      ))}
    </span>
  )

  return (
    <div className="pm-page">
      <div className="pm-bg" aria-hidden="true" />

      <header className="pm-topbar">
        <HubLink to="/" className="pm-back" aria-label="Back to arcade">
          ◀ <span className="pm-back-label">ARCADE</span>
        </HubLink>
        <span className={`pm-mode${signedIn && me.tickets > 0 ? ' is-ranked' : ''}`}>
          {signedIn && me.tickets > 0
            ? `🎟 ${me.tickets} TICKET${me.tickets === 1 ? '' : 'S'}`
            : !signedIn
            ? 'SIGN IN & ADD TICKET'
            : 'ADD A TICKET'}
        </span>
      </header>

      <section className="pm-intro">
        <h1 className="pm-title">PAC-MAN</h1>
        <p className="pm-tagline" aria-hidden="true">★ INSERT COIN ★</p>
      </section>

      <section className="pm-howto" aria-label="How to play Pac-Man">
        <div className="pm-howto-goal">
          <h2>How to play</h2>
          <p>Clear every dot. Power pellets let you eat the ghosts.</p>
        </div>
        <div className="pm-howto-keys" aria-label="Keyboard controls">
          <span><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> Move</span>
          <span><kbd>WASD</kbd> Move</span>
          <span><kbd>P</kbd> Pause</span>
          <span><kbd>ENTER</kbd> Start</span>
        </div>
      </section>

      {notice && (
        <div className="pm-notice" role="status">
          <span>{notice}</span>
          {!signedIn && <GoogleSignIn />}
        </div>
      )}

      <main className="pm-layout" aria-label="Pac-Man game">
        {/* Compact stats strip, shown instead of the side panels on narrow screens. */}
        <div className="pm-strip" aria-hidden="true">
          <div><small>SCORE</small><strong>{pad(hud.score)}</strong></div>
          <div><small>BEST</small><strong>{pad(Math.max(best, hud.score))}</strong></div>
          <div><small>LV</small><strong>{hud.level}</strong></div>
          <div>{lifeIcons}</div>
        </div>

        <aside className="pm-side pm-side-left">
          {/* Battle-status box: name, level, HP bar, score. */}
          <div className="pm-panel pm-status">
            <div className="pm-status-name">
              <span>PAC-MAN</span>
              <span className="pm-status-lv">:L{hud.level}</span>
            </div>
            <div className="pm-hp" aria-label={`${hud.lives} of ${MAX_LIVES} lives`}>
              <span className="pm-hp-tag">HP:</span>
              <span className="pm-hp-track">
                <span className={`pm-hp-fill is-${hpTone}`} style={{ width: `${hpRatio * 100}%` }} />
              </span>
            </div>
            <div className="pm-hp-num">{hud.lives}/ {MAX_LIVES}</div>
            <div className="pm-rule" />
            <div className="pm-panel-label">SCORE</div>
            <div className="pm-lcd" aria-live="polite">{pad(hud.score)}</div>
          </div>
          <div className="pm-panel">
            <div className="pm-panel-label">YOUR BEST</div>
            <div className="pm-lcd pm-lcd-sm">{pad(Math.max(best, hud.score))}</div>
            <div className="pm-muted">Saved on this device</div>
          </div>
        </aside>

        <div className="pm-board-col">
          <div className="pm-board-wrap">
            <div className="pm-board-head">
              <span className={`pm-state is-${phase}`}>{stateLabel}</span>
              <span className="pm-head-level">LV {String(hud.level).padStart(2, '0')}</span>
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
                    <div className="pm-card">
                      {(phase === 'menu' || phase === 'starting') && (
                        <>
                          <div className="pm-chase" aria-hidden="true">
                            <span className="pm-chase-pac" />
                            <span className="pm-chase-dot" />
                            <span className="pm-chase-dot" />
                            <span className="pm-chase-dot" />
                            <span className="pm-chase-ghost" />
                          </div>
                          <h2>A wild BLINKY appeared!</h2>
                          <p>
                            {!signedIn
                              ? 'Sign in and add a ticket to play.'
                              : me.tickets <= 0
                              ? 'No tickets left. Please add a ticket to play.'
                              : 'Ranked run. Starting uses 1 ticket.'}
                          </p>
                          {!signedIn ? (
                            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                              <GoogleSignIn />
                            </div>
                          ) : me.tickets <= 0 ? (
                            <button
                              type="button"
                              className="pm-btn"
                              disabled
                              style={{ opacity: 0.6, cursor: 'not-allowed' }}
                            >
                              ADD A TICKET
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pm-btn"
                              onClick={() => void start()}
                              disabled={phase === 'starting'}
                            >
                              {phase === 'starting' ? 'STARTING…' : 'START GAME'}
                            </button>
                          )}
                        </>
                      )}
                      {phase === 'paused' && (
                        <>
                          <div className="pm-card-icon" aria-hidden="true">❚❚</div>
                          <h2>Game paused</h2>
                          <p>PAC-MAN is taking a breather.</p>
                          <button type="button" className="pm-btn" onClick={() => setGamePhase('playing')}>
                            RESUME
                          </button>
                        </>
                      )}
                      {phase === 'over' && (
                        <>
                          <h2 className="pm-over">PAC-MAN fainted!</h2>
                          <div className="pm-final">
                            <small>FINAL SCORE</small>
                            <strong>{pad(hud.score)}</strong>
                            {isNewBest && <span className="pm-new-best">★ NEW BEST ★</span>}
                          </div>
                          <SubmissionStatus submission={submission} />
                          {!signedIn ? (
                            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                              <p style={{ margin: 0, fontSize: '0.85rem' }}>Sign in and add a ticket to play.</p>
                              <GoogleSignIn />
                            </div>
                          ) : me.tickets <= 0 ? (
                            <button
                              type="button"
                              className="pm-btn"
                              disabled
                              style={{ opacity: 0.6, cursor: 'not-allowed' }}
                            >
                              ADD A TICKET
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pm-btn"
                              onClick={() => void start()}
                            >
                              PLAY AGAIN
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="pm-side pm-side-right">
          <div className="pm-panel">
            <div className="pm-panel-label">WILD GHOSTS</div>
            <ul className="pm-ghosts">
              <li><i style={{ '--g': '#ff4b4b' } as React.CSSProperties} />Blinky<span>Chaser</span></li>
              <li><i style={{ '--g': '#ffb8ff' } as React.CSSProperties} />Pinky<span>Ambusher</span></li>
              <li><i style={{ '--g': '#3ce9ff' } as React.CSSProperties} />Inky<span>Fickle</span></li>
              <li><i style={{ '--g': '#ffb852' } as React.CSSProperties} />Clyde<span>Shy</span></li>
            </ul>
          </div>
          <div className="pm-panel">
            <div className="pm-panel-label">POINTS</div>
            <div className="pm-row"><span><b className="pm-dot" />Dot</span><strong>10</strong></div>
            <div className="pm-row"><span><b className="pm-pellet" />Pellet</span><strong>50</strong></div>
            <div className="pm-row"><span><b className="pm-ghost-sm" />Ghost</span><strong>200+</strong></div>
          </div>
        </aside>

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
          <button
            type="button"
            className="pm-dpad-pause"
            aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
            onClick={togglePause}
            disabled={phase !== 'playing' && phase !== 'paused'}
          >
            {phase === 'paused' ? '▶' : '❚❚'}
          </button>
        </div>
      </main>
    </div>
  )
}

function SubmissionStatus({ submission }: { submission: Submission }) {
  if (submission.state === 'sending') return <p className="pm-status pm-pending">Verifying score…</p>
  if (submission.state === 'error') return <p className="pm-status pm-bad">Could not submit this run.</p>
  if (submission.state !== 'done') return null
  const { result } = submission
  if (result.status === 'verified') return <p className="pm-status pm-good">Score verified: {result.score}</p>
  if (result.status === 'rejected') return <p className="pm-status pm-bad">Run rejected: {result.reason}</p>
  return <p className="pm-status pm-pending">Still verifying. Check the leaderboard shortly.</p>
}