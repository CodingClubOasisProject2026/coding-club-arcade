import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api'
import { useAuth } from '../../auth'
import GoogleSignIn from '../../GoogleSignIn'
import { type Difficulty, type GameState, type MoveType, getGame, newGame, playMove } from './api'
import './Minesweeper.css'

const CURRENT_GAME_KEY = 'minesweeper.currentGame'

const DIFFICULTIES: { key: Difficulty; label: string; size: string }[] = [
  { key: 'beginner', label: 'Beginner', size: '9×9 · 10' },
  { key: 'intermediate', label: 'Intermediate', size: '16×16 · 40' },
  { key: 'expert', label: 'Expert', size: '30×16 · 99' },
]

function rememberGame(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_GAME_KEY, id)
    else localStorage.removeItem(CURRENT_GAME_KEY)
  } catch {
    // ignore: resuming after refresh just won't work
  }
}

function recalledGame(): string | null {
  try {
    return localStorage.getItem(CURRENT_GAME_KEY)
  } catch {
    return null
  }
}

function useElapsed(game: GameState | null, localStart: number | null) {
  const [now, setNow] = useState(() => Date.now())
  const running = game?.status === 'in_progress' && (game.startedAt || localStart)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running])
  if (!game) return 0
  const start = game.startedAt ? Date.parse(game.startedAt) : localStart
  if (!start) return 0
  const end = game.finishedAt ? Date.parse(game.finishedAt) : now
  return Math.max(0, Math.floor((end - start) / 1000))
}

export default function Minesweeper() {
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')
  const [game, setGame] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [localStart, setLocalStart] = useState<number | null>(null)
  const pending = useRef(false)
  const { me, refresh } = useAuth()
  const signedIn = me?.authenticated === true

  // Resume the last game after a refresh.
  useEffect(() => {
    const id = recalledGame()
    if (!id) return
    getGame(id)
      .then((g) => {
        setGame(g)
        setDifficulty(DIFFICULTIES.find((d) => d.size.startsWith(`${g.width}×${g.height}`))?.key ?? 'beginner')
      })
      .catch(() => rememberGame(null))
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const g = await newGame(difficulty)
      rememberGame(g.id)
      setGame(g)
      setLocalStart(null)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        // Either signed out (session expired) or a CSRF failure; show the server's reason.
        setError(signedIn ? e.message : 'Sign in to start a game.')
        refresh()
      } else if (e instanceof ApiError && e.status === 400) {
        // e.g. {"tickets": "You need at least one ticket to start a game."}
        const body = e.body as Record<string, unknown> | null
        const first = body && Object.values(body)[0]
        setError(String(Array.isArray(first) ? first[0] : (first ?? e.message)))
      } else {
        setError(String((e as Error).message))
      }
    } finally {
      setBusy(false)
      // Starting a session spends a ticket.
      refresh()
    }
  }, [difficulty, signedIn, refresh])

  const move = useCallback(
    async (type: MoveType, index: number) => {
      if (!game || game.status !== 'in_progress' || pending.current) return
      pending.current = true
      setError(null)
      try {
        const r = await playMove(game.id, game.move_count, type, index, game.width)
        if (type !== 'flag' && !game.startedAt && localStart === null) setLocalStart(Date.now())
        setGame((g) =>
          g && {
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
          },
        )
        if (r.status !== 'in_progress') {
          // Pull the server's start/finish times so the final time is exact.
          getGame(game.id).then(setGame).catch(() => {})
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Out of sync (another tab, or the game ended): reload the real state.
          getGame(game.id).then(setGame).catch(() => {})
        } else if (!(e instanceof ApiError && e.status === 400)) {
          setError(String((e as Error).message))
        }
      } finally {
        pending.current = false
      }
    },
    [game, localStart],
  )

  const elapsed = useElapsed(game, localStart)

  const view = useMemo(() => {
    if (!game) return null
    const opened = new Map(game.cells)
    return {
      opened,
      flagged: new Set(game.flagged),
      mines: new Set(game.mines ?? []),
      exploded: new Set(game.exploded ?? []),
    }
  }, [game])

  const face = !game ? '🙂' : game.status === 'won' ? '😎' : game.status === 'lost' ? '😵' : '🙂'

  return (
    <section className="ms">
      <header className="ms-head">
        <Link to="/" className="ms-back">
          ← Arcade
        </Link>
        <h1>Minesweeper</h1>
      </header>

      <div className="ms-controls">
        <div className="ms-difficulty" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              role="radio"
              aria-checked={difficulty === d.key}
              className={difficulty === d.key ? 'active' : ''}
              onClick={() => setDifficulty(d.key)}
            >
              <span>{d.label}</span>
              <small>{d.size}</small>
            </button>
          ))}
        </div>
        <button className="ms-new" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : game ? 'New game' : 'Start game'}
        </button>
      </div>

      {me && !signedIn && (
        <div className="ms-note">
          <span>Sign in to start a game.</span>
          <GoogleSignIn />
        </div>
      )}
      {signedIn && me.tickets === 0 && <p className="ms-note">You have no tickets left, so you can’t start a new game.</p>}
      {error && <p className="ms-error">{error}</p>}

      {game && view && (
        <div className="ms-game">
          <div className="ms-status">
            <span className="ms-counter" title="Mines left">
              💣 {game.mines_left}
            </span>
            <button className="ms-face" onClick={start} disabled={busy} aria-label="New game">
              {face}
            </button>
            <span className="ms-counter" title="Time">
              ⏱ {elapsed}s
            </span>
          </div>

          <div className="ms-board-wrap">
            <div
              className={`ms-board ${game.status !== 'in_progress' ? 'over' : ''}`}
              style={{ gridTemplateColumns: `repeat(${game.width}, var(--cell))` }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {Array.from({ length: game.width * game.height }, (_, i) => {
                const n = view.opened.get(i)
                const isOpen = n !== undefined
                const isFlag = view.flagged.has(i)
                const isMine = view.mines.has(i)
                const boom = view.exploded.has(i)
                let content: string | number = ''
                let cls = 'cell'
                if (isOpen) {
                  cls += ` open n${n}`
                  content = n || ''
                } else if (boom) {
                  cls += ' open boom'
                  content = '💥'
                } else if (isFlag) {
                  cls += isMine || game.status === 'in_progress' ? ' flag' : ' flag wrong'
                  content = '🚩'
                } else if (isMine) {
                  cls += ' open mine'
                  content = '💣'
                }
                const label = `Row ${Math.floor(i / game.width) + 1}, column ${(i % game.width) + 1}`
                return (
                  <button
                    key={i}
                    className={cls}
                    aria-label={label}
                    onClick={() => {
                      if (isOpen) move('chord', i)
                      else if (flagMode) move('flag', i)
                      else if (!isFlag) move('reveal', i)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (!isOpen) move(flagMode ? 'reveal' : 'flag', i)
                    }}
                  >
                    {content}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="ms-footer">
            <label className="ms-flagmode">
              <input type="checkbox" checked={flagMode} onChange={(e) => setFlagMode(e.target.checked)} />
              Flag mode (for touch)
            </label>
            <span className="ms-hint">Click to reveal · right-click to flag · click a number to chord</span>
          </div>

          {game.status !== 'in_progress' && (
            <div className={`ms-result ${game.status}`} role="status">
              <strong>{game.status === 'won' ? 'You won!' : 'Boom — game over.'}</strong>
              <span>
                Score {game.score ?? '—'} · {game.move_count} moves · {elapsed}s
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
