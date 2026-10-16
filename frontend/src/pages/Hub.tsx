import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { type LeaderboardRow, fetchLeaderboard } from '../api'

const GAMES = [
  { name: 'Minesweeper', path: '/minesweeper', blurb: 'Clear the board without hitting a mine.', ready: true },
  { name: 'Snake', path: '/snake', blurb: 'Eat, grow, and don’t bite yourself.', ready: false },
  { name: 'Tetris', path: '/tetris', blurb: 'Stack falling blocks and clear lines.', ready: false },
  { name: 'Wordle', path: '/wordle', blurb: 'Guess the word in six tries.', ready: false },
]

export default function Hub() {
  const [leaders, setLeaders] = useState<LeaderboardRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchLeaderboard()
      .then((r) => setLeaders(r.results))
      .catch(() => setFailed(true))
  }, [])

  return (
    <div className="hub">
      <section>
        <h1>Coding Club Arcade</h1>
        <p className="muted">Pick a game. Every finished game adds to your leaderboard score.</p>
        <div className="game-grid">
          {GAMES.map((g) =>
            g.ready ? (
              <Link key={g.name} to={g.path} className="game-card">
                <h2>{g.name}</h2>
                <p>{g.blurb}</p>
                <span className="play">Play →</span>
              </Link>
            ) : (
              <div key={g.name} className="game-card disabled" aria-disabled="true">
                <h2>{g.name}</h2>
                <p>{g.blurb}</p>
                <span className="soon">Coming soon</span>
              </div>
            ),
          )}
        </div>
      </section>

      <section>
        <h2>Leaderboard</h2>
        {failed && <p className="muted">Couldn’t load the leaderboard. Is the backend running?</p>}
        {!failed && !leaders && <p className="muted">Loading…</p>}
        {leaders && leaders.length === 0 && <p className="muted">No players yet.</p>}
        {leaders && leaders.length > 0 && (
          <ol className="leaderboard">
            {leaders.map((row) => (
              <li key={row.username}>
                <span>{row.username}</span>
                <span className="score">{row.score ?? 0}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
