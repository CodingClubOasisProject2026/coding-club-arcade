import { useEffect, useState } from 'react'
import { type LeaderboardRow, fetchLeaderboard } from '../api'

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<LeaderboardRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchLeaderboard()
      .then((r) => setLeaders(r.results))
      .catch(() => setFailed(true))
  }, [])

  return (
    <div className="leaderboard-page">
      <h1>Leaderboard</h1>
      {failed && <p className="muted">Couldn't load the leaderboard. Is the backend running?</p>}
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
    </div>
  )
}