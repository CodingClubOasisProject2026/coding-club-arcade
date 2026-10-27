import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import GameArtwork, { type ArtworkType } from '../games/GameArtwork'
import GameTransitionLoader from '../loader/GameTransitionLoader'

type Game = {
  name: string
  path: string
  description: string
  category: string
  color: string
  ready: boolean
  art: ArtworkType
}

const games: Game[] = [
  {
    name: 'Minesweeper',
    path: '/minesweeper',
    description: 'Read the numbers. Clear the board. Avoid the mines.',
    category: 'LOGIC',
    color: 'var(--c-mine)',
    ready: true,
    art: 'mine',
  },
  {
    name: 'Wordle',
    path: '/wordle',
    description: 'Beat the clock. Crack as many words as you can.',
    category: 'WORDS',
    color: 'var(--c-wordle)',
    ready: true,
    art: 'wordle',
  },
  {
    name: 'Snake',
    path: '/snake',
    description: 'Keep growing. Keep moving. Stay out of your own way.',
    category: 'REFLEX',
    color: 'var(--c-snake)',
    ready: true,
    art: 'snake',
  },
  {
    name: 'Tetris',
    path: '/tetris',
    description: 'Make every block count. Leave no gaps behind.',
    category: 'PUZZLE',
    color: 'var(--c-tetris)',
    ready: true,
    art: 'tetris',
  },
  {
    name: 'Pac-Man',
    path: '/pacman',
    description: 'Clear the maze. Dodge the ghosts. Chase the high score.',
    category: 'CHASE',
    color: 'var(--c-pacman)',
    ready: true,
    art: 'pacman',
  },
  {
    name: 'Flappy Bird',
    path: '/flappy',
    description: 'Tap to fly. Thread the pipes. One wrong tilt and it is over.',
    category: 'REFLEX',
    color: 'var(--c-flappy, #facc15)',
    ready: true,
    art: 'flappy',
  },
]

function GameContent({ game, index }: { game: Game; index: number }) {
  return (
    <>
      <div className="home-game-meta">
        <span>
          {String(index + 1).padStart(2, '0')} / {game.category}
        </span>

        <span className={game.ready ? 'home-live' : undefined}>
          {game.ready ? 'PLAY NOW' : 'COMING SOON'}
        </span>
      </div>

      <div className="home-game-art">
        <GameArtwork type={game.art} />
      </div>

      <div className="home-game-info">
        <div>
          <h3>{game.name}</h3>
          <p>{game.description}</p>
        </div>

        <span className="home-game-arrow" aria-hidden="true">
          {game.ready ? '↗' : '—'}
        </span>
      </div>
    </>
  )
}

export default function Hub() {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const available = String(games.filter((game) => game.ready).length).padStart(
    2,
    '0',
  )

  const total = String(games.length).padStart(2, '0')

  if (selectedGame) {
    return (
      <GameTransitionLoader
        name={selectedGame.name}
        artwork={selectedGame.art}
        color={selectedGame.color}
        destination={selectedGame.path}
      />
    )
  }

  return (
    <main className="home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="home-kicker">CODING CLUB PRESENTS</p>

        <h1 id="home-title">
          THE ARCADE<span>.</span>
        </h1>

        <div className="home-intro-bottom">
          <p>
            Old-school games. Fresh competition.
            <br />
            Pick a game and make your score count.
          </p>

          <Link to="/leaderboard" className="home-leaderboard-link">
            View leaderboard <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className="home-games" aria-labelledby="games-title">
        <div className="home-section-title">
          <h2 id="games-title">SELECT A GAME</h2>
          <span>
            {available} AVAILABLE / {total} TOTAL
          </span>
        </div>

        <div className="home-grid">
          {games.map((game, index) => {
            const style = {
              '--game': game.color,
            } as CSSProperties

            if (game.ready) {
              return (
                <Link
                  key={game.name}
                  to={game.path}
                  className="home-game"
                  style={style}
                  aria-label={`Play ${game.name}`}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return
                    }

                    event.preventDefault()
                    setSelectedGame(game)
                  }}
                >
                  <GameContent game={game} index={index} />
                </Link>
              )
            }

            return (
              <article
                key={game.name}
                className="home-game home-game-soon"
                style={style}
                aria-label={`${game.name}, coming soon`}
              >
                <GameContent game={game} index={index} />
              </article>
            )
          })}
        </div>
      </section>

      <footer className="home-footer">
        <span>CODING CLUB · BITS PILANI</span>
        <span>ONE MORE ROUND?</span>
      </footer>
    </main>
  )
}