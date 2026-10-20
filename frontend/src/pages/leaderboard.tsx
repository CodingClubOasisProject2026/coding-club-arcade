import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { type LeaderboardRow, fetchLeaderboard } from '../api'

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<LeaderboardRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState(0)

  useEffect(() => {
    let active = true

    setLoading(true)
    setFailed(false)

    fetchLeaderboard()
      .then((response) => {
        if (active) setLeaders(response.results)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [request])

  const formatScore = (score: LeaderboardRow['score']) =>
    (score ?? 0).toLocaleString('en-IN')

  return (
    <main className="rank-page">
      <header className="rank-header">
        <p className="home-kicker">CODING CLUB / HIGH SCORES</p>

        <h1>
          THE TOP SPOTS<span>.</span>
        </h1>

        <div className="rank-header-bottom">
          <p>Every round counts. Give them a score to chase.</p>

          <button
            type="button"
            className="rank-refresh"
            onClick={() => setRequest((value) => value + 1)}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span>
            {loading ? 'Updating…' : 'Refresh scores'}
          </button>
        </div>
      </header>

      <div className="rank-announcement" role="status">
        {loading
          ? 'Loading leaderboard.'
          : failed
            ? 'Leaderboard could not be updated.'
            : `${leaders?.length ?? 0} players ranked.`}
      </div>

      {failed && (
        <div className="rank-error" role="alert">
          <div>
            <strong>Scores couldn’t be loaded.</strong>
            <p>
              {leaders
                ? 'Showing the last loaded results. Try refreshing again.'
                : 'Please try again in a moment.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRequest((value) => value + 1)}
            disabled={loading}
          >
            Try again ↗
          </button>
        </div>
      )}

      {loading && leaders === null && (
        <div className="rank-loading" aria-hidden="true">
          <div className="rank-loading-cards">
            <div />
            <div />
            <div />
          </div>
          <div className="rank-loading-table">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row}>
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !failed && leaders?.length === 0 && (
        <section className="rank-empty">
          <span className="rank-empty-number" aria-hidden="true">01</span>
          <h2>The first spot is yours to take.</h2>
          <p>Finish a game to get the competition started.</p>
          <Link to="/">Choose a game <span aria-hidden="true">↗</span></Link>
        </section>
      )}

      {leaders !== null && leaders.length > 0 && (
        <div aria-busy={loading}>
          <section className="rank-podium" aria-label="Top three players">
            {leaders.slice(0, 3).map((row, index) => (
              <article
                key={row.username}
                className={`rank-podium-card rank-place-${index + 1}`}
              >
                <div className="rank-podium-top">
                  <span>{['TOP SCORE', 'SECOND PLACE', 'THIRD PLACE'][index]}</span>
                  <span className="rank-place-number">0{index + 1}</span>
                </div>

                <h2 title={row.username}>{row.username}</h2>

                <div className="rank-podium-score">
                  <strong>{formatScore(row.score)}</strong>
                  <span>POINTS</span>
                </div>
              </article>
            ))}
          </section>

          <section className="rank-standings" aria-labelledby="rank-table-title">
            <div className="rank-section-heading">
              <h2 id="rank-table-title">ALL PLAYERS</h2>
              <span>
                {String(leaders.length).padStart(2, '0')} RANKED
              </span>
            </div>

            <table className="rank-table">
              <caption className="rank-sr-only">
                Player rankings in the order returned by the leaderboard
              </caption>

              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">PLAYER</th>
                  <th scope="col">POINTS</th>
                </tr>
              </thead>

              <tbody>
                {leaders.map((row, index) => (
                  <tr
                    key={row.username}
                    className={index < 3 ? `rank-row-${index + 1}` : undefined}
                  >
                    <td className="rank-position">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <th scope="row">
                      <span className="rank-player-name">{row.username}</span>
                      {index === 0 && (
                        <span className="rank-leader-badge">LEADING</span>
                      )}
                    </th>
                    <td className="rank-points">{formatScore(row.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="rank-bottom">
            <p>Think you can beat that?</p>
            <Link to="/">Back to the arcade <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      )}
    </main>
  )
}