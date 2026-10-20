import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { type LeaderboardRow, fetchLeaderboard } from '../api'

const GAMES = [
  { name: 'Minesweeper', path: '/minesweeper', blurb: 'Clear the board without hitting a mine.', ready: true,  color: 'var(--c-mine)'   },
  { name: 'Snake',       path: '/snake',       blurb: "Eat, grow, and don't bite yourself.",    ready: false, color: 'var(--c-snake)'  },
  { name: 'Tetris',      path: '/tetris',       blurb: 'Stack falling blocks and clear lines.',  ready: false, color: 'var(--c-tetris)' },
  { name: 'Wordle',      path: '/wordle',       blurb: 'Beat the clock. Crack as many words as you can.',ready: true, color: 'var(--c-wordle)' },
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
              <Link key={g.name} to={g.path} className="game-card" style={{ '--cc': g.color } as React.CSSProperties}>
                <h2>{g.name}</h2>
                <p>{g.blurb}</p>
                <span className="play">Play →</span>
              </Link>
            ) : (
              <div key={g.name} className="game-card disabled" aria-disabled="true" style={{ '--cc': g.color } as React.CSSProperties}>
                <h2>{g.name}</h2>
                <p>{g.blurb}</p>
                <span className="soon">Coming soon</span>
              </div>
            ),
          )}
        </div>
      </section>

      
      
    </div>
  )
}
